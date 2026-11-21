-- Print the bot's last decisions before each goal it concedes (bot = team 1).
-- usage: lua5.1 tests/dump.lua [seed] [goals]   (env WIN=frames STEP=stride)
local here = arg[0]:match("^(.*)/[^/]*$") or "."
local M = dofile(here .. "/mock.lua")
local NewBot = dofile(here .. "/../SideswipeBot.lua")
local createOld = dofile(here .. "/baseline_v0_6.lua")
math.randomseed(tonumber(arg[1] or 1))
local world = M.newMatch(2)
local brains = { NewBot.createBrain(M.World, M.Tuning, nil), createOld(M.World, M.Tuning) }
local state = { localSim = true }
local shown = 0
for step = 1, 120 * 300 do
    if step % 2 == 0 then
        for i, b in ipairs(brains) do
            local a = b:decide(world, i, state)
            M.World.setInput(world, i, a.x, a.y, a.press, a.held, a.boost)
        end
    end
    M.World.substep(world, 1 / 120)
    for _, e in ipairs(world.events) do
        if e[1] == "goal" and e[2] == 2 and shown < tonumber(arg[2] or 3) then
            shown = shown + 1
            print(("---- goal conceded at t=%.2f"):format(world.t))
            local tr = brains[1]:getTrace()
            for k = math.max(1, #tr - (tonumber(os.getenv("WIN")) or 50)), #tr, (tonumber(os.getenv("STEP")) or 2) do
                local f = tr[k]
                print(("t%.2f car(%.0f,%.0f v%.0f,%.0f) ball(%.0f,%.0f v%.0f,%.0f) %-8s %-22s stick(%.1f,%.1f)%s%s%s"):format(
                    f.t, f.x, f.y, f.vx, f.vy, f.bx, f.by, f.bvx, f.bvy, f.role, f.action, f.sx, f.sy,
                    f.press and " PRESS" or "", f.boosting and " BOOST" or "", f.safetyOverride and " SAFE" or ""))
            end
        end
    end
    world.events = {}
end
