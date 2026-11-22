import { SYMBOL_PATTERN } from "@/lib/market-format";
import { profile } from "@/lib/server/yahoo";

/** GET /api/profile?symbol=ASML.AS : secteur, pays, rendements, frais. Les champs inconnus sont absents. */
export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("symbol") ?? "";
  if (!SYMBOL_PATTERN.test(symbol)) return Response.json({ error: "Symbole invalide." }, { status: 400 });
  try {
    const data = await profile(symbol);
    return Response.json(data, { headers: { "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=2592000" } });
  } catch {
    return Response.json({ symbol }, { headers: { "Cache-Control": "public, s-maxage=3600" } });
  }
}
