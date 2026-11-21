--[[
    SideswipeBot 1.0  -  practice bot for Sideswipe Soccer

      F6  toggle bot        F7  unload        F8  compact / detailed panel
      Press any movement key or use a gamepad and you take over; let go and
      the bot picks back up.

    Offline only: the bot drives only in the game's local simulation
    (freeplay, training and offline games). In online matches it stands down
    and leaves your controls alone.

    The file has two halves:
      createBrain(World, Tuning, options)  pure decision logic; needs only the
                                           game's World/Tuning modules, so it
                                           also runs headless against a mock
      host                                 Roblox glue: input hook, panel, keys
]]

local VERSION = "1.0.0"

local CONFIG = {
    plannerInterval = 0.10, -- world seconds between full rollout searches
    planMinGap      = 0.08, -- never plan twice inside this window
    frameBudgetMs   = 1.5,  -- hard CPU cap per decision
    forecastSliceMs = 0.45, -- CPU per decision spent extending the ball forecast
    forecastHorizon = 1.6,  -- seconds of untouched ball flight to forecast
    forecastStride  = 4,    -- physics substeps between stored forecast samples
    forecastRefresh = 0.30, -- re-forecast at least this often (world seconds)
    forecastMinGap  = 0.04, -- ...but never more often than this
    divergePos      = 1.0,  -- studs of forecast error that forces a re-forecast
    divergeVel      = 6.0,  -- studs/s of forecast error that forces a re-forecast
    roleHold        = 0.06, -- minimum dwell before a non-urgent role change
    pressCooldown   = 0.16, -- seconds between jump/dodge presses
    letItScore      = true, -- don't touch a ball that is already going in
    manualOverride  = true, -- your keyboard/gamepad input takes over
    manualGrace     = 0.45, -- seconds you keep control after letting go
    traceSize       = 240,  -- decisions kept for ExportTrace()
    maxErrors       = 6,    -- errors inside errorWindow before unloading
    errorWindow     = 3,
}

-----------------------------------------------------------------------------
-- Brain
-----------------------------------------------------------------------------
local function createBrain(World, Tuning, options)
    options = options or {}
    local cfg = {}
    for key, value in pairs(CONFIG) do cfg[key] = value end
    for key, value in pairs(options.config or {}) do cfg[key] = value end
    local clock = options.clock or os.clock

    local sqrt, abs, max, min, floor, huge = math.sqrt, math.abs, math.max, math.min, math.floor, math.huge
    local S, UU = World.STUD_PER_M, Tuning.UU_PER_STUD
    local Settings, CarTuning = Tuning.Settings, Tuning.Car
    local DT = 1 / 120
    local EMPTY = {}

    local B = { status = "waiting", role = "idle", config = cfg, tested = 0, lastSearchMs = 0,
        decisionMs = 0, resetCount = 0, forecastRefreshes = 0, divergences = 0, forecastHorizon = 0 }

    -------------------------------------------------------------- math ----
    local function clamp(x, a, b) return max(a, min(b, x)) end
    local function length(x, y) return sqrt(x * x + y * y) end
    local function unit(x, y)
        local n = length(x, y)
        if n < 1e-8 then return 0, 0 end
        return x / n, y / n
    end

    local function action(x, y, boost, press, held, name)
        x, y = x or 0, y or 0
        if x ~= x then x = 0 end -- NaN never reaches the controls
        if y ~= y then y = 0 end
        local n = length(x, y)
        if n > 1 then x, y = x / n, y / n end
        return { x = x, y = y, boost = boost == true, press = press == true,
            held = held == true, name = name or "intercept" }
    end
    local function copyAction(a) return action(a.x, a.y, a.boost, a.press, a.held, a.name) end
    -- A pop or flip needs a jump, a dodge and the shared charge.
    local function canPop(c) return (c.combined or 0) > 0 and (c.jumps or 0) > 0 and (c.dodges or 0) > 0 end

    -------------------------------------------------------- perception ----
    local function goalOf(g)
        return { x = g.tx / UU, y = g.tz / UU, lo = g.minZ / UU, hi = g.maxZ / UU,
            left = g.minX / UU, right = g.maxX / UU }
    end
    local function teamOf(state, slot)
        local record = state.roster and state.roster[slot]
        return record and record.team or (slot % 2 == 1 and 1 or 2)
    end
    -- Everything below works in studs, seconds, studs/s.
    local function sample(world, slot, state)
        local c = world.cars[slot]
        if not c or not c.body.active then return nil end
        local team = teamOf(state, slot)
        local own, enemy = world.arena.goals[team], world.arena.goals[3 - team]
        if not own or not enemy then return nil end
        local fx, fy, ux, uy = World.Vehicle.axes(c)
        local body, ball = c.body, world.ball
        local v = { c = c, x = body.x * S, y = body.y * S, vx = body.vx * S, vy = body.vy * S,
            bx = ball.x * S, by = ball.y * S, bvx = ball.vx * S, bvy = ball.vy * S,
            r = world.ballR / UU, fx = fx, fy = fy, ux = ux, uy = uy, boost = c.boost or 0,
            own = goalOf(own), enemy = goalOf(enemy), team = team,
            grounded = c.grounded or c.partial, others = {} }
        v.sign = v.enemy.x > v.own.x and 1 or -1
        for i, other in ipairs(world.cars) do
            if i ~= slot and other.body.active then
                local ob = other.body
                v.others[#v.others + 1] = { team = teamOf(state, i), x = ob.x * S, y = ob.y * S,
                    vx = ob.vx * S, vy = ob.vy * S, boost = other.boost or 0,
                    grounded = other.grounded or other.partial,
                    fx = ob.qc * other.fs, fy = ob.qs * other.fs }
            end
        end
        return v
    end

    -- One gravity for every ball prediction (respects low-gravity mutators).
    local function ballGravity(live)
        local mut = live.mut or EMPTY
        local ballScale = live.B and live.B.gravityScale or 0.9
        return Tuning.World.gravity * (mut.gravityScale or 1) * ballScale * (mut.ballGravityScale or 1) * S
    end

    -------------------------------------------------------- kinematics ----
    -- Seconds for an actor to cover (dx, dy), using the game's drive/boost tuning.
    local function travelTime(actor, dx, dy, reach)
        local nx, ny = unit(dx, dy)
        local distance = max(0, length(dx, dy) - (reach or 0))
        local boosted = actor.unlimited or (actor.boost or 0) > 5
        local cap = (boosted and Settings.maxBoostSpeed or CarTuning.maxDriveSpeed) / UU
        local accel = (actor.grounded and CarTuning.moveForceScaler * 0.65
            or (boosted and Settings.boostForceScale or 2.5)) * S
        local speed = clamp(actor.vx * nx + actor.vy * ny, -cap, cap)
        local accelTime = max(0, (cap - speed) / accel)
        local accelDistance = speed * accelTime + 0.5 * accel * accelTime * accelTime
        local t
        if distance > accelDistance then
            t = accelTime + (distance - accelDistance) / cap
        else
            t = (-speed + sqrt(max(0, speed * speed + 2 * accel * distance))) / accel
        end
        if not actor.grounded and (actor.fx or 0) * nx + (actor.fy or 0) * ny < 0 then t = t + 0.12 end
        if actor.grounded and dy > 8 and not boosted then t = t + min(0.6, dy / 45) end
        return t
    end
    -- Straight-line fallback when no forecast is available.
    local function arrival(actor, v)
        local estimate = 0
        for _ = 1, 3 do
            local lead = min(estimate, 1.2)
            estimate = travelTime(actor, v.bx + v.bvx * lead - actor.x, v.by + v.bvy * lead - actor.y, v.r + 2.2)
        end
        return estimate
    end

    local function rayHits(v, dx, dy, range)
        local rx, ry = v.bx - v.x, v.by - v.y
        local along = rx * dx + ry * dy
        local across = abs(rx * dy - ry * dx)
        return along > 0 and along <= range + v.r and across < v.r * 0.82
    end

    -- Pick the goal height whose shot line stays farthest from defenders.
    local AIM_FRACTIONS = { 0.25, 0.55, 0.82 }
    local function attackAim(v)
        local low, high = v.enemy.lo + v.r * 1.5, v.enemy.hi - v.r * 1.5
        if high < low then low, high = v.enemy.y, v.enemy.y end
        local span = v.enemy.x - v.bx
        if span == 0 then span = 0.01 end
        local lead = min(abs(span) / 65, 0.25)
        local bestY, bestScore = v.enemy.y, -huge
        for _, fraction in ipairs(AIM_FRACTIONS) do
            local y = low + (high - low) * fraction
            local score = 0
            for _, other in ipairs(v.others) do
                if other.team ~= v.team then
                    local px, py = other.x + other.vx * lead, other.y + other.vy * lead
                    local t = clamp((px - v.bx) / span, 0, 1)
                    if t > 0.1 then score = score + min(18, abs(py - (v.by + (y - v.by) * t))) end
                end
            end
            score = score - abs(y - v.by) * 0.08
            if score > bestScore then bestY, bestScore = y, score end
        end
        return v.enemy.x, bestY
    end

    ---------------------------------------------------- simulation clones ----
    local forecast, shotWorld, lastWorld, lastMutKey
    local lastMutCheck = -huge
    local snapshot -- World.serialize(live), taken at most once per decision
    local frameDeadline = huge

    local function getSnapshot(live)
        if not snapshot then snapshot = World.serialize(live) end
        return snapshot
    end
    local function mutKey(mut)
        local fields = {}
        for k, value in pairs(mut or EMPTY) do fields[#fields + 1] = tostring(k) .. "=" .. tostring(value) end
        table.sort(fields)
        return table.concat(fields, ";")
    end
    local function syncClone(copy, live, data)
        copy.t = live.t
        for i, c in ipairs(live.cars) do World.setCarPreset(copy, i, c.preset) end
        World.deserialize(copy, data)
        for i, c in ipairs(live.cars) do
            copy.cars[i].body.active = c.body.active
            copy.cars[i].events = {}
        end
        copy.events = {}
        copy.seekTeam, copy.seekSpeed, copy.seekCd = live.seekTeam, live.seekSpeed, live.seekCd
    end

    ------------------------------------------------------- ball forecast ----
    -- Ball-only simulation with the game's own physics, extended a slice per
    -- decision until the horizon is reached. Re-forecast immediately when the
    -- real ball diverges from it (someone touched it), so a touch is seen on
    -- the next frame instead of up to a planner cycle later.
    local fc = { points = {}, count = 0, steps = 0, startT = -huge, done = true, valid = false,
        goal = {}, loose = {}, strict = {}, r = 1, px = 0, py = 0 }
    local lastRefresh = -huge

    local function invalidateForecast()
        fc.valid, fc.done, fc.count, fc.startT = false, true, 0, -huge
    end
    local function inBox(g, x, y, m)
        return x > g.left - m and x < g.right + m and y > g.lo - m and y < g.hi + m
    end
    local function pushPoint(t, x, y, vx, vy)
        local n = fc.count + 1
        local p = fc.points[n]
        if not p then p = {}; fc.points[n] = p end
        p.t, p.x, p.y, p.vx, p.vy = t, x, y, vx, vy
        fc.count = n
    end
    local function startForecast(live, v, now)
        syncClone(forecast, live, getSnapshot(live))
        -- Future player touches can't be known, so the forecast is ball-only.
        for _, car in ipairs(forecast.cars) do car.body.active = false end
        fc.startT, fc.steps, fc.count, fc.done, fc.valid, fc.r = now, 0, 0, false, true, v.r
        fc.px, fc.py = v.bx, v.by
        pushPoint(0, v.bx, v.by, v.bvx, v.bvy)
        local goals = live.arena.goals
        for k = 1, 2 do
            fc.goal[k] = goals[k] and goalOf(goals[k]) or nil
            fc.loose[k], fc.strict[k] = nil, nil
        end
        lastRefresh = now
        B.forecastRefreshes = B.forecastRefreshes + 1
    end
    local function advanceForecast(deadline)
        if fc.done or not fc.valid then return end
        local stride = cfg.forecastStride
        local maxSteps = floor(cfg.forecastHorizon / DT + 0.5)
        local margin = fc.r * 0.4
        while fc.steps < maxSteps do
            World.substep(forecast, DT)
            local steps = fc.steps + 1
            fc.steps = steps
            local ball = forecast.ball
            local x, y, t = ball.x * S, ball.y * S, steps * DT
            if length(x - fc.px, y - fc.py) > max(8, fc.r * 3) then
                -- The clone teleported the ball: it scored and was reset.
                for k = 1, 2 do
                    local g = fc.goal[k]
                    if g and not fc.strict[k] and inBox(g, fc.px, fc.py, fc.r * 2) then
                        fc.strict[k] = t
                        fc.loose[k] = fc.loose[k] or t
                    end
                end
                fc.done = true
                return
            end
            local scored = false
            for k = 1, 2 do
                local g = fc.goal[k]
                if g then
                    if not fc.loose[k] and inBox(g, x, y, margin) then fc.loose[k] = t end
                    if not fc.strict[k] and inBox(g, x, y, -margin) then fc.strict[k] = t; scored = true end
                end
            end
            fc.px, fc.py = x, y
            if scored or steps % stride == 0 or steps >= maxSteps then
                pushPoint(t, x, y, ball.vx * S, ball.vy * S)
            end
            if scored then fc.done = true; return end
            if clock() >= deadline then return end
        end
        fc.done = true
    end
    -- Interpolated forecast state `age` seconds after the forecast started.
    local function forecastAt(age)
        local pts, n = fc.points, fc.count
        if n < 2 or pts[n].t < age then return nil end
        local i = 1
        while i < n - 1 and pts[i + 1].t < age do i = i + 1 end
        local a, b = pts[i], pts[i + 1]
        local span = b.t - a.t
        local f = span > 0 and clamp((age - a.t) / span, 0, 1) or 0
        return a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.vx + (b.vx - a.vx) * f, a.vy + (b.vy - a.vy) * f
    end
    local function updateForecast(live, v, now)
        local age = now - fc.startT
        local stale = not fc.valid or age < 0 or age > cfg.forecastRefresh
        if not stale then
            local px, py, pvx, pvy = forecastAt(age)
            if px and (length(px - v.bx, py - v.by) > cfg.divergePos
                or length(pvx - v.bvx, pvy - v.bvy) > cfg.divergeVel) then
                stale, fc.valid = true, false
                B.divergences = B.divergences + 1
            end
        end
        if stale and now - lastRefresh >= cfg.forecastMinGap then startForecast(live, v, now) end
        if fc.valid then advanceForecast(min(frameDeadline, clock() + cfg.forecastSliceMs / 1000)) end
    end
    local function forecastUsable(age)
        return fc.valid and fc.count >= 4 and fc.points[fc.count].t - age > 0.2
    end

    -- Earliest time `actor` can meet the forecast ball path (interpolated).
    -- With `limit`, returns nil if the path can't be met before it.
    local function pathArrival(actor, v, age, limit)
        local reach = v.r + 2.2
        if length(v.bx - actor.x, v.by - actor.y) <= reach then return 0 end
        local pts = fc.points
        local prevT, prevGap = 0, travelTime(actor, v.bx - actor.x, v.by - actor.y, reach)
        local lastT, lastNeed
        for i = 2, fc.count do
            local p = pts[i]
            local t = p.t - age
            if limit and t > limit then break end
            if t > 0 then
                local need = travelTime(actor, p.x - actor.x, p.y - actor.y, reach)
                local gap = need - t
                if gap <= 0 then
                    if prevGap > 0 then return prevT + (t - prevT) * prevGap / (prevGap - gap) end
                    return t
                end
                prevT, prevGap, lastT, lastNeed = t, gap, t, need
            end
        end
        if limit then return nil end
        return lastT and max(lastT, lastNeed) or nil
    end
    local function eta(actor, v, age, usePath)
        if usePath then
            local t = pathArrival(actor, v, age)
            if t then return t end
        end
        return arrival(actor, v)
    end
    -- Would our car (coasting) sit in the ball's lane before `horizon`?
    local function inLane(v, age, horizon)
        local reach = v.r + 4
        for i = 2, fc.count do
            local p = fc.points[i]
            local t = p.t - age
            if t > horizon then break end
            if t > 0 then
                local lead = min(t, 0.4)
                if length(p.x - (v.x + v.vx * lead), p.y - (v.y + v.vy * lead)) < reach then return true end
            end
        end
        return false
    end

    -- Ball heading into our goal? The forecast sees wall/ceiling rebounds;
    -- the analytic check stays as a conservative backstop.
    local function threat(v, age, gravity)
        if fc.valid then
            local strict, loose = fc.strict[v.team], fc.loose[v.team]
            if strict and strict - age > -0.05 and strict - age < 2.2 then return true, max(0, strict - age) end
            if loose and loose - age > -0.05 and loose - age < 2.2 and v.bvx * v.sign < -1 then
                return true, max(0, loose - age)
            end
        end
        if v.bvx * v.sign >= -1 then return false end
        local line = v.sign > 0 and v.own.right or v.own.left
        local t = (line - v.bx) / v.bvx
        if t <= 0 or t > 2.2 then return false end
        local y = v.by + v.bvy * t + 0.5 * gravity * t * t
        if (y < v.own.hi + v.r * 2 and y > v.own.lo - v.r * 3)
            or ((v.bx - v.own.x) * v.sign < 48 and v.by < v.own.hi + v.r * 2) then
            return true, nil -- analytic only: no trustworthy crossing time
        end
        return false
    end

    ------------------------------------------------------------ intercept ----
    local function contactPoint(v, px, py, aimX, aimY, defending)
        if defending then return px - v.sign * (v.r + 1.3), py end
        local dx, dy = unit(aimX - px, aimY - py)
        local offset = v.r + 2.1
        return px - dx * offset, max(1.4, py - dy * offset)
    end
    local function contactCost(v, x, y)
        local need = travelTime(v, x - v.x, y - v.y, 0)
        -- A high ball with no fuel is effectively out of reach from the ground.
        if v.grounded and y > v.y + 12 and v.boost < 8 and not v.unlimited then
            need = need + (y - v.y - 12) / 8
        end
        return need
    end
    -- Earliest point on the ball's path we can reach in time; if none is
    -- reachable, the point we come closest to reaching.
    local function interceptTarget(v, aimX, aimY, defending, age, usePath, gravity)
        local bestX, bestY, bestT, bestScore = nil, nil, 0, huge
        local first, last = 1, 14
        if usePath then first, last = 2, fc.count end
        for i = first, last do
            local px, py, t
            if usePath then
                local p = fc.points[i]
                px, py, t = p.x, p.y, p.t - age
            else
                t = i * 0.08
                px, py = v.bx + v.bvx * t, max(v.r, v.by + v.bvy * t + 0.5 * gravity * t * t)
            end
            if t >= 0.05 then
                local x, y = contactPoint(v, px, py, aimX, aimY, defending)
                local gap = contactCost(v, x, y) - t
                if gap <= 0.05 then return x, y, t end
                local score = gap + t * (defending and 0.05 or 0.1)
                if score < bestScore then bestX, bestY, bestT, bestScore = x, y, t, score end
            end
        end
        if bestX then return bestX, bestY, bestT end
        local x, y = contactPoint(v, v.bx, v.by, aimX, aimY, defending)
        return x, y, 0
    end

    -- Save: the earliest point on the forecast path, before the ball crosses
    -- our line, that we can reach from the goal side.
    local function saveTarget(v, age, crossT)
        for i = 2, fc.count do
            local p = fc.points[i]
            local t = p.t - age
            if t > crossT + 0.02 then break end
            if t >= 0.03 then
                local x, y = p.x - v.sign * (v.r + 1.3), max(2, p.y)
                if contactCost(v, x, y) <= t + 0.03 then return x, y, t end
            end
        end
        return nil
    end

    ------------------------------------------------------------- control ----
    local lastPress, lastPlan, lastMobility = -huge, -huge, -huge

    local function steering(v, tx, ty, defending)
        local dx, dy = tx - v.x, ty - v.y
        local distance = length(dx, dy)
        local grounded = v.grounded
        local closeBall = length(v.bx - v.x, v.by - v.y) < v.r + 7
        local liftShot = closeBall and (v.bx - v.x) * v.sign > 1 and v.by > v.y + 2 and v.by < v.y + 13
        local jump = grounded and ((dy > 4 and abs(dx) < max(10, dy * 1.5)) or liftShot)
        if jump and liftShot then dx, dy = v.sign * 5, max(dy, 8) end
        local x, y
        if grounded and not jump and ty < v.y + 7 then
            x, y = clamp(dx * 0.22 - v.vx * 0.027, -1, 1), 0
        else
            x, y = unit(dx * 3 - v.vx * 0.45, dy * 3 - v.vy * 0.5)
        end
        local alignment = v.fx * x + v.fy * y
        local boost = v.boost > (defending and 1 or 7) and alignment > 0.6
            and distance > 5 and not (grounded and y < -0.1)
        if distance < 8 and length(v.vx, v.vy) > distance * 4 then boost = false end
        return action(x, y, boost, jump, jump or (not grounded and v.vy > 0 and dy > 2),
            defending and "save" or "intercept")
    end

    local function shots(v, now, aimX, aimY, base, allowSpecial)
        local result = { base }
        local dx, dy = unit(aimX - v.bx, aimY - v.by)
        local rx, ry = unit(v.bx - v.x, v.by - v.y)
        local dist = length(v.bx - v.x, v.by - v.y)
        local attacks = rx * dx + ry * dy > 0.72 and rx * v.sign > 0.25
        local c = v.c
        local mayPress = now - lastPress >= cfg.pressCooldown and canPop(c)
        if not v.grounded and not c.flipping and dist < 15 and attacks then
            if allowSpecial then
                -- Gold: the dodge fires a ray out of the tail.
                if mayPress and rayHits(v, -v.fx, -v.fy, Settings.dodgeShotRange / UU) then
                    result[#result + 1] = action(-rx, -ry, false, true, false, "gold shot")
                end
                -- Purple: a neutral jump fires the ray out through the wheels.
                if mayPress and rayHits(v, -v.ux, -v.uy, Settings.jumpShotRange / UU) then
                    result[#result + 1] = action(0, 0, false, true, false, "purple shot")
                end
                -- Rotate the tail / wheels onto the ball while closing in.
                result[#result + 1] = action(-rx, -ry, false, false, false, "gold setup")
                result[#result + 1] = action(-ry * c.fs / c.us, rx * c.fs / c.us, false, false, false, "purple setup")
            end
            if mayPress and dist < v.r + 3.7 and v.fx * rx + v.fy * ry > 0.65 then
                result[#result + 1] = action(rx, ry, false, true, false, "power flip")
            end
        end
        result[#result + 1] = action(base.x, base.y, false, false, base.held, "controlled approach")
        return result
    end

    -- Value of the world a rollout ends in.
    local function score(copy, slot, state, original, tx, ty, defending)
        local v = sample(copy, slot, state)
        if not v then return -huge end
        local value = (v.bx - original.bx) * v.sign * (defending and 2.5 or 1.8) + v.bvx * v.sign * 0.18
        value = value - length(v.x - tx, v.y - ty) * 0.38
        -- Keep a usable position for the next touch.
        value = value - max(0, length(v.x - v.bx, v.y - v.by) - 14) * 0.35
        if not defending then
            value = value + v.vx * v.sign * 0.09
            value = value - max(0, (original.x - v.x) * v.sign) * 0.65
        end
        local goalY = clamp(v.by, v.enemy.lo + v.r, v.enemy.hi - v.r)
        value = value - abs(v.by - goalY) * 0.08 + v.boost * 0.025
        local ownEdge = v.sign > 0 and v.own.right or v.own.left
        local enemyEdge = v.sign > 0 and v.enemy.left or v.enemy.right
        if (v.bx - ownEdge) * v.sign < -v.r * 0.3 and v.by > v.own.lo and v.by < v.own.hi then value = value - 2000 end
        if (v.bx - enemyEdge) * v.sign > v.r * 0.3 and v.by > v.enemy.lo and v.by < v.enemy.hi then value = value + 2000 end
        if defending and (v.bx - ownEdge) * v.sign < 18 then value = value - max(0, -v.bvx * v.sign) * 0.6 end
        for _, other in ipairs(v.others) do
            if other.team ~= v.team and (other.x - original.bx) * v.sign > -3 and abs(v.bx - other.x) < 13 then
                value = value - max(0, 9 - abs(v.by - other.y)) * 0.8
                if v.by > other.y + v.r + 3 and v.bvx * v.sign > 3 then value = value + 4 end
            end
        end
        if not defending and (v.c.tBallReset or 0) > (original.c.tBallReset or 0) then
            value = value + 7 + max(0, v.boost - original.boost) * 0.08
        end
        return value
    end

    local function touchedBy(events, slot, from)
        for n = from or 1, #events do
            local e = events[n]
            if (e[1] == "balltouch" or e[1] == "actionshot") and e[2] == slot then return true end
        end
        return false
    end

    local function priority(a, baseline) return a.press and 3 or (a == baseline and 2 or 1) end
    -- Roll each candidate forward 0.3 s in the real physics and keep the best.
    local function search(live, slot, state, v, candidates, tx, ty, defending)
        local data = getSnapshot(live)
        local start = clock()
        local baseline = candidates[1]
        local best, bestScore = baseline, -huge
        -- Executable shots first, then the baseline, then setups.
        table.sort(candidates, function(a, b) return priority(a, baseline) > priority(b, baseline) end)
        local tested = 0
        for _, candidate in ipairs(candidates) do
            if tested > 0 and clock() >= frameDeadline then break end
            syncClone(shotWorld, live, data)
            local isSetup = candidate.name == "gold setup" or candidate.name == "purple setup"
            local fired = false
            for i = 1, 36 do
                local x, y, press = candidate.x, candidate.y, candidate.press and i == 1
                if isSetup and not fired then
                    local cv = sample(shotWorld, slot, state)
                    if cv and canPop(cv.c) and not cv.grounded then
                        local dx, dy, range
                        if candidate.name == "gold setup" then
                            dx, dy, range = -cv.fx, -cv.fy, Settings.dodgeShotRange / UU
                        else
                            dx, dy, range = -cv.ux, -cv.uy, Settings.jumpShotRange / UU
                        end
                        if rayHits(cv, dx, dy, range) then
                            press, fired = true, true
                            if candidate.name == "purple setup" then x, y = 0, 0 end
                        end
                    end
                end
                World.setInput(shotWorld, slot, x, y, press, candidate.held and i < 23, candidate.boost,
                    false, false, false)
                World.substep(shotWorld, DT)
            end
            local value = score(shotWorld, slot, state, v, tx, ty, defending)
            local touched = touchedBy(shotWorld.events, slot)
            if (candidate.name == "power flip" or candidate.name == "flip over defender") and not touched then
                value = -huge
            end
            local nextVX = shotWorld.ball.vx * S
            if touched and nextVX * v.sign < -5 and nextVX * v.sign < v.bvx * v.sign - 3 then value = -huge end
            if value > bestScore then bestScore, best = value, candidate end
            tested = tested + 1
        end
        B.lastSearchMs, B.tested = (clock() - start) * 1000, tested
        return best
    end

    -- Last line of defence: simulate the chosen input and veto it if it
    -- knocks the ball toward our own goal.
    local function safeRecovery(live, slot, v, chosen)
        local data = getSnapshot(live)
        local ownLine = v.sign > 0 and v.own.right or v.own.left
        local gravity = ballGravity(live)
        local function evaluate(a)
            syncClone(shotWorld, live, data)
            local risk, ownTouch = 0, false
            local previousSpeed = v.bvx * v.sign
            local seen = 0
            for i = 1, 30 do
                World.setInput(shotWorld, slot, a.x, a.y, a.press and i == 1,
                    a.held and i <= 24, a.boost and i <= 24, false, false, false)
                World.substep(shotWorld, DT)
                local bx, by = shotWorld.ball.x * S, shotWorld.ball.y * S
                local speed = shotWorld.ball.vx * S * v.sign
                local events = shotWorld.events
                if touchedBy(events, slot, seen + 1) then
                    ownTouch = true
                    if speed < -3 and speed < previousSpeed - 2 then risk = max(risk, 200 - speed * 2) end
                end
                seen = #events
                if (bx - ownLine) * v.sign < 0 and by > v.own.lo - v.r * 0.4 and by < v.own.hi + v.r * 0.4 then
                    risk = max(risk, 100000 + (30 - i) * 100)
                end
                if ownTouch and speed < -3 and (bx - ownLine) * v.sign < 28
                    and by > v.own.lo - v.r and by < v.own.hi + v.r then
                    risk = max(risk, 800 - speed * 3)
                end
                previousSpeed = speed
            end
            local car, ball = shotWorld.cars[slot].body, shotWorld.ball
            local vx, vy = ball.vx * S, ball.vy * S
            if vx * v.sign < -3 then
                local t = (ownLine - ball.x * S) / vx
                local y = ball.y * S + vy * t + 0.5 * gravity * t * t
                if t > 0 and t < 0.9 and y > v.own.lo - v.r and y < v.own.hi + v.r then
                    risk = max(risk, ownTouch and 90000 or 50000)
                end
            end
            return risk, abs(car.y - ball.y) * S * 0.12 + (ball.x * S - v.bx) * v.sign * 0.25
        end
        local risk, quality = evaluate(chosen)
        B.safetyRisk, B.safetyOverride = risk, false
        if risk == 0 then return chosen end
        local best, bestRisk, bestQuality = chosen, risk, quality
        local mayJump = live.t - lastPress >= cfg.pressCooldown and canPop(v.c)
        local alternatives = {
            action(0, 0, false, false, false, "cancel risky touch"),
            action(0, 0, false, mayJump, mayJump, "vertical clear"),
            action(v.sign, 0, false, false, false, "brake backward touch"),
            action(v.sign * 0.4, 1, false, v.grounded and mayJump, v.grounded and mayJump, "avoid backward hit"),
            action(v.sign * 0.4, -1, false, false, false, "avoid backward hit"),
        }
        for index, alternative in ipairs(alternatives) do
            if index > 1 and clock() >= frameDeadline then break end
            local r, q = evaluate(alternative)
            if r < bestRisk or (r == bestRisk and q > bestQuality) then
                best, bestRisk, bestQuality = alternative, r, q
            end
        end
        B.safetyRisk, B.safetyOverride = bestRisk, best ~= chosen
        return best
    end

    --------------------------------------------------------------- state ----
    local carried, carryUntil
    local kickoffUntil, recoveryUntil = -huge, -huge
    local recharging = false
    local nextHeavy = -huge
    local function newChain() return { phase = "idle", stamp = -huge, popAt = -huge, pops = 0, deadline = 0, readyAt = 0 } end
    local chain = newChain()

    -- Roles that can flicker on threshold noise get a short minimum dwell.
    local SOFT_ROLES = { attack = true, ["first touch"] = true, challenge = true, pursuit = true,
        possession = true, rotate = true, support = true, shadow = true, ["follow-through"] = true,
        recharge = true, recover = true }
    local roleState = { name = "idle", since = -huge }
    local function holdRole(role, now)
        local current = roleState.name
        if role ~= current then
            if SOFT_ROLES[role] and SOFT_ROLES[current] and now - roleState.since < cfg.roleHold then
                return current
            end
            roleState.name, roleState.since = role, now
        end
        return role
    end

    local trace = { items = {}, head = 0, count = 0 }
    local function pushTrace(frame)
        local size = cfg.traceSize
        trace.head = trace.head % size + 1
        trace.items[trace.head] = frame
        trace.count = min(trace.count + 1, size)
    end
    function B:getTrace()
        local size, out = cfg.traceSize, {}
        local start = trace.count < size and 1 or trace.head % size + 1
        for i = 0, trace.count - 1 do out[#out + 1] = trace.items[(start - 1 + i) % size + 1] end
        return out
    end

    local function ensureClones(live, now)
        if live == lastWorld and now - lastMutCheck < 0.5 then return end
        lastMutCheck = now
        local key = mutKey(live.mut)
        if live ~= lastWorld or key ~= lastMutKey or not forecast then
            forecast, shotWorld = World.new(live.mut), World.new(live.mut)
            lastWorld, lastMutKey = live, key
            lastPlan, lastPress = -huge, -huge
            invalidateForecast()
            lastRefresh = -huge
        end
    end

    function B:reset()
        lastWorld, lastMutKey, forecast, shotWorld = nil, nil, nil, nil
        lastMutCheck, lastRefresh = -huge, -huge
        invalidateForecast()
        carried, carryUntil = nil, nil
        kickoffUntil, recoveryUntil = -huge, -huge
        recharging = false
        lastMobility, nextHeavy = -huge, -huge
        chain = newChain()
        lastPlan, lastPress = -huge, -huge
        roleState.name, roleState.since = "idle", -huge
    end

    ---------------------------------------------------------------- decide ----
    function B:decide(live, slot, state)
        state = state or EMPTY
        local v = sample(live, slot, state)
        if not v then
            self.status = "waiting for car"
            return action(0, 0, false, false, false, "idle")
        end
        local now = live.t
        if not self.lastTime or now < self.lastTime or live ~= lastWorld then self:reset() end
        self.lastTime = now
        local started = clock()
        frameDeadline = started + cfg.frameBudgetMs / 1000
        snapshot = nil
        self.heavy = now >= nextHeavy
        if self.heavy then nextHeavy = now + cfg.plannerInterval end
        ensureClones(live, now)
        local mut = live.mut or EMPTY
        local c = v.c

        -- Fuel bookkeeping ------------------------------------------------
        local capacity = Settings.maxBoostFuel * max(mut.maxBoostScale or 1, 0)
        local unlimited = (mut.maxBoostScale or 1) < 0 or (state.freeplayBoost == true and not not state.localSim)
        v.unlimited = unlimited
        local fuelRatio = (unlimited or capacity <= 0) and 1 or v.boost / capacity
        local canRecharge = capacity > 0 and (mut.boostRegenScale or 1) > 0
        if not recharging and fuelRatio < 0.22 and canRecharge then recharging = true end
        if not canRecharge then recharging = false end
        if recharging and fuelRatio >= 0.55 then recharging = false end

        -- Read the situation ---------------------------------------------
        updateForecast(live, v, now)
        local age = now - fc.startT
        local usePath = forecastUsable(age)
        local gravity = ballGravity(live)

        local middle = (v.own.x + v.enemy.x) * 0.5
        if abs(v.bx - middle) < 3 and v.by < v.r + 4 and length(v.bvx, v.bvy) < 3 then
            kickoffUntil = now + 1.25
        end
        -- The kickoff is over once the ball has been hit.
        if now < kickoffUntil and length(v.bvx, v.bvy) > 10 then kickoffUntil = -huge end
        local kickoff = now < kickoffUntil
        local aimX, aimY = attackAim(v)
        local defending, crossIn = threat(v, age, gravity)

        local ownDistance = length(v.x - v.bx, v.y - v.by)
        local ours = eta(v, v, age, usePath)
        local enemyTime, allyTime = huge, huge
        local defender, defenderDistance = nil, huge
        for _, other in ipairs(v.others) do
            local t = eta(other, v, age, usePath)
            if other.team == v.team then
                if (v.bx - other.x) * v.sign > -2 then allyTime = min(allyTime, t) end
            else
                enemyTime = min(enemyTime, t)
                local gap = (other.x - v.bx) * v.sign
                if gap > -3 and gap < 28 and abs(other.y - v.by) < 12 and gap < defenderDistance then
                    defender, defenderDistance = other, gap
                end
            end
        end

        -- A ball already going in, that no opponent can reach first, is left alone.
        local scoringIn, letItScore = nil, false
        if cfg.letItScore and fc.valid and not defending and not kickoff then
            local st = fc.strict[3 - v.team]
            if st and st - age > 0 and st - age < 1.2 then scoringIn = st - age end
        end
        if scoringIn and (v.bx - v.x) * v.sign > v.r then
            letItScore = true
            for _, other in ipairs(v.others) do
                if other.team ~= v.team and pathArrival(other, v, age, scoringIn + 0.15) then
                    letItScore = false
                    break
                end
            end
            if letItScore and inLane(v, age, scoringIn) then letItScore = false end
        end

        local tReset = c.tBallReset or 0
        local resetOpportunity = not v.grounded and not c.flipping and v.by > 12
            and ownDistance < v.r + 5 and ((c.dodges or 0) <= 0 or (c.combined or 0) <= 0)
            and (v.bx - v.own.x) * v.sign > 32
        local actualReset = tReset > 0 and now - tReset < 0.14
        local chainSafe = not defending and not v.grounded and v.by > v.y + 2
            and (v.bx - middle) * v.sign > 8 and enemyTime > 0.22
        if chain.phase ~= "idle" and (not chainSafe or now > chain.deadline or ownDistance > 65) then
            chain.phase = "idle"
        end
        if chainSafe and actualReset and tReset > chain.stamp then
            if chain.phase == "idle" or (chain.phase == "catch" and now - chain.popAt > 0.16) then
                chain.phase, chain.stamp = "settle", tReset
                chain.readyAt = now + (chain.pops > 0 and 0.025 or 0.12)
                chain.deadline = now + 3.5
            end
        end
        local goalSide = (v.bx - v.x) * v.sign > -v.r
        local firstTouch = enemyTime < huge and ours + 0.1 < enemyTime and allyTime + 0.12 >= ours
            and goalSide and ownDistance > v.r + 3 and ours < 1.5
        local reachableContest = enemyTime < 1.1 and ours < enemyTime + 0.20
            and ownDistance < 40 and goalSide and allyTime + 0.12 >= ours
        local returnNeeded = not v.grounded
            and ((v.x - v.bx) * v.sign > 8 or ((v.bx - middle) * v.sign < 0 and v.y > v.by + 15))
            and ((v.bvx * v.sign < -5) or enemyTime < ours + 0.2)
        local carGravity = max(1, -Tuning.World.gravity * S * (mut.gravityScale or 1))
        local coastRise = max(0, v.vy) ^ 2 / (2 * carGravity)
        local missingHeight = max(0, v.by - v.y - coastRise - 4)
        local climbFuel = Settings.boostBurnRate * sqrt(2 * missingHeight / max(1, Settings.boostForceScale * S))
        local cannotClimb = not unlimited and missingHeight > 8 and v.boost < climbFuel + capacity * 0.12
        local pursuit = not v.grounded and not c.flipping and ownDistance > 20
            and (v.bx - v.x) * v.sign > 14 and (v.bx - middle) * v.sign > 5
            and canPop(c) and v.bvx * v.sign > 2 and abs(v.by - v.y) < 24

        -- Role ------------------------------------------------------------
        local role = "attack"
        if defending then role = "save"
        elseif kickoff then role = "kickoff"
        elseif chain.phase ~= "idle" and chainSafe then role = "chain reset"
        elseif letItScore then role = "let it score"
        elseif returnNeeded then role = "return"
        elseif cannotClimb and not resetOpportunity then
            role = (v.grounded or c.collidingStatic) and "recharge" or "recover"
            recharging = true
        elseif firstTouch then role = "first touch"
        elseif resetOpportunity then role = "reset"
        elseif reachableContest then role = "challenge"
        elseif pursuit then role = "pursuit"
        elseif recharging and not (ownDistance < v.r + 4 and (v.bx - middle) * v.sign > 15
            and (v.bx - v.x) * v.sign > 1) then
            role = (v.grounded or c.collidingStatic) and "recharge" or "recover"
        elseif (v.x - v.bx) * v.sign > v.r + 3 then role = "rotate"
        elseif allyTime + 0.2 < ours and ownDistance > 16 then role = "support"
        elseif enemyTime + 0.18 < ours and (v.bx - middle) * v.sign < 12 and ownDistance > 16 then role = "shadow"
        elseif ownDistance < 18 and (v.bx - v.x) * v.sign > 0
            and abs(v.bvx) < 35 and enemyTime > ours + 0.15 then role = "possession"
        elseif now < recoveryUntil then role = "follow-through" end
        role = holdRole(role, now)

        -- Target ----------------------------------------------------------
        local tx, ty, contactT = interceptTarget(v, aimX, aimY, defending, age, usePath, gravity)
        local saveX, saveY, saveT
        if defending and usePath and crossIn then
            saveX, saveY, saveT = saveTarget(v, age, crossIn)
            if saveX then contactT = saveT end
        end
        if saveX then
            local guard = (v.sign > 0 and v.own.right or v.own.left) + v.sign * (v.r + 5)
            tx = v.sign > 0 and max(saveX, guard) or min(saveX, guard)
            ty = saveY
        elseif defending then
            -- Meet an incoming ball in front of the goal instead of matching
            -- its retreat and arriving inside the net with it.
            local catchTime = clamp(ownDistance / 70, 0.08, 0.4)
            local guard = (v.sign > 0 and v.own.right or v.own.left) + v.sign * (v.r + 5)
            tx = v.bx + v.bvx * catchTime - v.sign * (v.r + 1.5)
            tx = v.sign > 0 and max(tx, guard) or min(tx, guard)
            ty = clamp(max(2, v.by + v.bvy * catchTime), 2, v.own.hi - 1)
            if v.by > v.y + 5 and abs(v.bx - v.x) < 18 then
                local underX = v.bx + v.bvx * 0.12
                tx = v.sign > 0 and max(underX, guard) or min(underX, guard)
                ty = max(2, v.by - v.r - 1.8)
            end
        end
        -- Cross above the ball to get goal-side instead of driving through it
        -- toward our own net when returning from the opponent's corner.
        if not defending and (v.x - v.bx) * v.sign > v.r + 2 and abs(v.y - v.by) < v.r + 5 then
            tx, ty = v.bx - v.sign * (v.r + 6), v.by + v.r + 7
        end
        -- Yield the attack to a teammate who is closer and goal-side.
        if not defending and ownDistance > 16 then
            for _, other in ipairs(v.others) do
                if other.team == v.team and (v.bx - other.x) * v.sign > -2
                    and length(other.x - v.bx, other.y - v.by) + 9 < ownDistance then
                    tx = v.bx - v.sign * 20
                    ty = max(2, min(v.by * 0.5, v.own.hi * 0.65))
                    break
                end
            end
        end
        local guard = (v.sign > 0 and v.own.right or v.own.left) + v.sign * (v.r + 6)
        local function safeX(x) return v.sign > 0 and max(x, guard) or min(x, guard) end
        if role == "shadow" or role == "support" then
            tx = safeX(v.bx - v.sign * (role == "shadow" and 16 or 23))
            ty = max(2, min(v.by * 0.6, v.own.hi * 0.6))
        elseif role == "recharge" then
            -- Sideswipe refills fuel against a surface, not at pads.
            tx, ty = safeX(v.bx - v.sign * 18), 2
            if abs(tx - v.x) < 12 then tx = v.x end
        elseif role == "recover" then
            tx, ty = safeX(v.bx - v.sign * 18), 2
        elseif role == "let it score" then
            tx, ty = safeX(v.bx - v.sign * 22), 2
        elseif role == "return" then
            tx = safeX(v.bx - v.sign * 14)
            ty = max(3, min(v.by, v.own.hi * 0.6))
        elseif role == "challenge" or role == "first touch" or role == "pursuit" then
            local lead = clamp(ours * 0.65, 0.05, 0.5)
            tx, ty = v.bx + v.bvx * lead + v.sign, max(2, v.by + v.bvy * lead - 1)
        elseif role == "possession" then
            tx, ty = v.bx + v.sign * 1.5, max(2, v.by - 2)
        elseif role == "rotate" then
            tx = safeX(v.bx - v.sign * (v.r + 7))
            ty = v.by > v.r + 10 and max(2, v.by - v.r - 6) or v.by + v.r + 7
        end

        -- Base action -----------------------------------------------------
        local base = steering(v, tx, ty, defending)
        base.name = role
        if (role == "first touch" or role == "challenge" or role == "pursuit") and ownDistance > v.r + 3 then
            base.x, base.y = unit(tx - v.x - v.vx * 0.08, ty - v.y - v.vy * 0.08)
            if v.grounded and ty < v.y + 5 then base.x, base.y = v.sign, 0 end
            base.boost = (unlimited or v.boost > 1) and v.fx * base.x + v.fy * base.y > 0.5
        end
        if role == "save" and ownDistance < v.r + 5 and v.by > v.y + 2 and abs(v.bx - v.x) < v.r + 1
            and v.uy > 0.7 and canPop(c) and now - lastPress > 0.2 then
            base = action(0, 0, false, true, true, "vertical clear")
        end
        if role == "recharge" then
            base.boost, base.press, base.held = false, false, false
            -- Fuel refills on any surface, so a car caught upfield drives
            -- back at full throttle instead of creeping.
            local throttle = (v.x - v.bx) * v.sign > -8 and 1 or 0.5
            base.x, base.y = clamp((tx - v.x) * 0.08 - v.vx * 0.04, -throttle, throttle), 0
        elseif role == "recover" then
            -- Downward stick triggers the stronger downward DI; stay inside
            -- the 17.5-degree fast-fall cone once goal-side.
            base.x, base.y = unit(clamp((tx - v.x) * 0.015, -0.22, 0.22), -1)
            base.boost = v.boost > 1 and v.y > 10 and v.fx * base.x + v.fy * base.y > 0.7
            base.press, base.held = false, false
            base.name = base.boost and "recovery dive" or "fast fall"
            if v.y > 24 and ownDistance > 20 and not c.flipping and canPop(c)
                and v.fx * base.x + v.fy * base.y > 0.8 and now - lastMobility > 0.75
                and now - lastPress > 0.2 then
                base.press, base.boost, base.name = true, false, "surface recovery flip"
                lastMobility = now
            end
        elseif role == "let it score" then
            base.press, base.held, base.boost, base.name = false, false, false, "let it roll in"
        elseif role == "possession" then
            local controlledSpeed = max(10, v.bvx * v.sign + 5)
            base.boost = v.vx * v.sign < controlledSpeed and ownDistance > v.r + 3 and fuelRatio > 0.45
            base.name = "controlled touch"
        elseif role == "return" then
            base.x, base.y = unit(tx - v.x - v.vx * 0.18, ty - v.y - v.vy * 0.12)
            base.held, base.press = false, false
            base.boost = v.boost > 3 and v.fx * base.x + v.fy * base.y > 0.5
            if not c.flipping and canPop(c) and now - lastMobility > 0.75 and now - lastPress > 0.2
                and v.fx * base.x + v.fy * base.y > 0.7 and length(tx - v.x, ty - v.y) > 22 then
                base.press, base.boost, base.name = true, false, "defensive return flip"
                lastMobility = now
            end
        elseif role == "reset" then
            local rx, ry = unit(v.bx - v.x, v.by - v.y)
            base.x, base.y = -ry * c.fs / c.us, rx * c.fs / c.us
            base.press, base.held, base.boost, base.name = false, false, false, "wheels to ball"
        elseif role == "chain reset" then
            local rx, ry = unit(v.bx - v.x, v.by - v.y)
            local wheels = -v.ux * rx - v.uy * ry
            base.press, base.held, base.boost = false, false, false
            if chain.phase == "settle" then
                base.x, base.y = -ry * c.fs / c.us, rx * c.fs / c.us
                base.name = "chain reset: wheel contact"
                if now >= chain.readyAt and (chain.pops > 0 or fuelRatio > 0.8 or now > chain.readyAt + 0.18)
                    and wheels > 0.8 and ownDistance < v.r + 2.5 and canPop(c)
                    and now - lastPress > cfg.pressCooldown then
                    base.x, base.y, base.press, base.name = 0, 0, true, "chain reset: pop"
                    chain.phase, chain.popAt, chain.deadline = "catch", now, now + 3.5
                    chain.stamp, chain.pops = tReset, chain.pops + 1
                end
            elseif ownDistance < v.r + 5 then
                base.x, base.y = -ry * c.fs / c.us, rx * c.fs / c.us
                base.name = "chain reset: reacquire wheels"
            else
                base.x, base.y = unit((v.bx - v.x) * 3 + (v.bvx - v.vx) * 0.5, (v.by - v.y) * 3 + (v.bvy - v.vy) * 0.5)
                base.boost = v.boost > 12 and v.fx * base.x + v.fy * base.y > 0.5
                base.name = "chain reset: catch ball"
            end
        end
        if role == "save" and not v.grounded and not c.flipping and ownDistance > 24 and canPop(c)
            and now - lastMobility > 0.75 and now - lastPress > 0.2 and v.fx * base.x + v.fy * base.y > 0.8 then
            base.press, base.held, base.boost, base.name = true, false, false, "defensive return flip"
            lastMobility = now
        end
        if (role == "pursuit" or role == "first touch") and not v.grounded and not c.flipping and canPop(c)
            and ownDistance > 22 and ownDistance < 58 and now - lastMobility > 0.75
            and now - lastPress > 0.2 and base.x * v.sign > 0.5
            and v.fx * base.x + v.fy * base.y > 0.8 and v.vx * base.x + v.vy * base.y < 40 then
            base.press, base.held, base.boost, base.name = true, false, false, "pursuit flip"
            lastMobility = now
        end

        -- Candidates and rollout search ------------------------------------
        local recovering = now < recoveryUntil
        local enemyEdge = v.sign > 0 and v.enemy.left or v.enemy.right
        local finishing = abs(enemyEdge - v.bx) < 30
        -- Gold's backwards dodge is a situational finish, never the default
        -- kickoff or the immediate follow-up to the previous touch.
        local allowSpecial = not kickoff and not recovering
            and (role == "challenge" or role == "save" or (role == "attack" and (finishing or defender ~= nil))
                or (role == "possession" and v.by > v.enemy.lo and finishing))
        if not allowSpecial then carried, carryUntil = nil, nil end
        local candidates = shots(v, now, aimX, aimY, base, allowSpecial)
        if (role == "challenge" or role == "possession" or role == "attack") and ownDistance < v.r + 7
            and (v.bx - v.x) * v.sign > 0 and now - lastPress > 0.2 and canPop(c) and defender then
            if v.grounded then
                candidates[#candidates + 1] = action(v.sign * 0.55, 1, false, true, true, "chip over defender")
            elseif not c.flipping then
                local dx, dy = unit(v.bx - v.x, v.by - v.y + v.r * 0.7)
                candidates[#candidates + 1] = action(dx, dy, false, true, false, "flip over defender")
            end
        end

        local chosen = base
        if self.heavy and #candidates > 2 and now - lastPlan >= cfg.planMinGap and clock() < frameDeadline then
            lastPlan = now
            chosen = search(live, slot, state, v, candidates, tx, ty, defending)
            local isSetup = chosen.name == "gold setup" or chosen.name == "purple setup"
            carried = isSetup and chosen or nil
            carryUntil = now + 0.1
        elseif #candidates > 2 then
            if carried and now < carryUntil then chosen = carried end
            -- A geometrically valid special can fire between planner cycles.
            for _, candidate in ipairs(candidates) do
                if candidate.press and (candidate.name == "gold shot" or candidate.name == "purple shot") then
                    chosen = candidate
                    break
                end
            end
        end
        if chosen.name == "gold setup" or chosen.name == "purple setup" then
            local readyName = chosen.name == "gold setup" and "gold shot" or "purple shot"
            for _, candidate in ipairs(candidates) do
                if candidate.name == readyName then chosen = candidate; break end
            end
        end
        local fromBase = chosen == base
        -- Work on a copy: the carried setup must not be mutated across frames.
        chosen = copyAction(chosen)
        if chosen.press and now - lastPress < cfg.pressCooldown then chosen.press = false end
        -- Keep the neutral purple jump neutral for its first physics tick.
        if chosen.name == "purple shot" then chosen.x, chosen.y, chosen.boost = 0, 0, false end
        if defender and fromBase and chosen.press and chosen.y > 0.5 and v.grounded
            and (role == "challenge" or role == "possession") then
            chosen.name = "chip over defender"
        end

        -- Fuel allocation --------------------------------------------------
        -- Keep a reserve for the next save; spend it only for an emergency or
        -- an immediate touch.
        local reserve = capacity * ((v.bx - middle) * v.sign < 0 and 0.25 or 0.16)
        local distanceToTarget = length(tx - v.x, ty - v.y)
        local requiredFuel = Settings.boostBurnRate * clamp(distanceToTarget / 60, 0.08, 0.6)
        local alignment = v.fx * chosen.x + v.fy * chosen.y
        local closingSpeed = v.vx * chosen.x + v.vy * chosen.y
        local immediateTouch = ownDistance < v.r + 4 and (v.bx - v.x) * v.sign > 1
            and (v.bx - middle) * v.sign > 15 and (role == "attack" or role == "challenge")
        if not unlimited and chosen.boost then
            local urgent = role == "return" or role == "save" or role == "first touch" or role == "challenge"
                or role == "pursuit" or (role == "recover" and v.y > 10 and ty < v.y - 8)
            if role == "recharge" or role == "recover" or role == "let it score"
                or (v.boost <= reserve and not defending and not immediateTouch)
                or alignment < 0.65 or c.flipping
                or (closingSpeed > 48 and not defending)
                or (distanceToTarget < 20 and closingSpeed > distanceToTarget * 2.5 and not defending)
                or (distanceToTarget < 7 and closingSpeed > distanceToTarget * 3) then
                chosen.boost = false
            end
            if urgent and v.boost > 1 and alignment > 0.55 and distanceToTarget > 8
                and closingSpeed < 60 and not chosen.press then
                chosen.boost = true
            end
            if not v.grounded and not defending and ty > v.y + 10
                and v.boost < requiredFuel + reserve * 0.5 and not immediateTouch then
                chosen.boost = false
            end
        end
        if role == "chain reset" and chain.phase == "catch" and ownDistance > v.r + 5
            and v.boost > 1 and alignment > 0.55 and not chosen.press then
            chosen.boost = true
        end
        -- An uncontested touch is not a shot: approach at the ball's speed.
        if (role == "possession" or role == "attack") and ownDistance < v.r + 7
            and not finishing and not defender and enemyTime > 0.55 then
            chosen.press, chosen.boost, chosen.held = false, false, false
            chosen.name = "soft possession touch"
            if v.grounded then chosen.x, chosen.y = clamp((v.bvx + v.sign * 7 - v.vx) * 0.09, -1, 1), 0 end
        end

        -- Safety -----------------------------------------------------------
        -- Never drive through the ball from its attacking side toward our net.
        local contactX, contactY = v.bx - v.x, v.by - v.y
        local relativeSpeed = length(v.vx - v.bvx, v.vy - v.bvy)
        local riskRange = v.r + 4 + min(18, relativeSpeed * 0.2)
        local towardOwnBall = contactX * v.sign < -1 and ownDistance < v.r + 6
            and abs(contactY) < v.r + 3 and chosen.x * v.sign < -0.1
        if towardOwnBall and role ~= "save" then
            local hop = v.grounded and (c.combined or 0) > 0 and now - lastPress >= cfg.pressCooldown
            chosen = action(v.sign * 0.4, v.by < v.r + 10 and 1 or -1, false, hop, hop, "avoid backward hit")
            self.safetyOverride = true
        elseif ownDistance < riskRange or (chosen.press and ownDistance < 25) then
            if self.heavy and clock() < frameDeadline then
                chosen = safeRecovery(live, slot, v, chosen)
            else
                local rx, ry = unit(contactX, contactY)
                local approach = (v.vx - v.bvx) * rx + (v.vy - v.bvy) * ry
                if rx * v.sign < -0.15 and (approach > 1 or chosen.x * v.sign < -0.1 or chosen.press)
                    and ownDistance < v.r + 6 then
                    chosen = action(v.sign * 0.4, v.by < v.r + 10 and 1 or -1, false, false, false, "avoid backward hit")
                    self.safetyOverride = true
                else
                    self.safetyOverride = false
                end
            end
        else
            self.safetyRisk, self.safetyOverride = 0, false
        end

        -- Bookkeeping ------------------------------------------------------
        if chosen.press then
            lastPress = now
            if chosen.name == "gold shot" or chosen.name == "purple shot" or chosen.name == "power flip" then
                recoveryUntil = now + 0.7
                carried, carryUntil = nil, nil
            end
        end
        self.status, self.role, self.targetX, self.targetY = chosen.name, role, tx, ty
        self.distance, self.defending, self.kickoff, self.recovering = ownDistance, defending, kickoff, recovering
        self.fuelRatio, self.reserve, self.requiredFuel, self.recharging = fuelRatio, reserve, requiredFuel, recharging
        self.chainPhase, self.chainPops = chain.phase, chain.pops
        self.ourArrival, self.enemyArrival, self.contactT = ours, enemyTime, contactT
        self.scoringIn, self.usingForecast = scoringIn, usePath
        self.forecastHorizon = (fc.valid and fc.count > 0) and max(0, fc.points[fc.count].t - age) or 0
        local elapsed = (clock() - started) * 1000
        self.decisionMs = elapsed
        self.avgDecisionMs = (self.avgDecisionMs or elapsed) * 0.95 + elapsed * 0.05
        pushTrace({ t = now, x = v.x, y = v.y, vx = v.vx, vy = v.vy, a = c.body.angle,
            bx = v.bx, by = v.by, bvx = v.bvx, bvy = v.bvy, team = v.team, boost = v.boost,
            jumps = c.jumps, dodges = c.dodges, role = role, action = chosen.name,
            sx = chosen.x, sy = chosen.y, press = chosen.press, held = chosen.held, boosting = chosen.boost,
            ours = ours < huge and ours or -1, enemy = enemyTime < huge and enemyTime or -1,
            forecast = usePath, safetyRisk = self.safetyRisk, safetyOverride = self.safetyOverride })
        if tReset > 0 and (not self.lastReset or tReset > self.lastReset) then
            self.resetCount = self.resetCount + 1
            self.lastReset = tReset
            lastPress = min(lastPress, now - cfg.pressCooldown) -- a reset re-arms the pop at once
        end
        return chosen
    end

    return B
end

-----------------------------------------------------------------------------
-- Host (Roblox only). Outside Roblox the file just hands back the brain.
-----------------------------------------------------------------------------
if game == nil then
    return { createBrain = createBrain, CONFIG = CONFIG, VERSION = VERSION }
end

local environment = (getgenv and getgenv()) or _G
local previous = environment.SideswipeBot
if previous and type(previous.Stop) == "function" then pcall(previous.Stop) end

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UIS = game:GetService("UserInputService")
local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local player = Players.LocalPlayer
local playerScripts = player:WaitForChild("PlayerScripts")
local modules = ReplicatedStorage:WaitForChild("SS2D", 15)
assert(modules, "SideswipeBot: this is not the supported Sideswipe Soccer game")

local function clientModule(name)
    local module = playerScripts:WaitForChild(name, 15)
    assert(module and module:IsA("ModuleScript"), "SideswipeBot: missing client module " .. name)
    return require(module)
end
local State = clientModule("ClientState")
local Controls = clientModule("Controls")
local Bridge = clientModule("NetBridge")
local World = require(modules:WaitForChild("World"))
local Tuning = require(modules:WaitForChild("Tuning"))
assert(type(Controls.sample) == "function" and Bridge.localPlay
    and type(World.serialize) == "function" and type(World.deserialize) == "function"
    and type(World.substep) == "function" and type(World.new) == "function",
    "SideswipeBot: the game API changed; this version is unsupported")

local brain = createBrain(World, Tuning)
local config = brain.config
local api = { Enabled = true, Focused = true, Brain = brain, Config = config, Version = VERSION, Reason = "waiting" }
local originalSample, originalStick = Controls.sample, Controls.stick
local stopped, controlling, sampling, chosen = false, false, false, nil
local connections = {}
local function connect(signal, fn)
    local connection = signal:Connect(fn)
    connections[#connections + 1] = connection
    return connection
end

------------------------------------------------------------ manual override --
local HOTKEYS = { [Enum.KeyCode.F6] = true, [Enum.KeyCode.F7] = true, [Enum.KeyCode.F8] = true }
local heldInputs, heldCount, manualUntil = {}, 0, 0
local function isPlayerInput(input)
    local kind = input.UserInputType
    if kind == Enum.UserInputType.Keyboard then return not HOTKEYS[input.KeyCode] end
    return kind.Name:sub(1, 7) == "Gamepad" and input.KeyCode ~= Enum.KeyCode.Thumbstick1
        and input.KeyCode ~= Enum.KeyCode.Thumbstick2
end
local function releaseAll()
    heldInputs, heldCount = {}, 0
end
local function manualActive()
    return config.manualOverride and (heldCount > 0 or os.clock() < manualUntil)
end

------------------------------------------------------------- world access --
local lastWorld, lastWorldTime, lastProgress = nil, nil, 0
-- Returns the local simulation's world when the bot may drive, else nil and why.
local function drivableWorld()
    if stopped or not api.Enabled then return nil, "off" end
    if not api.Focused then return nil, "unfocused" end
    if State.paused or State.overlay or UIS:GetFocusedTextBox() then return nil, "menu" end
    local session = State.session
    if not session or session.phase ~= "match" or not State.mySlot then return nil, "waiting" end
    if State.mode and State.mode ~= "soccar" then return nil, "mode" end
    if not State.localSim then return nil, "online" end
    local source = Bridge.localPlay
    if not source or source.phase ~= "Play" then return nil, "waiting" end
    local world = source.world
    if not world or not world.cars or not world.ball or not world.arena then return nil, "waiting" end
    local now = os.clock()
    if world ~= lastWorld or world.t ~= lastWorldTime then
        lastWorld, lastWorldTime, lastProgress = world, world.t, now
    end
    if now - lastProgress > 0.3 then return nil, "stalled" end
    return world
end

------------------------------------------------------------------ errors --
local errorTimes = {}
local function recordError(message)
    api.LastError = tostring(message)
    local now = os.clock()
    errorTimes[#errorTimes + 1] = now
    while errorTimes[1] and now - errorTimes[1] > config.errorWindow do table.remove(errorTimes, 1) end
    if #errorTimes == 1 then warn("SideswipeBot error (recovering): " .. api.LastError) end
    return #errorTimes >= config.maxErrors
end

---------------------------------------------------------------------- UI --
local Theme = {
    bg = Color3.fromRGB(15, 19, 32), stroke = Color3.fromRGB(78, 66, 150),
    text = Color3.fromRGB(228, 224, 255), dim = Color3.fromRGB(142, 142, 178),
    on = Color3.fromRGB(72, 214, 136), off = Color3.fromRGB(232, 86, 98),
    idle = Color3.fromRGB(240, 186, 72), manual = Color3.fromRGB(96, 170, 255),
    track = Color3.fromRGB(34, 40, 62), fuel = Color3.fromRGB(150, 118, 255),
}
local function make(class, props, parent)
    local instance = Instance.new(class)
    for key, value in pairs(props) do instance[key] = value end
    instance.Parent = parent
    return instance
end

local gui = make("ScreenGui", { Name = "SideswipeBotPanel", ResetOnSpawn = false, DisplayOrder = 110 },
    player:WaitForChild("PlayerGui"))
local panel = make("Frame", { Position = UDim2.new(0, 14, 0, 150), Size = UDim2.fromOffset(290, 0),
    AutomaticSize = Enum.AutomaticSize.Y, BackgroundColor3 = Theme.bg, BorderSizePixel = 0 }, gui)
make("UICorner", { CornerRadius = UDim.new(0, 10) }, panel)
make("UIStroke", { Color = Theme.stroke, Thickness = 1, Transparency = 0.25 }, panel)
make("UIPadding", { PaddingTop = UDim.new(0, 8), PaddingBottom = UDim.new(0, 8),
    PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 10) }, panel)
make("UIListLayout", { Padding = UDim.new(0, 4), SortOrder = Enum.SortOrder.LayoutOrder }, panel)

local function label(order, height, font, size, color)
    return make("TextLabel", { LayoutOrder = order, Size = UDim2.new(1, 0, 0, height), BackgroundTransparency = 1,
        Font = font, TextSize = size, TextColor3 = color, TextXAlignment = Enum.TextXAlignment.Left,
        TextTruncate = Enum.TextTruncate.AtEnd, Text = "" }, panel)
end

local header = make("Frame", { LayoutOrder = 1, Size = UDim2.new(1, 0, 0, 24), BackgroundTransparency = 1,
    Active = false }, panel)
make("TextLabel", { Size = UDim2.new(1, -90, 1, 0), BackgroundTransparency = 1, Active = false, Font = Enum.Font.GothamBold,
    TextSize = 15, TextColor3 = Theme.text, TextXAlignment = Enum.TextXAlignment.Left,
    Text = "SideswipeBot  <font color=\"#8e8eb2\" size=\"11\">" .. VERSION .. "</font>", RichText = true }, header)
local pill = make("TextButton", { AnchorPoint = Vector2.new(1, 0.5), Position = UDim2.new(1, -28, 0.5, 0),
    Size = UDim2.fromOffset(58, 20), BackgroundColor3 = Theme.on, Font = Enum.Font.GothamBold, TextSize = 12,
    TextColor3 = Theme.bg, Text = "ON", AutoButtonColor = true }, header)
make("UICorner", { CornerRadius = UDim.new(1, 0) }, pill)
local closeButton = make("TextButton", { AnchorPoint = Vector2.new(1, 0.5), Position = UDim2.new(1, 0, 0.5, 0),
    Size = UDim2.fromOffset(22, 22), BackgroundTransparency = 1, Font = Enum.Font.GothamBold, TextSize = 16,
    TextColor3 = Theme.dim, Text = "×" }, header)

local roleLabel = label(2, 18, Enum.Font.GothamBold, 14, Theme.text)
local fuelTrack = make("Frame", { LayoutOrder = 3, Size = UDim2.new(1, 0, 0, 14), BackgroundColor3 = Theme.track,
    BorderSizePixel = 0 }, panel)
make("UICorner", { CornerRadius = UDim.new(0, 4) }, fuelTrack)
local fuelFill = make("Frame", { Size = UDim2.new(0, 0, 1, 0), BackgroundColor3 = Theme.fuel, BorderSizePixel = 0 }, fuelTrack)
make("UICorner", { CornerRadius = UDim.new(0, 4) }, fuelFill)
local fuelText = make("TextLabel", { Size = UDim2.new(1, -8, 1, 0), Position = UDim2.fromOffset(6, 0),
    BackgroundTransparency = 1, Font = Enum.Font.GothamMedium, TextSize = 11, TextColor3 = Theme.text,
    TextXAlignment = Enum.TextXAlignment.Left, Text = "" }, fuelTrack)
local detailA = label(4, 15, Enum.Font.Gotham, 12, Theme.dim)
local detailB = label(5, 15, Enum.Font.Gotham, 12, Theme.dim)
local footer = label(6, 14, Enum.Font.Gotham, 11, Theme.dim)
footer.Text = "F6 toggle  ·  F7 unload  ·  F8 details"
local showDetails = true

-- Drag the panel by its header.
local dragStart, panelStart
connect(header.InputBegan, function(input)
    local kind = input.UserInputType
    if kind == Enum.UserInputType.MouseButton1 or kind == Enum.UserInputType.Touch then
        dragStart, panelStart = input.Position, panel.Position
    end
end)
connect(UIS.InputChanged, function(input)
    local kind = input.UserInputType
    if dragStart and (kind == Enum.UserInputType.MouseMovement or kind == Enum.UserInputType.Touch) then
        local delta = input.Position - dragStart
        panel.Position = UDim2.new(panelStart.X.Scale, panelStart.X.Offset + delta.X,
            panelStart.Y.Scale, panelStart.Y.Offset + delta.Y)
    elseif kind == Enum.UserInputType.Gamepad1 and (input.KeyCode == Enum.KeyCode.Thumbstick1
        or input.KeyCode == Enum.KeyCode.Thumbstick2) and input.Position.Magnitude > 0.35 then
        manualUntil = os.clock() + config.manualGrace
    end
end)

local REASONS = {
    online = "Online match: offline / freeplay only",
    menu = "Paused while a menu is open",
    unfocused = "Paused while the window is unfocused",
    mode = "Waiting for a Soccar game",
    stalled = "Waiting for the simulation",
    waiting = "Waiting for freeplay or an offline game",
}
local function setPill(text, color) pill.Text, pill.BackgroundColor3 = text, color end
local function seconds(t) return (t and t < math.huge) and string.format("%.2fs", t) or "—" end
local function refreshPanel()
    detailA.Visible, detailB.Visible = showDetails, showDetails
    local fuel = math.clamp(brain.fuelRatio or 0, 0, 1)
    fuelFill.Size = UDim2.new(fuel, 0, 1, 0)
    fuelText.Text = string.format("Boost %d%%", math.floor(fuel * 100 + 0.5))
    if not api.Enabled then
        setPill("OFF", Theme.off)
        roleLabel.Text = "Paused  (F6 to resume)"
    elseif controlling then
        setPill("ON", Theme.on)
        roleLabel.Text = (brain.role or "?") .. "  ·  " .. (brain.status or "")
    elseif api.Reason == "manual" then
        setPill("YOU", Theme.manual)
        roleLabel.Text = "You're driving; let go to hand back"
    else
        setPill("IDLE", Theme.idle)
        roleLabel.Text = REASONS[api.Reason] or "Waiting"
    end
    if showDetails then
        local scoring = brain.scoringIn and ("  ·  scoring in " .. seconds(brain.scoringIn)) or ""
        detailA.Text = "reach you " .. seconds(brain.ourArrival) .. "  ·  foe " .. seconds(brain.enemyArrival) .. scoring
        detailB.Text = string.format("cpu %.2fms  ·  plan %.2fms ×%d  ·  sight %.1fs%s",
            brain.avgDecisionMs or 0, brain.lastSearchMs or 0, brain.tested or 0, brain.forecastHorizon or 0,
            api.LastError and "  ·  errors" or "")
    end
end

--------------------------------------------------------------- input hook --
local automatedSample, automatedStick

function api.Stop()
    if stopped then return end
    stopped, api.Enabled, controlling, chosen = true, false, false, nil
    for _, connection in ipairs(connections) do connection:Disconnect() end
    if Controls.sample == automatedSample then Controls.sample = originalSample end
    if Controls.stick == automatedStick then Controls.stick = originalStick end
    gui:Destroy()
    if environment.SideswipeBot == api then environment.SideswipeBot = nil end
end
function api.SetEnabled(enabled)
    if stopped then return end
    api.Enabled = enabled and true or false
    controlling, chosen = false, nil
    brain:reset()
    refreshPanel()
end
function api.Toggle() api.SetEnabled(not api.Enabled) end
function api.ExportTrace()
    local report = { version = VERSION, frames = brain:getTrace(), lastError = api.LastError,
        note = "Recent predicted state and bot inputs; no player identifiers." }
    local encoded = HttpService:JSONEncode(report)
    if type(writefile) == "function" then
        writefile("SideswipeBot-trace.json", encoded)
        return "SideswipeBot-trace.json"
    end
    return encoded
end

automatedSample = function(...)
    -- Always drain the original one-shot inputs so they can't fire later.
    sampling = true
    local ok, sx, sy, jp, jh, boost, roll, reverseRoll, flip = pcall(originalSample, ...)
    sampling = false
    if not ok then error(sx, 0) end
    local world, reason = drivableWorld()
    if world and manualActive() then world, reason = nil, "manual" end
    api.Reason = reason
    if not world then
        if controlling and reason ~= "manual" then brain:reset() end
        controlling, chosen = false, nil
        return sx, sy, jp, jh, boost, roll, reverseRoll, flip
    end
    local decided, result = pcall(brain.decide, brain, world, State.mySlot, State)
    if not decided then
        controlling, chosen = false, nil
        brain:reset()
        if recordError(result) then
            warn("SideswipeBot unloaded after repeated errors: " .. tostring(result))
            task.defer(api.Stop)
        end
        -- Hand this frame back to the player rather than freezing the car.
        return sx, sy, jp, jh, boost, roll, reverseRoll, flip
    end
    controlling, chosen = true, result
    return result.x, result.y, result.press, result.held, result.boost, false, false, false
end
automatedStick = function(...)
    if not sampling and controlling and chosen and api.Enabled then return chosen.x, chosen.y end
    return originalStick(...)
end
Controls.sample, Controls.stick = automatedSample, automatedStick
environment.SideswipeBot = api

------------------------------------------------------------------ events --
connect(pill.Activated, api.Toggle)
connect(closeButton.Activated, api.Stop)
connect(UIS.WindowFocusReleased, function()
    api.Focused, controlling, chosen = false, false, nil
    releaseAll()
    brain:reset()
end)
connect(UIS.WindowFocused, function() api.Focused = true end)
connect(UIS.InputBegan, function(input, processed)
    if input.KeyCode == Enum.KeyCode.F6 and not processed then api.Toggle(); return end
    if input.KeyCode == Enum.KeyCode.F7 and not processed then api.Stop(); return end
    if input.KeyCode == Enum.KeyCode.F8 and not processed then showDetails = not showDetails; refreshPanel(); return end
    if UIS:GetFocusedTextBox() or not isPlayerInput(input) then return end
    if not heldInputs[input.KeyCode] then
        heldInputs[input.KeyCode] = true
        heldCount = heldCount + 1
    end
end)
connect(UIS.InputEnded, function(input)
    local kind = input.UserInputType
    if kind == Enum.UserInputType.MouseButton1 or kind == Enum.UserInputType.Touch then dragStart = nil end
    if heldInputs[input.KeyCode] then
        heldInputs[input.KeyCode] = nil
        heldCount = math.max(0, heldCount - 1)
        manualUntil = os.clock() + config.manualGrace
    end
end)
local nextRefresh = 0
connect(RunService.Heartbeat, function()
    local now = os.clock()
    if now < nextRefresh then return end
    nextRefresh = now + 0.2
    refreshPanel()
end)
refreshPanel()
print("SideswipeBot " .. VERSION .. " ready (offline / freeplay only). F6 toggle, F7 unload, F8 details.")
