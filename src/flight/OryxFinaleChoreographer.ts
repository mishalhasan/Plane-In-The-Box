import * as THREE from 'three';
import { Choreographer, FlightSample, FlightSegment } from '../types';

export const ORYX_WORLD_CONFIG = {
  svgMinX: 219.50,
  svgMaxX: 295.58,
  svgMinY: 0.0,
  svgMaxY: 74.65,
  svgRefX: 254.5,
  worldScale: 0.0592,
  worldBottomY: 2.64,
  worldZ: -0.58
} as const;

export function oryxSvgToWorld(svgX: number, svgY: number, zOffset = 0): THREE.Vector3 {
  return new THREE.Vector3(
    (svgX - ORYX_WORLD_CONFIG.svgRefX) * ORYX_WORLD_CONFIG.worldScale,
    ORYX_WORLD_CONFIG.worldBottomY + (ORYX_WORLD_CONFIG.svgMaxY - svgY) * ORYX_WORLD_CONFIG.worldScale,
    ORYX_WORLD_CONFIG.worldZ + zOffset
  );
}

/**
 * Experimental Qatar Airways Oryx Skywriting Finale Choreographer:
 * 1. Short, lyrical ascending 3D launch sequence out of the open Jack-in-the-Box.
 * 2. Smooth 3-pass contour tracing of the Arabian Oryx's iconic horns, forehead/muzzle,
 *    head/neck silhouette, and wind-swept mane stripe with wide C1 banking transitions.
 * 3. Panoramic background pullback arc while controlled smoke particles complete the Oryx
 *    and the official "QATAR AIRWAYS" wordmark reveals underneath (~11.2s from launch).
 * 4. Short, celebratory foreground wing-wave salute flyby.
 */
export class OryxFinaleChoreographer implements Choreographer {
  public readonly launchSegments: FlightSegment[] = [];
  public readonly skywritingSegments: FlightSegment[] = [];
  public readonly flybySegments: FlightSegment[] = [];

  public readonly launchDuration: number;
  public readonly skywritingDuration: number;
  public readonly flybyDuration: number;
  public readonly totalSkywritingStrokes = 3;

  /** Phase-local timestamps inside SKYWRITING for coordinated reveal & camera pullback */
  public readonly tracingEndTime: number;
  public readonly emblemRevealStart: number;
  public readonly emblemRevealEnd: number;
  public readonly pullbackStart: number;
  public readonly pullbackEnd: number;
  public readonly wordmarkStart: number;
  public readonly wordmarkEnd: number;

  private currentSmoothedRoll = 0;
  private readonly _tmpPos = new THREE.Vector3();
  private readonly _tmpTan = new THREE.Vector3();
  private readonly _tmpTanAhead = new THREE.Vector3();
  private readonly _tmpTanBehind = new THREE.Vector3();
  private readonly _tmpCross = new THREE.Vector3();

  constructor() {
    const strokes = this.buildPrimaryOryxStrokes();

    const firstStroke = strokes[0];
    const s1Start = firstStroke.getPointAt(0);
    const s1StartTan = firstStroke.getTangentAt(0).normalize();

    // 1. Short, elegant 3D launch sequence (~2.25s)
    this.launchSegments = this.buildLaunchSequence(s1Start, s1StartTan);
    this.launchDuration = this.sumDuration(this.launchSegments);

    // 2. Smooth 3-stroke Oryx contour tracing + wide panoramic pullback arc (~8.9s)
    const { segments, tracingEnd, flybyEntryPos, flybyEntryTan } = this.buildOryxSkywritingAndPullback(strokes);
    this.skywritingSegments = segments;
    this.skywritingDuration = this.sumDuration(this.skywritingSegments);
    this.tracingEndTime = tracingEnd;

    // Coordinated smoke-particle completion, camera pullback & wordmark reveal windows
    this.emblemRevealStart = Math.max(1.8, tracingEnd * 0.56);
    this.emblemRevealEnd = Math.min(this.skywritingDuration - 0.55, tracingEnd + 2.45);
    this.pullbackStart = Math.max(2.6, tracingEnd - 0.35);
    this.pullbackEnd = this.skywritingDuration - 0.15;
    this.wordmarkStart = tracingEnd + 1.05;
    this.wordmarkEnd = this.skywritingDuration - 0.12;

    // 3. Short celebratory foreground flyby (~2.95s)
    this.flybySegments = this.buildShortFlybySequence(flybyEntryPos, flybyEntryTan);
    this.flybyDuration = this.sumDuration(this.flybySegments);
  }

  private sumDuration(segments: FlightSegment[]): number {
    return segments.reduce((acc, s) => acc + s.duration, 0);
  }

  private makeWideBank(
    p0: THREE.Vector3,
    t0: THREE.Vector3,
    p1: THREE.Vector3,
    t1: THREE.Vector3,
    apexPos: THREE.Vector3,
    apexTan: THREE.Vector3,
    handleScale = 0.41
  ): [THREE.CubicBezierCurve3, THREE.CubicBezierCurve3] {
    const d1 = p0.distanceTo(apexPos) * handleScale;
    const d2 = apexPos.distanceTo(p1) * handleScale;
    const c1 = new THREE.CubicBezierCurve3(
      p0.clone(),
      p0.clone().addScaledVector(t0, d1),
      apexPos.clone().addScaledVector(apexTan, -d1),
      apexPos.clone()
    );
    const c2 = new THREE.CubicBezierCurve3(
      apexPos.clone(),
      apexPos.clone().addScaledVector(apexTan, d2),
      p1.clone().addScaledVector(t1, -d2),
      p1.clone()
    );
    return [c1, c2];
  }

  /**
   * Builds the three sweeping primary contours inside the official ORYX_EMBLEM_PATH:
   * - Stroke 1: Chin/Muzzle -> Forehead/Nose-Bridge -> Soaring Upper Horn to Tip
   * - Stroke 2: Sweeping Lower Horn from Tip -> Head Crown -> Neck Silhouette to Base
   * - Stroke 3: Throat Curve -> Upper Neck -> Iconic Top Wind-Swept Mane Stripe
   */
  private buildPrimaryOryxStrokes(): THREE.Curve<THREE.Vector3>[] {
    const stroke1Pts = [
      [226.4, 57.5, 0.02],
      [225.7, 50.5, 0.03],
      [229.0, 42.8, 0.02],
      [235.6, 35.0, 0.01],
      [244.0, 27.4, 0.00],
      [254.6, 19.6, -0.01],
      [266.8, 12.2, -0.02],
      [279.2, 5.6, -0.03],
      [290.8, 0.7, -0.04]
    ].map(([x, y, z]) => oryxSvgToWorld(x, y, z));

    const stroke2Pts = [
      [294.8, 8.4, -0.03],
      [282.0, 13.8, -0.02],
      [268.5, 19.8, -0.01],
      [256.8, 25.8, 0.00],
      [249.6, 31.8, 0.01],
      [247.6, 40.2, 0.02],
      [248.2, 49.5, 0.02],
      [251.2, 58.6, 0.01],
      [255.2, 66.8, 0.00],
      [258.4, 73.0, -0.01]
    ].map(([x, y, z]) => oryxSvgToWorld(x, y, z));

    const stroke3Pts = [
      [238.8, 54.6, 0.02],
      [245.2, 50.2, 0.01],
      [251.5, 46.2, 0.00],
      [259.5, 44.8, -0.01],
      [267.5, 44.7, -0.02],
      [274.8, 44.8, -0.02]
    ].map(([x, y, z]) => oryxSvgToWorld(x, y, z));

    return [
      new THREE.CatmullRomCurve3(stroke1Pts, false, 'centripetal', 0.5),
      new THREE.CatmullRomCurve3(stroke2Pts, false, 'centripetal', 0.5),
      new THREE.CatmullRomCurve3(stroke3Pts, false, 'centripetal', 0.5)
    ];
  }

  private buildLaunchSequence(
    targetPos: THREE.Vector3,
    targetTan: THREE.Vector3
  ): FlightSegment[] {
    // Exact C1 handoff from ANTICIPATION_POP spring rise at (0, 0.15, 0)
    const pStart = new THREE.Vector3(0.0, 0.15, 0.0);
    const tStart = new THREE.Vector3(0.02, 0.96, 0.28).normalize();

    const pStarboard = new THREE.Vector3(1.48, 1.88, 2.22);
    const tStarboard = new THREE.Vector3(-0.34, 0.24, 0.91).normalize();

    const pPort = new THREE.Vector3(-1.82, 2.46, 1.12);
    const tPort = new THREE.Vector3(-0.28, 0.58, -0.76).normalize();

    const cClimb = new THREE.CubicBezierCurve3(
      pStart,
      pStart.clone().addScaledVector(tStart, 1.18),
      pStarboard.clone().addScaledVector(tStarboard, -1.25),
      pStarboard
    );

    const cSweep = new THREE.CubicBezierCurve3(
      pStarboard,
      pStarboard.clone().addScaledVector(tStarboard, 1.48),
      pPort.clone().addScaledVector(tPort, -1.48),
      pPort
    );

    const distApproach = pPort.distanceTo(targetPos);
    const cApproach = new THREE.CubicBezierCurve3(
      pPort,
      pPort.clone().addScaledVector(tPort, distApproach * 0.42),
      targetPos.clone().addScaledVector(targetTan, -distApproach * 0.42),
      targetPos.clone()
    );

    const launchSpeed = 4.65;
    return [
      {
        curve: cClimb,
        duration: cClimb.getLength() / launchSpeed,
        emitSmoke: true,
        persistentSmoke: false,
        strokeId: -1,
        label: 'Oryx Departure Climb'
      },
      {
        curve: cSweep,
        duration: cSweep.getLength() / launchSpeed,
        emitSmoke: true,
        persistentSmoke: false,
        strokeId: -1,
        label: 'Foreground Grace Sweep'
      },
      {
        curve: cApproach,
        duration: cApproach.getLength() / 4.55,
        emitSmoke: false,
        persistentSmoke: false,
        strokeId: -1,
        label: 'Oryx Muzzle Approach'
      }
    ];
  }

  private buildOryxSkywritingAndPullback(strokes: THREE.Curve<THREE.Vector3>[]): {
    segments: FlightSegment[];
    tracingEnd: number;
    flybyEntryPos: THREE.Vector3;
    flybyEntryTan: THREE.Vector3;
  } {
    const segments: FlightSegment[] = [];
    const cruiseSpeed = 4.45;

    const [stroke1, stroke2, stroke3] = strokes;

    // Stroke 1: Muzzle -> Nose Bridge -> Sweeping Upper Horn
    segments.push({
      curve: stroke1,
      duration: stroke1.getLength() / cruiseSpeed,
      emitSmoke: true,
      persistentSmoke: true,
      strokeId: 1,
      label: 'Oryx Upper Horn & Forehead'
    });

    // Wide 3D Bank 1 around horn tips
    const s1End = stroke1.getPointAt(1);
    const s1EndTan = stroke1.getTangentAt(1).normalize();
    const s2Start = stroke2.getPointAt(0);
    const s2StartTan = stroke2.getTangentAt(0).normalize();
    const [bank1a, bank1b] = this.makeWideBank(
      s1End,
      s1EndTan,
      s2Start,
      s2StartTan,
      new THREE.Vector3(3.82, 6.88, 0.52),
      new THREE.Vector3(-0.06, -0.998, 0.0).normalize(),
      0.44
    );

    segments.push(
      {
        curve: bank1a,
        duration: bank1a.getLength() / cruiseSpeed,
        emitSmoke: false,
        persistentSmoke: false,
        strokeId: 0,
        label: 'Horn Tip Turnaround A'
      },
      {
        curve: bank1b,
        duration: bank1b.getLength() / cruiseSpeed,
        emitSmoke: false,
        persistentSmoke: false,
        strokeId: 0,
        label: 'Horn Tip Turnaround B'
      }
    );

    // Stroke 2: Sweeping Lower Horn -> Crown -> Head/Neck Silhouette
    segments.push({
      curve: stroke2,
      duration: stroke2.getLength() / cruiseSpeed,
      emitSmoke: true,
      persistentSmoke: true,
      strokeId: 2,
      label: 'Oryx Lower Horn & Head Silhouette'
    });

    // Wide 3D Bank 2 beneath neck base to throat
    const s2End = stroke2.getPointAt(1);
    const s2EndTan = stroke2.getTangentAt(1).normalize();
    const s3Start = stroke3.getPointAt(0);
    const s3StartTan = stroke3.getTangentAt(0).normalize();
    const [bank2a, bank2b] = this.makeWideBank(
      s2End,
      s2EndTan,
      s3Start,
      s3StartTan,
      new THREE.Vector3(-0.48, 1.98, 0.56),
      new THREE.Vector3(-0.91, 0.41, 0.0).normalize(),
      0.42
    );

    segments.push(
      {
        curve: bank2a,
        duration: bank2a.getLength() / cruiseSpeed,
        emitSmoke: false,
        persistentSmoke: false,
        strokeId: 0,
        label: 'Throat Approach Turn A'
      },
      {
        curve: bank2b,
        duration: bank2b.getLength() / cruiseSpeed,
        emitSmoke: false,
        persistentSmoke: false,
        strokeId: 0,
        label: 'Throat Approach Turn B'
      }
    );

    // Stroke 3: Throat -> Upper Neck -> Top Wind-Swept Mane Crest
    segments.push({
      curve: stroke3,
      duration: stroke3.getLength() / cruiseSpeed,
      emitSmoke: true,
      persistentSmoke: true,
      strokeId: 3,
      label: 'Oryx Mane Crest Sweep'
    });

    const tracingEnd = this.sumDuration(segments);

    // Panoramic background twilight arc clearing stage during camera pullback & emblem/wordmark reveal
    const s3End = stroke3.getPointAt(1);
    const s3EndTan = stroke3.getTangentAt(1).normalize();
    const panoramaApex1 = new THREE.Vector3(5.2, 4.9, -2.6);
    const panoramaApex1Tan = new THREE.Vector3(0.25, 0.22, -0.94).normalize();
    const panoramaApex2 = new THREE.Vector3(-1.2, 5.8, -5.8);
    const panoramaApex2Tan = new THREE.Vector3(-0.94, -0.14, 0.31).normalize();
    const flybyEntryPos = new THREE.Vector3(-6.4, 2.35, 1.15);
    const flybyEntryTan = new THREE.Vector3(0.76, -0.28, 0.58).normalize();

    const pull1 = new THREE.CubicBezierCurve3(
      s3End.clone(),
      s3End.clone().addScaledVector(s3EndTan, 1.85),
      panoramaApex1.clone().addScaledVector(panoramaApex1Tan, -1.85),
      panoramaApex1
    );
    const pull2 = new THREE.CubicBezierCurve3(
      panoramaApex1.clone(),
      panoramaApex1.clone().addScaledVector(panoramaApex1Tan, 2.5),
      panoramaApex2.clone().addScaledVector(panoramaApex2Tan, -2.5),
      panoramaApex2
    );
    const pull3 = new THREE.CubicBezierCurve3(
      panoramaApex2.clone(),
      panoramaApex2.clone().addScaledVector(panoramaApex2Tan, 2.9),
      flybyEntryPos.clone().addScaledVector(flybyEntryTan, -2.9),
      flybyEntryPos.clone()
    );

    segments.push(
      {
        curve: pull1,
        duration: pull1.getLength() / 5.4,
        emitSmoke: false,
        persistentSmoke: false,
        strokeId: -2,
        label: 'Emblem Reveal Arc 1'
      },
      {
        curve: pull2,
        duration: pull2.getLength() / 5.95,
        emitSmoke: false,
        persistentSmoke: false,
        strokeId: -2,
        label: 'Emblem Reveal Arc 2'
      },
      {
        curve: pull3,
        duration: pull3.getLength() / 6.6,
        emitSmoke: false,
        persistentSmoke: false,
        strokeId: -2,
        label: 'Emblem Reveal Arc 3'
      }
    );

    return { segments, tracingEnd, flybyEntryPos, flybyEntryTan };
  }

  private buildShortFlybySequence(
    entryPos: THREE.Vector3,
    entryTan: THREE.Vector3
  ): FlightSegment[] {
    const flybyMid = new THREE.Vector3(0.85, 1.12, 4.25);
    const flybyMidTan = new THREE.Vector3(0.95, 0.14, -0.28).normalize();
    const flybyExit = new THREE.Vector3(15.2, 5.8, -8.2);
    const flybyExitTan = new THREE.Vector3(0.76, 0.34, -0.55).normalize();

    const passCurve = new THREE.CubicBezierCurve3(
      entryPos.clone(),
      entryPos.clone().addScaledVector(entryTan, 3.1),
      flybyMid.clone().addScaledVector(flybyMidTan, -3.1),
      flybyMid
    );
    const exitCurve = new THREE.CubicBezierCurve3(
      flybyMid.clone(),
      flybyMid.clone().addScaledVector(flybyMidTan, 4.8),
      flybyExit.clone().addScaledVector(flybyExitTan, -5.2),
      flybyExit
    );

    return [
      {
        curve: passCurve,
        duration: passCurve.getLength() / 7.5,
        emitSmoke: true,
        persistentSmoke: false,
        strokeId: -3,
        wingWave: true,
        label: 'Oryx Finale Salute Pass'
      },
      {
        curve: exitCurve,
        duration: exitCurve.getLength() / 9.2,
        emitSmoke: true,
        persistentSmoke: false,
        strokeId: -3,
        wingWave: true,
        label: 'Oryx Finale Horizon Climb'
      }
    ];
  }

  public resetRoll(): void {
    this.currentSmoothedRoll = 0;
  }

  public sampleSequence(
    segments: FlightSegment[],
    timeSec: number,
    dt: number
  ): FlightSample {
    const totalDur = this.sumDuration(segments);
    const clampedTime = Math.max(0, Math.min(totalDur - 0.0001, timeSec));

    let accum = 0;
    let chosen = segments[segments.length - 1];
    let localT = 1.0;

    for (const seg of segments) {
      if (clampedTime <= accum + seg.duration) {
        chosen = seg;
        localT = Math.max(0, Math.min(1, (clampedTime - accum) / seg.duration));
        break;
      }
      accum += seg.duration;
    }

    chosen.curve.getPointAt(localT, this._tmpPos);
    chosen.curve.getTangentAt(localT, this._tmpTan).normalize();

    const eps = 0.025;
    const uA = Math.max(0, localT - eps);
    const uB = Math.min(1, localT + eps);
    chosen.curve.getTangentAt(uA, this._tmpTanBehind).normalize();
    chosen.curve.getTangentAt(uB, this._tmpTanAhead).normalize();

    this._tmpCross.crossVectors(this._tmpTanBehind, this._tmpTanAhead);
    let targetRoll = THREE.MathUtils.clamp(-this._tmpCross.y * 5.0, -0.95, 0.95);

    if (chosen.wingWave) {
      // Gentle wing-wave salute right across center foreground
      const isPass = chosen.label === 'Oryx Finale Salute Pass';
      const waveWindow = isPass ? (localT - 0.52) / 0.48 : localT / 0.35;
      if (waveWindow > 0 && waveWindow < 1) {
        const env = Math.sin(waveWindow * Math.PI);
        targetRoll += Math.sin(waveWindow * Math.PI * 3.0) * 0.42 * env;
      }
    }

    const rollLerp = Math.min(1, Math.max(0.02, dt * 8.0));
    this.currentSmoothedRoll += (targetRoll - this.currentSmoothedRoll) * rollLerp;

    const speed = chosen.curve.getLength() / Math.max(0.1, chosen.duration);

    return {
      position: this._tmpPos.clone(),
      tangent: this._tmpTan.clone(),
      rollAngle: this.currentSmoothedRoll,
      emitSmoke: chosen.emitSmoke,
      persistentSmoke: chosen.persistentSmoke,
      strokeId: chosen.strokeId,
      speed,
      label: chosen.label,
      normalizedProgress: totalDur > 0 ? clampedTime / totalDur : 1
    };
  }

  public emitWindowStrokes(
    segments: FlightSegment[],
    tStart: number,
    tEnd: number,
    emitStep: (pos: THREE.Vector3, emitActive: boolean, persistent: boolean, strokeId: number) => void
  ): void {
    if (tEnd <= tStart) return;
    let accum = 0;

    for (const seg of segments) {
      const segStart = accum;
      const segEnd = accum + seg.duration;
      accum = segEnd;

      if (segEnd <= tStart) continue;
      if (segStart >= tEnd) break;

      if (!seg.emitSmoke) {
        emitStep(this._tmpPos, false, false, seg.strokeId);
        continue;
      }

      const u0 = tStart <= segStart ? 0 : Math.max(0, Math.min(1, (tStart - segStart) / seg.duration));
      const u1 = tEnd >= segEnd ? 1 : Math.max(0, Math.min(1, (tEnd - segStart) / seg.duration));
      const arcSpan = Math.max(0, u1 - u0) * seg.curve.getLength();
      const steps = Math.max(u0 === 0 || u1 === 1 ? 3 : 1, Math.ceil(arcSpan / 0.024));

      for (let s = 0; s <= steps; s++) {
        if (s === 0 && u0 > 0) continue;
        const u = u0 + (u1 - u0) * (s / steps);
        seg.curve.getPointAt(u, this._tmpPos);
        emitStep(this._tmpPos, true, seg.persistentSmoke, seg.strokeId);
      }
    }
  }
}
