import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { AUDIENCE_CUSHIONS, AUDIENCE_SOFA_OBSTACLES } from "../../../shared/audience";

/** Original low-poly furniture, with no textures or remotely loaded assets. */
export function createRoomFurniture(lowQuality = false): {
  group: THREE.Group;
  seatTargets: THREE.Object3D[];
  dispose: () => void;
} {
  const group = new THREE.Group();
  group.name = "Cozy watch room";
  const seatTargets: THREE.Object3D[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const geometryCache = new Map<string, THREE.BufferGeometry>();
  const material = (color: number, glow = false) => {
    const result = new THREE.MeshLambertMaterial({
      color,
      emissive: glow ? color : 0x000000,
      emissiveIntensity: glow ? 0.38 : 0,
    });
    materials.add(result);
    return result;
  };
  const palette = {
    floor: material(0x514349),
    wood: material(0xa77558),
    woodDark: material(0x725343),
    rug: material(0xcab4a0),
    rugBorder: material(0xa88780),
    rugPattern: material(0xdfcbb5),
    rose: material(0xc18f9b),
    roseLight: material(0xd5a5ad),
    moss: material(0x899d8b),
    mossLight: material(0xa9b9a1),
    cream: material(0xf0ddbc),
    ochre: material(0xcda773),
    clay: material(0xc38970),
    leaf: material(0x6c9078),
    leafLight: material(0x96ad84),
    coffee: material(0x604435),
    lamp: material(0xffdb9b, true),
  };
  const cached = (key: string, create: () => THREE.BufferGeometry) => {
    let geometry = geometryCache.get(key);
    if (!geometry) {
      geometry = create();
      geometryCache.set(key, geometry);
      geometries.add(geometry);
    }
    return geometry;
  };
  const sphere = cached(
    "sphere",
    () => new THREE.SphereGeometry(1, lowQuality ? 8 : 12, lowQuality ? 6 : 8),
  );
  const cylinder = cached(
    "cylinder",
    () => new THREE.CylinderGeometry(1, 1, 1, lowQuality ? 10 : 16),
  );
  const box = (w: number, h: number, d: number, radius = 0.1) =>
    cached(
      `box:${w}:${h}:${d}:${radius}`,
      () =>
        new RoundedBoxGeometry(
          w,
          h,
          d,
          lowQuality ? 1 : 2,
          Math.min(radius, w / 2, h / 2, d / 2),
        ),
    );
  const mesh = (
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
  ) => {
    const result = new THREE.Mesh(geometry, mat);
    result.position.set(x, y, z);
    result.castShadow = true;
    result.receiveShadow = true;
    parent.add(result);
    return result;
  };
  const rounded = (
    parent: THREE.Object3D,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    radius = 0.1,
  ) => mesh(parent, box(w, h, d, radius), mat, x, y, z);
  const oval = (
    parent: THREE.Object3D,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ) => {
    const result = mesh(parent, sphere, mat, x, y, z);
    result.scale.set(w, h, d);
    return result;
  };
  const disc = (
    parent: THREE.Object3D,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
  ) => {
    const result = mesh(parent, cylinder, mat, x, y, z);
    result.scale.set(radius, height, radius);
    return result;
  };

  // Ground layers must paint before objects in SVGRenderer: large floor triangles
  // otherwise occlude smaller furniture faces when sorted by centroid depth.
  // A quiet rounded platform and woven-look rug keep the room legible on phones.
  rounded(
    group,
    palette.floor,
    0,
    -0.15,
    0,
    35.7,
    0.22,
    8.3,
    0.16,
  ).renderOrder = -30;
  rounded(
    group,
    palette.rugBorder,
    0,
    -0.018,
    -0.05,
    31.8,
    0.08,
    6.7,
    0.04,
  ).renderOrder = -29;
  rounded(
    group,
    palette.rug,
    0,
    0.027,
    -0.05,
    31.35,
    0.03,
    6.25,
    0.015,
  ).renderOrder = -28;
  for (const z of [-2.72, 2.62]) {
    rounded(
      group,
      palette.rugPattern,
      0,
      0.049,
      z,
      30.5,
      0.012,
      0.065,
      0.005,
    ).renderOrder = -27;
    for (const x of Array.from({ length: 17 }, (_, i) => (i - 8) * 1.85)) {
      const stitch = rounded(
        group,
        palette.rugBorder,
        x,
        0.055,
        z,
        0.22,
        0.014,
        0.22,
        0.005,
      );
      stitch.rotation.y = Math.PI / 4;
      stitch.renderOrder = -27;
    }
  }

  // One long lounge: four sofas in a row, alternating rose and moss.
  for (const [index, center] of AUDIENCE_SOFA_OBSTACLES.map((sofa) => sofa.x).entries()) {
    const side = index % 2 === 0 ? "left" : "right";
    const fabric = side === "left" ? palette.rose : palette.moss;
    const cushionFabric =
      side === "left" ? palette.roseLight : palette.mossLight;
    const sofa = new THREE.Group();
    sofa.name = `three-seat sofa ${index + 1}`;
    sofa.position.set(center, 0, 1.08);
    group.add(sofa);
    for (const x of [-1.65, 1.65]) {
      for (const z of [-0.49, 0.55]) {
        rounded(sofa, palette.woodDark, x, 0.15, z, 0.15, 0.25, 0.15, 0.04);
      }
    }
    rounded(sofa, fabric, 0, 0.34, 0.02, 4.13, 0.31, 1.61, 0.15);
    // Keep the back low enough that even the seated characters' faces remain visible.
    rounded(sofa, fabric, 0, 0.78, 0.66, 4.12, 0.85, 0.34, 0.16);
    for (const x of [-1.94, 1.94]) {
      rounded(sofa, fabric, x, 0.63, -0.02, 0.32, 0.66, 1.58, 0.15);
    }
    [-1.26, 0, 1.26].forEach((x, seatIndex) => {
      const seat = new THREE.Group();
      seat.name = `sofa ${index + 1} seat ${seatIndex + 1}`;
      seat.userData.seatId = `${side}-${seatIndex + 1}`;
      seat.position.set(x, 0, 0);
      sofa.add(seat);
      rounded(seat, cushionFabric, 0, 0.465, -0.07, 1.22, 0.17, 1.21, 0.08);
      const back = rounded(
        seat,
        cushionFabric,
        0,
        0.84,
        0.445,
        1.2,
        0.55,
        0.22,
        0.1,
      );
      back.rotation.x = -0.09;
      seat.traverse((child) => {
        child.userData.seatId = seat.userData.seatId;
      });
      seatTargets.push(seat);
    });
    // Small rolled throws stay at the outer arms, outside the six sitting areas.
    const throwPillow = rounded(
      sofa,
      palette.cream,
      side === "left" ? -1.66 : 1.66,
      0.72,
      0.12,
      0.3,
      0.52,
      0.5,
      0.14,
    );
    throwPillow.rotation.z = side === "left" ? -0.2 : 0.2;
  }

  const floorCushion = (
    x: number,
    z: number,
    color: THREE.Material,
    angle: number,
  ) => {
    const cushion = new THREE.Group();
    cushion.position.set(x, 0, z);
    cushion.rotation.y = angle;
    group.add(cushion);
    rounded(cushion, color, 0, 0.16, 0, 1.12, 0.26, 1, 0.13);
    rounded(cushion, palette.cream, 0, 0.3, 0, 0.1, 0.025, 0.1, 0.01);
  };
  // Positions come from the shared collision map, so pillows are always solid.
  const cushionLooks = [
    [palette.ochre, -0.18], [palette.roseLight, 0.2], [palette.moss, -0.1], [palette.mossLight, 0.14],
  ] as const;
  AUDIENCE_CUSHIONS.forEach(({ x, z }, index) => {
    const [color, angle] = cushionLooks[index % cushionLooks.length];
    floorCushion(x, z, color, angle);
  });

  // Side tables, lamps and plants only bookend the room; the middle stays open.
  for (const x of [-16.05, 16.05]) {
    disc(group, palette.woodDark, x, 0.27, -0.45, 0.12, 0.48);
    disc(group, palette.woodDark, x, 0.07, -0.45, 0.39, 0.1);
    disc(group, palette.wood, x, 0.55, -0.45, 0.67, 0.12);
    // A ceramic mug with a visible drink and a simple curved handle.
    disc(group, palette.cream, x - 0.23, 0.76, -0.46, 0.14, 0.29);
    disc(group, palette.coffee, x - 0.23, 0.91, -0.46, 0.115, 0.012);
    const handleGeometry = cached(
      "mug-handle",
      () =>
        new THREE.TorusGeometry(
          0.105,
          0.035,
          lowQuality ? 4 : 6,
          lowQuality ? 8 : 12,
        ),
    );
    mesh(group, handleGeometry, palette.cream, x - 0.06, 0.78, -0.46);
    // A little popcorn bowl, made from a soft tapered basket and ivory kernels.
    const bowl = cached(
      "bowl",
      () => new THREE.CylinderGeometry(0.24, 0.16, 0.2, lowQuality ? 10 : 12),
    );
    mesh(group, bowl, palette.clay, x + 0.25, 0.72, -0.41);
    for (let i = 0; i < 7; i += 1) {
      const angle = i * 2.4;
      oval(
        group,
        palette.cream,
        x + 0.25 + Math.cos(angle) * 0.13,
        0.84 + (i % 2) * 0.025,
        -0.41 + Math.sin(angle) * 0.13,
        0.085,
        0.07,
        0.08,
      );
    }
  }

  for (const x of [-16.25, 16.25]) {
    const z = 2.3;
    disc(group, palette.woodDark, x, 0.07, z, 0.36, 0.11);
    disc(group, palette.wood, x, 1.02, z, 0.045, 1.9);
    const shade = cached(
      "lamp-shade",
      () => new THREE.CylinderGeometry(0.31, 0.58, 0.59, lowQuality ? 10 : 16),
    );
    mesh(group, shade, palette.lamp, x, 2.02, z);
    disc(group, palette.cream, x, 1.725, z, 0.59, 0.04);
  }

  for (const [x, z] of [
    [-16.6, -2.6],
    [16.6, -2.6],
  ]) {
    const pot = cached(
      "plant-pot",
      () => new THREE.CylinderGeometry(0.36, 0.25, 0.5, lowQuality ? 10 : 14),
    );
    mesh(group, pot, palette.clay, x, 0.26, z);
    disc(group, palette.woodDark, x, 0.52, z, 0.3, 0.025);
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2;
      const leaf = oval(
        group,
        i % 2 ? palette.leaf : palette.leafLight,
        x + Math.cos(angle) * 0.21,
        0.85 + (i % 2) * 0.18,
        z + Math.sin(angle) * 0.21,
        0.18,
        0.5,
        0.09,
      );
      leaf.rotation.set(
        Math.sin(angle) * 0.48,
        -angle,
        -Math.cos(angle) * 0.48,
      );
    }
  }

  const room = new THREE.Group();
  room.name = "Long cozy watch room";
  room.add(group);
  // Sofas are scenery now. There is intentionally no sitting interaction.
  seatTargets.length = 0;
  room.traverse((object) => { delete object.userData.seatId; });
  let disposed = false;
  return {
    group: room,
    seatTargets,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((mat) => mat.dispose());
      room.removeFromParent();
      room.clear();
      group.clear();
      seatTargets.length = 0;
    },
  };
}
