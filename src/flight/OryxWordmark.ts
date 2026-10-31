import * as THREE from 'three';
import { AIRWAYS_WORDMARK_PATH, QATAR_WORDMARK_PATH } from '../models/QatarLiveryPaths';
import { ORYX_WORLD_CONFIG } from './OryxFinaleChoreographer';

/**
 * Renders the refined 3D "QATAR AIRWAYS" sky wordmark centered directly beneath
 * the physically smoke-drawn Oryx emblem after the Oryx outline is completed.
 *
 * Uses the official Qatar Airways flared-serif vector typography with a soft
 * atmospheric cloud-vapor halo and sunlit pearl-ivory shading so the wordmark
 * sits naturally in the 3D twilight sky stage above the open Jack-in-the-Box.
 */
export class OryxWordmark {
  public readonly group = new THREE.Group();

  private wordmarkMesh!: THREE.Mesh;
  private wordmarkMat!: THREE.ShaderMaterial;

  /** Centered cleanly between the open box lid (y ~ 1.50) and Oryx neck base (y ~ 2.38) */
  private readonly wordmarkBaseY = 1.93;
  private revealProgress = 0;

  constructor(scene: THREE.Scene) {
    this.buildWordmarkPlane();
    this.reset();
    scene.add(this.group);
  }

  public getRevealProgress(): number {
    return this.revealProgress;
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
    const airwaysScale = 42.51 / 14.41; // Matched cap height across QATAR and AIRWAYS
    const totalUnits = 440.0;
    const scalePx = 3.92;
    const drawnWidth = totalUnits * scalePx;
    const ox = (w - drawnWidth) * 0.5;
    const oy = 172;

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

    // Pure white alpha mask + atmospheric vapor halo (avoids dark premultiplied RGB fringes)
    renderBrandLockup('rgba(255, 255, 255, 0.26)', 'rgba(255, 255, 255, 0.52)', 18);
    renderBrandLockup('#ffffff', 'rgba(255, 255, 255, 0.34)', 2.8);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    tex.needsUpdate = true;

    const planeW = 4.08;
    const planeH = 1.02;
    const geo = new THREE.PlaneGeometry(planeW, planeH);

    this.wordmarkMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTex: { value: tex },
        uReveal: { value: 0 },
        uTime: { value: 0 }
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
        uniform float uTime;
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

        void main() {
          if (uReveal <= 0.002) discard;

          float mask = texture2D(uTex, vUv).a;
          if (mask <= 0.004) discard;

          // Subtle sky-vapor edge texture so the wordmark harmonizes with the smoke-drawn Oryx
          float vapor = valueNoise(vUv * vec2(38.0, 10.0) + vec2(uTime * 0.05, 0.0));

          // Graceful center-outward condensation reveal
          float distFromCenter = abs(vUv.x - 0.5) * 2.0;
          float threshold = clamp(distFromCenter * 0.48 + (vapor - 0.5) * 0.08, 0.0, 0.56);
          float wipe = smoothstep(threshold, threshold + 0.42, uReveal);
          float alpha = mask * wipe;
          if (alpha <= 0.004) discard;

          // Luminous sunlit ivory-pearl letterforms with soft champagne-silver cloud halo
          float core = smoothstep(0.24, 0.68, mask);
          vec3 haloCol = vec3(0.85, 0.78, 0.68);
          vec3 ivoryCol = vec3(0.985, 0.972, 0.948);
          vec3 col = mix(haloCol, ivoryCol, core);

          // Delicate travelling champagne-ivory shimmer during initial reveal
          float sheenPos = mix(-0.15, 1.15, smoothstep(0.04, 0.96, uReveal));
          float sheen = exp(-pow((vUv.x - sheenPos) * 7.2, 2.0)) * (1.0 - smoothstep(0.86, 1.0, uReveal));
          col = mix(col, vec3(1.0, 0.93, 0.76), sheen * 0.42);

          gl_FragColor = vec4(col, alpha);
        }
      `
    });

    this.wordmarkMesh = new THREE.Mesh(geo, this.wordmarkMat);
    this.wordmarkMesh.position.set(0.0, this.wordmarkBaseY, ORYX_WORLD_CONFIG.worldZ + 0.03);
    this.wordmarkMesh.renderOrder = 4;
    this.group.add(this.wordmarkMesh);
  }

  public update(elapsed: number, revealProgress: number): void {
    this.revealProgress = THREE.MathUtils.clamp(revealProgress, 0, 1);
    const visible = this.revealProgress > 0.001;
    this.wordmarkMesh.visible = visible;

    if (visible) {
      const eased = THREE.MathUtils.smoothstep(this.revealProgress, 0, 1);
      this.wordmarkMat.uniforms.uTime.value = elapsed;
      this.wordmarkMat.uniforms.uReveal.value = eased;
      this.wordmarkMesh.position.y = this.wordmarkBaseY - (1.0 - eased) * 0.05;
    }
  }

  public reset(): void {
    this.revealProgress = 0;
    this.wordmarkMat.uniforms.uReveal.value = 0;
    this.wordmarkMesh.visible = false;
    this.wordmarkMesh.position.y = this.wordmarkBaseY - 0.05;
  }
}
