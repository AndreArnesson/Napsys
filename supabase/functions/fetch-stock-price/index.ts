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
  nasdaq: "",
  nyse: "",
  us: "",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticker, exchange = "stockholm" } = await req.json();
    if (!ticker) {
      return new Response(JSON.stringify({ error: "Ticker is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const suffix = EXCHANGE_SUFFIXES[exchange.toLowerCase()] ?? ".ST";
    const symbol = ticker.includes(".") ? ticker : `${ticker}${suffix}`;

    // Use v8 chart endpoint which is still publicly accessible
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Yahoo Finance error:", response.status, text);
      return new Response(JSON.stringify({ error: `Could not fetch stock price for ${symbol}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];

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
