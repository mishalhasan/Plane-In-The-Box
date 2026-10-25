import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export class JackInTheBox {
  public readonly root = new THREE.Group();
  /** Group that squashes, stretches, and vibrates during mechanical winding */
  public readonly bodyGroup = new THREE.Group();
  /** Lid pivot located at rear top hinge */
  public readonly lidPivot = new THREE.Group();
  /** Crank shaft pivot on right face (+X) */
  public readonly crankPivot = new THREE.Group();
  /** World-space anchor on the crank handle knob for UI callout projection */
  public readonly crankKnobAnchor = new THREE.Object3D();
  /** Raycastable meshes for interactive crank hover/drag */
  public readonly crankInteractMeshes: THREE.Object3D[] = [];
  /** Cradle mount point at top of spring where airplane sits prior to launch */
  public readonly launchCradleAnchor = new THREE.Object3D();

  private pawlPivot = new THREE.Group();
  private latchPivot = new THREE.Group();
  private springMesh!: THREE.Group;
  private pistonInner!: THREE.Mesh;
  private tensionGlowMat!: THREE.MeshStandardMaterial;
  private crankHaloMat!: THREE.MeshBasicMaterial;
  private interiorLight!: THREE.PointLight;

  // Pop-out golden celebration burst particles
  private burstPoints!: THREE.Points;
  private burstMaterial!: THREE.ShaderMaterial;
  private burstStartTime = -100;

  // Spring-damper lid physics state
  private lidAngle = 0; // 0 = closed, positive = open backward (rotates -X)
  private lidVelocity = 0;
  private targetLidAngle = 0;

  private springExtension = 0.18; // 0.18 compressed inside box -> 1.0 extended
  private springVelocity = 0;
  private targetSpringExtension = 0.18;

  // Shared luxury materials
  private readonly burgundyLacquer: THREE.MeshPhysicalMaterial;
  private readonly navyEnamel: THREE.MeshPhysicalMaterial;
  private readonly brushedBrass: THREE.MeshStandardMaterial;
  private readonly polishedGold: THREE.MeshStandardMaterial;
  private readonly ivoryTurned: THREE.MeshPhysicalMaterial;
  private readonly darkVelvet: THREE.MeshStandardMaterial;

  constructor() {
    this.burgundyLacquer = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#5c0632'),
      roughness: 0.24,
      metalness: 0.12,
      clearcoat: 0.78,
      clearcoatRoughness: 0.16
    });

    this.navyEnamel = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#0a142e'),
      roughness: 0.28,
      metalness: 0.2,
      clearcoat: 0.65,
      clearcoatRoughness: 0.2
    });

    this.brushedBrass = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#dbb66c'),
      metalness: 0.88,
      roughness: 0.23
    });

    this.polishedGold = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#f0d493'),
      metalness: 0.94,
      roughness: 0.14
    });

    this.ivoryTurned = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#f5efe4'),
      roughness: 0.22,
      metalness: 0.04,
      clearcoat: 0.6
    });

    this.darkVelvet = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#190410'),
      roughness: 0.92,
      metalness: 0.02
    });

    // Position on pedestal top (y = -1.65) at a graceful three-quarter hero angle
    this.root.position.set(0, -1.65, 0);
    this.root.rotation.y = -0.36;
    this.root.add(this.bodyGroup);

    this.buildFeetAndBase();
    this.buildHollowCabinet();
    this.buildFrontMedallionAndLatch();
    this.buildHingedLid();
    this.buildInternalSpringAndLight();
    this.buildCrankMechanism();
    this.buildPopBurstParticles();
  }

  private buildFeetAndBase(): void {
    // 4 turned brass feet
    const footOffsets: Array<[number, number]> = [
      [-0.72, -0.72],
      [0.72, -0.72],
      [-0.72, 0.72],
      [0.72, 0.72]
    ];

    const footGeo = new THREE.CylinderGeometry(0.11, 0.075, 0.1, 20);
    for (const [fx, fz] of footOffsets) {
      const foot = new THREE.Mesh(footGeo, this.brushedBrass);
      foot.position.set(fx, 0.05, fz);
      foot.castShadow = true;
      foot.receiveShadow = true;
      this.bodyGroup.add(foot);
    }

    // Stepped burgundy base plinth
    const basePlinth = new THREE.Mesh(
      new RoundedBoxGeometry(1.78, 0.14, 1.78, 4, 0.03),
      this.burgundyLacquer
    );
    basePlinth.position.y = 0.16;
    basePlinth.castShadow = true;
    basePlinth.receiveShadow = true;
    this.bodyGroup.add(basePlinth);

    // Brass base molding collar
    const baseCollar = new THREE.Mesh(
      new RoundedBoxGeometry(1.68, 0.045, 1.68, 4, 0.015),
      this.brushedBrass
    );
    baseCollar.position.y = 0.245;
    baseCollar.castShadow = true;
    this.bodyGroup.add(baseCollar);
  }

  private buildHollowCabinet(): void {
    // Interior floor
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.08, 1.44), this.darkVelvet);
    floor.position.y = 0.28;
    this.bodyGroup.add(floor);

    // 4 beveled cabinet walls (height 1.28, spanning y = 0.26 to y = 1.54)
    const wallHeight = 1.28;
    const wallY = 0.26 + wallHeight * 0.5; // 0.90
    const wallThickness = 0.12;
    const outerSpan = 1.60;

    // Front (+Z) and Back (-Z) walls
    const fbGeo = new RoundedBoxGeometry(outerSpan, wallHeight, wallThickness, 3, 0.025);
    const frontWall = new THREE.Mesh(fbGeo, this.burgundyLacquer);
    frontWall.position.set(0, wallY, (outerSpan - wallThickness) * 0.5);
    frontWall.castShadow = true;
    frontWall.receiveShadow = true;

    const backWall = new THREE.Mesh(fbGeo, this.burgundyLacquer);
    backWall.position.set(0, wallY, -(outerSpan - wallThickness) * 0.5);
    backWall.castShadow = true;
    backWall.receiveShadow = true;

    // Left (-X) and Right (+X) walls
    const lrGeo = new RoundedBoxGeometry(wallThickness, wallHeight, outerSpan - wallThickness * 1.6, 3, 0.025);
    const leftWall = new THREE.Mesh(lrGeo, this.burgundyLacquer);
    leftWall.position.set(-(outerSpan - wallThickness) * 0.5, wallY, 0);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;

    const rightWall = new THREE.Mesh(lrGeo, this.burgundyLacquer);
    rightWall.position.set((outerSpan - wallThickness) * 0.5, wallY, 0);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;

    this.bodyGroup.add(frontWall, backWall, leftWall, rightWall);

    // Velvet inner wall liners so open cavity looks plush and dark
    const linerMat = this.darkVelvet;
    const linerH = wallHeight - 0.04;
    const innerSpan = outerSpan - wallThickness * 2 - 0.005;
    const linerPlane = new THREE.PlaneGeometry(innerSpan, linerH);

    const fLiner = new THREE.Mesh(linerPlane, linerMat);
    fLiner.position.set(0, wallY, innerSpan * 0.5);
    fLiner.rotation.y = Math.PI;

    const bLiner = new THREE.Mesh(linerPlane, linerMat);
    bLiner.position.set(0, wallY, -innerSpan * 0.5);

    const lLiner = new THREE.Mesh(linerPlane, linerMat);
    lLiner.position.set(-innerSpan * 0.5, wallY, 0);
    lLiner.rotation.y = Math.PI / 2;

    const rLiner = new THREE.Mesh(linerPlane, linerMat);
    rLiner.position.set(innerSpan * 0.5, wallY, 0);
    rLiner.rotation.y = -Math.PI / 2;

    this.bodyGroup.add(fLiner, bLiner, lLiner, rLiner);

    // Decorative Midnight-Navy Recessed Inset Panels + Brass Picture Frames on all 4 faces
    const panelSize = 1.06;
    const frameConfigs: Array<{ pos: [number, number, number]; rotY: number }> = [
      { pos: [0, wallY, outerSpan * 0.5 + 0.004], rotY: 0 },
      { pos: [0, wallY, -outerSpan * 0.5 - 0.004], rotY: Math.PI },
      { pos: [-outerSpan * 0.5 - 0.004, wallY, 0], rotY: -Math.PI / 2 },
      { pos: [outerSpan * 0.5 + 0.004, wallY, 0], rotY: Math.PI / 2 }
    ];

    for (const cfg of frameConfigs) {
      const panelGroup = new THREE.Group();
      panelGroup.position.set(...cfg.pos);
      panelGroup.rotation.y = cfg.rotY;

      const inset = new THREE.Mesh(
        new RoundedBoxGeometry(panelSize, panelSize * 0.92, 0.022, 2, 0.01),
        this.navyEnamel
      );
      panelGroup.add(inset);

      // 4 brass frame molding bars
      const barLong = panelSize + 0.05;
      const barShort = panelSize * 0.92 + 0.05;
      const hBarGeo = new THREE.BoxGeometry(barLong, 0.032, 0.036);
      const vBarGeo = new THREE.BoxGeometry(0.032, barShort, 0.036);

      const topB = new THREE.Mesh(hBarGeo, this.brushedBrass);
      topB.position.y = panelSize * 0.46 + 0.01;
      const botB = new THREE.Mesh(hBarGeo, this.brushedBrass);
      botB.position.y = -panelSize * 0.46 - 0.01;
      const leftB = new THREE.Mesh(vBarGeo, this.brushedBrass);
      leftB.position.x = -panelSize * 0.5 - 0.01;
      const rightB = new THREE.Mesh(vBarGeo, this.brushedBrass);
      rightB.position.x = panelSize * 0.5 + 0.01;

      panelGroup.add(topB, botB, leftB, rightB);
      this.bodyGroup.add(panelGroup);
    }

    // 4 Vertical Brushed-Brass Corner Columns + 8 Corner Brackets with Rivets
    const cornerOffsets: Array<[number, number]> = [
      [-0.785, -0.785],
      [0.785, -0.785],
      [-0.785, 0.785],
      [0.785, 0.785]
    ];
    const colGeo = new THREE.CylinderGeometry(0.048, 0.048, wallHeight + 0.02, 16);
    const capGeo = new RoundedBoxGeometry(0.14, 0.11, 0.14, 2, 0.02);

    for (const [cx, cz] of cornerOffsets) {
      const col = new THREE.Mesh(colGeo, this.brushedBrass);
      col.position.set(cx, wallY, cz);
      col.castShadow = true;
      this.bodyGroup.add(col);

      const botCap = new THREE.Mesh(capGeo, this.polishedGold);
      botCap.position.set(cx, 0.31, cz);
      const topCap = new THREE.Mesh(capGeo, this.polishedGold);
      topCap.position.set(cx, 1.49, cz);
      this.bodyGroup.add(botCap, topCap);
    }

    // Upper brass rim collar around cavity opening
    const rimBarFB = new THREE.BoxGeometry(1.66, 0.042, 0.11);
    const rimBarLR = new THREE.BoxGeometry(0.11, 0.042, 1.66);

    const rF = new THREE.Mesh(rimBarFB, this.brushedBrass);
    rF.position.set(0, 1.55, 0.765);
    const rB = new THREE.Mesh(rimBarFB, this.brushedBrass);
    rB.position.set(0, 1.55, -0.765);
    const rL = new THREE.Mesh(rimBarLR, this.brushedBrass);
    rL.position.set(-0.765, 1.55, 0);
    const rR = new THREE.Mesh(rimBarLR, this.brushedBrass);
    rR.position.set(0.765, 1.55, 0);

    this.bodyGroup.add(rF, rB, rL, rR);
  }

  private buildFrontMedallionAndLatch(): void {
    const medallion = new THREE.Group();
    medallion.position.set(0, 0.90, 0.822);

    // Outer stepped brass bezel
    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.028, 16, 48),
      this.polishedGold
    );
    medallion.add(outerRing);

    // Emissive tension ring that warms up as crank winds
    this.tensionGlowMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#ffd996'),
      emissive: new THREE.Color('#ffaa38'),
      emissiveIntensity: 0.08,
      roughness: 0.25,
      metalness: 0.5
    });
    const glowRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.285, 0.013, 12, 48),
      this.tensionGlowMat
    );
    glowRing.position.z = 0.008;
    medallion.add(glowRing);

    // Sculpted 8-point compass rose / aviation star
    const pointGeo = new THREE.ConeGeometry(0.042, 0.24, 4);
    for (let i = 0; i < 8; i++) {
      const spike = new THREE.Mesh(pointGeo, i % 2 === 0 ? this.polishedGold : this.brushedBrass);
      const angle = (i * Math.PI) / 4;
      const lenScale = i % 2 === 0 ? 1.0 : 0.68;
      spike.scale.set(1, lenScale, 0.45);
      spike.rotation.z = -angle;
      spike.position.set(Math.sin(angle) * 0.11 * lenScale, Math.cos(angle) * 0.11 * lenScale, 0.018);
      medallion.add(spike);
    }

    // Center cabochon jewel in deep burgundy lacquer
    const jewel = new THREE.Mesh(
      new THREE.SphereGeometry(0.068, 24, 16),
      this.burgundyLacquer
    );
    jewel.scale.z = 0.45;
    jewel.position.z = 0.025;
    medallion.add(jewel);

    this.bodyGroup.add(medallion);

    // Front Mechanical Brass Clasp/Latch at top-center of front wall
    const latchBase = new THREE.Mesh(
      new RoundedBoxGeometry(0.20, 0.13, 0.045, 2, 0.01),
      this.brushedBrass
    );
    latchBase.position.set(0, 1.44, 0.825);
    this.bodyGroup.add(latchBase);

    this.latchPivot.position.set(0, 1.44, 0.848);
    const latchArm = new THREE.Mesh(
      new RoundedBoxGeometry(0.11, 0.21, 0.032, 2, 0.01),
      this.polishedGold
    );
    latchArm.position.y = 0.08;
    this.latchPivot.add(latchArm);
    this.bodyGroup.add(this.latchPivot);
  }

  private buildHingedLid(): void {
    // Rear hinge barrels on back edge
    const hingeGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.24, 16);
    for (const hx of [-0.46, 0.46]) {
      const barrel = new THREE.Mesh(hingeGeo, this.polishedGold);
      barrel.rotation.z = Math.PI / 2;
      barrel.position.set(hx, 1.565, -0.81);
      this.bodyGroup.add(barrel);
    }

    // Lid pivot placed right along rear hinge axis
    this.lidPivot.position.set(0, 1.565, -0.80);
    this.bodyGroup.add(this.lidPivot);

    // All lid geometry offset forward by +0.80 in Z relative to rear hinge
    const lidContent = new THREE.Group();
    lidContent.position.set(0, 0, 0.80);
    this.lidPivot.add(lidContent);

    // Brass lower lip frame of lid
    const lidLip = new THREE.Mesh(
      new RoundedBoxGeometry(1.70, 0.06, 1.70, 4, 0.02),
      this.brushedBrass
    );
    lidLip.position.y = 0.03;
    lidLip.castShadow = true;
    lidLip.receiveShadow = true;
    lidContent.add(lidLip);

    // Main beveled burgundy lid tier
    const lidMain = new THREE.Mesh(
      new RoundedBoxGeometry(1.64, 0.14, 1.64, 4, 0.035),
      this.burgundyLacquer
    );
    lidMain.position.y = 0.11;
    lidMain.castShadow = true;
    lidMain.receiveShadow = true;
    lidContent.add(lidMain);

    // Upper navy crown tier
    const lidCrown = new THREE.Mesh(
      new RoundedBoxGeometry(1.26, 0.08, 1.26, 4, 0.025),
      this.navyEnamel
    );
    lidCrown.position.y = 0.20;
    lidCrown.castShadow = true;
    lidContent.add(lidCrown);

    // Top ornamental brass ring & finial medallion
    const topRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.02, 12, 48),
      this.polishedGold
    );
    topRing.rotation.x = Math.PI / 2;
    topRing.position.y = 0.242;
    lidContent.add(topRing);

    const topFinial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 0.04, 24),
      this.polishedGold
    );
    topFinial.position.y = 0.252;
    lidContent.add(topFinial);

    // Velvet recessed panel on underside of lid (visible when lid flips open!)
    const underVelvet = new THREE.Mesh(
      new RoundedBoxGeometry(1.38, 0.02, 1.38, 2, 0.01),
      this.darkVelvet
    );
    underVelvet.position.y = 0.005;
    lidContent.add(underVelvet);

    const underRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.46, 0.018, 12, 48),
      this.brushedBrass
    );
    underRing.rotation.x = Math.PI / 2;
    underRing.position.y = -0.002;
    lidContent.add(underRing);

    // Front lid clasp catch tab
    const lidCatch = new THREE.Mesh(
      new RoundedBoxGeometry(0.14, 0.07, 0.04, 2, 0.01),
      this.polishedGold
    );
    lidCatch.position.set(0, 0.02, 0.855);
    lidContent.add(lidCatch);
  }

  private buildInternalSpringAndLight(): void {
    // Warm golden interior light that illuminates cavity and spills out when lid opens
    this.interiorLight = new THREE.PointLight('#ffbe6b', 0.2, 5.5, 1.6);
    this.interiorLight.position.set(0, 1.15, 0);
    this.bodyGroup.add(this.interiorLight);

    // Base socket inside cavity floor
    const socket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.30, 0.08, 24),
      this.brushedBrass
    );
    socket.position.y = 0.34;
    this.bodyGroup.add(socket);

    // Outer brass piston sleeve
    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.095, 0.55, 20),
      this.brushedBrass
    );
    sleeve.position.y = 0.60;
    this.bodyGroup.add(sleeve);

    // Dynamic helical brass coil spring
    this.springMesh = new THREE.Group();
    this.springMesh.position.set(0, 0.36, 0);

    const turns = 8.5;
    const height = 1.88;
    const radius = 0.25;
    const points: THREE.Vector3[] = [];
    const samples = 200;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const angle = t * turns * Math.PI * 2;
      // Slight taper at top & bottom for authentic coil spring silhouette
      const r = radius * (0.85 + 0.15 * Math.sin(t * Math.PI));
      points.push(new THREE.Vector3(Math.cos(angle) * r, t * height, Math.sin(angle) * r));
    }
    const helixCurve = new THREE.CatmullRomCurve3(points);
    const coilGeo = new THREE.TubeGeometry(helixCurve, 180, 0.026, 10, false);
    const coil = new THREE.Mesh(coilGeo, this.polishedGold);
    coil.castShadow = true;
    this.springMesh.add(coil);

    // Top brass cradle ring attached to top of spring
    const cradlePlate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.16, 0.05, 24),
      this.brushedBrass
    );
    cradlePlate.position.y = height;
    this.springMesh.add(cradlePlate);

    this.launchCradleAnchor.position.set(0, height + 0.12, 0);
    this.springMesh.add(this.launchCradleAnchor);

    this.springMesh.scale.y = this.springExtension;
    this.bodyGroup.add(this.springMesh);

    // Telescoping inner brass rod tracking spring extension
    this.pistonInner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.052, 1.35, 16),
      this.polishedGold
    );
    this.pistonInner.position.set(0, 0.72, 0);
    this.bodyGroup.add(this.pistonInner);
  }

  private buildCrankMechanism(): void {
    const mountX = 0.825;
    const mountY = 0.90;

    // Ornate circular brass escutcheon plate on right (+X) wall
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.31, 0.036, 32),
      this.brushedBrass
    );
    plate.rotation.z = -Math.PI / 2;
    plate.position.set(mountX, mountY, 0);
    plate.castShadow = true;
    this.bodyGroup.add(plate);

    // 6 rivets around escutcheon
    const rivetGeo = new THREE.SphereGeometry(0.018, 10, 10);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const rivet = new THREE.Mesh(rivetGeo, this.polishedGold);
      rivet.position.set(mountX + 0.018, mountY + Math.cos(a) * 0.24, Math.sin(a) * 0.24);
      this.bodyGroup.add(rivet);
    }

    // Subtle glowing hover/interactive halo ring around crank base
    this.crankHaloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffe19c'),
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.365, 40), this.crankHaloMat);
    halo.rotation.y = Math.PI / 2;
    halo.position.set(mountX + 0.022, mountY, 0);
    this.bodyGroup.add(halo);

    // Spring-loaded Ratchet Pawl mounted above the gear
    this.pawlPivot.position.set(mountX + 0.055, mountY + 0.245, -0.06);
    const pawlBody = new THREE.Mesh(
      new RoundedBoxGeometry(0.035, 0.045, 0.14, 2, 0.008),
      this.polishedGold
    );
    pawlBody.position.set(0, -0.02, 0.055);
    pawlBody.rotation.x = 0.32;
    this.pawlPivot.add(pawlBody);

    const pawlPin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.06, 12),
      this.brushedBrass
    );
    pawlPin.rotation.z = Math.PI / 2;
    this.pawlPivot.add(pawlPin);
    this.bodyGroup.add(this.pawlPivot);

    // Rotating Crank Pivot (rotates around X axis when user winds!)
    this.crankPivot.position.set(mountX, mountY, 0);
    this.bodyGroup.add(this.crankPivot);

    // 18-Tooth Extruded Brass Ratchet Gear rotating with the shaft
    const gearShape = this.createGearShape(18, 0.165, 0.205);
    const gearGeo = new THREE.ExtrudeGeometry(gearShape, {
      depth: 0.036,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.005,
      bevelThickness: 0.005
    });
    gearGeo.rotateY(Math.PI / 2);
    const gearMesh = new THREE.Mesh(gearGeo, this.polishedGold);
    gearMesh.position.set(0.035, 0, 0);
    gearMesh.castShadow = true;
    this.crankPivot.add(gearMesh);

    // Main horizontal drive axle extending from right side
    const axle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.048, 0.048, 0.26, 20),
      this.brushedBrass
    );
    axle.rotation.z = -Math.PI / 2;
    axle.position.set(0.13, 0, 0);
    axle.castShadow = true;
    this.crankPivot.add(axle);

    // S-stepped Brass Crank Arm sweeping radially to radius 0.54
    const armRadius = 0.54;
    const arm = new THREE.Mesh(
      new RoundedBoxGeometry(0.055, armRadius + 0.08, 0.095, 3, 0.018),
      this.polishedGold
    );
    arm.position.set(0.25, armRadius * 0.5, 0);
    arm.castShadow = true;
    this.crankPivot.add(arm);

    // Step bend joint
    const elbow = new THREE.Mesh(
      new RoundedBoxGeometry(0.12, 0.10, 0.10, 3, 0.02),
      this.brushedBrass
    );
    elbow.position.set(0.29, armRadius, 0);
    elbow.castShadow = true;
    this.crankPivot.add(elbow);

    // Ergonomic Turned Burgundy & Ivory Handle Grip sticking outward (+X)
    const handleStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.028, 0.34, 16),
      this.brushedBrass
    );
    handleStem.rotation.z = -Math.PI / 2;
    handleStem.position.set(0.46, armRadius, 0);
    this.crankPivot.add(handleStem);

    // Turned grip profile via LatheGeometry
    const gripProfile = [
      new THREE.Vector2(0.032, 0.0),
      new THREE.Vector2(0.068, 0.04),
      new THREE.Vector2(0.082, 0.13),
      new THREE.Vector2(0.064, 0.23),
      new THREE.Vector2(0.042, 0.28)
    ];
    const gripGeo = new THREE.LatheGeometry(gripProfile, 24);
    gripGeo.rotateZ(-Math.PI / 2);
    const gripMesh = new THREE.Mesh(gripGeo, this.ivoryTurned);
    gripMesh.position.set(0.33, armRadius, 0);
    gripMesh.castShadow = true;
    this.crankPivot.add(gripMesh);

    // Burgundy accent band around middle of ivory grip
    const gripBand = new THREE.Mesh(
      new THREE.TorusGeometry(0.079, 0.012, 12, 28),
      this.burgundyLacquer
    );
    gripBand.rotation.y = Math.PI / 2;
    gripBand.position.set(0.46, armRadius, 0);
    this.crankPivot.add(gripBand);

    // Brass finial cap at tip of handle
    const handleTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 16, 16),
      this.polishedGold
    );
    handleTip.position.set(0.63, armRadius, 0);
    this.crankPivot.add(handleTip);

    // Anchor on knob for 2D HUD projection
    this.crankKnobAnchor.position.set(0.50, armRadius, 0);
    this.crankPivot.add(this.crankKnobAnchor);

    // Forgiving invisible hit collider around crank handle + arm for effortless dragging
    const hitSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.46, 12, 12),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitSphere.position.set(0.42, armRadius * 0.72, 0);
    this.crankPivot.add(hitSphere);

    this.crankInteractMeshes.push(hitSphere, gripMesh, arm, gearMesh, plate);
  }

  private createGearShape(teeth: number, innerR: number, outerR: number): THREE.Shape {
    const shape = new THREE.Shape();
    const step = (Math.PI * 2) / teeth;

    for (let i = 0; i < teeth; i++) {
      const a0 = i * step;
      const a1 = a0 + step * 0.22;
      const a2 = a0 + step * 0.48;
      const a3 = a0 + step * 0.72;

      const p0x = Math.cos(a0) * innerR;
      const p0y = Math.sin(a0) * innerR;
      if (i === 0) shape.moveTo(p0x, p0y);
      else shape.lineTo(p0x, p0y);

      shape.lineTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR);
      shape.lineTo(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
      shape.lineTo(Math.cos(a3) * innerR, Math.sin(a3) * innerR);
    }
    shape.closePath();
    return shape;
  }

  private buildPopBurstParticles(): void {
    const count = 80;
    const dirs = new Float32Array(count * 3);
    const seeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spread = 0.25 + Math.random() * 1.15;
      dirs[i * 3] = Math.cos(angle) * spread;
      dirs[i * 3 + 1] = 1.6 + Math.random() * 2.6;
      dirs[i * 3 + 2] = Math.sin(angle) * spread;
      seeds[i] = 0.5 + Math.random() * 1.2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aVelocity', new THREE.BufferAttribute(dirs, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    this.burstMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uAge: { value: 100.0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
      },
      vertexShader: /* glsl */ `
        attribute vec3 aVelocity;
        attribute float aSeed;
        uniform float uAge;
        uniform float uPixelRatio;
        varying float vAlpha;

        void main() {
          float t = max(0.0, uAge);
          // Ballistic arc with gentle air drag
          float dragT = (1.0 - exp(-t * 1.8)) / 1.8;
          vec3 pos = vec3(0.0, 1.45, 0.0) + aVelocity * dragT * 1.9;
          pos.y -= 0.55 * t * t;

          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mv;
          float fade = smoothstep(2.1, 0.15, t) * step(0.001, t);
          vAlpha = fade;
          gl_PointSize = (28.0 * aSeed * fade) * uPixelRatio * (1.0 / max(2.0, -mv.z));
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          if (vAlpha <= 0.005) discard;
          float d = length(gl_PointCoord - 0.5);
          float core = smoothstep(0.5, 0.02, d);
          vec3 col = mix(vec3(0.95, 0.68, 0.30), vec3(1.0, 0.96, 0.85), core);
          gl_FragColor = vec4(col, core * vAlpha);
        }
      `
    });

    this.burstPoints = new THREE.Points(geo, this.burstMaterial);
    this.bodyGroup.add(this.burstPoints);
  }

  public triggerUnlatch(): void {
    // Unlatch front brass clasp outward
    this.latchPivot.rotation.x = 0.68;
  }

  public triggerPop(elapsed: number): void {
    this.targetLidAngle = 1.98; // ~113 deg open backward
    this.lidVelocity = 12.5;
    this.targetSpringExtension = 1.02;
    this.springVelocity = 6.8;
    this.burstStartTime = elapsed;
  }

  public reset(): void {
    this.lidAngle = 0;
    this.lidVelocity = 0;
    this.targetLidAngle = 0;
    this.lidPivot.rotation.x = 0;

    this.springExtension = 0.18;
    this.springVelocity = 0;
    this.targetSpringExtension = 0.18;
    this.springMesh.scale.y = 0.18;

    this.latchPivot.rotation.x = 0;
    this.bodyGroup.scale.set(1, 1, 1);
    this.bodyGroup.rotation.set(0, 0, 0);
    this.bodyGroup.position.set(0, 0, 0);
    this.burstStartTime = -100;
  }

  public update(
    dt: number,
    elapsed: number,
    crankAngle: number,
    windProgress: number,
    isHoveringCrank: boolean,
    isDraggingCrank: boolean,
    isPopped: boolean,
    anticipationPhaseProgress = 0
  ): void {
    const clampedDt = Math.min(dt, 0.05);

    // 1. Rotate crank & animate clicking ratchet pawl over the 18 teeth
    this.crankPivot.rotation.x = -crankAngle;
    const toothPhase = ((crankAngle * 18) / (Math.PI * 2)) % 1;
    const normalizedTooth = toothPhase < 0 ? toothPhase + 1 : toothPhase;
    this.pawlPivot.rotation.x = -0.18 * Math.pow(normalizedTooth, 1.6);

    // 2. Interactive crank halo & front medallion tension glow
    const targetHalo = isPopped
      ? 0.0
      : isDraggingCrank
        ? 0.55
        : isHoveringCrank
          ? 0.42
          : 0.16 + 0.12 * Math.sin(elapsed * 3.0);
    this.crankHaloMat.opacity += (targetHalo - this.crankHaloMat.opacity) * Math.min(1, clampedDt * 10);

    this.tensionGlowMat.emissiveIntensity = isPopped
      ? 0.55
      : 0.08 + Math.pow(windProgress, 1.5) * 1.45;

    // 3. Mechanical box reaction, torsion, rumble & anticipation squash
    if (!isPopped) {
      if (anticipationPhaseProgress > 0) {
        // Dramatic coil compression right before POP!
        const squash = Math.sin(anticipationPhaseProgress * Math.PI) * 0.075;
        this.bodyGroup.scale.set(1 + squash * 0.65, 1 - squash, 1 + squash * 0.65);
        this.bodyGroup.rotation.z = Math.sin(elapsed * 58) * 0.018 * anticipationPhaseProgress;
        this.targetLidAngle = 0.055; // Slight lid peek letting warm gold light gleam through!
        this.interiorLight.intensity = 2.4 * anticipationPhaseProgress;
      } else {
        // Subtle mechanical rocking synchronized to crank rotation + high-wind vibration
        const tensionRumble = Math.max(0, (windProgress - 0.58) / 0.42);
        const vibration = Math.sin(elapsed * 46) * 0.011 * tensionRumble * tensionRumble;
        const crankRock = isDraggingCrank ? Math.sin(crankAngle * 2) * 0.014 : 0;

        this.bodyGroup.rotation.z = vibration + crankRock;
        this.bodyGroup.rotation.x = Math.cos(elapsed * 39) * 0.008 * tensionRumble;

        const breathSquash = isDraggingCrank ? Math.sin(crankAngle * 3) * 0.012 : 0;
        this.bodyGroup.scale.set(1 - breathSquash * 0.5, 1 + breathSquash, 1 - breathSquash * 0.5);

        // Above 72% wind, lid strains slightly against the front brass latch
        const lidStrain = Math.max(0, (windProgress - 0.72) / 0.28);
        this.targetLidAngle = lidStrain * (0.032 + 0.015 * Math.sin(elapsed * 28));
        this.interiorLight.intensity = 0.25 + lidStrain * 1.8;
      }
    } else {
      // Smoothly settle cabinet squash/rotation back to neutral after pop recoil
      this.bodyGroup.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, clampedDt * 7));
      this.bodyGroup.rotation.x *= Math.max(0, 1 - clampedDt * 8);
      this.bodyGroup.rotation.z *= Math.max(0, 1 - clampedDt * 8);
      this.interiorLight.intensity += (3.2 - this.interiorLight.intensity) * Math.min(1, clampedDt * 5);

      // Gentle spring idle bob once extended
      this.targetSpringExtension = 0.86 + Math.sin(elapsed * 2.4) * 0.025;
    }

    // 4. Spring-damper physics for hinged lid
    const lidStiffness = isPopped ? 95 : 180;
    const lidDamping = isPopped ? 8.2 : 18.0;
    const lidForce = (this.targetLidAngle - this.lidAngle) * lidStiffness - this.lidVelocity * lidDamping;
    this.lidVelocity += lidForce * clampedDt;
    this.lidAngle = Math.max(0, Math.min(2.25, this.lidAngle + this.lidVelocity * clampedDt));
    this.lidPivot.rotation.x = -this.lidAngle;

    // 5. Spring-damper physics for internal helical coil spring
    const spStiffness = 110;
    const spDamping = 6.5;
    const spForce =
      (this.targetSpringExtension - this.springExtension) * spStiffness - this.springVelocity * spDamping;
    this.springVelocity += spForce * clampedDt;
    this.springExtension = Math.max(0.14, this.springExtension + this.springVelocity * clampedDt);
    this.springMesh.scale.y = this.springExtension;
    this.pistonInner.scale.y = Math.min(1.0, this.springExtension * 0.95);
    this.pistonInner.position.y = 0.36 + 0.65 * this.pistonInner.scale.y;

    // 6. Update pop-out golden burst particles
    if (this.burstStartTime > 0) {
      this.burstMaterial.uniforms.uAge.value = elapsed - this.burstStartTime;
    } else {
      this.burstMaterial.uniforms.uAge.value = 100.0;
    }
  }
}
