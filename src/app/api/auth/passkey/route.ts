import { loadPasskeys, savePasskeys, storageEnabled } from "@/lib/server/store";
import { sessionUser } from "@/lib/server/passkey";

const noStore = { "Cache-Control": "no-store" };

/** GET /api/auth/passkey : les clés d'accès du compte connecté (sans les clés elles-mêmes). */
export async function GET(request: Request) {
  const user = sessionUser(request);
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  if (!storageEnabled()) return Response.json({ available: false, passkeys: [] }, { headers: noStore });
  const passkeys = await loadPasskeys(user.id);
  return Response.json({ available: true, passkeys: passkeys.map(({ id, createdAt, label }) => ({ id, createdAt, label })) }, { headers: noStore });
}

/** DELETE /api/auth/passkey { id } : retire une clé d'accès du compte. */
export async function DELETE(request: Request) {
  const user = sessionUser(request);
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  const { id } = (await request.json().catch(() => ({}))) as { id?: string };
  const passkeys = await loadPasskeys(user.id);
  await savePasskeys(user.id, passkeys.filter((p) => p.id !== id));
  return Response.json({ ok: true });
}
