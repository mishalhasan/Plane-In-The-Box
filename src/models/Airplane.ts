import * as THREE from 'three';
import {
  AIRWAYS_WORDMARK_PATH,
  ORYX_EMBLEM_PATH,
  QATAR_WORDMARK_PATH
} from './QatarLiveryPaths';

export class Airplane {
  public readonly root = new THREE.Group();
  /** Visual banking/wobble sub-group */
  public readonly modelGroup = new THREE.Group();
  /** World-space emitter point at the tailcone for skywriting smoke */
  public readonly smokeNozzleAnchor = new THREE.Object3D();

  private readonly fanRotors: THREE.Object3D[] = [];
  private readonly exhaustGlowMats: THREE.MeshBasicMaterial[] = [];
  private strobeMat!: THREE.MeshBasicMaterial;
  private nozzleJetMesh!: THREE.Mesh;
  private nozzleJetMat!: THREE.MeshBasicMaterial;

  // Reusable math objects to avoid per-frame allocations
  private readonly _up = new THREE.Vector3(0, 1, 0);
  private readonly _axisX = new THREE.Vector3();
  private readonly _axisY = new THREE.Vector3();
  private readonly _axisZ = new THREE.Vector3();
  private readonly _rotMat = new THREE.Matrix4();
  private readonly _rollQuat = new THREE.Quaternion();
  private readonly _zAxis = new THREE.Vector3(0, 0, 1);
  private readonly _nozzleWorldOffset = new THREE.Vector3();

  constructor() {
    this.root.add(this.modelGroup);

    const pearlLiveryMat = new THREE.MeshPhysicalMaterial({
      map: this.createFuselageLiveryTexture(),
      roughness: 0.2,
      metalness: 0.06,
      clearcoat: 0.86,
      clearcoatRoughness: 0.12
    });

    const bellyPearlMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#dfe2e8'),
      roughness: 0.22,
      metalness: 0.08,
      clearcoat: 0.82,
      clearcoatRoughness: 0.14
    });

    const wingLightGreyMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#e3e6ec'),
      roughness: 0.24,
      metalness: 0.14,
      clearcoat: 0.72
    });

    const burgundyTailMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#680838'),
      emissive: new THREE.Color('#220212'),
      emissiveIntensity: 0.25,
      roughness: 0.22,
      metalness: 0.1,
      clearcoat: 0.85,
      clearcoatRoughness: 0.13
    });

    const tailEmblemMat = new THREE.MeshPhysicalMaterial({
      map: this.createTailOryxTexture(),
      color: new THREE.Color('#ffffff'),
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 0.18,
      transparent: true,
      alphaTest: 0.02,
      roughness: 0.2,
      metalness: 0.05,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    const nacelleLiveryMat = new THREE.MeshPhysicalMaterial({
      map: this.createNacelleLiveryTexture(),
      roughness: 0.22,
      metalness: 0.12,
      clearcoat: 0.8,
      clearcoatRoughness: 0.14
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#eef2f8'),
      metalness: 0.95,
      roughness: 0.12
    });

    const darkCoreMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#141824'),
      metalness: 0.5,
      roughness: 0.45
    });

    this.buildFuselage(pearlLiveryMat, bellyPearlMat);
    this.buildWings(wingLightGreyMat, burgundyTailMat, chromeMat);
    this.buildTailAssembly(burgundyTailMat, wingLightGreyMat, tailEmblemMat);
    this.buildTurbofanEngines(nacelleLiveryMat, wingLightGreyMat, chromeMat, darkCoreMat, burgundyTailMat);
    this.buildLightsAndSmokeNozzle();
  }

  private createFuselageLiveryTexture(): THREE.CanvasTexture {
    // Choose w:h = 1024:2048 (~0.50) to match cylinder circumference (2*PI*0.082 = 0.515) : length (1.00)
    // so fuselage typography and windows map isotropically with zero stretching.
    const w = 1024;
    const h = 2048;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    // LatheGeometry rotated +90deg on X:
    // u = 0 / 1 -> bottom belly (-Y), u = 0.25 -> port (+X), u = 0.50 -> top crown (+Y), u = 0.75 -> starboard (-X)
    // py = 0 -> nose (+Z, v = 1), py = h -> tail (-Z, v = 0)

    // Luminous off-white / light pearl-grey upper fuselage with subtle crown pearl shading
    const crownGrad = ctx.createLinearGradient(0, 0, w, 0);
    crownGrad.addColorStop(0.0, '#f4f5f8');
    crownGrad.addColorStop(0.28, '#f8f8fa');
    crownGrad.addColorStop(0.5, '#eceff4');
    crownGrad.addColorStop(0.72, '#f8f8fa');
    crownGrad.addColorStop(1.0, '#f4f5f8');
    ctx.fillStyle = crownGrad;
    ctx.fillRect(0, 0, w, h);

    // Qatar Airways light dove pearl-grey underbelly band (u = 0..0.188 and u = 0.812..1.0)
    ctx.fillStyle = '#dde0e7';
    ctx.fillRect(0, h * 0.10, w * 0.188, h * 0.82);
    ctx.fillRect(w * 0.812, h * 0.10, w * 0.188, h * 0.82);

    // Crisp signature burgundy cheatline separating pearl-grey belly from bright upper body
    ctx.fillStyle = '#640736';
    ctx.fillRect(w * 0.185, h * 0.13, w * 0.0085, h * 0.75);
    ctx.fillRect(w * 0.8065, h * 0.13, w * 0.0085, h * 0.75);

    // Subtle cool-silver accent pinstripe right above burgundy cheatline
    ctx.fillStyle = '#b9bfca';
    ctx.fillRect(w * 0.1955, h * 0.14, w * 0.004, h * 0.73);
    ctx.fillRect(w * 0.8005, h * 0.14, w * 0.004, h * 0.73);

    // Sleek A350-style wraparound dark cockpit visor near nose (v = 0.865..0.920 -> py = h * 0.080..0.135)
    const visorY = h * 0.084;
    const visorH = h * 0.044;
    ctx.fillStyle = '#101829';
    ctx.beginPath();
    ctx.roundRect(w * 0.345, visorY, w * 0.31, visorH, 22);
    ctx.fill();

    // Subtle sky highlight on cockpit glass
    ctx.fillStyle = 'rgba(165, 202, 255, 0.36)';
    ctx.beginPath();
    ctx.roundRect(w * 0.365, visorY + 8, w * 0.118, visorH * 0.36, 10);
    ctx.roundRect(w * 0.517, visorY + 8, w * 0.118, visorH * 0.36, 10);
    ctx.fill();

    // Illuminated warm passenger cabin windows along port (u = 0.238) & starboard (u = 0.762)
    const numWindows = 20;
    for (let i = 0; i < numWindows; i++) {
      const v = 0.24 + (i / (numWindows - 1)) * 0.54;
      const cy = h * (1 - v);

      for (const sideU of [0.238, 0.762]) {
        const cx = w * sideU;
        ctx.fillStyle = '#ffdf9e';
        ctx.beginPath();
        // Upright oval window: 6.0px along u (vertical on fuselage), 4.4px along v (longitudinal)
        ctx.ellipse(cx, cy, 6.0, 4.4, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(88, 96, 112, 0.52)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }

    // Full "QATAR AIRWAYS" burgundy lettering along both sides of the fuselage
    const qatarPath = new Path2D(QATAR_WORDMARK_PATH);
    const airwaysPath = new Path2D(AIRWAYS_WORDMARK_PATH);
    const airwaysScale = 42.5 / 14.41; // Match cap height of AIRWAYS to QATAR (42.5 units)
    const totalMarkUnits = 445.7;      // Combined single-line width in wordmark units (with crisp word space)
    const targetWorldSpan = 0.40;      // Spans z = -0.12 .. +0.28 along constant-radius cylindrical fuselage
    const sLong = (targetWorldSpan * h) / totalMarkUnits;
    const sCirc = sLong * ((w / (Math.PI * 2 * 0.082)) / h); // Exact 1:1 undistorted aspect ratio on cylinder

    const drawSingleLineBrandTitle = (): void => {
      ctx.fillStyle = '#640736';

      // "QATAR" (cap top at y = 16.25 -> shifted to y = 0)
      ctx.save();
      ctx.translate(0, -16.25);
      ctx.fill(qatarPath);
      ctx.restore();

      // "AIRWAYS" positioned inline with clear optical word space and matched cap height
      ctx.save();
      ctx.translate(228, 0);
      ctx.scale(airwaysScale, airwaysScale);
      ctx.translate(-48.2, -65.35);
      ctx.fill(airwaysPath);
      ctx.restore();
    };

    // Port side (+X): nose (+Z, py = h * 0.22) is on viewer's LEFT; tail (-Z, py = h * 0.62) is on viewer's RIGHT
    ctx.save();
    ctx.translate(w * 0.368, h * 0.22);
    ctx.rotate(Math.PI / 2);
    ctx.scale(sLong, sCirc);
    drawSingleLineBrandTitle();
    ctx.restore();

    // Starboard side (-X): tail (-Z, py = h * 0.62) is on viewer's LEFT; nose (+Z, py = h * 0.22) is on viewer's RIGHT
    ctx.save();
    ctx.translate(w * 0.632, h * 0.62);
    ctx.rotate(-Math.PI / 2);
    ctx.scale(sLong, sCirc);
    drawSingleLineBrandTitle();
    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Renders the official white Arabian Oryx emblem into UV space where u = 0 is the fin leading edge
   * (forward toward the nose) and u = 1 is the fin trailing edge, so both Port and Starboard fins
   * display the Oryx facing forward toward the aircraft's nose with swept-back horns.
   */
  private createTailOryxTexture(): THREE.CanvasTexture {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, size, size);

    // Clip strictly inside the vertical stabilizer trapezoid in (u, 1 - v) space
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0.02 * size, 0.985 * size);
    ctx.lineTo(0.688 * size, 0.02 * size);
    ctx.lineTo(0.985 * size, 0.038 * size);
    ctx.lineTo(0.910 * size, 0.985 * size);
    ctx.closePath();
    ctx.clip();

    const oryxPath = new Path2D(ORYX_EMBLEM_PATH);
    // Preserve exact 1:1 world-space proportions across the 0.26 (chord) x 0.25 (height) fin box
    const worldScale = (2.56 / 364) * 0.26;
    const sx = (worldScale / 0.26) * size;
    const sy = (worldScale / 0.25) * size;

    ctx.translate((-444 / 364) * size, (86 / 350) * size);
    ctx.scale(sx, sy);
    ctx.fillStyle = '#ffffff';
    ctx.fill(oryxPath);
    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Predominantly light pearl-grey engine nacelle texture with subtle Qatar Airways burgundy forward collar.
   */
  private createNacelleLiveryTexture(): THREE.CanvasTexture {
    const w = 256;
    const h = 256;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    // Clean light pearl-grey cowling base
    ctx.fillStyle = '#e6e9ef';
    ctx.fillRect(0, 0, w, h);

    // Subtle Qatar Airways burgundy forward collar behind chrome intake lip
    // (nacelleProfile exterior segment 2..3 maps z = +0.02..+0.075 to py = 0.60*h..0.40*h)
    ctx.fillStyle = '#640736';
    ctx.fillRect(0, h * 0.34, w, h * 0.14);

    // Hairline pearl-white accent ring separating burgundy collar from light-grey cowling
    ctx.fillStyle = '#f8f9fb';
    ctx.fillRect(0, h * 0.48, w, h * 0.024);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  private buildFuselage(mat: THREE.Material, bellyMat: THREE.Material): void {
    // Profile from tailcone (y = -0.50) to nose radome (y = +0.50)
    const profile: THREE.Vector2[] = [];
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps; // 0 = tail, 1 = nose
      const zPos = -0.50 + t * 1.00;
      let r = 0.082;

      if (t < 0.26) {
        // Tapered tailcone
        const k = t / 0.26;
        r = 0.012 + 0.070 * Math.pow(Math.sin(k * Math.PI * 0.5), 0.78);
      } else if (t > 0.76) {
        // Aerodynamic nose & radome
        const k = (1.0 - t) / 0.24;
        r = 0.082 * Math.pow(Math.max(0, Math.sin(k * Math.PI * 0.5)), 0.68);
      }

      profile.push(new THREE.Vector2(Math.max(0.002, r), zPos));
    }

    const fuselageGeo = new THREE.LatheGeometry(profile, 36);
    // Rotate +90deg on X so profile Y becomes +Z (forward), and u=0.5 sits on +Y (top crown)
    fuselageGeo.rotateX(Math.PI / 2);

    // Subtle widebody upswept tailcone lift (real airliners keep flat top line on tailcone!)
    const posAttr = fuselageGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const z = posAttr.getZ(i);
      if (z < -0.22) {
        const tailFactor = (-0.22 - z) / 0.28;
        posAttr.setY(i, posAttr.getY(i) + tailFactor * tailFactor * 0.026);
      }
      // Slight elliptical widebody cross-section
      posAttr.setY(i, posAttr.getY(i) * 1.04);
    }
    fuselageGeo.computeVertexNormals();

    const fuselage = new THREE.Mesh(fuselageGeo, mat);
    fuselage.castShadow = true;
    fuselage.receiveShadow = true;
    this.modelGroup.add(fuselage);

    // Aerodynamic wing-root belly fairing
    const fairing = new THREE.Mesh(
      new THREE.SphereGeometry(0.086, 20, 16),
      bellyMat
    );
    fairing.scale.set(1.12, 0.55, 2.25);
    fairing.position.set(0, -0.042, 0.02);
    this.modelGroup.add(fairing);
  }

  private buildWings(
    wingMat: THREE.Material,
    burgundyMat: THREE.Material,
    chromeMat: THREE.Material
  ): void {
    // Build starboard/port swept wing geometry via custom extruded planform rotated flat
    for (const side of [1, -1]) {
      const wingGroup = new THREE.Group();

      // Planform in X (span 0 -> 0.47) and Y (chord, which becomes Z)
      const shape = new THREE.Shape();
      shape.moveTo(0.05, 0.14); // Leading edge root
      shape.lineTo(0.45, -0.11); // Leading edge tip (swept back)
      shape.lineTo(0.47, -0.17); // Tip trailing corner
      shape.lineTo(0.22, -0.11); // Mid trailing kink (authentic Airbus/Boeing Yehudiibaba kink!)
      shape.lineTo(0.05, -0.07); // Trailing edge root
      shape.closePath();

      const wingGeo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.014,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 0.006,
        bevelThickness: 0.005
      });

      // Rotate so shape X stays +X, shape Y becomes +Z, extrusion thickness is Y
      wingGeo.rotateX(-Math.PI / 2);

      // Taper thickness toward wingtip for realistic sleek airfoil
      const pos = wingGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const spanT = Math.min(1, Math.max(0, (pos.getX(i) - 0.05) / 0.42));
        pos.setY(i, pos.getY(i) * (1.0 - spanT * 0.58));
      }
      wingGeo.computeVertexNormals();

      const wingMesh = new THREE.Mesh(wingGeo, wingMat);
      wingMesh.scale.x = side;
      wingMesh.castShadow = true;
      wingMesh.receiveShadow = true;
      wingGroup.add(wingMesh);

      // Metallic silver leading-edge slat highlight strip
      const slatCurve = new THREE.LineCurve3(
        new THREE.Vector3(0.06 * side, 0.004, 0.138),
        new THREE.Vector3(0.445 * side, 0.004, -0.108)
      );
      const slatMesh = new THREE.Mesh(
        new THREE.TubeGeometry(slatCurve, 8, 0.0045, 6, false),
        chromeMat
      );
      wingGroup.add(slatMesh);

      // Signature upturned burgundy blended winglet at wingtip
      const wingletShape = new THREE.Shape();
      wingletShape.moveTo(0, 0);
      wingletShape.lineTo(0.045, -0.032);
      wingletShape.lineTo(0.082, 0.055);
      wingletShape.lineTo(0.058, 0.062);
      wingletShape.lineTo(0.01, 0.015);
      wingletShape.closePath();

      const wingletGeo = new THREE.ExtrudeGeometry(wingletShape, {
        depth: 0.006,
        bevelEnabled: true,
        bevelSegments: 1,
        bevelSize: 0.002,
        bevelThickness: 0.002
      });
      // Orient winglet canted outward & upward at tip
      wingletGeo.rotateY(Math.PI / 2);
      const winglet = new THREE.Mesh(wingletGeo, burgundyMat);
      winglet.position.set(0.452 * side, 0.004, -0.125);
      winglet.rotation.z = -0.32 * side;
      winglet.castShadow = true;
      wingGroup.add(winglet);

      // Apply realistic +6 deg wing dihedral
      wingGroup.position.set(0, -0.022, 0.03);
      wingGroup.rotation.z = 0.105 * side;
      this.modelGroup.add(wingGroup);
    }
  }

  private buildTailAssembly(
    burgundyMat: THREE.Material,
    wingGreyMat: THREE.Material,
    tailEmblemMat: THREE.Material
  ): void {
    // Tall swept burgundy vertical stabilizer
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0); // Root leading edge (z = -0.22)
    finShape.lineTo(-0.18, 0.25); // Top leading corner (swept back)
    finShape.lineTo(-0.26, 0.245); // Top trailing corner
    finShape.lineTo(-0.24, 0); // Root trailing edge
    finShape.closePath();

    const finGeo = new THREE.ExtrudeGeometry(finShape, {
      depth: 0.012,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.005,
      bevelThickness: 0.005
    });
    // Map shape X -> +Z, shape Y -> +Y, depth centered on X=0
    finGeo.rotateY(-Math.PI / 2);
    finGeo.translate(0.006, 0.055, -0.22);

    const verticalFin = new THREE.Mesh(finGeo, burgundyMat);
    verticalFin.castShadow = true;
    this.modelGroup.add(verticalFin);

    // Official white Arabian Oryx emblem mounted flush on both Port (+X) & Starboard (-X) tail faces
    const finCorners = [
      { y: 0.059, z: -0.225 }, // P0: root leading
      { y: 0.300, z: -0.402 }, // P1: tip leading
      { y: 0.296, z: -0.476 }, // P2: tip trailing
      { y: 0.059, z: -0.456 }  // P3: root trailing
    ];
    for (const side of [1, -1]) {
      const xFace = 0.0112 * side;
      const emblemGeo = new THREE.BufferGeometry();
      const positions = new Float32Array([
        xFace, finCorners[0].y, finCorners[0].z,
        xFace, finCorners[1].y, finCorners[1].z,
        xFace, finCorners[2].y, finCorners[2].z,
        xFace, finCorners[3].y, finCorners[3].z
      ]);
      const normals = new Float32Array([
        side, 0, 0,
        side, 0, 0,
        side, 0, 0,
        side, 0, 0
      ]);
      const uvs = new Float32Array(
        finCorners.flatMap((c) => [(-0.22 - c.z) / 0.26, (c.y - 0.055) / 0.25])
      );
      emblemGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      emblemGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      emblemGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      emblemGeo.setIndex(side > 0 ? [0, 3, 2, 0, 2, 1] : [0, 2, 3, 0, 1, 2]);

      const emblemMesh = new THREE.Mesh(emblemGeo, tailEmblemMat);
      this.modelGroup.add(emblemMesh);
    }

    // Swept Horizontal Stabilizers (Port & Starboard)
    for (const side of [1, -1]) {
      const hShape = new THREE.Shape();
      hShape.moveTo(0.02, 0.04);
      hShape.lineTo(0.185, -0.055);
      hShape.lineTo(0.19, -0.09);
      hShape.lineTo(0.02, -0.045);
      hShape.closePath();

      const hGeo = new THREE.ExtrudeGeometry(hShape, {
        depth: 0.008,
        bevelEnabled: true,
        bevelSegments: 1,
        bevelSize: 0.003,
        bevelThickness: 0.003
      });
      hGeo.rotateX(-Math.PI / 2);

      const hStab = new THREE.Mesh(hGeo, wingGreyMat);
      hStab.scale.x = side;
      hStab.position.set(0, 0.024, -0.39);
      hStab.rotation.z = 0.13 * side;
      hStab.castShadow = true;
      this.modelGroup.add(hStab);
    }
  }

  private buildTurbofanEngines(
    nacelleMat: THREE.Material,
    pylonMat: THREE.Material,
    chromeMat: THREE.Material,
    darkCoreMat: THREE.Material,
    burgundyMat: THREE.Material
  ): void {
    // Sculpted nacelle cowling lathe profile
    const nacelleProfile = [
      new THREE.Vector2(0.030, -0.085),
      new THREE.Vector2(0.042, -0.04),
      new THREE.Vector2(0.046, 0.02),
      new THREE.Vector2(0.043, 0.075),
      new THREE.Vector2(0.036, 0.082),
      new THREE.Vector2(0.034, 0.02)
    ];
    const nacelleGeo = new THREE.LatheGeometry(nacelleProfile, 24);
    nacelleGeo.rotateX(Math.PI / 2);

    for (const side of [1, -1]) {
      const engineGroup = new THREE.Group();
      engineGroup.position.set(0.185 * side, -0.048, 0.045);

      // Swept engine pylon connecting nacelle to wing underside
      const pylon = new THREE.Mesh(
        new THREE.BoxGeometry(0.014, 0.045, 0.10),
        pylonMat
      );
      pylon.position.set(0, 0.034, -0.015);
      pylon.rotation.x = 0.22;
      engineGroup.add(pylon);

      // Light pearl-grey nacelle cowling with Qatar Airways burgundy accents
      const cowling = new THREE.Mesh(nacelleGeo, nacelleMat);
      cowling.castShadow = true;
      engineGroup.add(cowling);

      // Subtle 3D burgundy trim ring along the forward cowling collar
      const accentBand = new THREE.Mesh(
        new THREE.TorusGeometry(0.0442, 0.002, 8, 28),
        burgundyMat
      );
      accentBand.position.z = 0.052;
      engineGroup.add(accentBand);

      // Polished chrome intake lip ring
      const intakeLip = new THREE.Mesh(
        new THREE.TorusGeometry(0.0385, 0.0048, 12, 28),
        chromeMat
      );
      intakeLip.position.z = 0.080;
      engineGroup.add(intakeLip);

      // Dark fan case disk + spinning fan rotor blades!
      const fanBack = new THREE.Mesh(
        new THREE.CircleGeometry(0.036, 20),
        darkCoreMat
      );
      fanBack.position.z = 0.052;
      engineGroup.add(fanBack);

      const rotorGroup = new THREE.Group();
      rotorGroup.position.z = 0.058;

      const spinnerCone = new THREE.Mesh(
        new THREE.ConeGeometry(0.010, 0.022, 12),
        chromeMat
      );
      spinnerCone.rotation.x = Math.PI / 2;
      spinnerCone.position.z = 0.006;
      rotorGroup.add(spinnerCone);

      const bladeGeo = new THREE.BoxGeometry(0.005, 0.033, 0.002);
      for (let b = 0; b < 10; b++) {
        const blade = new THREE.Mesh(bladeGeo, chromeMat);
        const angle = (b / 10) * Math.PI * 2;
        blade.position.set(Math.cos(angle) * 0.018, Math.sin(angle) * 0.018, 0);
        blade.rotation.z = angle;
        blade.rotation.y = 0.45;
        rotorGroup.add(blade);
      }
      engineGroup.add(rotorGroup);
      this.fanRotors.push(rotorGroup);

      // Metallic rear exhaust nozzle cone
      const exhaustCone = new THREE.Mesh(
        new THREE.ConeGeometry(0.024, 0.055, 16),
        darkCoreMat
      );
      exhaustCone.rotation.x = -Math.PI / 2;
      exhaustCone.position.z = -0.095;
      engineGroup.add(exhaustCone);

      // Subtle warm blue-amber jet core glow
      const glowMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#9ad0ff'),
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const exhaustGlow = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 12), glowMat);
      exhaustGlow.scale.set(1, 1, 2.1);
      exhaustGlow.position.z = -0.105;
      engineGroup.add(exhaustGlow);
      this.exhaustGlowMats.push(glowMat);

      this.modelGroup.add(engineGroup);
    }
  }

  private buildLightsAndSmokeNozzle(): void {
    // Port (+X) Red Nav Light & Starboard (-X) Green Nav Light
    const portLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.011, 8, 8),
      new THREE.MeshBasicMaterial({ color: '#ff3b3b' })
    );
    portLight.position.set(0.46, 0.028, -0.105);

    const starboardLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.011, 8, 8),
      new THREE.MeshBasicMaterial({ color: '#38ff7a' })
    );
    starboardLight.position.set(-0.46, 0.028, -0.105);

    this.strobeMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0
    });
    const tailStrobe = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), this.strobeMat);
    tailStrobe.position.set(0, 0.036, -0.505);

    const upperBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.010, 8, 8), this.strobeMat);
    upperBeacon.position.set(0, 0.088, 0.06);

    this.modelGroup.add(portLight, starboardLight, tailStrobe, upperBeacon);

    // Tailcone Skywriting Smoke Nozzle Anchor + concentrated white smoke jet cone
    this.smokeNozzleAnchor.position.set(0, 0.026, -0.515);
    this.modelGroup.add(this.smokeNozzleAnchor);

    this.nozzleJetMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffffff'),
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    const jetConeGeo = new THREE.ConeGeometry(0.048, 0.24, 14, 1, true);
    jetConeGeo.rotateX(Math.PI / 2); // Tip at +Z (nozzle), flares toward -Z (trail)
    jetConeGeo.translate(0, 0, -0.12);
    this.nozzleJetMesh = new THREE.Mesh(jetConeGeo, this.nozzleJetMat);
    this.smokeNozzleAnchor.add(this.nozzleJetMesh);
  }

  /**
   * Aligns aircraft smoothly along velocity tangent (+Z forward) with aerodynamic banking roll.
   * When `alignNozzle` is true, offsets the airframe forward so the tail smoke nozzle sits
   * strictly on `position` for pinpoint calligraphic skywriting accuracy.
   */
  public setFlightPose(
    position: THREE.Vector3,
    tangent: THREE.Vector3,
    rollAngle: number,
    alignNozzle = true
  ): void {
    this._axisZ.copy(tangent).normalize();
    // Guard near-vertical climb singularity
    if (Math.abs(this._axisZ.y) > 0.985) {
      this._up.set(0, 0, -1);
    } else {
      this._up.set(0, 1, 0);
    }

    this._axisX.crossVectors(this._up, this._axisZ).normalize();
    this._axisY.crossVectors(this._axisZ, this._axisX).normalize();

    this._rotMat.makeBasis(this._axisX, this._axisY, this._axisZ);
    this.root.quaternion.setFromRotationMatrix(this._rotMat);

    this._rollQuat.setFromAxisAngle(this._zAxis, rollAngle);
    this.root.quaternion.multiply(this._rollQuat);

    if (alignNozzle) {
      this._nozzleWorldOffset
        .copy(this.smokeNozzleAnchor.position)
        .multiply(this.root.scale)
        .applyQuaternion(this.root.quaternion);
      this.root.position.copy(position).sub(this._nozzleWorldOffset);
    } else {
      this.root.position.copy(position);
    }
  }

  public updateEffects(dt: number, elapsed: number, emittingSmoke: boolean, enginePower = 1.0): void {
    // Spin turbofan rotor blades rapidly
    const spinDelta = dt * (18 + enginePower * 28);
    for (const rotor of this.fanRotors) {
      rotor.rotation.z += spinDelta;
    }

    // Pulse exhaust glow subtly
    const glow = (0.32 + 0.14 * Math.sin(elapsed * 24)) * enginePower;
    for (const m of this.exhaustGlowMats) {
      m.opacity = glow;
    }

    // Aviation double-flash anti-collision strobe pattern
    const cycle = elapsed % 1.35;
    const isFlash = (cycle > 0.0 && cycle < 0.055) || (cycle > 0.13 && cycle < 0.185);
    this.strobeMat.opacity = isFlash ? 1.0 : 0.05;

    // Concentrated tail smoke injector cone visibility
    const targetNozzle = emittingSmoke ? 0.85 : 0.0;
    this.nozzleJetMat.opacity += (targetNozzle - this.nozzleJetMat.opacity) * Math.min(1, dt * 18);
  }
}
