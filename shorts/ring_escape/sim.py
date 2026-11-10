"""Deterministic physics for RING ESCAPE.

Two balls bounce (with gravity) inside 21 concentric, spinning rings. Each ring has
a gap. When a ball slips through the gap of the innermost ring, that ring shatters
and the ball scores a point. Everything is seeded, so a seed fully determines a race.
"""
import math
import random

import numpy as np

FPS = 60
SUB = 12                      # physics substeps per video frame
DT = 1.0 / (FPS * SUB)

N_RINGS = 21                  # odd, so there can never be a tie at the end
R0, SPACING, LW = 110.0, 17.0, 5.0
BALL_R = 12.0
GRAV = 2200.0                 # px / s^2, +y is down
VMIN_N = 600.0                # minimum bounce-off speed: stops balls "rolling"
VMAX = 2200.0
OMEGA0, OMEGA_STEP = 1.05, 0.025
SPIRAL = 0.24                 # gap offset between neighbouring rings (rad)
GAP_IN, GAP_OUT = 0.90, 0.60  # full gap angle (rad), innermost -> outermost


def ring_r(k):
    return R0 + k * SPACING


def gap_half(k):
    f = k / (N_RINGS - 1)
    return 0.5 * (GAP_IN * (1 - f) + GAP_OUT * f)


def ring_omega(k):
    return OMEGA0 * (1 + OMEGA_STEP * k)


def ring_angle(k, t):
    return k * SPIRAL + ring_omega(k) * t


def wrap(a):
    return (a + math.pi) % (2 * math.pi) - math.pi


def simulate(seed, after=6.0, limit=75.0, keep_traj=True):
    """Run one race. Returns None if it takes longer than `limit` seconds."""
    rng = random.Random(seed)
    pos = [[-36.0 + rng.uniform(-8, 8), -20.0 + rng.uniform(-8, 8)],
           [36.0 + rng.uniform(-8, 8), -20.0 + rng.uniform(-8, 8)]]
    vel = []
    for _ in range(2):
        a = rng.uniform(0, 2 * math.pi)
        sp = rng.uniform(420, 620)
        vel.append([sp * math.cos(a), sp * math.sin(a)])

    cur = 0                    # innermost ring still standing
    passing = [-1, -1]         # ring index a ball is currently slipping through
    traj, breaks, bounces, clicks = [], [], [], []
    last_b, last_c = [-1.0, -1.0], -1.0
    t_end = None
    step = 0
    two_r2 = (2 * BALL_R) ** 2

    while True:
        t = step * DT
        if keep_traj:
            traj.append((pos[0][0], pos[0][1], pos[1][0], pos[1][1]))
        if t_end is not None:
            if t >= t_end + after:
                break
        elif t > limit:
            return None

        for b in (0, 1):
            p, v = pos[b], vel[b]
            v[1] += GRAV * DT
            p[0] += v[0] * DT
            p[1] += v[1] * DT

        for b in (0, 1):
            if cur >= N_RINGS:
                break
            R = R0 + cur * SPACING
            lim = R - BALL_R - LW / 2
            p, v = pos[b], vel[b]
            d = math.hypot(p[0], p[1])
            if d <= lim:
                if passing[b] == cur:
                    passing[b] = -1
                continue
            allow = gap_half(cur) - (BALL_R + LW / 2) / R
            rel = wrap(math.atan2(p[1], p[0]) - ring_angle(cur, t))
            if passing[b] == cur or abs(rel) < allow:
                passing[b] = cur
                if d > R:  # centre crossed the ring line -> it shatters
                    breaks.append((t, cur, b, p[0], p[1]))
                    cur += 1
                    passing = [-1, -1]
                    if cur == N_RINGS:
                        t_end = t
                continue
            nx, ny = p[0] / d, p[1] / d
            vn = v[0] * nx + v[1] * ny
            if vn > 0:
                tx, ty = -ny, nx
                vt = v[0] * tx + v[1] * ty + rng.uniform(-30, 30)
                vn2 = -max(vn, VMIN_N)
                v[0] = vn2 * nx + vt * tx
                v[1] = vn2 * ny + vt * ty
                sp = math.hypot(v[0], v[1])
                if sp > VMAX:
                    v[0] *= VMAX / sp
                    v[1] *= VMAX / sp
                if t - last_b[b] > 0.05:
                    bounces.append((t, b, cur, p[0], p[1], vn))
                    last_b[b] = t
            p[0] = nx * lim
            p[1] = ny * lim

        dx = pos[1][0] - pos[0][0]
        dy = pos[1][1] - pos[0][1]
        d2 = dx * dx + dy * dy
        if 1e-9 < d2 < two_r2:
            d = math.sqrt(d2)
            nx, ny = dx / d, dy / d
            vr = (vel[0][0] - vel[1][0]) * nx + (vel[0][1] - vel[1][1]) * ny
            if vr > 0:
                vel[0][0] -= vr * nx
                vel[0][1] -= vr * ny
                vel[1][0] += vr * nx
                vel[1][1] += vr * ny
                if t - last_c > 0.08:
                    clicks.append((t, (pos[0][0] + pos[1][0]) / 2,
                                   (pos[0][1] + pos[1][1]) / 2, vr))
                    last_c = t
            o = (2 * BALL_R - d) / 2
            pos[0][0] -= nx * o
            pos[0][1] -= ny * o
            pos[1][0] += nx * o
            pos[1][1] += ny * o
        step += 1

    return dict(seed=seed, t_end=t_end, breaks=breaks, bounces=bounces,
                clicks=clicks, traj=np.array(traj) if keep_traj else None)


def summarize(seed):
    """Drama metrics for a seed (used to pick the most watchable race)."""
    sim = simulate(seed, after=0.0, keep_traj=False)
    if sim is None:
        return seed, None
    br = sim["breaks"]
    sc = [0, 0]
    diffs = []
    for _, _, b, _, _ in br:
        sc[b] += 1
        diffs.append(sc[0] - sc[1])
    changes, prev = 0, 0
    for d in diffs:
        sgn = (d > 0) - (d < 0)
        if sgn:
            if prev and sgn != prev:
                changes += 1
            prev = sgn
    winner = 0 if sc[0] > sc[1] else 1
    deficit = max(0, max((-d if winner == 0 else d) for d in diffs))
    return seed, dict(T=sim["t_end"], score=tuple(sc), changes=changes,
                      deficit=deficit, final_wait=br[-1][0] - br[-2][0],
                      tied=diffs[-2] == 0, bounces=len(sim["bounces"]))
