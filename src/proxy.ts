import { NextResponse, type NextRequest } from "next/server";
import { authConfig, readSession, SESSION_COOKIE } from "@/lib/server/auth";

/**
 * Protège l'app quand des comptes sont configurés : sans session valide, les pages renvoient
 * vers /login et les routes /api répondent 401. Sans comptes configurés, tout reste ouvert.
 */
export function proxy(request: NextRequest) {
  const { enabled, secret } = authConfig();
  if (!enabled) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) return NextResponse.next();
  if (readSession(request.cookies.get(SESSION_COOKIE)?.value, secret)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Fichiers statiques, icônes, manifeste et service worker restent accessibles (installation sur l'écran d'accueil).
  matcher: ["/((?!_next/static|_next/image|icon|apple-icon|manifest.webmanifest|sw.js|.*\\.png$).*)"],
};
