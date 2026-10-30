import * as THREE from 'three';
import {
  AIRWAYS_WORDMARK_PATH,
  ORYX_EMBLEM_PATH,
  QATAR_WORDMARK_PATH
} from '../models/QatarLiveryPaths';
import { ORYX_WORLD_CONFIG, oryxSvgToWorld } from './OryxFinaleChoreographer';

function createSeededRng(seed = 20261030): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Renders the controlled 3D smoke-particle emblem completion and the official
 * "QATAR AIRWAYS" wordmark reveal beneath the smoke-drawn Arabian Oryx:
 * 1. ~1,150 instanced 3D FBM cloud particles sampled strictly inside ORYX_EMBLEM_PATH
 *    with clearance-calibrated radii that preserve crisp negative space between the
 *    twin horns, facial mask, ear notch, and 4 wind-swept horizontal mane stripes.
 * 2. Cohesive volumetric FBM cloud-silhouette core aligned 1:1 with the aircraft's
 *    primary skywriting strokes so fine vector horn tips and wind stripes read unmistakably.
 * 3. High-resolution official flared-serif "QATAR AIRWAYS" 3D sky wordmark underneath.
 */
export class OryxEmblemReveal {
  public readonly group = new THREE.Group();

  private cloudCoreMesh!: THREE.Mesh;
  private cloudCoreMat!: THREE.ShaderMaterial;

  private particleMesh!: THREE.Mesh;
  private particleMat!: THREE.ShaderMaterial;
  private particleCount = 0;

  private wordmarkMesh!: THREE.Mesh;
  private wordmarkMat!: THREE.ShaderMaterial;
  private readonly wordmarkBaseY = 2.02;

  private emblemProgress = 0;
  private wordmarkProgress = 0;

  private readonly padSvg = 5.0;
  private readonly boxMinX = ORYX_WORLD_CONFIG.svgMinX - this.padSvg;
  private readonly boxMaxX = ORYX_WORLD_CONFIG.svgMaxX + this.padSvg;
  private readonly boxMinY = ORYX_WORLD_CONFIG.svgMinY - this.padSvg;
  private readonly boxMaxY = ORYX_WORLD_CONFIG.svgMaxY + this.padSvg;

  constructor(scene: THREE.Scene) {
    this.buildVolumetricCloudCore();
    this.buildControlledSmokeParticles();
    this.buildWordmarkPlane();

    this.reset();
    scene.add(this.group);
  }

  public getEmblemProgress(): number {
    return this.emblemProgress;
  }

  public getWordmarkProgress(): number {
    return this.wordmarkProgress;
  }

  public getParticleCount(): number {
    return this.particleCount;
  }

  private buildVolumetricCloudCore(): void {
    const texSize = 1024;
    const svgW = this.boxMaxX - this.boxMinX;
    const svgH = this.boxMaxY - this.boxMinY;
    const oryxPath = new Path2D(ORYX_EMBLEM_PATH);

    // Pass 1: Soft outer atmospheric cloud halo
    const haloCanvas = document.createElement('canvas');
    haloCanvas.width = texSize;
    haloCanvas.height = texSize;
    const hCtx = haloCanvas.getContext('2d')!;
    hCtx.clearRect(0, 0, texSize, texSize);
    hCtx.save();
    hCtx.shadowColor = 'rgba(255, 255, 255, 1.0)';
    hCtx.shadowBlur = 20;
    hCtx.scale(texSize / svgW, texSize / svgH);
    hCtx.translate(-this.boxMinX, -this.boxMinY);
    hCtx.fillStyle = '#ffffff';
    hCtx.fill(oryxPath);
    hCtx.restore();
    const haloData = hCtx.getImageData(0, 0, texSize, texSize).data;

    // Pass 2: Crisp official Oryx vector mask with delicate cloud anti-aliasing
    const crispCanvas = document.createElement('canvas');
    crispCanvas.width = texSize;
    crispCanvas.height = texSize;
    const cCtx = crispCanvas.getContext('2d')!;
    cCtx.clearRect(0, 0, texSize, texSize);
    cCtx.save();
    cCtx.shadowColor = 'rgba(255, 255, 255, 0.9)';
    cCtx.shadowBlur = 2.2;
    cCtx.scale(texSize / svgW, texSize / svgH);
    cCtx.translate(-this.boxMinX, -this.boxMinY);
    cCtx.fillStyle = '#ffffff';
    cCtx.fill(oryxPath);
    cCtx.restore();
    const crispData = cCtx.getImageData(0, 0, texSize, texSize).data;

    // Pack R = crisp silhouette alpha, G = soft vapor halo, B = radial reveal wave
    const packed = new Uint8Array(texSize * texSize * 4);
    for (let py = 0; py < texSize; py++) {
      const svgY = this.boxMinY + (py / texSize) * svgH;
      const normY = svgY / 75.0;
      // Flip Y into Three.js DataTexture row order so v=1 is top (py=0) and v=0 is bottom
      const dstRow = texSize - 1 - py;
      for (let px = 0; px < texSize; px++) {
        const srcIdx = (py * texSize + px) * 4;
        const dstIdx = (dstRow * texSize + px) * 4;

        const svgX = this.boxMinX + (px / texSize) * svgW;
        const normX = (svgX - 220.0) / 76.0;
        const wave = Math.min(1.0, Math.hypot((normX - 0.34) * 1.12, (normY - 0.48) * 0.94));

        packed[dstIdx] = crispData[srcIdx + 3];
        packed[dstIdx + 1] = haloData[srcIdx + 3];
        packed[dstIdx + 2] = Math.round(wave * 255);
        packed[dstIdx + 3] = 255;
      }
    }

    const maskTex = new THREE.DataTexture(packed, texSize, texSize, THREE.RGBAFormat);
    maskTex.minFilter = THREE.LinearMipmapLinearFilter;
    maskTex.magFilter = THREE.LinearFilter;
    maskTex.generateMipmaps = true;
    maskTex.needsUpdate = true;

    const minCorner = oryxSvgToWorld(this.boxMinX, this.boxMaxY, 0);
    const maxCorner = oryxSvgToWorld(this.boxMaxX, this.boxMinY, 0);
    const planeW = maxCorner.x - minCorner.x;
    const planeH = maxCorner.y - minCorner.y;
    const centerX = (minCorner.x + maxCorner.x) * 0.5;
    const centerY = (minCorner.y + maxCorner.y) * 0.5;

    const geo = new THREE.PlaneGeometry(planeW, planeH);

    this.cloudCoreMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      uniforms: {
        uMaskTex: { value: maskTex },
        uTime: { value: 0 },
        uReveal: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.52, 0.74, 0.42).normalize() }
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMaskTex;
        uniform float uTime;
        uniform float uReveal;
        uniform vec3 uSunDir;

        varying vec2 vUv;

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
          v += 0.52 * valueNoise(p);
          v += 0.31 * valueNoise(p * 2.15 + 4.3);
          v += 0.17 * valueNoise(p * 4.45 + 8.9);
          return v;
        }

        void main() {
          if (uReveal <= 0.002) discard;

          vec4 maskSample = texture2D(uMaskTex, vUv);
          float crisp = maskSample.r;
          float halo = maskSample.g;
          float wave = maskSample.b;

          if (halo <= 0.015 && crisp <= 0.01) discard;

          // Multi-scale animated skywriting cloud turbulence
          vec2 cloudUv = vUv * 12.5 + vec2(uTime * 0.018, -uTime * 0.012);
          float n1 = fbm(cloudUv);
          float n2 = fbm(vUv * 26.0 - vec2(uTime * 0.025, 0.0));
          float cloudTex = mix(n1, n2, 0.38);

          // Progressive wave-front condensation outward from aircraft-drawn head/horn strokes
          float threshold = clamp(wave * 0.72 + (n1 - 0.5) * 0.12, 0.0, 0.76);
          float revealMask = smoothstep(threshold, threshold + 0.24, uReveal);
          if (revealMask <= 0.004) discard;

          // Preserve 100% razor-sharp negative-space cutouts while giving organic cloud texture inside
          float coreDensity = smoothstep(0.08, 0.72, crisp - (cloudTex - 0.50) * 0.24);
          // Delicate outer wispy vapor aura strictly outside solid contours without clogging narrow cutouts
          float outerWisp = (1.0 - crisp) * smoothstep(0.42, 0.94, halo) * smoothstep(0.42, 0.80, cloudTex) * 0.19;

          // Billowing internal cloud modulation so silhouette reads as living skywriting smoke
          float internalBillow = mix(0.66, 0.94, cloudTex);
          float alpha = (coreDensity * internalBillow * 0.80 + outerWisp) * revealMask;
          if (alpha <= 0.006) discard;

          // Perturbed cloud-relief normal for rich sunlit ivory crown & silver-periwinkle shadow
          float eps = 0.0035;
          float hR = texture2D(uMaskTex, vUv + vec2(eps, 0.0)).g;
          float hL = texture2D(uMaskTex, vUv - vec2(eps, 0.0)).g;
          float hU = texture2D(uMaskTex, vUv + vec2(0.0, eps)).g;
          float hD = texture2D(uMaskTex, vUv - vec2(0.0, eps)).g;

          vec3 normal = normalize(vec3(
            (hL - hR) * 1.45 + (n1 - 0.5) * 0.55,
            (hD - hU) * 1.45 + (n2 - 0.5) * 0.55,
            0.85
          ));

          float sunDiffuse = clamp(dot(normal, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
          vec3 shadowCol = vec3(0.77, 0.82, 0.93);
          vec3 midCol = vec3(0.93, 0.95, 0.98);
          vec3 litCol = vec3(1.0, 0.99, 0.96);

          vec3 col = mix(shadowCol, midCol, smoothstep(0.0, 0.55, sunDiffuse));
          col = mix(col, litCol, smoothstep(0.46, 0.94, sunDiffuse));

          // Subtle fresh-condensation brightness shimmer right along the active reveal wave-front
          float waveFrontGlow = (1.0 - revealMask) * revealMask * 4.0;
          col = mix(col, vec3(1.0, 0.99, 0.97), waveFrontGlow * 0.45);

          gl_FragColor = vec4(col, alpha);
        }
      `
    });

    this.cloudCoreMesh = new THREE.Mesh(geo, this.cloudCoreMat);
    this.cloudCoreMesh.position.set(centerX, centerY, ORYX_WORLD_CONFIG.worldZ);
    this.cloudCoreMesh.renderOrder = 2;
    this.group.add(this.cloudCoreMesh);
  }

  private buildControlledSmokeParticles(): void {
    const gridN = 256;
    const svgW = this.boxMaxX - this.boxMinX;
    const svgH = this.boxMaxY - this.boxMinY;

    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = gridN;
    sampleCanvas.height = gridN;
    const ctx = sampleCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, gridN, gridN);
    ctx.save();
    ctx.scale(gridN / svgW, gridN / svgH);
    ctx.translate(-this.boxMinX, -this.boxMinY);
    ctx.fillStyle = '#ffffff';
    ctx.fill(new Path2D(ORYX_EMBLEM_PATH));
    ctx.restore();

    const img = ctx.getImageData(0, 0, gridN, gridN).data;
    const inside = new Uint8Array(gridN * gridN);
    for (let i = 0; i < gridN * gridN; i++) {
      inside[i] = img[i * 4 + 3] >= 128 ? 1 : 0;
    }

    // Compute clearance (in grid pixels) to nearest negative-space boundary so puffs never clog cutouts
    const clearance = new Uint8Array(gridN * gridN);
    const dirs: Array<[number, number]> = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [-1, 1], [1, -1], [-1, -1]
    ];
    for (let y = 0; y < gridN; y++) {
      for (let x = 0; x < gridN; x++) {
        const idx = y * gridN + x;
        if (!inside[idx]) continue;
        let maxR = 7;
        for (let r = 1; r <= 6; r++) {
          let hitOut = false;
          for (const [dx, dy] of dirs) {
            const nx = x + dx * r;
            const ny = y + dy * r;
            if (nx < 0 || nx >= gridN || ny < 0 || ny >= gridN || !inside[ny * gridN + nx]) {
              hitOut = true;
              break;
            }
          }
          if (hitOut) {
            maxR = r;
            break;
          }
        }
        clearance[idx] = maxR;
      }
    }

    const rng = createSeededRng(774001);
    const originsArr: number[] = [];
    const paramsArr: number[] = []; // x: targetRadius, y: revealThreshold, z: seed, w: baseAlpha
    const swirlArr: number[] = [];

    const addParticle = (px: number, py: number, isContour: boolean) => {
      const idx = py * gridN + px;
      const clr = clearance[idx];
      const svgX = this.boxMinX + ((px + 0.5) / gridN) * svgW;
      const svgY = this.boxMinY + ((py + 0.5) / gridN) * svgH;

      const zOff = (rng() - 0.5) * (isContour ? 0.042 : 0.088);
      const worldPos = oryxSvgToWorld(svgX, svgY, zOff);

      const radius = isContour
        ? (0.025 + Math.min(3, clr) * 0.0085) * (0.88 + rng() * 0.24)
        : Math.min(0.105, 0.036 + clr * 0.0105) * (0.88 + rng() * 0.26);

      const normX = (svgX - 220.0) / 76.0;
      const normY = svgY / 75.0;
      const wave = Math.min(1.0, Math.hypot((normX - 0.34) * 1.12, (normY - 0.48) * 0.94));
      const threshold = Math.max(0.0, Math.min(0.75, wave * 0.72 + (rng() - 0.5) * 0.10));
      const baseAlpha = isContour ? 0.50 : 0.36;

      originsArr.push(worldPos.x, worldPos.y, worldPos.z);
      paramsArr.push(radius, threshold, rng(), baseAlpha);

      // Gentle aerodynamic swirl offset so smoke particles visibly condense inward onto the Oryx
      const angle = rng() * Math.PI * 2;
      const swirlMag = 0.18 + rng() * 0.20;
      swirlArr.push(
        Math.cos(angle) * swirlMag - 0.10,
        Math.sin(angle) * swirlMag * 0.75 - 0.05,
        (rng() - 0.5) * 0.26
      );
    };

    // 1. Stratified fine contour particles along horns, ear, facial mask & 4 wind-swept mane stripes
    const contourStep = 3;
    for (let gy = 0; gy < gridN; gy += contourStep) {
      for (let gx = 0; gx < gridN; gx += contourStep) {
        const px = Math.min(gridN - 1, gx + Math.floor(rng() * contourStep));
        const py = Math.min(gridN - 1, gy + Math.floor(rng() * contourStep));
        const clr = clearance[py * gridN + px];
        if (clr >= 1 && clr <= 3) {
          addParticle(px, py, true);
        }
      }
    }

    // 2. Stratified volumetric cloud-body puffs inside head, crown & neck
    const bodyStep = 5;
    for (let gy = 0; gy < gridN; gy += bodyStep) {
      for (let gx = 0; gx < gridN; gx += bodyStep) {
        const px = Math.min(gridN - 1, gx + Math.floor(rng() * bodyStep));
        const py = Math.min(gridN - 1, gy + Math.floor(rng() * bodyStep));
        const clr = clearance[py * gridN + px];
        if (clr >= 3) {
          addParticle(px, py, false);
        }
      }
    }

    this.particleCount = paramsArr.length / 4;

    const baseQuad = new THREE.PlaneGeometry(2, 2);
    const instGeo = new THREE.InstancedBufferGeometry();
    instGeo.index = baseQuad.index;
    instGeo.attributes.position = baseQuad.attributes.position;
    instGeo.attributes.uv = baseQuad.attributes.uv;

    instGeo.setAttribute('iOrigin', new THREE.InstancedBufferAttribute(new Float32Array(originsArr), 3));
    instGeo.setAttribute('iParams', new THREE.InstancedBufferAttribute(new Float32Array(paramsArr), 4));
    instGeo.setAttribute('iSwirl', new THREE.InstancedBufferAttribute(new Float32Array(swirlArr), 3));
    instGeo.instanceCount = this.particleCount;

    this.particleMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uReveal: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.52, 0.74, 0.42).normalize() }
      },
      vertexShader: /* glsl */ `
        attribute vec3 iOrigin;
        attribute vec4 iParams;
        attribute vec3 iSwirl;

        uniform float uTime;
        uniform float uReveal;

        varying vec2 vUv;
        varying float vAlpha;
        varying float vSeed;
        varying float vCondense;

        void main() {
          float targetRadius = iParams.x;
          float threshold = iParams.y;
          float seed = iParams.z;
          float baseAlpha = iParams.w;

          vUv = uv;
          vSeed = seed;

          float localP = clamp((uReveal - threshold) / 0.25, 0.0, 1.0);
          vCondense = localP;

          if (localP <= 0.001) {
            vAlpha = 0.0;
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
          }

          float easeIn = smoothstep(0.0, 1.0, localP);
          // Condense smoothly from swirling wake offset onto exact Oryx contour, then gently breathe
          vec3 breathe = vec3(
            sin(uTime * 0.85 + seed * 6.283) * 0.008,
            cos(uTime * 0.72 + seed * 4.712) * 0.009,
            sin(uTime * 0.60 + seed * 3.141) * 0.008
          ) * easeIn;

          vec3 worldCenter = iOrigin + iSwirl * (1.0 - easeIn) + breathe;
          float radius = targetRadius * mix(0.45, 1.0, easeIn);
          vAlpha = baseAlpha * smoothstep(0.0, 0.65, localP);

          vec4 mvCenter = viewMatrix * vec4(worldCenter, 1.0);
          float angle = seed * 6.2831853 + uTime * 0.06 + (1.0 - easeIn) * 0.9;
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
        uniform vec3 uSunDir;

        varying vec2 vUv;
        varying float vAlpha;
        varying float vSeed;
        varying float vCondense;

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

          vec2 noiseCoord = p * 1.85 + vec2(vSeed * 13.7, vSeed * 7.3) + uTime * 0.05;
          float n = fbm(noiseCoord);
          float radial = sqrt(r2);

          float cloudDensity = smoothstep(0.95, 0.20, radial - (n - 0.5) * 0.36);
          float finalAlpha = cloudDensity * vAlpha;
          if (finalAlpha < 0.006) discard;

          float nz = sqrt(max(0.08, 1.0 - r2));
          vec3 pseudoNormal = normalize(vec3(
            p.x + (n - 0.5) * 0.45,
            p.y + (n - 0.5) * 0.45,
            nz
          ));

          float sunDiffuse = clamp(dot(pseudoNormal, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
          vec3 shadowCol = vec3(0.76, 0.81, 0.92);
          vec3 midCol = vec3(0.93, 0.94, 0.97);
          vec3 litCol = vec3(1.0, 0.99, 0.96);

          vec3 col = mix(shadowCol, midCol, smoothstep(0.0, 0.55, sunDiffuse));
          col = mix(col, litCol, smoothstep(0.48, 0.95, sunDiffuse));

          // Subtle luminous flash as smoke wisps first condense
          float fresh = (1.0 - vCondense) * 0.55;
          col = mix(col, vec3(1.0), fresh);

          gl_FragColor = vec4(col, finalAlpha);
        }
      `
    });

    this.particleMesh = new THREE.Mesh(instGeo, this.particleMat);
    this.particleMesh.frustumCulled = false;
    this.particleMesh.renderOrder = 3;
    this.group.add(this.particleMesh);
  }

  private buildWordmarkPlane(): void {
    const w = 2048;
    const h = 512;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);

    const qatarPath = new Path2D(QATAR_WORDMARK_PATH);
    const airwaysPath = new Path2D(AIRWAYS_WORDMARK_PATH);
    const airwaysScale = 42.51 / 14.41; // Exact matched cap height across QATAR and AIRWAYS
    const totalUnits = 440.0;
    const scalePx = 3.92;
    const drawnWidth = totalUnits * scalePx;
    const ox = (w - drawnWidth) * 0.5;
    const oy = 164;

    const renderBrandLockup = (fillStyle: string, glowColor: string, glowBlur: number) => {
      ctx.save();
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = glowBlur;
      ctx.fillStyle = fillStyle;

      // "QATAR"
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(scalePx, scalePx);
      ctx.translate(0, -16.25);
      ctx.fill(qatarPath);
      ctx.restore();

      // "AIRWAYS"
      ctx.save();
      ctx.translate(ox + 222.2 * scalePx, oy);
      ctx.scale(scalePx * airwaysScale, scalePx * airwaysScale);
      ctx.translate(-48.2, -65.35);
      ctx.fill(airwaysPath);
      ctx.restore();

      ctx.restore();
    };

    // Render pure white silhouette + soft halo so linear texture filtering never picks up dark RGB fringes
    renderBrandLockup('rgba(255, 255, 255, 0.28)', 'rgba(255, 255, 255, 0.55)', 20);
    renderBrandLockup('#ffffff', 'rgba(255, 255, 255, 0.35)', 3);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    tex.needsUpdate = true;

    const planeW = 5.44;
    const planeH = 1.36;
    const geo = new THREE.PlaneGeometry(planeW, planeH);

    this.wordmarkMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTex: { value: tex },
        uReveal: { value: 0 }
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex;
        uniform float uReveal;
        varying vec2 vUv;

        void main() {
          if (uReveal <= 0.002) discard;

          float mask = texture2D(uTex, vUv).a;
          if (mask <= 0.004) discard;

          // Graceful center-weighted horizontal reveal with travelling champagne-gold sheen
          float distFromCenter = abs(vUv.x - 0.5) * 2.0;
          float wipe = smoothstep(distFromCenter * 0.52, distFromCenter * 0.52 + 0.42, uReveal);
          float alpha = mask * wipe;
          if (alpha <= 0.004) discard;

          // Soft champagne-gold ambient aura transitioning into crisp luminous ivory-pearl letterforms
          float core = smoothstep(0.24, 0.68, mask);
          vec3 glowCol = vec3(0.84, 0.64, 0.32);
          vec3 ivoryCol = vec3(0.96, 0.93, 0.87);
          vec3 col = mix(glowCol, ivoryCol, core);

          float sheenPos = mix(-0.15, 1.15, smoothstep(0.05, 0.95, uReveal));
          float sheen = exp(-pow((vUv.x - sheenPos) * 7.5, 2.0)) * (1.0 - smoothstep(0.88, 1.0, uReveal));
          col = mix(col, vec3(1.0, 0.88, 0.58), sheen * 0.55);

          gl_FragColor = vec4(col, alpha);
        }
      `
    });

    this.wordmarkMesh = new THREE.Mesh(geo, this.wordmarkMat);
    this.wordmarkMesh.position.set(0.0, this.wordmarkBaseY, ORYX_WORLD_CONFIG.worldZ + 0.04);
    this.wordmarkMesh.renderOrder = 4;
    this.group.add(this.wordmarkMesh);
  }

  public update(elapsed: number, emblemProgress: number, wordmarkProgress: number): void {
    this.emblemProgress = THREE.MathUtils.clamp(emblemProgress, 0, 1);
    this.wordmarkProgress = THREE.MathUtils.clamp(wordmarkProgress, 0, 1);

    const showEmblem = this.emblemProgress > 0.001;
    const showWordmark = this.wordmarkProgress > 0.001;

    this.cloudCoreMesh.visible = showEmblem;
    this.particleMesh.visible = showEmblem;
    this.wordmarkMesh.visible = showWordmark;

    if (showEmblem) {
      this.cloudCoreMat.uniforms.uTime.value = elapsed;
      this.cloudCoreMat.uniforms.uReveal.value = this.emblemProgress;

      this.particleMat.uniforms.uTime.value = elapsed;
      this.particleMat.uniforms.uReveal.value = this.emblemProgress;
    }

    if (showWordmark) {
      const easedWord = THREE.MathUtils.smoothstep(this.wordmarkProgress, 0, 1);
      this.wordmarkMat.uniforms.uReveal.value = easedWord;
      this.wordmarkMesh.position.y = this.wordmarkBaseY - (1.0 - easedWord) * 0.08;
    }
  }

  public reset(): void {
    this.emblemProgress = 0;
    this.wordmarkProgress = 0;
    this.cloudCoreMat.uniforms.uReveal.value = 0;
    this.particleMat.uniforms.uReveal.value = 0;
    this.wordmarkMat.uniforms.uReveal.value = 0;
    this.cloudCoreMesh.visible = false;
    this.particleMesh.visible = false;
    this.wordmarkMesh.visible = false;
    this.wordmarkMesh.position.y = this.wordmarkBaseY - 0.08;
  }
}
