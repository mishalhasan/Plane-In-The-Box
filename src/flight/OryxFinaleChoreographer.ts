import * as THREE from 'three';
import { Choreographer, FlightSample, FlightSegment } from '../types';

export const ORYX_WORLD_CONFIG = {
  svgMinX: 219.50,
  svgMaxX: 295.58,
  svgMinY: 0.0,
  svgMaxY: 74.65,
  svgRefX: 256.8,
  worldScale: 0.045,
  worldBottomY: 3.32,
  worldZ: -0.55
} as const;

export function oryxSvgToWorld(svgX: number, svgY: number, zOffset = 0): THREE.Vector3 {
  return new THREE.Vector3(
    (svgX - ORYX_WORLD_CONFIG.svgRefX) * ORYX_WORLD_CONFIG.worldScale,
    ORYX_WORLD_CONFIG.worldBottomY + (ORYX_WORLD_CONFIG.svgMaxY - svgY) * ORYX_WORLD_CONFIG.worldScale,
    ORYX_WORLD_CONFIG.worldZ + zOffset * 0.65
  );
}

interface OryxContourStroke {
  label: string;
  pts: Array<[number, number, number]>;
}

/**
 * Physical Qatar Airways Oryx Skywriting Choreographer:
 * 1. Short ascending 3D launch out of the Jack-in-the-Box into the Oryx snout.
 * 2. 10 C2-smooth contour strokes derived from the official ORYX_EMBLEM_PATH
 *    at a balanced 0.045 world scale (~3.42u wide x 3.36u tall) above the box,
 *    with smoke disabled on all 3D banking turns between disconnected strokes.
 * 3. Panoramic setup arc (while "QATAR AIRWAYS" illuminates beneath the Oryx)
 *    followed by the restored left-to-right foreground wing-wave salute flyby
 *    and graceful twilight horizon climb.
 */
export class OryxFinaleChoreographer implements Choreographer {
  public readonly launchSegments: FlightSegment[] = [];
  public readonly skywritingSegments: FlightSegment[] = [];
  public readonly flybySegments: FlightSegment[] = [];

  public readonly launchDuration: number;
  public readonly skywritingDuration: number;
  public readonly flybyDuration: number;
  public readonly totalSkywritingStrokes: number;

  private currentSmoothedRoll = 0;
  private readonly _tmpPos = new THREE.Vector3();
  private readonly _tmpTan = new THREE.Vector3();
  private readonly _tmpTanAhead = new THREE.Vector3();
  private readonly _tmpTanBehind = new THREE.Vector3();
  private readonly _tmpCross = new THREE.Vector3();

  constructor() {
    const contours = this.buildOryxContours();
    this.totalSkywritingStrokes = contours.length;

    const strokeCurves = contours.map((c) => {
      const curve = new THREE.CatmullRomCurve3(
        c.pts.map(([x, y, z]) => oryxSvgToWorld(x, y, z)),
        false,
        'centripetal',
        0.5
      );
      curve.arcLengthDivisions = 400;
      return { label: c.label, curve };
    });

    const firstCurve = strokeCurves[0].curve;
    const s1Start = firstCurve.getPointAt(0);
    const s1StartTan = firstCurve.getTangentAt(0).normalize();

    // 1. Short 3D ascending launch sequence out of the open box into Stroke 1
    this.launchSegments = this.buildLaunchSequence(s1Start, s1StartTan);
    this.launchDuration = this.sumDuration(this.launchSegments);

    // 2. Pure physical skywriting of all 10 Oryx contours with smoke-off 3D banking turns
    this.skywritingSegments = this.buildPhysicalSkywritingSequence(strokeCurves);
    this.skywritingDuration = this.sumDuration(this.skywritingSegments);

    // 3. Restored panoramic setup + graceful left-to-right foreground salute flyby
    const lastSeg = this.skywritingSegments[this.skywritingSegments.length - 1];
    const endPos = lastSeg.curve.getPointAt(1);
    const endTan = lastSeg.curve.getTangentAt(1).normalize();
    this.flybySegments = this.buildFinalFlybySequence(endPos, endTan);
    this.flybyDuration = this.sumDuration(this.flybySegments);
  }

  private sumDuration(segments: FlightSegment[]): number {
    return segments.reduce((acc, s) => acc + s.duration, 0);
  }

  /**
   * Computes segment duration at `targetSpeed` with a smooth angular-rate floor
   * so curved arcs remain aerodynamically graceful without slowing straightaways.
   */
  private computeSmoothDuration(
    curve: THREE.Curve<THREE.Vector3>,
    targetSpeed: number,
    maxOmegaRadPerSec = 7.4,
    minSpeed = 2.35
  ): number {
    const len = curve.getLength();
    const steps = Math.max(20, Math.ceil(len / 0.04));
    const ds = len / steps;
    let maxKappa = 0;
    let prev = curve.getTangentAt(0).normalize();

    for (let s = 1; s <= steps; s++) {
      const cur = curve.getTangentAt(s / steps).normalize();
      const rad = Math.acos(Math.max(-1, Math.min(1, prev.dot(cur))));
      if (ds > 0.0001) {
        maxKappa = Math.max(maxKappa, rad / ds);
      }
      prev = cur;
    }

    const safeSpeed = maxKappa > 0.01 ? Math.min(targetSpeed, maxOmegaRadPerSec / maxKappa) : targetSpeed;
    return Math.max(0.15, len / Math.max(minSpeed, safeSpeed));
  }

  /**
   * Essential contours extracted from official ORYX_EMBLEM_PATH vector coordinates,
   * ordered as wide figure-eight passes so every smoke-off transition is an open,
   * non-crossing 3D bank with zero sharp reversals inside any stroke.
   */
  private buildOryxContours(): OryxContourStroke[] {
    return [
      // 1. Snout -> Nose Bridge -> Forehead -> Soaring Upper Scimitar Horn
      {
        label: 'Oryx Forehead & Upper Horn',
        pts: [
          [219.9, 53.3, 0.02],
          [226.4, 45.4, 0.02],
          [235.6, 35.1, 0.01],
          [246.9, 24.8, 0.00],
          [262.0, 14.9, -0.01],
          [277.5, 6.3, -0.02],
          [291.6, 0.5, -0.03]
        ]
      },
      // 2. Lower Scimitar Horn -> Crown -> Cheekbone Ridge -> Jaw -> Rounded Chin
      {
        label: 'Oryx Lower Horn, Cheek & Jaw',
        pts: [
          [295.4, 8.1, -0.02],
          [280.5, 14.3, -0.01],
          [265.2, 21.6, 0.00],
          [252.5, 28.9, 0.01],
          [243.0, 35.0, 0.02],
          [237.2, 42.0, 0.02],
          [233.2, 50.8, 0.02],
          [229.0, 57.2, 0.02],
          [224.6, 59.3, 0.02]
        ]
      },
      // 3. Arabian Oryx Facial-Mask Cheek Crescent
      {
        label: 'Oryx Facial Mask Crescent',
        pts: [
          [243.5, 37.8, 0.01],
          [244.0, 42.6, 0.01],
          [242.2, 49.0, 0.01],
          [236.8, 55.2, 0.01]
        ]
      },
      // 4. Lower Rear Neck Taper (Chest V-Base -> Lower Mane Edge)
      {
        label: 'Oryx Lower Neck Taper',
        pts: [
          [258.35, 74.55, -0.01],
          [264.8, 69.5, -0.01],
          [270.0, 63.6, -0.02]
        ]
      },
      // 5. Pointed Ear Underside Notch
      {
        label: 'Oryx Ear Underside',
        pts: [
          [265.5, 31.0, -0.01],
          [261.2, 33.4, 0.00],
          [256.4, 34.8, 0.01]
        ]
      },
      // 6. Lower Wind-Swept Mane Stripe
      {
        label: 'Oryx Lower Mane Stripe',
        pts: [
          [254.4, 56.6, 0.00],
          [263.8, 57.4, -0.01],
          [272.8, 58.4, -0.02]
        ]
      },
      // 7. Pointed Ear Upper Crown
      {
        label: 'Oryx Ear Crown',
        pts: [
          [265.6, 30.9, -0.01],
          [259.0, 30.2, 0.00],
          [251.8, 29.8, 0.01]
        ]
      },
      // 8. Throat Notch -> Graceful Arched Front Neck -> Chest V-Base
      {
        label: 'Oryx Arched Throat & Neck',
        pts: [
          [236.8, 55.4, 0.01],
          [241.3, 55.6, 0.01],
          [245.6, 58.6, 0.00],
          [250.8, 66.2, 0.00],
          [254.8, 71.2, -0.01],
          [258.35, 74.55, -0.01]
        ]
      },
      // 9. Middle Wind-Swept Mane Stripe
      {
        label: 'Oryx Middle Mane Stripe',
        pts: [
          [274.9, 51.4, -0.02],
          [264.6, 50.5, -0.01],
          [253.8, 49.6, 0.00]
        ]
      },
      // 10. Upper Wind-Swept Mane Crest (exiting outward right into open sky)
      {
        label: 'Oryx Upper Mane Crest',
        pts: [
          [256.4, 34.8, 0.01],
          [261.2, 39.2, 0.00],
          [268.2, 42.1, -0.01],
          [275.4, 44.0, -0.02]
        ]
      }
    ];
  }

  private buildLaunchSequence(
    targetPos: THREE.Vector3,
    targetTan: THREE.Vector3
  ): FlightSegment[] {
    // Exact C1 handoff from ANTICIPATION_POP spring rise at (0, 0.15, 0)
    const pStart = new THREE.Vector3(0.0, 0.15, 0.0);
    const tStart = new THREE.Vector3(0.02, 0.96, 0.28).normalize();

    const pStarboard = new THREE.Vector3(1.36, 1.82, 1.98);
    const tStarboard = new THREE.Vector3(-0.34, 0.25, 0.906).normalize();

    const pPort = new THREE.Vector3(-1.86, 2.48, 0.96);
    const tPort = new THREE.Vector3(-0.24, 0.64, -0.73).normalize();

    const cClimb = new THREE.CubicBezierCurve3(
      pStart,
      pStart.clone().addScaledVector(tStart, 1.05),
      pStarboard.clone().addScaledVector(tStarboard, -1.12),
      pStarboard
    );
    cClimb.arcLengthDivisions = 300;

    const cSweep = new THREE.CubicBezierCurve3(
      pStarboard,
      pStarboard.clone().addScaledVector(tStarboard, 1.32),
      pPort.clone().addScaledVector(tPort, -1.32),
      pPort
    );
    cSweep.arcLengthDivisions = 300;

    const distApproach = pPort.distanceTo(targetPos);
    const cApproach = new THREE.CubicBezierCurve3(
      pPort,
      pPort.clone().addScaledVector(tPort, distApproach * 0.44),
      targetPos.clone().addScaledVector(targetTan, -distApproach * 0.44),
      targetPos.clone()
    );
    cApproach.arcLengthDivisions = 300;

    return [
      {
        curve: cClimb,
        duration: this.computeSmoothDuration(cClimb, 4.9),
        emitSmoke: false,
        persistentSmoke: false,
        strokeId: -1,
        label: 'Oryx Departure Climb'
      },
      {
        curve: cSweep,
        duration: this.computeSmoothDuration(cSweep, 5.2),
        emitSmoke: false,
        persistentSmoke: false,
        strokeId: -1,
        label: 'Foreground Grace Sweep'
      },
      {
        curve: cApproach,
        duration: this.computeSmoothDuration(cApproach, 5.0),
        emitSmoke: false,
        persistentSmoke: false,
        strokeId: -1,
        label: 'Oryx Snout Approach'
      }
    ];
  }

  /**
   * Constructs a guaranteed non-crossing, C1-continuous 2-segment 3D banking arc
   * between disconnected strokes while smoke emission is disabled.
   */
  private buildSmoothBank(
    p0: THREE.Vector3,
    t0: THREE.Vector3,
    p1: THREE.Vector3,
    t1: THREE.Vector3,
    zSign: number
  ): [THREE.CubicBezierCurve3, THREE.CubicBezierCurve3] {
    const chord = p1.clone().sub(p0);
    const dist = chord.length();
    const chordDir = dist > 0.001 ? chord.clone().divideScalar(dist) : new THREE.Vector3(1, 0, 0);

    const outDir = t0.clone().sub(t1);
    outDir.z = 0;
    if (outDir.lengthSq() < 0.08) {
      outDir.set(-chordDir.y, chordDir.x, 0);
      if (outDir.dot(t0) < 0) outDir.negate();
    }
    if (outDir.lengthSq() < 0.01) outDir.set(0, 1, 0);
    outDir.normalize();

    const perpChord = chord.clone().addScaledVector(outDir, -chord.dot(outDir));
    perpChord.z = 0;
    const isHairpin = t0.dot(t1) < -0.35 && dist < 0.75;
    const latSep = Math.max(isHairpin ? 1.02 : 0.74, perpChord.length());
    const loopR = Math.max(isHairpin ? 0.88 : 0.64, Math.min(1.12, latSep * 0.50 + 0.30));

    const mid = p0
      .clone()
      .add(p1)
      .multiplyScalar(0.5)
      .addScaledVector(outDir, loopR * (isHairpin ? 0.96 : 0.86))
      .add(new THREE.Vector3(0, 0, zSign * (isHairpin ? 0.42 : 0.34)));

    const midTan =
      perpChord.lengthSq() > 0.025
        ? perpChord.clone().normalize()
        : new THREE.Vector3(-outDir.y, outDir.x, 0).normalize();
    midTan.z = 0;

    const h1 = Math.max(0.30, p0.distanceTo(mid) * 0.46);
    const h2 = Math.max(0.30, mid.distanceTo(p1) * 0.46);

    const c1 = new THREE.CubicBezierCurve3(
      p0.clone(),
      p0.clone().addScaledVector(t0, h1),
      mid.clone().addScaledVector(midTan, -h1),
      mid.clone()
    );
    const c2 = new THREE.CubicBezierCurve3(
      mid.clone(),
      mid.clone().addScaledVector(midTan, h2),
      p1.clone().addScaledVector(t1, -h2),
      p1.clone()
    );
    c1.arcLengthDivisions = 300;
    c2.arcLengthDivisions = 300;
    return [c1, c2];
  }

  private buildPhysicalSkywritingSequence(
    strokes: Array<{ label: string; curve: THREE.CatmullRomCurve3 }>
  ): FlightSegment[] {
    const segments: FlightSegment[] = [];
    const writeSpeed = 4.95;
    const bankSpeed = 5.45;

    for (let i = 0; i < strokes.length; i++) {
      const { label, curve } = strokes[i];

      segments.push({
        curve,
        duration: this.computeSmoothDuration(curve, writeSpeed),
        emitSmoke: true,
        persistentSmoke: true,
        strokeId: i + 1,
        label
      });

      if (i < strokes.length - 1) {
        const nextCurve = strokes[i + 1].curve;
        const p0 = curve.getPointAt(1);
        const t0 = curve.getTangentAt(1).normalize();
        const p1 = nextCurve.getPointAt(0);
        const t1 = nextCurve.getTangentAt(0).normalize();
        const zSign = i % 2 === 0 ? 1 : -1;

        const [b1, b2] = this.buildSmoothBank(p0, t0, p1, t1, zSign);
        segments.push(
          {
            curve: b1,
            duration: this.computeSmoothDuration(b1, bankSpeed),
            emitSmoke: false,
            persistentSmoke: false,
            strokeId: 0,
            label: `Oryx Bank ${i + 1}A`
          },
          {
            curve: b2,
            duration: this.computeSmoothDuration(b2, bankSpeed),
            emitSmoke: false,
            persistentSmoke: false,
            strokeId: 0,
            label: `Oryx Bank ${i + 1}B`
          }
        );
      }
    }

    return segments;
  }

  private buildFinalFlybySequence(
    startPos: THREE.Vector3,
    startTan: THREE.Vector3
  ): FlightSegment[] {
    // 1. Wide background twilight sweep (smoke OFF so the newly drawn Oryx + revealing
    //    "QATAR AIRWAYS" wordmark take center stage) leading around to port foreground.
    const apex1 = new THREE.Vector3(4.65, 4.72, -3.15);
    const apex1Tan = new THREE.Vector3(-0.28, 0.14, -0.949).normalize();

    const apex2 = new THREE.Vector3(-2.35, 4.92, -4.15);
    const apex2Tan = new THREE.Vector3(-0.92, -0.22, 0.32).normalize();

    const entryPos = new THREE.Vector3(-6.45, 2.28, 5.75);
    const entryTan = new THREE.Vector3(0.94, -0.17, 0.295).normalize();

    // 2. Graceful left-to-right foreground salute pass showcasing the fuselage livery & horizon climb
    const saluteMid = new THREE.Vector3(0.75, 1.48, 7.35);
    const saluteMidTan = new THREE.Vector3(0.985, 0.085, -0.15).normalize();

    const flybyExit = new THREE.Vector3(16.8, 5.95, -3.6);
    const flybyExitTan = new THREE.Vector3(0.81, 0.34, -0.478).normalize();

    const pull1 = new THREE.CubicBezierCurve3(
      startPos.clone(),
      startPos.clone().addScaledVector(startTan, 1.85),
      apex1.clone().addScaledVector(apex1Tan, -1.85),
      apex1
    );
    pull1.arcLengthDivisions = 300;

    const pull2 = new THREE.CubicBezierCurve3(
      apex1.clone(),
      apex1.clone().addScaledVector(apex1Tan, 2.55),
      apex2.clone().addScaledVector(apex2Tan, -2.55),
      apex2
    );
    pull2.arcLengthDivisions = 300;

    const pull3 = new THREE.CubicBezierCurve3(
      apex2.clone(),
      apex2.clone().addScaledVector(apex2Tan, 3.35),
      entryPos.clone().addScaledVector(entryTan, -3.35),
      entryPos
    );
    pull3.arcLengthDivisions = 300;

    const passCurve = new THREE.CubicBezierCurve3(
      entryPos.clone(),
      entryPos.clone().addScaledVector(entryTan, 2.65),
      saluteMid.clone().addScaledVector(saluteMidTan, -2.65),
      saluteMid
    );
    passCurve.arcLengthDivisions = 300;

    const exitCurve = new THREE.CubicBezierCurve3(
      saluteMid.clone(),
      saluteMid.clone().addScaledVector(saluteMidTan, 5.6),
      flybyExit.clone().addScaledVector(flybyExitTan, -5.8),
      flybyExit
    );
    exitCurve.arcLengthDivisions = 300;

    return [
      {
        curve: pull1,
        duration: pull1.getLength() / 10.2,
        emitSmoke: false,
        persistentSmoke: false,
        strokeId: -2,
        label: 'Flyby Panorama Turn A'
      },
      {
        curve: pull2,
        duration: pull2.getLength() / 11.4,
        emitSmoke: false,
        persistentSmoke: false,
        strokeId: -2,
        label: 'Flyby Panorama Turn B'
      },
      {
        curve: pull3,
        duration: pull3.getLength() / 12.6,
        emitSmoke: false,
        persistentSmoke: false,
        strokeId: -2,
        label: 'Flyby Panorama Turn C'
      },
      {
        curve: passCurve,
        duration: passCurve.getLength() / 5.65,
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
    let targetRoll = THREE.MathUtils.clamp(-this._tmpCross.y * 5.0, -0.94, 0.94);

    if (chosen.wingWave) {
      const isPass = chosen.label === 'Oryx Finale Salute Pass';
      if (isPass) {
        // Gentle airshow photo-pass wing dip so starboard wing/winglet stay cleanly below "QATAR AIRWAYS" fuselage title
        targetRoll = 0.08 + 0.32 * Math.sin(localT * Math.PI);
        const waveWindow = (localT - 0.56) / 0.44;
        if (waveWindow > 0 && waveWindow < 1) {
          const env = Math.sin(waveWindow * Math.PI);
          targetRoll += Math.sin(waveWindow * Math.PI * 2.0) * 0.16 * env;
        }
      } else {
        targetRoll = Math.max(-0.20, targetRoll * 0.50 + 0.24 * Math.max(0, 1 - localT * 2.2));
        const waveWindow = localT / 0.34;
        if (waveWindow > 0 && waveWindow < 1) {
          const env = Math.sin(waveWindow * Math.PI);
          targetRoll += Math.sin(waveWindow * Math.PI * 2.0) * 0.18 * env;
        }
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
      const steps = Math.max(u0 === 0 || u1 === 1 ? 3 : 1, Math.ceil(arcSpan / 0.018));

      for (let s = 0; s <= steps; s++) {
        if (s === 0 && u0 > 0) continue;
        const u = u0 + (u1 - u0) * (s / steps);
        seg.curve.getPointAt(u, this._tmpPos);
        emitStep(this._tmpPos, true, seg.persistentSmoke, seg.strokeId);
      }
    }
  }
}
