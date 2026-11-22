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
| 1 | Direction artistique, structure, navigation, mode démo | Fait : direction « Nuit boréale » validée, trois pages en mode démo, navigation, mode discret |
| 2 | Saisie des positions, cours réels, graphe d'évolution | Fait : recherche par nom/ticker/ISIN, achat et vente, import CSV, cours Yahoo, courbe réelle, dépenses, sauvegarde JSON |
| 3 | Composition des ETF, page « Ce que tu possèdes » | Fait : compositions (Yahoo par défaut, Eulerpool/FMP/Finnhub en option), ETF traversés dans la phrase du jour, actualités et dates de résultats |
| 4 | Laboratoire « Et si » | Fait : simulateur Monte Carlo en cône avec paliers, crises 2008/Covid/2022, jumeau paresseux, avant d'acheter, choc sur mesure, journal de convictions |
| 5 | Chat et import par capture d'écran (sans IA) | Reportée. La phrase du jour, elle, est déjà faite sans IA |
| 6 | PWA, finitions, déploiement Vercel | Fait : installable sur iPhone (manifeste, icônes, plein écran), ouverture hors ligne avec les derniers cours, déploiement par Vercel à chaque push |

## Installer sur iPhone

Ouvrir l'adresse Vercel dans Safari, puis Partager → « Sur l'écran d'accueil ». Atlas s'ouvre alors en plein écran, comme une app, et reste consultable hors ligne avec les derniers cours connus.

## Déployer sur Vercel

1. Vercel → Add New → Project → importer ce dépôt GitHub (préréglage Next.js, aucun réglage à changer).
2. Aucune variable d'environnement n'est obligatoire. Pour les compositions complètes d'ETF : ajouter `EULERPOOL_API_KEY` (clé gratuite).
3. Chaque push sur `main` redéploie automatiquement.

## Le laboratoire « Et si »

Calculs dans `src/lib/lab/lab.ts`, testés. Tous illustratifs :

| Outil | Méthode |
|---|---|
| Simulateur du futur | 1 500 trajectoires mensuelles log-normales ; profils prudent 3 %/7 %, équilibré 5 %/12 %, dynamique 7 %/17 % (rendement médian / volatilité annuels) ; cône 10e–90e centile ; paliers des morceaux de vie sur le scénario médian |
| Rejouer les crises | Chaque ligne suit un indice (S&P 500, Nasdaq 100, Euro Stoxx 50, EEM, ou « monde » = 75 % S&P 500 + 25 % Euro Stoxx 50) depuis le sommet d'avant crise ; sans devises ni dividendes |
| Jumeau paresseux | Chaque euro versé ou retiré, aux mêmes dates, placé dans iShares Core MSCI World (IWDA.AS) |
| Avant d'acheter | Avant/après sur secteurs, pays, poids des dix premières entreprises, recouvrement avec les fonds détenus |
| Choc sur mesure | Effet direct : la part exposée (ETF traversés) perd la baisse choisie ; l'exposition inconnue est affichée |

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
| `HOLDINGS_PROVIDER` | 3 | Fournisseur principal de composition : `yahoo`, `eulerpool`, `fmp` ou `finnhub`. Sans réglage : Eulerpool si sa clé est présente, sinon Yahoo |
| `EULERPOOL_API_KEY` | 3 | Clé Eulerpool (offre gratuite, usage non commercial) |
| `FMP_API_KEY` | 3 | Clé Financial Modeling Prep, si ce fournisseur est choisi |
| `FINNHUB_API_KEY` | 3 | Clé Finnhub, si ce fournisseur est choisi |

## Coût : zéro

Atlas ne doit rien coûter. Chaque brique a une offre gratuite suffisante pour un usage personnel :

| Brique | Service | Offre gratuite |
|---|---|---|
| Hébergement | Vercel | Plan Hobby |
| Cours et historiques | Yahoo Finance (yahoo-finance2) | Sans clé |
| Composition des ETF | Eulerpool | 100 000 requêtes par mois, usage non commercial |
| « IA » | Aucun service externe | Tout tourne dans l'app |

Atlas n'utilise aucune clé d'IA :

- **Phrase du jour** : les chiffres (variation, contributeurs à travers les ETF, effet devise) viennent du moteur de calcul et sont insérés dans des modèles de phrases (`src/lib/domain/sentence.ts`). Elle ne peut pas inventer un chiffre.
- **Chat « Demande à ton patrimoine »** (phase 5) : il reconnaît les questions courantes (« combien j'ai en dollars ? », « quel est mon plus gros risque ? ») et y répond à partir des analyses déjà calculées, avec des questions suggérées.
- **Import par capture d'écran** (phase 5) : reconnaissance de texte dans le navigateur (Tesseract.js), puis l'utilisateur valide chaque ligne extraite. L'image ne quitte pas le téléphone.

## Composition des ETF : choix du fournisseur

Documentation relue en novembre 2026. Tous passent par l'interface `HoldingsProvider` (`src/lib/holdings/providers.ts`) ; la normalisation (poids en ratios, secteurs et pays en français) est commune et testée.

| Fournisseur | Ce qu'il donne | Coût | Rôle dans Atlas |
|---|---|---|---|
| **Yahoo** | Top 10 des lignes, secteurs, frais courants, rendement bénéficiaire. Pas de pays | Gratuit, sans clé | Par défaut, et complète toujours les trous des autres |
| **Eulerpool** | Lignes complètes, secteurs, pays, frais ; recherche par ISIN | Gratuit avec clé (100 000 requêtes par mois, usage non commercial) | Recommandé : il suffit d'ajouter `EULERPOOL_API_KEY` |
| FMP | Lignes, secteurs, pays, frais, nombre de lignes | Plan Ultimate, 139 $ par mois | Prêt, non activé (payant) |
| Finnhub | Lignes, secteurs, pays, profil (frais, PER) | Module ETF « Premium » | Prêt, non activé (payant) |

**Retenu : Yahoo par défaut, parce que l'app ne doit rien coûter et fonctionner sans aucune clé.** Sa limite est assumée et affichée : seules les dix premières lignes de chaque fonds sont connues (Atlas écrit « au moins N entreprises identifiées » et montre la part « non publiée »), et les pays manquent. Une clé Eulerpool gratuite lève ces deux limites sans autre changement. Les connecteurs FMP et Finnhub suivent leur documentation mais n'ont pas pu être essayés sans abonnement.

Points à vérifier avec une vraie clé Eulerpool : la couverture des ETF européens et l'échelle des poids (la normalisation accepte ratios et pourcentages).

**Ce que la page fait des compositions :**

- Les entreprises sont fusionnées entre fonds par ISIN, sinon par ticker connu, sinon par nom nettoyé (« Alphabet Inc Class A » et « Class C » ne font qu'une).
- La phrase du jour va chercher le cours des douze plus grosses entreprises tenues via les fonds, pour dire qui a fait la journée.
- La répartition par devise est déduite des pays (approximation assumée : la devise principale du pays de chaque entreprise).
- Un rendement en dividendes inconnu n'est jamais compté comme zéro.
- Fiche entreprise : actualités récentes de Yahoo (titre et source, deux lignes au plus, sans résumé généré) et date des prochains résultats quand elle est annoncée.

## Reprise de WealthView

Atlas remplace l'app WealthView qui occupait ce dépôt. Son code reste dans l'historique de `main` (dernier commit `b61ddcb`) et ces morceaux seront repris dans la phase indiquée :

| Morceau de WealthView | Fichier sur `main` | Repris en |
|---|---|---|
| Recherche de titres, repli Yahoo → Twelve Data | `src/app/api/market/route.ts`, `src/lib/marketClient.ts` | Remplacé en phase 2 par yahoo-finance2 seul |
| Verrouillage par code PIN ou biométrie | `src/components/LockScreen.tsx` | Phase 6 |

Pour relire un fichier : `git show origin/main:src/app/api/market/route.ts`.

Non repris : la lecture des valeurs liquidatives sur le Financial Times. Elle appelle une API interne non documentée du site en imitant un navigateur ; Atlas s'en tient aux sources publiques. Un fonds que Yahoo ne cote pas s'affiche « cours indisponible ».

## Cours et données de marché

Toutes les requêtes passent par les routes serveur de l'app, jamais du navigateur vers un fournisseur :

| Route | Rôle | Cache CDN |
|---|---|---|
| `GET /api/search?q=` | Recherche par nom, ticker ou ISIN ; pour un ISIN, ajoute les autres places du même produit | 1 jour |
| `GET /api/history?symbol=&from=` | Clôtures quotidiennes, devise, place ; pence ramenés en livres | 15 min |
| `GET /api/profile?symbol=` | Secteur et pays d'une action, rendement bénéficiaire et dividende, frais d'un fonds | 7 jours |
| `GET /api/composition?symbol=&isin=&id=` | Composition d'un ETF ou d'un fonds, ou `null` | 7 jours |
| `GET /api/company?symbol=` | Actualités récentes et dates de résultats d'une entreprise | 1 heure |

Les cours sont différés d'environ 15 minutes et l'app l'affiche. Les taux de change viennent de Yahoo (`EURUSD=X` = dollars pour 1 euro). Une ligne est identifiée par sa cotation (IWDA.AS et IWDA.L sont deux lignes : même ISIN, devises différentes).

Sur l'appareil, IndexedDB garde les positions, les dépenses et un cache des cours ; l'export JSON (feuille « Mon portefeuille ») permet de tout sauvegarder ou de changer d'appareil.

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
  contributors.ts       Qui a fait la journée, ETF traversés
  earnings.ts           Bénéfices réels : dividendes versés et bénéfices réinvestis
  sentence.ts           Phrase du jour, sans IA
  exchanges.ts          Places boursières et heures d'ouverture (globe)
src/lib/analysis.ts     Assemble tous les calculs en un instantané pour l'interface
src/lib/store.tsx       État de l'app : démo ou vrai portefeuille, mode discret, feuilles ouvertes
src/lib/user-data.ts    Positions saisies, réglages, cache des cours, sauvegarde : fonctions pures
src/lib/csv.ts          Lecture tolérante des exports CSV de courtiers
src/lib/market-format.ts  Devises en centimes, dates par fuseau, ISIN, noms lisibles
src/lib/server/yahoo.ts Accès Yahoo Finance côté serveur, avec cache mémoire
src/lib/holdings/       Fournisseurs de composition (HoldingsProvider), normalisation, choix du fournisseur
src/lib/db.ts           Persistance IndexedDB
src/app/api/            Routes serveur : recherche, historiques, profils
src/lib/demo/           Portefeuille de démonstration fictif et déterministe
src/components/         Coquille (aurore, barre flottante, feuilles), pages, graphes, globe
src/lib/format.ts       Montants et pourcentages à la belge francophone
```

## Principes

- Une donnée absente reste absente : « composition indisponible », jamais un chiffre inventé.
- L'app explique, elle ne recommande ni achat ni vente.
- Les données de l'utilisateur restent sur son appareil (IndexedDB), avec export et import JSON.
- Le mode démo utilise des noms réels avec des cours, transactions et compositions fictifs.
