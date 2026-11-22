import * as THREE from 'three';

export interface LamborghiniParts {
  root: THREE.Group;
  chassis: THREE.Group;
  wheelSpins: THREE.Group[];
  frontSteerLeft: THREE.Group;
  frontSteerRight: THREE.Group;
  brakeLightMat: THREE.MeshStandardMaterial;
  exhaustFlameMats: THREE.MeshBasicMaterial[];
}

export type TrafficVariant = 'sedan' | 'suv' | 'coupe' | 'truck';

export interface TrafficVehicleParts {
  root: THREE.Group;
  wheels: THREE.Group[];
  width: number;
  length: number;
  height: number;
}

export interface ObstacleParts {
  root: THREE.Group;
  width: number;
  length: number;
}

function createWheelAssembly(
  radius: number,
  width: number,
  isLeft: boolean,
  caliperColor: number,
  sharedTireMat: THREE.Material,
  sharedRimMat: THREE.Material,
  sharedDiscMat: THREE.Material,
  sharedHubMat: THREE.Material,
): { steerGroup: THREE.Group; spinGroup: THREE.Group } {
  const steerGroup = new THREE.Group();
  const spinGroup = new THREE.Group();
  steerGroup.add(spinGroup);

  // Lathe tire profile for realistic rounded shoulder + sidewall
  const halfW = width * 0.5;
  const innerR = radius * 0.64;
  const tirePoints = [
    new THREE.Vector2(innerR, -halfW * 0.88),
    new THREE.Vector2(radius * 0.94, -halfW),
    new THREE.Vector2(radius, -halfW * 0.78),
    new THREE.Vector2(radius, halfW * 0.78),
    new THREE.Vector2(radius * 0.94, halfW),
    new THREE.Vector2(innerR, halfW * 0.88),
  ];
  const tireGeo = new THREE.LatheGeometry(tirePoints, 24);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMesh = new THREE.Mesh(tireGeo, sharedTireMat);
  tireMesh.castShadow = true;
  spinGroup.add(tireMesh);

  // Alloy barrel
  const barrelGeo = new THREE.CylinderGeometry(innerR * 1.02, innerR * 1.02, width * 0.82, 20, 1, true);
  barrelGeo.rotateZ(Math.PI / 2);
  const barrelMesh = new THREE.Mesh(barrelGeo, sharedRimMat);
  spinGroup.add(barrelMesh);

  // Outer rim lip
  const lipGeo = new THREE.TorusGeometry(innerR * 0.98, 0.022, 8, 24);
  lipGeo.rotateY(Math.PI / 2);
  const lipMesh = new THREE.Mesh(lipGeo, sharedRimMat);
  lipMesh.position.x = isLeft ? -halfW * 0.84 : halfW * 0.84;
  spinGroup.add(lipMesh);

  // 5 Y-spoke (10 outer spokes) forged alloy face
  const spokeOffsetX = isLeft ? -halfW * 0.72 : halfW * 0.72;
  const spokeGeo = new THREE.BoxGeometry(0.028, innerR * 0.96, 0.032);
  for (let i = 0; i < 5; i++) {
    const baseAngle = (i / 5) * Math.PI * 2;
    for (const split of [-0.18, 0.18]) {
      const spoke = new THREE.Mesh(spokeGeo, sharedRimMat);
      const a = baseAngle + split;
      const midR = innerR * 0.5;
      spoke.position.set(spokeOffsetX, Math.cos(a) * midR, Math.sin(a) * midR);
      spoke.rotation.x = -a;
      spinGroup.add(spoke);
    }
  }

  // Centerlock hub cap
  const hubGeo = new THREE.CylinderGeometry(0.068, 0.075, 0.05, 16);
  hubGeo.rotateZ(Math.PI / 2);
  const hubMesh = new THREE.Mesh(hubGeo, sharedHubMat);
  hubMesh.position.x = isLeft ? -halfW * 0.82 : halfW * 0.82;
  spinGroup.add(hubMesh);

  // Brake disc rotor (inside wheel, spins with wheel)
  const discGeo = new THREE.CylinderGeometry(innerR * 0.78, innerR * 0.78, 0.025, 18);
  discGeo.rotateZ(Math.PI / 2);
  const discMesh = new THREE.Mesh(discGeo, sharedDiscMat);
  discMesh.position.x = isLeft ? -halfW * 0.28 : halfW * 0.28;
  spinGroup.add(discMesh);

  // Stationary brake caliper mounted on steerGroup
  const caliperMat = new THREE.MeshStandardMaterial({
    color: caliperColor,
    roughness: 0.3,
    metalness: 0.4,
  });
  const caliperGeo = new THREE.BoxGeometry(0.065, 0.14, 0.09);
  const caliperMesh = new THREE.Mesh(caliperGeo, caliperMat);
  caliperMesh.position.set(isLeft ? -halfW * 0.28 : halfW * 0.28, 0.05, innerR * 0.58);
  steerGroup.add(caliperMesh);

  return { steerGroup, spinGroup };
}

export function createLamborghiniModel(shadowTexture: THREE.Texture): LamborghiniParts {
  const root = new THREE.Group();
  const chassis = new THREE.Group();
  root.add(chassis);

  // Materials — Giallo Orion Lamborghini Yellow with high clearcoat
  const yellowPaintMat = new THREE.MeshPhysicalMaterial({
    color: 0xffc800,
    metalness: 0.32,
    roughness: 0.22,
    clearcoat: 1.0,
    clearcoatRoughness: 0.07,
    envMapIntensity: 1.45,
  });

  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x15181e,
    roughness: 0.38,
    metalness: 0.45,
  });

  const matteBlackMat = new THREE.MeshStandardMaterial({
    color: 0x0d0f13,
    roughness: 0.78,
    metalness: 0.15,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0d1520,
    metalness: 0.15,
    roughness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.8,
  });

  const headlightLedMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xdbeafe,
    emissiveIntensity: 3.2,
    roughness: 0.1,
  });

  const brakeLightMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xff1a1a,
    emissiveIntensity: 1.8,
    roughness: 0.15,
  });

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xd4d8e0,
    metalness: 0.92,
    roughness: 0.14,
  });

  // 1. Primary sculpted wedge hull (extruded side profile along X, centered at X=0)
  // Facing -Z: z = -2.28 is front nose tip, z = +2.22 is rear tail
  const profile = new THREE.Shape();
  profile.moveTo(-2.28, 0.22); // Front splitter tip
  profile.lineTo(-2.15, 0.38); // Sharp nose lip
  profile.lineTo(-1.18, 0.62); // Sloped front hood
  profile.lineTo(-0.35, 1.08); // Steep raked windshield to roof peak
  profile.lineTo(0.48, 1.10);  // Low roofline
  profile.lineTo(1.85, 0.86);  // Fastback engine deck slope
  profile.lineTo(2.20, 0.76);  // Rear tail deck
  profile.lineTo(2.22, 0.34);  // Rear fascia
  profile.lineTo(1.92, 0.20);  // Rear diffuser exit
  profile.lineTo(-2.28, 0.22);

  const hullGeo = new THREE.ExtrudeGeometry(profile, {
    steps: 1,
    depth: 1.72,
    bevelEnabled: true,
    bevelThickness: 0.09,
    bevelSize: 0.05,
    bevelSegments: 3,
  });
  // ExtrudeGeometry extrudes along +Z; rotateY(Math.PI/2) puts shape's +X along -Z!
  // Let's carefully map: we want shape's x (-2.28..2.22) to align with Z (-2.28..2.22).
  // After rotateY(-Math.PI/2): original X -> +Z, original Y -> +Y, original Z -> -X.
  hullGeo.translate(0, 0, -0.86);
  hullGeo.rotateY(-Math.PI / 2);
  hullGeo.computeVertexNormals();

  const mainHull = new THREE.Mesh(hullGeo, yellowPaintMat);
  mainHull.castShadow = true;
  mainHull.receiveShadow = true;
  chassis.add(mainHull);

  // 2. Sculpted wide rear haunches / fender flares
  const fenderGeo = new THREE.BoxGeometry(0.30, 0.42, 1.68);
  for (const side of [-1, 1]) {
    const rearFender = new THREE.Mesh(fenderGeo, yellowPaintMat);
    rearFender.position.set(side * 0.90, 0.56, 1.15);
    rearFender.castShadow = true;
    chassis.add(rearFender);

    // Front muscular wheel-arch shoulder
    const frontFender = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.30, 1.15), yellowPaintMat);
    frontFender.position.set(side * 0.88, 0.48, -1.32);
    frontFender.rotation.x = 0.08;
    frontFender.castShadow = true;
    chassis.add(frontFender);

    // Aggressive side intake scoop (black/carbon hex intake)
    const intakeScoop = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.36, 0.72), carbonMat);
    intakeScoop.position.set(side * 0.96, 0.54, 0.55);
    chassis.add(intakeScoop);

    // Side skirt blade
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 2.05), carbonMat);
    skirt.position.set(side * 0.97, 0.19, 0.02);
    chassis.add(skirt);

    // Aerodynamic wing mirror
    const mirrorArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.06), carbonMat);
    mirrorArm.position.set(side * 0.95, 0.76, -0.52);
    chassis.add(mirrorArm);

    const mirrorCap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.075, 0.12), yellowPaintMat);
    mirrorCap.position.set(side * 1.03, 0.79, -0.49);
    mirrorCap.rotation.y = side * -0.22;
    chassis.add(mirrorCap);
  }

  // 3. Tinted Angular Canopy (Windshield + Side Windows + Roof Contrast)
  const windshieldGeo = new THREE.BoxGeometry(1.44, 0.05, 1.05);
  const windshield = new THREE.Mesh(windshieldGeo, glassMat);
  windshield.position.set(0, 0.86, -0.75);
  windshield.rotation.x = 0.48;
  chassis.add(windshield);

  const roofCap = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.06, 0.86), carbonMat);
  roofCap.position.set(0, 1.12, 0.06);
  chassis.add(roofCap);

  for (const side of [-1, 1]) {
    const sideWin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.24, 1.02), glassMat);
    sideWin.position.set(side * 0.76, 0.92, -0.05);
    sideWin.rotation.z = side * -0.42;
    chassis.add(sideWin);
  }

  // 4. Rear V12 Louvered Engine Bay Cover
  for (let i = 0; i < 4; i++) {
    const louver = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.04, 0.16), matteBlackMat);
    louver.position.set(0, 0.99 - i * 0.045, 0.82 + i * 0.26);
    louver.rotation.x = 0.16;
    chassis.add(louver);
  }

  // 5. Front Carbon Fiber Splitter & Grille Intake
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.05, 0.42), carbonMat);
  splitter.position.set(0, 0.16, -2.18);
  chassis.add(splitter);

  const frontGrille = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.18, 0.12), matteBlackMat);
  frontGrille.position.set(0, 0.27, -2.23);
  chassis.add(frontGrille);

  // 6. Signature Y-shaped Lamborghini LED Headlights + Asphalt Light Projection
  for (const side of [-1, 1]) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.11, 0.22), matteBlackMat);
    housing.position.set(side * 0.68, 0.45, -2.12);
    housing.rotation.y = side * 0.22;
    housing.rotation.x = 0.18;
    chassis.add(housing);

    const drlMain = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.032, 0.18), headlightLedMat);
    drlMain.position.set(side * 0.68, 0.46, -2.14);
    drlMain.rotation.y = side * 0.22;
    drlMain.rotation.x = 0.18;
    chassis.add(drlMain);

    const drlBranch = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.028, 0.06), headlightLedMat);
    drlBranch.position.set(side * 0.58, 0.48, -2.16);
    drlBranch.rotation.z = side * 0.55;
    chassis.add(drlBranch);

    // Subtle ground headlight beam cone on asphalt
    const beamGeo = new THREE.PlaneGeometry(1.35, 9.5);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.11,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(side * 0.65, 0.025, -7.0);
    root.add(beam);
  }

  // 7. Rear Carbon Diffuser, Quad Exhausts, Taillights & GT Rear Wing
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.22, 0.22), carbonMat);
  diffuser.position.set(0, 0.25, 2.22);
  chassis.add(diffuser);

  // Diffuser vertical fins
  for (const fx of [-0.55, -0.22, 0.22, 0.55]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.20, 0.26), carbonMat);
    fin.position.set(fx, 0.24, 2.25);
    chassis.add(fin);
  }

  // Quad central exhaust pipes + subtle afterburner glow when boosting at high speed
  const exhaustFlameMats: THREE.MeshBasicMaterial[] = [];
  const pipeGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.18, 12);
  pipeGeo.rotateX(Math.PI / 2);
  for (const ex of [-0.24, -0.10, 0.10, 0.24]) {
    const pipe = new THREE.Mesh(pipeGeo, chromeMat);
    pipe.position.set(ex, 0.30, 2.28);
    chassis.add(pipe);

    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
    });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.22, 10), flameMat);
    flame.rotation.x = Math.PI / 2;
    flame.position.set(ex, 0.30, 2.42);
    chassis.add(flame);
    exhaustFlameMats.push(flameMat);
  }

  // Rear grille & Y-LED Taillights
  const rearGrille = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.22, 0.08), matteBlackMat);
  rearGrille.position.set(0, 0.60, 2.23);
  chassis.add(rearGrille);

  for (const side of [-1, 1]) {
    const tailBar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.055, 0.06), brakeLightMat);
    tailBar.position.set(side * 0.64, 0.68, 2.26);
    chassis.add(tailBar);

    const tailChevron = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.06), brakeLightMat);
    tailChevron.position.set(side * 0.48, 0.63, 2.26);
    tailChevron.rotation.z = side * 0.6;
    chassis.add(tailChevron);
  }

  // Swan-neck Carbon GT Rear Spoiler Wing
  const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.045, 0.32), carbonMat);
  wingBlade.position.set(0, 1.07, 2.08);
  wingBlade.rotation.x = 0.09;
  wingBlade.castShadow = true;
  chassis.add(wingBlade);

  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.16), carbonMat);
    strut.position.set(side * 0.48, 0.93, 2.05);
    strut.rotation.x = 0.18;
    chassis.add(strut);

    const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.38), yellowPaintMat);
    endplate.position.set(side * 0.97, 1.06, 2.08);
    chassis.add(endplate);
  }

  // 8. 4 Realistic Wheels (Front: radius 0.33, Rear: radius 0.355 slightly staggered)
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.85, metalness: 0.05 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x262932, roughness: 0.24, metalness: 0.88 });
  const discMat = new THREE.MeshStandardMaterial({ color: 0x8b93a1, roughness: 0.32, metalness: 0.85 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.25, metalness: 0.6 });

  const fl = createWheelAssembly(0.33, 0.27, true, 0xfacc15, tireMat, rimMat, discMat, hubMat);
  fl.steerGroup.position.set(-0.92, 0.33, -1.36);
  root.add(fl.steerGroup);

  const fr = createWheelAssembly(0.33, 0.27, false, 0xfacc15, tireMat, rimMat, discMat, hubMat);
  fr.steerGroup.position.set(0.92, 0.33, -1.36);
  root.add(fr.steerGroup);

  const rl = createWheelAssembly(0.355, 0.32, true, 0xfacc15, tireMat, rimMat, discMat, hubMat);
  rl.steerGroup.position.set(-0.95, 0.355, 1.32);
  root.add(rl.steerGroup);

  const rr = createWheelAssembly(0.355, 0.32, false, 0xfacc15, tireMat, rimMat, discMat, hubMat);
  rr.steerGroup.position.set(0.95, 0.355, 1.32);
  root.add(rr.steerGroup);

  // 9. Grounded Contact Shadow
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.65, 5.2),
    new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    }),
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.set(0, 0.018, 0);
  root.add(shadowPlane);

  return {
    root,
    chassis,
    wheelSpins: [fl.spinGroup, fr.spinGroup, rl.spinGroup, rr.spinGroup],
    frontSteerLeft: fl.steerGroup,
    frontSteerRight: fr.steerGroup,
    brakeLightMat,
    exhaustFlameMats,
  };
}

const TRAFFIC_COLORS = [
  0x2563eb, // Cobalt Blue
  0xdc2626, // Crimson Red
  0xe2e8f0, // Pearl Silver
  0x0f766e, // Deep Teal
  0x475569, // Slate Metallic
  0xf97316, // Tangerine Orange
  0x1e293b, // Midnight Navy
];

export function createTrafficCarModel(
  variant: TrafficVariant,
  shadowTexture: THREE.Texture,
): TrafficVehicleParts {
  const root = new THREE.Group();
  const wheels: THREE.Group[] = [];

  const paintColor = TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)];
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: paintColor,
    metalness: 0.4,
    roughness: 0.28,
    clearcoat: 0.8,
    clearcoatRoughness: 0.12,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.1,
    metalness: 0.5,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.75 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.88 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xa1a1aa, roughness: 0.28, metalness: 0.85 });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff2222,
    emissive: 0xef4444,
    emissiveIntensity: 1.6,
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfef3c7,
    emissiveIntensity: 1.8,
  });

  let width = 1.9;
  let length = 4.4;
  let height = 1.45;
  let wheelR = 0.33;

  if (variant === 'sedan') {
    width = 1.88;
    length = 4.45;
    height = 1.42;
    const lower = new THREE.Mesh(new THREE.BoxGeometry(width, 0.56, length), bodyMat);
    lower.position.y = 0.54;
    lower.castShadow = true;
    root.add(lower);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(width * 0.84, 0.52, length * 0.48), bodyMat);
    cabin.position.set(0, 1.05, 0.15);
    cabin.castShadow = true;
    root.add(cabin);

    const glass = new THREE.Mesh(new THREE.BoxGeometry(width * 0.86, 0.36, length * 0.50), glassMat);
    glass.position.set(0, 1.03, 0.15);
    root.add(glass);
  } else if (variant === 'coupe') {
    width = 1.94;
    length = 4.35;
    height = 1.28;
    const lower = new THREE.Mesh(new THREE.BoxGeometry(width, 0.48, length), bodyMat);
    lower.position.y = 0.48;
    lower.castShadow = true;
    root.add(lower);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(width * 0.80, 0.40, length * 0.42), glassMat);
    cabin.position.set(0, 0.90, 0.12);
    cabin.castShadow = true;
    root.add(cabin);

    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(width * 0.88, 0.05, 0.22), trimMat);
    spoiler.position.set(0, 0.82, length * 0.45);
    root.add(spoiler);
  } else if (variant === 'suv') {
    width = 2.04;
    length = 4.75;
    height = 1.78;
    wheelR = 0.38;
    const lower = new THREE.Mesh(new THREE.BoxGeometry(width, 0.68, length), bodyMat);
    lower.position.y = 0.68;
    lower.castShadow = true;
    root.add(lower);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(width * 0.90, 0.64, length * 0.66), bodyMat);
    cabin.position.set(0, 1.32, 0.36);
    cabin.castShadow = true;
    root.add(cabin);

    const glass = new THREE.Mesh(new THREE.BoxGeometry(width * 0.92, 0.44, length * 0.67), glassMat);
    glass.position.set(0, 1.30, 0.36);
    root.add(glass);
  } else {
    // Box Truck
    width = 2.28;
    length = 6.2;
    height = 2.75;
    wheelR = 0.44;
    const cargoMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.65, metalness: 0.08 });
    const cab = new THREE.Mesh(new THREE.BoxGeometry(width * 0.92, 1.55, 1.65), bodyMat);
    cab.position.set(0, 1.18, -length * 0.34);
    cab.castShadow = true;
    root.add(cab);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(width * 0.86, 0.68, 0.12), glassMat);
    windshield.position.set(0, 1.50, -length * 0.34 - 0.80);
    root.add(windshield);

    const cargoBox = new THREE.Mesh(new THREE.BoxGeometry(width, 2.05, length * 0.66), cargoMat);
    cargoBox.position.set(0, 1.62, length * 0.15);
    cargoBox.castShadow = true;
    root.add(cargoBox);
  }

  // Bumpers, Headlights (-Z), Taillights (+Z)
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(width * 0.96, 0.18, 0.12), trimMat);
  rearBumper.position.set(0, 0.34, length * 0.5);
  root.add(rearBumper);

  for (const side of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.11, 0.08), tailMat);
    tail.position.set(side * (width * 0.36), 0.66, length * 0.502);
    root.add(tail);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.10, 0.08), headMat);
    head.position.set(side * (width * 0.36), 0.58, -length * 0.502);
    root.add(head);
  }

  // 4 Wheels
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.24, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(wheelR * 0.58, wheelR * 0.58, 0.26, 12);
  rimGeo.rotateZ(Math.PI / 2);

  const zOffsets = [-length * 0.31, length * 0.31];
  const xOffset = width * 0.46;

  for (const wz of zOffsets) {
    for (const side of [-1, 1]) {
      const wg = new THREE.Group();
      wg.position.set(side * xOffset, wheelR, wz);
      wg.add(new THREE.Mesh(wheelGeo, tireMat));
      wg.add(new THREE.Mesh(rimGeo, rimMat));
      root.add(wg);
      wheels.push(wg);
    }
  }

  // Contact shadow
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 1.25, length * 1.12),
    new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    }),
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.015;
  root.add(shadowPlane);

  return { root, wheels, width, length, height };
}

export function createObstacleModel(
  type: 'cone_cluster' | 'barrier',
  barrierTexture: THREE.Texture,
): ObstacleParts {
  const root = new THREE.Group();

  if (type === 'cone_cluster') {
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.42 });
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.35,
      roughness: 0.3,
    });
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85 });

    const offsets = [-0.75, 0, 0.75];
    for (const ox of offsets) {
      const coneGroup = new THREE.Group();
      coneGroup.position.set(ox, 0, (Math.random() - 0.5) * 0.3);

      const base = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.46), baseMat);
      base.position.y = 0.03;
      coneGroup.add(base);

      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.74, 14), coneMat);
      cone.position.y = 0.42;
      cone.castShadow = true;
      coneGroup.add(cone);

      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.14, 0.16, 14), stripeMat);
      stripe.position.y = 0.48;
      coneGroup.add(stripe);

      root.add(coneGroup);
    }
    return { root, width: 2.0, length: 0.8 };
  }

  // Striped Construction Barrier
  const barrierMat = new THREE.MeshStandardMaterial({
    map: barrierTexture,
    roughness: 0.45,
  });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.8 });
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 2.5,
  });

  const board = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.62, 0.22), barrierMat);
  board.position.y = 0.68;
  board.castShadow = true;
  root.add(board);

  for (const lx of [-0.95, 0.95]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.85, 0.55), legMat);
    leg.position.set(lx, 0.425, 0);
    root.add(leg);

    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.14, 12), beaconMat);
    beacon.position.set(lx, 1.06, 0);
    root.add(beacon);
  }

  return { root, width: 2.35, length: 0.65 };
}
