import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

const EXPECTED_TOKEN_SHA256 = "f4027946e53ec05e0ca4262aa05c379a189d9ca1a5c69d8802ff4198361b8afc";
const RETENTION_DAYS = 30;
const BATCH_SIZE = 100;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const token = req.headers.get("x-report-cleanup-token") ?? "";
  if (
    !/^[a-f0-9]{64}$/i.test(token) ||
    (await sha256Hex(token)) !== EXPECTED_TOKEN_SHA256
  ) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Report cleanup is missing Supabase service configuration");
    return jsonResponse({ error: "Cleanup is not configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const cutoff = new Date(
    Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: documents, error: queryError } = await supabase
    .from("report_documents")
    .select("id,file_path")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (queryError) {
    console.error("Could not list expired report documents", queryError.message);
    return jsonResponse({ error: "Could not list expired reports" }, 500);
  }

  let deleted = 0;
  let failed = 0;
  for (const document of documents ?? []) {
    const { error: storageError } = await supabase.storage
      .from("reports")
      .remove([document.file_path]);
    if (storageError) {
      failed += 1;
      console.error("Could not remove an expired report file", storageError.message);
      continue;
    }

    const { error: rowError } = await supabase
      .from("report_documents")
      .delete()
      .eq("id", document.id);
    if (rowError) {
      failed += 1;
      console.error("Could not remove an expired report record", rowError.message);
      continue;
    }
    deleted += 1;
  }

  return jsonResponse({
    retentionDays: RETENTION_DAYS,
    cutoff,
    examined: documents?.length ?? 0,
    deleted,
    failed,
  }, failed ? 500 : 200);
});
