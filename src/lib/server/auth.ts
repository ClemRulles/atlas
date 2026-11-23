/**
 * Comptes Atlas : quelques utilisateurs déclarés dans ATLAS_USERS (mots de passe hachés en scrypt),
 * session dans un cookie signé (HMAC-SHA256, ATLAS_SESSION_SECRET). Sans ces variables,
 * l'app reste ouverte et les données restent sur l'appareil.
 */

import { createHash, createHmac, scryptSync, timingSafeEqual } from "node:crypto";

export interface AtlasUser {
  id: string;
  name: string;
  salt: string;
  hash: string;
}

export const SESSION_COOKIE = "atlas_session";
const SESSION_DAYS = 60;

/** « clement:Clément:sel:empreinte;theo:Théo:sel:empreinte » */
export function parseUsers(raw: string | undefined): AtlasUser[] {
  if (!raw) return [];
  return raw
    .split(";")
    .map((entry) => entry.trim().split(":"))
    .filter((parts) => parts.length === 4 && parts.every(Boolean))
    .map(([id, name, salt, hash]) => ({ id: id.toLowerCase(), name, salt, hash }));
}

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 32).toString("hex");
}

export function checkPassword(user: AtlasUser, password: string): boolean {
  const expected = Buffer.from(user.hash, "hex");
  const actual = Buffer.from(hashPassword(password, user.salt), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSession(userId: string, secret: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, exp: now + SESSION_DAYS * 86_400_000 })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

/** Identifiant de l'utilisateur si la session est valide et non expirée, sinon `null`. */
export function readSession(token: string | undefined, secret: string, now = Date.now()): string | null {
  if (!token || !secret) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { u, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { u: string; exp: number };
    return typeof u === "string" && typeof exp === "number" && exp > now ? u : null;
  } catch {
    return null;
  }
}

/**
 * Secret de session : ATLAS_SESSION_SECRET s'il est posé, sinon dérivé de la clé du stockage Upstash
 * (déjà secrète et posée automatiquement par Vercel) : une variable de moins à gérer à la main.
 */
export function sessionSecret(env: Record<string, string | undefined> = process.env): string {
  if (env.ATLAS_SESSION_SECRET && env.ATLAS_SESSION_SECRET.length >= 16) return env.ATLAS_SESSION_SECRET;
  const base = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  return base ? createHash("sha256").update(`atlas-session:${base}`).digest("hex") : "";
}

export function authConfig() {
  const users = parseUsers(process.env.ATLAS_USERS);
  const secret = sessionSecret();
  return { enabled: users.length > 0 && secret.length >= 16, users, secret };
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 86_400,
};
