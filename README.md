# Atlas

PWA personnelle de suivi de patrimoine. Atlas ne conseille rien : elle traduit un portefeuille (actions, ETF, fonds, saisis à la main) en choses que l'on comprend sans réfléchir.

Trois pages, trois questions :

| Page | Question |
|---|---|
| Aujourd'hui | Qu'est-ce qui s'est passé aujourd'hui ? |
| Ce que tu possèdes | Qu'est-ce que je possède vraiment ? |
| Et si | Et si… ? |

## Avancement

| Phase | Contenu | État |
|---|---|---|
| 1 | Direction artistique, structure, navigation, mode démo | Direction artistique proposée, en attente d'accord. Socle de calcul et portefeuille démo faits. |
| 2 | Saisie des positions, cours réels, graphe d'évolution | À faire |
| 3 | Composition des ETF, page « Ce que tu possèdes » | À faire |
| 4 | Laboratoire « Et si » | À faire |
| 5 | IA : phrase du jour, chat, import par capture d'écran | À faire |
| 6 | PWA, finitions, déploiement Vercel | À faire |

## Lancer le projet

```bash
npm install
npm run dev
```

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm test` | Tests des calculs financiers (Vitest) |
| `npm run typecheck` | Vérification TypeScript |
| `npm run lint` | ESLint |
| `npm run build` | Build de production |

## Variables d'environnement

Aucune n'est nécessaire pour les phases 1 et 2 : le mode démo est entièrement local et les cours Yahoo n'exigent pas de clé. Copier `.env.example` vers `.env.local` au moment où une phase en a besoin. Les clés ne sont lues que côté serveur, jamais envoyées au navigateur.

| Variable | Phase | Rôle |
|---|---|---|
| `HOLDINGS_PROVIDER` | 3 | Fournisseur de composition des ETF : `eulerpool` (défaut), `fmp` ou `finnhub` |
| `EULERPOOL_API_KEY` | 3 | Clé Eulerpool (offre gratuite, usage non commercial) |
| `FMP_API_KEY` | 3 | Clé Financial Modeling Prep, si ce fournisseur est choisi |
| `FINNHUB_API_KEY` | 3 | Clé Finnhub, si ce fournisseur est choisi |
| `GEMINI_API_KEY` | 5 | Clé de l'offre gratuite de l'API Gemini (Google AI Studio) |
| `GEMINI_MODEL` | 5 | Identifiant du modèle Gemini utilisé pour le chat, l'import par capture et la tournure de la phrase du jour |

## Coût : zéro

Atlas ne doit rien coûter. Chaque brique a une offre gratuite suffisante pour un usage personnel :

| Brique | Service | Offre gratuite |
|---|---|---|
| Hébergement | Vercel | Plan Hobby |
| Cours et historiques | Yahoo Finance (yahoo-finance2) | Sans clé |
| Composition des ETF | Eulerpool | 100 000 requêtes par mois, usage non commercial |
| IA | API Gemini | Quota gratuit, limites par projet affichées dans AI Studio |

La phrase du jour est d'abord calculée sans IA : les chiffres (variation, contributeurs, effet devise) viennent du moteur de calcul et sont insérés dans des modèles de phrases. Gemini ne fait que reformuler quand il est disponible. Si le quota gratuit est épuisé ou la clé absente, la phrase reste juste et l'app continue de fonctionner. Le chat et l'import par capture, eux, ont besoin de Gemini.

## Composition des ETF : choix du fournisseur

Documentation lue le 15 novembre 2026.

| Fournisseur | Composition d'ETF | Coût | Recherche par ISIN |
|---|---|---|---|
| **Eulerpool** (retenu) | Lignes, secteurs, pays, profil avec frais courants | Gratuit jusqu'à 100 000 requêtes par mois, usage non commercial | Oui |
| FMP | Lignes, secteurs, pays | Plan Ultimate, 139 $ par mois (99 $ en annuel) | Par symbole |
| Finnhub | Lignes, secteurs, pays, profil | Marqué « Premium », absent de l'offre gratuite | Oui |

Points à vérifier avec une vraie clé en phase 3 : la documentation Eulerpool parle des « top holdings » (la liste est peut-être partielle), et la qualité de couverture des ETF UCITS européens n'est pas documentée. Le modèle de données prévoit déjà les compositions partielles : ce qui n'est pas détaillé est affiché comme tel, jamais estimé.

## Reprise de WealthView

Atlas remplace l'app WealthView qui occupait ce dépôt. Son code reste dans l'historique de `main` (dernier commit `b61ddcb`) et ces morceaux seront repris dans la phase indiquée :

| Morceau de WealthView | Fichier sur `main` | Repris en |
|---|---|---|
| Valeurs liquidatives et historiques des fonds par ISIN (Financial Times) | `src/app/api/market/route.ts` | Phase 2 |
| Recherche de titres, repli Yahoo → Twelve Data | `src/app/api/market/route.ts`, `src/lib/marketClient.ts` | Phase 2 |
| Appel Gemini avec repli entre modèles | `src/app/api/ai/route.ts` | Phase 5, sans le rôle de « conseiller » |
| Verrouillage par code PIN ou biométrie | `src/components/LockScreen.tsx` | Phase 6 |

Pour relire un fichier : `git show origin/main:src/app/api/market/route.ts`.

## Organisation du code

```
design/                 Proposition de direction artistique (maquette vivante)
src/lib/domain/         Calculs financiers purs, sans dépendance à l'interface
  types.ts              Modèle de données et conventions
  market.ts             Lecture des cours et des taux de change à une date
  positions.ts          Positions à partir des transactions (prix de revient moyen)
  valuation.ts          Valorisation, variation du jour (effet cours / effet devise), courbe d'évolution
  performance.ts        Performance pondérée par le temps, taux de rendement interne
  lookthrough.ts        Regard à travers les ETF : top réel, répartitions, recouvrement, frais, concentration
  life-slices.ts        « Morceaux de vie » : rendement attendu converti en dépenses couvertes
src/lib/demo/           Portefeuille de démonstration fictif et déterministe
src/lib/format.ts       Montants et pourcentages à la belge francophone
```

## Principes

- Une donnée absente reste absente : « composition indisponible », jamais un chiffre inventé.
- L'app explique, elle ne recommande ni achat ni vente.
- Les données de l'utilisateur restent sur son appareil (IndexedDB), avec export et import JSON.
- Le mode démo utilise des noms réels avec des cours, transactions et compositions fictifs.
