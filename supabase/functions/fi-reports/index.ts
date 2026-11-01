import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { extractHiddenFormFields, parseFiReports } from "./_shared/fiReports.ts";
import { matchFiShortSellingData, parseFiIssuerDetail } from "./_shared/shortSelling.ts";

const FI_SEARCH_URL = "https://finanscentralen.fi.se/search/Search.aspx";
const FI_FILE_URL = "https://finanscentralen.fi.se/search/GetFile.aspx";
const FI_SHORT_REGISTER_URL = "https://www.fi.se/sv/vara-register/blankningsregistret";
const MAX_REPORT_SIZE = 20 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_LENGTH = 800_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getFiCookies(headers: Headers): string[] {
  const values = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [headers.get("set-cookie") || ""];
  return values
    .map((cookie) => cookie.split(";")[0])
    .filter(Boolean)
}

async function searchFi(companyName: string) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const initial = await fetch(FI_SEARCH_URL, { headers: { "User-Agent": "Napsys/1.0" } });
    if (!initial.ok) throw new Error("FI:s söksida gick inte att nå.");
    const initialHtml = await initial.text();
    if (!initialHtml.trim()) {
      console.warn("FI returned an empty search page", { attempt });
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        continue;
      }
      break;
    }

    const form = extractHiddenFormFields(initialHtml);
    const cookies = new Map<string, string>();
    for (const cookie of getFiCookies(initial.headers)) {
      cookies.set(cookie.split("=", 1)[0], cookie);
    }

    form.set("ctl00$main$txtCompanyName", companyName);
    form.set("ctl00$main$txtOrganizationNumber", "");
    form.set("ctl00$main$txtOrganizationShortName", "");
    form.set("ctl00$main$btnSearch", "Search");

    const response = await fetch(FI_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": FI_SEARCH_URL,
        "User-Agent": "Napsys/1.0",
        ...(cookies.size ? { Cookie: [...cookies.values()].join("; ") } : {}),
      },
      body: form.toString(),
    });
    if (!response.ok) throw new Error("FI:s bolagssökning misslyckades.");
    for (const cookie of getFiCookies(response.headers)) {
      cookies.set(cookie.split("=", 1)[0], cookie);
    }

    const html = await response.text();
    const reports = parseFiReports(html);
    console.info("FI search response", {
      queryLength: companyName.length,
      attempt,
      status: response.status,
      responseUrl: response.url,
      htmlLength: html.length,
      reportTables: [...html.matchAll(/<table\b[^>]*\bid=["']ctl00_main_gvw(?:Year|HalfYear|Quarter|BookEnd)Reports["'][^>]*>/gi)].length,
      reportLinks: [...html.matchAll(/GetFile\.aspx\?fid=\d+/gi)].length,
      parsedReports: reports.length,
    });
    if (html.trim()) return { reports, cookies: [...cookies.values()].join("; ") };

    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }

  throw new Error("FI skickade ett tomt svar tre gånger. Försök igen senare eller ladda upp rapporten manuellt.");
}

function safeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/\s+/g, " ").trim().slice(0, 160);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Metoden stöds inte." }, 405);

  try {
    const body = await req.json();
    const action = body?.action;
    const authorization = req.headers.get("Authorization");
    if (!authorization) return jsonResponse({ error: "Du måste vara inloggad." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase-konfiguration saknas.");
    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const accessToken = authorization.replace(/^Bearer\s+/i, "");
    const { data: userResult, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !userResult.user) return jsonResponse({ error: "Du måste vara inloggad." }, 401);

    if (action === "search") {
      const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
      if (!companyName || companyName.length > 120) {
        return jsonResponse({ error: "Ange ett bolagsnamn på högst 120 tecken." }, 400);
      }
      const { reports } = await searchFi(companyName);
      return jsonResponse({ reports });
    }

    if (action === "short-positions") {
      const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
      if (!companyName || companyName.length > 120) {
        return jsonResponse({ error: "Ange ett bolagsnamn på högst 120 tecken." }, 400);
      }
      const registerResponse = await fetch(FI_SHORT_REGISTER_URL, {
        headers: { "User-Agent": "Napsys/1.0" },
      });
      if (!registerResponse.ok) throw new Error("FI:s blankningsregister gick inte att nå.");
      const registerHtml = await registerResponse.text();
      const issuer = matchFiShortSellingData(registerHtml, companyName);
      if (!issuer) return jsonResponse({ shortSelling: { found: false } });

      const sourceUrl = `${FI_SHORT_REGISTER_URL}/Emittent?id=${encodeURIComponent(issuer.lei)}`;
      const detailResponse = await fetch(sourceUrl, {
        headers: { "User-Agent": "Napsys/1.0", "Referer": FI_SHORT_REGISTER_URL },
      });
      if (!detailResponse.ok) throw new Error("Bolagets blankningsuppgifter kunde inte hämtas från FI.");
      const detailHtml = await detailResponse.text();
      return jsonResponse({ shortSelling: parseFiIssuerDetail(detailHtml, issuer, sourceUrl) });
    }

    if (!["import", "download", "import-text"].includes(action)) return jsonResponse({ error: "Okänd åtgärd." }, 400);

    const reportId = String(body.reportId || "");
    const companyId = String(body.companyId || "");
    const analysisId = String(body.analysisId || "");
    const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "Bolag";
    const period = typeof body.period === "string" ? body.period : "";
    const kind = typeof body.kind === "string" ? body.kind : "Rapport";
    const language = body.language === "Swedish" ? "Swedish" : "English";

    if (!/^\d{1,12}$/.test(reportId) || !companyId || !analysisId || !period) {
      return jsonResponse({ error: "Rapportinformationen är ogiltig." }, 400);
    }

    const { data: company, error: companyError } = await userClient
      .from("companies")
      .select("id")
      .eq("id", companyId)
      .maybeSingle();
    if (companyError || !company) return jsonResponse({ error: "Bolaget hittades inte eller saknar behörighet." }, 404);

    const { data: analysis, error: analysisError } = await userClient
      .from("analyses")
      .select("id")
      .eq("id", analysisId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (analysisError || !analysis) return jsonResponse({ error: "Analysen hittades inte eller hör inte till bolaget." }, 404);

    let reportContent: Uint8Array;
    let contentType = "application/pdf";
    let fileExtension = ".pdf";

    if (action === "import-text") {
      const reportText = typeof body.reportText === "string" ? body.reportText.trim() : "";
      if (!reportText) return jsonResponse({ error: "Rapporten innehöll ingen läsbar text." }, 400);
      if (reportText.length > MAX_EXTRACTED_TEXT_LENGTH) {
        return jsonResponse({ error: "Den extraherade rapporttexten är för stor." }, 413);
      }
      reportContent = new TextEncoder().encode(reportText);
      contentType = "text/plain; charset=utf-8";
      fileExtension = ".txt";
    } else {
      // FI's file endpoint can depend on the ASP.NET session created by the search
      // page. Recreate that session and verify that the selected report belongs to
      // the requested company before downloading it.
      const { reports, cookies } = await searchFi(companyName);
      const selectedReport = reports.find((report) => report.id === reportId);
      if (!selectedReport) {
        return jsonResponse({ error: "Rapporten hittades inte längre hos FI. Sök igen och välj rapporten på nytt." }, 404);
      }

      const fileResponse = await fetch(`${FI_FILE_URL}?fid=${reportId}`, {
        headers: {
          "User-Agent": "Napsys/1.0",
          "Referer": FI_SEARCH_URL,
          ...(cookies ? { Cookie: cookies } : {}),
        },
      });
      if (!fileResponse.ok) {
        console.error("FI report fetch failed", { status: fileResponse.status, reportId });
        return jsonResponse({ error: "FI-filen kunde inte hämtas just nu. Du kan söka igen eller ladda upp rapporten manuellt." }, 502);
      }

      // Stream the archive to the browser. FI's ESEF XHTML packages are too large
      // to unpack in the Edge Function's memory limit.
      if (action === "download") {
        const contentLength = Number(fileResponse.headers.get("content-length") || 0);
        if (contentLength > MAX_REPORT_SIZE) return jsonResponse({ error: "FI-filen är större än gränsen på 20 MB." }, 413);
        return new Response(fileResponse.body, {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/octet-stream",
            "Cache-Control": "no-store",
          },
        });
      }

      const downloadedFile = new Uint8Array(await fileResponse.arrayBuffer());
      if (downloadedFile.byteLength > MAX_REPORT_SIZE) return jsonResponse({ error: "FI-filen är större än gränsen på 20 MB." }, 413);
      if (!new TextDecoder().decode(downloadedFile.subarray(0, 5)).startsWith("%PDF-")) {
        return jsonResponse({ error: "FI:s rapportpaket kan bara importeras via webbläsaren. Ladda om sidan och försök igen." }, 422);
      }
      reportContent = downloadedFile;
    }

    const fileName = safeFileName(`${companyName} - ${period} ${kind} (${language})${fileExtension}`);
    const filePath = `${companyId}/${crypto.randomUUID()}_${fileName}`;
    const { error: uploadError } = await userClient.storage.from("reports").upload(filePath, reportContent, {
      contentType,
      upsert: false,
    });
    if (uploadError) throw new Error("Kunde inte spara FI-rapporten i rapportarkivet.");

    const { data: document, error: insertError } = await userClient
      .from("report_documents")
      .insert({
        company_id: companyId,
        analysis_id: analysisId,
        file_name: fileName,
        file_path: filePath,
        file_size: reportContent.byteLength,
      })
      .select("id, file_name, file_path, file_size")
      .single();

    if (insertError) {
      await userClient.storage.from("reports").remove([filePath]);
      throw new Error("Rapporten hämtades men kunde inte läggas till i rapportlistan.");
    }

    return jsonResponse({ document });
  } catch (error) {
    console.error("fi-reports error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "FI-sökningen misslyckades." }, 500);
  }
});

