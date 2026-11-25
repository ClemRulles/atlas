import { generateRegistrationOptions, verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { loadPasskeys, savePasskeys, storageEnabled } from "@/lib/server/store";
import { challengeCookie, clearChallengeCookie, readChallenge, relyingParty, sessionUser } from "@/lib/server/passkey";

/** GET /api/auth/passkey/register : défi pour créer une clé d'accès sur cet appareil. */
export async function GET(request: Request) {
  const user = sessionUser(request);
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  if (!storageEnabled()) return Response.json({ error: "Le stockage du compte n'est pas configuré." }, { status: 503 });
  const { rpID, rpName } = relyingParty(request);
  const existing = await loadPasskeys(user.id);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.id,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports as never })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  const response = Response.json(options, { headers: { "Cache-Control": "no-store" } });
  response.headers.append("Set-Cookie", challengeCookie(options.challenge, user.id));
  return response;
}

/** POST /api/auth/passkey/register { response, label } : vérifie et enregistre la clé publique. */
export async function POST(request: Request) {
  const user = sessionUser(request);
  const challenge = readChallenge(request);
  if (!user || !challenge || challenge.u !== user.id) return Response.json({ error: "Demande expirée, recommence." }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { response?: RegistrationResponseJSON; label?: string };
  if (!body.response) return Response.json({ error: "Réponse manquante." }, { status: 400 });
  const { rpID, origin } = relyingParty(request);
  try {
    const { verified, registrationInfo } = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challenge.c,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!verified || !registrationInfo) throw new Error("non vérifiée");
    const { credential } = registrationInfo;
    const passkeys = (await loadPasskeys(user.id)).filter((p) => p.id !== credential.id);
    passkeys.push({
      id: credential.id,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports,
      createdAt: new Date().toISOString(),
      label: typeof body.label === "string" ? body.label.slice(0, 40) : undefined,
    });
    await savePasskeys(user.id, passkeys);
    const response = Response.json({ ok: true, id: credential.id });
    response.headers.append("Set-Cookie", clearChallengeCookie);
    return response;
  } catch {
    return Response.json({ error: "La clé n'a pas pu être vérifiée." }, { status: 400 });
  }
}
