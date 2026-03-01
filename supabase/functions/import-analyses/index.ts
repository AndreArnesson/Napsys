import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { analyses } = await req.json();
    if (!analyses || !Array.isArray(analyses)) {
      return new Response(JSON.stringify({ error: "No analyses array provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Step 1: Clear all tables (order matters for foreign keys)
    const tablesToClear = [
      "quarterly_income_statement",
      "quarterly_balance_sheet", 
      "income_statement",
      "balance_sheet",
      "insider_trades",
      "timeline_events",
      "shares",
      "watchlist",
      "analyses",
      "companies",
    ];

    const clearLog: string[] = [];
    for (const table of tablesToClear) {
      const { error } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) {
        clearLog.push(`Warning clearing ${table}: ${error.message}`);
      } else {
        clearLog.push(`Cleared ${table}`);
      }
    }

    // Step 2: Insert all analyses
    const insertLog: string[] = [];
    
    for (const analysis of analyses) {
      const { companyName, userId, yearly, quarterly, companyInfo } = analysis;

      // Create company
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .insert({
          name: companyName,
          user_id: userId,
          ticker: companyInfo?.ticker || null,
          reporting_currency: companyInfo?.reportingCurrency || "SEK",
          trading_currency: companyInfo?.tradingCurrency || "SEK",
          current_price: companyInfo?.latestPrice || null,
          shares_outstanding: companyInfo?.sharesOutstanding || null,
        })
        .select("id")
        .single();

      if (companyError) {
        insertLog.push(`Error creating company ${companyName}: ${companyError.message}`);
        continue;
      }

      const companyId = company.id;

      // Create analysis record
      const { data: analysisRecord, error: analysisError } = await supabase
        .from("analyses")
        .insert({
          company_id: companyId,
          user_id: userId,
          name: companyName,
          is_draft: false,
          shares_outstanding: companyInfo?.sharesOutstanding || null,
          current_price: companyInfo?.latestPrice || null,
        })
        .select("id")
        .single();

      if (analysisError) {
        insertLog.push(`Error creating analysis for ${companyName}: ${analysisError.message}`);
        continue;
      }

      const analysisId = analysisRecord.id;

      // Insert yearly income statements
      if (yearly && yearly.length > 0) {
        const incomeRows = yearly.map((d: any) => ({
          company_id: companyId,
          analysis_id: analysisId,
          fiscal_year: d.fiscal_year,
          revenue: d.revenue ?? null,
          ebit: d.ebit ?? d.operating_income ?? null,
          ebitda: d.ebitda ?? null,
          net_income: d.net_income ?? null,
          earnings_per_share: d.earnings_per_share ?? null,
          dividend: d.dividend ?? null,
          shares_outstanding: d.shares_outstanding ?? null,
          gross_margin: d.gross_margin ?? null,
          operating_margin: d.operating_margin ?? null,
          net_margin: d.net_margin ?? null,
        }));

        const { error: incError } = await supabase.from("income_statement").insert(incomeRows);
        if (incError) insertLog.push(`Error inserting income for ${companyName}: ${incError.message}`);

        // Insert yearly balance sheets
        const balanceRows = yearly
          .filter((d: any) => d.total_assets || d.total_equity || d.total_liabilities || d.cash_equivalents)
          .map((d: any) => ({
            company_id: companyId,
            analysis_id: analysisId,
            fiscal_year: d.fiscal_year,
            total_assets: d.total_assets ?? null,
            shareholders_equity: d.total_equity ?? null,
            cash_equivalents: d.cash_equivalents ?? null,
            total_liabilities: d.total_liabilities ?? null,
            current_assets: d.current_assets ?? null,
            current_liabilities: d.current_liabilities ?? null,
            long_term_debt: d.non_current_liabilities ?? null,
            equity_ratio: d.equity_ratio ?? null,
          }));

        if (balanceRows.length > 0) {
          const { error: balError } = await supabase.from("balance_sheet").insert(balanceRows);
          if (balError) insertLog.push(`Error inserting balance for ${companyName}: ${balError.message}`);
        }
      }

      // Insert quarterly data
      if (quarterly && quarterly.length > 0) {
        const qIncomeRows = quarterly.map((d: any) => ({
          company_id: companyId,
          analysis_id: analysisId,
          fiscal_year: d.fiscal_year,
          quarter: d.quarter ?? 1,
          revenue: d.revenue ?? null,
          ebit: d.ebit ?? d.operating_income ?? null,
          ebitda: d.ebitda ?? null,
          net_income: d.net_income ?? null,
          earnings_per_share: d.earnings_per_share ?? null,
          dividend: d.dividend ?? null,
          gross_margin: d.gross_margin ?? null,
          operating_margin: d.operating_margin ?? null,
          net_margin: d.net_margin ?? null,
        }));

        const { error: qIncError } = await supabase.from("quarterly_income_statement").insert(qIncomeRows);
        if (qIncError) insertLog.push(`Error inserting quarterly income for ${companyName}: ${qIncError.message}`);

        const qBalanceRows = quarterly
          .filter((d: any) => d.total_assets || d.total_equity || d.total_liabilities)
          .map((d: any) => ({
            company_id: companyId,
            analysis_id: analysisId,
            fiscal_year: d.fiscal_year,
            quarter: d.quarter ?? 1,
            total_assets: d.total_assets ?? null,
            shareholders_equity: d.total_equity ?? null,
            cash_equivalents: d.cash_equivalents ?? null,
            total_liabilities: d.total_liabilities ?? null,
            current_assets: d.current_assets ?? null,
            current_liabilities: d.current_liabilities ?? null,
            long_term_debt: d.non_current_liabilities ?? null,
            equity_ratio: d.equity_ratio ?? null,
          }));

        if (qBalanceRows.length > 0) {
          const { error: qBalError } = await supabase.from("quarterly_balance_sheet").insert(qBalanceRows);
          if (qBalError) insertLog.push(`Error inserting quarterly balance for ${companyName}: ${qBalError.message}`);
        }
      }

      insertLog.push(`✅ ${companyName}: ${yearly?.length || 0} years, ${quarterly?.length || 0} quarters`);
    }

    return new Response(JSON.stringify({ clearLog, insertLog, totalAnalyses: analyses.length }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
