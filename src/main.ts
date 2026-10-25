import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { SoundEngine } from './audio/SoundEngine';
import { StudioEnvironment } from './scene/StudioEnvironment';
import { JackInTheBox } from './models/JackInTheBox';
import { Airplane } from './models/Airplane';
import { FlightChoreographer } from './flight/SkywritingPaths';
import { SmokeTrailSystem } from './flight/SmokeTrailSystem';
import { ExperiencePhase } from './types';

class AviationJackInTheBoxApp {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;

  private readonly sound = new SoundEngine();
  private readonly studio: StudioEnvironment;
  private readonly jackBox: JackInTheBox;
  private readonly airplane: Airplane;
  private readonly choreographer = new FlightChoreographer();
  private readonly smoke: SmokeTrailSystem;

  // State machine
  private phase: ExperiencePhase = 'IDLE_WINDING';
  private phaseTime = 0;
  private elapsed = 0;
  private poppedTriggered = false;

  // Winding state
  private readonly fullWindRadians = Math.PI * 2 * 3.2; // 3.2 full crank turns
  private crankAngle = 0;
  private windProgress = 0;
  private lastClickTooth = 0;

  // Pointer & keyboard interaction
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNDC = new THREE.Vector2(0, 0);
  private readonly parallaxTarget = new THREE.Vector2(0, 0);
  private readonly parallaxSmoothed = new THREE.Vector2(0, 0);

  private isHoveringCrank = false;
  private isDraggingCrank = false;
  private lastPointerAngle = 0;
  private lastPointerClient = new THREE.Vector2();
  private isSpaceHeld = false;

  // Smooth camera rig state
  private readonly camPos = new THREE.Vector3(0.42, 0.12, 5.45);
  private readonly camLook = new THREE.Vector3(0.10, -0.58, 0.0);
  private readonly targetCamPos = new THREE.Vector3();
  private readonly targetCamLook = new THREE.Vector3();

  // Reusable vectors
  private readonly _projVec = new THREE.Vector3();
  private readonly _nozzleWorld = new THREE.Vector3();
  private readonly _cradleWorld = new THREE.Vector3();

  // DOM HUD elements
  private readonly phaseLabelEl: HTMLElement;
  private readonly headerTitleEl: HTMLElement;
  private readonly audioToggleBtn: HTMLButtonElement;
  private readonly audioBarsEl: HTMLElement;
  private readonly audioLabelEl: HTMLElement;
  private readonly crankCalloutEl: HTMLElement;
  private readonly windingHudEl: HTMLElement;
  private readonly tensionRingFillEl: SVGCircleElement;
  private readonly tensionStatusEl: HTMLElement;
  private readonly tensionPercentEl: HTMLElement;
  private readonly finaleHudEl: HTMLElement;
  private readonly replayBtn: HTMLButtonElement;

  private lastFrameTime = performance.now();

  constructor() {
    this.container = document.getElementById('canvas-container')!;
    this.phaseLabelEl = document.getElementById('ife-phase-label')!;
    this.headerTitleEl = document.getElementById('ife-header-title')!;
    this.audioToggleBtn = document.getElementById('audio-toggle') as HTMLButtonElement;
    this.audioBarsEl = document.getElementById('audio-bars')!;
    this.audioLabelEl = document.getElementById('audio-label')!;
    this.crankCalloutEl = document.getElementById('crank-callout')!;
    this.windingHudEl = document.getElementById('winding-hud')!;
    this.tensionRingFillEl = document.getElementById('tension-ring-fill') as unknown as SVGCircleElement;
    this.tensionStatusEl = document.getElementById('tension-status-text')!;
    this.tensionPercentEl = document.getElementById('tension-percent')!;
    this.finaleHudEl = document.getElementById('finale-hud')!;
    this.replayBtn = document.getElementById('replay-btn') as HTMLButtonElement;

    // 1. Initialize WebGLRenderer
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.container.appendChild(this.renderer.domElement);

    // 2. Scene & Camera
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 160);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    // 3. Multisampled Post-Processing Composer (subtle luxury bloom + ACES output)
    const renderTarget = new THREE.WebGLRenderTarget(
      width * this.renderer.getPixelRatio(),
      height * this.renderer.getPixelRatio(),
      {
        type: THREE.HalfFloatType,
        samples: 4
      }
    );
    this.composer = new EffectComposer(this.renderer, renderTarget);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.26, 0.45, 0.90);
    const outputPass = new OutputPass();

    this.composer.addPass(renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(outputPass);

    // 4. Construct 3D World, Decorative Jack-in-the-Box, Aircraft & Smoke System
    this.studio = new StudioEnvironment(this.renderer, this.scene);

    this.jackBox = new JackInTheBox();
    this.scene.add(this.jackBox.root);

    this.airplane = new Airplane();
    this.airplane.root.visible = false;
    this.scene.add(this.airplane.root);

    this.smoke = new SmokeTrailSystem(this.scene);

    // 5. Bind Input, UI Controls, Resize & Debug API
    this.bindEvents();
    this.exposeDebugAPI();
    this.updateWindingHUD();

    // 6. Start Render Loop
    requestAnimationFrame(this.animate);
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.onResize);

    const dom = this.renderer.domElement;
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    this.audioToggleBtn.addEventListener('click', () => {
      const muted = this.sound.toggleMute();
      this.audioBarsEl.classList.toggle('muted', muted);
      this.audioLabelEl.textContent = muted ? 'MUTED' : 'SOUND';
    });

    this.replayBtn.addEventListener('click', () => {
      this.sound.unlock();
      this.resetToStart();
    });
  }

  private onResize = (): void => {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
    this.updateCrankCalloutScreenPos();
  };

  private updatePointerNDC(clientX: number, clientY: number): void {
    const rect = this.container.getBoundingClientRect();
    this.pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  private getCrankPivotScreenPos(): THREE.Vector2 {
    const rect = this.container.getBoundingClientRect();
    this.jackBox.crankPivot.getWorldPosition(this._projVec);
    this._projVec.project(this.camera);
    return new THREE.Vector2(
      ((this._projVec.x + 1) * 0.5) * rect.width + rect.left,
      ((-this._projVec.y + 1) * 0.5) * rect.height + rect.top
    );
  }

  private onPointerMove = (e: PointerEvent): void => {
    this.updatePointerNDC(e.clientX, e.clientY);

    // Update subtle mouse camera parallax (hold steady while actively cranking!)
    if (!this.isDraggingCrank) {
      this.parallaxTarget.set(
        THREE.MathUtils.clamp(this.pointerNDC.x, -1, 1),
        THREE.MathUtils.clamp(this.pointerNDC.y, -1, 1)
      );
    }

    if (this.phase === 'IDLE_WINDING') {
      if (this.isDraggingCrank) {
        const pivotPx = this.getCrankPivotScreenPos();
        const dx = e.clientX - pivotPx.x;
        const dy = e.clientY - pivotPx.y;
        const distFromPivot = Math.hypot(dx, dy);

        const moveDx = e.clientX - this.lastPointerClient.x;
        const moveDy = e.clientY - this.lastPointerClient.y;

        if (distFromPivot > 24) {
          // Circular cranking around the 3D shaft pivot
          const currentAngle = Math.atan2(dy, dx);
          let delta = currentAngle - this.lastPointerAngle;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          this.lastPointerAngle = currentAngle;

          // Support both clockwise & counterclockwise circular winding smoothly
          const advance = Math.abs(delta);
          if (advance > 0.001 && advance < 0.85) {
            this.advanceCrank(advance);
          }
        } else {
          // Close to shaft center: fall back cleanly to linear drag motion
          const linearAdvance = (Math.abs(moveDy) + Math.abs(moveDx) * 0.5) * 0.016;
          this.advanceCrank(linearAdvance);
          this.lastPointerAngle = Math.atan2(dy, dx);
        }

        this.lastPointerClient.set(e.clientX, e.clientY);
      } else {
        // Check hover over crank assembly
        this.raycaster.setFromCamera(this.pointerNDC, this.camera);
        const hits = this.raycaster.intersectObjects(this.jackBox.crankInteractMeshes, false);
        this.isHoveringCrank = hits.length > 0;
        this.container.classList.toggle('crank-hover', this.isHoveringCrank);
      }
    }
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.sound.unlock();
    this.updatePointerNDC(e.clientX, e.clientY);

    if (this.phase !== 'IDLE_WINDING') return;

    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    const hits = this.raycaster.intersectObjects(this.jackBox.crankInteractMeshes, false);

    // Also allow grabbing if clicking near the projected crank handle on screen
    const pivotPx = this.getCrankPivotScreenPos();
    const nearCrankScreen = Math.hypot(e.clientX - pivotPx.x, e.clientY - pivotPx.y) < 155;

    if (hits.length > 0 || nearCrankScreen) {
      this.isDraggingCrank = true;
      this.container.classList.add('crank-dragging');
      this.container.classList.remove('crank-hover');
      this.lastPointerAngle = Math.atan2(e.clientY - pivotPx.y, e.clientX - pivotPx.x);
      this.lastPointerClient.set(e.clientX, e.clientY);
    }
  };

  private onPointerUp = (): void => {
    if (this.isDraggingCrank) {
      this.isDraggingCrank = false;
      this.container.classList.remove('crank-dragging');
    }
  };

  private onWheel = (e: WheelEvent): void => {
    if (this.phase !== 'IDLE_WINDING') return;
    e.preventDefault();
    this.sound.unlock();
    const delta = Math.min(0.45, (Math.abs(e.deltaY) + Math.abs(e.deltaX)) * 0.0042);
    if (delta > 0.001) {
      this.advanceCrank(delta);
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Space' && this.phase === 'IDLE_WINDING') {
      e.preventDefault();
      this.sound.unlock();
      this.isSpaceHeld = true;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space') {
      this.isSpaceHeld = false;
    }
  };

  /**
   * Advances the mechanical crank by `deltaRadians` and triggers ratchet audio & pop threshold.
   */
  public advanceCrank(deltaRadians: number): void {
    if (this.phase !== 'IDLE_WINDING' || deltaRadians <= 0) return;

    this.crankAngle += deltaRadians;
    this.windProgress = Math.min(1.0, this.crankAngle / this.fullWindRadians);

    // Trigger mechanical gear click + music-box chime every 20 degrees (18-tooth gear)
    const toothIndex = Math.floor((this.crankAngle * 18) / (Math.PI * 2));
    if (toothIndex > this.lastClickTooth) {
      this.lastClickTooth = toothIndex;
      this.sound.triggerCrankStep(this.windProgress);
    }

    this.updateWindingHUD();

    if (this.windProgress >= 1.0) {
      this.enterPhase('ANTICIPATION_POP');
    }
  }

  private updateWindingHUD(): void {
    const pct = Math.round(this.windProgress * 100);
    this.tensionPercentEl.textContent = `${pct}%`;

    // Circumference of r=18 circle is 2 * PI * 18 = 113.097
    const circumference = 113.1;
    this.tensionRingFillEl.style.strokeDashoffset = `${circumference * (1 - this.windProgress)}`;

    if (pct === 0) {
      this.tensionStatusEl.textContent = 'Wind the Mechanical Crank';
    } else if (pct < 45) {
      this.tensionStatusEl.textContent = 'Winding Spring Mechanism...';
    } else if (pct < 80) {
      this.tensionStatusEl.textContent = 'Building Cabin Pressure...';
    } else {
      this.tensionStatusEl.textContent = 'Cleared for Departure!';
    }

    if (this.windProgress > 0.06 || this.isDraggingCrank) {
      this.crankCalloutEl.classList.add('hidden');
    }
  }

  private enterPhase(next: ExperiencePhase): void {
    this.phase = next;
    this.phaseTime = 0;

    switch (next) {
      case 'IDLE_WINDING':
        this.phaseLabelEl.textContent = 'READY TO WIND';
        this.headerTitleEl.classList.remove('dimmed');
        this.windingHudEl.classList.remove('hidden');
        this.finaleHudEl.classList.add('hidden');
        this.crankCalloutEl.classList.remove('hidden');
        break;

      case 'ANTICIPATION_POP':
        this.isDraggingCrank = false;
        this.isSpaceHeld = false;
        this.container.classList.remove('crank-dragging', 'crank-hover');
        this.crankCalloutEl.classList.add('hidden');
        this.windingHudEl.classList.add('hidden');
        this.phaseLabelEl.textContent = 'CLEARED FOR TAKEOFF';
        this.poppedTriggered = false;
        this.jackBox.triggerUnlatch();
        this.sound.triggerLatchSnap();
        break;

      case 'AEROBATIC_LAUNCH':
        this.phaseLabelEl.textContent = 'AEROBATIC DEPARTURE';
        this.headerTitleEl.classList.add('dimmed');
        this.airplane.root.visible = true;
        this.choreographer.resetRoll();
        break;

      case 'SKYWRITING':
        this.phaseLabelEl.textContent = 'AERIAL SKYWRITING';
        break;

      case 'FINAL_FLYBY':
        this.phaseLabelEl.textContent = 'FINALE SALUTE';
        this.sound.triggerFinaleChord();
        break;

      case 'SETTLED_END':
        this.phaseLabelEl.textContent = 'QATAR AIRWAYS';
        this.headerTitleEl.classList.remove('dimmed');
        this.airplane.root.visible = false;
        this.sound.updateFlightAudio(false, 0, 15, false);
        this.finaleHudEl.classList.remove('hidden');
        break;
    }
  }

  public resetToStart(): void {
    this.crankAngle = 0;
    this.windProgress = 0;
    this.lastClickTooth = 0;
    this.poppedTriggered = false;

    this.parallaxTarget.set(0, 0);
    this.parallaxSmoothed.set(0, 0);
    this.targetCamPos.set(0.42, 0.12, 5.45);
    this.targetCamLook.set(0.12, -0.62, 0.0);
    this.camPos.set(0.42, 0.22, 6.15);
    this.camLook.set(0.12, -0.52, 0.0);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    this.jackBox.reset();
    this.smoke.reset();
    this.sound.resetMelody();
    this.sound.updateFlightAudio(false, 0, 15, false);

    this.airplane.root.visible = false;
    this.airplane.root.position.set(0, 0, 0);
    this.updateWindingHUD();
    this.enterPhase('IDLE_WINDING');
    this.updateCrankCalloutScreenPos();
  }

  private updateCrankCalloutScreenPos(): void {
    if (this.phase !== 'IDLE_WINDING' || this.windProgress > 0.06 || this.isDraggingCrank) return;
    const rect = this.container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    this.camera.updateMatrixWorld();
    this.jackBox.root.updateMatrixWorld(true);
    this.jackBox.crankKnobAnchor.getWorldPosition(this._projVec);
    this._projVec.project(this.camera);
    const sx = ((this._projVec.x + 1) * 0.5) * rect.width;
    const sy = ((-this._projVec.y + 1) * rect.height) * 0.5;
    this.crankCalloutEl.style.left = `${sx}px`;
    this.crankCalloutEl.style.top = `${sy}px`;
  }

  private getResponsiveSkyCameraZ(baseZ: number): number {
    // Guarantee the full ~16.3-unit "Qatar Airways" skywriting span has generous side margins at any aspect ratio
    const aspect = Math.max(0.5, this.camera.aspect);
    const minHalfWidth = 9.45;
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5));
    const neededZ = minHalfWidth / (tanHalfFov * aspect) - 0.55;
    return Math.max(baseZ, Math.min(36.0, neededZ));
  }

  /**
   * Deterministic simulation step separated from requestAnimationFrame so both
   * real-time rendering and automated multi-step verification work identically.
   */
  public stepSimulation(dt: number): void {
    const safeDt = Math.min(dt, 0.05);
    const prevPhaseTime = this.phaseTime;
    this.elapsed += safeDt;
    this.phaseTime += safeDt;

    // Spacebar hold continuous winding support
    if (this.phase === 'IDLE_WINDING' && this.isSpaceHeld) {
      this.advanceCrank(safeDt * 6.2);
    }

    // Smooth pointer parallax interpolation
    this.parallaxSmoothed.lerp(this.parallaxTarget, Math.min(1, safeDt * 4.5));

    // Update environment motes & pedestal
    this.studio.update(this.elapsed);

    // Phase-specific logic & choreography
    if (this.phase === 'IDLE_WINDING') {
      this.jackBox.update(
        safeDt,
        this.elapsed,
        this.crankAngle,
        this.windProgress,
        this.isHoveringCrank,
        this.isDraggingCrank,
        false,
        0
      );

      // Sculptural close-up camera framing the Jack-in-the-Box + right crank
      this.targetCamPos.set(
        0.42 + this.parallaxSmoothed.x * 0.65,
        0.12 + this.parallaxSmoothed.y * 0.36,
        5.45
      );
      this.targetCamLook.set(
        0.12 + this.parallaxSmoothed.x * 0.14,
        -0.62 + this.parallaxSmoothed.y * 0.10,
        0.0
      );
    } else if (this.phase === 'ANTICIPATION_POP') {
      const popMoment = 0.38;
      if (this.phaseTime < popMoment) {
        const antProg = this.phaseTime / popMoment;
        this.jackBox.update(safeDt, this.elapsed, this.crankAngle, 1.0, false, false, false, antProg);

        this.targetCamPos.set(0.28, 0.25, 6.05);
        this.targetCamLook.set(0.05, -0.45, 0.0);
      } else {
        if (!this.poppedTriggered) {
          this.poppedTriggered = true;
          this.jackBox.triggerPop(this.elapsed);
          this.sound.triggerPopOut();
          this.airplane.root.visible = true;
        }
        this.jackBox.update(safeDt, this.elapsed, this.crankAngle, 1.0, false, false, true, 0);

        // During the first 0.28s after lid burst, aircraft rides the extending brass spring upward!
        this.jackBox.launchCradleAnchor.getWorldPosition(this._cradleWorld);
        const riseT = Math.min(1, (this.phaseTime - popMoment) / 0.28);
        const launchPos = this._cradleWorld.clone();
        launchPos.y += riseT * 0.15;
        const launchTan = new THREE.Vector3(0.02, 0.96, 0.28).normalize();
        this.airplane.setFlightPose(launchPos, launchTan, 0, false);
        this.airplane.updateEffects(safeDt, this.elapsed, false, 0.85);

        this.targetCamPos.set(0.15, 0.55, 7.2);
        this.targetCamLook.set(0.0, 0.15, 0.0);

        if (this.phaseTime >= popMoment + 0.28) {
          this.enterPhase('AEROBATIC_LAUNCH');
        }
      }
    } else if (this.phase === 'AEROBATIC_LAUNCH') {
      this.jackBox.update(safeDt, this.elapsed, this.crankAngle, 1.0, false, false, true, 0);

      const sample = this.choreographer.sampleSequence(
        this.choreographer.launchSegments,
        this.phaseTime,
        safeDt
      );
      this.airplane.setFlightPose(sample.position, sample.tangent, sample.rollAngle);
      this.airplane.updateEffects(safeDt, this.elapsed, sample.emitSmoke, 1.0);

      this.airplane.smokeNozzleAnchor.getWorldPosition(this._nozzleWorld);
      this.smoke.emitAt(
        this._nozzleWorld,
        this.elapsed,
        sample.emitSmoke,
        sample.persistentSmoke,
        sample.strokeId
      );

      const distCam = this.camera.position.distanceTo(sample.position);
      this.sound.updateFlightAudio(true, sample.speed, distCam, sample.emitSmoke);

      // Camera pulls smoothly back into panoramic sky view while subtly tracking the playful swoop
      const skyZ = this.getResponsiveSkyCameraZ(13.8);
      const blend = THREE.MathUtils.smoothstep(sample.normalizedProgress, 0.0, 0.92);
      const baseZ = THREE.MathUtils.lerp(8.2, skyZ, blend);

      this.targetCamPos.set(
        sample.position.x * 0.24 * (1 - blend * 0.4) + this.parallaxSmoothed.x * 0.75,
        THREE.MathUtils.lerp(0.85, 1.42, blend) + this.parallaxSmoothed.y * 0.45,
        baseZ
      );
      this.targetCamLook.set(
        sample.position.x * 0.26 * (1 - blend * 0.5),
        THREE.MathUtils.lerp(0.55, 1.55, blend),
        0.0
      );

      if (this.phaseTime >= this.choreographer.launchDuration) {
        this.enterPhase('SKYWRITING');
      }
    } else if (this.phase === 'SKYWRITING') {
      this.jackBox.update(safeDt, this.elapsed, this.crankAngle, 1.0, false, false, true, 0);

      const sample = this.choreographer.sampleSequence(
        this.choreographer.skywritingSegments,
        this.phaseTime,
        safeDt
      );
      this.airplane.setFlightPose(sample.position, sample.tangent, sample.rollAngle);
      this.airplane.updateEffects(safeDt, this.elapsed, sample.emitSmoke, 1.0);

      // Emit exact spline-aligned sub-steps across [prevPhaseTime, clampedEnd] so stroke caps never clip
      const clampedEnd = Math.min(this.phaseTime, this.choreographer.skywritingDuration);
      this.choreographer.emitWindowStrokes(
        this.choreographer.skywritingSegments,
        prevPhaseTime,
        clampedEnd,
        (pos, emitActive, persistent, strokeId) => {
          this.smoke.emitAt(pos, this.elapsed, emitActive, persistent, strokeId);
        }
      );

      const distCam = this.camera.position.distanceTo(sample.position);
      this.sound.updateFlightAudio(true, sample.speed, distCam, sample.emitSmoke);

      // Majestic wide sky framing with gentle horizontal breathing following the skywriting progress
      const skyZ = this.getResponsiveSkyCameraZ(13.85);
      this.targetCamPos.set(
        sample.position.x * 0.12 + this.parallaxSmoothed.x * 0.85,
        1.45 + this.parallaxSmoothed.y * 0.50,
        skyZ
      );
      this.targetCamLook.set(
        sample.position.x * 0.09,
        1.58,
        -0.35
      );

      if (this.phaseTime >= this.choreographer.skywritingDuration) {
        this.enterPhase('FINAL_FLYBY');
      }
    } else if (this.phase === 'FINAL_FLYBY') {
      this.jackBox.update(safeDt, this.elapsed, this.crankAngle, 1.0, false, false, true, 0);

      const sample = this.choreographer.sampleSequence(
        this.choreographer.flybySegments,
        this.phaseTime,
        safeDt
      );
      this.airplane.setFlightPose(sample.position, sample.tangent, sample.rollAngle);
      this.airplane.updateEffects(safeDt, this.elapsed, sample.emitSmoke, 1.0);

      this.airplane.smokeNozzleAnchor.getWorldPosition(this._nozzleWorld);
      this.smoke.emitAt(
        this._nozzleWorld,
        this.elapsed,
        sample.emitSmoke,
        sample.persistentSmoke,
        sample.strokeId
      );

      const distCam = this.camera.position.distanceTo(sample.position);
      this.sound.updateFlightAudio(true, sample.speed, distCam, false);

      // Settle smoothly onto the iconic symmetrical hero composition framing "Qatar Airways" + Jack-in-the-Box
      const skyZ = this.getResponsiveSkyCameraZ(13.95);
      this.targetCamPos.set(
        this.parallaxSmoothed.x * 0.90,
        1.40 + this.parallaxSmoothed.y * 0.52,
        skyZ
      );
      this.targetCamLook.set(
        this.parallaxSmoothed.x * 0.18,
        1.50 + this.parallaxSmoothed.y * 0.14,
        -0.35
      );

      if (this.phaseTime >= this.choreographer.flybyDuration) {
        this.enterPhase('SETTLED_END');
      }
    } else if (this.phase === 'SETTLED_END') {
      this.jackBox.update(safeDt, this.elapsed, this.crankAngle, 1.0, false, false, true, 0);
      this.smoke.updateTime(this.elapsed);

      const skyZ = this.getResponsiveSkyCameraZ(13.95);
      this.targetCamPos.set(
        this.parallaxSmoothed.x * 0.95,
        1.40 + this.parallaxSmoothed.y * 0.52,
        skyZ
      );
      this.targetCamLook.set(
        this.parallaxSmoothed.x * 0.20,
        1.50 + this.parallaxSmoothed.y * 0.15,
        -0.35
      );
    }

    // Smooth cinematic camera damping
    const camLerp = Math.min(1, safeDt * 3.6);
    this.camPos.lerp(this.targetCamPos, camLerp);
    this.camLook.lerp(this.targetCamLook, camLerp);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    // Project 2D crank callout strictly after camera & crank world transforms are up to date
    this.updateCrankCalloutScreenPos();
  }

  private animate = (now: number): void => {
    requestAnimationFrame(this.animate);
    const dt = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;

    this.stepSimulation(dt);
    this.composer.render();
  };

  private exposeDebugAPI(): void {
    window.__JACK_BOX_DEBUG__ = {
      getState: () => ({
        phase: this.phase,
        windProgress: Number(this.windProgress.toFixed(4)),
        crankAngle: Number(this.crankAngle.toFixed(3)),
        lidOpenAngle: Number((-this.jackBox.lidPivot.rotation.x).toFixed(3)),
        airplaneVisible: this.airplane.root.visible,
        airplanePosition: [
          Number(this.airplane.root.position.x.toFixed(2)),
          Number(this.airplane.root.position.y.toFixed(2)),
          Number(this.airplane.root.position.z.toFixed(2))
        ],
        activeSmokePuffs: this.smoke.getActivePuffCount(),
        completedStrokes: this.smoke.getCompletedStrokeCount(),
        totalSkywritingStrokes: this.choreographer.totalSkywritingStrokes,
        replayVisible: !this.finaleHudEl.classList.contains('hidden')
      }),
      windBy: (deltaProgress: number) => {
        this.advanceCrank(deltaProgress * this.fullWindRadians);
      },
      fastForwardPhase: (seconds: number) => {
        const step = 1 / 60;
        let remaining = seconds;
        while (remaining > 0.0001) {
          const s = Math.min(step, remaining);
          this.stepSimulation(s);
          remaining -= s;
        }
        this.composer.render();
      },
      triggerReplay: () => {
        this.resetToStart();
        this.composer.render();
      }
    };
  }
}

new AviationJackInTheBoxApp();
