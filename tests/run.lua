-- Play bots against each other in the mock world and report goals, errors and timing.
-- usage: lua5.1 run.lua <scriptPath> <baselineBrainPath> <mode> <seconds> [goalResetDepth]
--   mode: new-vs-old | old-vs-new | new-vs-new | old-vs-old | new2v2 | mixed2v2
--   env:  SEED=n (kickoff jitter), CFG="key=value,..." (brain config overrides), ROLES=1
local scriptPath, origPath, mode, seconds, depth = arg[1], arg[2], arg[3], tonumber(arg[4] or 600), tonumber(arg[5])
local here = arg[0]:match("^(.*)/[^/]*$") or "."
local M = dofile(here .. "/mock.lua")
if depth then M.goalResetDepth = depth end
local NewBot = dofile(scriptPath)
local createOld = dofile(origPath)

local function makeBrain(kind)
    if kind == "new" then
        local overrides = {}
        for k, v in (os.getenv("CFG") or ""):gmatch("([%w_]+)=([^,]+)") do
            if v == "true" then v = true elseif v == "false" then v = false else v = tonumber(v) or v end
            overrides[k] = v
        end
        return NewBot.createBrain(M.World, M.Tuning, { config = overrides })
    end
    return createOld(M.World, M.Tuning)
end

local layout = ({
    ["new-vs-old"] = { "new", "old" },
    ["old-vs-new"] = { "old", "new" },
    ["new-vs-new"] = { "new", "new" },
    ["old-vs-old"] = { "old", "old" },
    ["new2v2"] = { "new", "new", "new", "new" },
    ["mixed2v2"] = { "new", "old", "new", "old" },
})[mode]
assert(layout, "unknown mode " .. tostring(mode))

math.randomseed(tonumber(os.getenv("SEED") or "1"))
local world = M.newMatch(#layout)
local brains = {}
for i, kind in ipairs(layout) do brains[i] = makeBrain(kind) end
local state = { localSim = true, freeplayBoost = false }
local dt = 1 / 120
local steps = math.floor(seconds / dt)
local stats = { decisions = 0, errors = 0, nan = 0, maxMs = 0, totalMs = {}, roles = {}, actions = {},
    touches = {}, presses = {}, firstError = nil }
for i = 1, #layout do stats.totalMs[i] = 0; stats.touches[i] = 0; stats.presses[i] = 0 end

local lastToucher, kickoffAt, forensic = nil, 0, { own = { 0, 0 }, kick = { 0, 0 }, concededRole = {} }
local lastRole = {}
local function bad(n) return n ~= n or n == math.huge or n == -math.huge end
for step = 1, steps do
    if step % 2 == 0 then -- decide at 60 Hz like a render-rate input sampler
        for i, brain in ipairs(brains) do
            local t0 = os.clock()
            local ok, a = pcall(brain.decide, brain, world, i, state)
            local ms = (os.clock() - t0) * 1000
            stats.decisions = stats.decisions + 1
            stats.totalMs[i] = stats.totalMs[i] + ms
            if ms > stats.maxMs then stats.maxMs = ms end
            if not ok then
                stats.errors = stats.errors + 1
                stats.firstError = stats.firstError or a
                brain:reset()
            else
                if bad(a.x) or bad(a.y) or math.abs(a.x) > 1.0001 or math.abs(a.y) > 1.0001 then
                    stats.nan = stats.nan + 1
                end
                if a.press then stats.presses[i] = stats.presses[i] + 1 end
                M.World.setInput(world, i, a.x, a.y, a.press, a.held, a.boost)
                lastRole[i] = brain.role or "?"
                if layout[i] == "new" then
                    stats.roles[brain.role or "?"] = (stats.roles[brain.role or "?"] or 0) + 1
                    stats.actions[a.name] = (stats.actions[a.name] or 0) + 1
                end
            end
        end
    end
    M.World.substep(world, dt)
    for _, e in ipairs(world.events) do
        if e[1] == "balltouch" or e[1] == "actionshot" then
            stats.touches[e[2]] = stats.touches[e[2]] + 1
            lastToucher = e[2]
        elseif e[1] == "goal" then
            local scorer = e[2]
            local conceder = 3 - scorer
            if lastToucher and ((lastToucher % 2 == 1) and 1 or 2) == conceder then
                forensic.own[conceder] = forensic.own[conceder] + 1
            end
            if world.t - kickoffAt < 4 then forensic.kick[scorer] = forensic.kick[scorer] + 1 end
            local role = lastRole[conceder] or "?"
            local key = layout[conceder] .. ":" .. role
            forensic.concededRole[key] = (forensic.concededRole[key] or 0) + 1
            kickoffAt, lastToucher = world.t, nil
        end
    end
    world.events = {}
    for _, c in ipairs(world.cars) do c.events = {} end
end

local perBrain = {}
for i = 1, #layout do
    perBrain[#perBrain + 1] = string.format("%s#%d avg %.3fms touches %d presses %d", layout[i], i,
        stats.totalMs[i] / (stats.decisions / #layout), stats.touches[i], stats.presses[i])
end
print(string.format("%s %ds: score team1 %d - team2 %d | decisions %d errors %d badOutputs %d maxMs %.2f",
    mode, seconds, world.score[1], world.score[2], stats.decisions, stats.errors, stats.nan, stats.maxMs))
print("  " .. table.concat(perBrain, " | "))
do
    local parts = {}
    for k, n in pairs(forensic.concededRole) do parts[#parts + 1] = k .. "=" .. n end
    table.sort(parts)
    print(string.format("  forensic: ownGoals conceded by T1 %d T2 %d | kickoff goals scored T1 %d T2 %d",
        forensic.own[1], forensic.own[2], forensic.kick[1], forensic.kick[2]))
    print("  conceded while role: " .. table.concat(parts, ", "))
end
if stats.firstError then print("  first error: " .. tostring(stats.firstError)) end
if os.getenv("ROLES") then
    local list = {}
    for k, n in pairs(stats.roles) do list[#list + 1] = { k, n } end
    table.sort(list, function(a, b) return a[2] > b[2] end)
    local parts = {}
    for _, p in ipairs(list) do parts[#parts + 1] = p[1] .. "=" .. p[2] end
    print("  roles: " .. table.concat(parts, ", "))
    list = {}
    for k, n in pairs(stats.actions) do list[#list + 1] = { k, n } end
    table.sort(list, function(a, b) return a[2] > b[2] end)
    parts = {}
    for _, p in ipairs(list) do parts[#parts + 1] = p[1] .. "=" .. p[2] end
    print("  actions: " .. table.concat(parts, ", "))
end
