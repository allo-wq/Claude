package dev.hooked;

import dev.hooked.item.EnderHookItem;
import dev.hooked.item.GrapplingHookItem;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;
import net.minecraft.item.Item;
import net.minecraft.item.ItemGroups;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.util.Identifier;
import net.minecraft.util.Rarity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class Hooked implements ModInitializer {
    public static final String MOD_ID = "hooked";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    public static final Item GRAPPLING_HOOK = register("grappling_hook",
            new GrapplingHookItem(new Item.Settings()
                    .maxDamage(160)
                    .rarity(Rarity.UNCOMMON),
                    32.0));

    public static final Item ENDER_HOOK = register("ender_hook",
            new EnderHookItem(new Item.Settings()
                    .maxDamage(320)
                    .rarity(Rarity.EPIC)
                    .fireproof(),
                    64.0));

    private static Item register(String name, Item item) {
        return Registry.register(Registries.ITEM, Identifier.of(MOD_ID, name), item);
    }

    @Override
    public void onInitialize() {
        ItemGroupEvents.modifyEntriesEvent(ItemGroups.TOOLS).register(entries -> {
            entries.add(GRAPPLING_HOOK);
            entries.add(ENDER_HOOK);
        });

        LOGGER.info("Hooked! loaded — go fling yourself somewhere nice.");
    }
}
