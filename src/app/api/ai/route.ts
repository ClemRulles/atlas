import { NextRequest, NextResponse } from 'next/server';

interface PortfolioSummaryItem {
  name?: string;
  symbol?: string;
  currency?: string;
  category?: string;
  institution?: string;
  valueEur?: number;
  pnlPct?: number;
}

interface ChatMessageInput {
  role: 'user' | 'assistant';
  content: string;
}

interface AiNewsItem {
  title: string;
  impact: 'Positif' | 'Neutre' | 'Vigilance';
  asset: string;
  summary: string;
  time: string;
}

const MODELS_TO_TRY = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];

async function callGemini(
  apiKey: string,
  systemInstruction: string,
  prompt: string,
  expectJson = false
): Promise<string | null> {
  for (const model of MODELS_TO_TRY) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
        apiKey
      )}`;

      const body: Record<string, unknown> = {
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: expectJson ? 0.35 : 0.6,
          ...(expectJson ? { responseMimeType: 'application/json' } : {}),
        },
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      });

      if (!res.ok) continue;

      const data = await res.json();
      const text =
        data?.candidates?.[0]?.content?.parts
          ?.map((p: { text?: string }) => p.text || '')
          .join('')
          .trim() || '';

      if (text) return text;
    } catch {
      // Essaie le modèle suivant
    }
  }
  return null;
}

function buildFallbackNews(portfolio: PortfolioSummaryItem[]): AiNewsItem[] {
  const topAssets = portfolio.slice(0, 3);
  if (topAssets.length === 0) {
    return [
      {
        title: 'Suivi consolidé des marchés actions et ETF',
        impact: 'Neutre',
        asset: 'Portefeuille global',
        summary:
          'Ajoutez ou vérifiez vos positions pour obtenir des synthèses thématiques ciblées sur vos actifs.',
        time: 'Aujourd’hui',
      },
    ];
  }

  return topAssets.map((item, idx) => ({
    title: `Point de vigilance & dynamique sur ${item.name || item.symbol || 'votre position'}`,
    impact: idx === 0 ? 'Positif' : idx === 1 ? 'Neutre' : 'Vigilance',
    asset: item.symbol || item.name || item.category || 'Actif',
    summary: `Position classée en ${item.category || 'Actif'} (${
      item.currency || 'EUR'
    }), valorisée autour de €${(item.valueEur || 0).toLocaleString('en-US', {
      maximumFractionDigits: 0,
    })} avec une performance latente de ${(item.pnlPct || 0) >= 0 ? '+' : ''}${(
      item.pnlPct || 0
    ).toFixed(1)}%. Surveillez la volatilité sectorielle et le taux EUR/USD.`,
    time: 'Aujourd’hui',
  }));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode: 'news' | 'advisor' = body?.mode === 'news' ? 'news' : 'advisor';
    const portfolio: PortfolioSummaryItem[] = Array.isArray(body?.portfolio)
      ? body.portfolio
      : [];
    const apiKey = process.env.GEMINI_API_KEY?.trim();

    const portfolioContext = JSON.stringify(portfolio.slice(0, 25));

    if (mode === 'news') {
      if (!apiKey) {
        return NextResponse.json({
          news: buildFallbackNews(portfolio),
          missingKey: true,
        });
      }

      const rawJson = await callGemini(
        apiKey,
        'Tu es un analyste financier synthétique en français. Réponds UNIQUEMENT avec un tableau JSON de 4 objets contenant exactement les clés : title (string), impact ("Positif" | "Neutre" | "Vigilance"), asset (string), summary (string, 2 phrases max), time (string). Pas de conseil d’investissement personnalisé réglementé, reste objectif et clair.',
        `Génère 4 actualités / analyses pertinentes à partir de ce portefeuille : ${portfolioContext}`,
        true
      );

      if (rawJson) {
        try {
          const cleaned = rawJson.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
          const parsed = JSON.parse(cleaned);
          const list = Array.isArray(parsed) ? parsed : parsed?.news;
          if (Array.isArray(list) && list.length > 0) {
            const normalized: AiNewsItem[] = list.slice(0, 6).map((n: Partial<AiNewsItem>) => ({
              title: String(n.title || 'Actualité marché'),
              impact:
                n.impact === 'Positif' || n.impact === 'Vigilance' ? n.impact : 'Neutre',
              asset: String(n.asset || 'Marchés'),
              summary: String(n.summary || ''),
              time: String(n.time || 'Récent'),
            }));
            return NextResponse.json({ news: normalized });
          }
        } catch {
          // Repli ci-dessous
        }
      }

      return NextResponse.json({ news: buildFallbackNews(portfolio) });
    }

    // Mode conseiller
    const messages: ChatMessageInput[] = Array.isArray(body?.messages) ? body.messages : [];
    const lastUserMessage =
      [...messages].reverse().find((m) => m.role === 'user')?.content ||
      'Analyse mon portefeuille.';

    if (!apiKey) {
      return NextResponse.json({
        reply:
          'La clé GEMINI_API_KEY n’est pas encore configurée sur Vercel. Ajoutez-la dans Settings → Environment Variables puis relancez un déploiement pour activer les réponses IA en direct.',
        missingKey: true,
      });
    }

    const conversationHistory = messages
      .slice(-8)
      .map((m) => `${m.role === 'user' ? 'Utilisateur' : 'Conseiller'}: ${m.content}`)
      .join('\n');

    const reply = await callGemini(
      apiKey,
      `Tu es un assistant d’analyse patrimoniale pédagogue, structuré et concis en français. Tu analyses le portefeuille de l’utilisateur (valeurs consolidées en EUR, devises d’origine EUR/USD, catégories et établissements). Sois précis avec les chiffres fournis, signale les concentrations ou expositions de change, et rappelle brièvement que cela reste informatif. Portefeuille actuel : ${portfolioContext}`,
      `Historique récent :\n${conversationHistory}\n\nQuestion de l'utilisateur : ${lastUserMessage}`,
      false
    );

    return NextResponse.json({
      reply:
        reply ||
        'Je n’ai pas pu générer de réponse pour le moment. Réessayez dans quelques instants.',
    });
  } catch {
    return NextResponse.json(
      {
        reply: 'Une erreur est survenue côté serveur lors de l’appel à Gemini.',
        news: [],
      },
      { status: 200 }
    );
  }
}
