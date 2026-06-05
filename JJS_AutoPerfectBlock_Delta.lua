--[[
    ╔══════════════════════════════════════════════╗
    ║      JJS AUTO PERFECT BLOCK  •  DELTA HUB     ║
    ╚══════════════════════════════════════════════╝

    Auto perfect-block / parry assist for Jujutsu Shenanigans.
    Built for the Delta executor (mobile + PC). Just paste & execute.

    - Watches nearby enemies for attack animations.
    - Blocks at the moment the hit lands so you catch the perfect-block window.
    - Fully on-screen GUI (no keyboard needed) — works on mobile.
    - Triggers block via the on-screen mobile button when present, with a
      keypress fallback for PC.

    Tune it with the on-screen +/- buttons, or edit Config below.
]]

--// Services
local Players             = game:GetService("Players")
local RunService          = game:GetService("RunService")
local UserInputService    = game:GetService("UserInputService")
local VirtualInputManager = game:GetService("VirtualInputManager")
local GuiService          = game:GetService("GuiService")

local LocalPlayer = Players.LocalPlayer

--==================================================================
--// CONFIG
--==================================================================
local Config = {
    Enabled        = true,

    BlockKey       = Enum.KeyCode.F, -- PC block keybind (fallback)
    Range          = 18,             -- only react to enemies within N studs
    ReactionOffset = 0.12,           -- start blocking this many secs before impact
    BlockHoldTime  = 0.22,           -- how long to hold block around the hit
    Cooldown       = 0.30,           -- min secs between auto-blocks (anti-spam)

    UseGenericDetector = true,       -- also react to unmapped attack animations
}

-- Known attack animation IDs -> seconds from anim start to impact.
-- Use Delta's animation logger to add the moves you care about.
local AttackAnimations = {
    -- ["rbxassetid://12345678"] = 0.30,
}

--==================================================================
--// STATE
--==================================================================
local lastBlockTime = 0
local trackedConnections = {}
local isHoldingBlock = false

--==================================================================
--// BLOCK INPUT (mobile-aware)
--==================================================================
-- Try to find the game's on-screen mobile block button so we can drive it
-- directly on touch devices. JJS exposes touch action buttons in the GUI.
local function findMobileBlockButton()
    local pg = LocalPlayer:FindFirstChild("PlayerGui")
    if not pg then return nil end
    for _, gui in ipairs(pg:GetDescendants()) do
        if gui:IsA("ImageButton") or gui:IsA("TextButton") then
            local n = string.lower(gui.Name)
            if n == "block" or n:find("block") or n == "jumpbutton" and false then
                return gui
            end
        end
    end
    return nil
end

-- Press block down.
local function blockDown()
    if isHoldingBlock then return end
    isHoldingBlock = true

    -- PC / executor keypress (works in Delta for most keybinds).
    VirtualInputManager:SendKeyEvent(true, Config.BlockKey, false, game)

    -- Mobile fallback: fire the touch button's pressed signals if found.
    local btn = findMobileBlockButton()
    if btn then
        pcall(function()
            for _, sig in ipairs({"MouseButton1Down", "TouchTap"}) do
                local ev = btn:FindFirstChild(sig)
            end
            -- Drive the standard input begin on the button via VIM tap at its centre.
            local pos = btn.AbsolutePosition
            local size = btn.AbsoluteSize
            local cx = pos.X + size.X / 2
            local cy = pos.Y + size.Y / 2 + GuiService:GetGuiInset().Y
            VirtualInputManager:SendTouchEvent(1, 1, cx, cy)
        end)
    end
end

-- Release block.
local function blockUp()
    if not isHoldingBlock then return end
    isHoldingBlock = false

    VirtualInputManager:SendKeyEvent(false, Config.BlockKey, false, game)

    local btn = findMobileBlockButton()
    if btn then
        pcall(function()
            local pos = btn.AbsolutePosition
            local size = btn.AbsoluteSize
            local cx = pos.X + size.X / 2
            local cy = pos.Y + size.Y / 2 + GuiService:GetGuiInset().Y
            VirtualInputManager:SendTouchEvent(2, 1, cx, cy) -- 2 = touch end
        end)
    end
end

local function pressBlock(duration)
    blockDown()
    task.delay(duration, blockUp)
end

--==================================================================
--// HELPERS
--==================================================================
local function getMyRoot()
    local char = LocalPlayer.Character
    return char and char:FindFirstChild("HumanoidRootPart")
end

local function isAlive(character)
    local hum = character and character:FindFirstChildOfClass("Humanoid")
    return hum and hum.Health > 0
end

local function inThreatRange(enemyChar)
    local myRoot = getMyRoot()
    local enemyRoot = enemyChar and enemyChar:FindFirstChild("HumanoidRootPart")
    if not (myRoot and enemyRoot) then return false end
    return (myRoot.Position - enemyRoot.Position).Magnitude <= Config.Range
end

local function scheduleBlock(timeToImpact)
    if not Config.Enabled then return end
    local now = os.clock()
    if now - lastBlockTime < Config.Cooldown then return end
    lastBlockTime = now

    local delayBeforeBlock = math.max(0, timeToImpact - Config.ReactionOffset)
    task.delay(delayBeforeBlock, function()
        if Config.Enabled then pressBlock(Config.BlockHoldTime) end
    end)
end

local function onEnemyAnimation(enemyChar, animTrack)
    if not Config.Enabled then return end
    if not isAlive(enemyChar) then return end
    if not inThreatRange(enemyChar) then return end

    local anim = animTrack and animTrack.Animation
    local animId = anim and anim.AnimationId
    if not animId then return end

    local mapped = AttackAnimations[animId]
    if mapped then
        scheduleBlock(mapped)
    elseif Config.UseGenericDetector then
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

    if trackedConnections[character] then
        for _, c in ipairs(trackedConnections[character]) do
            pcall(function() c:Disconnect() end)
        end
    end

    local hum = character:FindFirstChildOfClass("Humanoid")
    local animator = hum and hum:FindFirstChildOfClass("Animator")
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
        task.wait(0.2)
        trackCharacter(player)
    end)
end

for _, p in ipairs(Players:GetPlayers()) do hookPlayer(p) end
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
--// DELTA-STYLE GUI (mobile friendly)
--==================================================================
local function buildGui()
    local parent = (gethui and gethui())
        or (syn and syn.protect_gui and LocalPlayer:WaitForChild("PlayerGui"))
        or LocalPlayer:WaitForChild("PlayerGui")

    local gui = Instance.new("ScreenGui")
    gui.Name = "JJS_DeltaHub"
    gui.ResetOnSpawn = false
    gui.IgnoreGuiInset = true
    gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    gui.Parent = parent

    -- main frame
    local frame = Instance.new("Frame")
    frame.Size = UDim2.fromOffset(230, 200)
    frame.Position = UDim2.fromScale(0.03, 0.28)
    frame.BackgroundColor3 = Color3.fromRGB(18, 18, 22)
    frame.BorderSizePixel = 0
    frame.Active = true
    frame.Draggable = true
    frame.Parent = gui
    Instance.new("UICorner", frame).CornerRadius = UDim.new(0, 10)

    local stroke = Instance.new("UIStroke", frame)
    stroke.Color = Color3.fromRGB(120, 70, 220)
    stroke.Thickness = 1.5
    stroke.Transparency = 0.2

    -- header
    local header = Instance.new("TextLabel")
    header.Size = UDim2.new(1, -16, 0, 30)
    header.Position = UDim2.fromOffset(8, 6)
    header.BackgroundTransparency = 1
    header.Font = Enum.Font.GothamBold
    header.TextSize = 15
    header.TextXAlignment = Enum.TextXAlignment.Left
    header.TextColor3 = Color3.fromRGB(235, 230, 250)
    header.Text = "JJS • Auto Perfect Block"
    header.Parent = frame

    local sub = Instance.new("TextLabel")
    sub.Size = UDim2.new(1, -16, 0, 14)
    sub.Position = UDim2.fromOffset(8, 32)
    sub.BackgroundTransparency = 1
    sub.Font = Enum.Font.Gotham
    sub.TextSize = 11
    sub.TextXAlignment = Enum.TextXAlignment.Left
    sub.TextColor3 = Color3.fromRGB(150, 150, 165)
    sub.Text = "Delta Hub"
    sub.Parent = frame

    -- main toggle
    local toggle = Instance.new("TextButton")
    toggle.Size = UDim2.new(1, -16, 0, 38)
    toggle.Position = UDim2.fromOffset(8, 52)
    toggle.Font = Enum.Font.GothamBold
    toggle.TextSize = 15
    toggle.BorderSizePixel = 0
    toggle.AutoButtonColor = true
    toggle.Parent = frame
    Instance.new("UICorner", toggle).CornerRadius = UDim.new(0, 8)

    local function refreshToggle()
        if Config.Enabled then
            toggle.Text = "● ENABLED — tap to stop"
            toggle.BackgroundColor3 = Color3.fromRGB(40, 150, 80)
            toggle.TextColor3 = Color3.fromRGB(240, 255, 245)
        else
            toggle.Text = "○ DISABLED — tap to start"
            toggle.BackgroundColor3 = Color3.fromRGB(150, 50, 55)
            toggle.TextColor3 = Color3.fromRGB(255, 240, 240)
        end
    end
    toggle.MouseButton1Click:Connect(function()
        Config.Enabled = not Config.Enabled
        refreshToggle()
    end)

    -- a labelled +/- stepper row
    local function makeStepper(y, label, get, set, step, fmt)
        local row = Instance.new("Frame")
        row.Size = UDim2.new(1, -16, 0, 30)
        row.Position = UDim2.fromOffset(8, y)
        row.BackgroundColor3 = Color3.fromRGB(28, 28, 34)
        row.BorderSizePixel = 0
        row.Parent = frame
        Instance.new("UICorner", row).CornerRadius = UDim.new(0, 6)

        local lbl = Instance.new("TextLabel")
        lbl.Size = UDim2.new(1, -76, 1, 0)
        lbl.Position = UDim2.fromOffset(8, 0)
        lbl.BackgroundTransparency = 1
        lbl.Font = Enum.Font.Gotham
        lbl.TextSize = 12
        lbl.TextXAlignment = Enum.TextXAlignment.Left
        lbl.TextColor3 = Color3.fromRGB(220, 220, 230)
        lbl.Parent = row

        local minus = Instance.new("TextButton")
        minus.Size = UDim2.fromOffset(26, 22)
        minus.Position = UDim2.new(1, -60, 0.5, -11)
        minus.Text = "-"
        minus.Font = Enum.Font.GothamBold
        minus.TextSize = 16
        minus.TextColor3 = Color3.fromRGB(255, 255, 255)
        minus.BackgroundColor3 = Color3.fromRGB(70, 50, 130)
        minus.BorderSizePixel = 0
        minus.Parent = row
        Instance.new("UICorner", minus).CornerRadius = UDim.new(0, 5)

        local plus = Instance.new("TextButton")
        plus.Size = UDim2.fromOffset(26, 22)
        plus.Position = UDim2.new(1, -30, 0.5, -11)
        plus.Text = "+"
        plus.Font = Enum.Font.GothamBold
        plus.TextSize = 16
        plus.TextColor3 = Color3.fromRGB(255, 255, 255)
        plus.BackgroundColor3 = Color3.fromRGB(70, 50, 130)
        plus.BorderSizePixel = 0
        plus.Parent = row
        Instance.new("UICorner", plus).CornerRadius = UDim.new(0, 5)

        local function upd()
            lbl.Text = label .. ": " .. string.format(fmt, get())
        end
        minus.MouseButton1Click:Connect(function() set(get() - step); upd() end)
        plus.MouseButton1Click:Connect(function() set(get() + step); upd() end)
        upd()
    end

    makeStepper(96, "Reaction", function() return Config.ReactionOffset end,
        function(v) Config.ReactionOffset = math.clamp(v, 0, 1) end, 0.01, "%.2fs")
    makeStepper(130, "Hold", function() return Config.BlockHoldTime end,
        function(v) Config.BlockHoldTime = math.clamp(v, 0.05, 1) end, 0.02, "%.2fs")
    makeStepper(164, "Range", function() return Config.Range end,
        function(v) Config.Range = math.clamp(v, 5, 60) end, 2, "%d")

    refreshToggle()
end

pcall(buildGui)

print("[JJS Auto Perfect Block • Delta] loaded — use the on-screen panel.")
