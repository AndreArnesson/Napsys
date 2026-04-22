import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EXCHANGE_SUFFIXES: Record<string, string> = {
  stockholm: ".ST",
  helsinki: ".HE",
  copenhagen: ".CO",
  oslo: ".OL",
  frankfurt: ".F",
  london: ".L",
  paris: ".PA",
  amsterdam: ".AS",
  brussels: ".BR",
  zurich: ".SW",
  milan: ".MI",
  madrid: ".MC",
  toronto: ".TO",
  sydney: ".AX",
  tokyo: ".T",
  hong_kong: ".HK",
  singapore: ".SI",
  mumbai: ".NS",
  us: "",
};

async function fetchPriceWithRetry(ticker: string, exchange: string, maxRetries = 2): Promise<{ price: number | null; error: string | null }> {
  const suffix = EXCHANGE_SUFFIXES[exchange.toLowerCase()] ?? ".ST";
  // Normalize ticker: Yahoo uses dashes for share classes (e.g. "LATO-B"), not spaces
  const normalizedTicker = ticker.trim().replace(/\s+/g, "-").toUpperCase();
  const symbol = normalizedTicker.includes(".") ? normalizedTicker : `${normalizedTicker}${suffix}`;
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Per-request timeout to prevent hanging on slow Yahoo responses
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) {
        const text = await response.text();
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        return { price: null, error: `HTTP ${response.status}: ${text.substring(0, 200)}` };
      }
      const data = await response.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
      if (price === null) {
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        return { price: null, error: "No price data in response" };
      }
      return { price, error: null };
    } catch (e) {
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      return { price: null, error: e instanceof Error ? e.message : "Unknown fetch error" };
    }
  }
  return { price: null, error: "Max retries exceeded" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: companies, error } = await supabase
      .from("companies")
      .select("id, ticker, exchange")
      .not("ticker", "is", null)
      .neq("ticker", "");

    if (error) throw error;
    if (!companies || companies.length === 0) {
      return new Response(JSON.stringify({ message: "No companies with tickers found", updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updated = 0;
    const failures: { companyId: string; ticker: string; error: string }[] = [];

    // Process in parallel batches of 10 to stay under the 150s edge function timeout
    const BATCH_SIZE = 10;
    for (let i = 0; i < companies.length; i += BATCH_SIZE) {
      const batch = companies.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(async (company) => {
        const exchange = company.exchange || "stockholm";
        const { price, error: fetchError } = await fetchPriceWithRetry(company.ticker!, exchange);
        return { company, price, fetchError };
      }));

      for (const { company, price, fetchError } of results) {
        if (price !== null) {
          const { error: updateError } = await supabase
            .from("companies")
            .update({ current_price: price })
            .eq("id", company.id);

          if (updateError) {
            failures.push({ companyId: company.id, ticker: company.ticker!, error: `DB update: ${updateError.message}` });
          } else {
            updated++;
          }
        } else {
          failures.push({ companyId: company.id, ticker: company.ticker!, error: fetchError || "Unknown error" });
        }
      }
    }

    // Log failures to price_fetch_errors table
    if (failures.length > 0) {
      const errorRows = failures.map(f => ({
        company_id: f.companyId,
        ticker: f.ticker,
        error_message: f.error,
      }));
      const { error: insertError } = await supabase.from("price_fetch_errors").insert(errorRows);
      if (insertError) {
        console.error("Failed to insert error records:", insertError);
      }
    }

    console.log(`Updated ${updated}/${companies.length} prices. Failures: ${failures.length}`);

    return new Response(JSON.stringify({
      message: `Updated ${updated}/${companies.length} prices`,
      updated,
      total: companies.length,
      failures: failures.length,
      errors: failures.length > 0 ? failures.map(f => `${f.ticker}: ${f.error}`) : undefined,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("update-all-prices error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
