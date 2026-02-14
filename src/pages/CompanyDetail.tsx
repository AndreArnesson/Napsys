import { useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { MOSBadge } from '@/components/company/MOSBadge';
import { RatingBadge } from '@/components/company/RatingBadge';
import { CEOSection } from '@/components/company/CEOSection';
import { KeyDataEditor } from '@/components/company/KeyDataEditor';
import { InsiderTable, InsiderTrade } from '@/components/company/InsiderTable';
import { FileImportDialog, ParsedFinancialData, ParsedInsiderTrade } from '@/components/company/FileImportDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, Loader2, Clock, ChevronDown, PieChart } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { sv, enUS } from 'date-fns/locale';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart as RechartsPie, Pie, Cell, BarChart, Bar } from 'recharts';

interface CEOData {
  name: string;
  since?: string;
  background?: string;
  compensation?: string;
  ownership?: string;
  notes?: string;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--destructive))'];

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const locale = language === 'sv' ? sv : enUS;

  const [insiderTrades, setInsiderTrades] = useState<InsiderTrade[]>([]);
  const [descriptionOpen, setDescriptionOpen] = useState(true);
  const [moatsOpen, setMoatsOpen] = useState(true);
  const [managementOpen, setManagementOpen] = useState(true);

  // Fetch company details
  const { data: company, isLoading } = useQuery({
    queryKey: ['company', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch latest analysis
  const { data: analysis } = useQuery({
    queryKey: ['analysis', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('analyses').select('*').eq('company_id', id).order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch income statement data from DB
  const { data: incomeData } = useQuery({
    queryKey: ['income_statement', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('income_statement').select('*').eq('company_id', id).order('fiscal_year', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  // Fetch balance sheet data from DB
  const { data: balanceSheetData } = useQuery({
    queryKey: ['balance_sheet', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('balance_sheet').select('*').eq('company_id', id).order('fiscal_year', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  // Fetch timeline events
  const { data: timelineEvents } = useQuery({
    queryKey: ['timeline', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('timeline_events').select('*').eq('company_id', id).order('event_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Update company mutation
  const updateCompany = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const { error } = await supabase.from('companies').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', id] });
      toast.success(t.common.success);
    },
    onError: () => toast.error(t.common.error),
  });

  const ceoData: CEOData = company?.management
    ? (typeof company.management === 'object' ? company.management as CEOData : { name: company.management })
    : { name: '' };

  const handleCEOUpdate = (newCeo: CEOData) => {
    updateCompany.mutate({ management: JSON.stringify(newCeo) });
  };

  const handleKeyDataUpdate = (updates: Record<string, any>) => {
    updateCompany.mutate(updates);
  };

  const handleImportFinancials = async (data: ParsedFinancialData[]) => {
    if (!id || !user) return;
    console.log('[Import] Storing', data.length, 'years to DB for company', id);

    // Upsert income_statement rows
    const incomeRows = data.map(d => ({
      company_id: id,
      fiscal_year: d.fiscal_year,
      revenue: d.revenue ?? null,
      ebit: d.ebit ?? d.operating_income ?? null,
      ebitda: d.ebitda ?? null,
      net_income: d.net_income ?? null,
      gross_margin: d.gross_margin ?? null,
      operating_margin: d.operating_margin ?? null,
      net_margin: d.net_margin ?? null,
    }));

    // Delete existing income_statement for this company, then insert fresh
    const { error: delIncErr } = await supabase.from('income_statement').delete().eq('company_id', id);
    if (delIncErr) console.error('[Import] Delete income_statement error:', delIncErr);

    const { error: insIncErr } = await supabase.from('income_statement').insert(incomeRows);
    if (insIncErr) {
      console.error('[Import] Insert income_statement error:', insIncErr);
      toast.error('Failed to save income statement data');
      return;
    }

    // Upsert balance_sheet rows
    const balanceRows = data
      .filter(d => d.total_assets || d.total_equity || d.total_liabilities || d.cash_equivalents)
      .map(d => ({
        company_id: id,
        fiscal_year: d.fiscal_year,
        total_assets: d.total_assets ?? null,
        total_liabilities: d.total_liabilities ?? null,
        shareholders_equity: d.total_equity ?? null,
        current_assets: d.current_assets ?? null,
        current_liabilities: d.current_liabilities ?? null,
        long_term_debt: d.non_current_liabilities ?? null,
        cash_equivalents: d.cash_equivalents ?? null,
        equity_ratio: d.equity_ratio ?? null,
      }));

    if (balanceRows.length > 0) {
      const { error: delBsErr } = await supabase.from('balance_sheet').delete().eq('company_id', id);
      if (delBsErr) console.error('[Import] Delete balance_sheet error:', delBsErr);

      const { error: insBsErr } = await supabase.from('balance_sheet').insert(balanceRows);
      if (insBsErr) console.error('[Import] Insert balance_sheet error:', insBsErr);
    }

    // Refresh queries
    queryClient.invalidateQueries({ queryKey: ['income_statement', id] });
    queryClient.invalidateQueries({ queryKey: ['balance_sheet', id] });
    toast.success(`Imported ${data.length} years of financial data`);
  };

  const handleImportInsiders = async (data: ParsedInsiderTrade[]) => {
    const mappedTrades: InsiderTrade[] = data.map(d => ({
      id: d.id,
      date: d.date,
      person: d.person,
      position: d.position,
      type: d.type,
      volume: d.volume,
      price: d.price,
      currency: d.currency,
      instrument: d.instrument,
      isin: d.isin,
    }));
    setInsiderTrades(mappedTrades);
    toast.success(`Imported ${data.length} insider transactions`);
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!company) {
    return (
      <MainLayout>
        <div className="text-center py-20">
          <p className="text-muted-foreground">Company not found</p>
          <Link to="/" className="text-primary hover:underline">{t.common.back}</Link>
        </div>
      </MainLayout>
    );
  }

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '—';
    return new Intl.NumberFormat(language === 'sv' ? 'sv-SE' : 'en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '—';
    return `${(value * 100).toFixed(1)}%`;
  };

  const ownershipData = [
    { name: 'Founder/CEO', value: 25 },
    { name: 'Institutional', value: 40 },
    { name: 'Retail', value: 20 },
    { name: 'Other Insiders', value: 15 },
  ];

  const hasIncomeData = incomeData && incomeData.length > 0;
  const hasBalanceData = balanceSheetData && balanceSheetData.length > 0;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="space-y-2">
            <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
              {t.common.back}
            </Link>
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold">{company.name}</h1>
              {company.ticker && <span className="text-lg font-mono text-muted-foreground">{company.ticker}</span>}
            </div>
            <div className="flex items-center gap-4">
              <RatingBadge rating={analysis?.rating as 'buy' | 'hold' | 'sell' | null} size="lg" />
              <MOSBadge value={analysis?.margin_of_safety} size="lg" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <FileImportDialog companyId={id!} onImportFinancials={handleImportFinancials} onImportInsiders={handleImportInsiders} />
            <div className="text-right">
              <p className="text-3xl font-bold font-mono">
                {company.current_price ? `${company.current_price.toFixed(2)} ${company.trading_currency}` : '—'}
              </p>
              <p className="text-sm text-muted-foreground">
                {company.shares_outstanding ? `${company.shares_outstanding.toLocaleString()} ${t.company.sharesOutstanding.toLowerCase()}` : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="overview">{t.company.overview}</TabsTrigger>
            <TabsTrigger value="financials">{t.company.financials}</TabsTrigger>
            <TabsTrigger value="balance-sheet">{t.company.balanceSheet}</TabsTrigger>
            <TabsTrigger value="insiders">{t.company.insiders}</TabsTrigger>
            <TabsTrigger value="timeline">{t.company.timeline}</TabsTrigger>
            <TabsTrigger value="analysis">{t.analysis.title}</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <KeyDataEditor
              data={{
                ticker: company.ticker || undefined,
                currentPrice: company.current_price || undefined,
                sharesOutstanding: company.shares_outstanding || undefined,
                reportingCurrency: company.reporting_currency,
                tradingCurrency: company.trading_currency,
              }}
              onUpdate={handleKeyDataUpdate}
            />
            <div className="grid gap-6 lg:grid-cols-2">
              <Collapsible open={descriptionOpen} onOpenChange={setDescriptionOpen}>
                <Card>
                  <CardHeader className="pb-2">
                    <CollapsibleTrigger className="flex items-center justify-between w-full">
                      <CardTitle>{t.company.description}</CardTitle>
                      <ChevronDown className={`h-4 w-4 transition-transform ${descriptionOpen ? 'rotate-180' : ''}`} />
                    </CollapsibleTrigger>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent>
                      <Textarea
                        placeholder="Add a detailed description..."
                        defaultValue={company.description || ''}
                        onBlur={(e) => { if (e.target.value !== company.description) updateCompany.mutate({ description: e.target.value }); }}
                        className="min-h-[200px]"
                      />
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
              <Collapsible open={moatsOpen} onOpenChange={setMoatsOpen}>
                <Card>
                  <CardHeader className="pb-2">
                    <CollapsibleTrigger className="flex items-center justify-between w-full">
                      <CardTitle>{t.company.moats}</CardTitle>
                      <ChevronDown className={`h-4 w-4 transition-transform ${moatsOpen ? 'rotate-180' : ''}`} />
                    </CollapsibleTrigger>
                    <CardDescription>Competitive advantages</CardDescription>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent>
                      <Textarea
                        placeholder="Describe the company's moats..."
                        defaultValue={company.moats || ''}
                        onBlur={(e) => { if (e.target.value !== company.moats) updateCompany.mutate({ moats: e.target.value }); }}
                        className="min-h-[200px]"
                      />
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>
            <CEOSection ceo={ceoData} onUpdate={handleCEOUpdate} />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><PieChart className="h-5 w-5" />Insider Ownership</CardTitle>
                <CardDescription>Distribution of share ownership</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie data={ownershipData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value" label={({ name, value }) => `${name}: ${value}%`}>
                        {ownershipData.map((_, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                      </Pie>
                      <Tooltip />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Financials Tab */}
          <TabsContent value="financials" className="space-y-6">
            {!hasIncomeData ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground mb-4">No financial data yet. Import from Börsdata to get started.</p>
                  <FileImportDialog companyId={id!} onImportFinancials={handleImportFinancials} onImportInsiders={handleImportInsiders} />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>{t.financials.incomeStatement}</CardTitle>
                  <CardDescription>{incomeData.length} years ({incomeData[0].fiscal_year}–{incomeData[incomeData.length - 1].fiscal_year})</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={incomeData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="fiscal_year" className="text-xs" />
                        <YAxis className="text-xs" />
                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                        <Legend />
                        <Bar dataKey="revenue" name={t.financials.revenue} fill="hsl(var(--primary))" />
                        <Bar dataKey="ebit" name={t.financials.ebit} fill="hsl(var(--success))" />
                        <Bar dataKey="net_income" name={t.financials.netIncome} fill="hsl(var(--warning))" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t.financials.fiscalYear}</TableHead>
                          <TableHead className="text-right">{t.financials.revenue}</TableHead>
                          <TableHead className="text-right">{t.financials.ebit}</TableHead>
                          <TableHead className="text-right">{t.financials.ebitda}</TableHead>
                          <TableHead className="text-right">{t.financials.netIncome}</TableHead>
                          <TableHead className="text-right">{t.financials.operatingMargin}</TableHead>
                          <TableHead className="text-right">{t.financials.netMargin}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {incomeData.map((row) => (
                          <TableRow key={row.fiscal_year}>
                            <TableCell className="font-medium">{row.fiscal_year}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(row.revenue)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(row.ebit)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(row.ebitda)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(row.net_income)}</TableCell>
                            <TableCell className="text-right font-mono">{formatPercent(row.operating_margin)}</TableCell>
                            <TableCell className="text-right font-mono">{formatPercent(row.net_margin)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Balance Sheet Tab */}
          <TabsContent value="balance-sheet" className="space-y-6">
            {!hasBalanceData ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground mb-4">No balance sheet data yet. Import from Börsdata to get started.</p>
                  <FileImportDialog companyId={id!} onImportFinancials={handleImportFinancials} onImportInsiders={handleImportInsiders} />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>{t.financials.balanceSheet}</CardTitle>
                  <CardDescription>{balanceSheetData.length} years</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={balanceSheetData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="fiscal_year" className="text-xs" />
                        <YAxis className="text-xs" />
                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                        <Legend />
                        <Line type="monotone" dataKey="total_assets" name={t.financials.totalAssets} stroke="hsl(var(--primary))" strokeWidth={2} />
                        <Line type="monotone" dataKey="shareholders_equity" name={t.financials.shareholdersEquity} stroke="hsl(var(--success))" strokeWidth={2} />
                        <Line type="monotone" dataKey="total_liabilities" name={t.financials.totalLiabilities} stroke="hsl(var(--destructive))" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t.financials.fiscalYear}</TableHead>
                          <TableHead className="text-right">{t.financials.totalAssets}</TableHead>
                          <TableHead className="text-right">{t.financials.totalLiabilities}</TableHead>
                          <TableHead className="text-right">{t.financials.shareholdersEquity}</TableHead>
                          <TableHead className="text-right">{t.financials.cashEquivalents}</TableHead>
                          <TableHead className="text-right">{t.financials.equityRatio}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {balanceSheetData.map((row) => (
                          <TableRow key={row.fiscal_year}>
                            <TableCell className="font-medium">{row.fiscal_year}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(row.total_assets)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(row.total_liabilities)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(row.shareholders_equity)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(row.cash_equivalents)}</TableCell>
                            <TableCell className="text-right font-mono">{formatPercent(row.equity_ratio)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Insiders Tab */}
          <TabsContent value="insiders" className="space-y-6">
            {insiderTrades.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground mb-4">No insider trades imported yet.</p>
                  <FileImportDialog companyId={id!} onImportFinancials={handleImportFinancials} onImportInsiders={handleImportInsiders} />
                </CardContent>
              </Card>
            ) : (
              <InsiderTable trades={insiderTrades} />
            )}
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t.timeline.title}</CardTitle>
              </CardHeader>
              <CardContent>
                {!timelineEvents?.length ? (
                  <p className="text-muted-foreground text-center py-8">{t.timeline.noEvents}</p>
                ) : (
                  <div className="relative space-y-4">
                    <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                    {timelineEvents.map((event) => (
                      <div key={event.id} className="relative pl-10">
                        <div className="absolute left-2 top-2 h-4 w-4 rounded-full border-2 border-primary bg-background" />
                        <Card>
                          <CardContent className="pt-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">
                                {formatDistanceToNow(new Date(event.event_date), { addSuffix: true, locale })}
                              </span>
                              {event.rating && <RatingBadge rating={event.rating as 'buy' | 'hold' | 'sell'} size="sm" />}
                            </div>
                            {event.comment && <p className="text-sm">{event.comment}</p>}
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analysis Tab */}
          <TabsContent value="analysis" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t.analysis.title}</CardTitle>
                <CardDescription>
                  {analysis
                    ? `Last updated ${formatDistanceToNow(new Date(analysis.updated_at), { addSuffix: true, locale })}`
                    : 'No analysis yet'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link to={`/company/${id}/analysis`}>
                  <Button className="gap-2">
                    {analysis ? t.common.edit : t.common.add} {t.analysis.title}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
