// Runs the add-on's real scripts against the stand-in game in mock-server.mjs.
//   node --import ./tests/loader.mjs --test tests/

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { Entity, EntityDamageCause, ItemStack, Player, overworld, system, world } from '@minecraft/server';
import { answers, shown } from '@minecraft/server-ui';
import '../behavior_packs/venom_mode_bp/scripts/main.js';

const VENOM_SUIT = ['venom:suit_head', 'venom:suit_chest', 'venom:suit_legs', 'venom:suit_feet'];
const CRIMSON_SUIT = ['venom:crimson_head', 'venom:crimson_chest', 'venom:crimson_legs', 'venom:crimson_feet'];
const ABILITY_ITEMS = ['venom:core', 'venom:tendril', 'venom:devour', 'venom:roar', 'venom:spikes'];
const NOWHERE = [undefined, undefined, undefined, undefined];

beforeEach(() => {
  world.players.length = 0;
  world.timeOfDay = 6000;
  overworld.entities.length = 0;
  overworld.droppedItems.length = 0;
  overworld.rayHit = () => undefined;
  answers.length = 0;
  shown.length = 0;
});

const ticks = (count) => {
  for (let i = 0; i < count; i++) system.step();
};
const use = (player, id) => world.afterEvents.itemUse.emit({ source: player, itemStack: new ItemStack(id) });
const biomass = (player) => player.getDynamicProperty('venom:biomass');
const bonded = (player) => player.getDynamicProperty('venom:form') !== undefined;
const settle = () => new Promise((resolve) => setImmediate(resolve));

function zombie(z = 3, maxHealth = 20) {
  const mob = new Entity('minecraft:zombie', overworld, { x: 0, y: 64, z }, maxHealth);
  mob.families = ['zombie', 'monster', 'mob'];
  return mob;
}

/** A player already bonded with the black symbiote. */
function venom(form = 'venom') {
  const player = new Player(overworld);
  system.afterEvents.scriptEventReceive.emit({ id: 'venom:bond', message: form, sourceEntity: player });
  assert.ok(bonded(player));
  return player;
}

test('using a sample bonds the player and puts on the suit', () => {
  const player = new Player(overworld);
  player.container.setItem(0, new ItemStack('venom:symbiote_sample', 2));
  player.armor.Head = new ItemStack('minecraft:iron_helmet');
  player.hp = 7;

  use(player, 'venom:symbiote_sample');

  assert.equal(player.getDynamicProperty('venom:form'), 'venom');
  assert.deepEqual(player.worn(), VENOM_SUIT);
  assert.equal(player.armor.Chest.lockMode, 'slot');
  assert.equal(player.armor.Chest.keepOnDeath, true);
  assert.ok(player.container.ids().includes('minecraft:iron_helmet'), 'old armor is handed back');
  for (const id of ABILITY_ITEMS) assert.ok(player.container.ids().includes(id), `${id} is handed out`);
  assert.equal(player.container.slots[0].amount, 1, 'one sample is used up');
  assert.ok(player.hasTag('venom_bonded'));
  assert.equal(player.hp, 20);
  assert.match(player.titles[0], /WE ARE VENOM/);
  assert.equal(biomass(player), 60);
});

test('a bonded player cannot bond again', () => {
  const player = venom();
  player.container.setItem(8, new ItemStack('venom:crimson_sample', 1));
  player.selectedSlotIndex = 8;
  use(player, 'venom:crimson_sample');
  assert.equal(player.getDynamicProperty('venom:form'), 'venom');
  assert.equal(player.container.slots[8].amount, 1, 'the sample is not wasted');
  assert.match(player.messages.at(-1), /already lives in you/);
});

test('the suit grants its powers and shows the status bar', () => {
  const player = venom();
  ticks(40);
  assert.equal(player.getEffect('speed').amplifier, 1);
  assert.equal(player.getEffect('jump_boost').amplifier, 1);
  assert.equal(player.getEffect('resistance').amplifier, 1);
  assert.equal(player.getEffect('regeneration').amplifier, 1, 'well fed: fast healing');
  for (const effect of ['strength', 'night_vision']) assert.ok(player.getEffect(effect), effect);
  assert.match(player.actionBar.at(-1), /VENOM/);
});

test('the crimson symbiote has its own suit and stats', () => {
  const player = venom('crimson');
  ticks(20);
  assert.deepEqual(player.worn(), CRIMSON_SUIT);
  assert.equal(player.getEffect('speed').amplifier, 2);
  assert.equal(player.getEffect('resistance').amplifier, 0);
});

test('biomass drains over time and a starving symbiote feeds on its host', () => {
  const player = venom();
  ticks(20 * 15 + 20);
  assert.equal(biomass(player), 59);

  player.setDynamicProperty('venom:biomass', 0);
  ticks(20 * 30);
  assert.ok(player.getEffect('hunger'));
  assert.ok(player.damageTaken.some((hit) => hit.cause === EntityDamageCause.starve));
  assert.ok(player.hp >= 4, 'starvation never finishes the host off');
  assert.equal(player.getEffect('regeneration'), undefined);
});

test('chocolate and kills feed the symbiote', () => {
  const player = venom();
  player.setDynamicProperty('venom:biomass', 10);
  world.afterEvents.itemCompleteUse.emit({ source: player, itemStack: new ItemStack('venom:chocolate') });
  assert.equal(biomass(player), 45);

  const prey = zombie();
  prey.applyDamage(50, { cause: EntityDamageCause.entityAttack, damagingEntity: player });
  assert.equal(biomass(player), 45 + 4 + 20 * 0.4);
  assert.equal(player.getDynamicProperty('venom:kills'), 1);
});

test('tendril drags a mob toward the player and then recharges', () => {
  const player = venom();
  const mob = zombie(10);
  player.viewEntities = [mob];

  use(player, 'venom:tendril');
  assert.equal(mob.knockbacks.length, 1);
  assert.ok(mob.knockbacks[0].z < 0, 'pulled back toward the player');
  assert.equal(mob.damageTaken[0].amount, 5);
  assert.equal(player.itemCooldowns.venom_tendril, 30);
  assert.equal(biomass(player), 59);

  use(player, 'venom:tendril');
  assert.equal(mob.knockbacks.length, 1, 'still on cooldown');
  ticks(31);
  use(player, 'venom:tendril');
  assert.equal(mob.knockbacks.length, 2);
});

test('tendril aimed at a block, or used while sneaking, pulls the player instead', () => {
  const player = venom();
  player.viewBlock = { block: { location: { x: 0, y: 72, z: 14 } }, faceLocation: { x: 0.5, y: 0.5, z: 0 } };
  use(player, 'venom:tendril');
  assert.equal(player.knockbacks.length, 1);
  assert.ok(player.knockbacks[0].z > 1 && player.knockbacks[0].y > 1, 'launched up and forward');

  ticks(31);
  const mob = zombie(8);
  player.viewEntities = [mob];
  player.isSneaking = true;
  use(player, 'venom:tendril');
  assert.equal(player.knockbacks.length, 2);
  assert.equal(mob.knockbacks.length, 0);
});

test('a tendril that finds nothing costs no biomass and barely any cooldown', () => {
  const player = venom();
  use(player, 'venom:tendril');
  assert.equal(biomass(player), 60);
  assert.equal(player.itemCooldowns.venom_tendril, 8, 'the hotbar overlay matches the short wait');
  ticks(9);
  player.viewEntities = [zombie(5)];
  use(player, 'venom:tendril');
  assert.equal(player.itemCooldowns.venom_tendril, 30);
});

test('devour eats weakened prey whole and heals the host', () => {
  const player = venom();
  player.setDynamicProperty('venom:biomass', 20);
  player.hp = 9;
  const prey = zombie();
  player.viewEntities = [prey];

  use(player, 'venom:devour');
  assert.equal(prey.isValid, false);
  assert.equal(player.hp, 17);
  assert.equal(biomass(player), 20 + 30 + 12);
  assert.ok(player.getEffect('saturation'));
});

test('devour only bites prey that is too big to swallow', () => {
  const player = venom();
  player.hp = 10;
  const giant = zombie(3, 200);
  player.viewEntities = [giant];
  use(player, 'venom:devour');
  assert.equal(giant.hp, 188);
  assert.equal(player.hp, 13);
});

test('roar and spikes hit mobs but spare players, pets and objects', () => {
  const player = venom();
  const mob = zombie(3);
  const friend = new Player(overworld, { x: 2, y: 64, z: 0 });
  const pet = zombie(2);
  pet.tamed = true;
  const stand = zombie(1);
  stand.families = ['inanimate'];

  use(player, 'venom:roar');
  assert.equal(mob.damageTaken.length, 1);
  assert.equal(mob.getEffect('weakness').amplifier, 1);
  assert.ok(mob.knockbacks[0].z > 0, 'thrown away from the player');
  assert.equal(player.getEffect('strength').amplifier, 1, 'roaring enrages the symbiote');

  use(player, 'venom:spikes');
  assert.equal(mob.damageTaken.at(-1).amount, 11);
  for (const bystander of [friend, pet, stand]) assert.equal(bystander.damageTaken.length, 0);
  ticks(10); // the spike rings appear over a few ticks
  assert.ok(overworld.particles.includes('venom:spike'));
});

test('bare claws hit hard; holding a real weapon does not stack with them', () => {
  const player = venom();
  const mob = zombie(2, 100);
  player.selectedSlotIndex = 20; // an empty slot
  world.afterEvents.entityHitEntity.emit({ damagingEntity: player, hitEntity: mob });
  assert.equal(mob.damageTaken.at(-1).amount, 7);

  player.container.setItem(20, new ItemStack('minecraft:iron_sword'));
  world.afterEvents.entityHitEntity.emit({ damagingEntity: player, hitEntity: mob });
  assert.equal(mob.damageTaken.length, 1);
});

test('aimed abilities and claws pass over pets', () => {
  const player = venom();
  const pet = zombie(2);
  pet.tamed = true;
  const mob = zombie(4);
  player.viewEntities = [pet, mob];
  use(player, 'venom:devour');
  assert.equal(pet.isValid, true);
  assert.equal(mob.isValid, false, 'the bite goes to the mob behind the pet');

  player.selectedSlotIndex = 20;
  world.afterEvents.entityHitEntity.emit({ damagingEntity: player, hitEntity: pet });
  assert.equal(pet.damageTaken.length, 0);
});

test('holding jump against a wall climbs it', () => {
  const player = venom();
  overworld.rayHit = (_from, direction) => (direction.y === 0 ? { block: {} } : undefined);
  player.isJumping = true;
  ticks(1);
  assert.equal(player.getEffect('levitation').amplifier, 5);

  player.effects.delete('levitation');
  player.setDynamicProperty('venom:wall_crawl', false);
  ticks(1);
  assert.equal(player.getEffect('levitation'), undefined, 'switched off in the menu');
});

test('sneaking in mid-air dives, and the landing damages mobs around', () => {
  const player = venom();
  const mob = zombie(3, 100);
  player.location.y = 80;
  player.isOnGround = false;
  player.isSneaking = true;
  player.velocity.y = -0.2;

  ticks(1);
  assert.equal(player.knockbacks.at(-1).y, -1.6, 'thrown downward');
  ticks(3);
  assert.equal(player.getEffect('resistance').amplifier, 4, 'unhurt during the dive');

  player.location.y = 64;
  player.isOnGround = true;
  ticks(1);
  assert.equal(mob.damageTaken.length, 1);
  assert.ok(mob.damageTaken[0].amount > 10);
  assert.ok(mob.knockbacks[0].z > 0);
});

test('falls are cushioned, and fall damage that slips through is undone', () => {
  const player = venom();
  player.isOnGround = false;
  player.velocity.y = -1.2;
  overworld.rayHit = (_from, direction) => (direction.y === -1 ? { block: {} } : undefined);
  ticks(1);
  assert.equal(player.getEffect('resistance').amplifier, 4);

  player.applyDamage(6, { cause: EntityDamageCause.fall });
  assert.equal(player.hp, 20);
});

test('fire burns harder and stops the healing', () => {
  const player = venom();
  player.onFire = true;
  ticks(100);
  assert.ok(player.damageTaken.some((hit) => hit.cause === EntityDamageCause.fire));
  assert.equal(player.getEffect('regeneration'), undefined);
  assert.ok(biomass(player) < 60);
});

test('three loud noises in a row tear the symbiote off', () => {
  const player = venom();
  const bell = { typeId: 'minecraft:bell', dimension: overworld, location: { x: 3, y: 64, z: 0 } };
  const ring = (block = bell) => world.afterEvents.playerInteractWithBlock.emit({ block, isFirstEvent: true });

  ring({ ...bell, location: { x: 40, y: 64, z: 0 } });
  assert.equal(player.getEffect('nausea'), undefined, 'too far away to hear');

  ring();
  ring();
  assert.ok(bonded(player));
  assert.ok(player.getEffect('nausea'));
  ring();
  assert.equal(bonded(player), false);
  assert.deepEqual(player.worn(), NOWHERE);
  assert.ok(!player.container.ids().some((id) => id.startsWith('venom:')));
  assert.deepEqual(overworld.droppedItems.map((item) => item.typeId), ['venom:symbiote_sample']);
  assert.equal(player.getEffect('speed'), undefined);
  assert.equal(player.hasTag('venom_bonded'), false);
});

test('noise is forgotten after a quiet spell', () => {
  const player = venom();
  const bell = { typeId: 'minecraft:bell', dimension: overworld, location: { x: 3, y: 64, z: 0 } };
  for (let i = 0; i < 4; i++) {
    world.afterEvents.playerInteractWithBlock.emit({ block: bell, isFirstEvent: true });
    ticks(20 * 25);
  }
  assert.ok(bonded(player));
});

test('a wild symbiote that touches an unbonded player bonds with them', () => {
  const player = new Player(overworld);
  const wild = new Entity('venom:symbiote', overworld, { x: 1, y: 64, z: 0 }, 14);
  player.applyDamage(1, { cause: EntityDamageCause.entityAttack, damagingEntity: wild });
  assert.ok(bonded(player));
  assert.equal(wild.isValid, false, 'the symbiote goes into its host');
});

test('the core menu toggles options and separates on request', async () => {
  const player = venom();
  ticks(20);
  answers.push(2); // Night Vision, then the reopened menu is closed
  use(player, 'venom:core');
  await settle();
  assert.equal(player.getDynamicProperty('venom:night_vision'), false);
  assert.equal(shown.length, 2, 'the menu reopens after a toggle');
  ticks(20);
  assert.equal(player.getEffect('night_vision'), undefined);

  answers.push(5, 1); // Separate, confirm
  use(player, 'venom:core');
  await settle();
  assert.equal(bonded(player), false);
  assert.deepEqual(player.worn(), NOWHERE);
  assert.deepEqual(player.container.ids(), ['venom:symbiote_sample'], 'the sample comes back');
});

test('declining the separation prompt keeps the bond', async () => {
  const player = venom();
  answers.push(5, 0);
  use(player, 'venom:core');
  await settle();
  assert.ok(bonded(player));
});

test('camouflage hides the suit until the symbiote attacks', async () => {
  const player = venom();
  answers.push(1);
  use(player, 'venom:core');
  await settle();
  assert.deepEqual(player.worn(), NOWHERE);
  ticks(20);
  assert.ok(player.getEffect('invisibility'));
  assert.match(player.actionBar.at(-1), /HIDDEN/);

  world.afterEvents.entityHitEntity.emit({ damagingEntity: player, hitEntity: zombie(2, 100) });
  assert.deepEqual(player.worn(), VENOM_SUIT);
  assert.equal(player.getEffect('invisibility'), undefined);
});

test('a full inventory still receives every ability item', () => {
  const player = new Player(overworld);
  for (let slot = 0; slot < 36; slot++) player.container.setItem(slot, new ItemStack('minecraft:dirt', 64));
  player.container.setItem(0, new ItemStack('venom:symbiote_sample', 1));
  player.armor.Feet = new ItemStack('minecraft:iron_boots');

  use(player, 'venom:symbiote_sample');
  for (const id of ABILITY_ITEMS) assert.ok(player.container.ids().includes(id), id);
  const dropped = overworld.droppedItems.map((item) => item.typeId);
  assert.equal(dropped.filter((id) => id === 'minecraft:dirt').length, 5);
  assert.ok(dropped.includes('minecraft:iron_boots'), 'armor that does not fit is dropped, not deleted');
  assert.equal(player.container.slots[0], undefined, 'the sample is used up');
});

test('lost ability items come back, and extras are removed', () => {
  const player = venom();
  player.container.slots.fill(undefined);
  player.container.setItem(5, new ItemStack('venom:roar'));
  player.container.setItem(6, new ItemStack('venom:roar'));
  ticks(100);
  assert.deepEqual([...player.container.ids()].sort(), [...ABILITY_ITEMS].sort());
});

test('suit and ability items are taken from players who are not bonded', () => {
  const player = new Player(overworld);
  player.container.setItem(3, new ItemStack('venom:spikes'));
  player.container.setItem(4, new ItemStack('minecraft:bread'));
  player.armor.Chest = new ItemStack('venom:suit_chest');
  player.armor.Legs = new ItemStack('minecraft:iron_leggings');
  ticks(100);
  assert.deepEqual(player.container.ids(), ['minecraft:bread']);
  assert.deepEqual(player.worn(), [undefined, undefined, 'minecraft:iron_leggings', undefined]);
});

test('the bond survives death, and the symbiote comes back fed enough to work', () => {
  const player = venom();
  player.setDynamicProperty('venom:biomass', 5);
  player.armor = {};
  world.afterEvents.playerSpawn.emit({ player, initialSpawn: false });
  assert.deepEqual(player.worn(), VENOM_SUIT);
  assert.equal(biomass(player), 40);
});

test('a goat horn hurts every bonded player in earshot, including the one blowing it', () => {
  const player = venom();
  use(player, 'minecraft:goat_horn');
  assert.ok(player.getEffect('nausea'));
  assert.equal(biomass(player), 52);
});

test('at night a wild symbiote can fall near a player who has none', () => {
  const player = new Player(overworld);
  const host = venom();
  host.location.x = 500;
  const random = Math.random;
  Math.random = () => 0.01;
  try {
    world.timeOfDay = 18000;
    while (system.currentTick % 1200 !== 600) system.step();
  } finally {
    Math.random = random;
  }
  const fallen = overworld.entities.filter((entity) => entity.typeId === 'venom:symbiote');
  assert.equal(fallen.length, 1, 'one for the unbonded player, none for the host');
  assert.match(player.messages.at(-1), /fell from the sky/);
});

test('nothing falls during the day', () => {
  new Player(overworld);
  const random = Math.random;
  Math.random = () => 0.01;
  try {
    while (system.currentTick % 1200 !== 600) system.step();
    system.step();
    while (system.currentTick % 1200 !== 600) system.step();
  } finally {
    Math.random = random;
  }
  assert.equal(overworld.entities.filter((entity) => entity.typeId === 'venom:symbiote').length, 0);
});

test('script events let map makers bond, feed and separate players', () => {
  const player = new Player(overworld);
  const send = (id, message = '') => system.afterEvents.scriptEventReceive.emit({ id, message, sourceEntity: player });
  send('venom:bond', 'purple');
  assert.equal(bonded(player), false);
  assert.match(player.messages.at(-1), /Unknown symbiote/);
  send('venom:bond');
  assert.equal(player.getDynamicProperty('venom:form'), 'venom');
  send('venom:feed');
  assert.equal(biomass(player), 100);
  send('venom:separate');
  assert.equal(bonded(player), false);
});
