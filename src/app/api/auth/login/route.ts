import { authConfig, checkPassword, createSession, serializeSessionCookie } from "@/lib/server/auth";

/** POST /api/auth/login { user, password } : ouvre une session de 60 jours. */
export async function POST(request: Request) {
  const { enabled, users, secret } = authConfig();
  if (!enabled) return Response.json({ error: "Aucun compte n'est configuré sur ce serveur." }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { user?: string; password?: string };
  const user = users.find((u) => u.id === String(body.user ?? "").trim().toLowerCase());
  // Même délai et même message que le compte existe ou non.
  const ok = !!user && typeof body.password === "string" && checkPassword(user, body.password);
  if (!ok || !user) return Response.json({ error: "Identifiant ou mot de passe incorrect." }, { status: 401 });
  const response = Response.json({ user: { id: user.id, name: user.name } });
  response.headers.append("Set-Cookie", serializeSessionCookie(createSession(user.id, secret)));
  return response;
}

