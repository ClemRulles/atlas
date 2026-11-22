/**
 * Import CSV : lecture tolérante des exports de courtiers (séparateur ; , ou tabulation,
 * virgule ou point décimal, dates JJ/MM/AAAA ou AAAA-MM-JJ, en-têtes français, anglais ou néerlandais).
 */

import { isValidIsin } from "@/lib/market-format";

export type Field = "date" | "isin" | "symbol" | "name" | "quantity" | "price" | "fees" | "side" | "broker" | "currency";

const HEADERS: Record<Field, RegExp> = {
  date: /^(date|datum|trade ?date|date d'ex[ée]cution|jour)$/i,
  isin: /^(isin|code isin)$/i,
  symbol: /^(ticker|symbole?|symbol|code)$/i,
  name: /^(nom|name|produit|product|titre|instrument|valeur|libell[ée])$/i,
  quantity: /^(quantit[ée]|quantity|qty|nombre|aantal|parts|shares)$/i,
  price: /^(prix|price|cours|koers|prix unitaire|unit price)$/i,
  fees: /^(frais|fees|costs?|kosten|commission|frais de transaction)$/i,
  side: /^(sens|type|side|action|op[ée]ration|transaction|achat\/vente|buy\/sell)$/i,
  broker: /^(courtier|broker|compte|account)$/i,
  currency: /^(devise|currency|munt)$/i,
};

/** Découpe une ligne CSV en respectant les guillemets. */
export function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      out.push(cell.trim());
      cell = "";
    } else cell += c;
  }
  out.push(cell.trim());
  return out;
}

export function detectDelimiter(header: string): string {
  const counts = [";", "\t", ","].map((d) => ({ d, n: splitLine(header, d).length }));
  return counts.sort((a, b) => b.n - a.n)[0].d;
}

/** « 1 234,56 », « 1,234.56 », « 1234.5 » → nombre. `null` si illisible. */
export function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  let s = raw.replace(/[\s  €$£]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** « 05/03/2024 », « 5-3-2024 », « 2024-03-05 » → « 2024-03-05 ». Les dates sont lues jour d'abord. */
export function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().slice(0, 10);
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

export function parseSide(raw: string | undefined, quantity: number | null): "buy" | "sell" {
  const s = (raw ?? "").toLowerCase();
  if (/(vente|sell|verkoop|sale|cession)/.test(s)) return "sell";
  if (/(achat|buy|aankoop|purchase|souscription)/.test(s)) return "buy";
  return quantity !== null && quantity < 0 ? "sell" : "buy";
}

export interface CsvRow {
  line: number;
  date: string | null;
  isin: string | null;
  symbol: string | null;
  name: string | null;
  quantity: number | null;
  price: number | null;
  fees: number | null;
  side: "buy" | "sell";
  broker: string | null;
  currency: string | null;
  /** Ce qui empêche d'importer la ligne, en français. Vide si la ligne est complète. */
  problems: string[];
}

export interface CsvParse {
  columns: Partial<Record<Field, number>>;
  headers: string[];
  rows: CsvRow[];
  /** Champs indispensables introuvables dans l'en-tête. */
  missing: Field[];
}

export function parseCsv(text: string): CsvParse {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { columns: {}, headers: [], rows: [], missing: ["date", "quantity", "price"] };
  const delimiter = detectDelimiter(lines[0]);
  const headers = splitLine(lines[0], delimiter);
  const columns: Partial<Record<Field, number>> = {};
  headers.forEach((h, i) => {
    const field = (Object.keys(HEADERS) as Field[]).find((f) => HEADERS[f].test(h.trim()));
    if (field && columns[field] === undefined) columns[field] = i;
  });
  const missing = (["date", "quantity", "price"] as Field[]).filter((f) => columns[f] === undefined);
  if (columns.isin === undefined && columns.symbol === undefined) missing.push("isin");

  const rows = lines.slice(1).map((line, index): CsvRow => {
    const cells = splitLine(line, delimiter);
    const get = (f: Field) => (columns[f] === undefined ? undefined : cells[columns[f] as number]);
    const rawQuantity = parseNumber(get("quantity"));
    const isinCell = get("isin")?.toUpperCase().trim() || null;
    const row: CsvRow = {
      line: index + 2,
      date: parseDate(get("date")),
      isin: isinCell,
      symbol: get("symbol")?.trim() || null,
      name: get("name")?.trim() || null,
      quantity: rawQuantity === null ? null : Math.abs(rawQuantity),
      price: parseNumber(get("price")),
      fees: (() => {
        const f = parseNumber(get("fees"));
        return f === null ? null : Math.abs(f);
      })(),
      side: parseSide(get("side"), rawQuantity),
      broker: get("broker")?.trim() || null,
      currency: get("currency")?.trim().toUpperCase() || null,
      problems: [],
    };
    if (!row.date) row.problems.push("date illisible");
    if (!row.quantity) row.problems.push("quantité manquante");
    if (!row.price || row.price <= 0) row.problems.push("prix manquant");
    if (row.isin && !isValidIsin(row.isin)) row.problems.push("ISIN invalide");
    if (!row.isin && !row.symbol) row.problems.push("ni ISIN ni ticker");
    return row;
  });
  return { columns, headers, rows, missing };
}
