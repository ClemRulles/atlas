"use client";

import { IconCamera, IconFile, IconSearch } from "@/components/ui/icons";
import { useAtlas } from "@/lib/store";
import { haptic } from "@/lib/ui";
import { Sheet } from "./Sheet";

function SoonTag({ phase }: { phase: number }) {
  return <span className="repere rounded-full border border-white/10 px-2 py-1 !text-[10px]">Phase {phase}</span>;
}

export function AddSheet() {
  const { sheet, openSheet } = useAtlas();
  const ways = [
    { Icon: IconSearch, title: "Rechercher", text: "Par nom, ticker ou ISIN, puis quantité, date et prix d'achat.", phase: 2 },
    { Icon: IconFile, title: "Importer un fichier CSV", text: "L'export de ton courtier, colonne par colonne.", phase: 2 },
    { Icon: IconCamera, title: "Capture d'écran", text: "Le texte est lu dans ton téléphone, tu valides chaque ligne.", phase: 5 },
  ];
  return (
    <Sheet open={sheet === "add"} onClose={() => openSheet(null)} title="Ajouter une position">
      <h2 className="font-serif text-[28px] leading-tight">Ajouter une position</h2>
      <p className="mt-2 text-[15px] text-brume">Trois façons d&apos;entrer ce que tu possèdes. Aucune connexion à ton courtier.</p>
      <ul className="mt-6 flex flex-col gap-2">
        {ways.map(({ Icon, title, text, phase }) => (
          <li key={title} className="flex items-start gap-4 rounded-[20px] border border-white/[0.07] bg-white/[0.03] p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/[0.07] text-brume">
              <Icon />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15.5px] font-medium">{title}</span>
                <SoonTag phase={phase} />
              </div>
              <p className="mt-1 text-[13.5px] leading-snug text-brume">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </Sheet>
  );
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
      <div className="mt-6 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-2 pr-2 pl-5 text-[15px] text-ombre">
        <span className="flex-1">Pose ta question…</span>
        <span className="rounded-full bg-white/10 px-4 py-2 text-[13px]">Bientôt</span>
      </div>
    </Sheet>
  );
}

export function ModeSheet() {
  const { sheet, openSheet, mode, setMode } = useAtlas();
  const demo = mode === "demo";
  return (
    <Sheet open={sheet === "mode"} onClose={() => openSheet(null)} title="Portefeuille affiché">
      <h2 className="font-serif text-[28px] leading-tight">{demo ? "Tu regardes un portefeuille fictif" : "Ton vrai portefeuille"}</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-brume">
        {demo
          ? "Un investisseur belge imaginaire, trois courtiers, neuf lignes. Les noms sont réels pour que tout parle, mais les cours, les achats et les compositions sont inventés. Rien ici ne décrit le marché."
          : "Tes positions restent sur ton téléphone, sans compte. Tu peux revoir la démo à tout moment : ton portefeuille ne sera pas touché."}
      </p>
      <button
        type="button"
        onClick={() => {
          haptic(12);
          setMode(demo ? "real" : "demo");
          openSheet(null);
        }}
        className="touche mt-7 w-full rounded-full bg-white py-4 text-[15.5px] font-medium text-nuit"
      >
        {demo ? "Passer à mon vrai portefeuille" : "Revoir la démo"}
      </button>
    </Sheet>
  );
}
