import { ActionFormData, MessageFormData } from '@minecraft/server-ui';
import { toggleBlob } from './abilities.js';
import { ABILITIES, PROP } from './config.js';
import { separate, syncSuit } from './bond.js';
import { biomassOf, formOf, option, runtimeOf } from './state.js';

/** @typedef {import('@minecraft/server').Player} Player */

/**
 * The How To Play page, with the abilities of the player's own symbiote.
 * @param {import('./config.js').Form} form
 */
function guide(form) {
  return [
    '§lPOWERS§r',
    'Claws: bare-handed hits are deadly.',
    'Stronger and faster; you heal on your own and see in the dark.',
    'Wall-Crawl: hold JUMP while pushing into a wall.',
    'Ground Slam: SNEAK while high in the air.',
    'No fall damage.',
    '',
    '§lABILITIES§r (hold the item and USE it)',
    ...form.abilities.map((key) => ABILITIES[key].help),
    '',
    '§lBLOB FORM§r',
    'SNEAK and use the Symbiote Core to melt into a blob, and again to rise.',
    'A blob is fast and unseen, climbs walls and slips into gaps one block high: walk into the hole.',
    'It has no armor and cannot use abilities.',
    '',
    '§lBIOMASS§r',
    'The bar next to your name is the symbiote\'s hunger. Kills, chocolate, cookies and raw meat fill it.',
    'Above 60 you heal fast. At 0 it feeds on YOU.',
    '',
    '§lWEAKNESSES§r',
    'Fire burns much harder and stops your healing.',
    'Loud noise (bells, note blocks, goat horns, a Warden\'s boom, lightning) sickens you. Three in a row tear the symbiote off.',
  ].join('\n');
}

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
        .button(`Blob Form: ${label(runtime.blob)}`, 'textures/items/venom_symbiote_sample')
        .button(`Camouflage: ${label(runtime.camo)}`, 'textures/items/venom_suit')
        .button(`Night Vision: ${label(option(player, PROP.nightVision))}`)
        .button(`Wall-Crawl: ${label(option(player, PROP.climb))}`)
        .button(`Status Bar: ${label(option(player, PROP.hud))}`)
        .button('§4Separate');
      const answer = await menu.show(player);
      if (answer.canceled || !player.isValid) return;

      if (answer.selection === 0) {
        const page = await new ActionFormData().title('How To Play').body(guide(form)).button('Back').show(player);
        if (page.canceled) return;
      } else if (answer.selection === 1) {
        toggleBlob(player, form);
        return; // straight back into the world as a blob (or as the suit)
      } else if (answer.selection === 2) {
        if (!runtime.camo && biomassOf(player) < 15) {
          player.sendMessage('§7Too hungry to hide. Feed the symbiote first.');
        } else {
          if (runtime.blob) toggleBlob(player, form);
          runtime.camo = !runtime.camo;
          if (!runtime.camo) player.removeEffect('invisibility');
          syncSuit(player);
        }
      } else if (answer.selection === 3) {
        toggle(player, PROP.nightVision);
        if (!option(player, PROP.nightVision)) player.removeEffect('night_vision');
      } else if (answer.selection === 4) {
        toggle(player, PROP.climb);
      } else if (answer.selection === 5) {
        toggle(player, PROP.hud);
      } else if (answer.selection === 6) {
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
