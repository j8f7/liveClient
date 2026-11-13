import * as THREE from "three";

export const SLIME_EXPRESSIONS = ["happy", "sleepy", "excited", "surprised", "sad", "grumpy", "wink"] as const;
export type SlimeExpression = typeof SLIME_EXPRESSIONS[number];

/** Geometry-only jelly: the same crisp illustrated face in WebGL and SVG. */
export function createSlimeAppearance(initialColor: number) {
  const group = new THREE.Group();
  group.name = "Reference-inspired squishy jelly";
  const portrait = new THREE.Group();
  portrait.position.y = 0.29;
  // The body always faces the fixed orthographic camera; setFacing() slides the
  // painted features around it, so the jelly reads as turning left/right/away.
  portrait.rotation.x = -Math.atan2(8.75, 12.5);
  group.add(portrait);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const material = (hex: number) => {
    const result = new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide });
    materials.add(result);
    return result;
  };
  const color = material(initialColor);
  const shadow = material(new THREE.Color(initialColor).multiplyScalar(0.82).getHex());
  const outline = material(0x29202d);
  const white = material(0xfffbfa);
  const shine = material(0xffe8f1);
  const cheek = material(0xf49bb6);
  const tongue = material(0xffa4ba);
  const tear = material(0xb8e7ff);
  const mesh = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material, z: number) => {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, mat);
    object.position.z = z;
    parent.add(object);
    return object;
  };
  const shape = new THREE.Shape();
  shape.moveTo(-0.285, -0.16);
  shape.bezierCurveTo(-0.36, -0.055, -0.31, 0.095, -0.235, 0.205);
  shape.bezierCurveTo(-0.19, 0.295, -0.095, 0.252, 0.035, 0.27);
  shape.bezierCurveTo(0.16, 0.285, 0.285, 0.17, 0.315, 0.055);
  shape.bezierCurveTo(0.37, -0.11, 0.27, -0.215, 0.13, -0.24);
  shape.bezierCurveTo(-0.025, -0.267, -0.22, -0.245, -0.285, -0.16);
  shape.closePath();
  // A soft-contoured, extruded jelly with a flat base and asymmetric peak.
  const jelly = mesh(portrait, new THREE.ExtrudeGeometry(shape, {
    depth: 0.10, bevelEnabled: false, curveSegments: 24,
  }), shadow, -0.105);
  jelly.castShadow = true;
  const edge = mesh(portrait, new THREE.ShapeGeometry(shape, 32), outline, 0);
  edge.scale.set(1.035, 1.035, 1);
  mesh(portrait, new THREE.ShapeGeometry(shape, 32), color, 0.004);

  const oval = (parent: THREE.Object3D, mat: THREE.Material, x: number, y: number,
    rx: number, ry: number, z = 0.012, angle = 0) => {
    const object = mesh(parent, new THREE.CircleGeometry(1, 28), mat, z);
    object.position.x = x;
    object.position.y = y;
    object.scale.set(rx, ry, 1);
    object.rotation.z = angle;
    return object;
  };
  const stroke = (parent: THREE.Object3D, points: number[][], thickness = 0.011, mat = outline, z = 0.018) => {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0)));
    return mesh(parent, new THREE.TubeGeometry(curve, 24, thickness, 6, false), mat, z);
  };
  // Each facial feature lives in a "part" pinned to a longitude on a virtual
  // sphere. Turning rotates the longitudes: features slide sideways, foreshorten
  // and disappear behind the edge, leaving a plain back when facing away.
  const FACE_RADIUS = 0.30;
  const parts: { group: THREE.Group; longitude: number }[] = [];
  const part = (parent: THREE.Object3D, x: number) => {
    const group = new THREE.Group();
    group.position.x = x;
    parent.add(group);
    parts.push({ group, longitude: Math.asin(x / FACE_RADIUS) });
    return group;
  };
  // Broad painted shine along the top plus soft cheeks, just like the reference.
  stroke(portrait, [[-0.22, 0.20], [-0.17, 0.235], [-0.085, 0.24], [-0.025, 0.24]], 0.014, shine, 0.011);
  oval(portrait, shine, 0.225, 0.15, 0.034, 0.067, 0.012, 0.55);
  for (const side of [-1, 1]) {
    const blush = part(portrait, side * 0.213);
    oval(blush, cheek, 0, -0.092, 0.055, 0.026);
    oval(blush, shine, side * 0.011, -0.08, 0.018, 0.012, 0.014);
  }

  const faces = new Map<SlimeExpression, THREE.Group>();
  const eye = (face: THREE.Group, x: number, round = false) => {
    const socket = part(face, x);
    oval(socket, outline, 0, -0.005, round ? 0.058 : 0.053, round ? 0.062 : 0.073, 0.016, -0.10);
    oval(socket, white, 0.017, 0.021, 0.017, 0.021, 0.019);
    oval(socket, shine, -0.018, -0.037, 0.009, 0.010, 0.019);
  };
  const closedEye = (face: THREE.Group, x: number, excited = false) => stroke(part(face, x),
    [[-0.046, -0.007], [0, excited ? 0.022 : -0.019], [0.046, -0.007]], 0.010);
  const smile = (face: THREE.Group) => stroke(part(face, 0),
    [[-0.076, -0.112], [-0.064, -0.136], [-0.027, -0.14], [0, -0.126], [0.029, -0.14], [0.062, -0.136], [0.076, -0.112]], 0.009);
  for (const expression of SLIME_EXPRESSIONS) {
    const face = new THREE.Group();
    face.name = `Expression: ${expression}`;
    portrait.add(face);
    faces.set(expression, face);
    if (expression === "sleepy" || expression === "excited") {
      closedEye(face, -0.137, expression === "excited");
      closedEye(face, 0.137, expression === "excited");
    } else {
      eye(face, -0.137, expression === "surprised");
      if (expression === "wink") closedEye(face, 0.137, true);
      else eye(face, 0.137, expression === "surprised");
    }
    if (expression === "excited") {
      const mouth = part(face, 0);
      oval(mouth, outline, 0, -0.12, 0.062, 0.055, 0.02);
      oval(mouth, tongue, 0, -0.145, 0.039, 0.022, 0.023);
    } else if (expression === "surprised") {
      oval(part(face, 0), outline, 0, -0.13, 0.030, 0.039, 0.02);
    } else if (expression === "sad") {
      stroke(part(face, 0), [[-0.05, -0.15], [0, -0.126], [0.05, -0.15]], 0.009);
      stroke(part(face, -0.14), [[-0.05, 0.084], [0.01, 0.108], [0.05, 0.115]], 0.009);
      stroke(part(face, 0.14), [[-0.05, 0.115], [-0.01, 0.108], [0.05, 0.084]], 0.009);
      oval(part(face, 0.185), tear, 0, -0.093, 0.015, 0.033, 0.022);
    } else if (expression === "grumpy") {
      stroke(part(face, -0.144), [[-0.051, 0.095], [0.051, 0.057]], 0.012);
      stroke(part(face, 0.144), [[-0.051, 0.057], [0.051, 0.095]], 0.012);
      stroke(part(face, 0), [[-0.048, -0.143], [0, -0.132], [0.048, -0.143]], 0.010);
    } else smile(face);
    face.visible = expression === "happy";
  }
  let disposed = false;
  let facing = 0;
  return {
    group, color,
    /** Yaw in radians: 0 faces the viewer, +PI/2 screen-right, -PI/2 screen-left, PI away. */
    setFacing(angle: number) {
      if (Math.abs(angle - facing) < 1e-4) return;
      facing = angle;
      for (const { group: feature, longitude } of parts) {
        const turned = longitude + angle;
        const depth = Math.cos(turned);
        feature.visible = depth > 0.12;
        feature.position.x = FACE_RADIUS * Math.sin(turned);
        feature.scale.x = Math.max(depth, 0.001);
      }
    },
    setColor(hex: number) {
      color.color.setHex(hex);
      shadow.color.setHex(new THREE.Color(hex).multiplyScalar(0.82).getHex());
    },
    setExpression(value: string | undefined) {
      const chosen = faces.has(value as SlimeExpression) ? value : "happy";
      faces.forEach((face, key) => { face.visible = key === chosen; });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((mat) => mat.dispose());
      group.removeFromParent();
      group.clear();
    },
  };
}
