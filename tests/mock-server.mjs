// Stand-in for @minecraft/server: just enough of the game for the add-on's
// scripts to run under Node. It follows the 2.0.0 API shapes the scripts use
// and is strict about them (unknown effects, bad arguments and calls on dead
// entities throw), so a wrong call fails a test instead of passing silently.

export const EquipmentSlot = { Head: 'Head', Chest: 'Chest', Legs: 'Legs', Feet: 'Feet', Mainhand: 'Mainhand', Offhand: 'Offhand' };
export const ItemLockMode = { none: 'none', inventory: 'inventory', slot: 'slot' };
export const GameMode = { Survival: 'Survival', Creative: 'Creative', Adventure: 'Adventure', Spectator: 'Spectator' };
export const EntityDamageCause = {
  entityAttack: 'entityAttack',
  fall: 'fall',
  fire: 'fire',
  starve: 'starve',
  sonicBoom: 'sonicBoom',
  lightning: 'lightning',
};

const EFFECTS = new Set([
  'strength', 'speed', 'jump_boost', 'resistance', 'night_vision', 'regeneration', 'invisibility', 'levitation',
  'blindness', 'weakness', 'slowness', 'nausea', 'hunger', 'saturation', 'fire_resistance',
]);

export class ItemStack {
  constructor(typeId, amount = 1) {
    if (typeof typeId !== 'string') throw new TypeError('ItemStack needs an item id');
    this.typeId = typeId;
    this.amount = amount;
    this.lockMode = ItemLockMode.none;
    this.keepOnDeath = false;
  }
  clone() {
    return Object.assign(new ItemStack(this.typeId, this.amount), { lockMode: this.lockMode, keepOnDeath: this.keepOnDeath });
  }
}

class Signal {
  handlers = [];
  subscribe(handler) {
    this.handlers.push(handler);
    return handler;
  }
  emit(event) {
    for (const handler of this.handlers) handler(event);
  }
}

class Container {
  constructor(size) {
    this.size = size;
    this.slots = new Array(size).fill(undefined);
  }
  get emptySlotsCount() {
    return this.slots.filter((item) => !item).length;
  }
  getItem(slot) {
    return this.slots[slot]?.clone();
  }
  setItem(slot, item) {
    if (slot < 0 || slot >= this.size) throw new RangeError('slot out of range');
    this.slots[slot] = item?.clone();
  }
  addItem(item) {
    const free = this.slots.findIndex((occupant) => !occupant);
    if (free < 0) return item;
    this.slots[free] = item.clone();
    return undefined;
  }
  ids() {
    return this.slots.filter(Boolean).map((item) => item.typeId);
  }
}

export class Dimension {
  constructor(id) {
    this.id = id;
    this.entities = [];
    this.droppedItems = [];
    this.particles = [];
    this.sounds = [];
    /** Tests replace this to put blocks in the way of rays. */
    this.rayHit = (_from, _direction, _options) => undefined;
  }
  spawnParticle(id, location) {
    assertVector(location);
    this.particles.push(id);
  }
  playSound(id, location, options) {
    assertVector(location);
    this.sounds.push(id);
  }
  spawnItem(item, location) {
    assertVector(location);
    this.droppedItems.push(item.clone());
  }
  spawnEntity(typeId, location) {
    assertVector(location);
    return new Entity(typeId, this, location);
  }
  getEntities(options = {}) {
    return this.entities.filter((entity) => {
      if (!entity.isValid) return false;
      if (options.type && entity.typeId !== options.type) return false;
      if (options.excludeTypes?.includes(entity.typeId)) return false;
      if (options.excludeFamilies?.some((family) => entity.families.includes(family))) return false;
      if (options.location && options.maxDistance !== undefined) {
        if (distance(entity.location, options.location) > options.maxDistance) return false;
      }
      return true;
    });
  }
  getPlayers(options = {}) {
    return this.getEntities(options).filter((entity) => entity instanceof Player);
  }
  getBlockFromRay(from, direction, options) {
    assertVector(from);
    assertVector(direction);
    return this.rayHit(from, direction, options);
  }
  getTopmostBlock(xz) {
    return { location: { x: Math.floor(xz.x), y: 63, z: Math.floor(xz.z) }, dimension: this };
  }
}

export class Entity {
  static nextId = 1;

  constructor(typeId, dimension, location = { x: 0, y: 64, z: 0 }, maxHealth = 20) {
    this.id = String(Entity.nextId++);
    this.typeId = typeId;
    this.dimension = dimension;
    this.location = { ...location };
    this.isValid = true;
    this.families = [];
    this.tamed = false;
    this.onFire = false;
    this.maxHealth = maxHealth;
    this.hp = maxHealth;
    this.effects = new Map();
    this.tags = new Set();
    this.properties = new Map();
    this.knockbacks = [];
    this.damageTaken = [];
    this.isOnGround = true;
    this.isInWater = false;
    this.isSneaking = false;
    this.velocity = { x: 0, y: 0, z: 0 };
    dimension.entities.push(this);
  }

  live() {
    if (!this.isValid) throw new Error(`${this.typeId} is no longer valid`);
  }

  getComponent(id) {
    this.live();
    const entity = this;
    if (id === 'minecraft:health') {
      return {
        get currentValue() {
          return entity.hp;
        },
        get effectiveMax() {
          return entity.maxHealth;
        },
        setCurrentValue(value) {
          entity.hp = value;
          return true;
        },
        resetToMaxValue() {
          entity.hp = entity.maxHealth;
        },
      };
    }
    if (id === 'minecraft:onfire') return this.onFire ? { onFireTicksRemaining: 100 } : undefined;
    if (id === 'minecraft:is_tamed') return this.tamed ? {} : undefined;
    return undefined;
  }

  applyDamage(amount, options = {}) {
    this.live();
    if (typeof amount !== 'number' || Number.isNaN(amount)) throw new TypeError('damage must be a number');
    if (this.hp <= 0) return false;
    this.hp -= amount;
    this.damageTaken.push({ amount, cause: options.cause, by: options.damagingEntity });
    const damageSource = { cause: options.cause, damagingEntity: options.damagingEntity };
    world.afterEvents.entityHurt.emit({ hurtEntity: this, damageSource, damage: amount });
    if (this.hp <= 0) {
      world.afterEvents.entityDie.emit({ deadEntity: this, damageSource });
      if (!(this instanceof Player)) this.isValid = false;
    }
    return true;
  }

  applyKnockback(horizontalForce, verticalStrength) {
    this.live();
    if (typeof horizontalForce?.x !== 'number' || typeof horizontalForce?.z !== 'number' || typeof verticalStrength !== 'number') {
      throw new TypeError('applyKnockback(horizontalForce: VectorXZ, verticalStrength: number)');
    }
    if (![horizontalForce.x, horizontalForce.z, verticalStrength].every(Number.isFinite)) throw new RangeError('knockback must be finite');
    this.knockbacks.push({ ...horizontalForce, y: verticalStrength });
  }

  addEffect(id, duration, options = {}) {
    this.live();
    if (!EFFECTS.has(id)) throw new Error(`unknown effect ${id}`);
    if (!Number.isInteger(duration) || duration <= 0) throw new RangeError(`bad duration for ${id}`);
    const amplifier = options.amplifier ?? 0;
    if (!Number.isInteger(amplifier) || amplifier < 0 || amplifier > 255) throw new RangeError(`bad amplifier for ${id}`);
    const current = this.effects.get(id);
    if (current && current.amplifier > amplifier) return undefined; // a stronger effect wins
    this.effects.set(id, { amplifier, duration });
    return { amplifier, duration };
  }
  removeEffect(id) {
    this.live();
    if (!EFFECTS.has(id)) throw new Error(`unknown effect ${id}`);
    return this.effects.delete(id);
  }
  getEffect(id) {
    this.live();
    return this.effects.get(id);
  }

  addTag(tag) {
    this.tags.add(tag);
    return true;
  }
  removeTag(tag) {
    return this.tags.delete(tag);
  }
  hasTag(tag) {
    return this.tags.has(tag);
  }
  getDynamicProperty(key) {
    return this.properties.get(key);
  }
  setDynamicProperty(key, value) {
    if (value === undefined) this.properties.delete(key);
    else this.properties.set(key, value);
  }
  getVelocity() {
    return { ...this.velocity };
  }
  remove() {
    this.live();
    this.isValid = false;
  }
}

export class Player extends Entity {
  constructor(dimension, location) {
    super('minecraft:player', dimension, location, 20);
    this.families = ['player'];
    this.container = new Container(36);
    this.armor = {};
    this.selectedSlotIndex = 0;
    this.gameMode = GameMode.Survival;
    this.isJumping = false;
    this.isFlying = false;
    this.isGliding = false;
    this.rotation = { x: 0, y: 0 };
    this.movement = { x: 0, y: 1 };
    this.viewEntities = [];
    this.viewBlock = undefined;
    this.messages = [];
    this.actionBar = [];
    this.titles = [];
    this.commands = [];
    this.itemCooldowns = {};
    const player = this;
    this.inputInfo = { getMovementVector: () => ({ ...player.movement }) };
    this.onScreenDisplay = {
      setActionBar: (text) => player.actionBar.push(text),
      setTitle: (text, options) => {
        for (const key of ['fadeInDuration', 'stayDuration', 'fadeOutDuration']) {
          if (typeof options?.[key] !== 'number') throw new TypeError(`setTitle needs ${key}`);
        }
        player.titles.push(text);
      },
    };
    world.players.push(this);
  }

  getComponent(id) {
    const player = this;
    if (id === 'minecraft:inventory') return { container: this.container };
    if (id === 'minecraft:equippable') {
      const read = (slot) => (slot === EquipmentSlot.Mainhand ? player.container.slots[player.selectedSlotIndex] : player.armor[slot]);
      const write = (slot, item) => {
        if (slot === EquipmentSlot.Mainhand) player.container.slots[player.selectedSlotIndex] = item?.clone();
        else player.armor[slot] = item?.clone();
      };
      return {
        getEquipment: (slot) => read(slot)?.clone(),
        setEquipment: (slot, item) => {
          if (!(slot in EquipmentSlot)) throw new Error(`unknown slot ${slot}`);
          write(slot, item);
          return true;
        },
        getEquipmentSlot: (slot) => ({
          hasItem: () => read(slot) !== undefined,
          get amount() {
            return read(slot).amount;
          },
          set amount(value) {
            read(slot).amount = value;
          },
          setItem: (item) => write(slot, item),
        }),
      };
    }
    return super.getComponent(id);
  }

  sendMessage(text) {
    this.messages.push(text);
  }
  runCommand(command) {
    this.commands.push(command);
    return { successCount: 1 };
  }
  getGameMode() {
    return this.gameMode;
  }
  getHeadLocation() {
    return { x: this.location.x, y: this.location.y + 1.62, z: this.location.z };
  }
  getViewDirection() {
    return { x: 0, y: 0, z: 1 };
  }
  getRotation() {
    return { ...this.rotation };
  }
  getEntitiesFromViewDirection(options = {}) {
    return this.viewEntities
      .filter((entity) => entity.isValid && distance(entity.location, this.location) <= (options.maxDistance ?? Infinity))
      .map((entity) => ({ entity, distance: distance(entity.location, this.location) }));
  }
  getBlockFromViewDirection() {
    return this.viewBlock;
  }
  startItemCooldown(category, ticks) {
    this.itemCooldowns[category] = ticks;
  }

  /** Everything of the given kind the player is wearing, as item ids. */
  worn() {
    return ['Head', 'Chest', 'Legs', 'Feet'].map((slot) => this.armor[slot]?.typeId);
  }
}

function assertVector(value) {
  if (![value?.x, value?.y, value?.z].every(Number.isFinite)) throw new TypeError('expected a finite Vector3');
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export const world = {
  players: [],
  timeOfDay: 6000,
  afterEvents: {
    itemUse: new Signal(),
    itemCompleteUse: new Signal(),
    entityHitEntity: new Signal(),
    entityHurt: new Signal(),
    entityDie: new Signal(),
    playerInteractWithBlock: new Signal(),
    playerSpawn: new Signal(),
    playerLeave: new Signal(),
  },
  getAllPlayers() {
    return this.players.filter((player) => player.isValid);
  },
  getTimeOfDay() {
    return this.timeOfDay;
  },
};

export const system = {
  currentTick: 0,
  intervals: [],
  timeouts: [],
  afterEvents: { scriptEventReceive: new Signal() },
  runInterval(callback, every = 1) {
    this.intervals.push({ callback, every });
    return this.intervals.length;
  },
  runTimeout(callback, delay = 1) {
    this.timeouts.push({ callback, at: this.currentTick + delay });
    return this.timeouts.length;
  },
  /** Advance the game by one tick: timers fire and effects wear off. */
  step() {
    this.currentTick++;
    const due = this.timeouts.filter((timeout) => timeout.at <= this.currentTick);
    this.timeouts = this.timeouts.filter((timeout) => timeout.at > this.currentTick);
    for (const timeout of due) timeout.callback();
    for (const interval of this.intervals) {
      if (this.currentTick % interval.every === 0) interval.callback();
    }
    for (const dimension of dimensions) {
      for (const entity of dimension.entities) {
        for (const [id, effect] of entity.effects) {
          if (--effect.duration <= 0) entity.effects.delete(id);
        }
      }
    }
  },
};

export const overworld = new Dimension('minecraft:overworld');
const dimensions = [overworld];
