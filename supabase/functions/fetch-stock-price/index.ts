import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
  nasdaq: "",
  nyse: "",
  us: "",
};

async function fetchPrice(symbol: string) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data?.chart?.result?.[0] || null;
}

async function searchTicker(query: string) {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0&enableFuzzyQuery=true&quotesQueryId=tss_match_phrase_query`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  if (!response.ok) return [];
  const data = await response.json();
  return (data?.quotes || []).map((q: any) => ({
    symbol: q.symbol,
    name: q.shortname || q.longname || q.symbol,
    exchange: q.exchDisp || q.exchange,
    type: q.quoteType,
  }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    
    // Ticker search mode
    if (body.search) {
      const results = await searchTicker(body.search);
      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Price fetch mode
    const { ticker, exchange = "stockholm" } = body;
    if (!ticker) {
      return new Response(JSON.stringify({ error: "Ticker is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const suffix = EXCHANGE_SUFFIXES[exchange.toLowerCase()] ?? "";
    // Normalize ticker: Yahoo uses dashes for share classes (e.g. "LATO-B", "ERIC-B"), not spaces
    const normalizedTicker = ticker.trim().replace(/\s+/g, "-").toUpperCase();
    const symbol = normalizedTicker.includes(".") ? normalizedTicker : `${normalizedTicker}${suffix}`;

    const result = await fetchPrice(symbol);

    if (!result) {
      return new Response(JSON.stringify({ error: `No data found for ${symbol}` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const meta = result.meta;
    const price = meta.regularMarketPrice;
    const previousClose = meta.chartPreviousClose || meta.previousClose;
    const change = previousClose ? price - previousClose : 0;
    const changePercent = previousClose ? (change / previousClose) * 100 : 0;

    return new Response(JSON.stringify({
      price,
      change,
      changePercent,
      currency: meta.currency,
      name: meta.shortName || meta.longName || symbol,
      symbol: meta.symbol,
      previousClose,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fetch-stock-price error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
