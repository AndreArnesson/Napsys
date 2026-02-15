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
  us: "",
};

async function fetchPrice(ticker: string, exchange: string): Promise<number | null> {
  const suffix = EXCHANGE_SUFFIXES[exchange.toLowerCase()] ?? ".ST";
  const symbol = ticker.includes(".") ? ticker : `${ticker}${suffix}`;
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all companies with tickers
    const { data: companies, error } = await supabase
      .from("companies")
      .select("id, ticker")
      .not("ticker", "is", null)
      .neq("ticker", "");

    if (error) throw error;
    if (!companies || companies.length === 0) {
      return new Response(JSON.stringify({ message: "No companies with tickers found", updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updated = 0;
    const errors: string[] = [];

    for (const company of companies) {
      // Small delay to avoid rate limiting
      if (updated > 0) await new Promise(r => setTimeout(r, 500));

      const price = await fetchPrice(company.ticker!, "stockholm");
      if (price !== null) {
        const { error: updateError } = await supabase
          .from("companies")
          .update({ current_price: price })
          .eq("id", company.id);
        
        if (updateError) {
          errors.push(`${company.ticker}: ${updateError.message}`);
        } else {
          updated++;
        }
      } else {
        errors.push(`${company.ticker}: could not fetch price`);
      }
    }

    console.log(`Updated ${updated}/${companies.length} prices. Errors: ${errors.length}`);

    return new Response(JSON.stringify({ 
      message: `Updated ${updated}/${companies.length} prices`,
      updated,
      total: companies.length,
      errors: errors.length > 0 ? errors : undefined,
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
