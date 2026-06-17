import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const prompt = `Extract fund/ETF data from the text below. Return ONLY a valid JSON object. Use null for fields not found. Numbers must be plain numbers without units or symbols.

Fields:
- name: string (full fund name)
- ticker: string (stock ticker/ISIN, e.g. "EUNL" or "IE00B4L5Y983")
- expense_ratio: number (TER/annual fee as percentage, e.g. 0.20 for 0.20%)
- aum: number (assets under management in millions, convert to millions if needed)
- currency: string (3-letter ISO code, e.g. "SEK", "EUR", "USD")
- distribution_type: "accumulating" or "distributing" or null
- benchmark: string (benchmark index name)
- inception_date: string (YYYY-MM-DD)
- return_ytd: number (YTD return as percentage, e.g. 5.2)
- return_1y: number (1-year return %)
- return_3y: number (3-year annualized return %)
- return_5y: number (5-year annualized return %)
- return_10y: number (10-year annualized return %)
- volatility: number (annualized volatility %)
- sharpe_ratio: number
- beta: number
- max_drawdown: number (as negative percentage, e.g. -15.3)
- holdings_count: integer
- top_holdings: array of {"name": string, "weight": number} (weight as percentage, e.g. 5.1)
- geographic_allocation: object {region: percentage} e.g. {"USA": 65.2, "Europa": 20.1}
- sector_allocation: object {sector: percentage}

Text:
${text}

Return ONLY the JSON object, no markdown, no explanation.`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GEMINI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
        }),
      }
    );

    const result = await response.json();
    const raw = result.choices?.[0]?.message?.content ?? "{}";
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/, "").trim();

    let data: Record<string, unknown> = {};
    try { data = JSON.parse(cleaned); } catch { /* return empty */ }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
