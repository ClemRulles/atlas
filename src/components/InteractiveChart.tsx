'use client';

import React, { useState } from 'react';

interface SeriesPoint {
  date: string;
  valueEur: number;
}

interface InteractiveChartProps {
  data: SeriesPoint[];
  onHoverPoint?: (point: SeriesPoint | null) => void;
}

export default function InteractiveChart({ data, onHoverPoint }: InteractiveChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="h-44 rounded-2xl bg-white dark:bg-[#131823] border border-slate-200/70 dark:border-slate-800/80 flex items-center justify-center text-sm text-slate-400">
        Aucune donnée de courbe disponible
      </div>
    );
  }

  const width = 400;
  const height = 160;
  const padX = 8;
  const padY = 14;

  const values = data.map((d) => d.valueEur);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const span = maxVal - minVal || 1;

  const firstVal = values[0];
  const lastVal = values[values.length - 1];
  const isPositive = lastVal >= firstVal;
  const strokeColor = isPositive ? '#10B981' : '#F43F5E';

  const coords = data.map((pt, idx) => {
    const x =
      data.length === 1
        ? width / 2
        : padX + (idx / (data.length - 1)) * (width - padX * 2);
    const y =
      height - padY - ((pt.valueEur - minVal) / span) * (height - padY * 2);
    return { x, y, pt };
  });

  const linePath = coords
    .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${height} L ${coords[0].x.toFixed(1)} ${height} Z`;

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const idx = Math.min(data.length - 1, Math.round(relX * (data.length - 1)));
    setActiveIndex(idx);
    onHoverPoint?.(data[idx]);
  };

  const handlePointerLeave = () => {
    setActiveIndex(null);
    onHoverPoint?.(null);
  };

  const activeCoord = activeIndex !== null ? coords[activeIndex] : null;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-44 touch-none overflow-visible"
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerMove}
        onPointerUp={handlePointerLeave}
        onPointerLeave={handlePointerLeave}
      >
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        <path d={areaPath} fill="url(#areaGrad)" />
        <path
          d={linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {activeCoord && (
          <g>
            <line
              x1={activeCoord.x}
              y1={4}
              x2={activeCoord.x}
              y2={height}
              stroke={strokeColor}
              strokeWidth="1.2"
              strokeDasharray="3 3"
            />
            <circle
              cx={activeCoord.x}
              cy={activeCoord.y}
              r="5"
              fill={strokeColor}
              stroke="#FFFFFF"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>
    </div>
  );
}
