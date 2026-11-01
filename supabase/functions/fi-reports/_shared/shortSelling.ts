export interface FiShortPosition {
  holder: string;
  isin: string;
  percentage: number | null;
  belowThreshold: boolean;
  positionDate: string;
  previousPercentage: number | null;
  previousBelowThreshold: boolean;
}

export interface FiShortSellingData {
  found: boolean;
  issuerName?: string;
  lei?: string;
  totalPercentage?: number;
  latestPositionDate?: string;
  positions?: FiShortPosition[];
  historicalPositions?: FiShortPosition[];
  sourceUrl?: string;
}

const decodeHtml = (value: string) => value
  .replace(/&nbsp;|&#160;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">");

const textContent = (value: string) => decodeHtml(value
  .replace(/<br\s*\/?>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")).trim();

function normalizeIssuerName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(aktiebolaget|aktiebolag|publ|ab|the|company|co)\b/g, " ")
    .replace(/\bser\.?\s*[a-z]\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

interface RegisterIssuer { name: string; lei: string; latestPositionDate: string; totalPercentage: number | null }

function parsePercentage(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized || normalized.startsWith("<")) return null;
  const parsed = Number(normalized.replace(/%$/, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRows(html: string): string[][] {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(([, row]) =>
    [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(([, cell]) => textContent(cell))
  ).filter((row) => row.length > 0);
}

function parseRegisterIssuers(html: string): RegisterIssuer[] {
  const issuers: RegisterIssuer[] = [];
  for (const [, rowHtml] of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const leiMatch = rowHtml.match(/\b([0-9A-Z]{20})\b/i);
    const cells = [...rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(([, cell]) => cell);
    if (!leiMatch || cells.length < 4) continue;
    const anchor = cells[0].match(/<a\b[^>]*>([\s\S]*?)<\/a>/i);
    const name = textContent(anchor?.[1] ?? cells[0]);
    const values = cells.map(textContent);
    issuers.push({
      name,
      lei: leiMatch[1],
      latestPositionDate: values[2] ?? "",
      totalPercentage: parsePercentage(values[3] ?? ""),
    });
  }
  return issuers;
}

export function findFiIssuer(html: string, companyName: string): RegisterIssuer | null {
  const query = normalizeIssuerName(companyName);
  if (!query) return null;
  const matches = parseRegisterIssuers(html).filter((issuer) => {
    const name = normalizeIssuerName(issuer.name);
    return name === query || name.startsWith(`${query} `);
  });
  return matches.length === 1 ? matches[0] : null;
}

function parseDetailPositions(html: string, historical: boolean): FiShortPosition[] {
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(([, table]) => table);
  const matchingTable = tables.find((table) => {
    const headers = (parseRows(table)[0]?.join(" ") ?? "").normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return headers.includes("positionsinnehavare") &&
      headers.includes("positionsdatum") &&
      headers.includes(historical ? "efterfoljande" : "foregaende");
  });
  if (!matchingTable) return [];
  return parseRows(matchingTable).slice(1).map((row) => ({
    holder: row[0] ?? "",
    isin: row[1] ?? "",
    percentage: parsePercentage(row[2] ?? ""),
    belowThreshold: (row[2] ?? "").trim().startsWith("<"),
    positionDate: row[3] ?? "",
    previousPercentage: parsePercentage(row[4] ?? ""),
    previousBelowThreshold: (row[4] ?? "").trim().startsWith("<"),
  })).filter((position) => position.holder && position.positionDate);
}

export function parseFiIssuerDetail(html: string, issuer: RegisterIssuer, sourceUrl: string): FiShortSellingData {
  const text = textContent(html);
  const sumMatch = text.match(/Summa\s+procent\s*([0-9]+(?:[,.][0-9]+)?)/i);
  const leiMatch = text.match(/LEI-kod\s*([0-9A-Z]{20})/i);
  return {
    found: true,
    issuerName: issuer.name,
    lei: leiMatch?.[1] ?? issuer.lei,
    totalPercentage: parsePercentage(sumMatch?.[1] ?? "") ?? issuer.totalPercentage ?? 0,
    latestPositionDate: issuer.latestPositionDate,
    positions: parseDetailPositions(html, false),
    historicalPositions: parseDetailPositions(html, true),
    sourceUrl,
  };
}

export function matchFiShortSellingData(registerHtml: string, companyName: string): RegisterIssuer | null {
  return findFiIssuer(registerHtml, companyName);
}
