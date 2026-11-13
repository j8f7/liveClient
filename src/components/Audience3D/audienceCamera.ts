/** Keep figures the same readable size; narrow screens crop the room, never shrink it. */
export function audienceCameraFrame(width: number, height: number) {
  const aspect = Math.max(1, width) / Math.max(1, height);
  // Just tall enough for the room's depth, so it sits right under the player.
  const halfHeight = 2.8;
  const halfWidth = halfHeight * aspect;
  return { halfHeight, halfWidth, followLocal: halfWidth < 18.8 };
}

/** The room always fills the view top to bottom; only close-ups also follow depth. */
export function audienceCameraCenter(
  followLocal: boolean,
  local: { x: number; z: number } | undefined,
  followDepth = false,
) {
  return followLocal && local ? { x: local.x, z: followDepth ? local.z : 0 } : { x: 0, z: 0 };
}
