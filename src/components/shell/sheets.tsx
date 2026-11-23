"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { answer, SUGGESTIONS } from "@/lib/chat";
import { Field, PrimaryButton, TextInput } from "@/components/ui/fields";
import { parseNumber } from "@/lib/csv";
import type { Expense } from "@/lib/domain/types";
import { formatEUR, formatPct } from "@/lib/format";
import { useAtlas } from "@/lib/store";
import { haptic } from "@/lib/ui";
import { makeBackup, newId, readBackup, type Backup } from "@/lib/user-data";
import { Sheet } from "./Sheet";


interface Message {
  from: "toi" | "atlas";
  text: string;
  link?: { href: string; label: string };
}

export function ChatSheet() {
  const { sheet, openSheet, snapshot, portfolio, settings, mode } = useAtlas();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");

  function ask(question: string) {
    if (!question.trim() || !snapshot) return;
    const a = answer(question, { snapshot, plans: mode === "real" ? (portfolio.plans ?? []) : [], expectedReturn: settings.expectedReturn });
    setMessages((m) => [...m, { from: "toi", text: question.trim() }, { from: "atlas", text: a.text, link: a.link }]);
    setDraft("");
    haptic();
  }

  return (
    <Sheet open={sheet === "chat"} onClose={() => openSheet(null)} title="Demande à ton patrimoine">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="font-serif text-[28px] leading-tight">Demande à ton patrimoine</h2>
          <p className="mt-1 text-[14px] text-brume">Des réponses calculées à partir de tes chiffres{mode === "demo" ? " (ici, ceux de la démo)" : ""}. Il explique, il ne te dira jamais quoi acheter ou vendre.</p>
        </div>
        {messages.length > 0 && (
          <ul className="flex max-h-[42dvh] flex-col gap-3 overflow-y-auto pr-1">
            {messages.map((m, i) => (
              <li key={i} className={`max-w-[88%] rounded-[20px] px-4 py-3 text-[14.5px] leading-snug ${m.from === "toi" ? "self-end bg-white text-nuit" : "self-start bg-white/[0.07]"}`}>
                {m.text}
                {m.link && (
                  <Link href={m.link.href} onClick={() => openSheet(null)} className="mt-2 block text-[13px] text-lavande underline underline-offset-2">
                    {m.link.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((q) => (
            <button key={q} type="button" onClick={() => ask(q)} className="touche rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-[13px] text-brume">
              {q}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => (e.preventDefault(), ask(draft))} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pr-1.5 pl-5">
          <input id="chat-question" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Pose ta question…" className="min-w-0 flex-1 bg-transparent text-[16px] text-craie placeholder:text-ombre focus:outline-none" />
          <button type="submit" disabled={!draft.trim()} className="touche rounded-full bg-white px-4 py-2 text-[13.5px] font-medium text-nuit disabled:opacity-40">Demander</button>
        </form>
      </div>
    </Sheet>
  );
}

/** Démo ou vrai portefeuille, et sauvegarde des données (export, import). */
export function ModeSheet() {
  const { sheet, openSheet, mode, setMode, portfolio, settings, restore } = useAtlas();
  const open = sheet === "mode";
  const demo = mode === "demo";
  const [pending, setPending] = useState<Backup | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feuille rouverte : on efface l'état précédent
    setPending(null);
    setMessage(null);
  }, [open]);

  async function exportData() {
    const backup = makeBackup(portfolio, settings);
    const file = new File([JSON.stringify(backup, null, 2)], `atlas-${backup.exportedAt.slice(0, 10)}.json`, { type: "application/json" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Sauvegarde Atlas" });
        return;
      }
    } catch {
      /* partage annulé : on propose le téléchargement */
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Sauvegarde téléchargée.");
  }

  async function importFile(file: File) {
    try {
      const result = readBackup(JSON.parse(await file.text()));
      if (!result.ok) setMessage(result.error);
      else setPending(result.backup);
    } catch {
      setMessage("Ce fichier n'est pas lisible : il faut le fichier .json exporté par Atlas.");
    }
  }

  return (
    <Sheet open={open} onClose={() => openSheet(null)} title="Portefeuille affiché">
      <h2 className="font-serif text-[28px] leading-tight">{demo ? "Tu regardes un portefeuille fictif" : "Ton vrai portefeuille"}</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-brume">
        {demo
          ? "Un investisseur belge imaginaire, trois courtiers, neuf lignes. Les noms sont réels pour que tout parle, mais les cours, les achats et les compositions sont inventés. Rien ici ne décrit le marché."
          : `${portfolio.transactions.length} transactions sur ${Object.keys(portfolio.instruments).length} lignes, enregistrées sur cet appareil, sans compte. Revoir la démo ne touche pas à ton portefeuille.`}
      </p>
      <button
        type="button"
        onClick={() => {
          haptic(12);
          setMode(demo ? "real" : "demo");
          openSheet(null);
        }}
        className="touche mt-6 w-full rounded-full bg-white py-4 text-[15.5px] font-medium text-nuit"
      >
        {demo ? "Passer à mon vrai portefeuille" : "Revoir la démo"}
      </button>

      <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-6">
        <span className="repere">Tes données</span>
        <p className="text-[13.5px] text-brume">Elles ne quittent jamais ton téléphone. Exporte-les pour les garder à l&apos;abri ou les passer sur un autre appareil.</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void exportData()} disabled={portfolio.transactions.length === 0} className="touche verre rounded-full py-3 text-[14px] disabled:opacity-40">
            Exporter
          </button>
          <label className="touche verre cursor-pointer rounded-full py-3 text-center text-[14px]">
            Importer
            <input id="sauvegarde-fichier" type="file" accept=".json,application/json" className="sr-only" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
          </label>
        </div>
        {pending && (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[14px]">
              Remplacer ton portefeuille actuel ({portfolio.transactions.length} transactions) par cette sauvegarde ({pending.portfolio.transactions.length} transactions, du{" "}
              {new Intl.DateTimeFormat("fr-BE", { dateStyle: "long" }).format(new Date(pending.exportedAt))}) ?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPending(null)} className="touche rounded-full bg-white/10 py-2.5 text-[14px]">
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  restore(pending);
                  haptic(14);
                  openSheet(null);
                }}
                className="touche rounded-full bg-white py-2.5 text-[14px] font-medium text-nuit"
              >
                Remplacer
              </button>
            </div>
          </div>
        )}
        {message && <p className="text-[13.5px] text-brume">{message}</p>}
      </div>
    </Sheet>
  );
}

/** Les dépenses couvertes par les « morceaux de vie », et l'hypothèse de rendement. Utilisé en feuille et dans « Mon patrimoine ». */
export function ExpensesEditor({ onSaved }: { onSaved?: () => void }) {
  const { settings, saveSettings } = useAtlas();
  const [rows, setRows] = useState(() => settings.expenses.map((e) => ({ id: e.id, label: e.label, monthly: String(e.monthly).replace(".", ",") })));
  const [rate, setRate] = useState(settings.expectedReturn);
  const [saved, setSaved] = useState(false);

  const expenses: Expense[] = rows
    .map((r) => ({ id: r.id, label: r.label.trim(), monthly: parseNumber(r.monthly) ?? 0 }))
    .filter((e) => e.label && e.monthly > 0);
  const total = expenses.reduce((s, e) => s + e.monthly, 0);

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_110px_36px] items-center gap-2">
            <TextInput id={`depense-nom-${r.id}`} aria-label="Dépense" value={r.label} placeholder="Loyer" onChange={(e) => (setSaved(false), setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x))))} />
            <TextInput id={`depense-montant-${r.id}`} aria-label="Montant mensuel en euros" inputMode="decimal" value={r.monthly} placeholder="950" onChange={(e) => (setSaved(false), setRows(rows.map((x, j) => (j === i ? { ...x, monthly: e.target.value } : x))))} />
            <button type="button" aria-label={`Retirer ${r.label || "cette dépense"}`} onClick={() => setRows(rows.filter((_, j) => j !== i))} className="touche h-9 w-9 rounded-full text-[20px] text-ombre hover:text-craie">
              ×
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setRows([...rows, { id: newId("d"), label: "", monthly: "" }])} className="touche self-start rounded-full bg-white/[0.07] px-4 py-2 text-[14px]">
        Ajouter une dépense
      </button>
      <Field label={`Rendement attendu : ${formatPct(rate, { decimals: 1 })} par an`} hint="Une hypothèse, pas une promesse : le rendement réel varie fortement d'une année à l'autre.">
        <input id="rendement-attendu" type="range" min={0.01} max={0.08} step={0.005} value={rate} onChange={(e) => (setSaved(false), setRate(Number(e.target.value)))} className="w-full accent-white" />
      </Field>
      <p className="text-[13.5px] text-brume">Total : {formatEUR(total)} par mois.</p>
      <PrimaryButton
        onClick={() => {
          saveSettings({ expenses: [...expenses].sort((a, b) => a.monthly - b.monthly), expectedReturn: rate });
          haptic(12);
          setSaved(true);
          onSaved?.();
        }}
      >
        {saved ? "Enregistré" : "Enregistrer"}
      </PrimaryButton>
    </div>
  );
}

export function ExpensesSheet() {
  const { sheet, openSheet } = useAtlas();
  return (
    <Sheet open={sheet === "expenses"} onClose={() => openSheet(null)} title="Morceaux de vie">
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="font-serif text-[28px] leading-tight">Tes morceaux de vie</h2>
          <p className="mt-2 text-[14.5px] text-brume">{EXPENSES_EXPLAINED}</p>
        </div>
        <ExpensesEditor onSaved={() => openSheet(null)} />
      </div>
    </Sheet>
  );
}

export const EXPENSES_EXPLAINED =
  "Tes dépenses ne sont pas déduites de ton patrimoine. Elles servent de repère : chaque mois, ton patrimoine peut « rapporter » environ son montant × le rendement attendu ÷ 12. Atlas regarde quelles dépenses ce revenu couvrirait, de la plus petite à la plus grosse, et à quel patrimoine la suivante serait couverte.";
