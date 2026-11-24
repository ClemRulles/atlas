import { cookies } from "next/headers";
import { authConfig, readSession, SESSION_COOKIE } from "@/lib/server/auth";
import { loadUserData, saveUserData, storageEnabled } from "@/lib/server/store";
import { mergePortfolios, type UserPortfolio } from "@/lib/user-data";

async function currentUser(): Promise<string | null> {
  const { enabled, users, secret } = authConfig();
  if (!enabled) return null;
  const id = readSession((await cookies()).get(SESSION_COOKIE)?.value, secret);
  return users.some((u) => u.id === id) ? id : null;
}

/** GET /api/data : les données enregistrées du compte connecté. */
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  if (!storageEnabled()) return Response.json({ error: "Synchronisation non configurée." }, { status: 501 });
  try {
    return Response.json({ data: await loadUserData(user) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Stockage indisponible pour le moment." }, { status: 502 });
  }
}

/** PUT /api/data : remplace les données du compte connecté (portefeuille, plans, réglages). */
export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  if (!storageEnabled()) return Response.json({ error: "Synchronisation non configurée." }, { status: 501 });
  const text = await request.text();
  if (text.length > 2_000_000) return Response.json({ error: "Données trop volumineuses." }, { status: 413 });
  try {
    const body = JSON.parse(text) as { portfolio?: unknown; settings?: unknown; updatedAt?: unknown };
    if (!body || typeof body !== "object" || !body.portfolio || typeof body.updatedAt !== "number") {
      return Response.json({ error: "Données illisibles." }, { status: 400 });
    }
    // Fusion côté serveur : un appareil qui n'a pas encore vu les ajouts d'un autre ne les efface pas.
    const existing = (await loadUserData(user)) as { portfolio?: UserPortfolio } | null;
    const incoming = body.portfolio as UserPortfolio;
    const portfolio = existing?.portfolio ? mergePortfolios(incoming, existing.portfolio) : incoming;
    await saveUserData(user, { portfolio, settings: body.settings, updatedAt: body.updatedAt });
    return Response.json({ ok: true, portfolio });
  } catch {
    return Response.json({ error: "Enregistrement impossible pour le moment." }, { status: 502 });
  }
}
