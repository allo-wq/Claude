import { ActionFormData, MessageFormData } from '@minecraft/server-ui';
import { PROP } from './config.js';
import { separate, syncSuit } from './bond.js';
import { biomassOf, formOf, option, runtimeOf } from './state.js';

/** @typedef {import('@minecraft/server').Player} Player */

const GUIDE = [
  '§lPOWERS§r',
  'Claws: bare-handed hits are deadly.',
  'Stronger, faster, tougher; you heal on your own and see in the dark.',
  'Wall-Crawl: hold JUMP while pushing into a wall.',
  'Ground Slam: SNEAK while high in the air.',
  'No fall damage.',
  '',
  '§lABILITIES§r (hold the item and USE it)',
  'Tendril Lash: drags a mob to you. Aim at a block, or sneak, to pull yourself there instead.',
  'Devour: a huge bite. Weakened prey is eaten whole, healing you.',
  'Roar: staggers and weakens every mob nearby.',
  'Spike Burst: spikes erupt all around you.',
  '',
  '§lBIOMASS§r',
  'The bar next to your name is the symbiote\'s hunger. Kills, Devour, chocolate, cookies and raw meat fill it.',
  'Above 60 you heal fast. At 0 it feeds on YOU.',
  '',
  '§lWEAKNESSES§r',
  'Fire burns much harder and stops your healing.',
  'Loud noise (bells, note blocks, goat horns, a Warden\'s boom, lightning) sickens you. Three in a row tear the symbiote off.',
].join('\n');

/** @param {boolean} on */
function label(on) {
  return on ? '§2ON' : '§4OFF';
}

/**
 * Flip a saved on/off option.
 * @param {Player} player
 * @param {string} key
 */
function toggle(player, key) {
  player.setDynamicProperty(key, !option(player, key));
}

/**
 * Open the Symbiote Core menu. It reopens after each toggle so several
 * settings can be changed in one go.
 * @param {Player} player
 */
export async function openCore(player) {
  const runtime = runtimeOf(player);
  if (runtime.menuOpen) return;
  runtime.menuOpen = true;
  try {
    while (player.isValid) {
      const form = formOf(player);
      if (!form) return;
      const menu = new ActionFormData()
        .title(`${form.name} Symbiote`)
        .body(`Biomass: ${Math.round(biomassOf(player))} / 100\nPrey taken: ${player.getDynamicProperty(PROP.kills) ?? 0}`)
        .button('How To Play', 'textures/items/venom_core')
        .button(`Camouflage: ${label(runtime.camo)}`, 'textures/items/venom_suit')
        .button(`Night Vision: ${label(option(player, PROP.nightVision))}`)
        .button(`Wall-Crawl: ${label(option(player, PROP.climb))}`)
        .button(`Status Bar: ${label(option(player, PROP.hud))}`)
        .button('§4Separate', 'textures/items/venom_symbiote_sample');
      const answer = await menu.show(player);
      if (answer.canceled || !player.isValid) return;

      if (answer.selection === 0) {
        const guide = await new ActionFormData().title('How To Play').body(GUIDE).button('Back').show(player);
        if (guide.canceled) return;
      } else if (answer.selection === 1) {
        if (!runtime.camo && biomassOf(player) < 15) {
          player.sendMessage('§7Too hungry to hide. Feed the symbiote first.');
        } else {
          runtime.camo = !runtime.camo;
          if (!runtime.camo) player.removeEffect('invisibility');
          syncSuit(player);
        }
      } else if (answer.selection === 2) {
        toggle(player, PROP.nightVision);
        if (!option(player, PROP.nightVision)) player.removeEffect('night_vision');
      } else if (answer.selection === 3) {
        toggle(player, PROP.climb);
      } else if (answer.selection === 4) {
        toggle(player, PROP.hud);
      } else if (answer.selection === 5) {
        const confirm = await new MessageFormData()
          .title('Separate?')
          .body('You lose every power until you bond again. The symbiote sample returns to your inventory.')
          .button1('Stay bonded')
          .button2('Separate')
          .show(player);
        if (confirm.selection === 1 && player.isValid) separate(player, false);
        return;
      }
    }
  } finally {
    runtime.menuOpen = false;
  }
}
