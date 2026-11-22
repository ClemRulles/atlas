import { fundComposition } from "@/lib/holdings/service";
import { isValidIsin, SYMBOL_PATTERN } from "@/lib/market-format";

/**
 * GET /api/composition?symbol=IWDA.AS&isin=IE00B4L5Y983&id=IWDA.AS
 * Composition d'un ETF ou d'un fonds, ou `{ composition: null }` si aucun fournisseur ne la connaît.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol") ?? "";
  const isin = params.get("isin")?.toUpperCase() || undefined;
  const id = params.get("id") || symbol;
  if (!SYMBOL_PATTERN.test(symbol) || (isin && !isValidIsin(isin)) || id.length > 24) {
    return Response.json({ error: "Paramètres invalides." }, { status: 400 });
  }
  try {
    const composition = await fundComposition({ instrumentId: id, symbol, isin });
    return Response.json({ composition }, { headers: { "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=2592000" } });
  } catch {
    return Response.json({ composition: null, error: "Composition indisponible pour le moment." }, { status: 502 });
  }
}
