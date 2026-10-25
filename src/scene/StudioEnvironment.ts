import * as THREE from 'three';

export class StudioEnvironment {
  public readonly group = new THREE.Group();
  private dustPoints!: THREE.Points;
  private dustMaterial!: THREE.ShaderMaterial;
  private plinthRing!: THREE.Mesh;
  private contactShadow!: THREE.Mesh;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    // 1. Generate bespoke luxury PBR reflection environment
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envScene = this.buildReflectionStudioScene();
    const envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 1.05;
    pmrem.dispose();

    // 2. Build seamless dithered twilight sky dome
    this.buildSkyDome();

    // 3. Build luxury burgundy-navy-brass display pedestal
    this.buildPedestal();

    // 4. Build subtle distant twilight cloud wisps & 3D parallax starlight/gold motes
    this.buildDistantClouds();
    this.buildAtmosphericMotes();

    // 5. Build cinematic studio lighting rig
    this.buildLights();

    scene.add(this.group);
  }

  private buildReflectionStudioScene(): THREE.Scene {
    const env = new THREE.Scene();
    env.background = new THREE.Color('#070d20');

    const makeLightPanel = (
      color: string,
      intensity: number,
      w: number,
      h: number,
      pos: [number, number, number],
      look: [number, number, number]
    ) => {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(intensity),
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      mesh.position.set(...pos);
      mesh.lookAt(...look);
      env.add(mesh);
    };

    // Overhead warm champagne softbox
    makeLightPanel('#fff1d6', 2.8, 16, 16, [0, 14, 2], [0, 0, 0]);
    // Key right-front warm gold panel (catches crank & brass corners)
    makeLightPanel('#ffdca0', 2.4, 10, 10, [12, 6, 10], [0, 0, 0]);
    // Left burgundy-rose velvet fill
    makeLightPanel('#a31858', 2.1, 14, 10, [-13, 3, 5], [0, 0, 0]);
    // Rear sapphire-gold rim strip
    makeLightPanel('#4b6cb7', 1.8, 18, 6, [0, 7, -14], [0, 0, 0]);
    // Warm lower horizon bounce
    makeLightPanel('#5c0632', 1.4, 22, 22, [0, -12, 0], [0, 0, 0]);

    return env;
  }

  private buildSkyDome(): void {
    const geo = new THREE.SphereGeometry(85, 48, 32);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uZenith: { value: new THREE.Color('#040816') },
        uMidSky: { value: new THREE.Color('#0a1532') },
        uHorizonBurgundy: { value: new THREE.Color('#3b0824') },
        uHorizonGold: { value: new THREE.Color('#784232') },
        uNadir: { value: new THREE.Color('#040610') }
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldDir;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uZenith;
        uniform vec3 uMidSky;
        uniform vec3 uHorizonBurgundy;
        uniform vec3 uHorizonGold;
        uniform vec3 uNadir;
        varying vec3 vWorldDir;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        void main() {
          vec3 dir = normalize(vWorldDir);
          float y = dir.y;

          // Unified C-infinity smooth vertical twilight gradient (zero horizon seam!)
          vec3 baseSky = mix(uNadir, uMidSky, smoothstep(-0.48, 0.08, y));
          baseSky = mix(baseSky, uZenith, smoothstep(0.08, 0.72, y));

          // Warm burgundy & champagne-gold horizon glow straddling y = 0 smoothly
          float horizonBand = exp(-pow((y + 0.02) * 5.2, 2.0));
          float centerGlow = smoothstep(-0.8, 0.9, -dir.z) * exp(-dir.x * dir.x * 1.5);
          vec3 warmGlow = mix(uHorizonBurgundy, uHorizonGold, centerGlow * 0.46);
          vec3 col = mix(baseSky, warmGlow, horizonBand * 0.70);

          // Subtle anti-banding dither
          float dither = (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) * 0.006;
          gl_FragColor = vec4(col + dither, 1.0);
        }
      `
    });

    const dome = new THREE.Mesh(geo, mat);
    dome.renderOrder = -10;
    this.group.add(dome);
  }

  private buildPedestal(): void {
    const pedestalGroup = new THREE.Group();
    pedestalGroup.position.set(0, -1.65, 0);

    // Main dark midnight-navy lacquered plinth cylinder
    const topDiscMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#0b1228'),
      roughness: 0.24,
      metalness: 0.18,
      clearcoat: 0.75,
      clearcoatRoughness: 0.18
    });

    const topCylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(2.55, 2.75, 0.24, 64),
      topDiscMat
    );
    topCylinder.position.y = -0.12;
    topCylinder.receiveShadow = true;
    pedestalGroup.add(topCylinder);

    // Lower burgundy tiered base skirt
    const burgundySkirtMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#4a0628'),
      roughness: 0.32,
      metalness: 0.15,
      clearcoat: 0.5
    });
    const lowerCylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(2.78, 3.05, 0.22, 64),
      burgundySkirtMat
    );
    lowerCylinder.position.y = -0.34;
    lowerCylinder.receiveShadow = true;
    pedestalGroup.add(lowerCylinder);

    // Brushed champagne-brass concentric trim rings
    const brassMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#ddb970'),
      metalness: 0.88,
      roughness: 0.22
    });

    const outerBezel = new THREE.Mesh(
      new THREE.TorusGeometry(2.56, 0.026, 16, 96),
      brassMat
    );
    outerBezel.rotation.x = Math.PI / 2;
    outerBezel.position.y = 0.0;
    pedestalGroup.add(outerBezel);

    this.plinthRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.72, 0.015, 12, 96),
      brassMat
    );
    this.plinthRing.rotation.x = Math.PI / 2;
    this.plinthRing.position.y = 0.004;
    pedestalGroup.add(this.plinthRing);

    const stepRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.78, 0.022, 14, 96),
      brassMat
    );
    stepRing.rotation.x = Math.PI / 2;
    stepRing.position.y = -0.23;
    pedestalGroup.add(stepRing);

    // Grounded soft radial contact shadow directly beneath the Jack-in-the-Box
    const shadowTex = this.createSoftRadialShadowTexture();
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.78,
      depthWrite: false
    });
    this.contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), shadowMat);
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = 0.003;
    pedestalGroup.add(this.contactShadow);

    this.group.add(pedestalGroup);
  }

  private createSoftRadialShadowTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.48);
    grad.addColorStop(0, 'rgba(2, 4, 12, 0.92)');
    grad.addColorStop(0.55, 'rgba(3, 6, 16, 0.48)');
    grad.addColorStop(1, 'rgba(3, 6, 16, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  private buildDistantClouds(): void {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(128, 128, 6, 128, 128, 116);
    g.addColorStop(0, 'rgba(138, 64, 98, 0.16)');
    g.addColorStop(0.48, 'rgba(56, 26, 62, 0.08)');
    g.addColorStop(1, 'rgba(10, 18, 42, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    const cloudConfigs: Array<[number, number, number, number, number]> = [
      [-14, -1.8, -24, 26, 9.5],
      [13, -1.2, -26, 28, 10.0],
      [0, -2.6, -22, 32, 9.0],
      [-8, 1.8, -30, 24, 8.5],
      [10, 2.2, -32, 24, 8.5]
    ];

    for (const [x, y, z, w, h] of cloudConfigs) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      plane.position.set(x, y, z);
      this.group.add(plane);
    }
  }

  private buildAtmosphericMotes(): void {
    const count = 240;
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const phases = new Float32Array(count);
    const colors = new Float32Array(count * 3);

    const gold = new THREE.Color('#f4d898');
    const pearl = new THREE.Color('#dce6ff');
    const rose = new THREE.Color('#e69ab8');

    for (let i = 0; i < count; i++) {
      // Spread across wide sky dome and surrounding 3D space (avoiding center box core)
      const r = 6 + Math.random() * 34;
      const theta = (Math.random() - 0.5) * Math.PI * 1.45;
      const y = -2.5 + Math.random() * 14.0;
      positions[i * 3] = Math.sin(theta) * r;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = -Math.cos(theta) * r * 0.75 + 2.0;

      scales[i] = 0.5 + Math.random() * 1.7;
      phases[i] = Math.random() * Math.PI * 2;

      const pick = i % 5 === 0 ? rose : i % 2 === 0 ? gold : pearl;
      colors[i * 3] = pick.r;
      colors[i * 3 + 1] = pick.g;
      colors[i * 3 + 2] = pick.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

    this.dustMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
      },
      vertexShader: /* glsl */ `
        attribute float aScale;
        attribute float aPhase;
        attribute vec3 aColor;
        uniform float uTime;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vTwinkle;

        void main() {
          vec3 pos = position;
          pos.y += sin(uTime * 0.35 + aPhase) * 0.16;
          pos.x += cos(uTime * 0.25 + aPhase * 1.3) * 0.12;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = aScale * 26.0 * uPixelRatio * (1.0 / max(2.0, -mvPosition.z));

          vColor = aColor;
          vTwinkle = 0.45 + 0.55 * sin(uTime * 1.6 + aPhase * 3.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vTwinkle;

        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float alpha = smoothstep(0.5, 0.04, d) * vTwinkle * 0.65;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(vColor, alpha);
        }
      `
    });

    this.dustPoints = new THREE.Points(geo, this.dustMaterial);
    this.group.add(this.dustPoints);
  }

  private buildLights(): void {
    // Soft ambient hemisphere
    const hemi = new THREE.HemisphereLight('#96b2f0', '#480a28', 0.72);
    this.group.add(hemi);

    // Warm champagne key light with crisp soft shadows
    const keyLight = new THREE.DirectionalLight('#fff0d8', 2.35);
    keyLight.position.set(6.5, 10.5, 8.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 30;
    const d = 6.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.radius = 3.5;
    this.group.add(keyLight);

    // Warm burgundy-rose rim light from rear-left
    const rimLight = new THREE.DirectionalLight('#ff9ec6', 1.25);
    rimLight.position.set(-8.0, 5.5, -6.5);
    this.group.add(rimLight);

    // Cool sky fill from front-left for smoke dimensional shading
    const fillLight = new THREE.DirectionalLight('#9ab8ff', 0.75);
    fillLight.position.set(-6.0, 4.0, 9.0);
    this.group.add(fillLight);
  }

  public update(elapsed: number): void {
    this.dustMaterial.uniforms.uTime.value = elapsed;
    this.plinthRing.rotation.z = elapsed * 0.04;
  }
}
