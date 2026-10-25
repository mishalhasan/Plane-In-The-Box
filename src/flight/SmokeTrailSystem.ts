import * as THREE from 'three';

const MAX_PUFFS = 4800;

/**
 * High-performance 3D aerial skywriting system combining:
 * 1. Single-draw-call InstancedBufferGeometry billowing normal-lit FBM cloud puffs.
 * 2. Smooth core stroke ribbons ensuring crisp typographic continuity at any frame rate.
 */
export class SmokeTrailSystem {
  public readonly group = new THREE.Group();

  private puffGeo!: THREE.InstancedBufferGeometry;
  private puffMat!: THREE.ShaderMaterial;
  private puffMesh!: THREE.Mesh;

  private origins!: Float32Array;
  private birthAndFlags!: Float32Array; // x: birthTime, y: targetRadius, z: seed, w: isPersistent (1 or 0)
  private drifts!: Float32Array;

  private originAttr!: THREE.InstancedBufferAttribute;
  private birthAttr!: THREE.InstancedBufferAttribute;
  private driftAttr!: THREE.InstancedBufferAttribute;

  private writeCursor = 0;
  private activeCount = 0;

  // Sub-stepped emitter tracking
  private lastEmitPos = new THREE.Vector3();
  private hasLastEmitPos = false;
  private lastStrokeId = -999;
  private distanceRemainder = 0;

  // Persistent core ribbons per skywriting stroke for crisp letter spine legibility
  private readonly strokePoints = new Map<number, THREE.Vector3[]>();
  private readonly strokeCoreLines = new Map<number, THREE.Mesh>();
  private coreMat!: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.coreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#fbfaf7'),
      transparent: true,
      opacity: 0.58,
      depthWrite: false
    });

    this.buildInstancedCloudPuffs();
    scene.add(this.group);
  }

  private buildInstancedCloudPuffs(): void {
    const baseQuad = new THREE.PlaneGeometry(2, 2);
    this.puffGeo = new THREE.InstancedBufferGeometry();
    this.puffGeo.index = baseQuad.index;
    this.puffGeo.attributes.position = baseQuad.attributes.position;
    this.puffGeo.attributes.uv = baseQuad.attributes.uv;

    this.origins = new Float32Array(MAX_PUFFS * 3);
    this.birthAndFlags = new Float32Array(MAX_PUFFS * 4);
    this.drifts = new Float32Array(MAX_PUFFS * 3);

    // Initialize birth times far in the future/negative so unspawned instances discard
    for (let i = 0; i < MAX_PUFFS; i++) {
      this.birthAndFlags[i * 4] = -1000.0;
    }

    this.originAttr = new THREE.InstancedBufferAttribute(this.origins, 3);
    this.birthAttr = new THREE.InstancedBufferAttribute(this.birthAndFlags, 4);
    this.driftAttr = new THREE.InstancedBufferAttribute(this.drifts, 3);

    this.originAttr.setUsage(THREE.DynamicDrawUsage);
    this.birthAttr.setUsage(THREE.DynamicDrawUsage);
    this.driftAttr.setUsage(THREE.DynamicDrawUsage);

    this.puffGeo.setAttribute('iOrigin', this.originAttr);
    this.puffGeo.setAttribute('iBirthAndFlags', this.birthAttr);
    this.puffGeo.setAttribute('iDrift', this.driftAttr);
    this.puffGeo.instanceCount = 0;

    this.puffMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uGlobalFade: { value: 1.0 },
        uSunDir: { value: new THREE.Vector3(0.52, 0.74, 0.42).normalize() }
      },
      vertexShader: /* glsl */ `
        attribute vec3 iOrigin;
        attribute vec4 iBirthAndFlags;
        attribute vec3 iDrift;

        uniform float uTime;

        varying vec2 vUv;
        varying float vAlpha;
        varying float vSeed;
        varying float vAge;

        void main() {
          float birth = iBirthAndFlags.x;
          float targetRadius = iBirthAndFlags.y;
          float seed = iBirthAndFlags.z;
          float persistent = iBirthAndFlags.w;

          float age = uTime - birth;
          vUv = uv;
          vSeed = seed;
          vAge = age;

          if (birth < -500.0 || age < 0.0) {
            vAlpha = 0.0;
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
          }

          vec3 worldCenter = iOrigin;
          float radius = targetRadius;
          float alpha = 0.0;

          if (persistent > 0.5) {
            // Skywriting lettering: starts tight at tail nozzle, billows into lush cloud stroke,
            // then gently breathes in place without drifting out of typographic alignment!
            float bloom = 1.0 - exp(-age * 4.6);
            radius = mix(0.032, targetRadius, bloom);

            // Bounded gentle high-altitude cloud undulation
            float settle = smoothstep(0.0, 0.8, age);
            worldCenter += iDrift * (0.022 * settle) + vec3(
              sin(uTime * 0.9 + seed * 6.28) * 0.014,
              cos(uTime * 0.75 + seed * 4.1) * 0.016,
              sin(uTime * 0.6 + seed * 3.3) * 0.014
            ) * settle;

            alpha = mix(0.75, 0.44, bloom);
          } else {
            // Ephemeral aerobatic / flyby contrail: expands, drifts, and dissolves cleanly
            float life = 2.65;
            if (age > life) {
              vAlpha = 0.0;
              gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
              return;
            }
            float p = age / life;
            radius = mix(0.035, targetRadius * 1.85, pow(p, 0.65));
            worldCenter += iDrift * (age * 0.22) + vec3(0.0, age * 0.08, 0.0);
            alpha = (1.0 - smoothstep(0.15, 1.0, p)) * 0.42;
          }

          vAlpha = alpha;

          // Camera-facing billboard rotation in view space
          vec4 mvCenter = viewMatrix * vec4(worldCenter, 1.0);
          float angle = seed * 6.2831853 + age * (persistent > 0.5 ? 0.08 : 0.28);
          float cs = cos(angle);
          float sn = sin(angle);
          vec2 rotatedQuad = vec2(
            position.x * cs - position.y * sn,
            position.x * sn + position.y * cs
          );

          mvCenter.xy += rotatedQuad * radius;
          gl_Position = projectionMatrix * mvCenter;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uGlobalFade;
        uniform vec3 uSunDir;

        varying vec2 vUv;
        varying float vAlpha;
        varying float vSeed;
        varying float vAge;

        float hash21(vec2 p) {
          p = fract(p * vec2(234.34, 435.345));
          p += dot(p, p + 34.23);
          return fract(p.x * p.y);
        }

        float valueNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        float fbm(vec2 p) {
          float v = 0.0;
          v += 0.55 * valueNoise(p);
          v += 0.30 * valueNoise(p * 2.15 + 4.7);
          v += 0.15 * valueNoise(p * 4.30 + 9.2);
          return v;
        }

        void main() {
          if (vAlpha <= 0.004) discard;

          vec2 p = vUv * 2.0 - 1.0;
          float r2 = dot(p, p);
          if (r2 > 1.0) discard;

          // Sculpted billowing cauliflower cloud silhouette via FBM edge erosion
          vec2 noiseCoord = p * 1.85 + vec2(vSeed * 13.7, vSeed * 7.3) + uTime * 0.06;
          float n = fbm(noiseCoord);
          float radial = sqrt(r2);

          // Soft eroded cloud mask
          float cloudDensity = smoothstep(0.96, 0.18, radial - (n - 0.5) * 0.38);
          float finalAlpha = cloudDensity * vAlpha * uGlobalFade;
          if (finalAlpha < 0.006) discard;

          // Pseudo-volumetric spherical + FBM-perturbed normal for rich sunlight/shadow shading
          float nz = sqrt(max(0.08, 1.0 - r2));
          vec3 pseudoNormal = normalize(vec3(
            p.x + (n - 0.5) * 0.45,
            p.y + (n - 0.5) * 0.45,
            nz
          ));

          float sunDiffuse = clamp(dot(pseudoNormal, uSunDir) * 0.5 + 0.5, 0.0, 1.0);

          // Shadowed cool silver-periwinkle underside -> sunlit warm ivory-white crown
          vec3 shadowCol = vec3(0.76, 0.81, 0.92);
          vec3 midCol = vec3(0.93, 0.94, 0.97);
          vec3 litCol = vec3(1.0, 0.99, 0.96);

          vec3 col = mix(shadowCol, midCol, smoothstep(0.0, 0.55, sunDiffuse));
          col = mix(col, litCol, smoothstep(0.48, 0.95, sunDiffuse));

          // Freshly injected smoke right at the aircraft nozzle is pure condensed white
          float freshBoost = exp(-vAge * 6.0);
          col = mix(col, vec3(1.0), freshBoost * 0.65);

          gl_FragColor = vec4(col, finalAlpha);
        }
      `
    });

    this.puffMesh = new THREE.Mesh(this.puffGeo, this.puffMat);
    this.puffMesh.frustumCulled = false;
    this.puffMesh.renderOrder = 3;
    this.group.add(this.puffMesh);
  }

  public getActivePuffCount(): number {
    return this.activeCount;
  }

  public getCompletedStrokeCount(): number {
    return this.strokePoints.size;
  }

  public setGlobalFade(fade: number): void {
    this.puffMat.uniforms.uGlobalFade.value = fade;
    this.coreMat.opacity = 0.58 * fade;
  }

  public reset(): void {
    this.writeCursor = 0;
    this.activeCount = 0;
    this.puffGeo.instanceCount = 0;
    for (let i = 0; i < MAX_PUFFS; i++) {
      this.birthAndFlags[i * 4] = -1000.0;
    }
    this.birthAttr.needsUpdate = true;

    this.hasLastEmitPos = false;
    this.lastStrokeId = -999;
    this.distanceRemainder = 0;

    for (const mesh of this.strokeCoreLines.values()) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    this.strokeCoreLines.clear();
    this.strokePoints.clear();
    this.setGlobalFade(1.0);
  }

  /**
   * Emits sub-stepped volumetric smoke puffs and updates core stroke tubes along the aircraft's tail nozzle path.
   */
  public emitAt(
    worldPos: THREE.Vector3,
    elapsed: number,
    emitActive: boolean,
    persistent: boolean,
    strokeId: number
  ): void {
    this.puffMat.uniforms.uTime.value = elapsed;

    if (!emitActive) {
      if (this.hasLastEmitPos && this.lastStrokeId > 0 && this.distanceRemainder > 0.005) {
        this.spawnSinglePuff(this.lastEmitPos, elapsed, true);
      }
      this.hasLastEmitPos = false;
      this.lastStrokeId = -999;
      this.distanceRemainder = 0;
      return;
    }

    // Start a fresh stroke cleanly when strokeId changes (never bridge across pen-lifts!)
    if (!this.hasLastEmitPos || strokeId !== this.lastStrokeId) {
      this.lastEmitPos.copy(worldPos);
      this.hasLastEmitPos = true;
      this.lastStrokeId = strokeId;
      this.distanceRemainder = 0;

      this.spawnSinglePuff(worldPos, elapsed, persistent);
      if (persistent && strokeId > 0) {
        this.spawnSinglePuff(worldPos, elapsed, true);
        this.appendCorePoint(strokeId, worldPos);
      }
      return;
    }

    const stepDist = persistent ? 0.036 : 0.075;
    const segVec = new THREE.Vector3().subVectors(worldPos, this.lastEmitPos);
    const segLen = segVec.length();

    if (segLen < 0.0001) return;

    const dir = segVec.clone().divideScalar(segLen);
    let travelled = stepDist - this.distanceRemainder;

    const interpPos = new THREE.Vector3();
    while (travelled <= segLen) {
      interpPos.copy(this.lastEmitPos).addScaledVector(dir, travelled);
      this.spawnSinglePuff(interpPos, elapsed, persistent);
      travelled += stepDist;
    }

    this.distanceRemainder = segLen - (travelled - stepDist);
    this.lastEmitPos.copy(worldPos);

    if (persistent && strokeId > 0) {
      this.appendCorePoint(strokeId, worldPos);
    }
  }

  public updateTime(elapsed: number): void {
    this.puffMat.uniforms.uTime.value = elapsed;
  }

  private spawnSinglePuff(pos: THREE.Vector3, birthTime: number, persistent: boolean): void {
    const idx = this.writeCursor;
    this.writeCursor = (this.writeCursor + 1) % MAX_PUFFS;
    if (this.activeCount < MAX_PUFFS) {
      this.activeCount++;
      this.puffGeo.instanceCount = this.activeCount;
    }

    const jitter = persistent ? 0.014 : 0.025;
    this.origins[idx * 3] = pos.x + (Math.random() - 0.5) * jitter;
    this.origins[idx * 3 + 1] = pos.y + (Math.random() - 0.5) * jitter;
    this.origins[idx * 3 + 2] = pos.z + (Math.random() - 0.5) * jitter;

    const baseRadius = persistent
      ? 0.092 + Math.random() * 0.030
      : 0.13 + Math.random() * 0.05;

    this.birthAndFlags[idx * 4] = birthTime;
    this.birthAndFlags[idx * 4 + 1] = baseRadius;
    this.birthAndFlags[idx * 4 + 2] = Math.random();
    this.birthAndFlags[idx * 4 + 3] = persistent ? 1.0 : 0.0;

    this.drifts[idx * 3] = (Math.random() - 0.5) * 0.9;
    this.drifts[idx * 3 + 1] = (Math.random() - 0.35) * 0.9;
    this.drifts[idx * 3 + 2] = (Math.random() - 0.5) * 0.9;

    this.originAttr.needsUpdate = true;
    this.birthAttr.needsUpdate = true;
    this.driftAttr.needsUpdate = true;
  }

  private appendCorePoint(strokeId: number, pos: THREE.Vector3): void {
    let pts = this.strokePoints.get(strokeId);
    if (!pts) {
      pts = [pos.clone()];
      this.strokePoints.set(strokeId, pts);
      return;
    }

    const last = pts[pts.length - 1];
    if (last.distanceToSquared(pos) < 0.0008) {
      return;
    }
    pts.push(pos.clone());

    if (pts.length < 2) return;

    const existing = this.strokeCoreLines.get(strokeId);
    if (existing) {
      this.group.remove(existing);
      existing.geometry.dispose();
    }

    const curve =
      pts.length === 2
        ? new THREE.LineCurve3(pts[0], pts[1])
        : new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.4);

    const tubularSegs = Math.min(96, Math.max(4, pts.length * 2));
    const tubeGeo = new THREE.TubeGeometry(curve, tubularSegs, 0.038, 6, false);
    const mesh = new THREE.Mesh(tubeGeo, this.coreMat);
    mesh.renderOrder = 2;
    this.group.add(mesh);
    this.strokeCoreLines.set(strokeId, mesh);
  }
}
