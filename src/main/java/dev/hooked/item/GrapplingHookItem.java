package dev.hooked.item;

import net.minecraft.entity.EquipmentSlot;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.tooltip.TooltipType;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.Hand;
import net.minecraft.util.TypedActionResult;
import net.minecraft.util.hit.HitResult;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

import java.util.List;

/**
 * Aim at a block within range and right-click: the hook latches on and
 * flings you toward it, with a touch of upward lift and a short slow-fall
 * grace so the landing doesn't ruin the fun.
 */
public class GrapplingHookItem extends Item {
    protected final double range;

    public GrapplingHookItem(Settings settings, double range) {
        super(settings);
        this.range = range;
    }

    @Override
    public TypedActionResult<ItemStack> use(World world, PlayerEntity user, Hand hand) {
        ItemStack stack = user.getStackInHand(hand);
        HitResult hit = user.raycast(this.range, 0.0F, false);

        if (hit.getType() != HitResult.Type.BLOCK) {
            if (!world.isClient) {
                world.playSound(null, user.getX(), user.getY(), user.getZ(),
                        SoundEvents.BLOCK_DISPENSER_FAIL, SoundCategory.PLAYERS, 0.5F, 1.5F);
            }
            return TypedActionResult.fail(stack);
        }

        if (world.isClient) {
            // The client is authoritative for player movement, so the fling
            // itself happens here; everything else happens on the server.
            onHookedClient(user, hit);
        } else {
            onHookedServer(world, user, hand, stack, hit);
        }

        return TypedActionResult.success(stack, world.isClient);
    }

    protected void onHookedClient(PlayerEntity user, HitResult hit) {
        fling(user, hit.getPos());
    }

    protected void onHookedServer(World world, PlayerEntity user, Hand hand, ItemStack stack, HitResult hit) {
        Vec3d target = hit.getPos();

        world.playSound(null, user.getX(), user.getY(), user.getZ(),
                SoundEvents.ENTITY_FISHING_BOBBER_THROW, SoundCategory.PLAYERS, 1.0F, 0.8F);
        world.playSound(null, target.x, target.y, target.z,
                SoundEvents.BLOCK_CHAIN_PLACE, SoundCategory.PLAYERS, 1.0F, 1.2F);

        ((ServerWorld) world).spawnParticles(ParticleTypes.CRIT,
                target.x, target.y, target.z, 12, 0.3, 0.3, 0.3, 0.1);

        // Grace period so a long fling can't end in a crater.
        user.addStatusEffect(new StatusEffectInstance(StatusEffects.SLOW_FALLING, 80, 0, false, false, true));

        user.getItemCooldownManager().set(this, 20);
        stack.damage(1, user, hand == Hand.MAIN_HAND ? EquipmentSlot.MAINHAND : EquipmentSlot.OFFHAND);
    }

    private static void fling(PlayerEntity player, Vec3d target) {
        Vec3d pull = target.subtract(player.getEyePos());
        double distance = pull.length();
        if (distance < 0.5) {
            return;
        }

        double speed = MathHelper.clamp(distance * 0.22, 1.0, 3.2);
        double lift = MathHelper.clamp(0.4 + distance * 0.025, 0.4, 1.1);

        player.setVelocity(pull.normalize().multiply(speed).add(0.0, lift, 0.0));
        player.fallDistance = 0.0F;
    }

    @Override
    public void appendTooltip(ItemStack stack, TooltipContext context, List<Text> tooltip, TooltipType type) {
        tooltip.add(Text.translatable("tooltip.hooked.grappling_hook").formatted(Formatting.GRAY));
        tooltip.add(Text.translatable("tooltip.hooked.range", (int) this.range).formatted(Formatting.DARK_GRAY));
    }
}
