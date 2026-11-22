"use client";

import { useEffect, useState } from "react";
import { Field, PrimaryButton, TextInput } from "@/components/ui/fields";
import { parseNumber } from "@/lib/csv";
import type { Expense } from "@/lib/domain/types";
import { formatEUR, formatPct } from "@/lib/format";
import { useAtlas } from "@/lib/store";
import { haptic } from "@/lib/ui";
import { makeBackup, newId, readBackup, type Backup } from "@/lib/user-data";
import { Sheet } from "./Sheet";

function SoonTag({ phase }: { phase: number }) {
  return <span className="repere rounded-full border border-white/10 px-2 py-1 !text-[10px]">Phase {phase}</span>;
}

const QUESTIONS = [
  "Combien je gagne vraiment par an ?",
  "Quelle part de mon argent est en dollars ?",
  "Quel est mon plus gros angle mort ?",
  "Pourquoi j'ai perdu de l'argent hier ?",
];

export function ChatSheet() {
  const { sheet, openSheet } = useAtlas();
  return (
    <Sheet open={sheet === "chat"} onClose={() => openSheet(null)} title="Demande à ton patrimoine">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-[28px] leading-tight">Demande à ton patrimoine</h2>
        <SoonTag phase={5} />
      </div>
      <p className="mt-2 text-[15px] text-brume">
        Des réponses en français simple, calculées à partir de tes vrais chiffres. Il explique, il ne te dira jamais quoi acheter ou vendre.
      </p>
      <ul className="mt-6 flex flex-col gap-2">
        {QUESTIONS.map((q) => (
          <li key={q} className="rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14.5px] text-brume">
            {q}
          </li>
        ))}
      </ul>
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

/** Les dépenses couvertes par les « morceaux de vie », et l'hypothèse de rendement. */
export function ExpensesSheet() {
  const { sheet, openSheet, settings, saveSettings } = useAtlas();
  const open = sheet === "expenses";
  const [rows, setRows] = useState<{ id: string; label: string; monthly: string }[]>([]);
  const [rate, setRate] = useState(0.05);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- on part des réglages enregistrés à chaque ouverture
    setRows(settings.expenses.map((e) => ({ id: e.id, label: e.label, monthly: String(e.monthly).replace(".", ",") })));
    setRate(settings.expectedReturn);
  }, [open, settings]);

  const expenses: Expense[] = rows
    .map((r) => ({ id: r.id, label: r.label.trim(), monthly: parseNumber(r.monthly) ?? 0 }))
    .filter((e) => e.label && e.monthly > 0);
  const total = expenses.reduce((s, e) => s + e.monthly, 0);

  return (
    <Sheet open={open} onClose={() => openSheet(null)} title="Morceaux de vie">
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="font-serif text-[28px] leading-tight">Tes morceaux de vie</h2>
          <p className="mt-2 text-[14.5px] text-brume">Quelques dépenses mensuelles, de la plus petite à la plus grosse. Atlas les couvre dans cet ordre avec le rendement attendu de ton patrimoine.</p>
        </div>
        <ul className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_110px_36px] items-center gap-2">
              <TextInput id={`depense-nom-${r.id}`} aria-label="Dépense" value={r.label} placeholder="Loyer" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <TextInput id={`depense-montant-${r.id}`} aria-label="Montant mensuel en euros" inputMode="decimal" value={r.monthly} placeholder="950" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, monthly: e.target.value } : x)))} />
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
          <input id="rendement-attendu" type="range" min={0.01} max={0.08} step={0.005} value={rate} onChange={(e) => setRate(Number(e.target.value))} className="w-full accent-white" />
        </Field>
        <p className="text-[13.5px] text-brume">Total : {formatEUR(total)} par mois.</p>
        <PrimaryButton
          onClick={() => {
            saveSettings({ expenses: [...expenses].sort((a, b) => a.monthly - b.monthly), expectedReturn: rate });
            haptic(12);
            openSheet(null);
          }}
        >
          Enregistrer
        </PrimaryButton>
      </div>
    </Sheet>
  );
}
