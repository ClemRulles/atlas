'use client';

import React, { useState } from 'react';

export interface SeriesPoint {
  date: string;
  valueEur: number;
}

export interface RangeSelection {
  start: SeriesPoint;
  end: SeriesPoint;
  diffEur: number;
  diffPercent: number;
}

interface InteractiveChartProps {
  data: SeriesPoint[];
  onHoverPoint?: (point: SeriesPoint | null) => void;
  onRangeSelect?: (range: RangeSelection | null) => void;
}

function formatShortDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [, month, day] = parts;
  const yearShort = parts[0].slice(2);
  return `${day}/${month}/${yearShort}`;
}

export default function InteractiveChart({
  data,
  onHoverPoint,
  onRangeSelect,
}: InteractiveChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [rangeIndices, setRangeIndices] = useState<[number, number] | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="h-44 rounded-2xl bg-white dark:bg-[#131823] border border-slate-200/70 dark:border-slate-800/80 flex items-center justify-center text-sm text-slate-400">
        Aucune donnée de courbe disponible
      </div>
    );
  }

  const width = 400;
  const height = 165;
  const padX = 8;
  const padY = 14;

  const values = data.map((d) => d.valueEur);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const span = maxVal - minVal || 1;

  const firstVal = values[0];
  const lastVal = values[values.length - 1];
  const defaultPositive = lastVal >= firstVal;

  const isRangePositive = rangeIndices
    ? data[rangeIndices[1]].valueEur >= data[rangeIndices[0]].valueEur
    : defaultPositive;

  const strokeColor = isRangePositive ? '#10B981' : '#F43F5E';

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

  const clientXToIndex = (clientX: number, rect: DOMRect) => {
    const relX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.min(data.length - 1, Math.round(relX * (data.length - 1)));
  };

  const handleTouchEvent = (e: React.TouchEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.touches.length >= 2) {
      const i1 = clientXToIndex(e.touches[0].clientX, rect);
      const i2 = clientXToIndex(e.touches[1].clientX, rect);
      const startIdx = Math.min(i1, i2);
      const endIdx = Math.max(i1, i2);
      setActiveIndex(null);
      setRangeIndices([startIdx, endIdx]);
      onHoverPoint?.(null);

      const startPt = data[startIdx];
      const endPt = data[endIdx];
      const diffEur = endPt.valueEur - startPt.valueEur;
      const diffPercent = startPt.valueEur > 0 ? (diffEur / startPt.valueEur) * 100 : 0;
      onRangeSelect?.({ start: startPt, end: endPt, diffEur, diffPercent });
    } else if (e.touches.length === 1) {
      const idx = clientXToIndex(e.touches[0].clientX, rect);
      setRangeIndices(null);
      setActiveIndex(idx);
      onRangeSelect?.(null);
      onHoverPoint?.(data[idx]);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 0) {
      setActiveIndex(null);
      setRangeIndices(null);
      onHoverPoint?.(null);
      onRangeSelect?.(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (rangeIndices) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const idx = clientXToIndex(e.clientX, rect);
    setActiveIndex(idx);
    onHoverPoint?.(data[idx]);
  };

  const handleMouseLeave = () => {
    setActiveIndex(null);
    setRangeIndices(null);
    onHoverPoint?.(null);
    onRangeSelect?.(null);
  };

  const activeCoord = activeIndex !== null ? coords[activeIndex] : null;
  const rangeStartCoord = rangeIndices ? coords[rangeIndices[0]] : null;
  const rangeEndCoord = rangeIndices ? coords[rangeIndices[1]] : null;

  const midIdx = Math.floor((data.length - 1) / 2);
  const startLabel = formatShortDate(data[0].date);
  const midLabel = formatShortDate(data[midIdx].date);
  const endLabel = formatShortDate(data[data.length - 1].date);

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-44 touch-none overflow-visible select-none"
        onTouchStart={handleTouchEvent}
        onTouchMove={handleTouchEvent}
        onTouchEnd={handleTouchEnd}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        <path d={areaPath} fill="url(#areaGrad)" />

        {rangeStartCoord && rangeEndCoord && (
          <rect
            x={rangeStartCoord.x}
            y={4}
            width={Math.max(2, rangeEndCoord.x - rangeStartCoord.x)}
            height={height - 4}
            fill={strokeColor}
            fillOpacity="0.14"
            rx="4"
          />
        )}

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

        {rangeStartCoord && rangeEndCoord && (
          <g>
            <line
              x1={rangeStartCoord.x}
              y1={4}
              x2={rangeStartCoord.x}
              y2={height}
              stroke={strokeColor}
              strokeWidth="1.4"
            />
            <circle
              cx={rangeStartCoord.x}
              cy={rangeStartCoord.y}
              r="5"
              fill={strokeColor}
              stroke="#FFFFFF"
              strokeWidth="2"
            />
            <line
              x1={rangeEndCoord.x}
              y1={4}
              x2={rangeEndCoord.x}
              y2={height}
              stroke={strokeColor}
              strokeWidth="1.4"
            />
            <circle
              cx={rangeEndCoord.x}
              cy={rangeEndCoord.y}
              r="5"
              fill={strokeColor}
              stroke="#FFFFFF"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>

      {/* Axe des abscisses (échelle de temps) */}
      <div className="mt-1 pt-1.5 border-t border-slate-100 dark:border-slate-800/70 flex items-center justify-between text-[10px] font-medium text-slate-400">
        <span>{startLabel}</span>
        <span>{activeIndex !== null ? formatShortDate(data[activeIndex].date) : midLabel}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}
