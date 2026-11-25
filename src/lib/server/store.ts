import "server-only";

/**
 * Stockage des données de chaque compte dans Redis (Upstash), par son API REST.
 * Variables posées automatiquement par l'intégration Upstash de Vercel :
 * KV_REST_API_URL et KV_REST_API_TOKEN (ou UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).
 */

function config() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

export const storageEnabled = () => config() !== null;

async function command<T>(args: (string | number)[]): Promise<T> {
  const c = config();
  if (!c) throw new Error("Stockage non configuré");
  const res = await fetch(c.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Redis : HTTP ${res.status}`);
  const body = (await res.json()) as { result: T };
  return body.result;
}

const key = (userId: string) => `atlas:user:${userId}`;

export async function loadUserData(userId: string): Promise<unknown | null> {
  const raw = await command<string | null>(["GET", key(userId)]);
  return raw ? JSON.parse(raw) : null;
}

export async function saveUserData(userId: string, data: unknown): Promise<void> {
  await command(["SET", key(userId), JSON.stringify(data)]);
}

/* ——— Clés d'accès (Face ID, Touch ID) ——— */

export interface StoredPasskey {
  /** Identifiant de la clé, base64url. */
  id: string;
  /** Clé publique COSE, base64url. */
  publicKey: string;
  counter: number;
  transports?: string[];
  createdAt: string;
  label?: string;
}

const passkeyKey = (userId: string) => `atlas:passkeys:${userId}`;

export async function loadPasskeys(userId: string): Promise<StoredPasskey[]> {
  const raw = await command<string | null>(["GET", passkeyKey(userId)]);
  return raw ? (JSON.parse(raw) as StoredPasskey[]) : [];
}

export async function savePasskeys(userId: string, passkeys: StoredPasskey[]): Promise<void> {
  await command(["SET", passkeyKey(userId), JSON.stringify(passkeys)]);
}
