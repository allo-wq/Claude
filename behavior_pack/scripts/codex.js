import { ActionFormData, MessageFormData } from "@minecraft/server-ui";
import { STAFF_LIST } from "./staffs.js";

/** @typedef {import("@minecraft/server").Player} Player */

const INTRO = [
  "§7Hold a staff and §fuse§7 it to cast its first spell.",
  "§fSneak§7 while using it to unleash the second.",
  "",
  "§7Spells cost §bmana§7. It refills by itself and is shown above your hotbar while you hold a staff.",
  "",
  "§7Pick a relic to read about it:",
].join("\n");

const WORLD_PAGE = [
  "§bArcane Ore§r",
  "Glowing ore found in stone and deepslate below Y 48. Mine it for §bArcane Shards§r.",
  "",
  "§dCrystal Sentinel§r",
  "A stone guardian that walks dark caves. Its blows slow you down. Defeat it for shards, a chance at a diamond, and a rush of mana.",
  "",
  "§eCrafting a staff§r",
  "Put two shards, two sticks and one catalyst on a crafting table:",
  "",
  "  [   ] [Shard] [Catalyst]",
  "  [   ] [Stick] [Shard]",
  "  [Stick] [   ] [   ]",
].join("\n");

/** Opens the guide book. @param {Player} player */
export async function openCodex(player) {
  try {
    const menu = new ActionFormData().title("Relic Codex").body(INTRO);
    for (const staff of STAFF_LIST) menu.button(staff.name, staff.icon);
    menu.button("Ore, Sentinel & Crafting", "textures/items/relics_arcane_shard");

    const picked = await menu.show(player);
    if (picked.canceled || picked.selection === undefined) return;

    const staff = STAFF_LIST[picked.selection];
    const page = new MessageFormData()
      .title(staff ? staff.name : "The World")
      .body(staff ? staffPage(staff) : WORLD_PAGE)
      .button1("Back")
      .button2("Close");
    const answer = await page.show(player);
    if (!answer.canceled && answer.selection === 0) await openCodex(player);
  } catch (error) {
    console.warn(`[Elemental Relics] codex failed: ${error}`);
  }
}

/** @param {import("./staffs.js").Staff} staff */
function staffPage(staff) {
  /** @param {string} how @param {import("./staffs.js").Spell} spell */
  const spellLines = (how, spell) => [
    `${staff.color}${spell.name}§r  §8(${how})`,
    spell.about,
    `§bMana ${spell.mana}§r  §7Recharge ${(spell.cooldown / 20).toFixed(1)}s§r`,
    "",
  ];
  return [
    ...spellLines("use", staff.primary),
    ...spellLines("sneak + use", staff.secondary),
    `§7Catalyst: §f${staff.catalyst}`,
  ].join("\n");
}
