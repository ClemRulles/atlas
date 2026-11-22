import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim().length === 0) {
      return NextResponse.json(
        {
          error:
            "Clé API Gemini non configurée (variable d'environnement GEMINI_API_KEY manquante sur Vercel ou .env.local). Obtenez une clé gratuite sur Google AI Studio puis ajoutez GEMINI_API_KEY dans les réglages Vercel.",
        },
        { status: 400 }
      );
    }

    const body = await req.json();
    const mode: 'news' | 'advisor' = body?.mode === 'news' ? 'news' : 'advisor';
    const portfolioSummary = body?.portfolioSummary || '';
    const prompt: string = body?.prompt || '';

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    if (mode === 'news') {
      const newsPrompt = `Tu es un analyste financier synthétique en français.
Voici le portefeuille de l'utilisateur :
${portfolioSummary}

Rédige une newsletter / revue d'actualités courte, structurée et impactante (3 à 4 points clés maximum) expliquant les thèmes, secteurs et risques/opportunités qui concernent directement ces positions (actions, ETF, fonds, crypto, cash, matières premières). Termine par une courte note rappelant qu'il s'agit d'une analyse informative et non d'un conseil financier réglementé.`;

      const result = await model.generateContent(newsPrompt);
      return NextResponse.json({ text: result.response.text() });
    }

    const advisorPrompt = `Tu es un conseiller financier, boursier et budgétaire pédagogue, pragmatique et lucide, qui répond en français.
Voici la situation actuelle du portefeuille de l'utilisateur :
${portfolioSummary}

Question ou demande de l'utilisateur :
${prompt}

Donne une réponse claire, structurée et actionnable adaptée à son portefeuille réel, en mentionnant les points de vigilance (diversification, concentration, frais, horizon, budget).`;

    const result = await model.generateContent(advisorPrompt);
    return NextResponse.json({ text: result.response.text() });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Impossible de contacter l'API Gemini (vérifiez votre quota ou votre clé GEMINI_API_KEY).";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
