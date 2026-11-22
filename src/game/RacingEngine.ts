import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SupercarAudioEngine } from './audio';
import {
  createLamborghiniModel,
  createObstacleModel,
  createTrafficCarModel,
  type LamborghiniParts,
  type TrafficVariant,
} from './models';
import {
  createBarrierTexture,
  createBuildingTexture,
  createContactShadowTexture,
  createFinishBannerTexture,
  createRoadTexture,
} from './textures';
import {
  BEST_SCORE_STORAGE_KEY,
  HIGHWAY_LENGTH_METERS,
  MAX_SPEED_KMH,
  type GamePhase,
  type InputState,
  type TelemetryData,
} from './types';

const LANE_CENTERS = [-4.74, -1.6, 1.6, 4.74] as const;
const ROAD_WIDTH = 16.0;
const ROAD_LENGTH = 420;
const ROAD_WRAP_Z = 360;
const SPAWN_AHEAD_Z = -265;
const DESPAWN_BEHIND_Z = 28;

interface ActiveTraffic {
  id: number;
  root: THREE.Group;
  wheels: THREE.Group[];
  lane: number;
  x: number;
  z: number;
  speedMs: number;
  halfW: number;
  halfL: number;
  nearMissed: boolean;
}

interface ActiveObstacle {
  id: number;
  root: THREE.Group;
  lane: number;
  x: number;
  z: number;
  halfW: number;
  halfL: number;
  nearMissed: boolean;
}

interface SparkParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

interface SceneryProp {
  z: number;
  x: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rotY: number;
}

// Pre-allocated math helpers (zero GC in render loop)
const _dummy = new THREE.Object3D();
const _vec3 = new THREE.Vector3();
const _camTarget = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function computeGearAndRpm(speedKmh: number): { gear: number; rpmRatio: number } {
  if (speedKmh < 1) return { gear: 1, rpmRatio: 0.14 };
  const bands = [0, 38, 72, 108, 144, 176, 205];
  for (let g = 1; g <= 6; g++) {
    if (speedKmh <= bands[g] || g === 6) {
      const low = g === 1 ? 0 : bands[g - 1] * 0.78;
      const high = bands[g];
      const ratio = THREE.MathUtils.clamp((speedKmh - low) / Math.max(1, high - low), 0.2, 1.0);
      return { gear: g, rpmRatio: ratio };
    }
  }
  return { gear: 6, rpmRatio: 0.95 };
}

export interface EngineCallbacks {
  onPhaseChange: (phase: GamePhase) => void;
  onTelemetry: (data: TelemetryData) => void;
  onContextLost: (lost: boolean) => void;
}

export class RacingEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  public readonly audio: SupercarAudioEngine;

  private isSoftwareGl: boolean;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private envRT: THREE.WebGLRenderTarget | null = null;

  private roadTexture!: THREE.CanvasTexture;
  private buildingTexture!: THREE.CanvasTexture;
  private barrierTexture!: THREE.CanvasTexture;
  private finishTexture!: THREE.CanvasTexture;
  private shadowTexture!: THREE.CanvasTexture;

  private lambo!: LamborghiniParts;
  private sunLight!: THREE.DirectionalLight;

  // Instanced scenery pools
  private treeTrunks!: THREE.InstancedMesh;
  private treeCanopiesLow!: THREE.InstancedMesh;
  private treeCanopiesHigh!: THREE.InstancedMesh;
  private treeProps: SceneryProp[] = [];

  private buildingsMesh!: THREE.InstancedMesh;
  private buildingProps: SceneryProp[] = [];

  private mountainsMesh!: THREE.InstancedMesh;
  private mountainProps: SceneryProp[] = [];

  private streetLights: THREE.Group[] = [];
  private finishArch!: THREE.Group;

  // Dynamic traffic, obstacles & sparks
  private traffic: ActiveTraffic[] = [];
  private obstacles: ActiveObstacle[] = [];
  private sparks: SparkParticle[] = [];
  private nextEntityId = 1;

  // Game state
  private phase: GamePhase = 'menu';
  private input: InputState = { left: false, right: false, accelerate: false, brake: false };
  private playerX: number = LANE_CENTERS[2];
  private playerVx = 0;
  private speedKmh = 0;
  private distanceMeters = 0;
  private score = 0;
  private bestScore = 0;
  private isNewBest = false;
  private nearMissCount = 0;
  private crashReason = '';
  private spawnAccumulator = 0;
  private crashTimer = 0;
  private cameraShake = 0;
  private menuOrbitTime = 0;

  // Loop management
  private clock = new THREE.Clock();
  private frameId = 0;
  private destroyed = false;
  private lastHudPush = 0;
  private boundResize: () => void;
  private boundContextLost: (e: Event) => void;
  private boundContextRestored: () => void;

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.audio = new SupercarAudioEngine();
    this.isSoftwareGl = detectSoftwareWebGL();
    this.bestScore = this.loadBestScore();

    this.boundResize = this.handleResize.bind(this);
    this.boundContextLost = (e: Event) => {
      e.preventDefault();
      this.callbacks.onContextLost(true);
    };
    this.boundContextRestored = () => {
      this.callbacks.onContextLost(false);
    };

    this.initScene();
    this.pushTelemetry(true);
    this.startLoop();
  }

  private loadBestScore(): number {
    try {
      const raw = window.localStorage.getItem(BEST_SCORE_STORAGE_KEY);
      const parsed = raw ? parseInt(raw, 10) : 0;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch {
      return 0;
    }
  }

  private saveBestScore(value: number): void {
    try {
      window.localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(Math.floor(value)));
    } catch {
      // Ignore storage quota / private mode issues
    }
  }

  private initScene(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);

    const renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = !this.isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.addEventListener('webglcontextlost', this.boundContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', this.boundContextRestored);
    this.container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    const horizonColor = 0x283655;
    scene.background = new THREE.Color(horizonColor);
    scene.fog = new THREE.FogExp2(horizonColor, 0.0052);
    this.scene = scene;

    // Mandatory studio environment map for realistic Lamborghini metallic clearcoat reflections
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    this.envRT = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = this.envRT.texture;
    roomEnv.dispose();
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.2, 520);
    camera.position.set(0, 3.2, 7.6);
    camera.lookAt(0, 0.9, -14);
    this.camera = camera;

    // Lighting rig: Warm golden-hour directional sun + Cool sky hemisphere fill + Rim backlight
    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x282c37, 0.95);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffe7c2, 2.35);
    sun.position.set(22, 34, 18);
    sun.castShadow = !this.isSoftwareGl;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 110;
    const d = 24;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    this.sunLight = sun;

    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.75);
    rimLight.position.set(-18, 12, -30);
    scene.add(rimLight);

    // Sky gradient dome
    this.buildSkyDome();

    // Textures
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    this.roadTexture = createRoadTexture(maxAniso);
    this.roadTexture.repeat.set(1, 14);
    this.buildingTexture = createBuildingTexture(maxAniso);
    this.barrierTexture = createBarrierTexture(maxAniso);
    this.finishTexture = createFinishBannerTexture(maxAniso);
    this.shadowTexture = createContactShadowTexture();

    // Highway & Terrain
    this.buildHighway();
    this.buildScenery();
    this.buildFinishArch();

    // Hero Lamborghini Supercar
    this.lambo = createLamborghiniModel(this.shadowTexture);
    this.lambo.root.position.set(this.playerX, 0, 0);
    scene.add(this.lambo.root);

    if (!this.isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    window.addEventListener('resize', this.boundResize);
  }

  private buildSkyDome(): void {
    const skyGeo = new THREE.SphereGeometry(420, 24, 16);
    const pos = skyGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const zenith = new THREE.Color(0x0f172a);
    const mid = new THREE.Color(0x283655);
    const horizon = new THREE.Color(0x4b4867);
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = THREE.MathUtils.clamp(y / 420, 0, 1);
      if (t < 0.25) {
        tmp.copy(horizon).lerp(mid, t / 0.25);
      } else {
        tmp.copy(mid).lerp(zenith, (t - 0.25) / 0.75);
      }
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    skyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const skyMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      fog: false,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);
  }

  private buildHighway(): void {
    // Ground terrain valley floor
    const terrainGeo = new THREE.PlaneGeometry(700, 620);
    terrainGeo.rotateX(-Math.PI / 2);
    const terrainMat = new THREE.MeshStandardMaterial({
      color: 0x1e2620,
      roughness: 0.95,
      metalness: 0.0,
    });
    const terrain = new THREE.Mesh(terrainGeo, terrainMat);
    terrain.position.set(0, -0.05, -140);
    terrain.receiveShadow = true;
    this.scene.add(terrain);

    // Asphalt highway deck
    const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH);
    roadGeo.rotateX(-Math.PI / 2);
    const roadMat = new THREE.MeshStandardMaterial({
      map: this.roadTexture,
      roughness: 0.72,
      metalness: 0.08,
    });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.position.set(0, 0, -ROAD_LENGTH * 0.5 + 36);
    road.receiveShadow = true;
    this.scene.add(road);

    // Left & Right continuous steel highway guardrails
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.78,
      roughness: 0.34,
    });
    const postMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.6,
      roughness: 0.5,
    });

    const railGeo = new THREE.BoxGeometry(0.14, 0.24, ROAD_LENGTH);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(side * 7.85, 0.58, -ROAD_LENGTH * 0.5 + 36);
      this.scene.add(rail);
    }

    // Guardrail posts as InstancedMesh
    const postCount = 140;
    const postGeo = new THREE.BoxGeometry(0.12, 0.78, 0.12);
    const posts = new THREE.InstancedMesh(postGeo, postMat, postCount);
    let idx = 0;
    for (let i = 0; i < 70; i++) {
      const pz = 30 - i * 6;
      for (const side of [-1, 1]) {
        _dummy.position.set(side * 7.94, 0.39, pz);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        posts.setMatrixAt(idx++, _dummy.matrix);
      }
    }
    posts.instanceMatrix.needsUpdate = true;
    posts.computeBoundingSphere();
    this.scene.add(posts);
  }

  private buildScenery(): void {
    // 1. Trees (InstancedMesh: trunks + 2-tier pine canopies with per-instance color variation)
    const treeCount = 84;
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1.8, 7);
    trunkGeo.translate(0, 0.9, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3525, roughness: 0.92 });
    this.treeTrunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    this.treeTrunks.frustumCulled = false;

    const lowConeGeo = new THREE.ConeGeometry(1.55, 3.6, 8);
    lowConeGeo.translate(0, 3.1, 0);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    this.treeCanopiesLow = new THREE.InstancedMesh(lowConeGeo, foliageMat, treeCount);
    this.treeCanopiesLow.frustumCulled = false;

    const highConeGeo = new THREE.ConeGeometry(1.15, 3.0, 8);
    highConeGeo.translate(0, 4.9, 0);
    this.treeCanopiesHigh = new THREE.InstancedMesh(highConeGeo, foliageMat, treeCount);
    this.treeCanopiesHigh.frustumCulled = false;

    const treePalette = [
      new THREE.Color(0x1f4d2e),
      new THREE.Color(0x265c36),
      new THREE.Color(0x1b4328),
      new THREE.Color(0x2f683e),
    ];

    for (let i = 0; i < treeCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = -330 + (i / treeCount) * ROAD_WRAP_Z + (Math.random() - 0.5) * 6;
      const x = side * (11.5 + Math.random() * 14);
      const s = 0.82 + Math.random() * 0.48;
      this.treeProps.push({
        z,
        x,
        scaleX: s,
        scaleY: s * (0.9 + Math.random() * 0.28),
        scaleZ: s,
        rotY: Math.random() * Math.PI * 2,
      });
      const tint = treePalette[i % treePalette.length];
      this.treeCanopiesLow.setColorAt(i, tint);
      this.treeCanopiesHigh.setColorAt(i, tint);
    }
    this.treeCanopiesLow.instanceColor!.needsUpdate = true;
    this.treeCanopiesHigh.instanceColor!.needsUpdate = true;
    this.scene.add(this.treeTrunks, this.treeCanopiesLow, this.treeCanopiesHigh);

    // 2. City Buildings (InstancedMesh with lit window facade texture)
    const bldCount = 44;
    const bldGeo = new THREE.BoxGeometry(1, 1, 1);
    bldGeo.translate(0, 0.5, 0);
    const bldMat = new THREE.MeshStandardMaterial({
      map: this.buildingTexture,
      roughness: 0.45,
      metalness: 0.35,
    });
    this.buildingsMesh = new THREE.InstancedMesh(bldGeo, bldMat, bldCount);
    this.buildingsMesh.frustumCulled = false;
    for (let i = 0; i < bldCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = -330 + (i / bldCount) * ROAD_WRAP_Z + (Math.random() - 0.5) * 8;
      const x = side * (25 + Math.random() * 28);
      this.buildingProps.push({
        z,
        x,
        scaleX: 7 + Math.random() * 6,
        scaleY: 16 + Math.random() * 34,
        scaleZ: 7 + Math.random() * 6,
        rotY: 0,
      });
    }
    this.scene.add(this.buildingsMesh);

    // 3. Distant Mountain Ranges (InstancedMesh faceted peaks)
    const mtnCount = 32;
    const mtnGeo = new THREE.ConeGeometry(1, 1, 6);
    mtnGeo.translate(0, 0.5, 0);
    const mtnMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      flatShading: true,
    });
    this.mountainsMesh = new THREE.InstancedMesh(mtnGeo, mtnMat, mtnCount);
    this.mountainsMesh.frustumCulled = false;
    const mtnColors = [new THREE.Color(0x283244), new THREE.Color(0x313d52), new THREE.Color(0x232c3d)];
    for (let i = 0; i < mtnCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = -330 + (i / mtnCount) * ROAD_WRAP_Z;
      const x = side * (82 + Math.random() * 90);
      this.mountainProps.push({
        z,
        x,
        scaleX: 46 + Math.random() * 38,
        scaleY: 36 + Math.random() * 48,
        scaleZ: 46 + Math.random() * 38,
        rotY: Math.random() * Math.PI,
      });
      this.mountainsMesh.setColorAt(i, mtnColors[i % mtnColors.length]);
    }
    this.mountainsMesh.instanceColor!.needsUpdate = true;
    this.scene.add(this.mountainsMesh);

    // 4. Composite Street Lights along both sides of the highway
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.72, roughness: 0.35 });
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfde047,
      emissiveIntensity: 2.8,
    });
    const baseGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.5, 8);
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 7.2, 8);
    const armGeo = new THREE.BoxGeometry(2.3, 0.10, 0.10);
    const headGeo = new THREE.BoxGeometry(0.75, 0.12, 0.32);

    const lightPairs = 12; // 24 lights total spaced every 30m
    for (let i = 0; i < lightPairs; i++) {
      const lz = -330 + i * 30;
      for (const side of [-1, 1]) {
        const g = new THREE.Group();
        g.position.set(side * 8.6, 0, lz);

        const base = new THREE.Mesh(baseGeo, poleMat);
        base.position.y = 0.25;
        g.add(base);

        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 3.6;
        g.add(pole);

        const arm = new THREE.Mesh(armGeo, poleMat);
        arm.position.set(-side * 1.05, 7.1, 0);
        g.add(arm);

        const head = new THREE.Mesh(headGeo, lampMat);
        head.position.set(-side * 2.0, 7.0, 0);
        g.add(head);

        this.scene.add(g);
        this.streetLights.push(g);
      }
    }

    this.syncSceneryMatrices();
  }

  private buildFinishArch(): void {
    const arch = new THREE.Group();
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.5, roughness: 0.3 });
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.35 });
    const bannerMat = new THREE.MeshStandardMaterial({
      map: this.finishTexture,
      emissive: 0xfacc15,
      emissiveMap: this.finishTexture,
      emissiveIntensity: 0.35,
      roughness: 0.4,
    });

    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.75, 8.2, 0.75), pillarMat);
      pillar.position.set(side * 8.5, 4.1, 0);
      arch.add(pillar);
    }

    const topBeam = new THREE.Mesh(new THREE.BoxGeometry(18.0, 0.65, 0.9), trussMat);
    topBeam.position.set(0, 8.1, 0);
    arch.add(topBeam);

    const banner = new THREE.Mesh(new THREE.BoxGeometry(16.2, 2.2, 0.28), bannerMat);
    banner.position.set(0, 6.7, 0);
    arch.add(banner);

    // Checkered road line strip under the arch
    const lineStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_WIDTH, 1.4),
      new THREE.MeshBasicMaterial({ map: this.finishTexture }),
    );
    lineStrip.rotation.x = -Math.PI / 2;
    lineStrip.position.set(0, 0.02, 0);
    arch.add(lineStrip);

    arch.visible = false;
    this.scene.add(arch);
    this.finishArch = arch;
  }

  private syncSceneryMatrices(): void {
    for (let i = 0; i < this.treeProps.length; i++) {
      const p = this.treeProps[i];
      _dummy.position.set(p.x, 0, p.z);
      _dummy.rotation.set(0, p.rotY, 0);
      _dummy.scale.set(p.scaleX, p.scaleY, p.scaleZ);
      _dummy.updateMatrix();
      this.treeTrunks.setMatrixAt(i, _dummy.matrix);
      this.treeCanopiesLow.setMatrixAt(i, _dummy.matrix);
      this.treeCanopiesHigh.setMatrixAt(i, _dummy.matrix);
    }
    this.treeTrunks.instanceMatrix.needsUpdate = true;
    this.treeCanopiesLow.instanceMatrix.needsUpdate = true;
    this.treeCanopiesHigh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.buildingProps.length; i++) {
      const p = this.buildingProps[i];
      _dummy.position.set(p.x, 0, p.z);
      _dummy.rotation.set(0, p.rotY, 0);
      _dummy.scale.set(p.scaleX, p.scaleY, p.scaleZ);
      _dummy.updateMatrix();
      this.buildingsMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.buildingsMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.mountainProps.length; i++) {
      const p = this.mountainProps[i];
      _dummy.position.set(p.x, -0.5, p.z);
      _dummy.rotation.set(0, p.rotY, 0);
      _dummy.scale.set(p.scaleX, p.scaleY, p.scaleZ);
      _dummy.updateMatrix();
      this.mountainsMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.mountainsMesh.instanceMatrix.needsUpdate = true;
  }

  private recycleScenery(dz: number): void {
    const wrapProp = (p: SceneryProp) => {
      p.z += dz;
      if (p.z > 35) p.z -= ROAD_WRAP_Z;
    };
    this.treeProps.forEach(wrapProp);
    this.buildingProps.forEach(wrapProp);
    this.mountainProps.forEach(wrapProp);
    this.syncSceneryMatrices();

    for (const light of this.streetLights) {
      light.position.z += dz;
      if (light.position.z > 30) {
        light.position.z -= 360;
      }
    }
  }

  public setInput(partial: Partial<InputState>): void {
    Object.assign(this.input, partial);
  }

  public startGame(): void {
    this.audio.init();
    this.audio.playStartChime();
    this.resetWorldState();
    this.speedKmh = 35; // Rolling launch so player immediately feels movement
    this.setPhase('playing');
  }

  public restartGame(): void {
    this.audio.init();
    this.audio.playStartChime();
    this.resetWorldState();
    this.speedKmh = 35;
    this.setPhase('playing');
  }

  public returnToMenu(): void {
    this.resetWorldState();
    this.setPhase('menu');
  }

  public togglePause(): void {
    if (this.phase === 'playing') {
      this.setPhase('paused');
    } else if (this.phase === 'paused') {
      this.clock.getDelta();
      this.setPhase('playing');
    }
  }

  private setPhase(phase: GamePhase): void {
    this.phase = phase;
    this.callbacks.onPhaseChange(phase);
    this.pushTelemetry(true);
  }

  private resetWorldState(): void {
    for (const t of this.traffic) {
      this.scene.remove(t.root);
    }
    for (const o of this.obstacles) {
      this.scene.remove(o.root);
    }
    for (const s of this.sparks) {
      this.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      (s.mesh.material as THREE.Material).dispose();
    }
    this.traffic = [];
    this.obstacles = [];
    this.sparks = [];

    this.playerX = LANE_CENTERS[2];
    this.playerVx = 0;
    this.speedKmh = 0;
    this.distanceMeters = 0;
    this.score = 0;
    this.isNewBest = false;
    this.nearMissCount = 0;
    this.crashReason = '';
    this.spawnAccumulator = 30;
    this.crashTimer = 0;
    this.cameraShake = 0;

    this.lambo.root.position.set(this.playerX, 0, 0);
    this.lambo.root.rotation.set(0, 0, 0);
    this.lambo.chassis.rotation.set(0, 0, 0);
    this.lambo.frontSteerLeft.rotation.y = 0;
    this.lambo.frontSteerRight.rotation.y = 0;
    this.finishArch.visible = false;

    this.input = { left: false, right: false, accelerate: false, brake: false };
    this.seedInitialTraffic();
  }

  private seedInitialTraffic(): void {
    // Seed a few vehicles far ahead so the highway immediately looks alive
    const initialZs = [-95, -155, -215];
    for (const zPos of initialZs) {
      this.spawnWaveAt(zPos);
    }
  }

  private spawnWaveAt(zPos: number): void {
    // Do not spawn hazards right on top of the 10 KM finish line
    const remainingMeters = HIGHWAY_LENGTH_METERS - this.distanceMeters;
    if (remainingMeters < Math.abs(zPos) + 40) return;

    const progress = this.distanceMeters / HIGHWAY_LENGTH_METERS;
    // Choose 1 or 2 lanes to occupy (never all 4 so at least 2 lanes remain open!)
    const maxCount = progress > 0.35 ? 2 : 1;
    const count = Math.random() < 0.65 ? maxCount : 1;

    const lanes = [0, 1, 2, 3].sort(() => Math.random() - 0.5).slice(0, count);

    for (const lane of lanes) {
      // Ensure we don't overlap any existing traffic in that lane near zPos
      const blocked = this.traffic.some((t) => t.lane === lane && Math.abs(t.z - zPos) < 22) ||
        this.obstacles.some((o) => o.lane === lane && Math.abs(o.z - zPos) < 22);
      if (blocked) continue;

      const isObstacle = Math.random() < 0.24;
      if (isObstacle) {
        const obsType = Math.random() < 0.55 ? 'cone_cluster' : 'barrier';
        const parts = createObstacleModel(obsType, this.barrierTexture);
        const x = LANE_CENTERS[lane];
        parts.root.position.set(x, 0, zPos);
        this.scene.add(parts.root);
        this.obstacles.push({
          id: this.nextEntityId++,
          root: parts.root,
          lane,
          x,
          z: zPos,
          halfW: parts.width * 0.42,
          halfL: parts.length * 0.45,
          nearMissed: false,
        });
      } else {
        const variants: TrafficVariant[] = ['sedan', 'coupe', 'suv', 'truck'];
        const variant = lane >= 2 && Math.random() < 0.35
          ? 'truck'
          : variants[Math.floor(Math.random() * 3)];
        const parts = createTrafficCarModel(variant, this.shadowTexture);
        const x = LANE_CENTERS[lane];
        parts.root.position.set(x, 0, zPos);
        this.scene.add(parts.root);

        // Speeds: left lanes faster (78-105 km/h), right lanes slower (52-78 km/h)
        const baseKmh = lane <= 1 ? 78 + Math.random() * 27 : 52 + Math.random() * 26;
        this.traffic.push({
          id: this.nextEntityId++,
          root: parts.root,
          wheels: parts.wheels,
          lane,
          x,
          z: zPos,
          speedMs: baseKmh / 3.6,
          halfW: parts.width * 0.44,
          halfL: parts.length * 0.45,
          nearMissed: false,
        });
      }
    }
  }

  private spawnCrashSparks(x: number, z: number): void {
    const sparkGeo = new THREE.BoxGeometry(0.11, 0.11, 0.22);
    for (let i = 0; i < 28; i++) {
      const sparkMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xfacc15 : 0xf97316,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(sparkGeo.clone(), sparkMat);
      mesh.position.set(x + (Math.random() - 0.5) * 1.4, 0.55 + Math.random() * 0.5, z - 1.2);
      this.scene.add(mesh);
      this.sparks.push({
        mesh,
        vx: (Math.random() - 0.5) * 18,
        vy: 3 + Math.random() * 9,
        vz: (Math.random() - 0.5) * 14,
        life: 0.7 + Math.random() * 0.45,
      });
    }
    sparkGeo.dispose();
  }

  private updateSparks(dt: number): void {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.sparks.splice(i, 1);
        continue;
      }
      p.vy -= 22 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.05, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += 12 * dt;
      p.mesh.rotation.y += 9 * dt;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, p.life * 1.6);
    }
  }

  private updatePlaying(dt: number): void {
    // 1. Longitudinal Speed Dynamics (0..200 KM/H)
    const accelRate = this.speedKmh < 100 ? 42 : 25; // Punchy low-end, realistic aero taper
    const brakeRate = 82;
    const coastDrag = 11 + (this.speedKmh / MAX_SPEED_KMH) * 10;

    if (this.input.accelerate && !this.input.brake) {
      this.speedKmh = Math.min(MAX_SPEED_KMH, this.speedKmh + accelRate * dt);
    } else if (this.input.brake) {
      this.speedKmh = Math.max(0, this.speedKmh - brakeRate * dt);
    } else {
      this.speedKmh = Math.max(0, this.speedKmh - coastDrag * dt);
    }

    const speedMs = this.speedKmh / 3.6;

    // 2. Lateral Steering Physics
    const steerInput = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    const speedSteerScale = THREE.MathUtils.clamp(0.45 + (this.speedKmh / MAX_SPEED_KMH) * 0.75, 0.45, 1.15);
    const maxLateralSpeed = 10.5 * speedSteerScale;
    const targetVx = steerInput * maxLateralSpeed;
    this.playerVx = THREE.MathUtils.damp(this.playerVx, targetVx, 11.5, dt);

    this.playerX += this.playerVx * dt;
    const roadHalfLimit = 6.15;
    if (this.playerX < -roadHalfLimit) {
      this.playerX = -roadHalfLimit;
      this.playerVx = Math.max(0, this.playerVx);
    } else if (this.playerX > roadHalfLimit) {
      this.playerX = roadHalfLimit;
      this.playerVx = Math.min(0, this.playerVx);
    }

    // 3. Lamborghini Visual Kinematics (wheels, steering, body roll & pitch, brake lights, exhaust)
    this.lambo.root.position.x = this.playerX;
    const steerFactor = this.playerVx / 10.5;
    this.lambo.root.rotation.y = THREE.MathUtils.damp(this.lambo.root.rotation.y, -steerFactor * 0.14, 12, dt);
    this.lambo.chassis.rotation.z = THREE.MathUtils.damp(this.lambo.chassis.rotation.z, -steerFactor * 0.055, 10, dt);

    const targetPitch = this.input.brake && this.speedKmh > 5
      ? -0.032
      : this.input.accelerate && this.speedKmh < MAX_SPEED_KMH - 4
        ? 0.022
        : 0;
    this.lambo.chassis.rotation.x = THREE.MathUtils.damp(this.lambo.chassis.rotation.x, targetPitch, 9, dt);

    // Front wheel steering angle
    const wheelSteerAngle = -steerInput * 0.34;
    this.lambo.frontSteerLeft.rotation.y = THREE.MathUtils.damp(
      this.lambo.frontSteerLeft.rotation.y,
      wheelSteerAngle,
      14,
      dt,
    );
    this.lambo.frontSteerRight.rotation.y = THREE.MathUtils.damp(
      this.lambo.frontSteerRight.rotation.y,
      wheelSteerAngle,
      14,
      dt,
    );

    // Wheel spin rotation proportional to forward speed
    const wheelDeltaRot = (speedMs * dt) / 0.34;
    for (const w of this.lambo.wheelSpins) {
      w.rotation.x -= wheelDeltaRot;
    }

    // Brake lights & high-speed exhaust glow
    this.lambo.brakeLightMat.emissiveIntensity = this.input.brake ? 5.2 : 1.8;
    const flameOpacity = this.input.accelerate && this.speedKmh > 130 ? 0.55 + Math.random() * 0.25 : 0;
    for (const fm of this.lambo.exhaustFlameMats) {
      fm.opacity = flameOpacity;
    }

    // 4. Advance Distance, Score & Road Scroll
    const dz = speedMs * dt;
    this.distanceMeters += dz;
    this.roadTexture.offset.y += dz / 30;
    this.recycleScenery(dz);

    // Score ticks up dynamically with distance & high-speed multiplier
    if (dz > 0) {
      const speedBonus = 1 + (this.speedKmh / MAX_SPEED_KMH) * 1.5;
      this.score += dz * 2.2 * speedBonus;
      if (this.score > this.bestScore) {
        this.bestScore = Math.floor(this.score);
        this.isNewBest = true;
      }
    }

    // 5. Spawn & Update Traffic + Obstacles
    this.spawnAccumulator += dz;
    const spawnInterval = THREE.MathUtils.lerp(56, 38, this.distanceMeters / HIGHWAY_LENGTH_METERS);
    if (this.spawnAccumulator >= spawnInterval) {
      this.spawnAccumulator = 0;
      this.spawnWaveAt(SPAWN_AHEAD_Z);
    }

    const playerHalfW = 0.86;
    const playerHalfL = 2.04;

    // Update Traffic Vehicles
    for (let i = this.traffic.length - 1; i >= 0; i--) {
      const t = this.traffic[i];
      // Relative motion along Z: player moves forward at speedMs, traffic moves forward at t.speedMs
      const relDz = (speedMs - t.speedMs) * dt;
      t.z += relDz;
      t.root.position.z = t.z;

      // Spin traffic wheels
      const tWheelRot = (t.speedMs * dt) / 0.35;
      for (const w of t.wheels) {
        w.rotation.x -= tWheelRot;
      }

      if (t.z > DESPAWN_BEHIND_Z) {
        this.scene.remove(t.root);
        this.traffic.splice(i, 1);
        continue;
      }

      // Collision check
      const dx = Math.abs(this.playerX - t.x);
      const dzCol = Math.abs(t.z);
      if (dx < playerHalfW + t.halfW && dzCol < playerHalfL + t.halfL) {
        this.triggerCrash('Collided with highway traffic');
        return;
      }

      // Near-miss bonus check
      if (!t.nearMissed && t.z > 1.8 && t.z < 5.5 && dx < playerHalfW + t.halfW + 1.15 && this.speedKmh > 75) {
        t.nearMissed = true;
        this.nearMissCount += 1;
        this.score += 150;
        if (this.score > this.bestScore) {
          this.bestScore = Math.floor(this.score);
          this.isNewBest = true;
        }
        this.audio.playNearMiss();
      }
    }

    // Update Stationary Obstacles
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      o.z += dz;
      o.root.position.z = o.z;

      if (o.z > DESPAWN_BEHIND_Z) {
        this.scene.remove(o.root);
        this.obstacles.splice(i, 1);
        continue;
      }

      const dx = Math.abs(this.playerX - o.x);
      const dzCol = Math.abs(o.z);
      if (dx < playerHalfW + o.halfW && dzCol < playerHalfL + o.halfL) {
        this.triggerCrash('Hit road construction hazard');
        return;
      }

      if (!o.nearMissed && o.z > 1.6 && o.z < 5.0 && dx < playerHalfW + o.halfW + 1.1 && this.speedKmh > 75) {
        o.nearMissed = true;
        this.nearMissCount += 1;
        this.score += 150;
        if (this.score > this.bestScore) {
          this.bestScore = Math.floor(this.score);
          this.isNewBest = true;
        }
        this.audio.playNearMiss();
      }
    }

    // 6. 10-Kilometer Finish Arch & Victory
    const remaining = HIGHWAY_LENGTH_METERS - this.distanceMeters;
    if (remaining <= 280) {
      this.finishArch.visible = true;
      this.finishArch.position.z = -remaining;
    }

    if (this.distanceMeters >= HIGHWAY_LENGTH_METERS) {
      this.distanceMeters = HIGHWAY_LENGTH_METERS;
      this.score += 5000;
      if (this.score > this.bestScore) {
        this.bestScore = Math.floor(this.score);
        this.isNewBest = true;
      }
      this.saveBestScore(this.bestScore);
      this.audio.playVictory();
      this.setPhase('victory');
      return;
    }

    // 7. Chase Camera Choreography (smooth lag + FOV widening at high speed)
    const speedRatio = this.speedKmh / MAX_SPEED_KMH;
    const targetFov = 58 + speedRatio * 15;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, dt);
    this.camera.updateProjectionMatrix();

    _vec3.set(
      this.playerX * 0.72,
      2.65 + speedRatio * 0.35,
      6.65 + speedRatio * 0.65,
    );
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _vec3.x, 8, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _vec3.y, 8, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _vec3.z, 8, dt);

    _camTarget.set(this.playerX * 0.85, 1.0, -14);
    this.camera.lookAt(_camTarget);
    this.camera.rotation.z = THREE.MathUtils.damp(this.camera.rotation.z, -steerFactor * 0.035, 8, dt);

    // 8. Audio update
    const { rpmRatio } = computeGearAndRpm(this.speedKmh);
    this.audio.update(
      this.speedKmh,
      rpmRatio,
      this.input.accelerate && !this.input.brake,
      this.input.brake,
      true,
    );
  }

  private triggerCrash(reason: string): void {
    this.crashReason = reason;
    this.cameraShake = 0.55;
    this.crashTimer = 0.01;
    this.speedKmh = 0;
    this.spawnCrashSparks(this.playerX, 0);
    this.audio.update(0, 0, false, false, false);
    this.audio.playCrash();

    const finalScore = Math.floor(this.score);
    if (finalScore >= this.bestScore) {
      this.bestScore = finalScore;
      this.saveBestScore(this.bestScore);
    }

    this.lambo.chassis.rotation.z = (Math.random() > 0.5 ? 1 : -1) * 0.14;
    this.lambo.root.rotation.y = (Math.random() > 0.5 ? 1 : -1) * 0.25;
    this.setPhase('gameover');
  }

  private updateMenuShowcase(dt: number): void {
    this.menuOrbitTime += dt;
    // Gentle rolling showcase speed so the highway scenery glides smoothly in the background
    const showcaseSpeedMs = 14;
    const dz = showcaseSpeedMs * dt;
    this.roadTexture.offset.y += dz / 30;
    this.recycleScenery(dz);

    for (const w of this.lambo.wheelSpins) {
      w.rotation.x -= dz / 0.34;
    }

    const angle = Math.sin(this.menuOrbitTime * 0.32) * 0.45;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 54, 5, dt);
    this.camera.updateProjectionMatrix();
    this.camera.position.set(
      this.playerX + Math.sin(angle) * 5.8,
      2.15 + Math.cos(this.menuOrbitTime * 0.4) * 0.22,
      Math.cos(angle) * 5.8 + 0.5,
    );
    _camTarget.set(this.playerX, 0.72, -1.5);
    this.camera.lookAt(_camTarget);
    this.audio.update(0, 0, false, false, false);
  }

  private pushTelemetry(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastHudPush < 50) return;
    this.lastHudPush = now;

    const { gear, rpmRatio } = computeGearAndRpm(this.speedKmh);
    this.callbacks.onTelemetry({
      score: Math.floor(this.score),
      bestScore: Math.floor(this.bestScore),
      speedKmh: Math.round(this.speedKmh),
      distanceMeters: Math.min(HIGHWAY_LENGTH_METERS, this.distanceMeters),
      totalMeters: HIGHWAY_LENGTH_METERS,
      gear,
      rpmRatio,
      nearMissCount: this.nearMissCount,
      crashReason: this.crashReason,
      isNewBest: this.isNewBest,
    });
  }

  private startLoop(): void {
    const afterDraw = (cb: () => void) => {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        if (this.destroyed) return;
        const state = sync && gl.getSyncParameter ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync && gl.deleteSync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (this.destroyed) return;
      const rawDt = this.clock.getDelta();
      const dt = Math.min(rawDt, 0.05);

      if (this.phase === 'menu') {
        this.updateMenuShowcase(dt);
      } else if (this.phase === 'playing') {
        this.updatePlaying(dt);
      } else if (this.phase === 'gameover') {
        this.updateSparks(dt);
        if (this.cameraShake > 0) {
          this.cameraShake = Math.max(0, this.cameraShake - dt * 1.4);
          this.camera.position.x += (Math.random() - 0.5) * this.cameraShake;
          this.camera.position.y += (Math.random() - 0.5) * this.cameraShake;
        }
        this.audio.update(0, 0, false, false, false);
      } else if (this.phase === 'paused' || this.phase === 'victory') {
        this.audio.update(0, 0, false, false, false);
      }

      // Keep shadow light centered on player
      this.sunLight.position.set(this.playerX + 22, 34, 18);
      this.sunLight.target.position.set(this.playerX, 0, -6);
      this.sunLight.target.updateMatrixWorld();

      this.renderer.render(this.scene, this.camera);
      this.pushTelemetry(false);

      if (this.isSoftwareGl) {
        afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    this.frameId = requestAnimationFrame(tick);
  }

  private handleResize(): void {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  }

  public dispose(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.boundResize);

    if (this.renderer) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this.boundContextLost);
      this.renderer.domElement.removeEventListener('webglcontextrestored', this.boundContextRestored);
    }

    this.audio.dispose();

    this.scene?.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });

    this.roadTexture?.dispose();
    this.buildingTexture?.dispose();
    this.barrierTexture?.dispose();
    this.finishTexture?.dispose();
    this.shadowTexture?.dispose();
    this.envRT?.dispose();
    this.renderer?.dispose();

    if (this.renderer?.domElement?.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
