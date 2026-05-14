const fs = require('fs');
const path = require('path');

const OLD_USER_ID = '3924ba1f-e8e5-4285-b2fa-ad43bd7b6627';
const NEW_USER_ID = '369701fa-1830-45b3-a367-c5b821583e64';
const CSV_DIR = path.join(__dirname, '..', 'old_supabase_json');
const OUT_DIR = path.join(__dirname, '..', 'old_supabase_json', 'sql');

const tableMapping = {
  'query-results-export-2026-05-03_00-46-48.csv': 'companies',
  'query-results-export-2026-05-03_00-46-56.csv': 'profiles',
  'query-results-export-2026-05-03_00-47-12.csv': 'portfolios',
  'query-results-export-2026-05-03_00-47-19.csv': 'watchlist',
  'query-results-export-2026-05-03_00-47-24.csv': 'economy_entries',
  'query-results-export-2026-05-03_00-47-31.csv': 'portfolio_holdings',
  'query-results-export-2026-05-03_00-47-50.csv': 'quarterly_income_statement',
  'query-results-export-2026-05-03_00-48-24.csv': 'insider_trades',
  'query-results-export-2026-05-03_00-48-34.csv': 'report_documents',
  'query-results-export-2026-05-03_00-49-08.csv': 'price_fetch_errors',
  // Full exports
  'query-results-export-2026-05-03_01-41-14.csv': 'income_statement',
  'query-results-export-2026-05-03_01-41-22.csv': 'portfolio_snapshots',
  'query-results-export-2026-05-03_01-41-28.csv': 'analyses',
  'query-results-export-2026-05-03_01-41-36.csv': 'balance_sheet',
};

const importOrder = [
  'companies',
  'profiles',
  'portfolios',
  'portfolio_snapshots',
  'watchlist',
  'economy_entries',
  'analyses',
  'income_statement',
  'quarterly_income_statement',
  'balance_sheet',
  'insider_trades',
  'report_documents',
  'portfolio_holdings',
  'price_fetch_errors',
];

function parseCSV(content) {
  const records = [];
  let current = '';
  let inQuotes = false;
  let fields = [];

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ';' && !inQuotes) {
      fields.push(current);
      current = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      fields.push(current);
      current = '';
      if (fields.length > 1 || fields[0] !== '') records.push(fields);
      fields = [];
    } else {
      current += char;
    }
  }
  if (current || fields.length) {
    fields.push(current);
    if (fields.length > 1 || fields[0] !== '') records.push(fields);
  }
  return records;
}

function toSqlValue(val) {
  if (val === '' || val === null || val === undefined) return 'NULL';
  const replaced = val.replaceAll(OLD_USER_ID, NEW_USER_ID);
  if (replaced === 'true' || replaced === 'false') return replaced;
  if (/^-?\d+$/.test(replaced)) return replaced;
  if (/^-?\d+\.\d+$/.test(replaced)) return replaced;
  return `'${replaced.replace(/'/g, "''")}'`;
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const sqlByTable = {};

for (const [file, table] of Object.entries(tableMapping)) {
  const filePath = path.join(CSV_DIR, file);
  if (!fs.existsSync(filePath)) continue;

  const content = fs.readFileSync(filePath, 'utf8');
  const records = parseCSV(content);
  if (records.length < 2) continue;

  const headers = records[0];
  const inserts = [];

  for (let i = 1; i < records.length; i++) {
    const values = records[i];
    if (values.length !== headers.length) continue;
    const cols = headers.map(h => `"${h}"`).join(', ');
    const vals = values.map(v => toSqlValue(v)).join(', ');
    inserts.push(`INSERT INTO public.${table} (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING;`);
  }

  sqlByTable[table] = inserts;
  console.log(`${table}: ${inserts.length} rows`);
}

// Write one file per table
for (const table of importOrder) {
  if (!sqlByTable[table]) continue;
  const sql = [
    'SET session_replication_role = replica;',
    '',
    ...sqlByTable[table],
    '',
    'SET session_replication_role = DEFAULT;',
  ];
  const outFile = path.join(OUT_DIR, `${table}.sql`);
  fs.writeFileSync(outFile, sql.join('\n'), 'utf8');
  const kb = Math.round(Buffer.byteLength(sql.join('\n')) / 1024);
  console.log(`  ${table}.sql  (${kb} KB)`);
}

console.log(`\nSQL files written to: ${OUT_DIR}`);
