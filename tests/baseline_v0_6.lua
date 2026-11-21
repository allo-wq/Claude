-- SideswipeBot v0.6.0 brain, unchanged: the baseline for A/B runs in the mock world.
local function createBrain(World, Tuning, clock)
    local B = { status = "waiting", exact = true, lastSearchMs = 0, plannerInterval = .1 }
    clock = clock or os.clock
    local S = World.STUD_PER_M
    local UU = Tuning.UU_PER_STUD
    local dt = 1 / 120
    local function clamp(x, a, b) return math.max(a, math.min(b, x)) end
    local function length(x, y) return math.sqrt(x * x + y * y) end
    local function unit(x, y)
        local n = length(x, y)
        if n < 1e-8 then return 0, 0 end
        return x / n, y / n
    end
    local function action(x, y, boost, press, held, name)
        local n = length(x, y)
        if n > 1 then x, y = x / n, y / n end
        return { x = x, y = y, boost = boost == true, press = press == true,
            held = held == true, name = name or "intercept" }
    end
    local function goal(g)
        return { x = g.tx / UU, y = g.tz / UU, lo = g.minZ / UU,
            hi = g.maxZ / UU, left = g.minX / UU, right = g.maxX / UU }
    end
    local function teamOf(state, slot)
        local record = state.roster and state.roster[slot]
        return record and record.team or (slot % 2 == 1 and 1 or 2)
    end
    local function sample(world, slot, state)
        local c = world.cars[slot]
        if not c or not c.body.active then return nil end
        local team = teamOf(state, slot)
        local own, enemy = world.arena.goals[team], world.arena.goals[3 - team]
        if not own or not enemy then return nil end
        local fx, fy, ux, uy = World.Vehicle.axes(c)
        local v = { c = c, x = c.body.x * S, y = c.body.y * S,
            vx = c.body.vx * S, vy = c.body.vy * S,
            bx = world.ball.x * S, by = world.ball.y * S,
            bvx = world.ball.vx * S, bvy = world.ball.vy * S,
            r = world.ballR / UU, fx = fx, fy = fy, ux = ux, uy = uy,
            own = goal(own), enemy = goal(enemy), team = team,
            grounded = c.grounded or c.partial, others = {} }
        v.sign = v.enemy.x > v.own.x and 1 or -1
        for i, other in ipairs(world.cars) do
            if i ~= slot and other.body.active then
                v.others[#v.others + 1] = { team = teamOf(state, i),
                    x = other.body.x * S, y = other.body.y * S,
                    vx = other.body.vx * S, vy = other.body.vy * S,
                    boost = other.boost, grounded = other.grounded or other.partial,
                    fx = other.body.qc * other.fs, fy = other.body.qs * other.fs }
            end
        end
        return v
    end
    local function arrival(actor, bx, by, bvx, bvy, radius)
        local estimate = 0
        for _ = 1, 3 do
            local lead = math.min(estimate, 1.2)
            local dx, dy = bx + bvx * lead - actor.x, by + bvy * lead - actor.y
            local nx, ny = unit(dx, dy)
            local distance = math.max(0, length(dx, dy) - radius - 2.2)
            local fuel = actor.boost or actor.c and actor.c.boost or 0
            local boosted = fuel > 5
            local cap = (boosted and Tuning.Settings.maxBoostSpeed or Tuning.Car.maxDriveSpeed) / UU
            local acceleration = (actor.grounded and Tuning.Car.moveForceScaler * 0.65
                or (boosted and Tuning.Settings.boostForceScale or 2.5)) * S
            local speed = clamp(actor.vx * nx + actor.vy * ny, -cap, cap)
            local accelTime = math.max(0, (cap - speed) / acceleration)
            local accelDistance = speed * accelTime + 0.5 * acceleration * accelTime * accelTime
            local travel = (-speed + math.sqrt(speed * speed + 2 * acceleration * distance)) / acceleration
            if distance > accelDistance then travel = accelTime + (distance - accelDistance) / cap end
            local turning = (actor.fx or 0) * nx + (actor.fy or 0) * ny
            estimate = travel + (not actor.grounded and turning < 0 and 0.12 or 0)
            if actor.grounded and dy > 8 and not boosted then estimate = estimate + math.min(0.6, dy / 45) end
        end
        return estimate
    end
    local function rayHits(v, dx, dy, range)
        local rx, ry = v.bx - v.x, v.by - v.y
        local along = rx * dx + ry * dy
        local across = math.abs(rx * dy - ry * dx)
        return along > 0 and along <= range + v.r and across < v.r * 0.82
    end
    local function attackAim(v)
        local low, high = v.enemy.lo + v.r * 1.5, v.enemy.hi - v.r * 1.5
        if high < low then low, high = v.enemy.y, v.enemy.y end
        local bestY, bestScore = v.enemy.y, -math.huge
        for _, fraction in ipairs({ 0.25, 0.55, 0.82 }) do
            local y = low + (high - low) * fraction
            local flight = math.abs(v.enemy.x - v.bx) / 65
            local score = 0
            for _, other in ipairs(v.others) do
                if other.team ~= v.team then
                    local px, py = other.x + other.vx * math.min(flight, 0.25), other.y + other.vy * math.min(flight, 0.25)
                    local t = clamp((px - v.bx) / ((v.enemy.x - v.bx) ~= 0 and (v.enemy.x - v.bx) or 0.01), 0, 1)
                    local lineY = v.by + (y - v.by) * t
                    score = score + math.min(18, math.abs(py - lineY)) * (t > 0.1 and 1 or 0)
                end
            end
            score = score - math.abs(y - v.by) * 0.08
            if score > bestScore then bestY, bestScore = y, score end
        end
        return v.enemy.x, bestY
    end
    local function threat(v)
        if v.bvx * v.sign >= -1 then return false end
        local line = v.sign > 0 and v.own.right or v.own.left
        local t = (line - v.bx) / v.bvx
        if t <= 0 or t > 2.2 then return false end
        local y = v.by + v.bvy * t - 0.5 * 28 * t * t
        return (y < v.own.hi + v.r * 2 and y > v.own.lo - v.r * 3)
            or ((v.bx - v.own.x) * v.sign < 48 and v.by < v.own.hi + v.r * 2), t
    end
    local forecast, shotWorld, lastWorld, lastMutKey
    local carried, carryUntil
    local kickoffUntil, recoveryUntil = -math.huge, -math.huge
    local recharging = false
    local nextHeavy = -math.huge
    local heavyDeadline = math.huge
    local lastMobility = -math.huge
    local chain = { phase = "idle", stamp = -math.huge, popAt = -math.huge, pops = 0, deadline = 0 }
    local lastForecast, lastPlan, lastPress = -math.huge, -math.huge, -math.huge
    local trajectory, snapshot = {}, nil
    local function mutKey(mut)
        local fields = {}
        for k, value in pairs(mut) do fields[#fields + 1] = tostring(k) .. "=" .. tostring(value) end
        table.sort(fields)
        return table.concat(fields, ";")
    end
    local function syncClone(copy, live, data)
        copy.t = live.t
        for i, c in ipairs(live.cars) do
            World.setCarPreset(copy, i, c.preset)
        end
        World.deserialize(copy, data)
        for i, c in ipairs(live.cars) do
            copy.cars[i].body.active = c.body.active
            copy.cars[i].events = {}
        end
        copy.events = {}
        copy.seekTeam, copy.seekSpeed, copy.seekCd = live.seekTeam, live.seekSpeed, live.seekCd
    end
    local function ensureClones(live)
        local key = mutKey(live.mut)
        if live ~= lastWorld or key ~= lastMutKey then
            forecast, shotWorld = World.new(live.mut), World.new(live.mut)
            lastWorld, lastMutKey = live, key
            lastForecast, lastPlan, lastPress = -math.huge, -math.huge, -math.huge
            trajectory = {}
        end
    end
    local function predict(live, v, now)
        if not B.heavy or now - lastForecast < 0.18 then return end
        lastForecast = now
        snapshot = World.serialize(live)
        syncClone(forecast, live, snapshot)
        for _, car in ipairs(forecast.cars) do car.body.active = false end
        trajectory = { { t = 0, x = v.bx, y = v.by } }
        local deadline = math.min(heavyDeadline, clock() + 0.0005)
        for i = 1, 48 do
            World.substep(forecast, dt)
            if i % 6 == 0 then
                trajectory[#trajectory + 1] = { t = i * dt, x = forecast.ball.x * S, y = forecast.ball.y * S }
                if clock() >= deadline then break end
            end
        end
    end
    local function target(live, v, aimX, aimY, defending, now)
        local bestX, bestY, best = v.bx, v.by, math.huge
        local age = math.max(0, now - lastForecast)
        local samples = trajectory
        if #samples < 3 then
            samples = {}
            local gravity = Tuning.World.gravity * (live.mut.gravityScale or 1)
                * (live.B.gravityScale or 0.9) * (live.mut.ballGravityScale or 1) * S
            for i = 1, 14 do
                local t = i * 0.08
                samples[i] = { t = t + age, x = v.bx + v.bvx * t,
                    y = math.max(v.r, v.by + v.bvy * t + 0.5 * gravity * t * t) }
            end
        end
        for _, point in ipairs(samples) do
            local t = point.t - age
            if t >= 0.05 then
                local dx, dy = unit(aimX - point.x, aimY - point.y)
                local offset = v.r + 2.1
                local x, y = point.x - dx * offset, math.max(1.4, point.y - dy * offset)
                if defending then x = point.x - v.sign * (v.r + 1.3); y = point.y end
                local ex, ey = x - v.x - v.vx * t * 0.65, y - v.y - v.vy * t * 0.65
                local reach = 10 * t + (v.c.boost > 4 and 33 or 14) * t * t
                local mismatch = math.max(0, length(ex, ey) - reach)
                local score = mismatch * 3 + t * (defending and 3 or 6)
                if v.grounded and ey > 12 and v.c.boost < 8 then score = score + ey end
                if score < best then bestX, bestY, best = x, y, score end
            end
        end
        if best == math.huge then
            local dx, dy = unit(aimX - v.bx, aimY - v.by)
            bestX, bestY = v.bx - dx * (v.r + 2.1), math.max(1.4, v.by - dy * (v.r + 2.1))
        end
        return bestX, bestY
    end
    local function steering(v, tx, ty, defending)
        local dx, dy = tx - v.x, ty - v.y
        local distance = length(dx, dy)
        local grounded = v.grounded
        local closeBall = length(v.bx - v.x, v.by - v.y) < v.r + 7
        local liftShot = closeBall and (v.bx - v.x) * v.sign > 1
            and v.by > v.y + 2 and v.by < v.y + 13
        local jump = grounded and ((dy > 4 and math.abs(dx) < math.max(10, dy * 1.5)) or liftShot)
        if jump and liftShot then dx, dy = v.sign * 5, math.max(dy, 8) end
        local x, y
        if grounded and not jump and ty < v.y + 7 then
            x = clamp(dx * 0.22 - v.vx * 0.027, -1, 1)
            y = 0
        else
            x, y = unit(dx * 3 - v.vx * 0.45, dy * 3 - v.vy * 0.5)
        end
        local alignment = v.fx * x + v.fy * y
        local boost = v.c.boost > (defending and 1 or 7) and alignment > 0.6
            and distance > 5 and not (grounded and y < -0.1)
        if distance < 8 and length(v.vx, v.vy) > distance * 4 then boost = false end
        return action(x, y, boost, jump, jump or (not grounded and v.vy > 0 and dy > 2), defending and "save" or "intercept")
    end
    local function shots(v, now, aimX, aimY, base, allowSpecial)
        local result = { base }
        local dx, dy = unit(aimX - v.bx, aimY - v.by)
        local rx, ry = unit(v.bx - v.x, v.by - v.y)
        local dist = length(v.bx - v.x, v.by - v.y)
        local attacks = rx * dx + ry * dy > 0.72 and rx * v.sign > 0.25
        local c = v.c
        local mayPress = now - lastPress >= 0.16 and c.combined > 0 and c.jumps > 0 and c.dodges > 0
        if not v.grounded and not c.flipping and dist < 15 and attacks then
            local tailX, tailY = -v.fx, -v.fy
            if allowSpecial and mayPress and rayHits(v, tailX, tailY, Tuning.Settings.dodgeShotRange / UU) then
                result[#result + 1] = action(-rx, -ry, false, true, false, "gold shot")
            end
            if allowSpecial and mayPress and rayHits(v, -v.ux, -v.uy, Tuning.Settings.jumpShotRange / UU) then
                result[#result + 1] = action(0, 0, false, true, false, "purple shot")
            end
            if allowSpecial then
                result[#result + 1] = action(-rx, -ry, false, false, false, "gold setup")
                local px, py = -ry * c.fs / c.us, rx * c.fs / c.us
                result[#result + 1] = action(px, py, false, false, false, "purple setup")
            end
            if mayPress and dist < v.r + 3.7 and v.fx * rx + v.fy * ry > 0.65 then
                result[#result + 1] = action(rx, ry, false, true, false, "power flip")
            end
        end
        result[#result + 1] = action(base.x, base.y, false, false, base.held, "controlled approach")
        return result
    end
    local function score(copy, slot, state, original, tx, ty, defending)
        local v = sample(copy, slot, state)
        if not v then return -math.huge end
        local toward = (v.bx - original.bx) * v.sign
        local score = toward * (defending and 2.5 or 1.8) + v.bvx * v.sign * 0.18
        score = score - length(v.x - tx, v.y - ty) * 0.38
        local separation = length(v.x - v.bx, v.y - v.by)
        score = score - math.max(0, separation - 14) * 0.35
        if not defending then
            score = score + v.vx * v.sign * 0.09
            score = score - math.max(0, (original.x - v.x) * v.sign) * 0.65
        end
        local goalY = clamp(v.by, v.enemy.lo + v.r, v.enemy.hi - v.r)
        score = score - math.abs(v.by - goalY) * 0.08 + v.c.boost * 0.025
        local ownEdge = v.sign > 0 and v.own.right or v.own.left
        local enemyEdge = v.sign > 0 and v.enemy.left or v.enemy.right
        if (v.bx - ownEdge) * v.sign < -v.r * 0.3 and v.by > v.own.lo and v.by < v.own.hi then score = score - 2000 end
        if (v.bx - enemyEdge) * v.sign > v.r * 0.3 and v.by > v.enemy.lo and v.by < v.enemy.hi then score = score + 2000 end
        if defending and (v.bx - ownEdge) * v.sign < 18 then score = score - math.max(0, -v.bvx * v.sign) * 0.6 end
        for _, other in ipairs(v.others) do
            if other.team ~= v.team and (other.x - original.bx) * v.sign > -3 then
                local separationX = math.abs(v.bx - other.x)
                if separationX < 13 then
                    score = score - math.max(0, 9 - math.abs(v.by - other.y)) * 0.8
                    if v.by > other.y + v.r + 3 and v.bvx * v.sign > 3 then score = score + 4 end
                end
            end
        end
        if not defending and v.c.tBallReset > original.c.tBallReset then
            score = score + 7 + math.max(0, v.c.boost - original.c.boost) * 0.08
        end
        return score
    end
    local function search(live, slot, state, v, candidates, tx, ty, defending)
        local data = World.serialize(live)
        local start = clock()
        local best, bestScore = candidates[1], -math.huge
        local baseline = candidates[1]
        table.sort(candidates, function(a, b)
            local function priority(a) return a.press and 3 or (a == baseline and 2 or 1) end
            return priority(a) > priority(b)
        end)
        local tested = 0
        for _, candidate in ipairs(candidates) do
            if tested > 0 and clock() >= heavyDeadline then break end
            syncClone(shotWorld, live, data)
            local fired = false
            for i = 1, 36 do
                local x, y, press = candidate.x, candidate.y, candidate.press and i == 1
                if not fired and (candidate.name == "gold setup" or candidate.name == "purple setup") then
                    local cv = sample(shotWorld, slot, state)
                    local dx, dy, range
                    if candidate.name == "gold setup" then
                        dx, dy, range = -cv.fx, -cv.fy, Tuning.Settings.dodgeShotRange / UU
                    else dx, dy, range = -cv.ux, -cv.uy, Tuning.Settings.jumpShotRange / UU end
                    if cv.c.combined > 0 and cv.c.jumps > 0 and cv.c.dodges > 0 and not cv.grounded
                        and rayHits(cv, dx, dy, range) then
                        press, fired = true, true
                        if candidate.name == "purple setup" then x, y = 0, 0 end
                    end
                end
                World.setInput(shotWorld, slot, x, y,
                    press, candidate.held and i < 23, candidate.boost, false, false, false)
                World.substep(shotWorld, dt)
            end
            local value = score(shotWorld, slot, state, v, tx, ty, defending)
            local touched = false
            for _, event in ipairs(shotWorld.events) do
                if (event[1] == "balltouch" or event[1] == "actionshot") and event[2] == slot then touched = true end
            end
            if (candidate.name == "power flip" or candidate.name == "flip over defender") and not touched then
                value = -math.huge
            end
            local nextVX = shotWorld.ball.vx * S
            if touched and nextVX * v.sign < -5 and nextVX * v.sign < v.bvx * v.sign - 3 then
                value = -math.huge
            end
            if value > bestScore then bestScore, best = value, candidate end
            tested = tested + 1
        end
        B.lastSearchMs, B.tested = (clock() - start) * 1000, tested
        return best
    end
    local function safeRecovery(live, slot, v, chosen)
        local data = World.serialize(live)
        local ownLine = v.sign > 0 and v.own.right or v.own.left
        local function evaluate(a)
            syncClone(shotWorld, live, data)
            local risk, ownTouch, crossed = 0, false, false
            local previousSpeed = v.bvx * v.sign
            local seen = 0
            for i = 1, 30 do
                World.setInput(shotWorld, slot, a.x, a.y, a.press and i == 1,
                    a.held and i <= 24, a.boost and i <= 24, false, false, false)
                World.substep(shotWorld, dt)
                local bx, by = shotWorld.ball.x * S, shotWorld.ball.y * S
                local speed = shotWorld.ball.vx * S * v.sign
                local touched = false
                for n = seen + 1, #shotWorld.events do
                    local e = shotWorld.events[n]
                    if (e[1] == "balltouch" or e[1] == "actionshot") and e[2] == slot then touched = true end
                end
                seen = #shotWorld.events
                if touched then
                    ownTouch = true
                    if speed < -3 and speed < previousSpeed - 2 then risk = math.max(risk, 200 + (-speed) * 2) end
                end
                if (bx - ownLine) * v.sign < 0 and by > v.own.lo - v.r * .4 and by < v.own.hi + v.r * .4 then
                    crossed = true
                    risk = math.max(risk, 100000 + (30 - i) * 100)
                end
                if ownTouch and speed < -3 and (bx - ownLine) * v.sign < 28
                    and by > v.own.lo - v.r and by < v.own.hi + v.r then
                    risk = math.max(risk, 800 + (-speed) * 3)
                end
                previousSpeed = speed
            end
            local car, ball = shotWorld.cars[slot].body, shotWorld.ball
            local vx, vy = ball.vx * S, ball.vy * S
            if vx * v.sign < -3 then
                local t = (ownLine - ball.x * S) / vx
                local y = ball.y * S + vy * t + .5 * Tuning.World.gravity * S * t * t
                if t > 0 and t < .9 and y > v.own.lo - v.r and y < v.own.hi + v.r then
                    risk = math.max(risk, ownTouch and 90000 or 50000)
                end
            end
            local separation = math.abs(car.y - ball.y) * S
            local progress = (ball.x * S - v.bx) * v.sign
            return risk, separation * .12 + progress * .25, crossed
        end
        local risk, quality = evaluate(chosen)
        B.safetyRisk, B.safetyOverride = risk, false
        if risk == 0 then return chosen end
        local best, bestRisk, bestQuality = chosen, risk, quality
        local mayJump = live.t - lastPress >= .16 and v.c.combined > 0 and v.c.jumps > 0 and v.c.dodges > 0
        local alternatives = {
            action(0, 0, false, false, false, "cancel risky touch"),
            action(0, 0, false, mayJump, mayJump, "vertical clear"),
            action(v.sign, 0, false, false, false, "brake backward touch"),
            action(v.sign * .4, 1, false, v.grounded and mayJump, v.grounded and mayJump, "avoid backward hit"),
            action(v.sign * .4, -1, false, false, false, "avoid backward hit")
        }
        for index, alternative in ipairs(alternatives) do
            if index > 1 and clock() >= heavyDeadline then break end
            local r, q = evaluate(alternative)
            if r < bestRisk or (r == bestRisk and q > bestQuality) then
                best, bestRisk, bestQuality = alternative, r, q
            end
        end
        B.safetyRisk, B.safetyOverride = bestRisk, best ~= chosen
        return best
    end
    function B:reset()
        lastWorld, lastMutKey, forecast, shotWorld = nil, nil, nil, nil
        trajectory = {}
        carried, carryUntil = nil, nil
        kickoffUntil, recoveryUntil = -math.huge, -math.huge
        recharging = false
        lastMobility = -math.huge
        nextHeavy = -math.huge
        chain = { phase = "idle", stamp = -math.huge, popAt = -math.huge, pops = 0, deadline = 0 }
        lastForecast, lastPlan, lastPress = -math.huge, -math.huge, -math.huge
    end
    function B:decide(live, slot, state)
        local v = sample(live, slot, state)
        if not v then self.status = "waiting for car"; return action(0, 0) end
        local now = live.t
        if not self.lastTime or now < self.lastTime or live ~= lastWorld then self:reset() end
        self.lastTime = now
        local started = clock()
        self.heavy = now >= nextHeavy
        if self.heavy then nextHeavy = now + self.plannerInterval end
        heavyDeadline = started + .0015
        ensureClones(live)
        predict(live, v, now)
        local middle = (v.own.x + v.enemy.x) * 0.5
        if math.abs(v.bx - middle) < 3 and v.by < v.r + 4
            and length(v.bvx, v.bvy) < 3 then
            kickoffUntil = now + 1.25
        end
        local kickoff = now < kickoffUntil
        local aimX, aimY = attackAim(v)
        local defending = threat(v)
        local capacity = Tuning.Settings.maxBoostFuel * math.max(live.mut.maxBoostScale or 1, 0)
        local unlimited = (live.mut.maxBoostScale or 1) < 0 or state.freeplayBoost == true and state.localSim
        local fuelRatio = (unlimited or capacity <= 0) and 1 or v.c.boost / capacity
        local canRecharge = capacity > 0 and (live.mut.boostRegenScale or 1) > 0
        if not recharging and fuelRatio < 0.22 and canRecharge then recharging = true end
        if not canRecharge then recharging = false end
        if recharging and fuelRatio >= 0.55 then recharging = false end
        local ownDistance = length(v.x - v.bx, v.y - v.by)
        local ours = arrival(v, v.bx, v.by, v.bvx, v.bvy, v.r)
        local enemyTime, allyTime = math.huge, math.huge
        local defender, defenderDistance = nil, math.huge
        for _, other in ipairs(v.others) do
            local t = arrival(other, v.bx, v.by, v.bvx, v.bvy, v.r)
            if other.team == v.team then
                if (v.bx - other.x) * v.sign > -2 then allyTime = math.min(allyTime, t) end
            else
                enemyTime = math.min(enemyTime, t)
                local gap = (other.x - v.bx) * v.sign
                if gap > -3 and gap < 28 and math.abs(other.y - v.by) < 12 and gap < defenderDistance then
                    defender, defenderDistance = other, gap
                end
            end
        end
        local resetOpportunity = not v.grounded and not v.c.flipping and v.by > 12
            and ownDistance < v.r + 5 and (v.c.dodges <= 0 or v.c.combined <= 0)
            and (v.bx - v.own.x) * v.sign > 32
        local actualReset = v.c.tBallReset > 0 and now - v.c.tBallReset < .14
        local chainSafe = not defending and not v.grounded and v.by > v.y + 2
            and (v.bx - middle) * v.sign > 8 and enemyTime > .22
        if chain.phase ~= "idle" and (not chainSafe or now > chain.deadline or ownDistance > 65) then chain.phase = "idle" end
        if chainSafe and actualReset and v.c.tBallReset > chain.stamp then
            if chain.phase == "idle" or (chain.phase == "catch" and now - chain.popAt > .16) then
                chain.phase, chain.stamp, chain.readyAt = "settle", v.c.tBallReset, now + (chain.pops > 0 and .025 or .12)
                chain.deadline = now + 3.5
            end
        end
        local goalSide = (v.bx - v.x) * v.sign > -v.r
        local firstTouch = enemyTime < math.huge and ours + 0.1 < enemyTime and allyTime + 0.12 >= ours
            and goalSide and ownDistance > v.r + 3 and ours < 1.5
        local reachableContest = enemyTime < 1.1 and ours < enemyTime + 0.20
            and ownDistance < 40 and goalSide and allyTime + 0.12 >= ours
        local returnNeeded = not v.grounded
            and ((v.x - v.bx) * v.sign > 8 or ((v.bx - middle) * v.sign < 0 and v.y > v.by + 15))
            and ((v.bvx * v.sign < -5) or enemyTime < ours + .2)
        local gravity = math.max(1, -Tuning.World.gravity * S * (live.mut.gravityScale or 1))
        local coastRise = math.max(0, v.vy) ^ 2 / (2 * gravity)
        local missingHeight = math.max(0, v.by - v.y - coastRise - 4)
        local climbFuel = Tuning.Settings.boostBurnRate * math.sqrt(2 * missingHeight /
            math.max(1, Tuning.Settings.boostForceScale * S))
        local cannotClimb = not unlimited and missingHeight > 8 and v.c.boost < climbFuel + capacity * .12
        local pursuit = not v.grounded and not v.c.flipping and ownDistance > 20
            and (v.bx - v.x) * v.sign > 14 and (v.bx - middle) * v.sign > 5
            and v.c.combined > 0 and v.c.jumps > 0 and v.c.dodges > 0
            and v.bvx * v.sign > 2 and math.abs(v.by - v.y) < 24
        local role = "attack"
        if defending then role = "save"
        elseif kickoff then role = "kickoff"
        elseif chain.phase ~= "idle" and chainSafe then role = "chain reset"
        elseif returnNeeded then role = "return"
        elseif cannotClimb and not resetOpportunity then
            role = (v.grounded or v.c.collidingStatic) and "recharge" or "recover"
            recharging = true
        elseif firstTouch then role = "first touch"
        elseif resetOpportunity then role = "reset"
        elseif reachableContest then role = "challenge"
        elseif pursuit then role = "pursuit"
        elseif recharging and not (ownDistance < v.r + 4 and (v.bx - middle) * v.sign > 15
            and (v.bx - v.x) * v.sign > 1) then
            role = (v.grounded or v.c.collidingStatic) and "recharge" or "recover"
        elseif (v.x - v.bx) * v.sign > v.r + 3 then role = "rotate"
        elseif allyTime + 0.2 < ours and ownDistance > 16 then role = "support"
        elseif enemyTime + 0.18 < ours and (v.bx - middle) * v.sign < 12 and ownDistance > 16 then role = "shadow"
        elseif ownDistance < 18 and (v.bx - v.x) * v.sign > 0
            and math.abs(v.bvx) < 35 and enemyTime > ours + 0.15 then role = "possession"
        elseif now < recoveryUntil then role = "follow-through" end
        local tx, ty = target(live, v, aimX, aimY, defending, now)
        if defending then
            local catchTime = clamp(length(v.bx - v.x, v.by - v.y) / 70, 0.08, 0.4)
            tx = v.bx + v.bvx * catchTime - v.sign * (v.r + 1.5)
            ty = math.max(2, v.by + v.bvy * catchTime)
            local guard = (v.sign > 0 and v.own.right or v.own.left) + v.sign * (v.r + 5)
            tx = v.sign > 0 and math.max(tx, guard) or math.min(tx, guard)
            ty = clamp(ty, 2, v.own.hi - 1)
            if v.by > v.y + 5 and math.abs(v.bx - v.x) < 18 then
                local underX = v.bx + v.bvx * .12
                tx = v.sign > 0 and math.max(underX, guard) or math.min(underX, guard)
                ty = math.max(2, v.by - v.r - 1.8)
            end
        end
        if not defending and (v.x - v.bx) * v.sign > v.r + 2
            and math.abs(v.y - v.by) < v.r + 5 then
            tx, ty = v.bx - v.sign * (v.r + 6), v.by + v.r + 7
        end
        if not defending and ownDistance > 16 then
            for _, other in ipairs(v.others) do
                if other.team == v.team and (v.bx - other.x) * v.sign > -2
                    and length(other.x - v.bx, other.y - v.by) + 9 < ownDistance then
                    tx = v.bx - v.sign * 20
                    ty = math.max(2, math.min(v.by * 0.5, v.own.hi * 0.65))
                    break
                end
            end
        end
        local guard = (v.sign > 0 and v.own.right or v.own.left) + v.sign * (v.r + 6)
        local function safeX(x)
            return v.sign > 0 and math.max(x, guard) or math.min(x, guard)
        end
        if role == "shadow" or role == "support" then
            tx = safeX(v.bx - v.sign * (role == "shadow" and 16 or 23))
            ty = math.max(2, math.min(v.by * 0.6, v.own.hi * 0.6))
        elseif role == "recharge" then
            tx, ty = safeX(v.bx - v.sign * 18), 2
            if math.abs(tx - v.x) < 12 then tx = v.x end
        elseif role == "recover" then
            tx, ty = safeX(v.bx - v.sign * 18), 2
        elseif role == "return" then
            tx = safeX(v.bx - v.sign * 14)
            ty = math.max(3, math.min(v.by, v.own.hi * 0.6))
        elseif role == "challenge" or role == "first touch" or role == "pursuit" then
            local lead = clamp(ours * 0.65, 0.05, 0.5)
            tx, ty = v.bx + v.bvx * lead + v.sign, math.max(2, v.by + v.bvy * lead - 1)
        elseif role == "possession" then
            tx, ty = v.bx + v.sign * 1.5, math.max(2, v.by - 2)
        elseif role == "rotate" then
            tx = safeX(v.bx - v.sign * (v.r + 7))
            ty = v.by > v.r + 10 and math.max(2, v.by - v.r - 6) or v.by + v.r + 7
        end
        local base = steering(v, tx, ty, defending)
        base.name = role
        if (role == "first touch" or role == "challenge" or role == "pursuit") and ownDistance > v.r + 3 then
            base.x, base.y = unit(tx - v.x - v.vx * 0.08, ty - v.y - v.vy * 0.08)
            if v.grounded and ty < v.y + 5 then base.x, base.y = v.sign, 0 end
            base.boost = (unlimited or v.c.boost > 1) and v.fx * base.x + v.fy * base.y > 0.5
        end
        if role == "save" and ownDistance < v.r + 5 and v.by > v.y + 2
            and math.abs(v.bx - v.x) < v.r + 1 and v.uy > .7
            and v.c.combined > 0 and v.c.jumps > 0 and v.c.dodges > 0 and now - lastPress > .2 then
            base = action(0, 0, false, true, true, "vertical clear")
        end
        if role == "recharge" then
            base.boost, base.press, base.held = false, false, false
            base.x, base.y = clamp((tx - v.x) * 0.08 - v.vx * 0.04, -0.5, 0.5), 0
        elseif role == "recover" then
            base.x, base.y = unit(clamp((tx - v.x) * 0.015, -0.22, 0.22), -1)
            base.boost, base.press, base.held = v.c.boost > 1 and v.y > 10
                and v.fx * base.x + v.fy * base.y > .7, false, false
            base.name = base.boost and "recovery dive" or "fast fall"
            if v.y > 24 and ownDistance > 20 and not v.c.flipping
                and v.c.combined > 0 and v.c.jumps > 0 and v.c.dodges > 0
                and v.fx * base.x + v.fy * base.y > .8 and now - lastMobility > .75
                and now - lastPress > .2 then
                base.press, base.boost, base.name = true, false, "surface recovery flip"
                lastMobility = now
            end
        elseif role == "possession" then
            local controlledSpeed = math.max(10, v.bvx * v.sign + 5)
            base.boost = v.vx * v.sign < controlledSpeed and ownDistance > v.r + 3 and fuelRatio > 0.45
            base.name = "controlled touch"
        elseif role == "return" then
            base.x, base.y = unit(tx - v.x - v.vx * 0.18, ty - v.y - v.vy * 0.12)
            base.held, base.press = false, false
            base.boost = v.c.boost > 3 and v.fx * base.x + v.fy * base.y > 0.5
            if not v.c.flipping and v.c.combined > 0 and v.c.jumps > 0 and v.c.dodges > 0
                and now - lastMobility > 0.75 and now - lastPress > 0.2
                and v.fx * base.x + v.fy * base.y > 0.7
                and length(tx - v.x, ty - v.y) > 22 then
                base.press, base.boost, base.name = true, false, "defensive return flip"
                lastMobility = now
            end
        elseif role == "reset" then
            local rx, ry = unit(v.bx - v.x, v.by - v.y)
            base.x, base.y = -ry * v.c.fs / v.c.us, rx * v.c.fs / v.c.us
            base.press, base.held, base.boost, base.name = false, false, false, "wheels to ball"
        elseif role == "chain reset" then
            local rx, ry = unit(v.bx - v.x, v.by - v.y)
            local wheels = -v.ux * rx - v.uy * ry
            base.press, base.held, base.boost = false, false, false
            if chain.phase == "settle" then
                base.x, base.y = -ry * v.c.fs / v.c.us, rx * v.c.fs / v.c.us
                base.name = "chain reset: wheel contact"
                if now >= chain.readyAt and (chain.pops > 0 or fuelRatio > .8 or now > chain.readyAt + .18) and wheels > .8 and ownDistance < v.r + 2.5
                    and v.c.combined > 0 and v.c.jumps > 0 and v.c.dodges > 0 and now - lastPress > .16 then
                    base.x, base.y, base.press, base.name = 0, 0, true, "chain reset: pop"
                    chain.phase, chain.popAt, chain.deadline = "catch", now, now + 3.5
                    chain.stamp, chain.pops = v.c.tBallReset, chain.pops + 1
                end
            elseif ownDistance < v.r + 5 then
                base.x, base.y = -ry * v.c.fs / v.c.us, rx * v.c.fs / v.c.us
                base.name = "chain reset: reacquire wheels"
            else
                base.x, base.y = unit((v.bx - v.x) * 3 + (v.bvx - v.vx) * .5,
                    (v.by - v.y) * 3 + (v.bvy - v.vy) * .5)
                base.boost = v.c.boost > 12 and v.fx * base.x + v.fy * base.y > .5
                base.name = "chain reset: catch ball"
            end
        end
        if role == "save" and not v.grounded and not v.c.flipping and ownDistance > 24
            and v.c.combined > 0 and v.c.jumps > 0 and v.c.dodges > 0
            and now - lastMobility > .75 and now - lastPress > .2
            and v.fx * base.x + v.fy * base.y > .8 then
            base.press, base.held, base.boost, base.name = true, false, false, "defensive return flip"
            lastMobility = now
        end
        if (role == "pursuit" or role == "first touch") and not v.grounded and not v.c.flipping
            and v.c.combined > 0 and v.c.jumps > 0 and v.c.dodges > 0
            and ownDistance > 22 and ownDistance < 58 and now - lastMobility > .75
            and now - lastPress > .2 and base.x * v.sign > .5
            and v.fx * base.x + v.fy * base.y > .8
            and v.vx * base.x + v.vy * base.y < 40 then
            base.press, base.held, base.boost, base.name = true, false, false, "pursuit flip"
            lastMobility = now
        end
        local recovering = now < recoveryUntil
        local enemyEdge = v.sign > 0 and v.enemy.left or v.enemy.right
        local finishing = math.abs(enemyEdge - v.bx) < 30
        local allowSpecial = not kickoff and not recovering
            and (role == "challenge" or role == "save" or (role == "attack" and (finishing or defender))
                or (role == "possession" and v.by > v.enemy.lo and finishing))
        if not allowSpecial then carried, carryUntil = nil, nil end
        local candidates = shots(v, now, aimX, aimY, base, allowSpecial)
        if (role == "challenge" or role == "possession" or role == "attack") and ownDistance < v.r + 7
            and (v.bx - v.x) * v.sign > 0 and now - lastPress > 0.2
            and v.c.combined > 0 and v.c.jumps > 0 and v.c.dodges > 0 then
            if defender and v.grounded then
                candidates[#candidates + 1] = action(v.sign * 0.55, 1, false, true, true, "chip over defender")
            elseif defender and not v.c.flipping and not v.grounded then
                local dx, dy = unit(v.bx - v.x, v.by - v.y + v.r * 0.7)
                candidates[#candidates + 1] = action(dx, dy, false, true, false, "flip over defender")
            end
        end
        local chosen = base
        local distance = length(v.bx - v.x, v.by - v.y)
        if self.heavy and #candidates > 2 and now - lastPlan >= 0.08 and clock() < heavyDeadline then
            lastPlan = now
            chosen = search(live, slot, state, v, candidates, tx, ty, defending)
            carried = chosen.name == "gold setup" or chosen.name == "purple setup"
            carried = carried and chosen or nil
            carryUntil = now + 0.1
        elseif #candidates > 2 then
            if carried and now < carryUntil then chosen = carried end
            for _, candidate in ipairs(candidates) do
                if candidate.press and (candidate.name == "gold shot" or candidate.name == "purple shot") then chosen = candidate; break end
            end
        end
        if chosen.name == "gold setup" or chosen.name == "purple setup" then
            local readyName = chosen.name == "gold setup" and "gold shot" or "purple shot"
            for _, candidate in ipairs(candidates) do
                if candidate.name == readyName then chosen = candidate; break end
            end
        end
        if chosen.press and now - lastPress < 0.16 then chosen.press = false end
        if chosen.name == "purple shot" then chosen.x, chosen.y, chosen.boost = 0, 0, false end
        if defender and chosen == base and chosen.press and chosen.y > 0.5
            and v.grounded and (role == "challenge" or role == "possession") then
            chosen.name = "chip over defender"
        end
        local reserve = capacity * ((v.bx - middle) * v.sign < 0 and 0.25 or 0.16)
        local distanceToTarget = length(tx - v.x, ty - v.y)
        local travelTime = clamp(distanceToTarget / 60, 0.08, 0.6)
        local requiredFuel = Tuning.Settings.boostBurnRate * travelTime
        local alignment = v.fx * chosen.x + v.fy * chosen.y
        local closingSpeed = v.vx * chosen.x + v.vy * chosen.y
        local immediateTouch = ownDistance < v.r + 4 and (v.bx - v.x) * v.sign > 1
            and (v.bx - middle) * v.sign > 15 and (role == "attack" or role == "challenge")
        if not unlimited and chosen.boost then
            local urgentReturn = role == "return" or role == "save" or role == "first touch" or role == "challenge" or role == "pursuit"
                or (role == "recover" and v.y > 10 and ty < v.y - 8)
            if role == "recharge" or role == "recover" or (v.c.boost <= reserve and not defending and not immediateTouch)
                or alignment < 0.65 or v.c.flipping
                or (closingSpeed > 48 and not defending)
                or (distanceToTarget < 20 and closingSpeed > distanceToTarget * 2.5 and not defending)
                or (distanceToTarget < 7 and closingSpeed > distanceToTarget * 3) then chosen.boost = false end
            if urgentReturn and v.c.boost > 1 and alignment > 0.55 and distanceToTarget > 8
                and closingSpeed < 60 and not chosen.press then chosen.boost = true end
            if not v.grounded and not defending and ty > v.y + 10
                and v.c.boost < requiredFuel + reserve * 0.5 and not immediateTouch then chosen.boost = false end
        end
        if role == "chain reset" and chain.phase == "catch" and ownDistance > v.r + 5
            and v.c.boost > 1 and alignment > .55 and not chosen.press then chosen.boost = true end
        if (role == "possession" or role == "attack") and ownDistance < v.r + 7
            and not finishing and not defender and enemyTime > .55 then
            chosen.press, chosen.boost, chosen.held = false, false, false
            chosen.name = "soft possession touch"
            if v.grounded then
                local desiredSpeed = v.bvx + v.sign * 7
                chosen.x, chosen.y = clamp((desiredSpeed - v.vx) * .09, -1, 1), 0
            end
        end
        local contactX, contactY = v.bx - v.x, v.by - v.y
        local relativeSpeed = length(v.vx - v.bvx, v.vy - v.bvy)
        local riskRange = v.r + 4 + math.min(18, relativeSpeed * .2)
        local towardOwnBall = contactX * v.sign < -1 and ownDistance < v.r + 6
            and math.abs(contactY) < v.r + 3 and chosen.x * v.sign < -.1
        if towardOwnBall and role ~= "save" then
            local hop = v.grounded and v.c.combined > 0 and now - lastPress >= .16
            chosen = action(v.sign * .4, v.by < v.r + 10 and 1 or -1,
                false, hop, hop, "avoid backward hit")
            self.safetyOverride = true
        elseif ownDistance < riskRange or (chosen.press and ownDistance < 25) then
            if self.heavy and clock() < heavyDeadline then
                chosen = safeRecovery(live, slot, v, chosen)
            else
                local rx, ry = unit(v.bx - v.x, v.by - v.y)
                local approach = (v.vx - v.bvx) * rx + (v.vy - v.bvy) * ry
                if rx * v.sign < -.15 and (approach > 1 or chosen.x * v.sign < -.1 or chosen.press) and ownDistance < v.r + 6 then
                    chosen = action(v.sign * .4, v.by < v.r + 10 and 1 or -1,
                        false, false, false, "avoid backward hit")
                    self.safetyOverride = true
                else self.safetyOverride = false end
            end
        else self.safetyRisk, self.safetyOverride = 0, false end
        if chosen.press then
            lastPress = now
            if chosen.name == "gold shot" or chosen.name == "purple shot" or chosen.name == "power flip" then
                recoveryUntil = now + 0.7
                carried, carryUntil = nil, nil
            end
        end
        self.status, self.targetX, self.targetY = chosen.name, tx, ty
        self.distance, self.defending = distance, defending
        self.kickoff, self.recovering = kickoff, recovering
        self.role, self.fuelRatio, self.reserve, self.requiredFuel = role, fuelRatio, reserve, requiredFuel
        self.recharging = recharging
        self.chainPhase, self.chainPops = chain.phase, chain.pops
        self.ourArrival, self.enemyArrival = ours, enemyTime
        self.decisionMs = (clock() - started) * 1000
        self.trace = self.trace or {}
        self.trace[#self.trace + 1] = { t = now, x = v.x, y = v.y, vx = v.vx, vy = v.vy,
            a = v.c.body.angle, bx = v.bx, by = v.by, bvx = v.bvx, bvy = v.bvy,
            team = v.team, boost = v.c.boost, jumps = v.c.jumps, dodges = v.c.dodges,
            role = role, action = chosen.name, sx = chosen.x, sy = chosen.y,
            press = chosen.press, held = chosen.held, boosting = chosen.boost,
            safetyRisk = self.safetyRisk, safetyOverride = self.safetyOverride }
        if #self.trace > 240 then table.remove(self.trace, 1) end
        if v.c.tBallReset > 0 and (not self.lastReset or v.c.tBallReset > self.lastReset) then
            self.resetCount = (self.resetCount or 0) + 1
            self.lastReset = v.c.tBallReset
            lastPress = math.min(lastPress, now - 0.16)
        end
        return chosen
    end
    return B
end
return createBrain
