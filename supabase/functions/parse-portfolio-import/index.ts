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
    const { fileBase64, fileType, freeText } = await req.json();

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    let textContent = "";

    if (freeText) {
      textContent = freeText;
    } else if (fileBase64) {
      const binaryStr = atob(fileBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      if (fileType === "csv" || fileType === "txt") {
        textContent = new TextDecoder().decode(bytes);
      } else if (fileType === "xlsx" || fileType === "xls") {
        const XLSX = await import("npm:xlsx@0.18.5");
        const wb = XLSX.read(bytes, { type: "array" });
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name];
          textContent += `Sheet: ${name}\n`;
          textContent += XLSX.utils.sheet_to_csv(ws) + "\n\n";
        }
      } else if (fileType === "pdf") {
        throw new Error("PDF-import stöds inte just nu. Kopiera in texten manuellt i fritextfältet.");
      } else {
        throw new Error(`Unsupported file type: ${fileType}`);
      }
    } else {
      throw new Error("No file or text provided");
    }

    const truncated = textContent.slice(0, 15000);

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.0-flash",
        messages: [
          {
            role: "system",
            content: `Du är en expert på att tolka portföljutdrag och bankdata. Extrahera aktieinnehav och returnera strukturerad data. Svara ALLTID med valid JSON, inget annat.`,
          },
          {
            role: "user",
            content: `Tolka följande portföljdata och extrahera alla aktieinnehav. Returnera en JSON-array med objekt som har fälten:
- company_name (bolagsnamn)
- ticker (aktieticker om tillgänglig, annars null)
- weight_percent (andel i procent om tillgänglig, annars null)
- value_sek (värde i SEK om tillgängligt, annars null)

Returnera BARA en JSON-array, inget annat.

Data:
${truncated}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_holdings",
              description: "Extract portfolio holdings from text data",
              parameters: {
                type: "object",
                properties: {
                  holdings: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        company_name: { type: "string" },
                        ticker: { type: "string", nullable: true },
                        weight_percent: { type: "number", nullable: true },
                        value_sek: { type: "number", nullable: true },
                      },
                      required: ["company_name"],
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
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
