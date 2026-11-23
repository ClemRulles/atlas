import { SESSION_COOKIE } from "@/lib/server/auth";

/** POST /api/auth/logout : ferme la session. */
export async function POST() {
  const response = Response.json({ ok: true });
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  return response;
}
