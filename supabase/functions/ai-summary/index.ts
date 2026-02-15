import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, data, companyName } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "financial") {
      systemPrompt = `Du är en erfaren aktieanalytiker. Analysera den finansiella datan och ge en koncis sammanfattning på svenska. Fokusera på:
1. Omsättningstrender (tillväxt/avmattning)
2. Vinstutveckling och marginaler
3. Värdering (P/E, EV/EBIT om tillgängligt)
4. Tydliga säsongsmönster (om kvartalsdata finns)
5. Risker: hög skuldsättning, svagt kassaflöde, svag balansräkning
6. Sammanfattande bedömning

Var konkret med siffror. Håll dig under 300 ord. Använd markdown-formatering med rubriker.`;
      userPrompt = `Analysera finansiell data för ${companyName || 'bolaget'}:\n\n${JSON.stringify(data, null, 2)}`;
    } else if (type === "insider") {
      systemPrompt = `Du är en erfaren aktieanalytiker. Analysera insynshandeln och ge en koncis sammanfattning på svenska. Fokusera på:
1. Finns det ett tydligt mönster? Köper eller säljer insiders på sistone?
2. Vilka nyckelpersoner har handlat och hur mycket?
3. Har flera börjat köpa/sälja samtidigt?
4. Finns det några anmärkningsvärda transaktioner (stora belopp)?
5. Vad signalerar detta sammantaget?

Var konkret. Håll dig under 200 ord. Använd markdown-formatering.`;
      userPrompt = `Analysera insynshandel för ${companyName || 'bolaget'}:\n\n${JSON.stringify(data, null, 2)}`;
    } else {
      return new Response(JSON.stringify({ error: "Invalid type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Försök igen om en stund." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI-krediter slut. Lägg till mer i inställningarna." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ summary: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-summary error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
