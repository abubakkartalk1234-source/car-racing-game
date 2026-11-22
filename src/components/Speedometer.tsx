import React from 'react';
import { MAX_SPEED_KMH } from '../game/types';

interface SpeedometerProps {
  speedKmh: number;
  gear: number;
  rpmRatio: number;
}

export const Speedometer: React.FC<SpeedometerProps> = ({ speedKmh, gear, rpmRatio }) => {
  const clampedSpeed = Math.max(0, Math.min(MAX_SPEED_KMH, speedKmh));
  const speedRatio = clampedSpeed / MAX_SPEED_KMH;

  // 240-degree sweep gauge (-210deg to +30deg)
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const arcFraction = 240 / 360;
  const totalArcLength = circumference * arcFraction;
  const filledArcLength = totalArcLength * speedRatio;

  const isRedline = speedKmh >= 175;

  return (
    <div
      className="relative flex flex-col items-center justify-center w-[132px] h-[112px] sm:w-[152px] sm:h-[126px] rounded-2xl bg-[#0a0d14]/88 border border-white/12 px-3 py-2 pointer-events-none select-none"
      aria-label={`Speed ${clampedSpeed} kilometers per hour, Gear ${gear}`}
    >
      <svg
        viewBox="0 0 130 108"
        className="w-full h-full overflow-visible"
      >
        <defs>
          <linearGradient id="speedArcGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#eab308" />
            <stop offset="70%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>

        {/* Background gauge track */}
        <circle
          cx="65"
          cy="62"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${totalArcLength} ${circumference}`}
          transform="rotate(150 65 62)"
        />

        {/* Active speed fill */}
        <circle
          cx="65"
          cy="62"
          r={radius}
          fill="none"
          stroke={isRedline ? '#ef4444' : 'url(#speedArcGrad)'}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${filledArcLength} ${circumference}`}
          transform="rotate(150 65 62)"
        />

        {/* Tick marks (0, 50, 100, 150, 200) */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const deg = 150 + t * 240;
          const rad = (deg * Math.PI) / 180;
          const x1 = 65 + Math.cos(rad) * 41;
          const y1 = 62 + Math.sin(rad) * 41;
          const x2 = 65 + Math.cos(rad) * 46;
          const y2 = 62 + Math.sin(rad) * 46;
          return (
            <line
              key={t}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={t >= 0.75 ? 'rgba(239,68,68,0.85)' : 'rgba(255,255,255,0.45)'}
              strokeWidth="2"
              strokeLinecap="round"
            />
          );
        })}

        {/* RPM thin inner bar */}
        <circle
          cx="65"
          cy="62"
          r={38}
          fill="none"
          stroke="rgba(250,204,21,0.55)"
          strokeWidth="2.5"
          strokeDasharray={`${circumference * (38 / radius) * arcFraction * rpmRatio} ${circumference}`}
          transform="rotate(150 65 62)"
        />
      </svg>

      {/* Center Digital Readout */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-3">
        <span
          className={`font-mono-tabular text-2xl sm:text-3xl font-bold leading-none tracking-tight ${
            isRedline ? 'text-red-400' : 'text-white'
          }`}
        >
          {clampedSpeed}
        </span>
        <span className="text-[10px] font-display font-semibold tracking-wider text-neutral-400 mt-0.5">
          KM/H
        </span>
        <div className="flex items-center gap-1.5 mt-1 text-[10px] font-mono-tabular text-amber-400">
          <span>G{gear}</span>
          <span className="text-neutral-500">/</span>
          <span className="text-neutral-400">200</span>
        </div>
      </div>
    </div>
  );
};
