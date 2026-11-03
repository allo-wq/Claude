--[[
    GROUP KEY SYSTEM  •  DELTA LOADER
    ---------------------------------
    Locks your script behind joining a Roblox group.
    - Player must be in group 325366885493 to unlock.
    - Shows a "Join Group" button (opens the real roblox.com group) and a
      "Verify" button that re-checks membership.
    - On success it runs runGatedScript() — paste YOUR script in there.

    No typed key, no external website: membership is checked directly with
    IsInGroup, which can't be faked.
]]

--// Services
local Players       = game:GetService("Players")
local GuiService    = game:GetService("GuiService")

local LocalPlayer = Players.LocalPlayer

--==================================================================
--// CONFIG
--==================================================================
local GROUP_ID   = 325366885493
local GROUP_LINK = "https://www.roblox.com/communities/" .. GROUP_ID .. "/"

--==================================================================
--// YOUR SCRIPT GOES HERE
--==================================================================
-- Everything the user unlocks runs inside this function. Paste your actual
-- script (the bot / hub / whatever) in place of the sample below.
local function runGatedScript()
    -- >>> PASTE YOUR SCRIPT BELOW THIS LINE <<<

    game:GetService("StarterGui"):SetCore("SendNotification", {
        Title = "Unlocked",
        Text  = "Script loaded — you're in the group!",
        Duration = 4,
    })

    -- e.g. loadstring(game:HttpGet("https://your-raw-link/script.lua"))()

    -- >>> PASTE YOUR SCRIPT ABOVE THIS LINE <<<
end

--==================================================================
--// MEMBERSHIP CHECK
--==================================================================
local function isInGroup()
    local ok, result = pcall(function()
        return LocalPlayer:IsInGroup(GROUP_ID)
    end)
    return ok and result == true
end

--==================================================================
--// JOIN GROUP (in-app prompt, with browser fallback)
--==================================================================
local function openGroup()
    -- Try to open the group page inside Roblox first (no external browser).
    local opened = pcall(function()
        GuiService:OpenBrowserWindow(GROUP_LINK)
    end)
    if not opened then
        -- Fallback: copy the real link to clipboard so the player can paste it.
        local setclip = (setclipboard or toclipboard or (syn and syn.write_clipboard))
        if setclip then pcall(setclip, GROUP_LINK) end
    end
end

--==================================================================
--// GUI
--==================================================================
local gui, statusLabel

local function unlock()
    if gui then gui:Destroy() end
    local ok, err = pcall(runGatedScript)
    if not ok then warn("[KeySystem] gated script error: " .. tostring(err)) end
end

local function buildGui()
    local parent = (gethui and gethui()) or LocalPlayer:WaitForChild("PlayerGui")

    gui = Instance.new("ScreenGui")
    gui.Name = "GroupKeySystem"
    gui.ResetOnSpawn = false
    gui.IgnoreGuiInset = true
    gui.Parent = parent

    local frame = Instance.new("Frame")
    frame.Size = UDim2.fromOffset(300, 210)
    frame.Position = UDim2.fromScale(0.5, 0.5)
    frame.AnchorPoint = Vector2.new(0.5, 0.5)
    frame.BackgroundColor3 = Color3.fromRGB(18, 18, 24)
    frame.BorderSizePixel = 0
    frame.Active = true
    frame.Draggable = true
    frame.Parent = gui
    Instance.new("UICorner", frame).CornerRadius = UDim.new(0, 12)
    local stroke = Instance.new("UIStroke", frame)
    stroke.Color = Color3.fromRGB(120, 90, 230)
    stroke.Thickness = 1.5

    local title = Instance.new("TextLabel")
    title.Size = UDim2.new(1, -24, 0, 28)
    title.Position = UDim2.fromOffset(12, 14)
    title.BackgroundTransparency = 1
    title.Font = Enum.Font.GothamBold
    title.TextSize = 18
    title.TextXAlignment = Enum.TextXAlignment.Left
    title.TextColor3 = Color3.fromRGB(235, 232, 250)
    title.Text = "🔒 Group Locked"
    title.Parent = frame

    local desc = Instance.new("TextLabel")
    desc.Size = UDim2.new(1, -24, 0, 40)
    desc.Position = UDim2.fromOffset(12, 44)
    desc.BackgroundTransparency = 1
    desc.Font = Enum.Font.Gotham
    desc.TextSize = 13
    desc.TextWrapped = true
    desc.TextYAlignment = Enum.TextYAlignment.Top
    desc.TextXAlignment = Enum.TextXAlignment.Left
    desc.TextColor3 = Color3.fromRGB(180, 180, 195)
    desc.Text = "Join the group to unlock, then press Verify."
    desc.Parent = frame

    local joinBtn = Instance.new("TextButton")
    joinBtn.Size = UDim2.new(1, -24, 0, 38)
    joinBtn.Position = UDim2.fromOffset(12, 92)
    joinBtn.Font = Enum.Font.GothamBold
    joinBtn.TextSize = 15
    joinBtn.Text = "Join Group"
    joinBtn.TextColor3 = Color3.fromRGB(245, 245, 255)
    joinBtn.BackgroundColor3 = Color3.fromRGB(90, 70, 200)
    joinBtn.BorderSizePixel = 0
    joinBtn.Parent = frame
    Instance.new("UICorner", joinBtn).CornerRadius = UDim.new(0, 8)
    joinBtn.MouseButton1Click:Connect(openGroup)

    local verifyBtn = Instance.new("TextButton")
    verifyBtn.Size = UDim2.new(1, -24, 0, 38)
    verifyBtn.Position = UDim2.fromOffset(12, 138)
    verifyBtn.Font = Enum.Font.GothamBold
    verifyBtn.TextSize = 15
    verifyBtn.Text = "Verify"
    verifyBtn.TextColor3 = Color3.fromRGB(240, 255, 245)
    verifyBtn.BackgroundColor3 = Color3.fromRGB(40, 150, 80)
    verifyBtn.BorderSizePixel = 0
    verifyBtn.Parent = frame
    Instance.new("UICorner", verifyBtn).CornerRadius = UDim.new(0, 8)

    statusLabel = Instance.new("TextLabel")
    statusLabel.Size = UDim2.new(1, -24, 0, 18)
    statusLabel.Position = UDim2.fromOffset(12, 182)
    statusLabel.BackgroundTransparency = 1
    statusLabel.Font = Enum.Font.GothamMedium
    statusLabel.TextSize = 12
    statusLabel.TextColor3 = Color3.fromRGB(200, 120, 120)
    statusLabel.Text = ""
    statusLabel.Parent = frame

    verifyBtn.MouseButton1Click:Connect(function()
        statusLabel.TextColor3 = Color3.fromRGB(200, 190, 120)
        statusLabel.Text = "Checking..."
        task.wait(0.3)
        if isInGroup() then
            statusLabel.TextColor3 = Color3.fromRGB(120, 220, 140)
            statusLabel.Text = "Verified! Unlocking..."
            task.wait(0.4)
            unlock()
        else
            statusLabel.TextColor3 = Color3.fromRGB(220, 120, 120)
            statusLabel.Text = "Not in the group yet. Join, then rejoin the game."
        end
    end)
end

--==================================================================
--// ENTRY POINT
--==================================================================
if isInGroup() then
    unlock()            -- already a member: skip the gate
else
    buildGui()
end
