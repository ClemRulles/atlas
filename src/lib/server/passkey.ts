import "server-only";
import { authConfig, readSession, readToken, SESSION_COOKIE, signToken } from "./auth";

/**
 * Clés d'accès (WebAuthn) : Face ID sur iPhone, Touch ID sur Mac. La clé privée ne quitte jamais
 * l'appareil ; le serveur garde la clé publique dans Redis et vérifie chaque signature.
 * Le défi voyage dans un cookie signé de cinq minutes : rien à stocker côté serveur.
 */

export const CHALLENGE_COOKIE = "atlas_challenge";
const CHALLENGE_TTL = 5 * 60_000;

/** Domaine et origine attendus, d'après l'adresse réellement utilisée (Vercel ou local). */
export function relyingParty(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return { rpID: host.split(":")[0], origin: `${proto}://${host}`, rpName: "Atlas" };
}

function cookie(request: Request, name: string): string | undefined {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

export function sessionUser(request: Request) {
  const { enabled, users, secret } = authConfig();
  if (!enabled) return null;
  const id = readSession(cookie(request, SESSION_COOKIE), secret);
  return users.find((u) => u.id === id) ?? null;
}

export function challengeCookie(challenge: string, userId?: string): string {
  const token = signToken({ c: challenge, ...(userId ? { u: userId } : {}) }, authConfig().secret, CHALLENGE_TTL);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${CHALLENGE_COOKIE}=${token}; Path=/api/auth/passkey; Max-Age=300; HttpOnly; SameSite=Strict${secure}`;
}

export const clearChallengeCookie = `${CHALLENGE_COOKIE}=; Path=/api/auth/passkey; Max-Age=0; HttpOnly; SameSite=Strict`;

export function readChallenge(request: Request): { c: string; u?: string } | null {
  return readToken<{ c: string; u?: string }>(cookie(request, CHALLENGE_COOKIE), authConfig().secret);
}
