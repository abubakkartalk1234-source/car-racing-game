import React from 'react';
import { Flag, Play, RotateCcw, Trophy } from 'lucide-react';
import type { GamePhase, TelemetryData } from '../game/types';

interface MenuOverlaysProps {
  phase: GamePhase;
  telemetry: TelemetryData;
  contextLost: boolean;
  onStart: () => void;
  onRestart: () => void;
  onResume: () => void;
  onMainMenu: () => void;
}

export const MenuOverlays: React.FC<MenuOverlaysProps> = ({
  phase,
  telemetry,
  contextLost,
  onStart,
  onRestart,
  onResume,
  onMainMenu,
}) => {
  if (contextLost) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-neutral-950/90 p-6">
        <div className="max-w-sm w-full rounded-2xl bg-[#111520] border border-white/12 p-6 text-center">
          <h2 className="font-display text-xl font-bold text-white mb-2">Graphics Context Paused</h2>
          <p className="text-sm text-neutral-300 mb-4">
            The 3D graphics context was interrupted by the browser. Reload or tap below to restore.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full py-3 px-6 rounded-xl bg-amber-400 text-neutral-950 font-display font-bold tracking-wide cursor-pointer"
          >
            Reload Game
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'menu') {
    return (
      <div className="fixed inset-0 z-10 pointer-events-none flex flex-col items-center justify-end pb-10 sm:pb-14 px-4">
        <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-[#0a0d14]/88 border border-white/14 p-6 sm:p-7 text-center shadow-2xl">
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white">
            LAMBORGHINI <span className="text-amber-400">CAR GAME</span>
          </h1>
          <p className="text-xs sm:text-sm text-neutral-300 mt-1.5">
            10 Kilometer Highway · 200 KM/H Top Speed · Dodge Traffic &amp; Hazards
          </p>

          <button
            type="button"
            onClick={onStart}
            className="mt-5 w-full py-4 px-8 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-[0.98] text-neutral-950 font-display text-lg sm:text-xl font-bold tracking-wider flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-lg shadow-amber-500/20"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>TAP TO PLAY</span>
          </button>

          <div className="mt-4 pt-3.5 border-t border-white/10 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-neutral-400">
            <span>Touch: On-screen Pedals &amp; Arrows</span>
            <span aria-hidden="true">·</span>
            <span>Keys: W/↑ Gas · S/↓ Brake · A/D Steer</span>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'paused') {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/65 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-[#0c1018] border border-white/14 p-6 text-center">
          <h2 className="font-display text-2xl font-bold text-white tracking-wide">RACE PAUSED</h2>
          <p className="text-sm text-neutral-400 mt-1 font-mono-tabular">
            {(telemetry.distanceMeters / 1000).toFixed(2)} / 10.00 KM · {telemetry.score.toLocaleString()} PTS
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={onResume}
              className="w-full py-3.5 px-6 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-display font-bold tracking-wide cursor-pointer transition-colors"
            >
              RESUME RACE
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="w-full py-3 px-6 rounded-xl bg-white/10 hover:bg-white/16 text-white font-display font-semibold tracking-wide cursor-pointer transition-colors"
            >
              RESTART
            </button>
            <button
              type="button"
              onClick={onMainMenu}
              className="w-full py-3 px-6 rounded-xl bg-transparent hover:bg-white/8 border border-white/12 text-neutral-300 font-display font-semibold tracking-wide cursor-pointer transition-colors"
            >
              MAIN MENU
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'gameover') {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
        <div className="w-full max-w-md rounded-2xl bg-[#0c1018] border border-red-500/30 p-6 sm:p-7 text-center">
          <h2 className="font-display text-3xl font-bold text-red-400 tracking-wide">GAME OVER</h2>
          <p className="text-sm text-neutral-300 mt-1">{telemetry.crashReason || 'Collision detected'}</p>

          {telemetry.isNewBest && telemetry.score > 0 && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-display font-bold tracking-wider text-amber-300">
              <Trophy className="w-4 h-4" />
              <span>NEW BEST SCORE</span>
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3 text-left bg-white/5 border border-white/8 rounded-xl p-4">
            <div>
              <div className="text-[11px] font-display text-neutral-400">FINAL SCORE</div>
              <div className="font-mono-tabular text-xl font-bold text-white">
                {telemetry.score.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-display text-amber-400">BEST SCORE</div>
              <div className="font-mono-tabular text-xl font-bold text-amber-300">
                {telemetry.bestScore.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-display text-neutral-400">DISTANCE</div>
              <div className="font-mono-tabular text-base font-semibold text-neutral-100">
                {(telemetry.distanceMeters / 1000).toFixed(2)} / 10.00 KM
              </div>
            </div>
            <div>
              <div className="text-[11px] font-display text-neutral-400">NEAR MISSES</div>
              <div className="font-mono-tabular text-base font-semibold text-neutral-100">
                {telemetry.nearMissCount}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onRestart}
              className="flex-1 py-3.5 px-6 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-display font-bold tracking-wide flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>RESTART</span>
            </button>
            <button
              type="button"
              onClick={onMainMenu}
              className="flex-1 py-3.5 px-6 rounded-xl bg-white/10 hover:bg-white/16 text-white font-display font-semibold tracking-wide cursor-pointer transition-colors"
            >
              MAIN MENU
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'victory') {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
        <div className="w-full max-w-md rounded-2xl bg-[#0c1018] border border-amber-400/40 p-6 sm:p-7 text-center">
          <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-amber-400/15 flex items-center justify-center text-amber-400">
            <Flag className="w-6 h-6" />
          </div>
          <h2 className="font-display text-3xl font-bold text-amber-400 tracking-wide">
            10 KM COMPLETE
          </h2>
          <p className="text-sm text-neutral-300 mt-1">
            You conquered the 10-kilometer highway (+5,000 Finish Bonus).
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 text-left bg-white/5 border border-white/8 rounded-xl p-4">
            <div>
              <div className="text-[11px] font-display text-neutral-400">FINAL SCORE</div>
              <div className="font-mono-tabular text-xl font-bold text-white">
                {telemetry.score.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-display text-amber-400">BEST SCORE</div>
              <div className="font-mono-tabular text-xl font-bold text-amber-300">
                {telemetry.bestScore.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-display text-neutral-400">DISTANCE</div>
              <div className="font-mono-tabular text-base font-semibold text-neutral-100">
                10.00 / 10.00 KM
              </div>
            </div>
            <div>
              <div className="text-[11px] font-display text-neutral-400">NEAR MISSES</div>
              <div className="font-mono-tabular text-base font-semibold text-neutral-100">
                {telemetry.nearMissCount}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onRestart}
              className="flex-1 py-3.5 px-6 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-display font-bold tracking-wide flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>RACE AGAIN</span>
            </button>
            <button
              type="button"
              onClick={onMainMenu}
              className="flex-1 py-3.5 px-6 rounded-xl bg-white/10 hover:bg-white/16 text-white font-display font-semibold tracking-wide cursor-pointer transition-colors"
            >
              MAIN MENU
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
