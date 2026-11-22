import { SYMBOL_PATTERN } from "@/lib/market-format";
import { companyInfo } from "@/lib/server/yahoo";

/** GET /api/company?symbol=NVDA : actualités récentes qui citent l'entreprise et dates de résultats. */
export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("symbol") ?? "";
  if (!SYMBOL_PATTERN.test(symbol)) return Response.json({ error: "Symbole invalide." }, { status: 400 });
  try {
    const info = await companyInfo(symbol, new Date().toISOString().slice(0, 10));
    return Response.json(info, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600" } });
  } catch {
    return Response.json({ symbol, news: [], nextEarnings: null, lastEarnings: null, earningsEstimated: false });
  }
}
