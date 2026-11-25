"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

/** Champ de formulaire sur fond de verre, avec étiquette au-dessus et aide en dessous. */
export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="repere">{label}</span>
      {children}
      {error ? <span className="text-[12.5px] text-braise">{error}</span> : hint ? <span className="text-[12.5px] text-ombre">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full min-w-0 rounded-2xl border border-voile/10 bg-voile/[0.05] px-4 py-3 text-[16px] text-craie placeholder:text-ombre focus:border-voile/25 focus:bg-voile/[0.08] focus:outline-none tabular";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

/** Interrupteur à deux ou trois choix, avec repère glissant. */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex rounded-full border border-voile/10 bg-voile/[0.04] p-1" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`touche flex-1 rounded-full py-2 text-[14px] ${o.value === value ? "bg-voile/[0.12] text-craie" : "text-brume"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PrimaryButton({ children, disabled, onClick, type = "button" }: { children: ReactNode; disabled?: boolean; onClick?: () => void; type?: "button" | "submit" }) {
  return (
    <button type={type} disabled={disabled} onClick={onClick} className="touche w-full rounded-full bg-craie py-4 text-[15.5px] font-medium text-nuit disabled:opacity-40">
      {children}
    </button>
  );
}

export const TYPE_LABELS = { stock: "Action", etf: "ETF", fund: "Fonds" } as const;
