import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      throw new Error("No text provided");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const truncated = text.slice(0, 15000);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Du är expert på att tolka portföljinnehav för investmentbolag. Extrahera alla innehav från texten.`,
          },
          {
            role: "user",
            content: `Tolka följande text och extrahera alla portföljinnehav. Identifiera bolagsnamn, ticker (om tillgänglig), viktning i procent (om tillgänglig), och kategorisera varje post som en av: company, investment_company, fund, cash, other.

Text:
${truncated}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_holdings",
              description: "Extract investment company portfolio holdings from text",
              parameters: {
                type: "object",
                properties: {
                  holdings: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Company or holding name" },
                        ticker: { type: "string", nullable: true, description: "Stock ticker if available" },
                        weight_percent: { type: "number", nullable: true, description: "Weight in percent" },
                        category: {
                          type: "string",
                          enum: ["company", "investment_company", "fund", "cash", "other"],
                          description: "Type of holding",
                        },
                      },
                      required: ["name"],
                    },
                  },
                },
                required: ["holdings"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_holdings" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again later" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const result = await response.json();

    let holdings = [];
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      holdings = parsed.holdings || [];
    }

    return new Response(JSON.stringify({ holdings }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
