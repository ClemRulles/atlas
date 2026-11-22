'use client';

import React from 'react';
import { CATEGORY_COLORS } from '@/data/initialPortfolio';

interface SliceItem {
  label: string;
  valueEur: number;
}

interface DonutAllocationProps {
  slices: SliceItem[];
}

export default function DonutAllocation({ slices }: DonutAllocationProps) {
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.valueEur), 0);
  if (total <= 0) {
    return (
      <div className="py-8 text-center text-sm text-slate-400">
        Ajoutez des actifs pour voir la répartition.
      </div>
    );
  }

  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  let offsetAcc = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 150 150" className="w-full h-full -rotate-90">
          <circle
            cx="75"
            cy="75"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="16"
            className="text-slate-200 dark:text-slate-800"
          />
          {slices.map((s) => {
            const pct = s.valueEur / total;
            const dash = pct * circumference;
            const strokeDasharray = `${dash} ${circumference}`;
            const strokeDashoffset = -offsetAcc;
            offsetAcc += dash;
            const color = CATEGORY_COLORS[s.label] || '#6366F1';

            return (
              <circle
                key={s.label}
                cx="75"
                cy="75"
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth="16"
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="butt"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="text-[11px] text-slate-400">Total</span>
          <span className="text-xs font-bold">
            {total.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
          </span>
        </div>
      </div>

      <div className="flex-1 w-full space-y-2">
        {slices.map((s) => {
          const pct = ((s.valueEur / total) * 100).toFixed(1);
          const color = CATEGORY_COLORS[s.label] || '#6366F1';
          return (
            <div key={s.label} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="font-medium">{s.label}</span>
              </div>
              <div className="text-right">
                <span className="font-semibold">
                  {s.valueEur.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
                </span>
                <span className="text-slate-400 ml-1.5">({pct}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
