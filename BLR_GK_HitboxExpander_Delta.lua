--[[
    BLUE LOCK RIVALS • GK HITBOX EXPANDER + VISUALIZER  •  DELTA
    -----------------------------------------------------------
    - Expands your goalkeeper save hitbox so you catch more shots.
    - Draws a live box around you so you can SEE exactly how big the
      hitbox is, with on-screen X / Y / Z size readouts.
    - Mobile-friendly on-screen panel (built for Delta). Paste & Execute.

    HOW IT WORKS
    - Finds your GK hitbox part (searches common names like "Hitbox",
      "SaveHitbox", "GoalkeeperHitbox", "Catch") inside your character /
      the workspace and resizes it to Config.Size.
    - If no hitbox part is found, it creates its own CanCollide-off part
      welded to your HumanoidRootPart at the configured size so the
      visualizer + size readout still work (and many save checks that test
      "is the ball touching a part near the keeper" will still trigger).
    - A SelectionBox / transparent part shows the box; a label shows the
      exact studs.

    NOTE
    - Part names differ between game updates. If saves don't widen, tell me
      what the real hitbox part is called and I'll target it exactly. The
      visualizer always works regardless.
]]

--// Services
local Players    = game:GetService("Players")
local RunService = game:GetService("RunService")

local LocalPlayer = Players.LocalPlayer

--==================================================================
--// CONFIG
--==================================================================
local Config = {
    Enabled    = true,
    Size       = Vector3.new(14, 10, 6), -- expanded hitbox size (studs)
    ShowVisual = true,
    BoxColor   = Color3.fromRGB(80, 170, 255),
    Transparency = 0.75,                 -- of the fill box (1 = invisible fill)

    -- candidate names to search for the real GK hitbox part
    HitboxNames = {
        "hitbox", "savehitbox", "goalkeeperhitbox", "gkhitbox",
        "catch", "catchhitbox", "savezone", "blockhitbox",
    },
}

--==================================================================
--// STATE
--==================================================================
local visualPart   -- the box we draw
local selBox       -- SelectionBox adornment
local realHitbox   -- the game's hitbox part if we find one
local originalSize -- to restore on stop

--==================================================================
--// HELPERS
--==================================================================
local function getChar()
    return LocalPlayer.Character
end

local function getRoot()
    local c = getChar()
    return c and c:FindFirstChild("HumanoidRootPart")
end

-- Search the character (and its descendants) for a part whose name matches
-- one of the known hitbox names.
local function findRealHitbox()
    local char = getChar()
    if not char then return nil end
    for _, inst in ipairs(char:GetDescendants()) do
        if inst:IsA("BasePart") then
            local n = string.lower(inst.Name)
            for _, want in ipairs(Config.HitboxNames) do
                if n == want or n:find(want) then
                    return inst
                end
            end
        end
    end
    return nil
end

-- Build (or rebuild) the visual box welded to the root.
local function buildVisual()
    local root = getRoot()
    if not root then return end

    if visualPart then visualPart:Destroy() end

    visualPart = Instance.new("Part")
    visualPart.Name = "GK_HitboxVisual"
    visualPart.Anchored = false
    visualPart.CanCollide = false
    visualPart.CanQuery = false
    visualPart.CanTouch = false
    visualPart.Massless = true
    visualPart.Material = Enum.Material.ForceField
    visualPart.Color = Config.BoxColor
    visualPart.Transparency = Config.Transparency
    visualPart.Size = Config.Size
    visualPart.CFrame = root.CFrame
    visualPart.Parent = getChar()

    local weld = Instance.new("WeldConstraint")
    weld.Part0 = visualPart
    weld.Part1 = root
    weld.Parent = visualPart

    selBox = Instance.new("SelectionBox")
    selBox.Adornee = visualPart
    selBox.Color3 = Config.BoxColor
    selBox.LineThickness = 0.04
    selBox.SurfaceTransparency = 1
    selBox.Parent = visualPart

    visualPart.Visible = Config.ShowVisual
end

-- Apply current size to the real hitbox + visual.
local function applySize()
    -- real hitbox (best-effort)
    realHitbox = findRealHitbox()
    if realHitbox and realHitbox ~= visualPart then
        if not originalSize then originalSize = realHitbox.Size end
        if Config.Enabled then
            realHitbox.Size = Config.Size
        elseif originalSize then
            realHitbox.Size = originalSize
        end
    end

    -- visual
    if not visualPart or not visualPart.Parent then
        buildVisual()
    end
    if visualPart then
        visualPart.Size = Config.Size
        visualPart.Color = Config.BoxColor
        visualPart.Transparency = Config.ShowVisual and Config.Transparency or 1
        if selBox then selBox.Transparency = Config.ShowVisual and 0 or 1 end
    end
end

-- Restore the real hitbox to its original size.
local function restore()
    if realHitbox and originalSize and realHitbox.Parent then
        realHitbox.Size = originalSize
    end
end

--==================================================================
--// CHARACTER LIFECYCLE
--==================================================================
LocalPlayer.CharacterAdded:Connect(function()
    task.wait(0.5)
    originalSize = nil
    realHitbox = nil
    applySize()
end)

-- keep it applied (game may reset sizes / respawn parts)
RunService.Heartbeat:Connect(function()
    if not Config.Enabled then return end
    applySize()
end)

--==================================================================
--// DELTA-STYLE GUI
--==================================================================
local function buildGui()
    local parent = (gethui and gethui()) or LocalPlayer:WaitForChild("PlayerGui")

    local gui = Instance.new("ScreenGui")
    gui.Name = "BLR_GKHitbox"
    gui.ResetOnSpawn = false
    gui.IgnoreGuiInset = true
    gui.Parent = parent

    local frame = Instance.new("Frame")
    frame.Size = UDim2.fromOffset(248, 256)
    frame.Position = UDim2.fromScale(0.03, 0.22)
    frame.BackgroundColor3 = Color3.fromRGB(16, 18, 26)
    frame.BorderSizePixel = 0
    frame.Active = true
    frame.Draggable = true
    frame.Parent = gui
    Instance.new("UICorner", frame).CornerRadius = UDim.new(0, 10)
    local stroke = Instance.new("UIStroke", frame)
    stroke.Color = Color3.fromRGB(80, 170, 255)
    stroke.Thickness = 1.5

    local header = Instance.new("TextLabel")
    header.Size = UDim2.new(1, -16, 0, 24)
    header.Position = UDim2.fromOffset(8, 6)
    header.BackgroundTransparency = 1
    header.Font = Enum.Font.GothamBold
    header.TextSize = 15
    header.TextXAlignment = Enum.TextXAlignment.Left
    header.TextColor3 = Color3.fromRGB(225, 235, 255)
    header.Text = "Blue Lock Rivals • GK Hitbox"
    header.Parent = frame

    -- live size readout
    local sizeLabel = Instance.new("TextLabel")
    sizeLabel.Size = UDim2.new(1, -16, 0, 20)
    sizeLabel.Position = UDim2.fromOffset(8, 30)
    sizeLabel.BackgroundTransparency = 1
    sizeLabel.Font = Enum.Font.GothamMedium
    sizeLabel.TextSize = 13
    sizeLabel.TextXAlignment = Enum.TextXAlignment.Left
    sizeLabel.TextColor3 = Color3.fromRGB(120, 220, 255)
    sizeLabel.Parent = frame

    local function refreshSizeLabel()
        sizeLabel.Text = string.format("Hitbox: %.0f x %.0f x %.0f studs",
            Config.Size.X, Config.Size.Y, Config.Size.Z)
    end

    -- toggle
    local toggle = Instance.new("TextButton")
    toggle.Size = UDim2.new(1, -16, 0, 34)
    toggle.Position = UDim2.fromOffset(8, 54)
    toggle.Font = Enum.Font.GothamBold
    toggle.TextSize = 14
    toggle.BorderSizePixel = 0
    toggle.Parent = frame
    Instance.new("UICorner", toggle).CornerRadius = UDim.new(0, 8)

    local function refreshToggle()
        if Config.Enabled then
            toggle.Text = "● ENABLED — tap to stop"
            toggle.BackgroundColor3 = Color3.fromRGB(40, 130, 200)
        else
            toggle.Text = "○ DISABLED — tap to start"
            toggle.BackgroundColor3 = Color3.fromRGB(150, 50, 55)
        end
        toggle.TextColor3 = Color3.fromRGB(245, 250, 255)
    end
    toggle.MouseButton1Click:Connect(function()
        Config.Enabled = not Config.Enabled
        if not Config.Enabled then restore() end
        refreshToggle()
    end)

    -- visual toggle
    local visBtn = Instance.new("TextButton")
    visBtn.Size = UDim2.new(1, -16, 0, 28)
    visBtn.Position = UDim2.fromOffset(8, 92)
    visBtn.Font = Enum.Font.GothamSemibold
    visBtn.TextSize = 13
    visBtn.BorderSizePixel = 0
    visBtn.BackgroundColor3 = Color3.fromRGB(40, 44, 58)
    visBtn.TextColor3 = Color3.fromRGB(230, 235, 245)
    visBtn.Parent = frame
    Instance.new("UICorner", visBtn).CornerRadius = UDim.new(0, 7)
    local function refreshVis()
        visBtn.Text = Config.ShowVisual and "Show Box: ON" or "Show Box: OFF"
    end
    visBtn.MouseButton1Click:Connect(function()
        Config.ShowVisual = not Config.ShowVisual
        refreshVis()
    end)

    -- axis stepper
    local function makeAxisStepper(y, axisName, getAxis, setAxis)
        local row = Instance.new("Frame")
        row.Size = UDim2.new(1, -16, 0, 30)
        row.Position = UDim2.fromOffset(8, y)
        row.BackgroundColor3 = Color3.fromRGB(26, 28, 38)
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
        lbl.TextColor3 = Color3.fromRGB(220, 224, 235)
        lbl.Parent = row

        local minus = Instance.new("TextButton")
        minus.Size = UDim2.fromOffset(26, 22)
        minus.Position = UDim2.new(1, -60, 0.5, -11)
        minus.Text = "-"
        minus.Font = Enum.Font.GothamBold
        minus.TextSize = 16
        minus.TextColor3 = Color3.fromRGB(255, 255, 255)
        minus.BackgroundColor3 = Color3.fromRGB(40, 90, 150)
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
        plus.BackgroundColor3 = Color3.fromRGB(40, 90, 150)
        plus.BorderSizePixel = 0
        plus.Parent = row
        Instance.new("UICorner", plus).CornerRadius = UDim.new(0, 5)

        local function upd() lbl.Text = axisName .. " size: " .. string.format("%.0f", getAxis()) end
        minus.MouseButton1Click:Connect(function()
            setAxis(math.clamp(getAxis() - 1, 1, 100)); upd(); refreshSizeLabel()
        end)
        plus.MouseButton1Click:Connect(function()
            setAxis(math.clamp(getAxis() + 1, 1, 100)); upd(); refreshSizeLabel()
        end)
        upd()
    end

    makeAxisStepper(126, "Width (X)",
        function() return Config.Size.X end,
        function(v) Config.Size = Vector3.new(v, Config.Size.Y, Config.Size.Z) end)
    makeAxisStepper(160, "Height (Y)",
        function() return Config.Size.Y end,
        function(v) Config.Size = Vector3.new(Config.Size.X, v, Config.Size.Z) end)
    makeAxisStepper(194, "Depth (Z)",
        function() return Config.Size.Z end,
        function(v) Config.Size = Vector3.new(Config.Size.X, Config.Size.Y, v) end)

    -- reset button
    local reset = Instance.new("TextButton")
    reset.Size = UDim2.new(1, -16, 0, 26)
    reset.Position = UDim2.fromOffset(8, 226)
    reset.Font = Enum.Font.GothamSemibold
    reset.TextSize = 12
    reset.Text = "Reset to default (14 x 10 x 6)"
    reset.BorderSizePixel = 0
    reset.BackgroundColor3 = Color3.fromRGB(40, 44, 58)
    reset.TextColor3 = Color3.fromRGB(220, 224, 235)
    reset.Parent = frame
    Instance.new("UICorner", reset).CornerRadius = UDim.new(0, 7)
    reset.MouseButton1Click:Connect(function()
        Config.Size = Vector3.new(14, 10, 6)
        refreshSizeLabel()
    end)

    refreshToggle()
    refreshVis()
    refreshSizeLabel()
end

pcall(buildGui)
pcall(applySize)

print("[Blue Lock Rivals • GK Hitbox] loaded — use the on-screen panel.")
