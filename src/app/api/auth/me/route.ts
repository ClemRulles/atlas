import { cookies } from "next/headers";
import { authConfig, readSession, SESSION_COOKIE } from "@/lib/server/auth";
import { storageEnabled } from "@/lib/server/store";

/** GET /api/auth/me : le compte connecté, et si la synchronisation est possible. */
export async function GET() {
  const { enabled, users, secret } = authConfig();
  if (!enabled) return Response.json({ enabled: false, user: null, sync: false });
  const id = readSession((await cookies()).get(SESSION_COOKIE)?.value, secret);
  const user = users.find((u) => u.id === id);
  return Response.json({ enabled: true, user: user ? { id: user.id, name: user.name } : null, sync: !!user && storageEnabled() }, { headers: { "Cache-Control": "no-store" } });
}
