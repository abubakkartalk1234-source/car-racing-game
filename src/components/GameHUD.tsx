import React from 'react';
import { ChevronLeft, ChevronRight, Pause, Volume2, VolumeX } from 'lucide-react';
import type { GamePhase, InputState, TelemetryData } from '../game/types';
import { Speedometer } from './Speedometer';

interface GameHUDProps {
  phase: GamePhase;
  telemetry: TelemetryData;
  input: InputState;
  muted: boolean;
  onControlChange: (key: keyof InputState, pressed: boolean) => void;
  onToggleMute: () => void;
  onTogglePause: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  phase,
  telemetry,
  input,
  muted,
  onControlChange,
  onToggleMute,
  onTogglePause,
}) => {
  const distKm = (telemetry.distanceMeters / 1000).toFixed(2);
  const totalKm = (telemetry.totalMeters / 1000).toFixed(0);
  const progressPct = Math.min(100, (telemetry.distanceMeters / telemetry.totalMeters) * 100);

  const bindTouchHold = (key: keyof InputState) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture unsupported
      }
      onControlChange(key, true);
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      onControlChange(key, false);
    },
    onPointerCancel: () => onControlChange(key, false),
    onLostPointerCapture: () => onControlChange(key, false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-3 sm:p-5">
      {/* Top Bar: SCORE, BEST SCORE, Distance Progress, Sound & Pause */}
      <header className="w-full max-w-5xl mx-auto flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 bg-[#0a0d14]/85 border border-white/12 rounded-xl px-3.5 py-2.5 sm:px-5 sm:py-3">
          {/* Score & Best Score */}
          <div className="flex items-center gap-5 sm:gap-8">
            <div className="flex flex-col">
              <span className="text-[10px] sm:text-xs font-display font-semibold tracking-wider text-neutral-400">
                SCORE
              </span>
              <span className="font-mono-tabular text-lg sm:text-2xl font-bold text-white leading-tight">
                {telemetry.score.toLocaleString()}
              </span>
            </div>

            <div className="h-7 w-px bg-white/12" aria-hidden="true" />

            <div className="flex flex-col">
              <span className="text-[10px] sm:text-xs font-display font-semibold tracking-wider text-amber-400">
                BEST SCORE
              </span>
              <span className="font-mono-tabular text-lg sm:text-2xl font-bold text-amber-300 leading-tight">
                {telemetry.bestScore.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Highway 10 KM Progress (desktop inline) */}
          {phase !== 'menu' && (
            <div className="hidden md:flex flex-col flex-1 max-w-xs mx-4">
              <div className="flex items-center justify-between text-xs font-mono-tabular text-neutral-300 mb-1">
                <span>DISTANCE</span>
                <span>
                  {distKm} / {totalKm}.00 KM
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-[width] duration-100"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pointer-events-auto shrink-0">
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'Unmute engine audio' : 'Mute engine audio'}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-white/8 hover:bg-white/16 border border-white/12 text-white transition-colors cursor-pointer"
            >
              {muted ? <VolumeX className="w-5 h-5 text-neutral-400" /> : <Volume2 className="w-5 h-5 text-amber-400" />}
            </button>

            {(phase === 'playing' || phase === 'paused') && (
              <button
                type="button"
                onClick={onTogglePause}
                aria-label={phase === 'paused' ? 'Resume race' : 'Pause race'}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-white/8 hover:bg-white/16 border border-white/12 text-white transition-colors cursor-pointer"
              >
                <Pause className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Mobile compact 10 KM distance bar */}
        {phase !== 'menu' && (
          <div className="md:hidden flex items-center gap-3 bg-[#0a0d14]/80 border border-white/10 rounded-lg px-3 py-1.5">
            <span className="text-[11px] font-mono-tabular text-neutral-300 whitespace-nowrap">
              {distKm} / {totalKm} KM
            </span>
            <div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-amber-400"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </header>

      {/* Bottom Controls & Speedometer (visible during active gameplay) */}
      {phase === 'playing' && (
        <div className="w-full max-w-6xl mx-auto flex items-end justify-between gap-2 pb-1 sm:pb-2">
          {/* Left & Right Steering Controls */}
          <div className="flex items-center gap-2.5 sm:gap-3 pointer-events-auto">
            <button
              type="button"
              aria-label="Steer Left"
              {...bindTouchHold('left')}
              className={`touch-control flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border transition-transform active:scale-95 cursor-pointer ${
                input.left
                  ? 'bg-amber-400 text-neutral-950 border-amber-300'
                  : 'bg-[#0a0d14]/85 text-white border-white/18 hover:bg-[#141926]'
              }`}
            >
              <ChevronLeft className="w-9 h-9 sm:w-10 sm:h-10 stroke-[2.5]" />
            </button>

            <button
              type="button"
              aria-label="Steer Right"
              {...bindTouchHold('right')}
              className={`touch-control flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border transition-transform active:scale-95 cursor-pointer ${
                input.right
                  ? 'bg-amber-400 text-neutral-950 border-amber-300'
                  : 'bg-[#0a0d14]/85 text-white border-white/18 hover:bg-[#141926]'
              }`}
            >
              <ChevronRight className="w-9 h-9 sm:w-10 sm:h-10 stroke-[2.5]" />
            </button>
          </div>

          {/* Center Speedometer (0-200 KM/H) */}
          <div className="flex flex-col items-center">
            <Speedometer
              speedKmh={telemetry.speedKmh}
              gear={telemetry.gear}
              rpmRatio={telemetry.rpmRatio}
            />
          </div>

          {/* Brake & Accelerate Pedals */}
          <div className="flex items-end gap-2.5 sm:gap-3 pointer-events-auto">
            <button
              type="button"
              aria-label="Brake"
              {...bindTouchHold('brake')}
              className={`touch-control flex flex-col items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border font-display font-bold text-xs sm:text-sm tracking-wider transition-transform active:scale-95 cursor-pointer ${
                input.brake
                  ? 'bg-red-500 text-white border-red-400'
                  : 'bg-[#0a0d14]/85 text-red-400 border-red-500/35 hover:bg-red-950/50'
              }`}
            >
              <span>BRAKE</span>
            </button>

            <button
              type="button"
              aria-label="Accelerate"
              {...bindTouchHold('accelerate')}
              className={`touch-control flex flex-col items-center justify-center w-18 h-20 sm:w-22 sm:h-24 rounded-2xl border font-display font-bold text-xs sm:text-sm tracking-wider transition-transform active:scale-95 cursor-pointer ${
                input.accelerate
                  ? 'bg-amber-400 text-neutral-950 border-amber-300'
                  : 'bg-[#0a0d14]/85 text-amber-400 border-amber-400/45 hover:bg-amber-500/15'
              }`}
            >
              <span>GAS</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
