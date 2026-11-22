import "server-only";
import type { FundComposition } from "@/lib/domain/types";
import { completeWith, withDerivedCurrencies } from "./normalize";
import { PROVIDERS, yahooProvider, type FundRef, type HoldingsProvider } from "./providers";

/**
 * Choix du fournisseur : HOLDINGS_PROVIDER s'il est configuré et a sa clé,
 * sinon Eulerpool si sa clé gratuite est présente, sinon Yahoo (sans clé).
 * Yahoo complète toujours les trous du fournisseur principal (secteurs, frais, rendement).
 */
export function primaryProvider(): HoldingsProvider {
  const wanted = process.env.HOLDINGS_PROVIDER as HoldingsProvider["id"] | undefined;
  if (wanted && PROVIDERS[wanted]?.available()) return PROVIDERS[wanted];
  if (PROVIDERS.eulerpool.available()) return PROVIDERS.eulerpool;
  return yahooProvider;
}

const memory = new Map<string, { at: number; value: FundComposition | null }>();
const TTL_MS = 7 * 24 * 3600_000;

export async function fundComposition(ref: FundRef): Promise<FundComposition | null> {
  const key = `${ref.symbol}:${ref.isin ?? ""}`;
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const provider = primaryProvider();
  const primary = provider.id === "yahoo" ? null : await provider.fetch(ref).catch(() => null);
  const yahoo = await yahooProvider.fetch(ref).catch(() => null);
  const merged = completeWith(primary, yahoo);
  const value = merged ? withDerivedCurrencies(merged) : null;
  memory.set(key, { at: Date.now(), value });
  return value;
}
