/**
 * Modèle de données d'Atlas.
 *
 * Conventions :
 * - les dates sont des chaînes ISO « AAAA-MM-JJ » (comparables telles quelles) ;
 * - les poids et les taux sont des ratios (0,05 = 5 %) ;
 * - un taux de change est le nombre d'unités de la devise pour 1 euro (EUR/USD = 1,08) ;
 * - une donnée absente vaut `null` ou `undefined`, jamais une valeur inventée.
 */

export type AssetType = "stock" | "etf" | "fund";

export interface Instrument {
  /** Identifiant interne : l'ISIN quand il est connu, sinon le symbole. */
  id: string;
  isin?: string;
  /** Symbole côté fournisseur de cours (ex. IWDA.AS). */
  symbol: string;
  name: string;
  type: AssetType;
  /** Devise de cotation (ISO 4217). */
  currency: string;
  exchange?: string;
  /** Renseignés pour les actions détenues en direct. */
  sector?: string;
  country?: string;
  /** Indice auquel la ligne est rattachée pour rejouer les crises. */
  benchmark?: string;
  /** Actions en direct : bénéfice par action / cours, et dividende / cours (ratios). */
  earningsYield?: number;
  dividendYield?: number;
  /** Frais courants d'un ETF ou d'un fonds, quand on les connaît sans sa composition. */
  expenseRatio?: number;
}

export interface Transaction {
  id: string;
  instrumentId: string;
  side: "buy" | "sell";
  date: string;
  quantity: number;
  /** Prix unitaire dans la devise de cotation. */
  price: number;
  /** Frais de courtage et taxes, en euros. */
  fees?: number;
  /** Taux de change réellement obtenu ; à défaut on prend le taux de marché du jour. */
  fxRate?: number;
  broker?: string;
  /** Journal de convictions : la phrase écrite au moment de l'achat. */
  note?: string;
}

export interface PricePoint {
  date: string;
  close: number;
}

/** Trié par date croissante. */
export type PriceHistory = PricePoint[];

export interface MarketData {
  /** Cours de clôture par identifiant d'instrument, dans sa devise de cotation. */
  prices: Record<string, PriceHistory>;
  /** Taux de change par devise : unités de devise pour 1 euro. */
  fx: Record<string, PriceHistory>;
}

export interface Holding {
  name: string;
  weight: number;
  isin?: string;
  symbol?: string;
  sector?: string;
  country?: string;
  currency?: string;
}

export interface Weight {
  key: string;
  weight: number;
}

/** Ce qu'un fournisseur sait de l'intérieur d'un ETF ou d'un fonds. */
export interface FundComposition {
  instrumentId: string;
  /** D'où vient la donnée (« demo », « eulerpool », …). */
  source: string;
  asOf?: string;
  /** Lignes publiées. La liste peut être partielle : la somme des poids dit ce qui est couvert. */
  holdings: Holding[];
  sectors?: Weight[];
  countries?: Weight[];
  currencies?: Weight[];
  /** Frais courants annuels (TER). */
  expenseRatio?: number;
  /** Nombre total de lignes annoncé par l'émetteur. */
  holdingsCount?: number;
  /** Rendement bénéficiaire et rendement en dividendes du panier détenu (ratios). */
  earningsYield?: number;
  dividendYield?: number;
}

export type Compositions = Record<string, FundComposition | undefined>;

export interface Expense {
  id: string;
  label: string;
  /** Montant mensuel en euros. */
  monthly: number;
}

/**
 * Plan d'épargne : un montant fixe en euros investi chaque mois à un jour donné
 * (Trade Republic exécute le 2 ou le 16, ou le jour ouvré suivant).
 */
export interface SavingsPlan {
  id: string;
  instrumentId: string;
  /** Montant brut prélevé chaque mois, en euros. */
  amountEUR: number;
  /** Jour du mois visé (1 à 28). */
  dayOfMonth: number;
  /** Premier mois d'exécution (AAAA-MM-JJ, le jour est ignoré au profit de dayOfMonth). */
  start: string;
  /** Dernier mois inclus, si le plan est arrêté. */
  end?: string;
  /** Frais par exécution, en euros (souvent 0). */
  fees?: number;
  broker?: string;
}
