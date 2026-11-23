import { describe, expect, it } from "vitest";
import { checkPassword, createSession, hashPassword, parseUsers, readSession } from "./auth";

describe("comptes", () => {
  const salt = "sel-de-test";
  const users = parseUsers(`clement:Clément:${salt}:${hashPassword("un mot de passe", salt)};theo:Théo:${salt}:${hashPassword("autre", salt)};incomplet:x`);

  it("lit les comptes déclarés et ignore les entrées incomplètes", () => {
    expect(users.map((u) => [u.id, u.name])).toEqual([["clement", "Clément"], ["theo", "Théo"]]);
  });

  it("vérifie le mot de passe sans le stocker en clair", () => {
    expect(checkPassword(users[0], "un mot de passe")).toBe(true);
    expect(checkPassword(users[0], "autre")).toBe(false);
  });

  it("signe une session, la refuse modifiée, expirée ou avec un autre secret", () => {
    const secret = "un-secret-de-test-assez-long";
    const token = createSession("clement", secret, 1_000);
    expect(readSession(token, secret, 2_000)).toBe("clement");
    expect(readSession(token, "autre-secret-de-test-long", 2_000)).toBeNull();
    expect(readSession(token, secret, 1_000 + 61 * 86_400_000)).toBeNull();
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "theo", exp: 9e15 })).toString("base64url");
    expect(readSession(`${forged}.${sig}`, secret, 2_000)).toBeNull();
    expect(readSession(`${payload}.`, secret, 2_000)).toBeNull();
    expect(readSession(undefined, secret)).toBeNull();
  });
});
