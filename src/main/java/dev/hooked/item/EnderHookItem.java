package dev.hooked.item;

import net.minecraft.entity.EquipmentSlot;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.item.tooltip.TooltipType;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.Hand;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.hit.HitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

import java.util.List;

/**
 * The endgame upgrade: instead of flinging you through the air, the hook
 * folds space and you simply arrive — enderman style.
 */
public class EnderHookItem extends GrapplingHookItem {

    public EnderHookItem(Settings settings, double range) {
        super(settings, range);
    }

    @Override
    protected void onHookedClient(PlayerEntity user, HitResult hit) {
        // Teleportation is entirely server-driven; no client-side fling.
    }

    @Override
    protected void onHookedServer(World world, PlayerEntity user, Hand hand, ItemStack stack, HitResult hit) {
        if (!(hit instanceof BlockHitResult blockHit)) {
            return;
        }

        Vec3d from = user.getPos();
        BlockPos landing = blockHit.getBlockPos().offset(blockHit.getSide());
        Vec3d to = new Vec3d(landing.getX() + 0.5, landing.getY(), landing.getZ() + 0.5);

        ServerWorld serverWorld = (ServerWorld) world;
        serverWorld.spawnParticles(ParticleTypes.PORTAL,
                from.x, from.y + 1.0, from.z, 32, 0.5, 1.0, 0.5, 0.2);

        user.requestTeleport(to.x, to.y, to.z);
        user.fallDistance = 0.0F;

        serverWorld.spawnParticles(ParticleTypes.REVERSE_PORTAL,
                to.x, to.y + 1.0, to.z, 32, 0.5, 1.0, 0.5, 0.2);

        world.playSound(null, from.x, from.y, from.z,
                SoundEvents.ENTITY_ENDERMAN_TELEPORT, SoundCategory.PLAYERS, 1.0F, 1.0F);
        world.playSound(null, to.x, to.y, to.z,
                SoundEvents.ENTITY_ENDERMAN_TELEPORT, SoundCategory.PLAYERS, 1.0F, 1.0F);

        // Landing on a wall-side hook point can still mean a short drop.
        user.addStatusEffect(new StatusEffectInstance(StatusEffects.SLOW_FALLING, 60, 0, false, false, true));

        user.getItemCooldownManager().set(this, 40);
        stack.damage(1, user, hand == Hand.MAIN_HAND ? EquipmentSlot.MAINHAND : EquipmentSlot.OFFHAND);
    }

    @Override
    public void appendTooltip(ItemStack stack, TooltipContext context, List<Text> tooltip, TooltipType type) {
        tooltip.add(Text.translatable("tooltip.hooked.ender_hook").formatted(Formatting.LIGHT_PURPLE));
        tooltip.add(Text.translatable("tooltip.hooked.range", (int) this.range).formatted(Formatting.DARK_GRAY));
    }
}
