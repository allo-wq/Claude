"""Deterministic simulation for FIRE vs WATER vs PLANT.

Three armies of particles share an arena. Fire burns plant, plant drinks water and
water puts out fire: when a particle touches one of its prey, the prey converts to
the hunter's side. Particles chase the nearest prey and flee the nearest predator.
The battle ends when one element owns every particle. A seed fully determines it.
"""
import numpy as np

FPS = 60
DT = 1.0 / FPS
ARENA = (50.0, 530.0, 1030.0, 1450.0)       # x0, y0, x1, y1 (screen pixels)
N_PER = 80
N = 3 * N_PER
R = 14.0
FIRE, WATER, PLANT = 0, 1, 2
NAMES = ["FIRE", "WATER", "PLANT"]
PREY = np.array([PLANT, FIRE, WATER])        # what each element beats
PRED = np.array([WATER, PLANT, FIRE])        # what beats each element

VMIN, VMAX = 110.0, 240.0
SEEK, FLEE, JITTER = 380.0, 520.0, 260.0
SEEK_RANGE, FLEE_RANGE = 320.0, 170.0
REPEL = 4000.0
TOUCH = 2 * R + 2.0


def _camps(rng):
    x0, y0, x1, y1 = ARENA
    w, h = x1 - x0, y1 - y0
    centres = [(x0 + 0.25 * w, y0 + 0.27 * h), (x0 + 0.75 * w, y0 + 0.27 * h),
               (x0 + 0.5 * w, y0 + 0.75 * h)]
    pos, typ = [], []
    for t, (cx, cy) in enumerate(centres):
        placed = 0
        while placed < N_PER:
            a, r = rng.uniform(0, 2 * np.pi), 200 * np.sqrt(rng.uniform())
            p = np.array([cx + r * np.cos(a), cy + r * np.sin(a)])
            if all(np.hypot(*(p - q)) > 2 * R + 3 for q in pos):
                pos.append(p)
                typ.append(t)
                placed += 1
    return np.array(pos), np.array(typ)


def simulate(seed, after=6.0, limit=80.0, record=True):
    rng = np.random.default_rng(seed)
    pos, typ = _camps(rng)
    ang = rng.uniform(0, 2 * np.pi, N)
    vel = np.stack([np.cos(ang), np.sin(ang)], 1) * rng.uniform(VMIN, VMAX, (N, 1))
    x0, y0, x1, y1 = ARENA
    ar = np.arange(N)

    frames_pos, frames_typ, events, counts = [], [], [], []
    t_end = None
    frame = 0
    while True:
        if record:
            frames_pos.append(pos.astype(np.float32))
            frames_typ.append(typ.astype(np.int8))
        counts.append(np.bincount(typ, minlength=3))
        if t_end is not None:
            if frame * DT >= t_end + after:
                break
        elif frame * DT > limit:
            return None

        d = pos[None, :, :] - pos[:, None, :]            # d[i, j] = pos[j] - pos[i]
        D = np.sqrt((d ** 2).sum(-1))
        np.fill_diagonal(D, np.inf)
        prey_mask = typ[None, :] == PREY[typ][:, None]
        pred_mask = typ[None, :] == PRED[typ][:, None]

        acc = rng.normal(0, JITTER, (N, 2))
        Dp = np.where(prey_mask, D, np.inf)
        jp = Dp.argmin(1)
        dp = Dp[ar, jp]
        m = dp < SEEK_RANGE
        if m.any():
            acc[m] += SEEK * d[ar[m], jp[m]] / dp[m, None] * (1 - 0.5 * dp[m, None] / SEEK_RANGE)
        Dq = np.where(pred_mask, D, np.inf)
        jq = Dq.argmin(1)
        dq = Dq[ar, jq]
        m = dq < FLEE_RANGE
        if m.any():
            acc[m] -= FLEE * d[ar[m], jq[m]] / dq[m, None] * (1 - dq[m, None] / FLEE_RANGE)
        overlap = np.where(D < 2 * R, 2 * R - D, 0.0)
        with np.errstate(invalid="ignore"):
            acc -= REPEL * np.nan_to_num(overlap[:, :, None] * d / D[:, :, None]).sum(1)

        vel += acc * DT
        sp = np.linalg.norm(vel, axis=1, keepdims=True)
        vel *= np.clip(sp, VMIN, VMAX) / np.maximum(sp, 1e-9)
        pos += vel * DT
        for k, lo, hi in ((0, x0 + R, x1 - R), (1, y0 + R, y1 - R)):
            low, high = pos[:, k] < lo, pos[:, k] > hi
            pos[low, k] = lo
            pos[high, k] = hi
            vel[low, k] = np.abs(vel[low, k])
            vel[high, k] = -np.abs(vel[high, k])

        hit = ((D < TOUCH) & pred_mask).any(1)
        if hit.any():
            for i in np.nonzero(hit)[0]:
                events.append((frame + 1, int(i), int(typ[i]), int(PRED[typ[i]]),
                               float(pos[i, 0]), float(pos[i, 1])))
            typ = np.where(hit, PRED[typ], typ)
            if t_end is None and np.bincount(typ, minlength=3).max() == N:
                t_end = (frame + 1) * DT
        frame += 1

    return dict(seed=seed, t_end=t_end, events=events, counts=np.array(counts),
                pos=np.array(frames_pos) if record else None,
                typ=np.array(frames_typ) if record else None)


def summarize(seed):
    sim = simulate(seed, after=0.0, record=False)
    if sim is None:
        return seed, None
    c = sim["counts"]
    winner = int(c[-1].argmax())
    alive = (c > 0).sum(1)
    first_out = int(np.argmax(alive < 3))
    leaders, changes, prev = set(), 0, -1
    for row in c[: first_out]:
        top = row.max()
        if (row == top).sum() == 1:
            lead = int(row.argmax())
            leaders.add(lead)
            if prev >= 0 and lead != prev:
                changes += 1
            prev = lead
    return seed, dict(T=sim["t_end"], winner=winner, first_out=first_out * DT,
                      final_phase=sim["t_end"] - first_out * DT, changes=changes,
                      leaders=len(leaders), winner_min=int(c[: first_out, winner].min()),
                      peak=int(c[: first_out].max()),
                      peak_type=int(np.unravel_index(c[: first_out].argmax(), c[: first_out].shape)[1]))
