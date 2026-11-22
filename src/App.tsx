import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHUD } from './components/GameHUD';
import { MenuOverlays } from './components/MenuOverlays';
import { RacingEngine } from './game/RacingEngine';
import {
  BEST_SCORE_STORAGE_KEY,
  HIGHWAY_LENGTH_METERS,
  type GamePhase,
  type InputState,
  type TelemetryData,
} from './game/types';

function readInitialBestScore(): number {
  try {
    const raw = window.localStorage.getItem(BEST_SCORE_STORAGE_KEY);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RacingEngine | null>(null);

  const [phase, setPhase] = useState<GamePhase>('menu');
  const phaseRef = useRef<GamePhase>('menu');

  const [muted, setMuted] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  const [input, setInput] = useState<InputState>({
    left: false,
    right: false,
    accelerate: false,
    brake: false,
  });

  const [telemetry, setTelemetry] = useState<TelemetryData>(() => ({
    score: 0,
    bestScore: readInitialBestScore(),
    speedKmh: 0,
    distanceMeters: 0,
    totalMeters: HIGHWAY_LENGTH_METERS,
    gear: 1,
    rpmRatio: 0.14,
    nearMissCount: 0,
    crashReason: '',
    isNewBest: false,
  }));

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new RacingEngine(container, {
      onPhaseChange: (nextPhase) => {
        phaseRef.current = nextPhase;
        setPhase(nextPhase);
        if (nextPhase !== 'playing') {
          setInput({ left: false, right: false, accelerate: false, brake: false });
        }
      },
      onTelemetry: (data) => {
        setTelemetry(data);
      },
      onContextLost: (lost) => {
        setContextLost(lost);
      },
    });

    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const updateControl = useCallback((key: keyof InputState, pressed: boolean) => {
    engineRef.current?.setInput({ [key]: pressed });
    setInput((prev) => (prev[key] === pressed ? prev : { ...prev, [key]: pressed }));
  }, []);

  const handleStart = useCallback(() => {
    engineRef.current?.startGame();
  }, []);

  const handleRestart = useCallback(() => {
    engineRef.current?.restartGame();
  }, []);

  const handleMainMenu = useCallback(() => {
    engineRef.current?.returnToMenu();
  }, []);

  const handleTogglePause = useCallback(() => {
    engineRef.current?.togglePause();
  }, []);

  const handleToggleMute = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.audio.init();
    const nextMuted = !engine.audio.isMuted();
    engine.audio.setMuted(nextMuted);
    setMuted(nextMuted);
  }, []);

  // Keyboard support for desktop play
  useEffect(() => {
    const mapKey = (code: string): keyof InputState | null => {
      switch (code) {
        case 'ArrowLeft':
        case 'KeyA':
          return 'left';
        case 'ArrowRight':
        case 'KeyD':
          return 'right';
        case 'ArrowUp':
        case 'KeyW':
          return 'accelerate';
        case 'ArrowDown':
        case 'KeyS':
        case 'Space':
          return 'brake';
        default:
          return null;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (phaseRef.current === 'playing' || phaseRef.current === 'paused') {
          e.preventDefault();
          engineRef.current?.togglePause();
        }
        return;
      }

      if (e.code === 'Enter') {
        if (phaseRef.current === 'menu') {
          e.preventDefault();
          engineRef.current?.startGame();
        } else if (phaseRef.current === 'gameover' || phaseRef.current === 'victory') {
          e.preventDefault();
          engineRef.current?.restartGame();
        }
        return;
      }

      const control = mapKey(e.code);
      if (control && phaseRef.current === 'playing') {
        e.preventDefault();
        updateControl(control, true);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const control = mapKey(e.code);
      if (control) {
        updateControl(control, false);
      }
    };

    const onBlur = () => {
      engineRef.current?.setInput({ left: false, right: false, accelerate: false, brake: false });
      setInput({ left: false, right: false, accelerate: false, brake: false });
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [updateControl]);

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#090b10]">
      {/* Dedicated isolated WebGL canvas container */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Top Score/Best Score & Bottom Speedometer + Mobile Touch Controls */}
      <GameHUD
        phase={phase}
        telemetry={telemetry}
        input={input}
        muted={muted}
        onControlChange={updateControl}
        onToggleMute={handleToggleMute}
        onTogglePause={handleTogglePause}
      />

      {/* Main Menu, Pause, Game Over & Victory Overlays */}
      <MenuOverlays
        phase={phase}
        telemetry={telemetry}
        contextLost={contextLost}
        onStart={handleStart}
        onRestart={handleRestart}
        onResume={handleTogglePause}
        onMainMenu={handleMainMenu}
      />
    </main>
  );
}
