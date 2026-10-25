import * as THREE from 'three';
import { FlightSample, FlightSegment } from '../types';

interface RawGlyphStroke {
  points: Array<[number, number]>;
}

/**
 * Generates the complete multi-stage 3D flight choreography:
 * 1. Energetic launch out of the open Jack-in-the-Box + playful 3D aerobatic swoop.
 * 2. Calligraphic aerial skywriting of "Qatar Airways" with C1-continuous 3D turnarounds.
 * 3. Sweeping celebratory final flyby with an aviation wing-wave salute.
 */
export class FlightChoreographer {
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
    const skyStrokes = this.buildQatarAirwaysStrokes();
    this.totalSkywritingStrokes = skyStrokes.length;

    const firstStrokeCurve = skyStrokes[0];
    const skyStartPos = firstStrokeCurve.getPointAt(0);
    const skyStartTan = firstStrokeCurve.getTangentAt(0).normalize();

    // 1. Build Launch & Playful Aerobatics leading seamlessly into first stroke of 'Q'
    this.launchSegments = this.buildLaunchSequence(skyStartPos, skyStartTan);
    this.launchDuration = this.sumDuration(this.launchSegments);

    // 2. Build "Qatar Airways" Skywriting with smooth 3D smoke-off turnarounds
    this.skywritingSegments = this.buildSkywritingSequence(skyStrokes);
    this.skywritingDuration = this.sumDuration(this.skywritingSegments);

    // 3. Build Final Hero Flyby starting seamlessly from the end of 's'
    const lastSeg = this.skywritingSegments[this.skywritingSegments.length - 1];
    const skyEndPos = lastSeg.curve.getPointAt(1);
    const skyEndTan = lastSeg.curve.getTangentAt(1).normalize();
    this.flybySegments = this.buildFinalFlybySequence(skyEndPos, skyEndTan);
    this.flybyDuration = this.sumDuration(this.flybySegments);
  }

  private sumDuration(segments: FlightSegment[]): number {
    return segments.reduce((acc, s) => acc + s.duration, 0);
  }

  private buildLaunchSequence(
    targetPos: THREE.Vector3,
    targetTan: THREE.Vector3
  ): FlightSegment[] {
    // Launch upward out of the box cavity (world y ~ 0.15 -> y ~ 2.4), swoop close to camera, spiral up to Q
    const launchWaypoints = [
      new THREE.Vector3(0.0, 0.15, 0.0),      // Resting on extended spring cradle inside open box
      new THREE.Vector3(0.05, 1.85, 0.22),    // Bursting skyward clear of the open lid
      new THREE.Vector3(0.95, 2.75, 1.65),    // Pitching out toward viewer
      new THREE.Vector3(2.95, 1.45, 4.35),    // Thrilling close-depth swoop past right foreground!
      new THREE.Vector3(0.25, 0.55, 4.85),    // Banking across front center near camera
      new THREE.Vector3(-3.35, 1.25, 2.55),   // Sweeping around port side of Jack-in-the-Box
      new THREE.Vector3(-4.65, 2.85, -1.85),  // Climbing into deep background sky
      new THREE.Vector3(-5.85, 4.15, -2.35)   // Setting up high approach toward 'Q'
    ];

    const mainAerobaticCurve = new THREE.CatmullRomCurve3(launchWaypoints, false, 'centripetal', 0.5);
    const aeroEndPos = mainAerobaticCurve.getPointAt(1);
    const aeroEndTan = mainAerobaticCurve.getTangentAt(1).normalize();

    const joinCurves = this.createSmoothTransitionCurves(
      aeroEndPos,
      aeroEndTan,
      targetPos,
      targetTan,
      1
    );

    const segments: FlightSegment[] = [
      {
        curve: mainAerobaticCurve,
        duration: 3.35,
        emitSmoke: true,
        persistentSmoke: false, // Playful warm-up contrail gently dissipates!
        strokeId: -1,
        label: 'Playful Aerobatic Launch'
      }
    ];

    joinCurves.forEach((c, idx) => {
      segments.push({
        curve: c,
        duration: 0.42 / joinCurves.length,
        emitSmoke: false,
        persistentSmoke: false,
        strokeId: -1,
        label: `Skywriting Approach ${idx + 1}`
      });
    });

    return segments;
  }

  private buildSkywritingSequence(strokeCurves: THREE.Curve<THREE.Vector3>[]): FlightSegment[] {
    const segments: FlightSegment[] = [];
    const writeSpeed = 8.4; // World units per second along lettering
    const transitionSpeed = 6.6; // Smooth pace around 3D turnaround loops

    for (let i = 0; i < strokeCurves.length; i++) {
      const curve = strokeCurves[i];
      const len = curve.getLength();
      const duration = Math.max(0.20, len / writeSpeed);

      segments.push({
        curve,
        duration,
        emitSmoke: true,
        persistentSmoke: true,
        strokeId: i + 1,
        label: `Skywriting Stroke ${i + 1}`
      });

      if (i < strokeCurves.length - 1) {
        const nextCurve = strokeCurves[i + 1];
        const p0 = curve.getPointAt(1);
        const t0 = curve.getTangentAt(1).normalize();
        const p1 = nextCurve.getPointAt(0);
        const t1 = nextCurve.getTangentAt(0).normalize();

        const zSign = i % 2 === 0 ? 1 : -1;
        const transCurves = this.createSmoothTransitionCurves(p0, t0, p1, t1, zSign);
        for (const tc of transCurves) {
          const tLen = tc.getLength();
          segments.push({
            curve: tc,
            duration: Math.max(0.13, tLen / transitionSpeed),
            emitSmoke: false,
            persistentSmoke: false,
            strokeId: 0,
            label: `Turnaround ${i + 1}`
          });
        }
      }
    }

    return segments;
  }

  private buildFinalFlybySequence(
    startPos: THREE.Vector3,
    startTan: THREE.Vector3
  ): FlightSegment[] {
    const flybyEntry = new THREE.Vector3(9.4, 3.3, -2.8);
    const flybyEntryTan = new THREE.Vector3(-0.35, 0.25, -0.9).normalize();

    const setupCurves = this.createSmoothTransitionCurves(
      startPos,
      startTan,
      flybyEntry,
      flybyEntryTan,
      -1
    );

    const grandSweepPoints = [
      flybyEntry,
      new THREE.Vector3(2.5, 4.9, -5.4),     // High arc behind the completed "Qatar Airways" smoke
      new THREE.Vector3(-6.8, 3.8, -3.6),    // Wide bank on left horizon
      new THREE.Vector3(-7.4, 1.75, 1.6),    // Diving gracefully into foreground left
      new THREE.Vector3(-1.8, 0.95, 4.65),   // Sweeping hero flyby between camera and box!
      new THREE.Vector3(3.4, 1.35, 3.95),    // Wing-wave salute pass!
      new THREE.Vector3(9.6, 3.45, -1.2),    // Climbing smoothly out toward starry right horizon
      new THREE.Vector3(18.5, 7.2, -11.5),   // Ascending into twilight distance
      new THREE.Vector3(28.0, 11.5, -24.0)   // Graceful exit into the night sky
    ];

    const sweepCurve = new THREE.CatmullRomCurve3(grandSweepPoints, false, 'centripetal', 0.5);

    const segments: FlightSegment[] = [];
    setupCurves.forEach((c) => {
      segments.push({
        curve: c,
        duration: 0.45 / setupCurves.length,
        emitSmoke: false,
        persistentSmoke: false,
        strokeId: -2,
        label: 'Flyby Turnaround'
      });
    });

    segments.push({
      curve: sweepCurve,
      duration: 4.35,
      emitSmoke: true,
      persistentSmoke: false, // Celebratory flyby contrail gently fades leaving crisp skywriting!
      strokeId: -3,
      wingWave: true,
      label: 'Hero Finale Flyby'
    });

    return segments;
  }

  /**
   * Builds C1-continuous, bounded-curvature 3D transition curves from (p0, t0) to (p1, t1).
   * Handles both smooth forward continuations and 180-degree reversals without cusps.
   */
  private createSmoothTransitionCurves(
    p0: THREE.Vector3,
    t0: THREE.Vector3,
    p1: THREE.Vector3,
    t1: THREE.Vector3,
    zSign: number
  ): THREE.Curve<THREE.Vector3>[] {
    const dist = p0.distanceTo(p1);
    const dot = t0.dot(t1);

    // Case 1: Mild turn and reasonable separation -> single smooth CubicBezierCurve3
    if (dot > -0.15 && dist > 0.65) {
      const handle = Math.max(0.42, Math.min(1.8, dist * 0.42));
      const b1 = p0.clone().addScaledVector(t0, handle);
      const b2 = p1.clone().addScaledVector(t1, -handle);
      return [new THREE.CubicBezierCurve3(p0.clone(), b1, b2, p1.clone())];
    }

    // Case 2: Sharp turnaround or tight hop -> 2-segment 3D teardrop loop through Z-displaced apex M
    const loopR = Math.max(0.76, Math.min(1.35, dist * 0.40 + 0.68));

    const apexDir = t0.clone().sub(t1);
    if (apexDir.lengthSq() < 0.04) {
      apexDir.set(0, 1, 0);
    } else {
      apexDir.normalize();
    }

    const zVec = new THREE.Vector3(0, 0, zSign);
    const sideDir = new THREE.Vector3().crossVectors(apexDir, zVec);
    if (sideDir.lengthSq() < 0.04) {
      sideDir.set(1, 0, 0);
    } else {
      sideDir.normalize();
    }

    // Midpoint M pushed outward along apexDir and into 3D Z depth
    const mid = p0
      .clone()
      .add(p1)
      .multiplyScalar(0.5)
      .addScaledVector(apexDir, loopR * 0.85)
      .add(new THREE.Vector3(0, 0, zSign * loopR * 0.68));

    // Midpoint tangent sweeps cleanly from p0 toward p1 + lateral bank
    const midTan = p1
      .clone()
      .sub(p0)
      .addScaledVector(sideDir, loopR * 0.9)
      .normalize();

    const h = loopR * 0.56;
    const c1 = new THREE.CubicBezierCurve3(
      p0.clone(),
      p0.clone().addScaledVector(t0, h),
      mid.clone().addScaledVector(midTan, -h),
      mid.clone()
    );
    const c2 = new THREE.CubicBezierCurve3(
      mid.clone(),
      mid.clone().addScaledVector(midTan, h),
      p1.clone().addScaledVector(t1, -h),
      p1.clone()
    );

    return [c1, c2];
  }

  /**
   * Constructs crisp, typographically balanced monoline spline strokes for "Qatar Airways".
   */
  private buildQatarAirwaysStrokes(): THREE.Curve<THREE.Vector3>[] {
    const rawStrokes: RawGlyphStroke[] = [];

    const addOffsetStrokes = (uOffset: number, strokes: Array<Array<[number, number]>>) => {
      for (const pts of strokes) {
        rawStrokes.push({
          points: pts.map(([u, v]) => [u + uOffset, v])
        });
      }
    };

    const makeLowerA = (): Array<Array<[number, number]>> => [
      // Clean open bowl meeting right stem cleanly
      [
        [0.85, 0.78],
        [0.64, 1.02],
        [0.24, 0.98],
        [0.04, 0.66],
        [0.04, 0.32],
        [0.24, 0.03],
        [0.64, 0.05],
        [0.85, 0.30]
      ],
      // Crisp vertical right stem with subtle baseline flick
      [
        [0.86, 1.02],
        [0.86, 0.52],
        [0.86, 0.10],
        [0.94, 0.02]
      ]
    ];

    const makeLowerR = (): Array<Array<[number, number]>> => [
      [
        [0.10, 1.02],
        [0.10, 0.50],
        [0.10, 0.0]
      ],
      [
        [0.11, 0.68],
        [0.28, 0.97],
        [0.54, 1.02],
        [0.72, 0.88]
      ]
    ];

    // ==================== WORD 1: "Qatar" ====================
    // 1. Capital 'Q' (u = 0.00 .. 1.70)
    addOffsetStrokes(0.0, [
      [
        [1.12, 1.70],
        [0.74, 1.96],
        [0.26, 1.72],
        [0.04, 1.14],
        [0.10, 0.44],
        [0.45, 0.03],
        [0.98, 0.03],
        [1.34, 0.45],
        [1.42, 1.12],
        [1.24, 1.66],
        [0.96, 1.91]
      ],
      [
        [0.86, 0.42],
        [1.14, 0.12],
        [1.42, -0.15],
        [1.64, -0.20],
        [1.78, -0.10]
      ]
    ]);

    // 2. 'a' (u = 2.02 .. 2.96)
    addOffsetStrokes(2.02, makeLowerA());

    // 3. 't' (u = 3.28 .. 3.94)
    addOffsetStrokes(3.28, [
      [
        [0.34, 1.66],
        [0.34, 0.95],
        [0.34, 0.24],
        [0.46, 0.04],
        [0.66, 0.08]
      ],
      [
        [0.06, 1.02],
        [0.35, 1.02],
        [0.64, 1.02]
      ]
    ]);

    // 4. 'a' (u = 4.22 .. 5.16)
    addOffsetStrokes(4.22, makeLowerA());

    // 5. 'r' (u = 5.48 .. 6.20)
    addOffsetStrokes(5.48, makeLowerR());

    // ==================== WORD 2: "Airways" ====================
    // 6. Capital 'A' (u = 7.30 .. 8.74)
    addOffsetStrokes(7.30, [
      [
        [0.04, 0.0],
        [0.38, 0.98],
        [0.72, 1.96]
      ],
      [
        [0.72, 1.96],
        [1.06, 0.98],
        [1.40, 0.0]
      ],
      [
        [0.27, 0.68],
        [0.72, 0.68],
        [1.17, 0.68]
      ]
    ]);

    // 7. 'i' (u = 9.04 .. 9.30)
    addOffsetStrokes(9.04, [
      [
        [0.14, 1.02],
        [0.14, 0.50],
        [0.14, 0.08],
        [0.20, 0.02]
      ],
      // Crisp skywriter dot puff above 'i'
      [
        [0.06, 1.41],
        [0.14, 1.47],
        [0.22, 1.41]
      ]
    ]);

    // 8. 'r' (u = 9.58 .. 10.30)
    addOffsetStrokes(9.58, makeLowerR());

    // 9. 'w' (u = 10.60 .. 12.02)
    addOffsetStrokes(10.60, [
      [
        [0.04, 1.02],
        [0.20, 0.28],
        [0.36, 0.03],
        [0.54, 0.28],
        [0.71, 0.88]
      ],
      [
        [0.71, 0.88],
        [0.88, 0.28],
        [1.06, 0.03],
        [1.22, 0.28],
        [1.38, 1.02]
      ]
    ]);

    // 10. 'a' (u = 12.32 .. 13.26)
    addOffsetStrokes(12.32, makeLowerA());

    // 11. 'y' (u = 13.58 .. 14.44)
    addOffsetStrokes(13.58, [
      [
        [0.06, 1.02],
        [0.12, 0.34],
        [0.34, 0.05],
        [0.64, 0.10],
        [0.84, 0.38]
      ],
      [
        [0.86, 1.02],
        [0.85, 0.36],
        [0.78, -0.25],
        [0.56, -0.58],
        [0.26, -0.62],
        [0.08, -0.46]
      ]
    ]);

    // 12. 's' (u = 14.78 .. 15.64)
    addOffsetStrokes(14.78, [
      [
        [0.78, 0.84],
        [0.56, 1.03],
        [0.22, 0.98],
        [0.08, 0.76],
        [0.24, 0.56],
        [0.64, 0.44],
        [0.82, 0.24],
        [0.64, 0.03],
        [0.26, 0.02],
        [0.06, 0.18]
      ]
    ]);

    // Map glyph coordinates (u, v) into grand 3D sky space above the open Jack-in-the-Box
    const uCenter = 7.82;
    const scale = 1.02;
    const yBaseline = 2.40;
    const zBase = -0.65;

    return rawStrokes.map((stroke) => {
      const worldPts = stroke.points.map(([u, v]) => {
        const x = (u - uCenter) * scale;
        // Subtle horizon arch across the 16-unit sky span
        const archLift = 0.28 * Math.cos((x / 8.5) * Math.PI * 0.5);
        const y = yBaseline + v * scale + archLift;
        // Gentle 3D sculptural depth wave so parallax reveals authentic 3D spatial presence
        const z = zBase + Math.sin(u * 0.45) * 0.14;
        return new THREE.Vector3(x, y, z);
      });
      return new THREE.CatmullRomCurve3(worldPts, false, 'centripetal', 0.45);
    });
  }

  public resetRoll(): void {
    this.currentSmoothedRoll = 0;
  }

  /**
   * Evaluates a segment list at elapsed `timeSec`, computing arc-length parameterized
   * position, tangent, speed, and curvature-driven aerodynamic roll banking.
   */
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

    // Estimate lateral curvature for realistic aircraft banking roll
    const eps = 0.025;
    const uA = Math.max(0, localT - eps);
    const uB = Math.min(1, localT + eps);
    chosen.curve.getTangentAt(uA, this._tmpTanBehind).normalize();
    chosen.curve.getTangentAt(uB, this._tmpTanAhead).normalize();

    this._tmpCross.crossVectors(this._tmpTanBehind, this._tmpTanAhead);
    // Lateral turn around world Y induces roll around aircraft longitudinal axis
    let targetRoll = THREE.MathUtils.clamp(-this._tmpCross.y * 5.2, -1.05, 1.05);

    // Playful aviation wing-wave salute during the finale hero flyby!
    if (chosen.wingWave && localT > 0.36 && localT < 0.72) {
      const wavePhase = ((localT - 0.36) / 0.36) * Math.PI * 4;
      const env = Math.sin(((localT - 0.36) / 0.36) * Math.PI);
      targetRoll += Math.sin(wavePhase) * 0.46 * env;
    }

    const rollLerp = Math.min(1, Math.max(0.02, dt * 8.5));
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

  /**
   * Emits exact curve-aligned sub-steps across [tStart, tEnd] so discrete frame boundaries
   * never clip stroke endpoints (u = 0 or u = 1) or skip short punctuation strokes like 'i'.
   */
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
      const steps = Math.max(u0 === 0 || u1 === 1 ? 3 : 1, Math.ceil(arcSpan / 0.032));

      for (let s = 0; s <= steps; s++) {
        if (s === 0 && u0 > 0) continue; // u0 was already emitted at the end of the previous frame
        const u = u0 + (u1 - u0) * (s / steps);
        seg.curve.getPointAt(u, this._tmpPos);
        emitStep(this._tmpPos, true, seg.persistentSmoke, seg.strokeId);
      }
    }
  }
}
