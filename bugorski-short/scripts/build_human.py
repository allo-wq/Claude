#!/usr/bin/env python3
"""Build realistic, rigged human characters from MakeHuman's CC0 data.

    .venv/bin/python scripts/build_human.py

Everything used here (base mesh, morph targets, skeleton, skin weights, face pose
units, eyes) was explicitly released as CC0 by the MakeHuman project in 2020. The
characters are synthetic people, not scans of anyone. MakeHuman's own Python code
(skeleton.py, bvh.py; AGPL-3.0) is imported at build time only, from a pinned clone in
the git-ignored vendor/, to build the skeleton and face poses exactly as MakeHuman does.

Output: assets/human/<name>.json + .bin (geometry, skeleton, weights, face units,
head-space landmarks) and assets/human/eye_brown.png.
"""
import json, os, shutil, subprocess, sys, warnings
import numpy as np

warnings.filterwarnings('ignore')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR = os.path.join(ROOT, 'vendor', 'makehuman')
MH_REPO = 'https://github.com/makehumancommunity/makehuman.git'
MH_COMMIT = 'a8bc2d54ff0ac92e78ff71431b1023eda42bf482'   # master, 2024-06-26
MH_COMMIT_NOTE = f'makehumancommunity/makehuman @ {MH_COMMIT[:10]}'
OUT = os.path.join(ROOT, 'assets', 'human')
SCALE = 0.1          # MakeHuman units are decimetres → metres
HEAD_UNIT = 0.112    # 1 "head unit" (the close-up studio's scale) in metres

CHARACTERS = {
    # Anatoli Bugorski in 1978: 36-year-old man, slim, average height.
    'bugorski': dict(age=36, muscle=0.56, weight=0.45, height=0.48, proportions=0.75,
                     targets={'head/head-oval.target': 0.35, 'chin/chin-prominent-incr.target': 0.25,
                              'nose/nose-hump-incr.target': 0.2, 'nose/nose-scale-vert-incr.target': 0.15,
                              'cheek/l-cheek-bones-incr.target': 0.3, 'cheek/r-cheek-bones-incr.target': 0.3,
                              'eyebrows/eyebrows-trans-down.target': 0.15, 'mouth/mouth-scale-horiz-decr.target': 0.1}),
    # The clinic doctor: older, heavier, rounder face (a different synthetic person).
    'doctor': dict(age=58, muscle=0.42, weight=0.66, height=0.46, proportions=0.5,
                   targets={'head/head-round.target': 0.4, 'head/head-fat-incr.target': 0.3,
                            'nose/nose-scale-horiz-incr.target': 0.3, 'nose/nose-point-width-incr.target': 0.3,
                            'chin/chin-width-incr.target': 0.3, 'eyebrows/eyebrows-angle-down.target': 0.3}),
}

FACE_UNITS = ['LeftUpperLidClosed', 'RightUpperLidClosed', 'LeftLowerLidUp', 'RightLowerLidUp',
              'LeftInnerBrowUp', 'RightInnerBrowUp', 'LeftOuterBrowUp', 'RightOuterBrowUp', 'LeftBrowDown', 'RightBrowDown',
              'LeftEyeturnLeft', 'LeftEyeturnRight', 'RightEyeturnLeft', 'RightEyeturnRight',
              'LeftEyeUp', 'RightEyeUp', 'LeftEyeDown', 'RightEyeDown',
              'LeftCheekUp', 'RightCheekUp', 'MouthLeftPullUp', 'MouthRightPullUp', 'MouthLeftPullDown', 'MouthRightPullDown',
              'MouthLeftPullSide', 'MouthRightPullSide', 'JawDrop', 'UpperLipUp', 'lowerLipDown', 'NasolabialDeepener']


# ───────────── MakeHuman data access ─────────────
def ensure_makehuman():
    data = os.path.join(VENDOR, 'makehuman', 'data')
    if not os.path.isdir(data):
        os.makedirs(os.path.dirname(VENDOR), exist_ok=True)
        print('cloning MakeHuman (CC0 assets + GPL code, used only at build time) …')
        for cmd in (['git', 'init', '-q', VENDOR], ['git', '-C', VENDOR, 'remote', 'add', 'origin', MH_REPO],
                    ['git', '-C', VENDOR, 'fetch', '-q', '--depth', '1', 'origin', MH_COMMIT], ['git', '-C', VENDOR, 'checkout', '-q', 'FETCH_HEAD']):
            subprocess.run(cmd, check=True)
    mh = os.path.join(VENDOR, 'makehuman')
    for p in ['lib', 'shared', 'apps', 'core', '']:
        sys.path.insert(0, os.path.join(mh, p))
    return mh


def load_obj(path):
    V, VT, faces = [], [], []
    group = None
    for line in open(path, encoding='utf-8'):
        if line.startswith('v '): V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '): VT.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('g '): group = line.split()[1]
        elif line.startswith('f '):
            vs, ts = [], []
            for tok in line.split()[1:]:
                parts = tok.split('/')
                vs.append(int(parts[0]) - 1)
                ts.append(int(parts[1]) - 1 if len(parts) > 1 and parts[1] else -1)
            faces.append((group, vs, ts))
    return np.array(V, np.float64), np.array(VT, np.float64) if VT else None, faces


_tcache = {}
def target(mh, rel):
    if rel not in _tcache:
        rows = [l.split() for l in open(os.path.join(mh, 'data', 'targets', rel), encoding='utf-8') if l.strip() and not l.startswith('#')]
        if rows:
            a = np.array(rows, np.float64)
            _tcache[rel] = (a[:, 0].astype(int), a[:, 1:4])
        else:
            _tcache[rel] = (np.zeros(0, int), np.zeros((0, 3)))
    return _tcache[rel]


def macro_weights(cfg):
    """Slider values → target weights, mirroring apps/human.py (_setAgeVals etc.)."""
    g = dict(male=1.0, female=0.0)
    age_y = cfg['age']
    a = (age_y - 1) / ((25 - 1) * 2) if age_y < 25 else (age_y - 25) / ((90 - 25) * 2) + 0.5
    if a < 0.5:
        ages = dict(old=0.0, baby=max(0.0, 1 - a * 5.333), young=max(0.0, (a - 0.1875) * 3.2))
        ages['child'] = max(0.0, min(1.0, 5.333 * a) - ages['young'])
    else:
        ages = dict(child=0.0, baby=0.0, old=max(0.0, a * 2 - 1)); ages['young'] = 1 - ages['old']
    def tri(v, lo, mid, hi):
        mx, mn = max(0.0, v * 2 - 1), max(0.0, 1 - v * 2)
        return {hi: mx, lo: mn, mid: 1 - (mx + mn)}
    mus = tri(cfg['muscle'], 'minmuscle', 'averagemuscle', 'maxmuscle')
    wei = tri(cfg['weight'], 'minweight', 'averageweight', 'maxweight')
    h = cfg['height']; hts = {'maxheight': max(0.0, h * 2 - 1), 'minheight': max(0.0, 1 - h * 2)}
    p = cfg['proportions']; prs = {'idealproportions': max(0.0, p * 2 - 1), 'uncommonproportions': max(0.0, 1 - p * 2)}
    eth = dict(caucasian=1.0, african=0.0, asian=0.0)
    out = []
    for gn, gv in g.items():
        for an, av in ages.items():
            if gv * av == 0: continue
            for en, ev in eth.items():
                if ev: out.append((f'macrodetails/{en}-{gn}-{an}.target', ev * gv * av))
            for mn, mv in mus.items():
                for wn, wv in wei.items():
                    base = gv * av * mv * wv
                    if base == 0: continue
                    out.append((f'macrodetails/universal-{gn}-{an}-{mn}-{wn}.target', base))
                    for hn, hv in hts.items():
                        if hv: out.append((f'macrodetails/height/{gn}-{an}-{mn}-{wn}-{hn}.target', base * hv))
                    for pn, pv in prs.items():
                        if pv: out.append((f'macrodetails/proportions/{gn}-{an}-{mn}-{wn}-{pn}.target', base * pv))
    return out


# ───────────── geometry helpers ─────────────
def triangulate(faces):
    tris = []
    for f in faces:
        for k in range(1, len(f) - 1): tris.append((f[0], f[k], f[k + 1]))
    return np.array(tris, np.int64)


def vertex_normals(P, tris):
    n = np.zeros_like(P)
    fn = np.cross(P[tris[:, 1]] - P[tris[:, 0]], P[tris[:, 2]] - P[tris[:, 0]])
    for k in range(3): np.add.at(n, tris[:, k], fn)
    return n / np.maximum(1e-12, np.linalg.norm(n, axis=1, keepdims=True))


def compact(tris, *arrays):
    """Remap a triangle list to only the vertices it uses."""
    used = np.unique(tris)
    remap = -np.ones(max(len(a) for a in arrays), np.int64); remap[used] = np.arange(len(used))
    return remap[tris], used, [a[used] for a in arrays]


def raycast(P, tris, origin, direction):
    """Möller–Trumbore against all triangles; returns nearest hit point or None."""
    v0, v1, v2 = P[tris[:, 0]], P[tris[:, 1]], P[tris[:, 2]]
    e1, e2 = v1 - v0, v2 - v0
    h = np.cross(direction, e2); a = (e1 * h).sum(1)
    ok = np.abs(a) > 1e-12
    f = np.where(ok, 1 / np.where(ok, a, 1), 0)
    s = origin - v0; u = f * (s * h).sum(1)
    q = np.cross(s, e1); v = f * (q @ direction); t = f * (e2 * q).sum(1)
    hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 1e-9)
    if not hit.any(): return None
    return origin + direction * t[hit].min()


def mask_from_target(mh, rels, n, power=1.0):
    m = np.zeros(n)
    for rel in rels:
        idx, off = target(mh, rel)
        mag = np.linalg.norm(off, axis=1)
        if len(mag): m[idx] = np.maximum(m[idx], mag / mag.max())
    return np.clip(m, 0, 1) ** power


def smooth_mask(m, tris, iters=2):
    """Laplacian-smooth a per-vertex scalar over the mesh."""
    n = len(m)
    for _ in range(iters):
        acc = np.zeros(n); cnt = np.zeros(n)
        for a, b in ((0, 1), (1, 2), (2, 0)):
            np.add.at(acc, tris[:, a], m[tris[:, b]]); np.add.at(cnt, tris[:, a], 1)
            np.add.at(acc, tris[:, b], m[tris[:, a]]); np.add.at(cnt, tris[:, b], 1)
        m = 0.5 * m + 0.5 * np.where(cnt > 0, acc / np.maximum(cnt, 1), m)
    return m


def bake_ao(P, nrm, targets, tris, maxd=0.06, nray=32):
    """Per-vertex ambient occlusion: cosine-weighted hemisphere rays against nearby triangles."""
    k = np.arange(nray) + 0.5
    r = np.sqrt(k / nray); th = np.pi * (1 + 5 ** 0.5) * k
    hemi = np.stack([r * np.cos(th), r * np.sin(th), np.sqrt(1 - r * r)], 1)
    v0 = P[tris[:, 0]]; e1 = P[tris[:, 1]] - v0; e2 = P[tris[:, 2]] - v0
    cen = v0 + (e1 + e2) / 3
    rad = np.sqrt(np.maximum((e1 ** 2).sum(1), (e2 ** 2).sum(1)))
    ao = np.ones(len(targets))
    for i, vi in enumerate(targets):
        p, n = P[vi], nrm[vi]
        near = np.nonzero(((cen - p) ** 2).sum(1) < (maxd + rad) ** 2)[0]
        if not len(near): continue
        t = np.cross(n, [0, 1, 0] if abs(n[1]) < 0.9 else [1, 0, 0]); t /= np.linalg.norm(t); b = np.cross(n, t)
        D = hemi[:, :1] * t + hemi[:, 1:2] * b + hemi[:, 2:3] * n
        o = p + n * 2e-4
        E1, E2, V0 = e1[near], e2[near], v0[near]
        h = np.cross(D[:, None, :], E2[None])
        a = (E1[None] * h).sum(-1)
        f = 1 / np.where(np.abs(a) > 1e-14, a, np.inf)
        sv = o - V0
        u = f * (sv[None] * h).sum(-1)
        q = np.cross(sv, E1)
        v = f * (D @ q.T)
        tt = f * (E2 * q).sum(-1)[None]
        hit = (u >= 0) & (v >= 0) & (u + v <= 1) & (tt > 1e-5) & (tt < maxd)
        tmin = np.where(hit, tt, np.inf).min(1)
        ao[i] = 1 - np.where(np.isfinite(tmin), 1 - tmin / maxd, 0).mean()
    return ao


# ───────────── packing ─────────────
class Pack:
    def __init__(self): self.buf = bytearray(); self.meta = {}

    def add(self, key, arr, dtype):
        a = np.ascontiguousarray(arr, dtype=dtype)
        while len(self.buf) % 4: self.buf.append(0)
        self.meta[key] = dict(offset=len(self.buf), count=int(a.size), dtype=np.dtype(dtype).name, shape=list(a.shape))
        self.buf += a.tobytes()


def build(name, cfg, mh, skeleton_mod, bvh_mod):
    V0, _, faces = load_obj(os.path.join(mh, 'data', '3dobjs', 'base.obj'))
    M = V0.copy()
    for rel, w in macro_weights(cfg) + list(cfg['targets'].items()):
        idx, off = target(mh, rel)
        if len(idx): M[idx] += off * w

    # ---- skeleton via MakeHuman's own code (decimetre space) ----
    class _Mesh:
        def __init__(s, c): s.coord = c
        def getCoords(s, i): return s.coord[i]
    class _Human:
        def __init__(s, c): s._c = c; s.meshData = _Mesh(c)
        def getRestposeCoordinates(s): return s._c
    human = _Human(M.astype(np.float32))
    import core
    core.G = type('G', (), {})(); core.G.app = type('A', (), {'selectedHuman': human})()
    sk = skeleton_mod.Skeleton()
    sk.fromFile(os.path.join(mh, 'data', 'rigs', 'default.mhskel'), mesh=None)
    sk.updateJoints(human)
    bones = sk.getBones()
    bone_names = [b.name for b in bones]
    bidx = {n: i for i, n in enumerate(bone_names)}

    # ground the feet at y=0 and convert to metres
    body_faces = [f[1] for f in faces if f[0] == 'body']
    body_v = np.unique(np.concatenate([np.array(f) for f in body_faces]))
    ground = M[body_v, 1].min()
    shift = np.array([0, -ground, 0])
    P = (M + shift) * SCALE

    rest = []
    for b in bones:
        m = np.array(b.matRestGlobal, np.float64).copy()
        m[:3, 3] = (m[:3, 3] + shift) * SCALE
        rest.append(m)

    # ---- skin weights (top 4) ----
    wfile = json.load(open(os.path.join(mh, 'data', 'rigs', 'default_weights.mhw'), encoding='utf-8'))['weights']
    per = [[] for _ in range(len(V0))]
    for bn, lst in wfile.items():
        if bn not in bidx: continue
        for v, w in lst: per[v].append((w, bidx[bn]))
    SI = np.zeros((len(V0), 4), np.uint16); SW = np.zeros((len(V0), 4), np.float32)
    dominant = np.zeros(len(V0), np.int64)
    for v, lst in enumerate(per):
        lst.sort(reverse=True); lst = lst[:4]
        tot = sum(w for w, _ in lst) or 1
        for k, (w, b) in enumerate(lst): SI[v, k] = b; SW[v, k] = w / tot
        dominant[v] = lst[0][1] if lst else 0
    dom_name = np.array([bone_names[i] for i in dominant])

    # ---- head space ----
    head_like = np.array([n == 'head' or n == 'jaw' or n.startswith(('special', 'levator', 'oris', 'orbicularis', 'temporalis', 'risorius', 'eye', 'tongue')) for n in dom_name])
    hv = np.intersect1d(body_v, np.nonzero(head_like)[0])
    lo, hi = P[hv].min(0), P[hv].max(0)
    center = np.array([0.0, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2])
    A = (P - center) / HEAD_UNIT                    # head-unit coordinates (character axes)

    body_tris = triangulate(body_faces)
    nrm = vertex_normals(P, body_tris)

    # ---- eyes fitted with the .mhclo reference weights (needed for AO too) ----
    eV, eVT, efaces = load_obj(os.path.join(mh, 'data', 'eyes', 'high-poly', 'high-poly.obj'))
    refs, scales, mode = [], {}, None
    for line in open(os.path.join(mh, 'data', 'eyes', 'high-poly', 'high-poly.mhclo'), encoding='utf-8'):
        s = line.split()
        if not s or s[0].startswith('#'): continue
        if s[0] in ('x_scale', 'y_scale', 'z_scale'): scales[s[0][0]] = (int(s[1]), int(s[2]), float(s[3])); continue
        if s[0] == 'verts': mode = 'verts'; continue
        if s[0] in ('weights', 'delete_verts'): mode = None; continue
        if mode == 'verts' and len(s) == 9: refs.append([float(t) for t in s])
    refs = np.array(refs)
    sc = np.array([abs(M[scales[a][0], k] - M[scales[a][1], k]) / scales[a][2] for k, a in enumerate('xyz')])
    vi = refs[:, :3].astype(int)
    eP = (M[vi[:, 0]] * refs[:, 3:4] + M[vi[:, 1]] * refs[:, 4:5] + M[vi[:, 2]] * refs[:, 5:6] + refs[:, 6:9] * sc + shift) * SCALE
    tri_v, tri_t = [], []
    for _, vs, ts in efaces:
        for k in range(1, len(vs) - 1):
            tri_v.append((vs[0], vs[k], vs[k + 1])); tri_t.append((ts[0], ts[k], ts[k + 1]))
    tri_v, tri_t = np.array(tri_v), np.array(tri_t)
    eN = vertex_normals(eP, tri_v)
    eye_center = {s_: (eP[eP[:, 0] * sg > 0].mean(0) - center) / HEAD_UNIT for s_, sg in (('L', 1), ('R', -1))}
    # the outer cornea shell is mapped to a transparent disk in the texture's corner
    tri_uv = eVT[tri_t].mean(1)
    is_cornea = (tri_uv[:, 0] > 0.8) & (tri_uv[:, 1] < 0.2)


    # ---- skin masks from MakeHuman's own feature targets ----
    n = len(V0)
    lips = mask_from_target(mh, ['mouth/mouth-upperlip-volume-incr.target', 'mouth/mouth-lowerlip-volume-incr.target'], n, 0.6)
    brows = mask_from_target(mh, ['eyebrows/eyebrows-trans-up.target'], n, 1.0)
    ears = mask_from_target(mh, ['ears/l-ear-scale-incr.target', 'ears/r-ear-scale-incr.target'], n, 0.8)
    nose = mask_from_target(mh, ['nose/nose-scale-horiz-incr.target'], n, 1.0)
    cheeks = mask_from_target(mh, ['cheek/l-cheek-volume-incr.target', 'cheek/r-cheek-volume-incr.target'], n, 1.0)
    jaw = mask_from_target(mh, ['chin/chin-width-incr.target', 'chin/chin-prominent-incr.target', 'mouth/mouth-philtrum-volume-incr.target'], n, 0.7)
    # brows: an arched band on the brow ridge above each eye (head units, mirrored)
    ax = np.abs(A[:, 0]); ey = eye_center['L'][1]
    tb = np.clip((ax - 0.07) / 0.5, 0, 1)                      # 0 at the inner end → 1 at the tail
    yc = ey + 0.165 + 0.045 * np.sin(np.pi * 0.5 * np.clip(tb / 0.65, 0, 1)) - 0.07 * np.clip((tb - 0.65) / 0.35, 0, 1)
    half = 0.05 * (1 - tb) + 0.022 * tb
    band = np.clip(1 - np.abs(A[:, 1] - yc) / half, 0, 1) ** 0.6
    ends = np.clip((ax - 0.06) / 0.05, 0, 1) * np.clip((0.6 - ax) / 0.06, 0, 1)
    bw = band * ends * (A[:, 2] > eye_center['L'][2] - 0.12) * head_like
    stubble = np.clip(jaw * 1.3 + cheeks * 0.5 * (A[:, 1] < -0.25), 0, 1) * (1 - lips) * (A[:, 1] < -0.15) * (A[:, 2] > -0.2)
    red = np.clip(cheeks * 0.8 + nose * 0.7 + ears * 0.9, 0, 1)
    # scalp coverage for hair (short side-parted 1970s cut), soft edge at the hairline
    z = A[:, 2]; ax = np.abs(A[:, 0])
    front = np.clip((z - 0.15) / 0.4, 0, 1)
    sideburn = np.clip((ax - 0.52) / 0.1, 0, 1) * np.exp(-((z - 0.1) / 0.14) ** 2)
    back = np.clip((-z - 0.15) / 0.45, 0, 1)
    yh_front = 0.62 + 0.1 * np.clip((ax - 0.25) / 0.3, 0, 1)        # slightly receding temples
    behind = np.clip((-z - 0.0) / 0.3, 0, 1)                             # behind the ear the hair comes lower
    yh_side = 0.12 - 0.4 * sideburn - 0.35 * behind
    hairline = front * yh_front + (1 - front) * (yh_side * (1 - back) + -0.66 * back)
    headish = head_like | np.array([nm.startswith('neck0') for nm in dom_name])
    earC = [A[np.nonzero(ears * (A[:, 0] * sg > 0) > 0.5)[0]].mean(0) for sg in (1, -1)]
    on_ear = np.zeros(len(A), bool)
    for ec in earC:   # the ear itself plus a 1 cm margin (ellipse in the side plane)
        on_ear |= (A[:, 0] * np.sign(ec[0]) > 0.5) & (((A[:, 1] - ec[1] - 0.02) / 0.36) ** 2 + ((A[:, 2] - ec[2]) / 0.22) ** 2 < 1)
    hair = np.clip((A[:, 1] - hairline) / 0.14, 0, 1) * headish * ~on_ear * (A[:, 1] > -0.85) * (np.abs(A[:, 0]) < 0.95)
    stack = [lips, bw, stubble, red, hair]
    stack = [smooth_mask(m, body_tris, 2) for m in stack]
    MASK = np.stack(stack[:4], 1)
    HAIR = stack[4]
    BROW = np.clip(stack[1] / max(1e-6, stack[1].max()) * 1.4, 0, 1)
    MASK[:, 1] = BROW
    # thin tissue that glows when back-lit (ears, nose wings) and the shiny T-zone
    thin = np.clip(ears * 1.4 + mask_from_target(mh, ['nose/nose-flaring-incr.target'], n, 1.0) * 0.5, 0, 1)
    tzone = np.exp(-A[:, 0] ** 2 / 0.05) * np.clip((A[:, 2] - 0.35) / 0.3, 0, 1) * (A[:, 1] > -0.45) * head_like
    thin, tzone = smooth_mask(thin, body_tris, 2), smooth_mask(tzone, body_tris, 2)

    # ---- baked ambient occlusion for visible skin, eyes and teeth ----
    teeth_t = triangulate([f[1] for f in faces if f[0] in ('helper-upper-teeth', 'helper-lower-teeth')])
    allP = np.concatenate([P, eP]); allN = np.concatenate([nrm, eN])
    occ = np.concatenate([body_tris, teeth_t, tri_v[~is_cornea] + len(P)])
    visible = np.array([n_.startswith(('head', 'jaw', 'neck', 'special', 'levator', 'oris', 'orbicularis', 'temporalis', 'risorius',
                                       'oculi', 'eye', 'tongue', 'wrist', 'finger', 'metacarpal', 'lowerarm02')) for n_ in dom_name])
    tv = np.unique(teeth_t)
    targets = np.concatenate([np.intersect1d(body_v, np.nonzero(visible)[0]), tv, np.arange(len(eP)) + len(P)])
    tn_ = allN.copy(); tn_[tv] = vertex_normals(P, teeth_t)[tv]
    ao_t = bake_ao(allP, tn_, targets, occ)
    AO = np.ones(len(allP)); AO[targets] = ao_t
    AO[:len(P)] = np.where(np.isin(np.arange(len(P)), targets), smooth_mask(AO[:len(P)], body_tris, 1), 1.0)
    MASK2 = np.stack([AO[:len(P)], thin, tzone, HAIR], 1)
    eAO = AO[len(P):]

    # ---- swelling morph (left cheek / lower eyelid / temple) ----
    lc = mask_from_target(mh, ['cheek/l-cheek-volume-incr.target'], n, 0.8)
    cen = np.average(A, axis=0, weights=lc + 1e-9)
    broad = np.exp(-np.sum((A - cen - np.array([0.02, 0.12, -0.05])) ** 2, 1) / 0.12) * (A[:, 0] > -0.05)
    swell = np.clip(0.75 * lc + 0.55 * broad, 0, 1)
    swell = smooth_mask(swell * head_like, body_tris, 3)
    SWELL = nrm * (swell * 0.024)[:, None]          # up to ~2.4 cm outward

    # ---- beam entry/exit on the real face ----
    nose_v = np.nonzero(mask_from_target(mh, ['nose/nose-flaring-incr.target'], n) > 0.5)[0]
    ala = A[nose_v[A[nose_v, 0] > 0]].mean(0) if len(nose_v) else np.array([0.1, -0.2, 0.95])
    hb = body_tris[np.all(head_like[body_tris], axis=1)]
    d = np.array([-0.03, -0.17, 1.0]); d /= np.linalg.norm(d)
    aim = np.array([ala[0] + 0.13, ala[1] + 0.02, 5.0])
    front = raycast(A, hb, aim, np.array([0, 0, -1.0]))
    exit_p = front if front is not None else np.array([ala[0] + 0.13, ala[1], 0.9])
    entry_p = raycast(A, hb, exit_p - d * 6.0, d)

    ear_l = A[np.nonzero(ears * (A[:, 0] > 0) > 0.5)[0]].mean(0)
    ear_r = A[np.nonzero(ears * (A[:, 0] < 0) > 0.5)[0]].mean(0)

    pack = Pack()
    meshes = {}

    def add_mesh(key, tris, pos, nrm_, extra=None, uv=None):
        t, used, (p_, n_, si, sw) = compact(tris, pos, nrm_, SI, SW)
        pack.add(f'{key}.index', t.reshape(-1), np.uint32)
        pack.add(f'{key}.position', p_, np.float32)
        pack.add(f'{key}.normal', n_, np.float32)
        pack.add(f'{key}.skinIndex', si, np.uint16)
        pack.add(f'{key}.skinWeight', sw, np.float32)
        for ek, ea in (extra or {}).items(): pack.add(f'{key}.{ek}', ea[used], np.float32)
        meshes[key] = dict(vertices=int(len(used)), triangles=int(len(t)))
        return used

    # ---- body ----
    add_mesh('body', body_tris, P, nrm, dict(aHead=A, aMask=MASK, aMask2=MASK2, swell=SWELL))
    # eyebrow patch (hair shells grow from it)
    brow_t = body_tris[np.all(BROW[body_tris] > 0.03, axis=1)]
    add_mesh('brows', brow_t, P, nrm, dict(aHead=A, aBrow=BROW[:, None], swell=SWELL))

    # ---- helpers: lashes, teeth, tongue ----
    def group_tris(*names):
        return triangulate([f[1] for f in faces if f[0] in names])
    # lashes: per-vertex (along the lid, root → tip, upper?) so the shader can draw separate hairs
    LASH = np.zeros((len(P), 3))
    for g in ('helper-l-eyelashes-1', 'helper-l-eyelashes-2', 'helper-r-eyelashes-1', 'helper-r-eyelashes-2'):
        gv = np.unique(group_tris(g))
        d2 = ((P[gv][:, None, :] - P[hv][None, :, :]) ** 2).sum(-1).min(1) ** 0.5
        LASH[gv, 0] = (P[gv, 0] - P[gv, 0].min()) / np.ptp(P[gv, 0])
        LASH[gv, 1] = (d2 - d2.min()) / max(1e-9, np.ptp(d2))
        LASH[gv, 2] = 1.0 if g.endswith('-2') else 0.0
    tr = group_tris('helper-l-eyelashes-1', 'helper-l-eyelashes-2', 'helper-r-eyelashes-1', 'helper-r-eyelashes-2')
    add_mesh('lashes', tr, P, vertex_normals(P, tr), dict(aLash=LASH))
    for key, groups in (('teeth', ['helper-upper-teeth', 'helper-lower-teeth']), ('tongue', ['helper-tongue'])):
        tr = group_tris(*groups)
        add_mesh(key, tr, P, vertex_normals(P, tr), dict(ao=AO[:len(P), None]))

    # ---- clothes from the body-fitting helper shells ----
    tights = group_tris('helper-tights')
    # clothes never follow the head: tights vertices weighted to the upper neck/head borrow the weights
    # of the nearest lower-neck / chest vertex (collars, lapels and the coat edge then move as one)
    collar_ref = np.intersect1d(body_v, np.nonzero(np.array([nm in ('neck01', 'spine01', 'spine02') or nm.startswith(('clavicle', 'breast'))
                                                            for nm in dom_name]))[0])
    tv_all = np.unique(tights)
    high = tv_all[np.isin(dom_name[tv_all], ['neck02', 'neck03', 'head', 'jaw'])]
    if len(high):
        nn_ = collar_ref[np.argmin(((P[collar_ref][None, :, :] - P[high][:, None, :]) ** 2).sum(-1), axis=1)]
        SI[high] = SI[nn_]; SW[high] = SW[nn_]
    tn = vertex_normals(P, tights)
    y = P[:, 1]
    j = {b.name: (np.array(b.headPos) + shift) * SCALE for b in bones}
    waist = j['spine04'][1] + 0.02
    ankle = j['foot.L'][1] + 0.04
    knee = j['lowerleg01.L'][1]
    y0 = j['neck01'][1] - 0.004          # collar line: the base of the neck
    neck_base = y0 + 0.012
    legs = np.array([nm.startswith(('upperleg', 'lowerleg', 'pelvis')) or nm == 'root' for nm in dom_name])
    arms_torso = np.array([nm.startswith(('spine', 'clavicle', 'shoulder', 'upperarm', 'lowerarm', 'breast', 'neck', 'pelvis')) or nm == 'root' for nm in dom_name])
    def sel(tris, cond):
        return tris[np.all(cond[tris], axis=1)]
    # trousers
    tr = sel(tights, legs & (y < waist + 0.03) & (y > j['foot.L'][1] - 0.035))
    TP = P + tn * 0.006
    for sgn, sd in ((1, 'L'), (-1, 'R')):
        axis = [j[f'upperleg01.{sd}'], j[f'lowerleg01.{sd}'], j[f'foot.{sd}']]
        tv_ = np.unique(tr); tv_ = tv_[P[tv_, 0] * sgn > 0]
        for vi_ in tv_:
            p_ = TP[vi_]; best = None
            for a_, b_ in zip(axis[:-1], axis[1:]):
                ab = b_ - a_; t_ = np.clip(np.dot(p_ - a_, ab) / np.dot(ab, ab), 0, 1); c_ = a_ + ab * t_
                if best is None or np.linalg.norm(p_ - c_) < np.linalg.norm(p_ - best): best = c_
            r_ = p_ - best; r_[1] = 0; rl = np.linalg.norm(r_)
            if rl < 1e-6: continue
            k_ = np.clip((knee + 0.12 - p_[1]) / 0.2, 0, 1)            # 0 above the knee → 1 below it
            want = 0.064 + 0.006 * np.clip((knee - p_[1]) / (knee - ankle), 0, 1)
            TP[vi_] = best + np.array([0, p_[1] - best[1], 0]) + r_ / rl * max(rl, (1 - k_) * rl + k_ * want)
    low = np.unique(tr); low = low[TP[low, 1] < ankle + 0.06]
    TP[low, 1] -= 0.035 * np.clip((ankle + 0.06 - TP[low, 1]) / 0.06, 0, 1)
    add_mesh('trousers', tr, TP, vertex_normals(TP, tr))
    # shirt (torso + sleeves) — only visible through the coat's V-neck
    on_neck = np.array([nm.startswith('neck') for nm in dom_name])
    torso_src = sel(tights, arms_torso & (y > waist - 0.06))
    shirt = torso_src[~np.any((on_neck | (y > y0 + 0.012))[torso_src], axis=1)]       # collar covers the cut
    add_mesh('shirt', shirt, P + tn * 0.004, tn)
    # lab coat: torso + sleeves with a V-neck opening
    x, zz = P[:, 0], P[:, 2]
    vbot = neck_base - 0.15
    VTOP = 0.085
    vhalf = np.clip((y - vbot) / (neck_base - vbot), 0, 1) * VTOP
    in_v = (np.abs(x) < vhalf) & (zz > center[2] + 0.0) & (y > vbot) & (tn[:, 2] > 0.35)   # chest front only
    # Cut the coat with straight edges: triangles fully inside a removed region go; triangles that
    # straddle the edge get private copies of their removed vertices, snapped onto the edge.
    CA = dict(p=P + tn * 0.013, n=tn.copy(), si=SI.copy(), sw=SW.copy())
    def cut_snap(tris, remove, snap):
        tris = tris[~np.all(remove[tris], axis=1)].copy()
        new_i = {}
        add_p, add_src = [], []
        for ti in np.nonzero(np.any(remove[tris], axis=1))[0]:
            tri = tris[ti]
            keep_pts = CA['p'][tri[~remove[tri]]]
            for k in range(3):
                v = tri[k]
                if not remove[v]: continue
                q_ = snap(CA['p'][v].copy(), keep_pts)
                key_ = (v, tuple(np.round(q_, 5)))
                if key_ not in new_i:
                    new_i[key_] = len(CA['p']) + len(add_p); add_p.append(q_); add_src.append(v)
                tris[ti, k] = new_i[key_]
        if add_p:
            src = np.array(add_src)
            CA['p'] = np.concatenate([CA['p'], np.array(add_p)])
            for k_ in ('n', 'si', 'sw'): CA[k_] = np.concatenate([CA[k_], CA[k_][src]])
        return tris
    def grow(mask):
        return np.concatenate([mask, np.zeros(len(CA['p']) - len(mask), bool)])
    y_cut = y0 + 0.002
    coat = cut_snap(torso_src, (y > y_cut), lambda q, kp: np.array([q[0], y_cut, q[2]]))
    cpx, cpy, cpz = CA['p'][:, 0], CA['p'][:, 1], CA['p'][:, 2]
    vmask = (np.abs(cpx) < np.clip((cpy - vbot) / (neck_base - vbot), 0, 1) * VTOP) & (cpz > center[2]) & (cpy > vbot) & (CA['n'][:, 2] > 0.35)
    def snap_v(q, kp):
        side = 1.0 if kp[:, 0].mean() > 0 else -1.0
        q[0] = side * np.clip((q[1] - vbot) / (neck_base - vbot), 0, 1) * VTOP
        return q
    coat = cut_snap(coat, vmask, snap_v)
    t_, used_, (cp_, cn_, csi_, csw_) = compact(coat, CA['p'], CA['n'], CA['si'], CA['sw'])
    pack.add('coat.index', t_.reshape(-1), np.uint32)
    pack.add('coat.position', cp_, np.float32); pack.add('coat.normal', cn_, np.float32)
    pack.add('coat.skinIndex', csi_, np.uint16); pack.add('coat.skinWeight', csw_, np.float32)
    meshes['coat'] = dict(vertices=int(len(used_)), triangles=int(len(t_)))
    # the coat's clean top edge (for the collar): snapped vertices at y_cut, as (angle, radius) around the neck
    edge_pts = CA['p'][len(P):][np.abs(CA['p'][len(P):, 1] - y_cut) < 1e-6]
    coat_full_pos = P + tn * 0.013
    # coat tails from the skirt helper (waist → just below the knee)
    sk_t = group_tris('helper-skirt')
    sn = vertex_normals(P, sk_t)
    skirt = sel(sk_t, (y < waist + 0.04) & (y > knee - 0.08))
    # a coat hangs from the hips: blend the tails' weights toward the root, fading to the legs at the hem
    SIc, SWc = SI.copy(), SW.copy()
    rb = bidx['root']
    for v in np.unique(skirt):
        fr = 1.0 - 0.85 * np.clip((waist - y[v]) / (waist - knee + 0.08), 0, 1) ** 0.5
        ws = {}
        for k in range(4): ws[int(SI[v, k])] = ws.get(int(SI[v, k]), 0) + SW[v, k] * (1 - fr)
        ws[rb] = ws.get(rb, 0) + fr
        top = sorted(ws.items(), key=lambda kv: -kv[1])[:4]
        tot = sum(w for _, w in top)
        SIc[v] = 0; SWc[v] = 0
        for k, (b_, w_) in enumerate(top): SIc[v, k] = b_; SWc[v, k] = w_ / tot
    # loose A-line: flare outward from the hip axis, more toward the hem
    SKP = P + sn * 0.012
    hipz = (j['upperleg01.L'][2] + j['upperleg01.R'][2]) / 2
    for v in np.unique(skirt):
        tt = np.clip((waist - y[v]) / (waist - knee + 0.08), 0, 1)
        d_ = np.array([SKP[v, 0], 0, SKP[v, 2] - hipz]); dl = np.linalg.norm(d_)
        if dl > 1e-6: SKP[v] += d_ / dl * (0.006 + 0.07 * tt ** 1.2)
    t_, used_, (sp_, sn2_, ssi_, ssw_) = compact(skirt, SKP, vertex_normals(SKP, skirt), SIc, SWc)
    pack.add('coattails.index', t_.reshape(-1), np.uint32)
    pack.add('coattails.position', sp_, np.float32); pack.add('coattails.normal', sn2_, np.float32)
    pack.add('coattails.skinIndex', ssi_, np.uint16); pack.add('coattails.skinWeight', ssw_, np.float32)
    meshes['coattails'] = dict(vertices=int(len(used_)), triangles=int(len(t_)))
    # shoes
    feet = np.array([nm.startswith(('foot', 'toe')) for nm in dom_name])
    # shoes: a swept shell sized from each foot (heel → toe), flat sole, closed cuff above the ankle
    shoe_pts, shoe_tris, shoe_ref = [], [], []
    NS, NR = 26, 28
    for sgn in (1, -1):
        fv = np.intersect1d(body_v, np.nonzero(feet & (P[:, 0] * sgn > 0))[0])
        heel = P[fv][np.argmin(P[fv, 2])]; toe = P[fv][np.argmax(P[fv, 2])]
        ax_ = (toe - heel) * np.array([1, 0, 1]); Lf = np.linalg.norm(ax_); ax_ /= Lf
        lat = np.cross([0, 1, 0], ax_)                     # sideways (unit, horizontal)
        tv_ = ((P[fv] - heel) @ ax_) / Lf
        prof = []
        for t in np.linspace(0, 1, NS):
            m_ = np.abs(tv_ - t) < 0.06
            if not m_.any(): m_ = np.abs(tv_ - t) < 0.12
            off = (P[fv[m_]] - heel) @ lat
            prof.append([off.min(), off.max(), P[fv[m_], 1].max()])
        prof = np.array(prof)
        for k in range(3):                                   # smooth the profile
            prof[1:-1] = (prof[:-2] + 2 * prof[1:-1] + prof[2:]) / 4
        base = len(shoe_pts)
        ts = np.linspace(0, 1, NS)
        for i, t in enumerate(ts):
            lo_, hi_, ht = prof[i]
            cap = np.sin(np.pi * np.clip(t / 0.06, 0, 1) / 2) * np.sin(np.pi * np.clip((1 - t) / 0.1, 0, 1) / 2) ** 0.6
            wl, wr = (lo_ - 0.008) * cap, (hi_ + 0.008) * cap
            mid = (lo_ + hi_) / 2 * cap
            top = max(ht + 0.01, 0.035) if t > 0.35 else max(ht + 0.01, 0.115)   # cuff covers the ankle
            top = 0.001 + (top - 0.001) * max(cap, 0.15)
            c = heel + ax_ * (t * Lf - 0.006 + 0.012 * t)
            for jr in range(NR):
                ph = 2 * np.pi * jr / NR
                cs, sn = np.cos(ph), np.sin(ph)
                lx = mid + (wr - mid if cs > 0 else mid - wl) * np.sign(cs) * abs(cs) ** 0.55
                ly = 0.001 + (top - 0.001) * (0.5 + 0.5 * np.sign(sn) * abs(sn) ** 0.45)
                pt = np.array([c[0], 0, c[2]]) + lat * lx + np.array([0, ly, 0])
                shoe_pts.append(pt)
        for i in range(NS - 1):
            for jr in range(NR):
                j2 = (jr + 1) % NR
                a0, a1, b0, b1 = base + i * NR + jr, base + i * NR + j2, base + (i + 1) * NR + jr, base + (i + 1) * NR + j2
                shoe_tris += [(a0, a1, b0), (a1, b1, b0)]
        shoe_ref.append(fv)
    SPt = np.array(shoe_pts); STr = np.array(shoe_tris)
    fvs = np.concatenate(shoe_ref)
    near = fvs[np.argmin(((P[fvs][None, :, :] - SPt[:, None, :]) ** 2).sum(-1), axis=1)]
    pack.add('shoes.index', STr.reshape(-1), np.uint32)
    pack.add('shoes.position', SPt, np.float32); pack.add('shoes.normal', vertex_normals(SPt, STr), np.float32)
    pack.add('shoes.skinIndex', SI[near], np.uint16); pack.add('shoes.skinWeight', SW[near], np.float32)
    meshes['shoes'] = dict(vertices=len(SPt), triangles=len(STr))
    # ---- collars, lapels and tie: procedural strips skinned like the nearest body vertex ----
    shirt_pos = P + tn * 0.004
    coat_pos = P + tn * 0.013
    neckish = np.array([nm.startswith(('neck', 'spine01', 'clavicle')) for nm in dom_name])
    # collars/lapels copy weights only from torso/neck vertices (never the arms: they'd swing with them)
    ref_v = collar_ref
    def add_grid(key, G, closed=False):
        R_, C_ = G.shape[:2]
        pts = G.reshape(-1, 3)
        tris = []
        for r in range(R_ - 1):
            for c in range(C_ if closed else C_ - 1):
                c2 = (c + 1) % C_
                a0, a1, b0, b1 = r * C_ + c, r * C_ + c2, (r + 1) * C_ + c, (r + 1) * C_ + c2
                tris += [(a0, b0, a1), (a1, b0, b1)]
        tris = np.array(tris)
        near = ref_v[np.argmin(((P[ref_v][None, :, :] - pts[:, None, :]) ** 2).sum(-1), axis=1)]
        pack.add(f'{key}.index', tris.reshape(-1), np.uint32)
        pack.add(f'{key}.position', pts, np.float32); pack.add(f'{key}.normal', vertex_normals(pts, tris), np.float32)
        pack.add(f'{key}.skinIndex', SI[near], np.uint16); pack.add(f'{key}.skinWeight', SW[near], np.float32)
        meshes[key] = dict(vertices=len(pts), triangles=len(tris))
    shirt_full = sel(tights, arms_torso & (y > waist - 0.06))
    def on_surface(surf, tris, xy_or_dir, origin=None):
        """Raycast onto a surface: either straight back from the front (x, y) or inward from origin."""
        if origin is None:
            h = raycast(surf, tris, np.array([xy_or_dir[0], xy_or_dir[1], 1.5]), np.array([0, 0, -1.0]))
        else:
            h = raycast(surf, tris, origin, xy_or_dir)
        return h
    nk = np.intersect1d(body_v, np.nonzero(on_neck & (np.abs(y - y0) < 0.015))[0])
    ncx, ncz = 0.0, (P[nk, 2].min() + P[nk, 2].max()) / 2
    nrx, nrz = np.abs(P[nk, 0]).max(), (P[nk, 2].max() - P[nk, 2].min()) / 2
    def ring(th, yy, grow):
        return np.array([ncx + (nrx + grow) * np.sin(th), yy, ncz + (nrz + grow) * np.cos(th)])
    def outside(pt, surf, tris, gap):
        """Keep a flap point at least `gap` above a surface (nearest-vertex normal push)."""
        sv_ = np.unique(tris)
        k_ = sv_[np.argmin(((surf[sv_] - pt) ** 2).sum(1))]
        nn_ = vertex_normals(surf, tris)[k_]
        d_ = np.dot(pt - surf[k_], nn_)
        return pt if d_ >= gap else pt + nn_ * (gap - d_)
    def frontness(th):
        w = np.angle(np.exp(1j * th))
        return np.exp(-w * w / 0.3)
    # shirt collar: stand band + a narrow turned-down band whose points spread over the chest
    ths = np.linspace(0.13, 2 * np.pi - 0.13, 49)
    rows_c = [[ring(t, y0 - 0.006 + 0.038 * k / 3, 0.006 - 0.002 * k / 3) for t in ths] for k in range(4)]
    for k in range(1, 4):
        u_ = k / 3
        row = []
        for t in ths:
            f = frontness(t)
            row.append(ring(t, y0 + 0.033 - (0.038 + 0.03 * f) * u_, 0.009 + (0.006 + 0.02 * f) * u_))
        rows_c.append(row)
    add_grid('collar', np.array(rows_c))
    # lab coat collar: rises from the coat's clean top edge, leans in to the neck, folds back down
    ang = np.arctan2(edge_pts[:, 0] - ncx, edge_pts[:, 2] - ncz)
    rad = np.hypot(edge_pts[:, 0] - ncx, (edge_pts[:, 2] - ncz) * nrx / nrz)    # in neck-ellipse units
    thc = np.linspace(1.1, 2 * np.pi - 1.1, 41)
    def edge_r(t):
        d = np.abs(np.angle(np.exp(1j * (ang - t))))
        w_ = np.exp(-(d / 0.18) ** 2) + 1e-9
        return (rad * w_).sum() / w_.sum()
    taper = np.sin(np.pi * (thc - thc[0]) / (thc[-1] - thc[0])) ** 0.5
    def ell(t, yy, rr):
        return np.array([ncx + rr * np.sin(t), yy, ncz + rr * nrz / nrx * np.cos(t)])
    rows_c = []
    for k in range(4):                              # stand: from the edge up, leaning in
        u_ = k / 3
        rows_c.append([ell(t, y_cut - 0.004 + 0.042 * u_ * tp, edge_r(t) + 0.004 - (edge_r(t) - nrx - 0.012) * u_ * 0.8) for t, tp in zip(thc, taper)])
    for k in range(1, 4):                           # fall: folds back down over the stand
        u_ = k / 3
        rows_c.append([ell(t, y_cut + 0.04 * tp - 0.05 * u_ * tp, nrx + 0.016 + (edge_r(t) - nrx + 0.004) * u_) for t, tp in zip(thc, taper)])
    add_grid('coatcollar', np.array(rows_c))
    # lapels lie on a smooth quadratic fit of the coat front (no stair-steps from vertex snapping)
    cfront = np.unique(shirt_full)
    cfront = cfront[(tn[cfront, 2] > 0.3) & (np.abs(coat_pos[cfront, 0]) < 0.17) & (coat_pos[cfront, 1] > vbot - 0.08) & (coat_pos[cfront, 1] < neck_base + 0.01)]
    cx_, cy_ = coat_pos[cfront, 0], coat_pos[cfront, 1] - vbot
    Afit = np.stack([np.ones_like(cx_), cx_ ** 2, cy_, cy_ ** 2, cx_ ** 2 * cy_, cx_ ** 4], 1)
    coef = np.linalg.lstsq(Afit, coat_pos[cfront, 2], rcond=None)[0]
    resid = coat_pos[cfront, 2] - Afit @ coef
    lift = max(0.0, np.percentile(resid, 97))
    def on_front(xx, yy):
        yv = yy - vbot
        return np.array([xx, yy, np.array([1, xx ** 2, yv, yv ** 2, xx ** 2 * yv, xx ** 4]) @ coef + lift])
    for sgn, key in ((1, 'lapelL'), (-1, 'lapelR')):
        rows_ = []
        for t in np.linspace(0, 1, 14):
            yy = neck_base - 0.02 - (neck_base - 0.02 - vbot) * t
            vh = np.clip((yy - vbot) / (neck_base - vbot), 0, 1) * VTOP
            w = min(0.045 * (1 - t) ** 0.7 + 0.006, 0.125 - vh)
            row = []
            for k, xo in enumerate((vh - 0.008, vh + w * 0.5, vh + w)):
                row.append(on_front(sgn * xo, yy) + np.array([0, 0, 0.004 + 0.003 * (k == 1)]))
            rows_.append(row)
        add_grid(key, np.array(rows_))
    # tie: knot at the collar opening, blade down the shirt front
    rows = []
    ys = np.concatenate([np.linspace(y0 + 0.028, y0 - 0.01, 4), np.linspace(y0 - 0.016, vbot - 0.06, 16)])
    for i_, yy in enumerate(ys):
        knot = i_ < 4
        w = (0.017 - 0.005 * i_ / 3) if knot else 0.012 + 0.03 * ((y0 - 0.016 - yy) / (y0 - 0.016 - vbot + 0.06)) ** 1.2
        row = []
        for xx in (-w, 0.0, w):
            h = on_surface(shirt_pos, shirt_full, (xx, yy))
            base_ = h if h is not None else np.array([xx, yy, 0.1])
            row.append(base_ + np.array([0, 0, (0.011 if knot else 0.004) + 0.002 * (xx == 0.0)]))
        rows.append(row)
    add_grid('tie', np.array(rows))
    # scalp patch for the layered hair (only faces that carry hair)
    scalp = body_tris[np.any(HAIR[body_tris] > 0.02, axis=1)]
    add_mesh('scalp', scalp, P, nrm, dict(aHair=HAIR[:, None], aHead=A, swell=SWELL))

    # ---- eyes: split into per-corner vertices so each face keeps its own UV ----
    for key, sel_t in (('eyes', ~is_cornea), ('cornea', is_cornea)):
        tv3, tt3 = tri_v[sel_t], tri_t[sel_t]
        corner_p = eP[tv3.reshape(-1)]
        en = eN[tv3.reshape(-1)]
        side = np.where(corner_p[:, 0] > 0, bidx['eye.L'], bidx['eye.R'])
        esi = np.zeros((len(corner_p), 4), np.uint16); esi[:, 0] = side
        esw = np.zeros((len(corner_p), 4), np.float32); esw[:, 0] = 1
        pack.add(f'{key}.index', np.arange(len(corner_p), dtype=np.uint32), np.uint32)
        pack.add(f'{key}.position', corner_p, np.float32); pack.add(f'{key}.normal', en, np.float32)
        pack.add(f'{key}.uv', eVT[tt3.reshape(-1)], np.float32)
        pack.add(f'{key}.ao', eAO[tv3.reshape(-1)][:, None], np.float32)
        pack.add(f'{key}.skinIndex', esi, np.uint16); pack.add(f'{key}.skinWeight', esw, np.float32)
        meshes[key] = dict(vertices=len(corner_p), triangles=len(tv3))
    eye_l, eye_r = eye_center['L'], eye_center['R']

    # ---- face pose units (MakeHuman BVH → per-bone rotations in character axes) ----
    b = bvh_mod.load(os.path.join(mh, 'data', 'poseunits', 'face-poseunits.bvh'), convertFromZUp='auto')
    anim = b.createAnimationTrack(sk)
    names = json.load(open(os.path.join(mh, 'data', 'poseunits', 'face-poseunits.json'), encoding='utf-8'))['framemapping']
    data = np.array(anim.data).reshape(anim.nFrames, anim.nBones, 3, 4)
    import transformations as tm
    units = {}
    for u in FACE_UNITS:
        f = names.index(u)
        rot = {}
        for bi in range(anim.nBones):
            R = np.identity(4); R[:3, :3] = data[f, bi, :3, :3]
            if np.allclose(R[:3, :3], np.identity(3), atol=1e-5): continue
            w, qx, qy, qz = tm.quaternion_from_matrix(R)
            rot[bone_names[bi]] = [round(float(qx), 6), round(float(qy), 6), round(float(qz), 6), round(float(w), 6)]
        units[u] = rot

    meta = dict(
        name=name, source='MakeHuman base mesh, targets, rig and eyes (CC0, released 2020) — ' + MH_COMMIT_NOTE,
        config=cfg, units='metres', headUnit=HEAD_UNIT,
        bones=[dict(name=bn.name, parent=bidx[bn.parent.name] if bn.parent else -1, rest=[float(v) for v in rest[i].T.reshape(-1)])
               for i, bn in enumerate(bones)],
        head=dict(center=center.tolist(), bboxMin=((lo - center) / HEAD_UNIT).tolist(), bboxMax=((hi - center) / HEAD_UNIT).tolist(), entry=entry_p.tolist(), exit=exit_p.tolist(), beamDir=d.tolist(),
                  earL=ear_l.tolist(), earR=ear_r.tolist(), eyeL=eye_l.tolist(), eyeR=eye_r.tolist(), headBone='head'),
        joints={k: [float(c) for c in v] for k, v in j.items() if k in ('root', 'spine04', 'neck01', 'head', 'upperarm01.L', 'lowerarm01.L', 'wrist.L')},
        clothes=dict(neckBase=float(neck_base), vbot=float(vbot), waist=float(waist), knee=float(knee)),
        meshes=meshes, faceUnits=units, arrays=pack.meta,
    )
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, f'{name}.bin'), 'wb') as fh: fh.write(bytes(pack.buf))
    with open(os.path.join(OUT, f'{name}.json'), 'w', encoding='utf-8') as fh: json.dump(meta, fh, separators=(',', ':'))
    print(f'{name}: {meshes["body"]["vertices"]} body verts, {len(bones)} bones, height {P[body_v, 1].max():.3f} m, '
          f'{len(pack.buf) / 1e6:.2f} MB; entry {np.round(entry_p, 2)} exit {np.round(exit_p, 2)}')


def main():
    mh = ensure_makehuman()
    cwd = os.getcwd(); os.chdir(mh)
    import skeleton, bvh  # MakeHuman's own modules
    os.chdir(cwd)
    for name, cfg in CHARACTERS.items():
        os.chdir(mh)
        try:
            build(name, cfg, mh, skeleton, bvh)
        finally:
            os.chdir(cwd)
    shutil.copy(os.path.join(mh, 'data', 'eyes', 'materials', 'brown_eye.png'), os.path.join(OUT, 'eye_brown.png'))
    lic = os.path.join(VENDOR, 'LICENSE.CC0.md')
    for cand in ('LICENSE.ASSETS.md', 'LICENSE.CC0.md', 'license.txt'):
        if os.path.exists(os.path.join(VENDOR, cand)): shutil.copy(os.path.join(VENDOR, cand), os.path.join(OUT, 'LICENSE-MakeHuman-CC0.txt')); break


if __name__ == '__main__':
    main()
