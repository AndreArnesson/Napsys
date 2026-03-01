import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileBase64 } = await req.json();
    if (!fileBase64) {
      return new Response(JSON.stringify({ error: "No fileBase64 provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const binaryStr = atob(fileBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const wb = XLSX.read(bytes, { type: "array" });

    const result: Record<string, any> = {
      sheetNames: wb.SheetNames,
      sheets: {},
    };

    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      const ref = ws["!ref"] || "A1";
      const allData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      
      const markerRows: number[] = [];
      for (let i = 0; i < allData.length; i++) {
        const row = allData[i] as any[];
        if (row && row.some((cell: any) => typeof cell === "string" && cell.toLowerCase().includes("analysavskiljare"))) {
          markerRows.push(i);
        }
      }

      result.sheets[name] = {
        ref,
        totalRows: allData.length,
        markerRows,
        first30Rows: allData.slice(0, 30),
        aroundMarkers: markerRows.map((idx) => ({
          markerRow: idx,
          rows: allData.slice(Math.max(0, idx - 2), idx + 25),
        })),
      };
    }

    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
