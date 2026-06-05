--[[
    JJS Auto Perfect Block
    ----------------------
    A timing-assist script for Jujutsu Shenanigans (JJS).

    It watches nearby enemy characters for attack animations and triggers a
    block at the moment an incoming hit is about to connect, so you land the
    game's "perfect block" / parry window instead of eating the hit.

    HOW IT WORKS
    - Scans players within `Config.Range` studs every frame.
    - When an enemy plays a known attack animation, it estimates when the hit
      lands (using a per-animation reaction offset) and presses the block key
      for a short window centred on that moment.
    - Falls back to a generic "any new animation" detector for attacks that
      aren't in the known list, so it still reacts to unmapped moves.

    USAGE
    - Load with any executor (drag-drop / loadstring). A small on-screen GUI
      appears with a toggle. Default toggle key: K.
    - Tune `Config` below. The two numbers you'll touch most:
        * ReactionOffset  -> raise if you block too early, lower if too late
        * BlockHoldTime   -> how long block is held around the predicted hit

    NOTE
    - Animation IDs vary by game update and by move. Add the ones you care
      about to `AttackAnimations` (copy IDs from the executor's animation
      logger). The generic detector covers the rest at lower precision.
    - This presses the in-game block keybind; set `Config.BlockKey` to match
      your keybind if you've rebound it.
]]

--// Services
local Players           = game:GetService("Players")
local RunService        = game:GetService("RunService")
local UserInputService  = game:GetService("UserInputService")
local VirtualInputManager = game:GetService("VirtualInputManager")

local LocalPlayer = Players.LocalPlayer

--==================================================================
--// CONFIG
--==================================================================
local Config = {
    Enabled        = true,           -- master on/off (also toggled in GUI)
    ToggleKey      = Enum.KeyCode.K, -- key to flip Enabled
    BlockKey       = Enum.KeyCode.F, -- in-game block keybind

    Range          = 18,             -- only react to enemies within this many studs
    ReactionOffset = 0.12,           -- seconds before predicted impact to start blocking
    BlockHoldTime  = 0.22,           -- how long to hold block around the hit
    Cooldown       = 0.30,           -- min seconds between auto-blocks (anti-spam)

    UseGenericDetector = true,       -- also react to unmapped attack animations
}

-- Known attack animation IDs -> estimated time from animation start to impact.
-- Add IDs from your animation logger. Key is the asset id string, value is
-- the seconds until the hit connects for that move.
local AttackAnimations = {
    -- ["rbxassetid://12345678"] = 0.30, -- example: basic M1
    -- ["rbxassetid://87654321"] = 0.55, -- example: a heavy skill
}

--==================================================================
--// INTERNAL STATE
--==================================================================
local lastBlockTime = 0
local trackedConnections = {}  -- [character] = {animConn, addedConn}

--==================================================================
--// HELPERS
--==================================================================
local function getMyRoot()
    local char = LocalPlayer.Character
    if not char then return nil end
    return char:FindFirstChild("HumanoidRootPart")
end

local function isAlive(character)
    local hum = character and character:FindFirstChildOfClass("Humanoid")
    return hum and hum.Health > 0
end

-- Hold the block key for `duration` seconds using VirtualInputManager.
local function pressBlock(duration)
    local key = Config.BlockKey
    VirtualInputManager:SendKeyEvent(true, key, false, game)
    task.delay(duration, function()
        VirtualInputManager:SendKeyEvent(false, key, false, game)
    end)
end

-- Schedule a perfect block for an attack that lands in `timeToImpact` seconds.
local function scheduleBlock(timeToImpact)
    if not Config.Enabled then return end

    local now = os.clock()
    if now - lastBlockTime < Config.Cooldown then return end
    lastBlockTime = now

    -- Start blocking `ReactionOffset` seconds before impact so the block is
    -- already active inside the perfect-block window when the hit connects.
    local delayBeforeBlock = math.max(0, timeToImpact - Config.ReactionOffset)

    task.delay(delayBeforeBlock, function()
        if Config.Enabled then
            pressBlock(Config.BlockHoldTime)
        end
    end)
end

-- Decide whether an enemy is close enough to threaten us.
local function inThreatRange(enemyChar)
    local myRoot = getMyRoot()
    local enemyRoot = enemyChar and enemyChar:FindFirstChild("HumanoidRootPart")
    if not (myRoot and enemyRoot) then return false end
    return (myRoot.Position - enemyRoot.Position).Magnitude <= Config.Range
end

-- Called whenever an enemy starts an animation.
local function onEnemyAnimation(enemyChar, animTrack)
    if not Config.Enabled then return end
    if not isAlive(enemyChar) then return end
    if not inThreatRange(enemyChar) then return end

    local anim = animTrack and animTrack.Animation
    local animId = anim and anim.AnimationId or nil
    if not animId then return end

    local mapped = AttackAnimations[animId]
    if mapped then
        -- Precise: we know how long this move takes to land.
        scheduleBlock(mapped)
    elseif Config.UseGenericDetector then
        -- Fallback: unknown move. Use the track length capped to a sane window
        -- as a rough impact estimate (most JJS attacks connect early-mid swing).
        local guess = animTrack.Length > 0 and math.min(animTrack.Length * 0.4, 0.5) or 0.3
        scheduleBlock(guess)
    end
end

--==================================================================
--// CHARACTER TRACKING
--==================================================================
local function trackCharacter(player)
    if player == LocalPlayer then return end
    local character = player.Character
    if not character then return end

    -- Clean up any prior connections for this character.
    if trackedConnections[character] then
        for _, c in ipairs(trackedConnections[character]) do
            pcall(function() c:Disconnect() end)
        end
    end

    local animator = character:FindFirstChildOfClass("Humanoid")
    animator = animator and animator:FindFirstChildOfClass("Animator")
    if not animator then return end

    local conns = {}
    table.insert(conns, animator.AnimationPlayed:Connect(function(track)
        onEnemyAnimation(character, track)
    end))
    trackedConnections[character] = conns
end

local function hookPlayer(player)
    if player == LocalPlayer then return end
    if player.Character then trackCharacter(player) end
    player.CharacterAdded:Connect(function()
        task.wait(0.2) -- let humanoid/animator replicate
        trackCharacter(player)
    end)
end

for _, p in ipairs(Players:GetPlayers()) do
    hookPlayer(p)
end
Players.PlayerAdded:Connect(hookPlayer)

Players.PlayerRemoving:Connect(function(player)
    if player.Character and trackedConnections[player.Character] then
        for _, c in ipairs(trackedConnections[player.Character]) do
            pcall(function() c:Disconnect() end)
        end
        trackedConnections[player.Character] = nil
    end
end)

--==================================================================
--// TOGGLE INPUT
--==================================================================
UserInputService.InputBegan:Connect(function(input, gameProcessed)
    if gameProcessed then return end
    if input.KeyCode == Config.ToggleKey then
        Config.Enabled = not Config.Enabled
        if _G.JJS_UpdateStatus then _G.JJS_UpdateStatus() end
    end
end)

--==================================================================
--// SIMPLE GUI
--==================================================================
local function buildGui()
    local gui = Instance.new("ScreenGui")
    gui.Name = "JJS_AutoBlockGui"
    gui.ResetOnSpawn = false
    gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    gui.Parent = (gethui and gethui()) or LocalPlayer:WaitForChild("PlayerGui")

    local frame = Instance.new("Frame")
    frame.Size = UDim2.fromOffset(200, 64)
    frame.Position = UDim2.fromScale(0.02, 0.5)
    frame.BackgroundColor3 = Color3.fromRGB(20, 20, 24)
    frame.BorderSizePixel = 0
    frame.Active = true
    frame.Draggable = true
    frame.Parent = gui

    local corner = Instance.new("UICorner")
    corner.CornerRadius = UDim.new(0, 8)
    corner.Parent = frame

    local title = Instance.new("TextLabel")
    title.Size = UDim2.new(1, -12, 0, 22)
    title.Position = UDim2.fromOffset(6, 4)
    title.BackgroundTransparency = 1
    title.Font = Enum.Font.GothamBold
    title.TextSize = 14
    title.TextXAlignment = Enum.TextXAlignment.Left
    title.TextColor3 = Color3.fromRGB(235, 235, 240)
    title.Text = "JJS Auto Perfect Block"
    title.Parent = frame

    local btn = Instance.new("TextButton")
    btn.Size = UDim2.new(1, -12, 0, 28)
    btn.Position = UDim2.fromOffset(6, 30)
    btn.Font = Enum.Font.GothamSemibold
    btn.TextSize = 14
    btn.BorderSizePixel = 0
    btn.AutoButtonColor = true
    btn.Parent = frame

    local btnCorner = Instance.new("UICorner")
    btnCorner.CornerRadius = UDim.new(0, 6)
    btnCorner.Parent = btn

    local function refresh()
        if Config.Enabled then
            btn.Text = "ENABLED  (" .. Config.ToggleKey.Name .. ")"
            btn.BackgroundColor3 = Color3.fromRGB(40, 140, 70)
            btn.TextColor3 = Color3.fromRGB(240, 255, 245)
        else
            btn.Text = "DISABLED  (" .. Config.ToggleKey.Name .. ")"
            btn.BackgroundColor3 = Color3.fromRGB(150, 50, 55)
            btn.TextColor3 = Color3.fromRGB(255, 240, 240)
        end
    end

    btn.MouseButton1Click:Connect(function()
        Config.Enabled = not Config.Enabled
        refresh()
    end)

    _G.JJS_UpdateStatus = refresh
    refresh()
end

pcall(buildGui)

print("[JJS Auto Perfect Block] loaded. Toggle key: " .. Config.ToggleKey.Name
    .. " | Block key: " .. Config.BlockKey.Name)
