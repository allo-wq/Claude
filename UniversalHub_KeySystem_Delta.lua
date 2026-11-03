--[[
    UNIVERSAL HUB  +  KEY SYSTEM  •  DELTA
    --------------------------------------
    Flow:
      1. "Get Key" opens your sl1nk page.
      2. Player pastes the key ("tam") and presses Verify.
      3. On success the Universal Hub loads.

    Universal Hub features (work in most Roblox games):
      - Walk Speed
      - Jump Power / Height
      - Infinite Jump
      - Fly (mobile-friendly: up/down buttons + move with joystick/WASD)
      - Noclip
      - Player ESP (highlights)

    Mobile friendly, draggable panel.
]]

local Players           = game:GetService("Players")
local RunService        = game:GetService("RunService")
local UserInputService  = game:GetService("UserInputService")
local GuiService        = game:GetService("GuiService")
local Workspace         = game:GetService("Workspace")

local LocalPlayer = Players.LocalPlayer

--==================================================================
--// KEY CONFIG
--==================================================================
local KEY_LINK   = "https://sl1nk.com/y16flb2"
local VALID_KEYS = { ["tam"] = true }

--==================================================================================
--========================  UNIVERSAL HUB (the gated script)  =======================
--==================================================================================
local function runUniversalHub()
    local State = {
        WalkSpeed   = 16,
        JumpPower   = 50,
        InfJump     = false,
        Fly         = false,
        FlySpeed    = 60,
        Noclip      = false,
        ESP         = false,
    }

    local function getChar() return LocalPlayer.Character end
    local function getHum()
        local c = getChar(); return c and c:FindFirstChildOfClass("Humanoid")
    end
    local function getRoot()
        local c = getChar(); return c and c:FindFirstChild("HumanoidRootPart")
    end

    ---------------------------------------------------------------- speed / jump
    RunService.Heartbeat:Connect(function()
        local hum = getHum()
        if hum then
            hum.WalkSpeed = State.WalkSpeed
            if hum.UseJumpPower ~= nil then
                hum.UseJumpPower = true
                hum.JumpPower = State.JumpPower
            else
                hum.JumpHeight = State.JumpPower / 10
            end
        end
    end)

    ---------------------------------------------------------------- infinite jump
    UserInputService.JumpRequest:Connect(function()
        if State.InfJump then
            local hum = getHum()
            if hum then hum:ChangeState(Enum.HumanoidStateType.Jumping) end
        end
    end)

    ---------------------------------------------------------------- noclip
    RunService.Stepped:Connect(function()
        if State.Noclip then
            local c = getChar()
            if c then
                for _, p in ipairs(c:GetDescendants()) do
                    if p:IsA("BasePart") and p.CanCollide then
                        p.CanCollide = false
                    end
                end
            end
        end
    end)

    ---------------------------------------------------------------- fly
    local flyBV, flyBG
    local flyUp, flyDown = false, false

    local function startFly()
        local root = getRoot(); if not root then return end
        flyBV = Instance.new("BodyVelocity")
        flyBV.MaxForce = Vector3.new(1,1,1) * 9e9
        flyBV.Velocity = Vector3.zero
        flyBV.Parent = root
        flyBG = Instance.new("BodyGyro")
        flyBG.MaxTorque = Vector3.new(1,1,1) * 9e9
        flyBG.P = 9e4
        flyBG.CFrame = root.CFrame
        flyBG.Parent = root
        local hum = getHum(); if hum then hum.PlatformStand = true end
    end

    local function stopFly()
        if flyBV then flyBV:Destroy(); flyBV = nil end
        if flyBG then flyBG:Destroy(); flyBG = nil end
        local hum = getHum(); if hum then hum.PlatformStand = false end
    end

    RunService.RenderStepped:Connect(function()
        if not State.Fly then return end
        local root = getRoot(); local hum = getHum()
        if not (root and hum) then return end
        if not flyBV then startFly() end
        local cam = Workspace.CurrentCamera
        local move = hum.MoveDirection -- joystick / WASD direction (world space)
        local dir = Vector3.zero
        if move.Magnitude > 0 then
            dir = move
        end
        local vertical = 0
        if flyUp then vertical = 1 elseif flyDown then vertical = -1 end
        local vel = (dir * State.FlySpeed) + Vector3.new(0, vertical * State.FlySpeed, 0)
        flyBV.Velocity = vel
        if cam then flyBG.CFrame = cam.CFrame end
    end)

    ---------------------------------------------------------------- ESP
    local espHighlights = {}
    local function clearEsp()
        for _, h in pairs(espHighlights) do pcall(function() h:Destroy() end) end
        espHighlights = {}
    end
    local function updateEsp()
        if not State.ESP then clearEsp(); return end
        for _, plr in ipairs(Players:GetPlayers()) do
            if plr ~= LocalPlayer and plr.Character and not espHighlights[plr] then
                local hl = Instance.new("Highlight")
                hl.FillColor = Color3.fromRGB(255, 80, 80)
                hl.OutlineColor = Color3.fromRGB(255, 255, 255)
                hl.FillTransparency = 0.6
                hl.Adornee = plr.Character
                hl.Parent = (gethui and gethui()) or game:GetService("CoreGui")
                espHighlights[plr] = hl
            end
        end
    end
    Players.PlayerRemoving:Connect(function(plr)
        if espHighlights[plr] then espHighlights[plr]:Destroy(); espHighlights[plr] = nil end
    end)
    RunService.Heartbeat:Connect(function()
        if State.ESP then
            updateEsp()
            for plr, hl in pairs(espHighlights) do
                if plr.Character then hl.Adornee = plr.Character end
            end
        end
    end)

    ---------------------------------------------------------------- GUI
    local parent = (gethui and gethui()) or LocalPlayer:WaitForChild("PlayerGui")
    local gui = Instance.new("ScreenGui")
    gui.Name = "UniversalHub"; gui.ResetOnSpawn = false; gui.IgnoreGuiInset = true
    gui.Parent = parent

    local frame = Instance.new("Frame")
    frame.Size = UDim2.fromOffset(250, 360)
    frame.Position = UDim2.fromScale(0.03, 0.18)
    frame.BackgroundColor3 = Color3.fromRGB(16, 16, 22)
    frame.BorderSizePixel = 0; frame.Active = true; frame.Draggable = true
    frame.Parent = gui
    Instance.new("UICorner", frame).CornerRadius = UDim.new(0, 10)
    local st = Instance.new("UIStroke", frame)
    st.Color = Color3.fromRGB(120, 90, 230); st.Thickness = 1.5

    local header = Instance.new("TextLabel")
    header.Size = UDim2.new(1, -16, 0, 26); header.Position = UDim2.fromOffset(8, 8)
    header.BackgroundTransparency = 1; header.Font = Enum.Font.GothamBold
    header.TextSize = 16; header.TextXAlignment = Enum.TextXAlignment.Left
    header.TextColor3 = Color3.fromRGB(235, 232, 250); header.Text = "⚡ Universal Hub"
    header.Parent = frame

    local y = 42
    local function addToggle(label, getv, setv)
        local btn = Instance.new("TextButton")
        btn.Size = UDim2.new(1, -16, 0, 30); btn.Position = UDim2.fromOffset(8, y)
        btn.Font = Enum.Font.GothamSemibold; btn.TextSize = 13; btn.BorderSizePixel = 0
        btn.Parent = frame
        Instance.new("UICorner", btn).CornerRadius = UDim.new(0, 7)
        local function refresh()
            local on = getv()
            btn.Text = label .. ": " .. (on and "ON" or "OFF")
            btn.BackgroundColor3 = on and Color3.fromRGB(40,140,80) or Color3.fromRGB(40,42,54)
            btn.TextColor3 = Color3.fromRGB(235,238,245)
        end
        btn.MouseButton1Click:Connect(function() setv(not getv()); refresh() end)
        refresh()
        y = y + 34
    end
    local function addStepper(label, getv, setv, step, lo, hi, fmt)
        local row = Instance.new("Frame")
        row.Size = UDim2.new(1, -16, 0, 30); row.Position = UDim2.fromOffset(8, y)
        row.BackgroundColor3 = Color3.fromRGB(26, 28, 38); row.BorderSizePixel = 0
        row.Parent = frame
        Instance.new("UICorner", row).CornerRadius = UDim.new(0, 6)
        local lbl = Instance.new("TextLabel")
        lbl.Size = UDim2.new(1, -76, 1, 0); lbl.Position = UDim2.fromOffset(8, 0)
        lbl.BackgroundTransparency = 1; lbl.Font = Enum.Font.Gotham; lbl.TextSize = 12
        lbl.TextXAlignment = Enum.TextXAlignment.Left
        lbl.TextColor3 = Color3.fromRGB(220,224,235); lbl.Parent = row
        local function mk(txt, dx)
            local b = Instance.new("TextButton")
            b.Size = UDim2.fromOffset(26, 22); b.Position = UDim2.new(1, dx, 0.5, -11)
            b.Text = txt; b.Font = Enum.Font.GothamBold; b.TextSize = 16
            b.TextColor3 = Color3.fromRGB(255,255,255)
            b.BackgroundColor3 = Color3.fromRGB(70,50,130); b.BorderSizePixel = 0
            b.Parent = row
            Instance.new("UICorner", b).CornerRadius = UDim.new(0, 5)
            return b
        end
        local minus, plus = mk("-", -60), mk("+", -30)
        local function upd() lbl.Text = label .. ": " .. string.format(fmt, getv()) end
        minus.MouseButton1Click:Connect(function() setv(math.clamp(getv()-step, lo, hi)); upd() end)
        plus.MouseButton1Click:Connect(function() setv(math.clamp(getv()+step, lo, hi)); upd() end)
        upd()
        y = y + 34
    end

    addStepper("Walk Speed", function() return State.WalkSpeed end,
        function(v) State.WalkSpeed = v end, 2, 8, 200, "%d")
    addStepper("Jump", function() return State.JumpPower end,
        function(v) State.JumpPower = v end, 5, 25, 300, "%d")
    addStepper("Fly Speed", function() return State.FlySpeed end,
        function(v) State.FlySpeed = v end, 10, 20, 400, "%d")

    addToggle("Infinite Jump", function() return State.InfJump end,
        function(v) State.InfJump = v end)
    addToggle("Fly", function() return State.Fly end,
        function(v) State.Fly = v; if not v then stopFly() end end)
    addToggle("Noclip", function() return State.Noclip end,
        function(v) State.Noclip = v end)
    addToggle("Player ESP", function() return State.ESP end,
        function(v) State.ESP = v; if not v then clearEsp() end end)

    -- fly up/down buttons (mobile)
    local upBtn = Instance.new("TextButton")
    upBtn.Size = UDim2.new(0.5, -12, 0, 30); upBtn.Position = UDim2.fromOffset(8, y)
    upBtn.Text = "Fly ↑ (hold)"; upBtn.Font = Enum.Font.GothamSemibold; upBtn.TextSize = 12
    upBtn.TextColor3 = Color3.fromRGB(235,238,245)
    upBtn.BackgroundColor3 = Color3.fromRGB(40,90,150); upBtn.BorderSizePixel = 0
    upBtn.Parent = frame
    Instance.new("UICorner", upBtn).CornerRadius = UDim.new(0, 7)
    local downBtn = Instance.new("TextButton")
    downBtn.Size = UDim2.new(0.5, -12, 0, 30); downBtn.Position = UDim2.new(0.5, 4, 0, y)
    downBtn.Text = "Fly ↓ (hold)"; downBtn.Font = Enum.Font.GothamSemibold; downBtn.TextSize = 12
    downBtn.TextColor3 = Color3.fromRGB(235,238,245)
    downBtn.BackgroundColor3 = Color3.fromRGB(40,90,150); downBtn.BorderSizePixel = 0
    downBtn.Parent = frame
    Instance.new("UICorner", downBtn).CornerRadius = UDim.new(0, 7)
    upBtn.MouseButton1Down:Connect(function() flyUp = true end)
    upBtn.MouseButton1Up:Connect(function() flyUp = false end)
    downBtn.MouseButton1Down:Connect(function() flyDown = true end)
    downBtn.MouseButton1Up:Connect(function() flyDown = false end)

    game:GetService("StarterGui"):SetCore("SendNotification", {
        Title = "Universal Hub", Text = "Loaded! Use the panel.", Duration = 4,
    })
end

--==================================================================================
--============================  KEY SYSTEM (gate)  =================================
--==================================================================================
local function trim(s) return (tostring(s):gsub("^%s*(.-)%s*$", "%1")) end
local function keyIsValid(input) return VALID_KEYS[trim(input)] == true end

local function openKeyPage()
    local opened = pcall(function() GuiService:OpenBrowserWindow(KEY_LINK) end)
    if not opened then
        local setclip = (setclipboard or toclipboard or (syn and syn.write_clipboard))
        if setclip then pcall(setclip, KEY_LINK) end
    end
end

local keyGui
local function unlock()
    if keyGui then keyGui:Destroy() end
    local ok, err = pcall(runUniversalHub)
    if not ok then warn("[Hub] error: " .. tostring(err)) end
end

local function buildKeyGui()
    local parent = (gethui and gethui()) or LocalPlayer:WaitForChild("PlayerGui")
    keyGui = Instance.new("ScreenGui")
    keyGui.Name = "KeySystem"; keyGui.ResetOnSpawn = false; keyGui.IgnoreGuiInset = true
    keyGui.Parent = parent

    local frame = Instance.new("Frame")
    frame.Size = UDim2.fromOffset(300, 236); frame.Position = UDim2.fromScale(0.5, 0.5)
    frame.AnchorPoint = Vector2.new(0.5, 0.5)
    frame.BackgroundColor3 = Color3.fromRGB(18, 18, 24); frame.BorderSizePixel = 0
    frame.Active = true; frame.Draggable = true; frame.Parent = keyGui
    Instance.new("UICorner", frame).CornerRadius = UDim.new(0, 12)
    local stroke = Instance.new("UIStroke", frame)
    stroke.Color = Color3.fromRGB(120, 90, 230); stroke.Thickness = 1.5

    local title = Instance.new("TextLabel")
    title.Size = UDim2.new(1, -24, 0, 28); title.Position = UDim2.fromOffset(12, 14)
    title.BackgroundTransparency = 1; title.Font = Enum.Font.GothamBold; title.TextSize = 18
    title.TextXAlignment = Enum.TextXAlignment.Left
    title.TextColor3 = Color3.fromRGB(235, 232, 250); title.Text = "🔑 Key System"; title.Parent = frame

    local desc = Instance.new("TextLabel")
    desc.Size = UDim2.new(1, -24, 0, 32); desc.Position = UDim2.fromOffset(12, 44)
    desc.BackgroundTransparency = 1; desc.Font = Enum.Font.Gotham; desc.TextSize = 13
    desc.TextWrapped = true; desc.TextYAlignment = Enum.TextYAlignment.Top
    desc.TextXAlignment = Enum.TextXAlignment.Left
    desc.TextColor3 = Color3.fromRGB(180, 180, 195)
    desc.Text = "Get your key, paste it below, then press Verify."; desc.Parent = frame

    local getBtn = Instance.new("TextButton")
    getBtn.Size = UDim2.new(1, -24, 0, 36); getBtn.Position = UDim2.fromOffset(12, 84)
    getBtn.Font = Enum.Font.GothamBold; getBtn.TextSize = 15; getBtn.Text = "Get Key"
    getBtn.TextColor3 = Color3.fromRGB(245, 245, 255)
    getBtn.BackgroundColor3 = Color3.fromRGB(90, 70, 200); getBtn.BorderSizePixel = 0; getBtn.Parent = frame
    Instance.new("UICorner", getBtn).CornerRadius = UDim.new(0, 8)
    getBtn.MouseButton1Click:Connect(openKeyPage)

    local box = Instance.new("TextBox")
    box.Size = UDim2.new(1, -24, 0, 34); box.Position = UDim2.fromOffset(12, 126)
    box.Font = Enum.Font.Gotham; box.TextSize = 14; box.PlaceholderText = "Paste key here..."
    box.Text = ""; box.ClearTextOnFocus = false
    box.TextColor3 = Color3.fromRGB(240, 240, 245); box.PlaceholderColor3 = Color3.fromRGB(130, 130, 145)
    box.BackgroundColor3 = Color3.fromRGB(30, 30, 40); box.BorderSizePixel = 0; box.Parent = frame
    Instance.new("UICorner", box).CornerRadius = UDim.new(0, 8)
    local pad = Instance.new("UIPadding", box); pad.PaddingLeft = UDim.new(0, 10)

    local verifyBtn = Instance.new("TextButton")
    verifyBtn.Size = UDim2.new(1, -24, 0, 36); verifyBtn.Position = UDim2.fromOffset(12, 168)
    verifyBtn.Font = Enum.Font.GothamBold; verifyBtn.TextSize = 15; verifyBtn.Text = "Verify"
    verifyBtn.TextColor3 = Color3.fromRGB(240, 255, 245)
    verifyBtn.BackgroundColor3 = Color3.fromRGB(40, 150, 80); verifyBtn.BorderSizePixel = 0; verifyBtn.Parent = frame
    Instance.new("UICorner", verifyBtn).CornerRadius = UDim.new(0, 8)

    local status = Instance.new("TextLabel")
    status.Size = UDim2.new(1, -24, 0, 18); status.Position = UDim2.fromOffset(12, 210)
    status.BackgroundTransparency = 1; status.Font = Enum.Font.GothamMedium; status.TextSize = 12
    status.TextColor3 = Color3.fromRGB(200, 120, 120); status.Text = ""; status.Parent = frame

    verifyBtn.MouseButton1Click:Connect(function()
        if keyIsValid(box.Text) then
            status.TextColor3 = Color3.fromRGB(120, 220, 140)
            status.Text = "Key accepted! Unlocking..."
            task.wait(0.4); unlock()
        else
            status.TextColor3 = Color3.fromRGB(220, 120, 120)
            status.Text = "Invalid key. Get a fresh one and try again."
        end
    end)
end

buildKeyGui()
