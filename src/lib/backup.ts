import { supabase } from '@/integrations/supabase/client';

export const LAST_BACKUP_KEY = 'napsys-last-backup';

const PAGE_SIZE = 1000;

const BACKUP_TABLES = [
  'profiles',
  'companies',
  'analyses',
  'quarterly_estimates',
  'income_statement',
  'balance_sheet',
  'quarterly_income_statement',
  'quarterly_balance_sheet',
  'timeline_events',
  'shares',
  'watchlist',
  'insider_trades',
  'insider_ownership_history',
  'report_documents',
  'reports',
  'portfolios',
  'portfolio_snapshots',
  'portfolio_holdings',
  'economy_entries',
  'economy_snapshots',
  'fund_comparisons',
  'comparison_fund_items',
  'fund_metadata',
  'improvements',
];

type Row = Record<string, unknown>;

interface QueryResult {
  data: Row[] | null;
  error: { message: string } | null;
}

interface OrderedQuery {
  range: (from: number, to: number) => Promise<QueryResult>;
}

interface SelectQuery {
  order: (column: string, opts: { ascending: boolean }) => OrderedQuery;
  range: (from: number, to: number) => Promise<QueryResult>;
}

interface TableQuery {
  select: (columns: string) => SelectQuery;
}

interface SimpleClient {
  from: (table: string) => TableQuery;
}

const client = supabase as unknown as SimpleClient;

export interface BackupFile {
  app: string;
  schema_version: number;
  exported_at: string;
  user_id: string | null;
  row_counts: Record<string, number>;
  errors: Record<string, string>;
  tables: Record<string, Row[]>;
}

async function queryPage(table: string, offset: number, ordered: boolean): Promise<QueryResult> {
  const query = client.from(table).select('*');
  const builder = ordered ? query.order('id', { ascending: true }) : query;
  return builder.range(offset, offset + PAGE_SIZE - 1);
}

async function fetchTable(table: string): Promise<Row[]> {
  const rows: Row[] = [];
  let ordered = true;
  let offset = 0;
  for (;;) {
    let result = await queryPage(table, offset, ordered);
    if (result.error && ordered) {
      ordered = false;
      result = await queryPage(table, offset, ordered);
    }
    if (result.error) throw new Error(result.error.message);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length === 0) break;
    offset += page.length;
  }
  return rows;
}

export async function createBackup(): Promise<BackupFile> {
  const { data: authData } = await supabase.auth.getUser();
  const tables: Record<string, Row[]> = {};
  const rowCounts: Record<string, number> = {};
  const errors: Record<string, string> = {};

  for (const table of BACKUP_TABLES) {
    try {
      const rows = await fetchTable(table);
      tables[table] = rows;
      rowCounts[table] = rows.length;
    } catch (error) {
      errors[table] = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    app: 'napsys',
    schema_version: 1,
    exported_at: new Date().toISOString(),
    user_id: authData.user?.id ?? null,
    row_counts: rowCounts,
    errors,
    tables,
  };
}

function downloadBackup(backup: BackupFile): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = backup.exported_at.replace(/:/g, '-').slice(0, 19);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `napsys-backup-${stamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let running = false;

export async function runBackup(): Promise<BackupFile> {
  if (running) throw new Error('Backup already running');
  running = true;
  try {
    const backup = await createBackup();
    localStorage.setItem(LAST_BACKUP_KEY, backup.exported_at);
    downloadBackup(backup);
    return backup;
  } finally {
    running = false;
  }
}

export function getLastBackupAt(): string | null {
  return localStorage.getItem(LAST_BACKUP_KEY);
}
