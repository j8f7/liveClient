import * as THREE from "three";
import { SVGRenderer } from "three/examples/jsm/renderers/SVGRenderer.js";
import {
  audienceHash,
  audienceSurfaceHeight,
  AUDIENCE_ROOM_WIDTH,
  AUDIENCE_ROOM_DEPTH,
  AUDIENCE_GESTURE_MS,
  AUDIENCE_ARRIVAL_MS,
  AUDIENCE_BUBBLE_MS,
  AUDIENCE_COLORS,
  type AudiencePosition,
  type AudienceParticipant,
} from "../../../shared/audience";
import { createRoomFurniture } from "./createRoomFurniture";
import { serverNow } from "../../utils/serverClock";
import { createSlimeAppearance } from "./createSlimeAppearance";
import { audienceCameraFrame, audienceCameraCenter } from "./audienceCamera";

export interface AudienceActor {
  id: string;
  position: AudienceParticipant;
  local: boolean;
  /** Name drawn on the floor under the slime (WebGL only; see labelsIn3D). */
  label?: string;
  /** Tag over the head (观看中), shown while the slime faces the screen. */
  status?: string;
}

/** A name chip drawn as a camera-facing sprite, so slimes in front can cover it. */
interface FigureLabel {
  sprite: THREE.Sprite;
  texture: THREE.CanvasTexture;
  material: THREE.SpriteMaterial;
  key: string;
  /** Chip size in CSS pixels. */
  width: number;
  height: number;
}

export interface AudienceProjection {
  id: string;
  x: number;
  headY: number;
  footY: number;
  visible: boolean;
  /** Turned toward the video screen (the resting pose). */
  watching: boolean;
}

interface Figure {
  root: THREE.Group;
  body: THREE.Group;
  appearance: ReturnType<typeof createSlimeAppearance>;
  state: AudienceParticipant;
  target: THREE.Vector3;
  phase: number;
  local: boolean;
  movedAt: number;
  /** Smoothed height of the sofa seat or pillow under the slime (0 on the floor). */
  lift: number;
  surface: number;
  /** Render time of the last hop up or down between surfaces. */
  hopAt: number;
  heading: number;
  /** Smoothed yaw shown by the face: 0 toward the viewer, +PI/2 screen-right. */
  facing: number;
  facingTarget: number;
  /** Milliseconds of drop-in already played; negative = still waiting to start. */
  arrivalElapsed: number | undefined;
  puff: THREE.Mesh;
  ring: THREE.Mesh;
  materials: THREE.Material[];
  label?: FigureLabel;
  /** 观看中 tag, shown only while the slime faces the screen. */
  status?: FigureLabel;
}

/** Slime bodies also live on this layer, for the depth pass that hides names behind them. */
const SLIME_LAYER = 1;
const LABEL_SCALE = 3;
/** CSS-pixel look of a floor chip, matching the HTML labels it replaces. */
interface ChipStyle {
  fontPx: number; weight: number; lineHeight: number;
  padX: number; padY: number; radius: number;
  background: string; color: string;
}
/** Name under a slime: small half-opacity text, dark chip (light for yourself). */
const nameChip = (local: boolean, fontPx: number): ChipStyle => ({
  fontPx, weight: local ? 600 : 400, lineHeight: 1.35, padX: 7, padY: 1, radius: 9,
  background: local ? "#d9c8ffeb" : "#1b1726d9", color: local ? "#1b172680" : "#f1ebf880",
});
/** 观看中 / Watching tag above a slime turned toward the video. */
const statusChip: ChipStyle = {
  fontPx: 9, weight: 400, lineHeight: 1.3, padX: 5, padY: 0, radius: 6,
  background: "#1b172699", color: "#d9d0e6",
};
/** Paint a chip, truncated with an ellipsis past 150 px. Sizes come back in CSS px. */
function drawChip(text: string, style: ChipStyle, fontFamily: string) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const s = LABEL_SCALE;
  const font = `${style.weight} ${style.fontPx * s}px ${fontFamily}`;
  ctx.font = font;
  const padX = style.padX * s, maxWidth = 150 * s;
  let shown = text;
  while (shown.length > 1 && ctx.measureText(shown).width + padX * 2 > maxWidth) shown = shown.slice(0, -1);
  if (shown !== text) shown = shown.slice(0, -1) + "…";
  const width = Math.ceil(ctx.measureText(shown).width + padX * 2);
  const height = Math.ceil(style.fontPx * style.lineHeight * s + 2 * style.padY * s);
  canvas.width = width; canvas.height = height;
  ctx.fillStyle = style.background;
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, Math.min(style.radius * s, height / 2));
  ctx.fill();
  ctx.font = font;
  ctx.fillStyle = style.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(shown, width / 2, height / 2 + s * 0.5);
  return { canvas, width: width / s, height: height / s };
}

const PALETTE = [0xba9fe9, 0xf2b88b, 0x8ec9bd, 0xe9a4bc, 0x99bcea, 0xe6cf87];
/** How long an idle slime keeps looking where it walked before turning back to the screen. */
const FACING_HOLD_MS = 30_000;
/** Resting yaw: backs to the viewer, watching the video player above the room. */
const FACING_REST = Math.PI;
/** Within this many radians of FACING_REST a slime counts as watching the screen. */
const WATCHING_TOLERANCE = 0.35;
const ARRIVAL_DROP = 1.7;
const HOP_MS = 280;
const ARRIVAL_REVEAL_WAIT_MS = 220;
const LAND_1 = 0.3;
const LAND_2 = 0.64;
const LAND_3 = 0.84;
/** Idle breathing cycle length and how much taller a slime gets on the in-breath. */
const BREATH_SECONDS = 3.2 / 3;
const BREATH_DEPTH = 0.045;
/**
 * Idle squash for a calm breath: a quicker in-breath, a slower out-breath and a
 * short rest at the bottom, rather than an even sine wobble.
 */
export function idleBreath(seconds: number) {
  const t = ((seconds / BREATH_SECONDS) % 1 + 1) % 1;
  const swell = t < 0.4 ? Math.sin((t / 0.4) * Math.PI / 2) // in-breath
    : t < 0.85 ? Math.cos(((t - 0.4) / 0.45) * Math.PI / 2) // out-breath
      : 0; // rest
  return (swell * swell * (3 - 2 * swell) - 0.5) * BREATH_DEPTH;
}
const turnToward = (from: number, to: number) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));
const WORLD_WIDTH = AUDIENCE_ROOM_WIDTH;
const WORLD_DEPTH = AUDIENCE_ROOM_DEPTH;
const toWorld = ({ x, y }: AudiencePosition) =>
  new THREE.Vector3((x - 0.5) * WORLD_WIDTH, 0, (y - 0.5) * WORLD_DEPTH);
const toPosition = (point: THREE.Vector3): AudiencePosition => ({
  x: THREE.MathUtils.clamp(point.x / WORLD_WIDTH + 0.5, 0, 1),
  y: THREE.MathUtils.clamp(point.z / WORLD_DEPTH + 0.5, 0, 1),
});

/** Tiny floor-level slimes in a cozy, double-width watch room. */
export function createAudienceScene(
  container: HTMLElement,
  onProject: (positions: AudienceProjection[]) => void,
  onUnavailable: () => void,
  options: { portrait?: boolean } = {},
) {
  let renderer: THREE.WebGLRenderer | SVGRenderer;
  try {
    const webgl = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    webgl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    webgl.setClearColor(0x13111d, 0);
    webgl.outputColorSpace = THREE.SRGBColorSpace;
    webgl.toneMapping = THREE.ACESFilmicToneMapping;
    webgl.toneMappingExposure = 1.3;
    webgl.shadowMap.enabled = true;
    webgl.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer = webgl;
  } catch {
    // Preserve the actual 3D scene on devices without WebGL. No CDN or remote assets.
    const svg = new SVGRenderer();
    svg.setClearColor(new THREE.Color(0x191521), 0);
    svg.setQuality("high");
    renderer = svg;
  }
  const isWebGL = renderer instanceof THREE.WebGLRenderer;
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.appendChild(renderer.domElement);
  // Stay hidden until the first slimes are known, so joining never flashes an
  // empty room that then jumps to the follow camera.
  renderer.domElement.style.opacity = "0";
  renderer.domElement.style.transition = "opacity 0.3s ease";
  let revealed = false;
  const reveal = () => { revealed = true; renderer.domElement.style.opacity = "1"; };
  const revealTimer = window.setTimeout(reveal, 900);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-9, 9, 4.7, -4.7, 0.1, 80);
  camera.zoom = options.portrait ? 8 : 1;
  camera.updateProjectionMatrix();
  camera.position.set(0, 9.4, 12.5);
  camera.lookAt(0, 0.65, 0);
  const furniture = createRoomFurniture(!isWebGL);
  furniture.group.visible = !options.portrait;
  scene.add(furniture.group);
  scene.add(
    new THREE.HemisphereLight(0xdad8ff, 0x302c40, isWebGL ? 2.5 : 0.95),
  );
  const screenLight = new THREE.DirectionalLight(0xbab5ff, isWebGL ? 4.2 : 1.2);
  screenLight.position.set(-1, 6, -7);
  screenLight.castShadow = true;
  screenLight.shadow.mapSize.set(1024, 1024);
  Object.assign(screenLight.shadow.camera, {
    left: -22,
    right: 22,
    top: 7,
    bottom: -7,
    near: 1,
    far: 25,
  });
  screenLight.shadow.bias = -0.002;
  scene.add(screenLight);
  const warmFill = new THREE.DirectionalLight(0xffdbbf, isWebGL ? 1.2 : 0.5);
  warmFill.position.set(5, 5, 6);
  scene.add(warmFill);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 50),
    new THREE.ShadowMaterial({ opacity: 0.2 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.015;
  floor.receiveShadow = true;
  if (isWebGL && !options.portrait) scene.add(floor);

  const ringGeometry = new THREE.RingGeometry(0.38, 0.41, 40);
  const figures = new Map<string, Figure>();
  // Names render after the room: depth is cleared, slime bodies are redrawn
  // depth-only, then the name sprites are depth-tested against just those, so a
  // slime in front covers a name while the floor and furniture never do.
  const labelScene = new THREE.Scene();
  const slimeDepth = new THREE.MeshBasicMaterial({ colorWrite: false });
  const labelFont = getComputedStyle(container).fontFamily || "sans-serif";
  const labelFontPx = () => (window.matchMedia("(max-width: 600px)").matches ? 7 : 8);
  function disposeChip(chip: FigureLabel | undefined) {
    if (!chip) return;
    labelScene.remove(chip.sprite);
    chip.texture.dispose();
    chip.material.dispose();
  }
  function removeLabel(figure: Figure) {
    disposeChip(figure.label); figure.label = undefined;
    disposeChip(figure.status); figure.status = undefined;
  }
  /** Reuse `current` while text and style are unchanged; otherwise repaint. */
  function chip(current: FigureLabel | undefined, text: string | undefined, style: ChipStyle, anchorBottom: boolean) {
    if (!isWebGL || !text) { disposeChip(current); return undefined; }
    const key = `${text}\n${JSON.stringify(style)}`;
    if (current?.key === key) return current;
    disposeChip(current);
    const { canvas, width, height } = drawChip(text, style, labelFont);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
    const sprite = new THREE.Sprite(material);
    // Names hang below the feet; the status tag sits on top of the head.
    sprite.center.set(0.5, anchorBottom ? 0 : 1);
    labelScene.add(sprite);
    return { sprite, texture, material, key, width, height };
  }
  function setLabel(figure: Figure, text: string | undefined, status: string | undefined) {
    figure.label = chip(figure.label, text, nameChip(figure.local, labelFontPx()), false);
    figure.status = chip(figure.status, status, statusChip, true);
  }
  const screenUp = new THREE.Vector3();
  const resources = new Set<THREE.Material>();
  const actorColor = (actor: AudienceActor) => {
    const selected = AUDIENCE_COLORS.find((option) => option.id === actor.position.color);
    return selected ? new THREE.Color(selected.hex).getHex()
      : PALETTE[(audienceHash(actor.id) >>> 4) % PALETTE.length];
  };
  function createFigure(actor: AudienceActor): Figure {
    const seed = audienceHash(actor.id);
    const appearance = createSlimeAppearance(actorColor(actor));
    appearance.setExpression(actor.position.expression);
    const root = new THREE.Group();
    root.name = `Slime ${actor.id}`;
    root.position.copy(toWorld(actor.position));
    const body = appearance.group;
    root.add(body);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xc1aeff, transparent: true, opacity: 0.65,
      side: THREE.DoubleSide, depthWrite: false,
    });
    resources.add(ringMaterial);
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.07;
    ring.visible = actor.local && !options.portrait;
    ring.renderOrder = -1;
    root.add(ring);
    // Soft dust ring that spreads out where an arriving slime lands.
    const puffMaterial = new THREE.MeshBasicMaterial({
      color: 0xf2eafc, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false,
    });
    resources.add(puffMaterial);
    const puff = new THREE.Mesh(ringGeometry, puffMaterial);
    puff.rotation.x = -Math.PI / 2;
    puff.position.y = 0.05;
    puff.visible = false;
    puff.renderOrder = -1;
    root.add(puff);
    scene.add(root);
    // Animate from when this viewer first sees the slime, not from the server's
    // clock: page load, latency or clock skew would otherwise eat the drop-in.
    const arrivalAt = actor.position.arrivalAt;
    const justArrived = arrivalAt !== undefined &&
      Math.abs(serverNow() - arrivalAt) < AUDIENCE_BUBBLE_MS;
    return { root, body, appearance, state: actor.position,
      target: toWorld(actor.position), phase: (seed % 1000) / 100,
      local: actor.local, movedAt: -FACING_HOLD_MS, heading: 0,
      lift: audienceSurfaceHeight(actor.position), surface: audienceSurfaceHeight(actor.position), hopAt: -HOP_MS,
      // Newcomers greet the room face-on while dropping in, then turn to the screen.
      facing: justArrived ? 0 : FACING_REST, facingTarget: justArrived ? 0 : FACING_REST,
      // Our own join waits for the canvas fade-in before dropping.
      arrivalElapsed: justArrived ? (revealed ? 0 : -ARRIVAL_REVEAL_WAIT_MS) : undefined, puff,
      ring, materials: [ringMaterial, puffMaterial] };
  }
  /** Drop in, two shrinking hops, then a jelly settle. `p` is 0..1. */
  function arrivalPose(p: number) {
    const hop = (from: number, to: number, peak: number) => {
      const u = (p - from) / (to - from);
      return peak * 4 * u * (1 - u);
    };
    const height = p < LAND_1 ? ARRIVAL_DROP * (1 - (p / LAND_1) ** 2)
      : p < LAND_2 ? hop(LAND_1, LAND_2, 0.55)
        : p < LAND_3 ? hop(LAND_2, LAND_3, 0.17) : 0;
    // Stretch while falling; each landing rings a damped squash.
    let squash = p < LAND_1 ? -0.16 * (p / LAND_1) : 0;
    for (const [at, amount] of [[LAND_1, 0.3], [LAND_2, 0.17], [LAND_3, 0.09]]) {
      const since = p - at;
      if (since >= 0) squash += amount * Math.exp(-since * 22) * Math.cos(since * 38);
    }
    // Pop into existence rather than appearing fully formed in mid-air.
    const pop = Math.min(1, p / 0.1);
    const grow = 1 - (1 - pop) ** 3;
    const puffAge = (p - LAND_1) / 0.3;
    return { height, squash, grow, puffAge };
  }

  let cameraFollowsLocal = false;
  let width = 1;
  let height = 1;
  let frame = 0;
  let lastTime = 0;
  let lastProjection = 0;
  let lastDraw = 0;
  let disposed = false;
  let visible = true;
  let reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const changeMotion = () => {
    reducedMotion = preference.matches;
    resume();
  };
  preference.addEventListener("change", changeMotion);
  const project = (position: THREE.Vector3) => {
    const point = position.clone().project(camera);
    return {
      x: (point.x * 0.5 + 0.5) * width,
      y: (-point.y * 0.5 + 0.5) * height,
    };
  };
  const emitProjection = () =>
    onProject(
      [...figures].map(([id, figure]) => {
        const head = project(
          // Speech bubbles ride along with hops and the arrival drop.
          figure.root.position.clone().add(new THREE.Vector3(0, 0.92 + figure.body.position.y, 0)),
        );
        const foot = project(
          figure.root.position.clone().add(new THREE.Vector3(0, figure.lift, 0.34)),
        );
        return {
          id,
          x: head.x,
          headY: head.y,
          footY: foot.y,
          visible:
            head.x > -18 &&
            head.x < width + 18 &&
            foot.y > 0 &&
            head.y < height,
          watching: Math.abs(turnToward(figure.facing, FACING_REST)) < WATCHING_TOLERANCE,
        };
      }),
    );
  function render(time: number, invalidated = false) {
    if (disposed) return;
    frame = 0;
    if (invalidated) {
      // IntersectionObserver can still describe the initial zero-width layout.
      // An explicit resize/state invalidation must check the current geometry.
      const bounds = container.getBoundingClientRect();
      visible = bounds.width > 1 && bounds.height > 1 &&
        bounds.bottom > 0 && bounds.right > 0 &&
        bounds.top < window.innerHeight && bounds.left < window.innerWidth;
    }
    if (!visible || document.hidden) return;
    if (!invalidated && time - lastDraw < (isWebGL ? 32 : 90)) {
      frame = window.requestAnimationFrame(render);
      return;
    }
    lastDraw = time;
    const delta = Math.min((time - (lastTime || time)) / 1000, 0.05);
    lastTime = time;
    let activeGesture = false;
    let animating = false;
    for (const figure of figures.values()) {
      const distance = Math.hypot(
        figure.root.position.x - figure.target.x,
        figure.root.position.z - figure.target.z,
      );
      const moved = distance > 0.0001;
      if (moved) figure.movedAt = time;
      const walking = moved || time - figure.movedAt < 125;
      animating ||= walking;
      const direction = figure.target.clone().sub(figure.root.position);
      // Use authoritative physical positions, rather than independently lerping
      // bodies through each other during pushes or crossing trajectories.
      figure.root.position.copy(figure.target);
      if (moved) figure.heading = THREE.MathUtils.clamp(direction.x * 1.5, -0.16, 0.16);
      // Look where we are going: +z is toward the viewer, -z toward the screen.
      if (distance > 0.004) figure.facingTarget = Math.atan2(direction.x, direction.z);
      else if (figure.arrivalElapsed === undefined && time - figure.movedAt > FACING_HOLD_MS) figure.facingTarget = FACING_REST;
      const turn = turnToward(figure.facing, figure.facingTarget);
      if (Math.abs(turn) > 0.001) {
        figure.facing += reducedMotion ? turn : turn * Math.min(1, delta * 10);
        animating = true;
      } else if (figure.facingTarget !== FACING_REST) animating = true; // Wake again to face the screen.
      figure.appearance.setFacing(figure.facing);
      const targetAngle = reducedMotion ? figure.root.rotation.y : figure.heading;
      const difference = Math.atan2(
        Math.sin(targetAngle - figure.root.rotation.y),
        Math.cos(targetAngle - figure.root.rotation.y),
      );
      figure.root.rotation.y += difference * Math.min(1, delta * 12);
      const seconds = time / 1000 + figure.phase;
      const gestureAge = serverNow() - (figure.state.gestureAt ?? 0);
      const gesturing = !!figure.state.gesture && gestureAge >= 0 && gestureAge < AUDIENCE_GESTURE_MS;
      activeGesture ||= gesturing;
      // Advance by the clamped frame delta, so a stalled main thread (page load,
      // background tab) pauses the drop-in instead of skipping it.
      if (figure.arrivalElapsed !== undefined) figure.arrivalElapsed += delta * 1000;
      const arrivalProgress = figure.arrivalElapsed === undefined || reducedMotion
        ? 1 : figure.arrivalElapsed / AUDIENCE_ARRIVAL_MS;
      const arriving = arrivalProgress < 1;
      if (!arriving) figure.arrivalElapsed = undefined;
      figure.body.visible = arrivalProgress >= 0;
      activeGesture ||= arriving;
      const arrival = arriving ? arrivalPose(Math.max(0, arrivalProgress)) : undefined;
      const bounce = reducedMotion ? 0 : arrival ? arrival.height : walking
        ? Math.abs(Math.sin(seconds * 11)) * 0.09
        : gesturing && figure.state.gesture === "cheer"
          ? Math.abs(Math.sin(gestureAge / 110)) * 0.15 : 0;
      const squash = reducedMotion ? 0 : arrival ? -arrival.squash : walking || gesturing
        ? Math.sin(seconds * 11) * 0.04
        : isWebGL ? idleBreath(seconds) : 0;
      const grow = arrival ? arrival.grow : 1;
      figure.body.scale.set((1 - squash * 0.5) * grow, (1 + squash) * grow, (1 - squash * 0.5) * grow);
      // Standing on furniture: ease to its height with a little hop on the way.
      const surface = audienceSurfaceHeight(figure.state);
      if (surface !== figure.surface) { figure.surface = surface; figure.hopAt = time; }
      const hopProgress = (time - figure.hopAt) / HOP_MS;
      const hopping = !reducedMotion && hopProgress < 1;
      figure.lift = hopping ? figure.lift + (surface - figure.lift) * Math.min(1, delta * 16) : surface;
      animating ||= hopping;
      figure.body.position.y = bounce + figure.lift + (hopping ? Math.sin(hopProgress * Math.PI) * 0.26 : 0);
      figure.ring.position.y = 0.07 + figure.lift;
      const puffing = !!arrival && arrival.puffAge >= 0 && arrival.puffAge < 1;
      figure.puff.visible = puffing;
      if (puffing) {
        const spread = 0.7 + arrival.puffAge * 1.5;
        figure.puff.scale.set(spread, spread, 1);
        (figure.puff.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - arrival.puffAge) ** 2;
      }
      figure.body.rotation.z = reducedMotion ? 0 : gesturing
        ? Math.sin(gestureAge / 85) * 0.025 : walking ? Math.sin(seconds * 11) * 0.02 : 0;
      figure.body.rotation.y = !reducedMotion && gesturing ? Math.sin(gestureAge / 85) * 0.18 : 0;
    }

    const local = [...figures.values()].find((figure) => figure.local);
    const center = audienceCameraCenter(
      cameraFollowsLocal,
      local?.root.position,
      !!options.portrait,
    );
    camera.position.set(center.x, options.portrait ? 9.05 : 8.8, center.z + 12.5);
    camera.lookAt(center.x, options.portrait ? 0.30 : 0.05, center.z);
    camera.updateMatrixWorld();
    renderer.domElement.dataset.cameraMode = cameraFollowsLocal
      ? "follow"
      : "room";
    renderer.domElement.dataset.cameraX = center.x.toFixed(4);
    renderer.domElement.dataset.cameraFrame = JSON.stringify({
      left: camera.left,
      right: camera.right,
      top: camera.top,
      bottom: camera.bottom,
      width,
      height,
      zoom: camera.zoom,
      rotation: camera.rotation.toArray(),
    });
    renderer.domElement.dataset.cameraZ = center.z.toFixed(4);
    if (local)
      renderer.domElement.dataset.localWorldX =
        local.root.position.x.toFixed(4);
    renderer.render(scene, camera);
    if (renderer instanceof THREE.WebGLRenderer && labelScene.children.length) {
      // Keep names a constant on-screen size whatever the camera framing.
      const pixelsPerUnit = height / ((camera.top - camera.bottom) / camera.zoom);
      screenUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
      for (const figure of figures.values()) {
        const { label, status } = figure;
        if (label) {
          label.sprite.visible = figure.body.visible;
          // Same anchor as the projected foot point the HTML label used.
          label.sprite.position.set(figure.root.position.x, figure.lift, figure.root.position.z + 0.34);
          label.sprite.scale.set(label.width / pixelsPerUnit, label.height / pixelsPerUnit, 1);
        }
        if (status) {
          status.sprite.visible = figure.body.visible &&
            Math.abs(turnToward(figure.facing, FACING_REST)) < WATCHING_TOLERANCE;
          // Rides on the head like a speech bubble (hops included), 4 px above it.
          status.sprite.position.set(figure.root.position.x, 0.92 + figure.body.position.y, figure.root.position.z)
            .addScaledVector(screenUp, 4 / pixelsPerUnit);
          status.sprite.scale.set(status.width / pixelsPerUnit, status.height / pixelsPerUnit, 1);
        }
      }
      const autoClear = renderer.autoClear;
      const shadows = renderer.shadowMap.autoUpdate;
      renderer.autoClear = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.clearDepth();
      camera.layers.set(SLIME_LAYER);
      scene.overrideMaterial = slimeDepth;
      renderer.render(scene, camera);
      scene.overrideMaterial = null;
      camera.layers.set(0);
      renderer.render(labelScene, camera);
      renderer.shadowMap.autoUpdate = shadows;
      renderer.autoClear = autoClear;
    }
    if (invalidated || time - lastProjection > 32) {
      emitProjection();
      lastProjection = time;
    }
    if ((!reducedMotion && (isWebGL || animating)) || activeGesture)
      frame = window.requestAnimationFrame(render);
  }
  function resume() {
    if (!frame && !disposed && !document.hidden) {
      lastTime = 0;
      frame = window.requestAnimationFrame((time) => render(time, true));
    }
  }
  function redrawAfterResize() {
    // SVGRenderer.setSize changes the viewBox immediately. Paint the matching
    // camera immediately too, even when an idle/reduced-motion scene has no RAF.
    window.cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    render(performance.now(), true);
  }
  const resize = new ResizeObserver(() => {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    const { halfWidth, halfHeight, followLocal } = audienceCameraFrame(
      width,
      height,
    );
    cameraFollowsLocal = options.portrait || followLocal;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    redrawAfterResize();
  });
  resize.observe(container);
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    } else resume();
  });
  observer.observe(container);
  document.addEventListener("visibilitychange", resume);
  const contextLost = (event: Event) => {
    event.preventDefault();
    visible = false;
    window.cancelAnimationFrame(frame);
    frame = 0;
    onUnavailable();
  };
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  resume();
  return {
    /** Names are drawn in the scene (WebGL); otherwise the caller keeps HTML labels. */
    labelsIn3D: isWebGL,
    setActors(actors: AudienceActor[]) {
      const ids = new Set(actors.map((actor) => actor.id));
      for (const [id, figure] of figures)
        if (!ids.has(id)) {
          removeLabel(figure);
          scene.remove(figure.root);
          figure.appearance.dispose();
          figure.materials.forEach((material) => {
            material.dispose();
            resources.delete(material);
          });
          figures.delete(id);
        }
      for (const actor of actors) {
        const figure = figures.get(actor.id) ?? createFigure(actor);
        figure.target.copy(toWorld(actor.position));
        figure.state = actor.position;
        figure.appearance.setColor(actorColor(actor));
        figure.appearance.setExpression(actor.position.expression);
        // Expression changes can add face meshes; keep every body part in the depth pass.
        figure.body.traverse((object) => object.layers.enable(SLIME_LAYER));
        figure.local = actor.local;
        figure.ring.visible = actor.local && !options.portrait;
        setLabel(figure, actor.label, actor.status);
        figures.set(actor.id, figure);
      }
      if (actors.length) reveal();
      emitProjection();
      resume();
    },
    // Compatibility with older consumers: furniture is decorative, never a seat action.
    seatFromPointer(_clientX: number, _clientY: number): string | undefined {
      return undefined;
    },
    positionFromPointer(
      clientX: number,
      clientY: number,
    ): AudiencePosition | undefined {
      const bounds = container.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((clientX - bounds.left) / bounds.width) * 2 - 1,
        -((clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(pointer, camera);
      const point = ray.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
        new THREE.Vector3(),
      );
      return point ? toPosition(point) : undefined;
    },
    dispose() {
      disposed = true;
      window.clearTimeout(revealTimer);
      window.cancelAnimationFrame(frame);
      resize.disconnect();
      observer.disconnect();
      preference.removeEventListener("change", changeMotion);
      document.removeEventListener("visibilitychange", resume);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      scene.remove(furniture.group);
      furniture.dispose();
      figures.forEach((figure) => { removeLabel(figure); figure.appearance.dispose(); });
      slimeDepth.dispose();
      const geometries = new Set<THREE.BufferGeometry>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) geometries.add(object.geometry);
      });
      geometries.add(ringGeometry);
      geometries.forEach((geometry) => geometry.dispose());
      resources.forEach((material) => material.dispose());
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      if (renderer instanceof THREE.WebGLRenderer) renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
