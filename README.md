# Hooked! 🪝

A [Fabric](https://fabricmc.net/) mod for **Minecraft 1.21.1** that adds grappling hooks.
Aim at a block, right-click, and go.

## Items

### Grappling Hook
- Right-click any block within **32 blocks** to latch on and fling yourself toward it.
- Gets a short **Slow Falling** grace period so long flings don't end in a crater.
- 160 durability, 1s cooldown.

**Recipe** (shaped):

```
I I .        I = Iron Ingot
I S .        S = String
. . K        K = Stick
```

### Ender Hook
- The endgame upgrade: **64 block** range, and instead of flinging you through the
  air it **teleports** you straight to the target, enderman style.
- Fireproof, 320 durability, 2s cooldown.

**Recipe** (shapeless): Grappling Hook + 2× Ender Pearl + 1× Eye of Ender

## Building

Requires Java 21.

```sh
./gradlew build
```

The mod jar lands in `build/libs/hooked-<version>.jar`.

## Installing

1. Install the [Fabric Loader](https://fabricmc.net/use/installer/) for Minecraft 1.21.1.
2. Drop the [Fabric API](https://modrinth.com/mod/fabric-api) jar and the `hooked` jar
   into your `mods/` folder.
3. Launch, craft a hook, and fling yourself somewhere nice.

## Development

```sh
./gradlew runClient   # launch a dev client with the mod loaded
```

## License

MIT
