import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Download and extract text from each PDF using pdf-parse
    const pdfParse = (await import("npm:pdf-parse@1.1.1")).default;
    const fileContents: string[] = [];

    for (const filePath of filePaths) {
      const { data, error } = await supabase.storage.from("reports").download(filePath);
      if (error) {
        console.error(`Failed to download ${filePath}:`, error);
        fileContents.push(`[Kunde inte läsa fil: ${filePath}]`);
        continue;
      }

      try {
        const buffer = Buffer.from(await data.arrayBuffer());
        const parsed = await pdfParse(buffer);
        const text = parsed.text?.trim();
        if (text) {
          fileContents.push(`--- Rapport: ${filePath.split("/").pop()} ---\n${text}`);
        } else {
          fileContents.push(`[Tom eller oläsbar fil: ${filePath.split("/").pop()}]`);
        }
      } catch (parseErr) {
        console.error(`PDF parse error for ${filePath}:`, parseErr);
        fileContents.push(`[Kunde inte tolka PDF: ${filePath.split("/").pop()}]`);
      }
    }

    const combinedText = fileContents.join("\n\n");
    
    // Truncate if too long (keep under ~100k chars for context)
    const maxChars = 100000;
    const truncatedText = combinedText.length > maxChars 
      ? combinedText.substring(0, maxChars) + "\n\n[...text trunkerad pga längd]"
      : combinedText;

    const systemPrompt = `Du är en erfaren aktieanalytiker som analyserar företagsrapporter (årsredovisningar, kvartalsrapporter etc). 
Svara alltid på svenska. Formatera svaret som HTML (INTE markdown). Använd <h3>, <ul>, <li>, <strong>, <p> taggar.
Var konkret med siffror och hänvisa till specifika delar av rapporterna.
Om flera rapporter finns, jämför och identifiera trender mellan perioderna.
Returnera BARA HTML-innehåll, ingen markdown, inga kodblock.`;

    const userPrompt = question 
      ? `Fråga om ${companyName || "bolaget"}: ${question}\n\nHär är rapportinnehållet:\n\n${truncatedText}`
      : `Ge en sammanfattande analys av följande rapport(er) för ${companyName || "bolaget"}:\n\n${truncatedText}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
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

