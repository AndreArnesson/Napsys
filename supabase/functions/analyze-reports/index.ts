import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Encode an ArrayBuffer to base64 without using Node's Buffer (Deno-safe)
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000; // 32KB chunks to avoid call stack overflow
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { filePaths, question, companyName } = await req.json();

    if (!filePaths || filePaths.length === 0) {
      return new Response(JSON.stringify({ error: "Inga filer valda" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Download each PDF and prepare as inline base64 attachment for Gemini
    type ContentPart =
      | { type: "text"; text: string }
      | { type: "file"; file: { filename: string; file_data: string } };

    const userParts: ContentPart[] = [];
    const failedFiles: string[] = [];

    for (const filePath of filePaths) {
      const { data, error } = await supabase.storage.from("reports").download(filePath);
      if (error || !data) {
        console.error(`Failed to download ${filePath}:`, error);
        failedFiles.push(filePath);
        continue;
      }

      try {
        const arrayBuffer = await data.arrayBuffer();
        const base64 = arrayBufferToBase64(arrayBuffer);
        const filename = filePath.split("/").pop() || "report.pdf";
        userParts.push({
          type: "file",
          file: {
            filename,
            file_data: `data:application/pdf;base64,${base64}`,
          },
        });
        userParts.push({
          type: "text",
          text: `^ Ovan: rapport "${filename}"`,
        });
      } catch (e) {
        console.error(`Failed to read ${filePath}:`, e);
        failedFiles.push(filePath);
      }
    }

    if (userParts.length === 0) {
      return new Response(JSON.stringify({ error: "Kunde inte läsa några rapporter." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const instruction = question
      ? `Fråga om ${companyName || "bolaget"}: ${question}\n\nAnvänd de bifogade rapporterna ovan för att besvara frågan med konkreta siffror och citat.`
      : `Ge en sammanfattande analys av de bifogade rapporterna ovan för ${companyName || "bolaget"}. Använd konkreta siffror direkt från rapporterna.`;

    userParts.push({ type: "text", text: instruction });

    const systemPrompt = `Du är en erfaren aktieanalytiker som analyserar företagsrapporter (årsredovisningar, kvartalsrapporter etc).
Svara alltid på svenska. Formatera svaret som HTML (INTE markdown). Använd <h3>, <ul>, <li>, <strong>, <p> taggar.
Var konkret med siffror och hänvisa till specifika delar av rapporterna.
ALDRIG använd platshållare som [Infoga Siffra] eller [Infoga procent] – läs siffrorna direkt från de bifogade PDF-rapporterna.
Om flera rapporter finns, jämför och identifiera trender mellan perioderna.
Returnera BARA HTML-innehåll, ingen markdown, inga kodblock.`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userParts },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit – försök igen om en stund." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI-krediter slut." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    let content = result.choices?.[0]?.message?.content || "";
    content = content.replace(/^```html\s*/i, "").replace(/```\s*$/, "").trim();

    if (failedFiles.length > 0) {
      content += `<p><em>Notera: kunde inte läsa ${failedFiles.length} fil(er).</em></p>`;
    }

    return new Response(JSON.stringify({ summary: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-reports error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
