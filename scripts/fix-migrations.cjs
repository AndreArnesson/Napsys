const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'supabase', 'migrations');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

for (const file of files) {
  const filePath = path.join(dir, file);
  let sql = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // CREATE TABLE -> CREATE TABLE IF NOT EXISTS
  let newSql = sql.replace(/CREATE TABLE (public\.\w+)/g, (match, table) => {
    if (match.includes('IF NOT EXISTS')) return match;
    changed = true;
    return `CREATE TABLE IF NOT EXISTS ${table}`;
  });

  // ADD COLUMN -> ADD COLUMN IF NOT EXISTS
  newSql = newSql.replace(/ADD COLUMN (?!IF NOT EXISTS)(\w)/g, (match, first) => {
    changed = true;
    return `ADD COLUMN IF NOT EXISTS ${first}`;
  });

  // CREATE TRIGGER -> DROP TRIGGER IF EXISTS + CREATE TRIGGER (any schema)
  newSql = newSql.replace(/CREATE TRIGGER (\w+) (BEFORE|AFTER|INSTEAD OF) (.+?) ON (\w+\.\w+)/g, (match, name, timing, rest, table) => {
    changed = true;
    return `DROP TRIGGER IF EXISTS ${name} ON ${table};\nCREATE TRIGGER ${name} ${timing} ${rest} ON ${table}`;
  });

  if (newSql !== sql) {
    fs.writeFileSync(filePath, newSql, 'utf8');
    console.log(`Fixed: ${file}`);
  }
}

console.log('Done.');
