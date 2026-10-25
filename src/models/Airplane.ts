import * as THREE from 'three';

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
      metalness: 0.08,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12
    });

    const wingPearlMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#f2efe9'),
      roughness: 0.24,
      metalness: 0.14,
      clearcoat: 0.7
    });

    const burgundyTailMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#660838'),
      roughness: 0.22,
      metalness: 0.15,
      clearcoat: 0.82,
      clearcoatRoughness: 0.14
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#eef2f8'),
      metalness: 0.95,
      roughness: 0.12
    });

    const goldTrimMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#e8c77b'),
      metalness: 0.9,
      roughness: 0.18
    });

    const darkCoreMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#141824'),
      metalness: 0.5,
      roughness: 0.45
    });

    this.buildFuselage(pearlLiveryMat);
    this.buildWings(wingPearlMat, burgundyTailMat, chromeMat);
    this.buildTailAssembly(burgundyTailMat, wingPearlMat, goldTrimMat);
    this.buildTurbofanEngines(wingPearlMat, chromeMat, darkCoreMat, burgundyTailMat);
    this.buildLightsAndSmokeNozzle();
  }

  private createFuselageLiveryTexture(): THREE.CanvasTexture {
    const w = 1024;
    const h = 512;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    // Note on LatheGeometry UV mapping:
    // U (0..1) wraps radially around the fuselage circumference.
    // V (0..1) runs along profile from tail (v=0) to nose (v=1).
    // With LatheGeometry rotated +90deg on X so +Y becomes +Z (nose):
    // Let's make symmetric left/right wrap around top & bottom cleanly!

    // Base pearl-ivory upper body
    ctx.fillStyle = '#f7f5f0';
    ctx.fillRect(0, 0, w, h);

    // Subtle warm silver-grey underbelly band (around bottom seam of cylinder)
    // In LatheGeometry (phiStart=0..2PI): x = r*sin(phi), z = r*cos(phi).
    // After rotateX(+PI/2): local x = r*sin(phi), local y = -r*cos(phi), local z = profileY!
    // Wait: at phi = 0 (u=0) and phi = 2PI (u=1), local y = -r (BOTTOM belly)!
    // At phi = PI (u=0.5), local y = +r (TOP crown)!
    // Knowing exact UV coordinates makes cockpit & cabin windows 100% pinpoint accurate!

    // Belly grey band near u = 0..0.18 and u = 0.82..1.0
    ctx.fillStyle = '#d8d5cf';
    ctx.fillRect(0, h * 0.12, w * 0.19, h * 0.78);
    ctx.fillRect(w * 0.81, h * 0.12, w * 0.19, h * 0.78);

    // Crisp burgundy & gold cheatline separating belly from pearl upper cabin
    ctx.fillStyle = '#680838';
    ctx.fillRect(w * 0.185, h * 0.14, w * 0.012, h * 0.73);
    ctx.fillRect(w * 0.803, h * 0.14, w * 0.012, h * 0.73);

    ctx.fillStyle = '#dfc078';
    ctx.fillRect(w * 0.197, h * 0.15, w * 0.006, h * 0.71);
    ctx.fillRect(w * 0.797, h * 0.15, w * 0.006, h * 0.71);

    // Swept burgundy tail-belly accent near rear (v = 0.04..0.28 -> canvas y = h*(1 - v))
    ctx.fillStyle = '#660838';
    ctx.beginPath();
    ctx.moveTo(w * 0.32, h * 0.96);
    ctx.lineTo(w * 0.68, h * 0.96);
    ctx.lineTo(w * 0.56, h * 0.74);
    ctx.lineTo(w * 0.44, h * 0.74);
    ctx.closePath();
    ctx.fill();

    // Sleek A350-style wraparound dark cockpit visor near nose (v = 0.86..0.92 -> canvas y = h * 0.08..0.14)
    // Top crown is u = 0.50, so cockpit spans u = 0.34 .. 0.66 slightly above midline!
    const visorY = h * 0.105;
    ctx.fillStyle = '#101829';
    ctx.beginPath();
    ctx.roundRect(w * 0.34, visorY, w * 0.32, h * 0.042, 12);
    ctx.fill();

    // Subtle sky highlight on cockpit glass
    ctx.fillStyle = 'rgba(155, 195, 255, 0.35)';
    ctx.beginPath();
    ctx.roundRect(w * 0.36, visorY + 3, w * 0.12, h * 0.016, 6);
    ctx.roundRect(w * 0.52, visorY + 3, w * 0.12, h * 0.016, 6);
    ctx.fill();

    // Illuminated warm passenger cabin windows along port (u ~ 0.27) & starboard (u ~ 0.73)
    const numWindows = 18;
    for (let i = 0; i < numWindows; i++) {
      const v = 0.25 + (i / (numWindows - 1)) * 0.53;
      const cy = h * (1 - v);

      for (const sideU of [0.265, 0.735]) {
        const cx = w * sideU;
        ctx.fillStyle = '#ffdf9e';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 4.2, 5.5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(90, 96, 110, 0.55)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }

  private buildFuselage(mat: THREE.Material): void {
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
      mat
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
    pearlMat: THREE.Material,
    goldMat: THREE.Material
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

    // Decorative swept champagne-gold tail stripes on both sides of vertical fin
    for (const sx of [-0.011, 0.011]) {
      const stripe1 = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.016, 0.13), goldMat);
      stripe1.position.set(sx, 0.19, -0.37);
      stripe1.rotation.x = -0.52;
      const stripe2 = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.010, 0.10), goldMat);
      stripe2.position.set(sx, 0.16, -0.385);
      stripe2.rotation.x = -0.52;
      this.modelGroup.add(stripe1, stripe2);
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

      const hStab = new THREE.Mesh(hGeo, pearlMat);
      hStab.scale.x = side;
      hStab.position.set(0, 0.024, -0.39);
      hStab.rotation.z = 0.13 * side;
      hStab.castShadow = true;
      this.modelGroup.add(hStab);
    }
  }

  private buildTurbofanEngines(
    nacelleMat: THREE.Material,
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
        nacelleMat
      );
      pylon.position.set(0, 0.034, -0.015);
      pylon.rotation.x = 0.22;
      engineGroup.add(pylon);

      // Main pearl nacelle cowling
      const cowling = new THREE.Mesh(nacelleGeo, nacelleMat);
      cowling.castShadow = true;
      engineGroup.add(cowling);

      // Burgundy accent ring around nacelle
      const accentBand = new THREE.Mesh(
        new THREE.TorusGeometry(0.0455, 0.003, 8, 24),
        burgundyMat
      );
      accentBand.position.z = 0.02;
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
