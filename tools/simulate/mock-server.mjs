// Strict stand-in for @minecraft/server: validates arguments the way the
// real API does (non-finite numbers, wrong shapes and bad ids all throw).
export const log = { calls: new Map(), failEffects: false };
const rec = (name) => log.calls.set(name, (log.calls.get(name) ?? 0) + 1);
const num = (...vs) => { for (const v of vs) if (typeof v !== "number" || !Number.isFinite(v)) throw new TypeError(`bad number ${v}`); };
const vec3 = (v) => { if (!v || typeof v !== "object") throw new TypeError("not a Vector3"); num(v.x, v.y, v.z); };
const ident = (s) => { if (typeof s !== "string" || !/^[a-z0-9_]+:[a-z0-9_.]+$/.test(s)) throw new TypeError(`bad identifier ${s}`); };

export const EntityDamageCause = { magic: "magic", lightning: "lightning", fire: "fire", freezing: "freezing" };
export const GameMode = { Creative: "Creative", Survival: "Survival", Adventure: "Adventure", Spectator: "Spectator" };
export const EquipmentSlot = { Mainhand: "Mainhand" };
export const Direction = { Up: "Up", Down: "Down", North: "North", South: "South", East: "East", West: "West" };

export class ItemStack {
  constructor(typeId, amount = 1) { ident(typeId); num(amount); this.typeId = typeId; this.amount = amount; }
}

const LIQUID = new Set(["minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava"]);
const PASSABLE = new Set(["minecraft:wheat", "minecraft:short_grass", "minecraft:dandelion", "minecraft:poppy"]);

class Permutation {
  constructor(typeId, states) { this.typeId = typeId; this.states = states; this.type = { id: typeId }; }
  getState(name) { return this.states[name]; }
  withState(name, value) {
    if (!(name in this.states)) throw new Error(`state ${name} not on ${this.typeId}`);
    return new Permutation(this.typeId, { ...this.states, [name]: value });
  }
}

class Block {
  constructor(dim, x, y, z) { this.dimension = dim; this.x = x; this.y = y; this.z = z; }
  get data() { return this.dimension.cell(this.x, this.y, this.z); }
  get typeId() { return this.data.typeId; }
  get isAir() { return this.typeId === "minecraft:air"; }
  get isLiquid() { return LIQUID.has(this.typeId); }
  get location() { return { x: this.x, y: this.y, z: this.z }; }
  get permutation() { return new Permutation(this.typeId, this.data.states); }
  above(n = 1) { return new Block(this.dimension, this.x, this.y + n, this.z); }
  setType(id) { ident(id); rec(`setType:${id}`); this.dimension.set(this.x, this.y, this.z, { typeId: id, states: {} }); }
  setPermutation(p) { if (!(p instanceof Permutation)) throw new TypeError("not a permutation"); rec(`setPermutation:${p.typeId}`); this.dimension.set(this.x, this.y, this.z, { typeId: p.typeId, states: p.states }); }
}

let nextId = 1;
export class Entity {
  constructor(dim, typeId, location, { families = [], health = 20, tamed = false } = {}) {
    this.dimension = dim; this.typeId = typeId; this.location = location; this.families = families;
    this.id = String(nextId++); this.isValid = true; this.tamed = tamed; this.isSneaking = false;
    this.health = health === null ? undefined : { currentValue: health, effectiveMax: health, setCurrentValue(v) { num(v); this.currentValue = v; return true; } };
    dim.entities.push(this);
  }
  getComponent(name) {
    if (name === "minecraft:health") return this.health;
    if (name === "minecraft:is_tamed") return this.tamed ? {} : undefined;
    return undefined;
  }
  matches(q) { return (q.families ?? []).every((f) => this.families.includes(f)) && !(q.excludeFamilies ?? []).some((f) => this.families.includes(f)); }
  applyDamage(amount, opts) {
    num(amount); if (!opts || !Object.values(EntityDamageCause).includes(opts.cause)) throw new TypeError("bad damage options");
    rec("damage"); rec(`damage->${this.typeId}`); this.health.currentValue -= amount; return true;
  }
  addEffect(id, ticks, opts = {}) {
    ident(id); if (!id.startsWith("minecraft:")) throw new Error("effect must be namespaced in this mock");
    if (!Number.isInteger(ticks) || ticks <= 0) throw new TypeError(`bad duration ${ticks}`);
    if (opts.amplifier !== undefined && (!Number.isInteger(opts.amplifier) || opts.amplifier < 0 || opts.amplifier > 255)) throw new TypeError("bad amplifier");
    if (log.failEffects) throw new Error("effect immune");
    rec(`effect:${id}`); rec(`effect->${this.typeId}`); return {};
  }
  removeEffect(id) { ident(id); rec(`removeEffect:${id}`); return true; }
  applyKnockback(h, v) { if (!h || typeof h !== "object") throw new TypeError("applyKnockback needs VectorXZ"); num(h.x, h.z, v); rec("knockback"); rec(`knockback->${this.typeId}`); }
  applyImpulse(v) { vec3(v); rec("impulse"); rec(`impulse->${this.typeId}`); }
  clearVelocity() { rec("clearVelocity"); }
  setOnFire(sec, fx) { num(sec); rec("setOnFire"); rec(`setOnFire->${this.typeId}`); return true; }
  extinguishFire() { rec("extinguishFire"); return true; }
}

export class Player extends Entity {
  constructor(dim, location) {
    super(dim, "minecraft:player", location, { families: ["player"] });
    this.view = { x: 0, y: 0, z: 1 }; this.gameMode = GameMode.Survival; this.held = undefined;
    this.inventory = []; this.messages = []; this.props = new Map(); this.actionBar = "";
    this.onScreenDisplay = { setActionBar: (t) => { if (typeof t !== "string") throw new TypeError("action bar"); this.actionBar = t; } };
  }
  getComponent(name) {
    if (name === "minecraft:equippable") return { getEquipment: (slot) => { if (slot !== EquipmentSlot.Mainhand) throw new Error("slot"); return this.held; } };
    if (name === "minecraft:inventory") return { container: { addItem: (s) => { if (!(s instanceof ItemStack)) throw new TypeError("not ItemStack"); this.inventory.push(s.typeId); return undefined; } } };
    return super.getComponent(name);
  }
  getHeadLocation() { return { x: this.location.x, y: this.location.y + 1.62, z: this.location.z }; }
  getViewDirection() { return this.view; }
  getBlockFromViewDirection(opts) { return this.dimension.getBlockFromRay(this.getHeadLocation(), this.view, opts); }
  getEntitiesFromViewDirection(opts) { return this.dimension.getEntitiesFromRay(this.getHeadLocation(), this.view, opts).filter((h) => h.entity !== this); }
  getGameMode() { return this.gameMode; }
  playSound(id, opts) { if (typeof id !== "string") throw new TypeError("sound"); rec(`playerSound:${id}`); }
  startItemCooldown(cat, ticks) { if (typeof cat !== "string" || !Number.isInteger(ticks)) throw new TypeError("cooldown"); rec(`cooldown:${cat}`); }
  tryTeleport(loc, opts = {}) {
    vec3(loc);
    if (opts.checkForBlocks) {
      for (const dy of [0, 1]) { const b = new Block(this.dimension, Math.floor(loc.x), Math.floor(loc.y) + dy, Math.floor(loc.z)); if (!b.isAir && !PASSABLE.has(b.typeId)) return false; }
    }
    rec("teleport"); this.location = { ...loc }; return true;
  }
  sendMessage(m) { this.messages.push(m); }
  getDynamicProperty(k) { return this.props.get(k); }
  setDynamicProperty(k, v) { this.props.set(k, v); }
}

export class Dimension {
  constructor() { this.entities = []; this.blocks = new Map(); this.failEffects = false; }
  cell(x, y, z) {
    const k = `${x},${y},${z}`;
    if (this.blocks.has(k)) return this.blocks.get(k);
    if (y < 63) return { typeId: "minecraft:stone", states: {} };
    if (y === 63) {
      if (x >= 20 && x <= 30 && Math.abs(z) <= 5) return { typeId: "minecraft:water", states: { liquid_depth: 0 } };
      if (x <= -20 && x >= -30 && Math.abs(z) <= 5) return { typeId: x === -30 ? "minecraft:flowing_lava" : "minecraft:lava", states: { liquid_depth: x === -30 ? 3 : 0 } };
      return { typeId: "minecraft:grass_block", states: {} };
    }
    if (y === 64 && x >= 2 && x <= 4 && z >= 2 && z <= 4) return { typeId: "minecraft:wheat", states: { growth: 3 } };
    if (y === 64 && x === -2 && z === 3) return { typeId: "minecraft:nether_wart", states: { age: 1 } };
    if (z >= 40 && y < 70) return { typeId: "minecraft:stone", states: {} }; // a wall far ahead
    return { typeId: "minecraft:air", states: {} };
  }
  set(x, y, z, data) { this.blocks.set(`${x},${y},${z}`, data); }
  getBlock(loc) { vec3(loc); return new Block(this, Math.floor(loc.x), Math.floor(loc.y), Math.floor(loc.z)); }
  fx(kind, id, loc) { vec3(loc); if (typeof id !== "string") throw new TypeError(kind); if (this.failEffects) throw new Error("LocationInUnloadedChunkError"); rec(`${kind}:${id}`); }
  spawnParticle(id, loc) { this.fx("particle", id, loc); }
  playSound(id, loc, opts) { this.fx("sound", id, loc); if (opts) num(opts.volume ?? 1, opts.pitch ?? 1); }
  spawnEntity(id, loc) { ident(id); vec3(loc); rec(`spawnEntity:${id}`); return {}; }
  spawnItem(stack, loc) { vec3(loc); rec(`spawnItem:${stack.typeId}`); return {}; }
  createExplosion(loc, radius, opts) { vec3(loc); num(radius); rec("explosion"); return true; }
  filter(q, pool) {
    if (q.location) vec3(q.location);
    let out = pool.filter((e) => e.isValid &&
      !(q.excludeTypes ?? []).includes(e.typeId) && e.matches(q) &&
      (q.maxDistance === undefined || Math.hypot(e.location.x - q.location.x, e.location.y - q.location.y, e.location.z - q.location.z) <= q.maxDistance));
    if (q.closest) { out.sort((a, b) => dist(a.location, q.location) - dist(b.location, q.location)); out = out.slice(0, q.closest); }
    return out;
  }
  getEntities(q = {}) { return this.filter(q, this.entities); }
  getPlayers(q = {}) { return this.filter(q, this.entities.filter((e) => e instanceof Player)); }
  getBlockFromRay(origin, dir, opts = {}) {
    vec3(origin); vec3(dir);
    const max = opts.maxDistance ?? 100; num(max);
    let prev = origin;
    for (let d = 0; d <= max; d += 0.05) {
      const p = { x: origin.x + dir.x * d, y: origin.y + dir.y * d, z: origin.z + dir.z * d };
      const b = this.getBlock(p); const id = b.typeId;
      const solid = id !== "minecraft:air" && (!LIQUID.has(id) || opts.includeLiquidBlocks) && (!PASSABLE.has(id) || opts.includePassableBlocks);
      if (solid) {
        let face = Direction.Up;
        if (Math.floor(prev.y) > b.y) face = Direction.Up; else if (Math.floor(prev.y) < b.y) face = Direction.Down;
        else if (Math.floor(prev.x) < b.x) face = Direction.West; else if (Math.floor(prev.x) > b.x) face = Direction.East;
        else if (Math.floor(prev.z) < b.z) face = Direction.North; else if (Math.floor(prev.z) > b.z) face = Direction.South;
        return { block: b, face, faceLocation: { x: p.x - b.x, y: p.y - b.y, z: p.z - b.z } };
      }
      prev = p;
    }
    return undefined;
  }
  getEntitiesFromRay(origin, dir, opts = {}) {
    vec3(origin); vec3(dir);
    let max = opts.maxDistance ?? 100;
    if (!opts.ignoreBlockCollision) {
      const wall = this.getBlockFromRay(origin, dir, { maxDistance: max, includeLiquidBlocks: opts.includeLiquidBlocks });
      if (wall) max = Math.min(max, dist(origin, { x: wall.block.x + wall.faceLocation.x, y: wall.block.y + wall.faceLocation.y, z: wall.block.z + wall.faceLocation.z }));
    }
    const hits = [];
    for (const e of this.filter({ excludeTypes: opts.excludeTypes, excludeFamilies: opts.excludeFamilies, families: opts.families }, this.entities)) {
      const c = { x: e.location.x - origin.x, y: e.location.y + 0.9 - origin.y, z: e.location.z - origin.z };
      const t = c.x * dir.x + c.y * dir.y + c.z * dir.z;
      if (t < 0 || t > max) continue;
      const off = Math.hypot(c.x - dir.x * t, c.y - dir.y * t, c.z - dir.z * t);
      if (off <= 0.7) hits.push({ entity: e, distance: t });
    }
    return hits.sort((a, b) => a.distance - b.distance);
  }
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// ---- scheduler + events
let early = true;
export const __endEarlyExecution = () => { early = false; };
const tasks = new Map(); let taskId = 1;
const signal = () => { const hs = []; return { subscribe(cb, opts) { if (typeof cb !== "function") throw new TypeError("callback"); hs.push(cb); return cb; }, emit(ev) { for (const h of hs) h(ev); }, count: () => hs.length }; };
export const system = {
  currentTick: 0,
  runInterval(cb, n = 1) { const id = taskId++; tasks.set(id, { cb, n, next: this.currentTick + n, repeat: true }); return id; },
  runTimeout(cb, n = 1) { const id = taskId++; tasks.set(id, { cb, n, next: this.currentTick + Math.max(1, n), repeat: false }); return id; },
  run(cb) { return this.runTimeout(cb, 1); },
  clearRun(id) { tasks.delete(id); },
  afterEvents: { scriptEventReceive: signal() },
};
export const __tick = (count = 1) => {
  for (let i = 0; i < count; i++) {
    system.currentTick++;
    for (const [id, t] of [...tasks]) {
      if (!tasks.has(id) || t.next > system.currentTick) continue;
      if (t.repeat) t.next = system.currentTick + t.n; else tasks.delete(id);
      t.cb();
    }
  }
};
export const __pendingTasks = () => tasks.size;
const players = [];
export const __players = players;
export const world = {
  afterEvents: { itemUse: signal(), playerLeave: signal(), playerSpawn: signal(), entityHurt: signal(), entityDie: signal(), playerBreakBlock: signal() },
  getAllPlayers() { if (early) throw new Error("world.getAllPlayers called in early execution"); return players; },
};
