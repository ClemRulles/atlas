import { SYMBOL_PATTERN } from "@/lib/market-format";
import { history } from "@/lib/server/yahoo";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/history?symbol=IWDA.AS&from=2021-01-04 : clôtures quotidiennes, devise et nom. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol") ?? "";
  const from = params.get("from") ?? "";
  if (!SYMBOL_PATTERN.test(symbol) || !DATE.test(from) || Number.isNaN(Date.parse(from))) {
    return Response.json({ error: "Paramètres invalides." }, { status: 400 });
  }
  try {
    const data = await history(symbol, from);
    // Cours différés : un quart d'heure de cache CDN suffit, l'historique ancien ne bouge pas.
    return Response.json(data, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } });
  } catch {
    return Response.json({ error: `Cours indisponible pour ${symbol}.` }, { status: 502 });
  }
}
