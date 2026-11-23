"use client";

import { useState } from "react";
import { PrimaryButton, TextInput } from "@/components/ui/fields";

/** Connexion : un identifiant et un mot de passe, pour retrouver ses données sur tous ses appareils. */
export default function LoginPage() {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user, password }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Connexion impossible.");
      // Rechargement complet voulu : l'app relit les données du compte au démarrage.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center gap-8">
      <div className="flex flex-col gap-3">
        <span className="repere">Atlas</span>
        <h1 className="font-serif text-[44px] leading-[1.02] font-light tracking-[-0.02em]">
          Bon retour. <em className="text-brume">Ton patrimoine t&apos;attend.</em>
        </h1>
      </div>
      <form onSubmit={submit} className="verre flex flex-col gap-4 rounded-[28px] p-5">
        <label className="flex flex-col gap-1.5">
          <span className="repere">Identifiant</span>
          <TextInput id="login-user" autoComplete="username" autoCapitalize="none" value={user} onChange={(e) => setUser(e.target.value)} placeholder="clement" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="repere">Mot de passe</span>
          <TextInput id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="text-[13.5px] text-braise">{error}</p>}
        <PrimaryButton type="submit" disabled={busy || !user || !password}>
          {busy ? "Connexion…" : "Se connecter"}
        </PrimaryButton>
      </form>
      <p className="text-[12.5px] text-ombre">Tes positions, tes plans et tes dépenses sont rangés dans ton compte et suivent ton téléphone comme ton ordinateur.</p>
    </main>
  );
}
