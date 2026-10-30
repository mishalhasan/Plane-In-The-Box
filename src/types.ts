import * as THREE from 'three';

export type ExperiencePhase =
  | 'IDLE_WINDING'
  | 'ANTICIPATION_POP'
  | 'AEROBATIC_LAUNCH'
  | 'SKYWRITING'
  | 'FINAL_FLYBY'
  | 'SETTLED_END';

export type FinaleVariant = 'oryx' | 'classic';

export interface FlightSegment {
  /** Smooth 3D curve for this segment */
  curve: THREE.Curve<THREE.Vector3>;
  /** Duration in seconds to traverse this segment */
  duration: number;
  /** Whether smoke skywriting emitter is active on this segment */
  emitSmoke: boolean;
  /** Whether emitted smoke persists permanently (true for lettering/emblem, false for playful contrails) */
  persistentSmoke: boolean;
  /** Optional stroke ID so persistent ribbon meshes group cleanly per stroke */
  strokeId: number;
  /** Optional roll bias or wing-wave modulation */
  wingWave?: boolean;
  /** Human-readable label for debugging/telemetry */
  label: string;
}

export interface FlightSample {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  rollAngle: number;
  emitSmoke: boolean;
  persistentSmoke: boolean;
  strokeId: number;
  speed: number;
  label: string;
  normalizedProgress: number;
}

export interface Choreographer {
  readonly launchSegments: FlightSegment[];
  readonly skywritingSegments: FlightSegment[];
  readonly flybySegments: FlightSegment[];
  readonly launchDuration: number;
  readonly skywritingDuration: number;
  readonly flybyDuration: number;
  readonly totalSkywritingStrokes: number;
  resetRoll(): void;
  sampleSequence(segments: FlightSegment[], timeSec: number, dt: number): FlightSample;
  emitWindowStrokes(
    segments: FlightSegment[],
    tStart: number,
    tEnd: number,
    emitStep: (pos: THREE.Vector3, emitActive: boolean, persistent: boolean, strokeId: number) => void
  ): void;
}

export interface AppDebugAPI {
  getState: () => {
    variant: FinaleVariant;
    phase: ExperiencePhase;
    windProgress: number;
    crankAngle: number;
    lidOpenAngle: number;
    airplaneVisible: boolean;
    airplanePosition: [number, number, number];
    activeSmokePuffs: number;
    completedStrokes: number;
    totalSkywritingStrokes: number;
    emblemRevealProgress: number;
    wordmarkRevealProgress: number;
    replayVisible: boolean;
    orbitYaw: number;
    orbitPitch: number;
    orbitZoom: number;
    cameraPosition: [number, number, number];
  };
  getDurations: () => {
    variant: FinaleVariant;
    anticipationPop: number;
    launchDuration: number;
    skywritingDuration: number;
    flybyDuration: number;
    launchToEmblemReveal: number;
    totalFlightDuration: number;
    totalPostWindDuration: number;
  };
  setVariant: (variant: FinaleVariant) => void;
  windBy: (deltaProgress: number) => void;
  fastForwardPhase: (seconds: number) => void;
  triggerReplay: () => void;
}

declare global {
  interface Window {
    __JACK_BOX_DEBUG__?: AppDebugAPI;
  }
}
