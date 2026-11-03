--[[
    KEY SYSTEM  •  DELTA LOADER  (typed key via sl1nk)
    --------------------------------------------------
    - "Get Key" button opens your key page (sl1nk).
    - Player pastes the key and presses Verify.
    - If the key matches, runGatedScript() runs.

    Fill in VALID_KEYS with the key(s) your sl1nk page hands out.
]]

local Players   = game:GetService("Players")
local GuiService = game:GetService("GuiService")
local LocalPlayer = Players.LocalPlayer

--==================================================================
--// CONFIG
--==================================================================
local KEY_LINK = "https://sl1nk.com/y16flb2"   -- your "get key" page

-- The key(s) your key page gives out. Add/replace these.
local VALID_KEYS = {
    ["tam"] = true,
    -- ["ANOTHER-KEY"] = true,
}

--==================================================================
--// YOUR SCRIPT GOES HERE
--==================================================================
local function runGatedScript()
    -- >>> PASTE YOUR SCRIPT BELOW THIS LINE <<<
    game:GetService("StarterGui"):SetCore("SendNotification", {
        Title = "Unlocked", Text = "Key accepted — script loaded!", Duration = 4,
    })
    -- e.g. loadstring(game:HttpGet("https://your-raw-link/script.lua"))()
    -- >>> PASTE YOUR SCRIPT ABOVE THIS LINE <<<
end

--==================================================================
--// HELPERS
--==================================================================
local function trim(s)
    return (tostring(s):gsub("^%s*(.-)%s*$", "%1"))
end

local function keyIsValid(input)
    return VALID_KEYS[trim(input)] == true
end

local function openKeyPage()
    local opened = pcall(function() GuiService:OpenBrowserWindow(KEY_LINK) end)
    if not opened then
        local setclip = (setclipboard or toclipboard or (syn and syn.write_clipboard))
        if setclip then pcall(setclip, KEY_LINK) end
    end
end

--==================================================================
--// GUI
--==================================================================
local gui

local function unlock()
    if gui then gui:Destroy() end
    local ok, err = pcall(runGatedScript)
    if not ok then warn("[KeySystem] gated script error: " .. tostring(err)) end
end

local function buildGui()
    local parent = (gethui and gethui()) or LocalPlayer:WaitForChild("PlayerGui")

    gui = Instance.new("ScreenGui")
    gui.Name = "KeySystem"
    gui.ResetOnSpawn = false
    gui.IgnoreGuiInset = true
    gui.Parent = parent

    local frame = Instance.new("Frame")
    frame.Size = UDim2.fromOffset(300, 236)
    frame.Position = UDim2.fromScale(0.5, 0.5)
    frame.AnchorPoint = Vector2.new(0.5, 0.5)
    frame.BackgroundColor3 = Color3.fromRGB(18, 18, 24)
    frame.BorderSizePixel = 0
    frame.Active = true
    frame.Draggable = true
    frame.Parent = gui
    Instance.new("UICorner", frame).CornerRadius = UDim.new(0, 12)
    local stroke = Instance.new("UIStroke", frame)
    stroke.Color = Color3.fromRGB(120, 90, 230); stroke.Thickness = 1.5

    local title = Instance.new("TextLabel")
    title.Size = UDim2.new(1, -24, 0, 28); title.Position = UDim2.fromOffset(12, 14)
    title.BackgroundTransparency = 1; title.Font = Enum.Font.GothamBold
    title.TextSize = 18; title.TextXAlignment = Enum.TextXAlignment.Left
    title.TextColor3 = Color3.fromRGB(235, 232, 250); title.Text = "🔑 Key System"
    title.Parent = frame

    local desc = Instance.new("TextLabel")
    desc.Size = UDim2.new(1, -24, 0, 32); desc.Position = UDim2.fromOffset(12, 44)
    desc.BackgroundTransparency = 1; desc.Font = Enum.Font.Gotham
    desc.TextSize = 13; desc.TextWrapped = true
    desc.TextYAlignment = Enum.TextYAlignment.Top; desc.TextXAlignment = Enum.TextXAlignment.Left
    desc.TextColor3 = Color3.fromRGB(180, 180, 195)
    desc.Text = "Get your key, paste it below, then press Verify."
    desc.Parent = frame

    local getBtn = Instance.new("TextButton")
    getBtn.Size = UDim2.new(1, -24, 0, 36); getBtn.Position = UDim2.fromOffset(12, 84)
    getBtn.Font = Enum.Font.GothamBold; getBtn.TextSize = 15; getBtn.Text = "Get Key"
    getBtn.TextColor3 = Color3.fromRGB(245, 245, 255)
    getBtn.BackgroundColor3 = Color3.fromRGB(90, 70, 200); getBtn.BorderSizePixel = 0
    getBtn.Parent = frame
    Instance.new("UICorner", getBtn).CornerRadius = UDim.new(0, 8)
    getBtn.MouseButton1Click:Connect(openKeyPage)

    local box = Instance.new("TextBox")
    box.Size = UDim2.new(1, -24, 0, 34); box.Position = UDim2.fromOffset(12, 126)
    box.Font = Enum.Font.Gotham; box.TextSize = 14
    box.PlaceholderText = "Paste key here..."
    box.Text = ""; box.ClearTextOnFocus = false
    box.TextColor3 = Color3.fromRGB(240, 240, 245)
    box.PlaceholderColor3 = Color3.fromRGB(130, 130, 145)
    box.BackgroundColor3 = Color3.fromRGB(30, 30, 40); box.BorderSizePixel = 0
    box.Parent = frame
    Instance.new("UICorner", box).CornerRadius = UDim.new(0, 8)
    local pad = Instance.new("UIPadding", box); pad.PaddingLeft = UDim.new(0, 10)

    local verifyBtn = Instance.new("TextButton")
    verifyBtn.Size = UDim2.new(1, -24, 0, 36); verifyBtn.Position = UDim2.fromOffset(12, 168)
    verifyBtn.Font = Enum.Font.GothamBold; verifyBtn.TextSize = 15; verifyBtn.Text = "Verify"
    verifyBtn.TextColor3 = Color3.fromRGB(240, 255, 245)
    verifyBtn.BackgroundColor3 = Color3.fromRGB(40, 150, 80); verifyBtn.BorderSizePixel = 0
    verifyBtn.Parent = frame
    Instance.new("UICorner", verifyBtn).CornerRadius = UDim.new(0, 8)

    local status = Instance.new("TextLabel")
    status.Size = UDim2.new(1, -24, 0, 18); status.Position = UDim2.fromOffset(12, 210)
    status.BackgroundTransparency = 1; status.Font = Enum.Font.GothamMedium
    status.TextSize = 12; status.TextColor3 = Color3.fromRGB(200, 120, 120)
    status.Text = ""; status.Parent = frame

    verifyBtn.MouseButton1Click:Connect(function()
        if keyIsValid(box.Text) then
            status.TextColor3 = Color3.fromRGB(120, 220, 140)
            status.Text = "Key accepted! Unlocking..."
            task.wait(0.4)
            unlock()
        else
            status.TextColor3 = Color3.fromRGB(220, 120, 120)
            status.Text = "Invalid key. Get a fresh one and try again."
        end
    end)
end

buildGui()
