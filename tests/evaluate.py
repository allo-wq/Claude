"""Play the new brain against the original over many seeds and both sides.

usage: python3 -I evaluate.py SECONDS SEEDS name=CFG [name=CFG ...]
Prints, per config: goals for/against the new bot, its goal share, and errors.
"""
import os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.environ.get("SCRIPT", os.path.join(HERE, "..", "SideswipeBot.lua"))
LINE = re.compile(r"score team1 (\d+) - team2 (\d+) \| decisions \d+ errors (\d+) badOutputs (\d+)")


def play(mode, seconds, seed, cfg):
    env = dict(os.environ, SEED=str(seed), CFG=cfg)
    out = subprocess.run(["lua5.1", os.path.join(HERE, "run.lua"), SCRIPT,
                          os.path.join(HERE, "baseline_v0_6.lua"), mode, str(seconds)],
                         env=env, capture_output=True, text=True, timeout=1200).stdout
    m = LINE.search(out)
    if not m:
        return None, out
    t1, t2, err, bad = map(int, m.groups())
    return (t1, t2, err, bad), out


def main():
    seconds, seeds = int(sys.argv[1]), int(sys.argv[2])
    specs = [a.split("=", 1) for a in sys.argv[3:]]
    jobs = []
    with ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as pool:
        for name, cfg in specs:
            for seed in range(1, seeds + 1):
                for mode in ("new-vs-old", "old-vs-new"):
                    jobs.append((name, mode, pool.submit(play, mode, seconds, seed, cfg)))
        totals = {}
        for name, mode, fut in jobs:
            res, out = fut.result()
            t = totals.setdefault(name, [0, 0, 0, 0, 0])
            if res is None:
                t[4] += 1
                print("FAILED RUN", name, mode, out[-400:])
                continue
            t1, t2, err, bad = res
            gf, ga = (t1, t2) if mode == "new-vs-old" else (t2, t1)
            t[0] += gf; t[1] += ga; t[2] += err; t[3] += bad
    for name, _ in specs:
        gf, ga, err, bad, failed = totals[name]
        share = gf / max(1, gf + ga)
        print(f"{name:16s} new {gf:4d} - {ga:4d} old   new share {share:5.1%}   errors {err} bad {bad} failed {failed}")


if __name__ == "__main__":
    main()
