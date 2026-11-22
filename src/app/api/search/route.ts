import { search } from "@/lib/server/yahoo";

/** GET /api/search?q=… : recherche par nom, ticker ou ISIN. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 60) return Response.json({ results: [] });
  try {
    const results = await search(q);
    return Response.json({ results }, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch {
    return Response.json({ results: [], error: "La recherche ne répond pas pour le moment. Réessaie dans un instant." }, { status: 502 });
  }
}
