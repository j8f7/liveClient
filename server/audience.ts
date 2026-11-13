import {
  AUDIENCE_EXPRESSIONS, AUDIENCE_COLORS, AUDIENCE_CAPACITY, AUDIENCE_ROOM_WIDTH as WIDTH, AUDIENCE_ROOM_DEPTH as DEPTH,
  AUDIENCE_RADIUS as RADIUS, AUDIENCE_SPEED, AUDIENCE_PUSH_SPEED,
  AUDIENCE_TICK_MS, AUDIENCE_TARGET_TIMEOUT_MS, AUDIENCE_BOX_OBSTACLES, AUDIENCE_ROUND_OBSTACLES,
  AUDIENCE_GESTURE_INTERVAL_MS, AUDIENCE_GESTURE_MS,
  audienceHash, audienceSurfaceHeight, readAudiencePosition,
  type AudienceMove, type AudienceParticipant, type AudiencePosition, type AudienceSnapshot,
} from "../shared/audience.ts";

const distance = (a: AudiencePosition, b: AudiencePosition) => Math.hypot((a.x-b.x)*WIDTH, (a.y-b.y)*DEPTH);
const EPS = 1e-9;
/** Solid world-space bounds. Radius is included for both walls and rounded box corners. */
export function audiencePositionClear(p: AudiencePosition): boolean {
  const x = (p.x-.5)*WIDTH, z = (p.y-.5)*DEPTH;
  if (Math.abs(x) > WIDTH/2-RADIUS+EPS || Math.abs(z) > DEPTH/2-RADIUS+EPS) return false;
  return AUDIENCE_BOX_OBSTACLES.every(box => {
    const dx = Math.max(Math.abs(x-box.x)-box.width/2, 0);
    const dz = Math.max(Math.abs(z-box.z)-box.depth/2, 0);
    return Math.hypot(dx,dz) >= RADIUS-EPS;
  }) && AUDIENCE_ROUND_OBSTACLES.every(round => Math.hypot(x-round.x, z-round.z) >= round.radius+RADIUS-EPS);
}

/** Newcomers head for this central floor region (world units from the room centre). */
export const AUDIENCE_CENTER_HALF_WIDTH = 6;
export const AUDIENCE_CENTER_HALF_DEPTH = 3;
/** One simulation step of walking, in world units. Newcomers appear 10-30 steps from where they head. */
const STEP = AUDIENCE_SPEED*AUDIENCE_TICK_MS/1000;
export const AUDIENCE_SPAWN_WALK: [number, number] = [10*STEP, 30*STEP];
const SPAWN_GRID = 0.12;
let spots: (AudiencePosition & { d: number })[] | undefined;
/**
 * Floor (not furniture, not seats) positions with d = world distance to the
 * central region (0 inside it), nearest first. Static scenery, so built once.
 */
function floorSpots() {
  if (spots) return spots;
  spots = [];
  for (let z = -DEPTH/2+RADIUS; z <= DEPTH/2-RADIUS+EPS; z += SPAWN_GRID) {
    for (let x = -WIDTH/2+RADIUS; x <= WIDTH/2-RADIUS+EPS; x += SPAWN_GRID) {
      const p = { x: x/WIDTH+.5, y: z/DEPTH+.5 };
      if (!audiencePositionClear(p) || audienceSurfaceHeight(p) !== 0) continue;
      spots.push({ ...p, d: Math.hypot(Math.max(Math.abs(x)-AUDIENCE_CENTER_HALF_WIDTH, 0), Math.max(Math.abs(z)-AUDIENCE_CENTER_HALF_DEPTH, 0)) });
    }
  }
  return spots.sort((a, b) => a.d - b.d);
}
const pickRandom = <T>(list: T[]) => list[Math.floor(Math.random()*list.length)];

/** Room-owned fixed-step simulation. Socket commands only replace an intent; never move bodies. */
export class AudienceState {
  private positions = new Map<string, AudienceParticipant>();
  private targets = new Map<string, AudiencePosition & { at: number }>();
  private lastGesture = new Map<string, number>();
  private lastColor = new Map<string, number>();
  private lastExpression = new Map<string, number>();
  private lastIntent = new Map<string, number>();
  /** Which way (+1/-1 on the minor axis) a walker is stepping around scenery. */
  private detour = new Map<string, number>();
  private lastTick: number | undefined;

  has(id: string) { return this.positions.has(id); }

  join(id: string, now = Date.now()) {
    // Replacement sockets preserve appearance and position but never inherit held input.
    this.stop(id);
    if (this.positions.has(id)) { delete this.positions.get(id)!.departureAt; return true; }
    if (this.positions.size >= AUDIENCE_CAPACITY) return false;
    // Newcomers appear on open floor (never overlapping, never on a sofa) and walk
    // to a free spot in the central region, or the nearest free spot once it is full.
    const bodies = [...this.positions.values()];
    const clearOf = (list: AudiencePosition[]) => (p: AudiencePosition) => list.every(other => distance(p,other) >= 2*RADIUS+0.01);
    const unbodied = clearOf(bodies);
    // Other arrivals' destinations count as taken, so walkers do not converge on one spot.
    const unclaimed = clearOf([...bodies, ...this.targets.values()]);
    const all = floorSpots();
    const central = all.filter(spot => spot.d === 0 && unclaimed(spot));
    const destination = central.length ? pickRandom(central) : all.find(spot => unclaimed(spot)) ?? all.find(spot => unbodied(spot));
    // A finite room has finite capacity.
    if (!destination) return false;
    const [minWalk, maxWalk] = AUDIENCE_SPAWN_WALK;
    const starts = all.filter(spot => unbodied(spot) && distance(spot,destination) >= minWalk);
    const nearby = starts.filter(spot => distance(spot,destination) <= maxWalk);
    const start = pickRandom(nearby.length ? nearby : starts) ?? destination;
    this.positions.set(id, {x:start.x, y:start.y, arrivalAt: now, pose:"stand", expression:"happy", color:AUDIENCE_COLORS[audienceHash(id)%AUDIENCE_COLORS.length].id});
    // A walk intent dated at the expected arrival, so it outlives the usual input timeout.
    const walkMs = distance(start,destination)/AUDIENCE_SPEED*1000;
    if (start !== destination) this.targets.set(id, {x:destination.x, y:destination.y, at: now+walkMs});
    return true;
  }
  departing(id: string, now = Date.now()) {
    this.stop(id);
    const body = this.positions.get(id);
    if (body) body.departureAt = now;
  }
  leave(id: string) {
    this.positions.delete(id); this.targets.delete(id); this.detour.delete(id); this.lastGesture.delete(id); this.lastColor.delete(id); this.lastExpression.delete(id); this.lastIntent.delete(id);
  }
  move(id: string, raw: unknown, now=Date.now()): boolean {
    if (!this.positions.has(id) || now-(this.lastIntent.get(id)??-Infinity)<25) return false;
    const p=readAudiencePosition(raw);
    if (!p) return false;
    this.lastIntent.set(id,now);
    this.targets.set(id,{...p,at:now}); return true;
  }
  stop(id: string) { this.targets.delete(id); this.lastIntent.delete(id); this.detour.delete(id); }
  /** Legacy seating events cannot teleport or change collision state. */
  pose(_id: string, _raw: unknown, _now=Date.now()): undefined { return; }

  tick(now=Date.now()): AudienceSnapshot | undefined {
    if (this.lastTick !== undefined && now-this.lastTick < AUDIENCE_TICK_MS) return;
    this.lastTick=now; // Delayed callbacks do not accumulate catch-up travel.
    for (const [id,target] of this.targets) {
      const p=this.positions.get(id);
      if (!p || now-target.at >= AUDIENCE_TARGET_TIMEOUT_MS || distance(p,target)<.005) this.targets.delete(id);
    }
    const active=new Set(this.targets.keys());
    const pushed = new Set<string>();
    let changed=false;
    for (const id of [...active].sort()) {
      const p=this.positions.get(id)!, target=this.targets.get(id)!;
      const length=distance(p,target);
      const step=Math.min(AUDIENCE_SPEED*AUDIENCE_TICK_MS/1000,length);
      const ux=(target.x-p.x)/length, uy=(target.y-p.y)/length;
      // Each attempt is a private transaction. A blocked chain rolls back in full.
      const attempt=(amount:number,allowPush:boolean,dx=ux,dy=uy) => {
        const draft=new Map<string,AudienceParticipant>();
        const visiting=new Set<string>();
        const shift=(who:string):boolean => {
          if (visiting.has(who)) return true;
          visiting.add(who);
          const old=this.positions.get(who)!;
          const next={...old,x:old.x+dx*amount,y:old.y+dy*amount};
          if (!audiencePositionClear(next)) return false;
          draft.set(who,next);
          for (const [other,body] of this.positions) {
            if (other===who) continue;
            const candidate=draft.get(other)??body;
            if (distance(next,candidate)<2*RADIUS-EPS) {
              if (!allowPush || other===id || active.has(other) || pushed.has(other) || !shift(other)) return false;
            }
          }
          return true;
        };
        if (!shift(id)) return false;
        // Final global verification prevents corner/branched-chain order artifacts.
        for(const [key,body] of draft) for(const [other,old] of this.positions) {
          if (key!==other && distance(body,draft.get(other)??old)<2*RADIUS-EPS) return false;
        }
        for(const [key,value] of draft) { this.positions.set(key,value); if(key!==id) pushed.add(key); }
        return true;
      };
      if (attempt(step,false)) { this.detour.delete(id); changed=true; continue; }
      if (attempt(Math.min(step,AUDIENCE_PUSH_SPEED*AUDIENCE_TICK_MS/1000),true)) { changed=true; continue; }
      // Only scenery is walked around; another slime in the way still blocks or is pushed.
      if (audiencePositionClear({...p,x:p.x+ux*step,y:p.y+uy*step})) continue;
      // (ux,uy) is room-units per world unit, so these are the world-space shares.
      const wx=Math.abs(ux)*WIDTH, wy=Math.abs(uy)*DEPTH, alongX=wx>=wy;
      // Blocked on the minor axis: keep sliding along the major one.
      if (alongX ? attempt(step*wx,false,Math.sign(ux)/WIDTH,0) : attempt(step*wy,false,0,Math.sign(uy)/DEPTH)) { changed=true; continue; }
      // Blocked head-on: step sideways, remembering the side so the walker
      // rounds the corner instead of dithering in front of the obstacle.
      const sidestep=(side:number)=>alongX ? attempt(step,false,0,side/DEPTH) : attempt(step,false,side/WIDTH,0);
      const side=this.detour.get(id) ?? (Math.sign(alongX ? uy : ux) || 1);
      if (sidestep(side)) { this.detour.set(id,side); changed=true; }
      else if (sidestep(-side)) { this.detour.set(id,-side); changed=true; }
    }
    return changed ? this.snapshot(now) : undefined;
  }

  color(id: string, raw: unknown, now=Date.now()): AudienceMove | undefined {
    const previous=this.positions.get(id);
    if (!previous || !raw || typeof raw!=="object" || Array.isArray(raw)) return;
    const color=AUDIENCE_COLORS.find(entry=>entry.id===(raw as {color?:unknown}).color)?.id;
    if (!color || color===previous.color || now-(this.lastColor.get(id)??-Infinity)<200) return;
    this.lastColor.set(id,now); previous.color=color;
    return {id,...this.current(previous,now)};
  }
  expression(id: string, raw: unknown, now=Date.now()): AudienceMove | undefined {
    const previous=this.positions.get(id);
    if (!previous || !raw || typeof raw!=="object" || Array.isArray(raw)) return;
    const expression=AUDIENCE_EXPRESSIONS.find(entry=>entry.id===(raw as {expression?:unknown}).expression)?.id;
    if (!expression || expression===previous.expression || now-(this.lastExpression.get(id)??-Infinity)<200) return;
    this.lastExpression.set(id,now); previous.expression=expression;
    return {id,...this.current(previous,now)};
  }
  gesture(id: string, raw: unknown, now=Date.now()): AudienceMove | undefined {
    const previous=this.positions.get(id);
    if (!previous || !raw || typeof raw!=="object" || Array.isArray(raw)) return;
    const {gesture}=raw as {gesture?:unknown};
    if (gesture!=="wave" && gesture!=="cheer") return;
    if (now-(this.lastGesture.get(id)??-Infinity)<AUDIENCE_GESTURE_INTERVAL_MS) return;
    this.lastGesture.set(id,now);
    Object.assign(previous,{gesture,gestureAt:now}); return {id,...previous};
  }
  private current(p: AudienceParticipant, now:number):AudienceParticipant {
    const result={...p};
    if (result.gestureAt===undefined || now-result.gestureAt>=AUDIENCE_GESTURE_MS) {delete result.gesture;delete result.gestureAt;}
    return result;
  }
  snapshot(now=Date.now()):AudienceSnapshot {
    return Object.fromEntries([...this.positions].map(([id,p])=>[id,this.current(p,now)]));
  }
  clear() {this.positions.clear();this.targets.clear();this.lastGesture.clear();this.lastColor.clear();this.lastExpression.clear();this.lastIntent.clear();this.detour.clear();this.lastTick=undefined;}
}
