-- Crude 2D stand-in for the game's World/Tuning modules. It is NOT the real
-- physics; it only has to exercise every code path the brain uses.
local M = {}
local S, UU = 3.0, 10
local FIELD, GOAL_DEPTH, GOAL_H, CEIL = 140, 10, 18, 60
local BALL_R, CAR_R = 2.5, 2.0

M.Tuning = {
    UU_PER_STUD = UU,
    Settings = { maxBoostSpeed = 900, boostForceScale = 20, dodgeShotRange = 120, jumpShotRange = 100,
        maxBoostFuel = 100, boostBurnRate = 33 },
    Car = { maxDriveSpeed = 500, moveForceScaler = 15 },
    World = { gravity = -10 },
}

local World = { STUD_PER_M = S, Vehicle = {} }
M.World = World
M.goalResetDepth = BALL_R -- how far past the line the centre goes before a reset

function World.Vehicle.axes(c)
    local qc, qs = c.body.qc, c.body.qs
    return qc * c.fs, qs * c.fs, -qs * c.us, qc * c.us
end

local function newCar(preset)
    return { preset = preset, fs = 1, us = 1, boost = 100, jumps = 1, dodges = 1, combined = 1,
        flipping = false, flipT = 0, tBallReset = 0, grounded = true, partial = false, collidingStatic = false,
        body = { x = 0, y = 1 / S, vx = 0, vy = 0, angle = 0, qc = 1, qs = 0, active = true },
        input = { x = 0, y = 0, press = false, held = false, boost = false }, events = {} }
end

function World.new(mut)
    return {
        t = 0, mut = mut or {}, B = { gravityScale = 0.9 }, cars = {}, events = {},
        ball = { x = FIELD / 2 / S, y = BALL_R / S, vx = 0, vy = 0 },
        ballR = BALL_R * UU,
        arena = { goals = {
            { tx = -GOAL_DEPTH / 2 * UU, tz = GOAL_H / 2 * UU, minZ = 0, maxZ = GOAL_H * UU,
                minX = -GOAL_DEPTH * UU, maxX = 0 },
            { tx = (FIELD + GOAL_DEPTH / 2) * UU, tz = GOAL_H / 2 * UU, minZ = 0, maxZ = GOAL_H * UU,
                minX = FIELD * UU, maxX = (FIELD + GOAL_DEPTH) * UU },
        } },
        score = { 0, 0 },
    }
end

function World.setCarPreset(world, i, preset)
    if not world.cars[i] then world.cars[i] = newCar(preset) end
    world.cars[i].preset = preset
end

local function copyInto(dst, src)
    for k, v in pairs(src) do
        if type(v) == "table" then
            dst[k] = dst[k] or {}
            copyInto(dst[k], v)
        else
            dst[k] = v
        end
    end
    return dst
end

function World.serialize(world)
    local data = { t = world.t, ball = copyInto({}, world.ball), cars = {} }
    for i, c in ipairs(world.cars) do
        local copy = {}
        for k, v in pairs(c) do if k ~= "events" then copy[k] = type(v) == "table" and copyInto({}, v) or v end end
        data.cars[i] = copy
    end
    return data
end

function World.deserialize(world, data)
    world.t = data.t
    copyInto(world.ball, data.ball)
    for i, c in ipairs(data.cars) do
        world.cars[i] = world.cars[i] or newCar(c.preset)
        copyInto(world.cars[i], c)
    end
end

function World.setInput(world, slot, x, y, press, held, boost)
    local input = world.cars[slot].input
    input.x, input.y, input.held, input.boost = x, y, held, boost
    if press then input.press = true end
end

local function event(world, ...) world.events[#world.events + 1] = { ... } end

local function rayHit(cx, cy, dx, dy, bx, by, range)
    local rx, ry = bx - cx, by - cy
    local along = rx * dx + ry * dy
    return along > 0 and along <= range + BALL_R and math.abs(rx * dy - ry * dx) < BALL_R
end

local function resetKickoff(world)
    local b = world.ball
    b.x, b.y, b.vx, b.vy = FIELD / 2 / S, BALL_R / S, 0, 0
    for i, c in ipairs(world.cars) do
        local team = i % 2 == 1 and 1 or 2
        local lane = math.floor((i - 1) / 2)
        local jitter = (math.random() - 0.5) * 20
        c.body.x = ((team == 1) and (40 - lane * 20) or (100 + lane * 20)) / S + jitter / S
        c.body.y, c.body.vx, c.body.vy = 1 / S, 0, 0
        c.body.angle, c.body.qc, c.body.qs = 0, 1, 0
        c.fs, c.grounded, c.boost = team == 1 and 1 or -1, true, 100
        c.jumps, c.dodges, c.combined, c.flipping = 1, 1, 1, false
    end
end
M.resetKickoff = resetKickoff

local function stepCar(world, i, c, dt)
    local b, inp = c.body, c.input
    local x, y, vx, vy = b.x * S, b.y * S, b.vx * S, b.vy * S
    local press = inp.press
    inp.press = false
    if c.flipping then
        c.flipT = c.flipT - dt
        if c.flipT <= 0 then c.flipping = false end
    end
    if c.grounded then
        if inp.x > 0.1 then c.fs = 1 elseif inp.x < -0.1 then c.fs = -1 end
        b.angle = 0
        vx = vx + inp.x * 29 * dt
        if math.abs(inp.x) < 0.1 then vx = vx * (1 - 3 * dt) end
        if inp.boost and c.boost > 0 then vx = vx + c.fs * 60 * dt; c.boost = c.boost - 33 * dt end
        local cap = inp.boost and 90 or 50
        vx = math.max(-cap, math.min(cap, vx))
        c.boost = math.min(100, c.boost + 25 * dt)
        c.jumps, c.dodges, c.combined = 1, 1, 1
        if press then vy, c.grounded = 22, false end
    else
        local sx, sy = inp.x, inp.y
        if sx * sx + sy * sy > 0.04 then
            local target = math.atan2(c.fs * sy, c.fs * sx)
            local diff = (target - b.angle + math.pi) % (2 * math.pi) - math.pi
            b.angle = b.angle + math.max(-8 * dt, math.min(8 * dt, diff))
        end
        local fx, fy = math.cos(b.angle) * c.fs, math.sin(b.angle) * c.fs
        if inp.boost and c.boost > 0 then
            vx, vy = vx + fx * 60 * dt, vy + fy * 60 * dt
            c.boost = c.boost - 33 * dt
        end
        if press and c.combined > 0 then
            local ball = world.ball
            local bx, by = ball.x * S, ball.y * S
            local mag = math.sqrt(sx * sx + sy * sy)
            if mag > 0.3 and c.dodges > 0 then
                vx, vy = vx + sx / mag * 25, vy + sy / mag * 25
                c.dodges, c.combined, c.flipping, c.flipT = 0, 0, true, 0.35
                if rayHit(x, y, -fx, -fy, bx, by, 12) then
                    ball.vx, ball.vy = -fx * 80 / S, -fy * 80 / S
                    event(world, "actionshot", i)
                end
            elseif c.jumps > 0 then
                vy = vy + 15
                c.jumps, c.combined = 0, 0
                local ux, uy = -math.sin(b.angle) * c.us, math.cos(b.angle) * c.us
                if rayHit(x, y, -ux, -uy, bx, by, 10) then
                    ball.vx, ball.vy = -ux * 75 / S, -uy * 75 / S
                    event(world, "actionshot", i)
                end
            end
        end
        vy = vy - 30 * (world.mut.gravityScale or 1) * dt
    end
    local speed = math.sqrt(vx * vx + vy * vy)
    if speed > 90 then vx, vy = vx / speed * 90, vy / speed * 90 end
    x, y = x + vx * dt, y + vy * dt
    c.collidingStatic = false
    local left, right = 1, FIELD - 1
    if y < GOAL_H then left, right = -GOAL_DEPTH + 1, FIELD + GOAL_DEPTH - 1 end
    if x < left then x, vx, c.collidingStatic = left, 0, true end
    if x > right then x, vx, c.collidingStatic = right, 0, true end
    if y > CEIL - 1 then y, vy, c.collidingStatic = CEIL - 1, math.min(vy, 0), true end
    if y <= 1 then
        y = 1
        if vy <= 0 then vy, c.grounded = 0, true end
    else
        c.grounded = false
    end
    if c.collidingStatic then c.boost = math.min(100, c.boost + 25 * dt) end
    b.x, b.y, b.vx, b.vy = x / S, y / S, vx / S, vy / S
    b.qc, b.qs = math.cos(b.angle), math.sin(b.angle)
end

function World.substep(world, dt)
    world.t = world.t + dt
    for i, c in ipairs(world.cars) do
        if c.body.active then stepCar(world, i, c, dt) end
    end
    local ball = world.ball
    local x, y, vx, vy = ball.x * S, ball.y * S, ball.vx * S, ball.vy * S
    vy = vy - 30 * 0.9 * (world.mut.gravityScale or 1) * dt
    vx, vy = vx * (1 - 0.05 * dt), vy * (1 - 0.05 * dt)
    x, y = x + vx * dt, y + vy * dt
    local r = BALL_R
    if y < r then y, vy, vx = r, math.abs(vy) * 0.6, vx * 0.98 end
    local inGoalX = x < 0 or x > FIELD
    local top = inGoalX and GOAL_H or CEIL
    if y > top - r then y, vy = top - r, -math.abs(vy) * 0.6 end
    local left, right = r, FIELD - r
    if y < GOAL_H - r then left, right = -GOAL_DEPTH + r, FIELD + GOAL_DEPTH - r end
    if x < left then x, vx = left, math.abs(vx) * 0.7 end
    if x > right then x, vx = right, -math.abs(vx) * 0.7 end
    local n = #world.cars
    local offset = math.random(0, n - 1)
    for k = 1, n do
        local i = (k - 1 + offset) % n + 1
        local c = world.cars[i]
        if c.body.active then
            local cx, cy = c.body.x * S, c.body.y * S
            local dx, dy = x - cx, y - cy
            local d = math.sqrt(dx * dx + dy * dy)
            if d < r + CAR_R and d > 1e-6 then
                local nx, ny = dx / d, dy / d
                local cvx, cvy = c.body.vx * S, c.body.vy * S
                local rel = (vx - cvx) * nx + (vy - cvy) * ny
                if rel < 0 then
                    vx, vy = vx - 1.5 * rel * nx + nx * 2, vy - 1.5 * rel * ny + ny * 2
                end
                x, y = cx + nx * (r + CAR_R), cy + ny * (r + CAR_R)
                event(world, "balltouch", i)
                local ux, uy = -c.body.qs * c.us, c.body.qc * c.us
                if not c.grounded and nx * ux + ny * uy < -0.6 then
                    c.tBallReset = world.t
                    c.jumps, c.dodges, c.combined = 1, 1, 1
                end
            end
        end
    end
    ball.x, ball.y, ball.vx, ball.vy = x / S, y / S, vx / S, vy / S
    local depth = M.goalResetDepth
    if x < -depth or x > FIELD + depth then
        local scorer = x < 0 and 2 or 1
        world.score[scorer] = world.score[scorer] + 1
        event(world, "goal", scorer)
        resetKickoff(world)
    end
end

function M.newMatch(carCount)
    local world = World.new({})
    for i = 1, carCount do World.setCarPreset(world, i, "gold") end
    resetKickoff(world)
    return world
end

return M
