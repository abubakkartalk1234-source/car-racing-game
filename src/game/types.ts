export type GamePhase = 'menu' | 'playing' | 'paused' | 'gameover' | 'victory';

export interface InputState {
  left: boolean;
  right: boolean;
  accelerate: boolean;
  brake: boolean;
}

export interface TelemetryData {
  score: number;
  bestScore: number;
  speedKmh: number;
  distanceMeters: number;
  totalMeters: number;
  gear: number;
  rpmRatio: number;
  nearMissCount: number;
  crashReason: string;
  isNewBest: boolean;
}

export const HIGHWAY_LENGTH_METERS = 10000; // 10 kilometers
export const MAX_SPEED_KMH = 200;
export const BEST_SCORE_STORAGE_KEY = 'lamborghini_car_game_best_score_v1';
