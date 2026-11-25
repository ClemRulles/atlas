import { generateAuthenticationOptions, verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { authConfig, createSession, serializeSessionCookie } from "@/lib/server/auth";
import { loadPasskeys, savePasskeys, storageEnabled } from "@/lib/server/store";
import { challengeCookie, clearChallengeCookie, readChallenge, relyingParty } from "@/lib/server/passkey";

/** GET /api/auth/passkey/login : défi de connexion, sans identifiant (l'appareil sait qui tu es). */
export async function GET(request: Request) {
  if (!authConfig().enabled || !storageEnabled()) return Response.json({ error: "Clés d'accès indisponibles sur ce serveur." }, { status: 404 });
  const { rpID } = relyingParty(request);
  const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
  const response = Response.json(options, { headers: { "Cache-Control": "no-store" } });
  response.headers.append("Set-Cookie", challengeCookie(options.challenge));
  return response;
}

/** POST /api/auth/passkey/login { response } : vérifie la signature et ouvre une session de 60 jours. */
export async function POST(request: Request) {
  const { enabled, users, secret } = authConfig();
  const challenge = readChallenge(request);
  if (!enabled || !challenge) return Response.json({ error: "Demande expirée, recommence." }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { response?: AuthenticationResponseJSON };
  const handle = body.response?.response.userHandle;
  const fail = () => Response.json({ error: "Clé d'accès non reconnue." }, { status: 401 });
  if (!body.response || !handle) return fail();
  let userId: string;
  try {
    userId = new TextDecoder().decode(isoBase64URL.toBuffer(handle));
  } catch {
    return fail();
  }
  const user = users.find((u) => u.id === userId);
  if (!user) return fail();
  const passkeys = await loadPasskeys(user.id);
  const stored = passkeys.find((p) => p.id === body.response!.id);
  if (!stored) return fail();
  const { rpID, origin } = relyingParty(request);
  try {
    const { verified, authenticationInfo } = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: challenge.c,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: { id: stored.id, publicKey: isoBase64URL.toBuffer(stored.publicKey), counter: stored.counter, transports: stored.transports as never },
    });
    if (!verified) return fail();
    if (authenticationInfo.newCounter !== stored.counter) {
      await savePasskeys(user.id, passkeys.map((p) => (p.id === stored.id ? { ...p, counter: authenticationInfo.newCounter } : p)));
    }
    const response = Response.json({ user: { id: user.id, name: user.name } });
    response.headers.append("Set-Cookie", serializeSessionCookie(createSession(user.id, secret)));
    response.headers.append("Set-Cookie", clearChallengeCookie);
    return response;
  } catch {
    return fail();
  }
}
