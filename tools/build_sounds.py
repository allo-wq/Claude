#!/usr/bin/env python3
"""Builds the add-on's sound effects from CC0 recordings on OpenGameArt.

Every source is public domain (CC0); they are listed in SOURCES below and
credited in CREDITS.md. The recordings are cut, pitched down, layered and
written as mono OGG files into the resource pack.

Usage:  python3 tools/build_sounds.py [--cache DIR]

Needs ffmpeg and numpy, and network access to opengameart.org the first time
(downloads are kept in the cache folder, .cache/sounds by default).
"""
import os
import subprocess
import sys
import urllib.request
import zipfile

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "resource_packs", "venom_mode_rp", "sounds", "venom")
FILES = "https://opengameart.org/sites/default/files/"
RATE = 44100

# pack -> (page on opengameart.org/content/, author, downloads)
SOURCES = {
    "troll": ("big-scary-troll-sounds", "Darsycho",
              ["troll-roars_0.ogg", "troll-idle-noises_0.ogg", "scrapped-troll-sounds.ogg"]),
    "snarls": ("monster-snarls", "Darsycho", ["monster-snarls_0.ogg", "monster-snarl-attack.ogg"]),
    "deep": ("cc0-deep-monster-roar", "trazzz123", ["monster_roar.wav"]),
    "creature": ("80-cc0-creature-sfx", "rubberduck", ["80-CC0-creature-SFX_0.zip"]),
    "slime": ("40-cc0-water-splash-slime-sfx", "rubberduck", ["water-splash-slime-sfx.zip"]),
    "swish": ("swishes-sound-pack", "artisticdude", ["swishes.zip"]),
    "crunch": ("7-eating-crunches", "StarNinjas", ["crunch_-_tito.zip"]),
}

# --------------------------------------------------------------------------- sources


def fetch(cache):
    """Download every source pack that is not in the cache yet; unpack the zips."""
    for pack, (_page, _author, downloads) in SOURCES.items():
        folder = os.path.join(cache, pack)
        os.makedirs(folder, exist_ok=True)
        for name in downloads:
            path = os.path.join(folder, name)
            if not os.path.exists(path):
                print("downloading", name)
                request = urllib.request.Request(FILES + name, headers={"User-Agent": "Mozilla/5.0 asset-fetch"})
                with urllib.request.urlopen(request, timeout=120) as response, open(path, "wb") as out:
                    out.write(response.read())
            if name.endswith(".zip"):
                with zipfile.ZipFile(path) as archive:
                    for info in archive.infolist():
                        # flatten paths: nothing in an archive may land outside its folder
                        flat = os.path.basename(info.filename.replace("\\", "/"))
                        target = os.path.join(folder, flat)
                        if flat.lower().endswith((".ogg", ".wav")) and not os.path.exists(target):
                            with archive.open(info) as src, open(target, "wb") as out:
                                out.write(src.read())


class Library:
    def __init__(self, cache):
        self.cache = cache

    def clip(self, pack, name, start=None, end=None):
        """A mono recording, or the part of it between two times in seconds."""
        path = os.path.join(self.cache, pack, name)
        raw = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(RATE), "-f", "f32le", "-"],
            capture_output=True, check=True).stdout
        samples = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
        a = 0 if start is None else int(start * RATE)
        b = len(samples) if end is None else int(end * RATE)
        return trim(samples[a:b])


# --------------------------------------------------------------------------- audio helpers


def trim(x, floor=0.01):
    """Drop the silence at both ends."""
    loud = np.flatnonzero(np.abs(x) > floor * max(np.abs(x).max(), 1e-9))
    return x[loud[0]:loud[-1] + 1] if len(loud) else x


def pitch(x, rate):
    """Play back at a different speed: below 1 is slower and deeper."""
    positions = np.arange(0, len(x) - 1, rate)
    return np.interp(positions, np.arange(len(x)), x)


def fade(x, fade_in=0.004, fade_out=0.06):
    y = x.copy()
    a, b = min(len(y), int(fade_in * RATE)), min(len(y), int(fade_out * RATE))
    if a:
        y[:a] *= np.linspace(0, 1, a)
    if b:
        y[-b:] *= np.linspace(1, 0, b)
    return y


def cut(x, seconds, fade_out=0.3):
    """Keep at most this much of the start, fading the end out."""
    return fade(x[: int(seconds * RATE)], fade_out=fade_out)


def mix(*layers):
    """Layer sounds. Each layer is (samples, start in seconds, gain)."""
    length = max(int(start * RATE) + len(x) for x, start, _gain in layers)
    out = np.zeros(length)
    for x, start, gain in layers:
        a = int(start * RATE)
        out[a:a + len(x)] += x * gain
    return out


def monstrous(x, rate):
    """Pitch a voice down and double it with a deeper copy underneath."""
    voice = pitch(x, rate)
    under = cut(pitch(x, rate * 0.75), len(voice) / RATE * 1.15, fade_out=0.25)
    return mix((fade(voice), 0, 1.0), (under, 0, 0.55))


def finish(x, peak=0.89):
    """Fade the edges, add a little grit, and bring the level up to a common peak."""
    y = fade(trim(x))
    y = y / max(np.abs(y).max(), 1e-9)
    y = np.tanh(y * 1.4) / np.tanh(1.4)
    return y * peak


def save(name, x):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{name}.ogg")
    data = finish(x).astype(np.float32).tobytes()
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(RATE), "-ac", "1", "-i", "-",
         "-c:a", "libvorbis", "-q:a", "4", "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact",
         path],
        input=data, check=True)
    return len(x) / RATE


# --------------------------------------------------------------------------- the sounds


def build(lib):
    c = lib.clip
    deep = c("deep", "monster_roar.wav")  # one long sub-bass roar, used as a bed under the others
    slime = {n: c("slime", f"slime_{n:02d}.ogg") for n in (1, 3, 5, 8, 9, 10, 13)}
    swish = {n: pitch(c("swish", f"swish-{n}.wav"), 0.5) for n in (7, 8, 9)}
    made = {}

    # Roar ability: a troll roar, doubled and pitched down, over the deep roar.
    roars = [("troll-roars_0.ogg", 1.86, 2.91), ("scrapped-troll-sounds.ogg", 8.18, 9.37), ("troll-roars_0.ogg", 7.08, 8.70)]
    for i, (name, a, b) in enumerate(roars, 1):
        made[f"roar{i}"] = mix((monstrous(c("troll", name, a, b), 0.8), 0, 1.0), (cut(deep, 2.8, 1.0), 0.05, 0.6))

    # Growls: hunger warnings and the boss's idle noise.
    growls = [("troll", "troll-idle-noises_0.ogg", 12.63, 16.42), ("troll", "troll-idle-noises_0.ogg", 16.82, 18.75),
              ("snarls", "monster-snarls_0.ogg", 4.95, 8.66), ("troll", "troll-idle-noises_0.ogg", 6.92, 8.45)]
    for i, (pack, name, a, b) in enumerate(growls, 1):
        made[f"growl{i}"] = cut(monstrous(c(pack, name, a, b), 0.85), 3.0)

    # Devour: a short snarl with a crunch landing just after it starts.
    bites = [(c("snarls", "monster-snarl-attack.ogg", 3.41, 4.15), "crunch.4.ogg"),
             (c("snarls", "monster-snarl-attack.ogg", 5.19, 5.97), "crunch.3.ogg"),
             (c("creature", "troll_03.ogg"), "crunch.5.ogg")]
    for i, (snarl, crunch) in enumerate(bites, 1):
        made[f"bite{i}"] = mix((pitch(snarl, 0.8), 0, 0.9), (c("crunch", crunch), 0.1, 1.0))
    for i, name in enumerate(("burp_02.ogg", "burp_01.ogg"), 1):
        made[f"gulp{i}"] = pitch(c("creature", name), 0.7)

    # Tendril: a slowed-down swish with a wet slap behind it.
    for i, (s, g) in enumerate(((9, 3), (7, 9), (8, 10)), 1):
        made[f"tendril{i}"] = mix((swish[s], 0, 1.0), (slime[g], 0.06, 0.8))
    for i, n in enumerate((1, 5, 8, 13), 1):
        made[f"squelch{i}"] = pitch(slime[n], 0.85)

    # Bonding: goo crawling over the host, then the first growl.
    made["bond"] = mix(
        (pitch(slime[9], 0.7), 0, 0.9), (pitch(slime[3], 0.7), 0.3, 0.9), (pitch(slime[10], 0.7), 0.6, 0.9),
        (pitch(slime[13], 0.6), 0.95, 0.9),
        (monstrous(c("troll", "troll-idle-noises_0.ogg", 6.92, 8.45), 0.75), 0.5, 1.0),
        (cut(deep, 2.4, 0.9), 0.3, 0.45))
    made["separate"] = mix(
        (c("slime", "splash_05.ogg"), 0, 1.0), (pitch(slime[9], 0.8), 0.1, 0.8),
        (monstrous(c("snarls", "monster-snarl-attack.ogg", 6.75, 7.70), 0.9), 0.15, 0.6))
    made["spikes"] = mix(
        (pitch(swish[9], 1.2), 0, 1.0), (slime[1], 0.03, 0.9), (slime[5], 0.10, 0.9), (pitch(swish[7], 1.2), 0.15, 0.8),
        (slime[8], 0.18, 0.9), (slime[13], 0.27, 0.9))

    # Carnage's blade slash: two quick cuts, a snarl and a wet hit.
    cuts = [("swish-3.wav", "swish-6.wav", "roar_03.ogg"), ("swish-4.wav", "swish-10.wav", "troll_02.ogg")]
    for i, (first, second, snarl) in enumerate(cuts, 1):
        made[f"slash{i}"] = mix(
            (pitch(c("swish", first), 0.7), 0, 1.0), (pitch(c("swish", second), 0.7), 0.09, 1.0),
            (pitch(c("creature", snarl), 0.8), 0.02, 0.7), (slime[5], 0.12, 0.6))

    # The noise weakness: a shriek.
    for i in (1, 2):
        made[f"pain{i}"] = monstrous(c("creature", f"scream_0{i}.ogg"), 0.7)

    # Wild symbiote.
    made["symbiote_idle1"] = pitch(c("creature", "burble_01.ogg"), 0.9)
    made["symbiote_idle2"] = pitch(c("creature", "burble_02.ogg"), 0.9)
    made["symbiote_idle3"] = c("slime", "bubble_01.ogg")
    made["symbiote_hurt1"] = pitch(c("creature", "hurt_02.ogg"), 0.9)
    made["symbiote_hurt2"] = pitch(c("creature", "hurt_05.ogg"), 0.9)
    made["symbiote_death"] = mix(
        (c("slime", "splash_06.ogg"), 0, 1.0), (pitch(slime[13], 0.8), 0.05, 0.8),
        (pitch(c("creature", "hurt_01.ogg"), 0.7), 0, 0.7))

    # Crimson boss.
    made["crimson_hurt1"] = monstrous(c("troll", "troll-roars_0.ogg", 5.35, 6.33), 0.85)
    made["crimson_hurt2"] = monstrous(c("troll", "troll-roars_0.ogg", 9.37, 10.15), 0.85)
    made["crimson_death"] = mix((cut(deep, 4.0, 1.5), 0, 1.0), (monstrous(c("troll", "troll-roars_0.ogg", 0.03, 0.98), 0.7), 0, 0.8))
    return made


def main():
    cache = os.path.join(ROOT, ".cache", "sounds")
    if "--cache" in sys.argv:
        cache = sys.argv[sys.argv.index("--cache") + 1]
    fetch(cache)
    for name, samples in build(Library(cache)).items():
        print(f"{name:16s} {save(name, samples):5.2f}s")


if __name__ == "__main__":
    main()
