/** Server-owned capabilities. Only explicit booleans enable an action. */
export function parseFeatures(data: unknown) {
  const value = data && typeof data === "object" ? data as Record<string, unknown> : {};
  return { roomCreation: value.roomCreation === true, roomControls: value.roomControls === true };
}
