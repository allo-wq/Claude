--[[
    JJS Hub - mobile-friendly utility script for Jujutsu Shenanigans (made for Delta)
    Game: https://www.roblox.com/games/9391468976/Jujutsu-Shenanigans

    Features
      Player   : Speed, High Jump, Infinite Jump, Noclip, Fly (works with the mobile thumbstick)
      Moves    : Character combos (presets + your own), on-screen combo button,
                 timed / Auto Black Flash, Dash Behind, Star Rage auto black hole,
                 Face Nearest Enemy, Auto M1, Auto Block, character auto-detect
      Visual   : Player ESP (health-coloured highlight + name / HP / distance), Fullbright
      Teleport : Teleport to any player, save / return to a position
      Misc     : Anti-AFK, Rejoin, Unload

    Usage
      Paste into Delta and press Execute. Tap the round "JJS" button to show / hide the menu.
      The menu, the JJS button and the fly pad can all be dragged.
      Running the script again cleanly replaces the old copy.
]]

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local Lighting = game:GetService("Lighting")
local StarterGui = game:GetService("StarterGui")
local TeleportService = game:GetService("TeleportService")
local CoreGui = game:GetService("CoreGui")
local VirtualUser = game:GetService("VirtualUser")
local TweenService = game:GetService("TweenService")
local _, VirtualInputManager = pcall(game.GetService, game, "VirtualInputManager")

local LP = Players.LocalPlayer
local GAME_ID = 3508322461 -- universe ID, shared by every Jujutsu Shenanigans server and place

-- Unload a previous copy so re-executing never stacks two menus.
local genv = (getgenv and getgenv()) or _G
if genv.JJSHubUnload then
	pcall(genv.JJSHubUnload)
end

local Settings = {
	Speed = false,
	WalkSpeed = 32,
	Jump = false,
	JumpPower = 75,
	InfJump = false,
	Noclip = false,
	Fly = false,
	FlySpeed = 60,
	ESP = false,
	Fullbright = false,
	AntiAFK = true,
	Character = 1,
	ComboIndex = 1,
	CustomCombo = "M1 M1 M1 M1 3 W0.4 3",
	M1Gap = 0.35,
	SkillGap = 0.6,
	ComboPad = false,
	FaceTarget = false,
	AutoM1 = false,
	AutoBlock = false,
	TargetRange = 15,
	BFKey = "3",
	BFDelay = 0.4,
	AutoBlackFlash = false,
	FlashDetect = false,
	AutoBlackHole = false,
	BlackHoleHold = 2,
	DashBehind = false,
	DashStyle = 1,
	DashTime = 0.35,
	DashRange = 25,
	BehindDistance = 3,
}

local Defaults = { WalkSpeed = 16, JumpPower = 50, UseJumpPower = true }

local Theme = {
	Bg = Color3.fromRGB(20, 20, 26),
	Top = Color3.fromRGB(28, 28, 36),
	Item = Color3.fromRGB(34, 34, 44),
	Off = Color3.fromRGB(70, 70, 82),
	Stroke = Color3.fromRGB(55, 55, 68),
	Accent = Color3.fromRGB(0, 190, 115),
	Danger = Color3.fromRGB(210, 60, 60),
	Text = Color3.fromRGB(235, 235, 240),
	Sub = Color3.fromRGB(150, 150, 165),
	Esp = Color3.fromRGB(255, 200, 60),
	LowHp = Color3.fromRGB(255, 60, 60),
	HighHp = Color3.fromRGB(60, 230, 110),
}

local running = true
local connections = {}
local function track(conn)
	table.insert(connections, conn)
	return conn
end

local function notify(text)
	pcall(function()
		StarterGui:SetCore("SendNotification", { Title = "JJS Hub", Text = text, Duration = 4 })
	end)
end

local function getHum()
	local char = LP.Character
	return char and char:FindFirstChildOfClass("Humanoid")
end

local function getRoot()
	local char = LP.Character
	return char and char:FindFirstChild("HumanoidRootPart")
end

---------------------------------------------------------------------------
-- Movement
---------------------------------------------------------------------------

local function captureDefaults(hum)
	if not Settings.Speed then
		Defaults.WalkSpeed = hum.WalkSpeed
	end
	if not Settings.Jump then
		Defaults.JumpPower = hum.JumpPower
		Defaults.UseJumpPower = hum.UseJumpPower
	end
end

local function restoreSpeed()
	local hum = getHum()
	if hum then
		hum.WalkSpeed = Defaults.WalkSpeed
	end
end

local function restoreJump()
	local hum = getHum()
	if hum then
		hum.JumpPower = Defaults.JumpPower
		hum.UseJumpPower = Defaults.UseJumpPower
	end
end

-- Parts we turned collision off on, so noclip can put them back exactly.
local noclipped = setmetatable({}, { __mode = "k" })

local function setNoclip(on)
	if on then
		return
	end
	for part in pairs(noclipped) do
		if part.Parent then
			part.CanCollide = true
		end
	end
	table.clear(noclipped)
end

local flyVelocity, flyGyro
local flyVertical = 0 -- 1 = up, -1 = down, set by the fly pad (or Space / LeftControl on keyboard)

local function stopFly()
	if flyVelocity then
		flyVelocity:Destroy()
		flyVelocity = nil
	end
	if flyGyro then
		flyGyro:Destroy()
		flyGyro = nil
	end
end

local function startFly()
	stopFly()
	local root = getRoot()
	if not root then
		return
	end
	flyVelocity = Instance.new("BodyVelocity")
	flyVelocity.MaxForce = Vector3.new(1e9, 1e9, 1e9)
	flyVelocity.Velocity = Vector3.zero
	flyVelocity.Parent = root
	flyGyro = Instance.new("BodyGyro")
	flyGyro.MaxTorque = Vector3.new(1e9, 1e9, 1e9)
	flyGyro.P = 9e4
	flyGyro.CFrame = root.CFrame
	flyGyro.Parent = root
end

local function updateFly()
	local root = getRoot()
	if not root then
		return
	end
	-- Recreate after a respawn (the old movers died with the old character).
	if not flyVelocity or flyVelocity.Parent ~= root then
		startFly()
	end

	-- MoveDirection comes from the thumbstick / WASD and is already camera-relative
	-- on the horizontal plane; map it back onto the full camera axes so looking
	-- up or down while moving forward climbs or dives.
	local hum = getHum()
	local cam = workspace.CurrentCamera
	local look, right = cam.CFrame.LookVector, cam.CFrame.RightVector
	local flatLook = Vector3.new(look.X, 0, look.Z)
	local flatRight = Vector3.new(right.X, 0, right.Z)
	local move = hum and hum.MoveDirection or Vector3.zero

	local dir = Vector3.new(0, flyVertical, 0)
	if flatLook.Magnitude > 0.01 then
		dir += look * move:Dot(flatLook.Unit)
	end
	if flatRight.Magnitude > 0.01 then
		dir += right * move:Dot(flatRight.Unit)
	end
	if dir.Magnitude > 1 then
		dir = dir.Unit
	end

	flyVelocity.Velocity = dir * Settings.FlySpeed
	if flatLook.Magnitude > 0.01 then
		flyGyro.CFrame = CFrame.lookAt(Vector3.zero, flatLook)
	end
end

---------------------------------------------------------------------------
-- Fullbright
---------------------------------------------------------------------------

local FULLBRIGHT = {
	Brightness = 2,
	ClockTime = 14,
	FogEnd = 1e5,
	GlobalShadows = false,
	Ambient = Color3.fromRGB(178, 178, 178),
	OutdoorAmbient = Color3.fromRGB(128, 128, 128),
}
local savedLighting

local function applyFullbright()
	for prop, value in pairs(FULLBRIGHT) do
		if Lighting[prop] ~= value then
			Lighting[prop] = value
		end
	end
end

local function setFullbright(on)
	if on then
		if not savedLighting then
			savedLighting = {}
			for prop in pairs(FULLBRIGHT) do
				savedLighting[prop] = Lighting[prop]
			end
		end
		applyFullbright()
	elseif savedLighting then
		for prop, value in pairs(savedLighting) do
			Lighting[prop] = value
		end
		savedLighting = nil
	end
end

---------------------------------------------------------------------------
-- GUI helpers
---------------------------------------------------------------------------

local function new(class, props, children)
	local inst = Instance.new(class)
	for key, value in pairs(props or {}) do
		if key ~= "Parent" then
			inst[key] = value
		end
	end
	for _, child in ipairs(children or {}) do
		child.Parent = inst
	end
	if props and props.Parent then
		inst.Parent = props.Parent
	end
	return inst
end

local function round(scale, offset)
	return new("UICorner", { CornerRadius = UDim.new(scale, offset) })
end

-- Prefer Delta's hidden UI container, then CoreGui, then PlayerGui.
local function mount(gui)
	local targets = {}
	if gethui then
		local ok, hui = pcall(gethui)
		if ok and hui then
			table.insert(targets, hui)
		end
	end
	table.insert(targets, CoreGui)
	table.insert(targets, LP:WaitForChild("PlayerGui"))
	for _, target in ipairs(targets) do
		if pcall(function()
			gui.Parent = target
		end) then
			return target
		end
	end
end

-- Touch + mouse dragging. Returns a state table whose `moved` flag lets a
-- draggable button ignore the tap that ends a drag.
local function makeDraggable(handle, target)
	local state = { moved = false }
	local dragInput, dragStart, startPos
	handle.InputBegan:Connect(function(input)
		if
			input.UserInputType ~= Enum.UserInputType.MouseButton1
			and input.UserInputType ~= Enum.UserInputType.Touch
		then
			return
		end
		dragInput, dragStart, startPos = input, input.Position, target.Position
		state.moved = false
	end)
	track(UserInputService.InputChanged:Connect(function(input)
		if not dragInput then
			return
		end
		if input ~= dragInput and input.UserInputType ~= Enum.UserInputType.MouseMovement then
			return
		end
		local delta = input.Position - dragStart
		if delta.Magnitude > 6 then
			state.moved = true
		end
		if state.moved then
			target.Position = UDim2.new(
				startPos.X.Scale,
				startPos.X.Offset + delta.X,
				startPos.Y.Scale,
				startPos.Y.Offset + delta.Y
			)
		end
	end))
	track(UserInputService.InputEnded:Connect(function(input)
		if input == dragInput or input.UserInputType == Enum.UserInputType.MouseButton1 then
			dragInput = nil
		end
	end))
	return state
end

---------------------------------------------------------------------------
-- ESP
---------------------------------------------------------------------------

local gui = new("ScreenGui", {
	Name = "JJSHub",
	ResetOnSpawn = false,
	IgnoreGuiInset = true,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	DisplayOrder = 999,
})
local container = mount(gui)
local espFolder = new("Folder", { Name = "JJSHubESP", Parent = container })
local espObjects = {}

local function removeEsp(plr)
	local esp = espObjects[plr]
	if esp then
		esp.highlight:Destroy()
		esp.billboard:Destroy()
		espObjects[plr] = nil
	end
end

local function clearEsp()
	for plr in pairs(espObjects) do
		removeEsp(plr)
	end
end

-- JJS is free-for-all, so colour by health: green when full, red when nearly dead.
local function espHealth(char)
	local hum = char:FindFirstChildOfClass("Humanoid")
	if not hum or hum.MaxHealth <= 0 then
		return Theme.Esp, nil
	end
	local ratio = math.clamp(hum.Health / hum.MaxHealth, 0, 1)
	return Theme.LowHp:Lerp(Theme.HighHp, ratio), math.ceil(hum.Health)
end

local function updateEsp()
	local myRoot = getRoot()
	for _, plr in ipairs(Players:GetPlayers()) do
		if plr ~= LP then
			local char = plr.Character
			local head = char and (char:FindFirstChild("Head") or char:FindFirstChild("HumanoidRootPart"))
			if not head then
				removeEsp(plr)
			else
				local esp = espObjects[plr]
				if not esp then
					local billboard = new("BillboardGui", {
						Size = UDim2.fromOffset(220, 36),
						StudsOffset = Vector3.new(0, 2.6, 0),
						AlwaysOnTop = true,
						LightInfluence = 0,
						Parent = espFolder,
					})
					esp = {
						highlight = new("Highlight", {
							FillTransparency = 0.65,
							OutlineTransparency = 0,
							DepthMode = Enum.HighlightDepthMode.AlwaysOnTop,
							Parent = espFolder,
						}),
						billboard = billboard,
						label = new("TextLabel", {
							BackgroundTransparency = 1,
							Size = UDim2.fromScale(1, 1),
							Font = Enum.Font.GothamBold,
							TextSize = 13,
							TextStrokeTransparency = 0.4,
							Parent = billboard,
						}),
					}
					espObjects[plr] = esp
				end

				if esp.highlight.Adornee ~= char then
					esp.highlight.Adornee = char
				end
				if esp.billboard.Adornee ~= head then
					esp.billboard.Adornee = head
				end

				local color, health = espHealth(char)
				esp.highlight.FillColor = color
				esp.highlight.OutlineColor = color
				esp.label.TextColor3 = color

				local text = plr.DisplayName
				if health then
					text ..= "  HP " .. health
				end
				local theirRoot = char:FindFirstChild("HumanoidRootPart")
				if myRoot and theirRoot then
					text ..= string.format("  %d studs", math.floor((myRoot.Position - theirRoot.Position).Magnitude))
				end
				esp.label.Text = text
			end
		end
	end
end

---------------------------------------------------------------------------
-- Unload
---------------------------------------------------------------------------

local releaseCombat -- defined with the combat helpers below

local function unload()
	if not running then
		return
	end
	running = false
	if releaseCombat then
		releaseCombat()
	end
	for _, conn in ipairs(connections) do
		conn:Disconnect()
	end
	table.clear(connections)
	stopFly()
	setNoclip(false)
	setFullbright(false)
	clearEsp()
	if Settings.Speed then
		restoreSpeed()
	end
	if Settings.Jump then
		restoreJump()
	end
	gui:Destroy()
	espFolder:Destroy()
	if genv.JJSHubUnload == unload then
		genv.JJSHubUnload = nil
	end
end
genv.JJSHubUnload = unload

---------------------------------------------------------------------------
-- Window
---------------------------------------------------------------------------

local viewport = workspace.CurrentCamera.ViewportSize
local PANEL_W = math.clamp(math.floor(viewport.X * 0.45), 260, 340)
local PANEL_H = math.clamp(math.floor(viewport.Y * 0.8), 220, 340)

local openButton = new("TextButton", {
	Size = UDim2.fromOffset(52, 52),
	Position = UDim2.new(0, 14, 0.3, 0),
	BackgroundColor3 = Theme.Accent,
	Text = "JJS",
	Font = Enum.Font.GothamBold,
	TextSize = 16,
	TextColor3 = Color3.new(1, 1, 1),
	Parent = gui,
}, {
	round(1, 0),
	new("UIStroke", {
		Color = Color3.new(1, 1, 1),
		Thickness = 2,
		Transparency = 0.4,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
	}),
})

local main = new("Frame", {
	Size = UDim2.fromOffset(PANEL_W, PANEL_H),
	Position = UDim2.new(0.5, -PANEL_W / 2, 0.5, -PANEL_H / 2),
	BackgroundColor3 = Theme.Bg,
	BorderSizePixel = 0,
	Active = true,
	Parent = gui,
}, { round(0, 10), new("UIStroke", { Color = Theme.Stroke, Thickness = 1 }) })

local topBar = new("Frame", {
	Size = UDim2.new(1, 0, 0, 38),
	BackgroundColor3 = Theme.Top,
	BorderSizePixel = 0,
	Parent = main,
}, {
	round(0, 10),
	-- squares off the bottom corners of the title bar
	new("Frame", {
		Size = UDim2.new(1, 0, 0, 10),
		Position = UDim2.new(0, 0, 1, -10),
		BackgroundColor3 = Theme.Top,
		BorderSizePixel = 0,
	}),
	new("TextLabel", {
		Text = "JJS Hub",
		Font = Enum.Font.GothamBold,
		TextSize = 16,
		TextColor3 = Theme.Text,
		TextXAlignment = Enum.TextXAlignment.Left,
		BackgroundTransparency = 1,
		Position = UDim2.fromOffset(12, 0),
		Size = UDim2.new(1, -90, 1, 0),
	}),
})

local function topButton(text, x, color)
	return new("TextButton", {
		Text = text,
		Font = Enum.Font.GothamBold,
		TextSize = 16,
		TextColor3 = Theme.Text,
		BackgroundColor3 = color,
		Size = UDim2.fromOffset(30, 26),
		Position = UDim2.new(1, x, 0.5, -13),
		ZIndex = 2,
		Parent = topBar,
	}, { round(0, 6) })
end
local hideButton = topButton("-", -72, Theme.Item)
local closeButton = topButton("X", -38, Theme.Danger)

local tabBar = new("Frame", {
	Size = UDim2.new(1, -16, 0, 30),
	Position = UDim2.fromOffset(8, 44),
	BackgroundTransparency = 1,
	Parent = main,
}, {
	new("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		Padding = UDim.new(0, 4),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}),
})

local pages = new("Frame", {
	Size = UDim2.new(1, -16, 1, -88),
	Position = UDim2.fromOffset(8, 80),
	BackgroundTransparency = 1,
	Parent = main,
})

new("TextLabel", {
	Text = "Tap JJS to show / hide  -  drag the title bar to move",
	Font = Enum.Font.Gotham,
	TextSize = 10,
	TextColor3 = Theme.Sub,
	BackgroundTransparency = 1,
	Size = UDim2.new(1, 0, 0, 8),
	Position = UDim2.new(0, 0, 1, -10),
	Parent = main,
})

---------------------------------------------------------------------------
-- Fly pad (separate so it stays usable with the menu hidden)
---------------------------------------------------------------------------

local flyPad = new("Frame", {
	Size = UDim2.fromOffset(64, 140),
	Position = UDim2.new(1, -84, 0.25, 0),
	BackgroundColor3 = Theme.Bg,
	BackgroundTransparency = 0.2,
	Visible = false,
	Parent = gui,
}, { round(0, 10), new("UIStroke", { Color = Theme.Stroke }) })

local flyPadHandle = new("TextLabel", {
	Text = "FLY",
	Font = Enum.Font.GothamBold,
	TextSize = 12,
	TextColor3 = Theme.Sub,
	BackgroundTransparency = 1,
	Size = UDim2.new(1, 0, 0, 20),
	Parent = flyPad,
})
makeDraggable(flyPadHandle, flyPad)

local function holdButton(text, y, value)
	local button = new("TextButton", {
		Text = text,
		Font = Enum.Font.GothamBold,
		TextSize = 14,
		TextColor3 = Color3.new(1, 1, 1),
		BackgroundColor3 = Theme.Accent,
		Size = UDim2.new(1, -12, 0, 52),
		Position = UDim2.new(0, 6, 0, y),
		Parent = flyPad,
	}, { round(0, 8) })
	local function release()
		if flyVertical == value then
			flyVertical = 0
		end
	end
	button.MouseButton1Down:Connect(function()
		flyVertical = value
	end)
	button.MouseButton1Up:Connect(release)
	button.InputEnded:Connect(function(input)
		if
			input.UserInputType == Enum.UserInputType.Touch
			or input.UserInputType == Enum.UserInputType.MouseButton1
		then
			release()
		end
	end)
end
holdButton("UP", 22, 1)
holdButton("DOWN", 80, -1)

local function setFly(on)
	flyPad.Visible = on
	flyVertical = 0
	if on then
		notify("Heads up: JJS players report bans for flying a lot. Keep it short.")
		startFly()
	else
		stopFly()
	end
end

---------------------------------------------------------------------------
-- Characters: combos and combat assist
---------------------------------------------------------------------------

-- Every character uses M1 plus keys 1-4 for moves, R special, Q dash, F block
-- and G awakening. Combos are space-separated steps:
--   M1       basic attack          1 2 3 4   moves
--   R Q F G  special / dash / block / awakening
--   R+4      hold R while pressing 4 (variant moves)
--   W0.4     wait 0.4 seconds instead of the usual gap after the previous step
--   BF       timed Black Flash (see blackFlash below)
--   BEHIND   dash behind the nearest enemy
-- `blackFlash` is the move that is pressed twice, with the second press on the
-- white flash `delay` seconds after the move's animation starts.
local CHARACTERS = {
	{ name = "Any", moves = {}, combos = {} },
	{
		name = "Vessel",
		moves = { "Cursed Strikes", "Crushing Blow", "Divergent Fist", "Manji Kick" },
		blackFlash = { key = "3", delay = 0.4 },
		combos = {
			{ "Black Flash", "BF" },
			{ "M1s into Black Flash", "M1 M1 M1 M1 BF" },
			{ "Cursed Chain", "1 M1 M1 M1 2" },
			{ "Crushing Finisher", "M1 M1 M1 M1 2 1" },
		},
	},
	{
		name = "Switcher",
		moves = { "Swift Kick", "Brute Force", "Pebble Throw", "Elbow Drop" },
		blackFlash = { key = "2", delay = 0.4 },
		combos = {
			{ "Brute Force Black Flash", "BF" },
		},
	},
	{
		name = "Star Rage",
		moves = { "Garuda Rebound", "Rising Rage", "Mass Breaker", "Garuda Stab" },
		combos = {},
	},
	{
		name = "Salaryman",
		moves = { "Cleaving Whirlwind", "Severance Kick", "Blunt Cut", "Stabilize" },
		combos = {},
	},
	{
		name = "Cursed Partners",
		moves = { "Severing Path", "Resolute Slash", "Outburst", "Second Wind" },
		combos = {},
	},
	{
		name = "Honored One",
		moves = { "Lapse Blue", "Reversal Red", "Rapid Punches", "Twofold Kick" },
		combos = {
			{ "Rapid Kicks", "M1 M1 M1 M1 3 4 M1 M1 M1 Q 2" },
			{ "Red Opener", "2 M1 M1 M1 M1 M1 1" },
			{ "Blue Route", "M1 M1 M1 1 R+4 M1 M1 M1 2" },
		},
	},
	{
		name = "Restless Gambler",
		moves = { "Reserve Balls", "Shutter Doors", "Rough Energy", "Fever Breaker" },
		combos = {},
	},
	{ name = "Ten Shadows", moves = { "Rabbit Escape", "Nue", "Toad", "Divine Dog" }, combos = {} },
	{
		name = "Perfection",
		moves = { "Stockpile", "Soul Fire", "Focus Strike", "Body Repel" },
		combos = {
			{ "Awakened Black Flash (while awakened)", "G" },
		},
	},
	{
		name = "Blood Manipulator",
		moves = { "Piercing Blood", "Flowing Red Scale", "Supernova", "Blood Edge" },
		combos = {},
	},
}

-- Shared by every character, listed after the character's own combos.
local UNIVERSAL_COMBOS = {
	{ "Basic", "M1 M1 M1 M1 1" },
	{ "Double Skill", "M1 M1 M1 M1 3 4" },
	{ "Dash Extend", "M1 M1 M1 M1 Q M1 M1 M1 2" },
}

local KEYS = {
	["1"] = Enum.KeyCode.One,
	["2"] = Enum.KeyCode.Two,
	["3"] = Enum.KeyCode.Three,
	["4"] = Enum.KeyCode.Four,
	R = Enum.KeyCode.R,
	Q = Enum.KeyCode.Q,
	F = Enum.KeyCode.F,
	G = Enum.KeyCode.G,
}

local function keyDown(code)
	pcall(function()
		VirtualInputManager:SendKeyEvent(true, code, false, game)
	end)
end

local function keyUp(code)
	pcall(function()
		VirtualInputManager:SendKeyEvent(false, code, false, game)
	end)
end

local function tapKey(code)
	keyDown(code)
	task.wait(0.05)
	keyUp(code)
end

-- PC clicks where the mouse is; touch screens click the middle of the view,
-- which is why the menu hides itself before a combo runs.
local function clickM1()
	local point
	if UserInputService.MouseEnabled and not UserInputService.TouchEnabled then
		point = UserInputService:GetMouseLocation()
	else
		local viewport = workspace.CurrentCamera.ViewportSize
		point = Vector2.new(viewport.X / 2, viewport.Y * 0.45)
	end
	pcall(function()
		VirtualInputManager:SendMouseButtonEvent(point.X, point.Y, 0, true, game, 1)
		task.wait(0.03)
		VirtualInputManager:SendMouseButtonEvent(point.X, point.Y, 0, false, game, 1)
	end)
end

local function nearestEnemy(range)
	local root = getRoot()
	if not root then
		return nil
	end
	local best, bestDistance
	for _, plr in ipairs(Players:GetPlayers()) do
		local char = plr ~= LP and plr.Character
		local theirRoot = char and char:FindFirstChild("HumanoidRootPart")
		local theirHum = char and char:FindFirstChildOfClass("Humanoid")
		if theirRoot and theirHum and theirHum.Health > 0 then
			local distance = (theirRoot.Position - root.Position).Magnitude
			if distance <= range and (not bestDistance or distance < bestDistance) then
				best, bestDistance = theirRoot, distance
			end
		end
	end
	return best
end

-- Attacks play at Action priority or higher; idle / walk / run play below it.
local ATTACK_PRIORITIES = {
	[Enum.AnimationPriority.Action] = true,
	[Enum.AnimationPriority.Action2] = true,
	[Enum.AnimationPriority.Action3] = true,
	[Enum.AnimationPriority.Action4] = true,
}

local function isAttacking(char)
	local hum = char:FindFirstChildOfClass("Humanoid")
	local animator = hum and hum:FindFirstChildOfClass("Animator")
	if not animator then
		return false
	end
	for _, track in ipairs(animator:GetPlayingAnimationTracks()) do
		if ATTACK_PRIORITIES[track.Priority] then
			return true
		end
	end
	return false
end

local function threatNearby(range)
	local root = getRoot()
	if not root then
		return false
	end
	for _, plr in ipairs(Players:GetPlayers()) do
		local char = plr ~= LP and plr.Character
		local theirRoot = char and char:FindFirstChild("HumanoidRootPart")
		if theirRoot and (theirRoot.Position - root.Position).Magnitude <= range and isAttacking(char) then
			return true
		end
	end
	return false
end

local autoRotateOff = false
local function restoreAutoRotate()
	if autoRotateOff then
		local hum = getHum()
		if hum then
			hum.AutoRotate = true
		end
		autoRotateOff = false
	end
end

local blocking = false
local function releaseBlock()
	if blocking then
		keyUp(KEYS.F)
		blocking = false
	end
end

-- Dash behind ---------------------------------------------------------------

local DASH_STYLES = { "Game Dash (Q)", "Game Dash + Snap", "Slide" }
local dashing = false -- pauses Face Nearest Enemy so the dash can turn the character

local function slideTo(root, goal)
	local tween = TweenService:Create(root, TweenInfo.new(0.1, Enum.EasingStyle.Quad), { CFrame = goal })
	tween:Play()
	tween.Completed:Wait()
	root.AssemblyLinearVelocity = Vector3.zero
end

-- Swings the camera around the character so it looks along `direction`,
-- keeping its current distance and height.
local function pointCameraAlong(direction)
	local cam = workspace.CurrentCamera
	local root = getRoot()
	local flat = Vector3.new(direction.X, 0, direction.Z)
	if not root or flat.Magnitude < 0.01 then
		return
	end
	local focus = root.Position + Vector3.new(0, 1.5, 0)
	local offset = cam.CFrame.Position - focus
	local horizontal = math.sqrt(math.max(offset.Magnitude ^ 2 - offset.Y ^ 2, 0))
	cam.CFrame = CFrame.lookAt(focus - flat.Unit * horizontal + Vector3.new(0, offset.Y, 0), focus)
end

-- Gets you behind the nearest enemy within Dash Range, facing their back.
-- The game dashes with Q toward the held movement key, and movement keys are
-- camera-relative, so the Game Dash styles point the camera along the path,
-- hold W, tap Q, then turn the camera back onto the target.
local function dashBehind()
	local root = getRoot()
	local target = nearestEnemy(Settings.DashRange)
	if not root or not target then
		return false
	end
	-- +Z in the target's own space is directly behind them
	local spot = (target.CFrame * CFrame.new(0, 0, Settings.BehindDistance)).Position
	local function facingTarget(position)
		return CFrame.lookAt(position, Vector3.new(target.Position.X, position.Y, target.Position.Z))
	end
	local style = DASH_STYLES[Settings.DashStyle]
	if style == "Slide" then
		slideTo(root, facingTarget(spot))
		return true
	end

	-- Aim past whichever side of them we're already on so the dash doesn't run into them.
	local right = target.CFrame.RightVector
	local side = (root.Position - target.Position):Dot(right) >= 0 and 1 or -1
	local path = (spot + right * side * 2.5) - root.Position
	if Vector3.new(path.X, 0, path.Z).Magnitude < 1 then
		return true
	end

	dashing = true
	restoreAutoRotate()
	pointCameraAlong(path)
	keyDown(Enum.KeyCode.W)
	task.wait(0.05)
	tapKey(KEYS.Q)
	task.wait(0.05)
	keyUp(Enum.KeyCode.W)
	task.wait(Settings.DashTime)
	dashing = false

	if style == "Game Dash + Snap" then
		slideTo(root, facingTarget(spot))
	end
	pointCameraAlong(target.Position - root.Position)
	return true
end

-- Black Flash ---------------------------------------------------------------

local bfBusy = false
local bfCooldownUntil = 0 -- stops our own second press from re-triggering Auto Black Flash
local learnedFlashAnim = {} -- [character name] = AnimationId of that character's Black Flash move

-- Waits for our character to start an attack animation. Returns the track and
-- the os.clock() time it started, or nil after `timeout`.
local function waitForOwnAttack(timeout)
	local hum = getHum()
	local animator = hum and hum:FindFirstChildOfClass("Animator")
	if not animator then
		return nil
	end
	local found, startedAt
	local conn = animator.AnimationPlayed:Connect(function(track)
		if not found and ATTACK_PRIORITIES[track.Priority] then
			found, startedAt = track, os.clock()
		end
	end)
	local deadline = os.clock() + timeout
	while not found and os.clock() < deadline do
		task.wait()
	end
	conn:Disconnect()
	return found, startedAt
end

-- Returns early if a Highlight (the white flash) appears on our character
-- before `deadline`; otherwise returns at the deadline.
local function waitForFlash(char, deadline)
	local flashed = false
	local conn = char.DescendantAdded:Connect(function(obj)
		if obj:IsA("Highlight") then
			flashed = true
		end
	end)
	while not flashed and os.clock() < deadline do
		task.wait()
	end
	conn:Disconnect()
end

local function secondPress(code, startedAt)
	local deadline = startedAt + Settings.BFDelay
	local char = LP.Character
	if Settings.FlashDetect and char then
		waitForFlash(char, deadline)
	else
		local remaining = deadline - os.clock()
		if remaining > 0 then
			task.wait(remaining)
		end
	end
	tapKey(code)
	bfCooldownUntil = os.clock() + 1.5
end

-- Presses the Black Flash move, learns its animation, then lands the second press
-- on the flash. Timing is measured from when the animation starts, not from
-- the key press, so ping doesn't throw it off.
local function blackFlash()
	local code = KEYS[Settings.BFKey]
	if bfBusy or not code then
		return
	end
	bfBusy = true
	if Settings.DashBehind then
		dashBehind()
	end
	local pressedAt = os.clock()
	tapKey(code)
	local track, startedAt = waitForOwnAttack(0.6)
	if track and track.Animation then
		learnedFlashAnim[CHARACTERS[Settings.Character].name] = track.Animation.AnimationId
	end
	secondPress(code, startedAt or pressedAt)
	bfBusy = false
end

-- Auto Black Flash: when you start the learned move yourself, finish it for you.
local function onOwnAnimation(track)
	if not Settings.AutoBlackFlash or bfBusy or os.clock() < bfCooldownUntil then
		return
	end
	local learned = learnedFlashAnim[CHARACTERS[Settings.Character].name]
	local code = KEYS[Settings.BFKey]
	if learned and code and track.Animation and track.Animation.AnimationId == learned then
		bfBusy = true
		local startedAt = os.clock()
		task.spawn(function()
			secondPress(code, startedAt)
			bfBusy = false
		end)
	end
end

-- Star Rage black hole ------------------------------------------------------

-- Star Rage's ultimate only works after she dies: G latches onto an enemy,
-- then holding R summons the black hole.
local function blackHole()
	tapKey(KEYS.G)
	task.wait(1)
	keyDown(KEYS.R)
	task.wait(Settings.BlackHoleHold)
	keyUp(KEYS.R)
end

local characterConns = {}
local function hookCharacter(char)
	for _, conn in ipairs(characterConns) do
		conn:Disconnect()
	end
	table.clear(characterConns)
	local hum = char and char:WaitForChild("Humanoid", 10)
	local animator = hum and hum:WaitForChild("Animator", 5)
	if not running or not hum then
		return
	end
	if animator then
		table.insert(characterConns, animator.AnimationPlayed:Connect(onOwnAnimation))
	end
	table.insert(
		characterConns,
		hum.Died:Connect(function()
			if Settings.AutoBlackHole and CHARACTERS[Settings.Character].name == "Star Rage" then
				task.delay(0.5, function()
					if running then
						blackHole()
					end
				end)
			end
		end)
	)
end

local comboRunning = false
local comboRun = 0 -- bumped on every start / stop so an old combo thread knows to quit
local comboStateChanged

local function setComboRunning(value)
	comboRunning = value
	if comboStateChanged then
		comboStateChanged()
	end
end

-- Starts a combo, or stops the one that is running.
local function runCombo(sequence)
	comboRun += 1
	if comboRunning then
		setComboRunning(false)
		return
	end
	local myRun = comboRun
	setComboRunning(true)
	local steps = {}
	for step in string.gmatch(string.upper(sequence), "%S+") do
		table.insert(steps, step)
	end
	task.spawn(function()
		-- open from behind, unless the first step positions itself (BEHIND, or BF which dashes too)
		if Settings.DashBehind and steps[1] ~= "BEHIND" and steps[1] ~= "BF" then
			dashBehind()
		end
		for i, step in ipairs(steps) do
			if not running or comboRun ~= myRun then
				return
			end
			local pause = string.match(step, "^W([%d%.]+)$")
			local gap = 0
			if pause then
				task.wait(tonumber(pause) or 0)
			elseif step == "M1" then
				clickM1()
				gap = Settings.M1Gap
			elseif step == "BEHIND" then
				dashBehind()
				gap = 0.05
			elseif step == "BF" then
				blackFlash()
				gap = Settings.SkillGap
			elseif string.find(step, "+", 1, true) then
				local held = {}
				for part in string.gmatch(step, "[^+]+") do
					if KEYS[part] then
						table.insert(held, KEYS[part])
					end
				end
				for _, code in ipairs(held) do
					keyDown(code)
					task.wait(0.03)
				end
				task.wait(0.05)
				for j = #held, 1, -1 do
					keyUp(held[j])
				end
				gap = Settings.SkillGap
			elseif KEYS[step] then
				tapKey(KEYS[step])
				gap = Settings.SkillGap
			end
			-- an explicit W step right after replaces the default gap (e.g. Black Flash timing)
			local nextStep = steps[i + 1]
			if gap > 0 and not (nextStep and string.match(nextStep, "^W[%d%.]+$")) then
				task.wait(gap)
			end
		end
		if comboRun == myRun then
			setComboRunning(false)
		end
	end)
end

releaseCombat = function()
	comboRun += 1
	comboRunning = false
	releaseBlock()
	keyUp(KEYS.R)
	restoreAutoRotate()
	for _, conn in ipairs(characterConns) do
		conn:Disconnect()
	end
	table.clear(characterConns)
end

local function currentCombos()
	local combos = {}
	for _, combo in ipairs(CHARACTERS[Settings.Character].combos) do
		table.insert(combos, combo)
	end
	for _, combo in ipairs(UNIVERSAL_COMBOS) do
		table.insert(combos, combo)
	end
	table.insert(combos, { "Custom" })
	return combos
end

local function comboSequence(combo)
	return combo[2] or Settings.CustomCombo
end

local function selectedCombo()
	local combos = currentCombos()
	Settings.ComboIndex = math.clamp(Settings.ComboIndex, 1, #combos)
	return combos[Settings.ComboIndex]
end

-- Combo pad: fires the selected combo without opening the menu.
local comboPad = new("Frame", {
	Size = UDim2.fromOffset(130, 164),
	Position = UDim2.new(1, -224, 0.25, 0),
	BackgroundColor3 = Theme.Bg,
	BackgroundTransparency = 0.2,
	Visible = false,
	Parent = gui,
}, { round(0, 10), new("UIStroke", { Color = Theme.Stroke }) })

local comboPadLabel = new("TextLabel", {
	Font = Enum.Font.GothamBold,
	TextSize = 12,
	TextColor3 = Theme.Sub,
	TextTruncate = Enum.TextTruncate.AtEnd,
	BackgroundTransparency = 1,
	Position = UDim2.fromOffset(4, 0),
	Size = UDim2.new(1, -8, 0, 20),
	Parent = comboPad,
})
makeDraggable(comboPadLabel, comboPad)

local comboGo = new("TextButton", {
	Font = Enum.Font.GothamBold,
	TextSize = 15,
	TextColor3 = Color3.new(1, 1, 1),
	BackgroundColor3 = Theme.Accent,
	Size = UDim2.new(1, -12, 0, 40),
	Position = UDim2.fromOffset(6, 22),
	Parent = comboPad,
}, { round(0, 8) })

local function refreshComboPad()
	comboPadLabel.Text = selectedCombo()[1]
	comboGo.Text = comboRunning and "STOP" or "COMBO"
	comboGo.BackgroundColor3 = comboRunning and Theme.Danger or Theme.Accent
end
comboStateChanged = refreshComboPad

comboGo.Activated:Connect(function()
	runCombo(comboSequence(selectedCombo()))
end)

local function comboPadArrow(text, position, delta)
	local button = new("TextButton", {
		Text = text,
		Font = Enum.Font.GothamBold,
		TextSize = 14,
		TextColor3 = Theme.Text,
		BackgroundColor3 = Theme.Item,
		Size = UDim2.new(0.5, -9, 0, 26),
		Position = position,
		Parent = comboPad,
	}, { round(0, 6) })
	button.Activated:Connect(function()
		local count = #currentCombos()
		Settings.ComboIndex = (Settings.ComboIndex - 1 + delta) % count + 1
		refreshComboPad()
	end)
end
comboPadArrow("<", UDim2.new(0, 6, 0, 66), -1)
comboPadArrow(">", UDim2.new(0.5, 3, 0, 66), 1)

local comboPadFlash = new("TextButton", {
	Text = "BLACK FLASH",
	Font = Enum.Font.GothamBold,
	TextSize = 13,
	TextColor3 = Color3.new(1, 1, 1),
	BackgroundColor3 = Color3.fromRGB(25, 25, 25),
	Size = UDim2.new(1, -12, 0, 30),
	Position = UDim2.fromOffset(6, 96),
	Parent = comboPad,
}, { round(0, 8), new("UIStroke", { Color = Theme.Danger, ApplyStrokeMode = Enum.ApplyStrokeMode.Border }) })
comboPadFlash.Activated:Connect(function()
	task.spawn(blackFlash)
end)

local comboPadBehind = new("TextButton", {
	Text = "DASH BEHIND",
	Font = Enum.Font.GothamBold,
	TextSize = 13,
	TextColor3 = Theme.Text,
	BackgroundColor3 = Theme.Item,
	Size = UDim2.new(1, -12, 0, 30),
	Position = UDim2.fromOffset(6, 130),
	Parent = comboPad,
}, { round(0, 8) })
comboPadBehind.Activated:Connect(function()
	task.spawn(dashBehind)
end)

---------------------------------------------------------------------------
-- Tabs and controls
---------------------------------------------------------------------------

local tabs = {}
local layoutOrder = 0
local function nextOrder()
	layoutOrder += 1
	return layoutOrder
end

local function selectTab(name)
	for tabName, tab in pairs(tabs) do
		local active = tabName == name
		tab.page.Visible = active
		tab.button.BackgroundColor3 = active and Theme.Accent or Theme.Item
		tab.button.TextColor3 = active and Color3.new(1, 1, 1) or Theme.Sub
	end
end

local TAB_COUNT = 5

local function createTab(name)
	local button = new("TextButton", {
		Text = name,
		LayoutOrder = nextOrder(),
		Size = UDim2.new(1 / TAB_COUNT, -4 * (TAB_COUNT - 1) / TAB_COUNT, 1, 0),
		Font = Enum.Font.GothamBold,
		TextScaled = true,
		BackgroundColor3 = Theme.Item,
		TextColor3 = Theme.Sub,
		AutoButtonColor = false,
		Parent = tabBar,
	}, {
		round(0, 6),
		new("UITextSizeConstraint", { MaxTextSize = 13 }),
		new("UIPadding", { PaddingLeft = UDim.new(0, 4), PaddingRight = UDim.new(0, 4) }),
	})
	local page = new("ScrollingFrame", {
		Size = UDim2.fromScale(1, 1),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ScrollBarThickness = 4,
		ScrollBarImageColor3 = Theme.Accent,
		CanvasSize = UDim2.new(),
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		ScrollingDirection = Enum.ScrollingDirection.Y,
		Visible = false,
		Parent = pages,
	}, {
		new("UIListLayout", { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }),
		new("UIPadding", {
			PaddingRight = UDim.new(0, 6),
			PaddingTop = UDim.new(0, 2),
			PaddingBottom = UDim.new(0, 2),
		}),
	})
	tabs[name] = { button = button, page = page }
	button.Activated:Connect(function()
		selectTab(name)
	end)
	return page
end

local function addSection(page, text)
	new("TextLabel", {
		Text = string.upper(text),
		Font = Enum.Font.GothamBold,
		TextSize = 11,
		TextColor3 = Theme.Sub,
		TextXAlignment = Enum.TextXAlignment.Left,
		BackgroundTransparency = 1,
		Size = UDim2.new(1, 0, 0, 18),
		LayoutOrder = nextOrder(),
		Parent = page,
	}, { new("UIPadding", { PaddingLeft = UDim.new(0, 4) }) })
end

local function addToggle(page, text, key, onChange)
	local row = new("TextButton", {
		Text = "",
		AutoButtonColor = false,
		BackgroundColor3 = Theme.Item,
		Size = UDim2.new(1, 0, 0, 40),
		LayoutOrder = nextOrder(),
		Parent = page,
	}, { round(0, 8) })
	new("TextLabel", {
		Text = text,
		Font = Enum.Font.Gotham,
		TextSize = 14,
		TextColor3 = Theme.Text,
		TextXAlignment = Enum.TextXAlignment.Left,
		BackgroundTransparency = 1,
		Position = UDim2.fromOffset(12, 0),
		Size = UDim2.new(1, -72, 1, 0),
		Parent = row,
	})
	local pill = new("Frame", {
		Size = UDim2.fromOffset(44, 22),
		Position = UDim2.new(1, -56, 0.5, -11),
		BackgroundColor3 = Theme.Off,
		Parent = row,
	}, { round(1, 0) })
	local knob = new("Frame", {
		Size = UDim2.fromOffset(18, 18),
		BackgroundColor3 = Color3.new(1, 1, 1),
		Parent = pill,
	}, { round(1, 0) })

	local function render()
		local on = Settings[key]
		pill.BackgroundColor3 = on and Theme.Accent or Theme.Off
		knob.Position = on and UDim2.new(1, -20, 0.5, -9) or UDim2.new(0, 2, 0.5, -9)
	end
	row.Activated:Connect(function()
		Settings[key] = not Settings[key]
		render()
		if onChange then
			onChange(Settings[key])
		end
	end)
	render()
end

local function addStepper(page, text, key, step, min, max)
	local row = new("Frame", {
		BackgroundColor3 = Theme.Item,
		Size = UDim2.new(1, 0, 0, 40),
		LayoutOrder = nextOrder(),
		Parent = page,
	}, { round(0, 8) })
	local label = new("TextLabel", {
		Font = Enum.Font.Gotham,
		TextSize = 14,
		TextColor3 = Theme.Text,
		TextXAlignment = Enum.TextXAlignment.Left,
		BackgroundTransparency = 1,
		Position = UDim2.fromOffset(12, 0),
		Size = UDim2.new(1, -100, 1, 0),
		Parent = row,
	})
	local function render()
		label.Text = text .. ": " .. Settings[key]
	end
	local function stepButton(symbol, x, delta)
		local button = new("TextButton", {
			Text = symbol,
			Font = Enum.Font.GothamBold,
			TextSize = 18,
			TextColor3 = Theme.Text,
			BackgroundColor3 = Theme.Off,
			Size = UDim2.fromOffset(36, 30),
			Position = UDim2.new(1, x, 0.5, -15),
			Parent = row,
		}, { round(0, 6) })
		button.Activated:Connect(function()
			-- round to 2 decimals so 0.05 steps don't drift into 0.35000000001
			Settings[key] = math.round(math.clamp(Settings[key] + delta, min, max) * 100) / 100
			render()
		end)
	end
	stepButton("-", -86, -step)
	stepButton("+", -44, step)
	render()
	return render
end

local function addButton(page, text, callback)
	local button = new("TextButton", {
		Text = text,
		Font = Enum.Font.GothamBold,
		TextSize = 14,
		TextColor3 = Theme.Text,
		BackgroundColor3 = Theme.Item,
		Size = UDim2.new(1, 0, 0, 38),
		LayoutOrder = nextOrder(),
		Parent = page,
	}, { round(0, 8) })
	button.Activated:Connect(callback)
	return button
end

local function addTextBox(page, placeholder, key)
	local box = new("TextBox", {
		Text = Settings[key],
		PlaceholderText = placeholder,
		ClearTextOnFocus = false,
		Font = Enum.Font.Code,
		TextSize = 14,
		TextColor3 = Theme.Text,
		PlaceholderColor3 = Theme.Sub,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextTruncate = Enum.TextTruncate.AtEnd,
		BackgroundColor3 = Theme.Item,
		Size = UDim2.new(1, 0, 0, 38),
		LayoutOrder = nextOrder(),
		Parent = page,
	}, { round(0, 8), new("UIPadding", { PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 10) }) })
	box.FocusLost:Connect(function()
		Settings[key] = box.Text
	end)
	return box
end

-- Player ------------------------------------------------------------------

local playerPage = createTab("Player")
addSection(playerPage, "Movement")
addToggle(playerPage, "Speed", "Speed", function(on)
	if not on then
		restoreSpeed()
	end
end)
addStepper(playerPage, "Walk Speed", "WalkSpeed", 4, 16, 200)
addToggle(playerPage, "High Jump", "Jump", function(on)
	if not on then
		restoreJump()
	end
end)
addStepper(playerPage, "Jump Power", "JumpPower", 10, 50, 300)
addToggle(playerPage, "Infinite Jump", "InfJump")
addToggle(playerPage, "Noclip", "Noclip", setNoclip)
addSection(playerPage, "Fly")
addToggle(playerPage, "Fly (use UP / DOWN pad)", "Fly", setFly)
addStepper(playerPage, "Fly Speed", "FlySpeed", 10, 10, 300)

-- Moves -------------------------------------------------------------------

local movesPage = createTab("Moves")
local setCharacter

-- The hotbar shows the equipped character's move names, so match them
-- against each character's moveset (two or more hits to count).
local function detectCharacter()
	local playerGui = LP:FindFirstChildOfClass("PlayerGui")
	if not playerGui then
		return nil
	end
	local texts = {}
	for _, obj in ipairs(playerGui:GetDescendants()) do
		if (obj:IsA("TextLabel") or obj:IsA("TextButton")) and obj.Text ~= "" and not obj:IsDescendantOf(gui) then
			table.insert(texts, string.lower(obj.Text))
		end
	end
	local bestIndex, bestScore = nil, 1
	for index, info in ipairs(CHARACTERS) do
		local score = 0
		for _, move in ipairs(info.moves) do
			local needle = string.lower(move)
			for _, text in ipairs(texts) do
				if string.find(text, needle, 1, true) then
					score += 1
					break
				end
			end
		end
		if score > bestScore then
			bestIndex, bestScore = index, score
		end
	end
	return bestIndex
end

local function autoDetect(quiet)
	local index = detectCharacter()
	if index then
		local changed = index ~= Settings.Character
		if changed then
			setCharacter(index)
		end
		if changed or not quiet then
			notify("Detected " .. CHARACTERS[index].name .. ".")
		end
	elseif not quiet then
		notify("Couldn't detect your character. Tap the Character button to pick it.")
	end
end

addSection(movesPage, "Character")
local characterButton = addButton(movesPage, "", function()
	setCharacter(Settings.Character % #CHARACTERS + 1)
end)
addButton(movesPage, "Auto-Detect Character", function()
	autoDetect(false)
end)
local moveLegend = new("TextLabel", {
	Font = Enum.Font.Gotham,
	TextSize = 12,
	TextColor3 = Theme.Sub,
	TextWrapped = true,
	TextXAlignment = Enum.TextXAlignment.Left,
	BackgroundTransparency = 1,
	Size = UDim2.new(1, 0, 0, 0),
	AutomaticSize = Enum.AutomaticSize.Y,
	LayoutOrder = nextOrder(),
	Parent = movesPage,
}, { new("UIPadding", { PaddingLeft = UDim.new(0, 4), PaddingRight = UDim.new(0, 4) }) })

addSection(movesPage, "Combos (tap to run, tap again to stop)")
local comboList = new("Frame", {
	BackgroundTransparency = 1,
	Size = UDim2.new(1, 0, 0, 0),
	AutomaticSize = Enum.AutomaticSize.Y,
	LayoutOrder = nextOrder(),
	Parent = movesPage,
}, { new("UIListLayout", { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }) })

addSection(movesPage, "Black Flash")
local bfKeyButton
bfKeyButton = addButton(movesPage, "", function()
	local keys = { "1", "2", "3", "4" }
	Settings.BFKey = keys[(table.find(keys, Settings.BFKey) or 0) % #keys + 1]
	bfKeyButton.Text = "Black Flash Key: " .. Settings.BFKey .. "  (tap to change)"
end)
local renderBFDelay = addStepper(movesPage, "Flash Timing (s)", "BFDelay", 0.02, 0.1, 1)
addButton(movesPage, "Do Black Flash", function()
	task.spawn(blackFlash)
end)
addToggle(movesPage, "Auto Black Flash (when you use the move)", "AutoBlackFlash", function(on)
	if on and not learnedFlashAnim[CHARACTERS[Settings.Character].name] then
		notify("Tap Do Black Flash once first so it can learn your move's animation.")
	end
end)
addToggle(movesPage, "Detect White Flash (beta)", "FlashDetect")

addSection(movesPage, "Dash Behind")
addButton(movesPage, "Dash Behind Now", function()
	task.spawn(function()
		if not dashBehind() then
			notify("No enemy within Dash Range.")
		end
	end)
end)
addToggle(movesPage, "Dash Behind Before Combos & Black Flash", "DashBehind")
local dashStyleButton
local function renderDashStyle()
	dashStyleButton.Text = "Dash Style: " .. DASH_STYLES[Settings.DashStyle] .. "  (tap to change)"
end
dashStyleButton = addButton(movesPage, "", function()
	Settings.DashStyle = Settings.DashStyle % #DASH_STYLES + 1
	renderDashStyle()
end)
renderDashStyle()
addStepper(movesPage, "Dash Wait (s)", "DashTime", 0.05, 0.1, 1)
addStepper(movesPage, "Dash Range", "DashRange", 5, 5, 80)
addStepper(movesPage, "Distance Behind", "BehindDistance", 1, 2, 8)

addSection(movesPage, "Star Rage (Yuki)")
addToggle(movesPage, "Auto Black Hole on death", "AutoBlackHole", function(on)
	if on and CHARACTERS[Settings.Character].name ~= "Star Rage" then
		notify("Only runs while Character is set to Star Rage.")
	end
end)
addStepper(movesPage, "Hold R for (s)", "BlackHoleHold", 0.5, 0.5, 5)
addButton(movesPage, "Black Hole Now", function()
	task.spawn(blackHole)
end)

addSection(movesPage, "Custom combo")
addTextBox(movesPage, "e.g. M1 M1 M1 M1 3 W0.4 3", "CustomCombo")
addStepper(movesPage, "M1 Gap (s)", "M1Gap", 0.05, 0.1, 1)
addStepper(movesPage, "Skill Gap (s)", "SkillGap", 0.1, 0.2, 2)
addToggle(movesPage, "Combo Pad (on-screen button)", "ComboPad", function(on)
	comboPad.Visible = on
end)

addSection(movesPage, "Assist")
addToggle(movesPage, "Face Nearest Enemy", "FaceTarget", function(on)
	if not on then
		restoreAutoRotate()
	end
end)
addToggle(movesPage, "Auto M1 (enemy in range)", "AutoM1")
addToggle(movesPage, "Auto Block (experimental)", "AutoBlock", function(on)
	if not on then
		releaseBlock()
	end
end)
addStepper(movesPage, "Target Range", "TargetRange", 5, 5, 60)

local function refreshMovesTab()
	local info = CHARACTERS[Settings.Character]
	characterButton.Text = "Character: " .. info.name .. "  (tap to change)"
	bfKeyButton.Text = "Black Flash Key: " .. Settings.BFKey .. "  (tap to change)"
	renderBFDelay()

	local legend = {}
	for i, move in ipairs(info.moves) do
		table.insert(legend, i .. " " .. move)
	end
	moveLegend.Text = #legend > 0 and table.concat(legend, "    ")
		or "Keys: 1-4 moves, R special, Q dash, F block, G awakening"

	for _, child in ipairs(comboList:GetChildren()) do
		if child:IsA("TextButton") then
			child:Destroy()
		end
	end
	for index, combo in ipairs(currentCombos()) do
		local button = new("TextButton", {
			Text = combo[1] .. "    " .. (combo[2] or "(your custom combo)"),
			Font = Enum.Font.Gotham,
			TextSize = 13,
			TextColor3 = Theme.Text,
			TextXAlignment = Enum.TextXAlignment.Left,
			TextTruncate = Enum.TextTruncate.AtEnd,
			BackgroundColor3 = Theme.Item,
			Size = UDim2.new(1, 0, 0, 36),
			LayoutOrder = index,
			Parent = comboList,
		}, { round(0, 8), new("UIPadding", { PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 10) }) })
		button.Activated:Connect(function()
			Settings.ComboIndex = index
			refreshComboPad()
			main.Visible = false -- keep the menu out of the way of the M1 clicks
			runCombo(comboSequence(combo))
		end)
	end
end

setCharacter = function(index)
	Settings.Character = index
	Settings.ComboIndex = 1
	local bf = CHARACTERS[index].blackFlash
	if bf then
		Settings.BFKey, Settings.BFDelay = bf.key, bf.delay
	end
	refreshMovesTab()
	refreshComboPad()
end

-- Visual ------------------------------------------------------------------

local visualPage = createTab("Visual")
addSection(visualPage, "Players")
addToggle(visualPage, "Player ESP", "ESP", function(on)
	if not on then
		clearEsp()
	end
end)
addSection(visualPage, "World")
addToggle(visualPage, "Fullbright", "Fullbright", setFullbright)

-- Teleport ----------------------------------------------------------------

local tpPage = createTab("Teleport")
local savedCFrame

addSection(tpPage, "Position")
addButton(tpPage, "Save Current Position", function()
	local root = getRoot()
	if root then
		savedCFrame = root.CFrame
		notify("Position saved.")
	end
end)
addButton(tpPage, "Return to Saved Position", function()
	local root = getRoot()
	if not savedCFrame then
		notify("No position saved yet.")
	elseif root then
		root.CFrame = savedCFrame
	end
end)

addSection(tpPage, "Players (tap to teleport)")
local playerList = new("Frame", {
	BackgroundTransparency = 1,
	Size = UDim2.new(1, 0, 0, 0),
	AutomaticSize = Enum.AutomaticSize.Y,
	LayoutOrder = nextOrder(),
	Parent = tpPage,
}, { new("UIListLayout", { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.Name }) })

local function teleportTo(plr)
	local root = getRoot()
	local target = plr.Character and plr.Character:FindFirstChild("HumanoidRootPart")
	if not root or not target then
		notify(plr.DisplayName .. " has no character right now.")
		return
	end
	root.CFrame = target.CFrame * CFrame.new(0, 0, 3)
end

local function refreshPlayerList(leaving)
	for _, child in ipairs(playerList:GetChildren()) do
		if child:IsA("TextButton") then
			child:Destroy()
		end
	end
	for _, plr in ipairs(Players:GetPlayers()) do
		if plr ~= LP and plr ~= leaving then
			local button = new("TextButton", {
				Name = string.lower(plr.DisplayName),
				Text = plr.DisplayName .. "  (@" .. plr.Name .. ")",
				Font = Enum.Font.Gotham,
				TextSize = 14,
				TextColor3 = Theme.Text,
				TextTruncate = Enum.TextTruncate.AtEnd,
				BackgroundColor3 = Theme.Item,
				Size = UDim2.new(1, 0, 0, 36),
				Parent = playerList,
			}, { round(0, 8) })
			button.Activated:Connect(function()
				teleportTo(plr)
			end)
		end
	end
end

-- Misc --------------------------------------------------------------------

local miscPage = createTab("Misc")
addSection(miscPage, "Utility")
addToggle(miscPage, "Anti-AFK", "AntiAFK")
addButton(miscPage, "Rejoin Server", function()
	notify("Rejoining...")
	if #Players:GetPlayers() <= 1 then
		TeleportService:Teleport(game.PlaceId, LP)
	else
		TeleportService:TeleportToPlaceInstance(game.PlaceId, game.JobId, LP)
	end
end)
addButton(miscPage, "Unload Script", unload)

---------------------------------------------------------------------------
-- Wiring
---------------------------------------------------------------------------

local openDrag = makeDraggable(openButton, openButton)
openButton.Activated:Connect(function()
	if not openDrag.moved then
		main.Visible = not main.Visible
	end
end)
makeDraggable(topBar, main)
hideButton.Activated:Connect(function()
	main.Visible = false
end)
closeButton.Activated:Connect(unload)

track(RunService.Heartbeat:Connect(function()
	local hum = getHum()
	if hum then
		if Settings.Speed and hum.WalkSpeed ~= Settings.WalkSpeed then
			hum.WalkSpeed = Settings.WalkSpeed
		end
		if Settings.Jump then
			if not hum.UseJumpPower then
				hum.UseJumpPower = true
			end
			if hum.JumpPower ~= Settings.JumpPower then
				hum.JumpPower = Settings.JumpPower
			end
		end
	end
	if Settings.Fly then
		updateFly()
	end

	-- Face the nearest enemy (always during combos and Black Flashes so the hits land).
	local root = getRoot()
	local wantsFacing = (Settings.FaceTarget or comboRunning or bfBusy) and not dashing
	local target = wantsFacing and not Settings.Fly and nearestEnemy(Settings.TargetRange)
	if target and hum and root then
		hum.AutoRotate = false
		autoRotateOff = true
		local position = root.Position
		local aim = Vector3.new(target.Position.X, position.Y, target.Position.Z)
		if (aim - position).Magnitude > 0.5 then
			root.CFrame = CFrame.lookAt(position, aim)
		end
	else
		restoreAutoRotate()
	end
end))

track(RunService.Stepped:Connect(function()
	if not Settings.Noclip then
		return
	end
	local char = LP.Character
	if not char then
		return
	end
	for _, part in ipairs(char:GetDescendants()) do
		if part:IsA("BasePart") and part.CanCollide then
			part.CanCollide = false
			noclipped[part] = true
		end
	end
end))

track(UserInputService.JumpRequest:Connect(function()
	if not Settings.InfJump then
		return
	end
	local hum = getHum()
	if hum then
		hum:ChangeState(Enum.HumanoidStateType.Jumping)
	end
end))

-- Keyboard fly controls for anyone running this on PC (Q dash, F block and G awakening are the game's).
track(UserInputService.InputBegan:Connect(function(input, processed)
	if processed or not Settings.Fly then
		return
	end
	if input.KeyCode == Enum.KeyCode.Space then
		flyVertical = 1
	elseif input.KeyCode == Enum.KeyCode.LeftControl then
		flyVertical = -1
	end
end))
track(UserInputService.InputEnded:Connect(function(input)
	if input.KeyCode == Enum.KeyCode.Space or input.KeyCode == Enum.KeyCode.LeftControl then
		flyVertical = 0
	end
end))

track(LP.CharacterAdded:Connect(function(char)
	table.clear(noclipped)
	local hum = char:WaitForChild("Humanoid", 10)
	if hum then
		captureDefaults(hum)
	end
	task.spawn(hookCharacter, char)
	-- give the hotbar time to load the new moveset
	task.delay(3, function()
		if running then
			autoDetect(true)
		end
	end)
end))

track(LP.Idled:Connect(function()
	if not Settings.AntiAFK then
		return
	end
	pcall(function()
		VirtualUser:CaptureController()
		VirtualUser:ClickButton2(Vector2.new())
	end)
end))

track(Players.PlayerAdded:Connect(function()
	refreshPlayerList()
end))
track(Players.PlayerRemoving:Connect(function(plr)
	removeEsp(plr)
	refreshPlayerList(plr)
end))

task.spawn(function()
	while running do
		if Settings.ESP then
			pcall(updateEsp)
		end
		if Settings.Fullbright then
			applyFullbright()
		end
		task.wait(0.25)
	end
end)

task.spawn(function()
	while running do
		if Settings.AutoM1 and not comboRunning and not blocking and nearestEnemy(Settings.TargetRange) then
			clickM1()
			task.wait(Settings.M1Gap)
		else
			task.wait(0.1)
		end
	end
end)

-- Hold block while a nearby enemy plays an attack animation, and keep it
-- up briefly afterwards so multi-hit moves don't slip through.
task.spawn(function()
	local lastThreat = 0
	while running do
		if Settings.AutoBlock and not comboRunning then
			if threatNearby(Settings.TargetRange) then
				lastThreat = os.clock()
				if not blocking then
					keyDown(KEYS.F)
					blocking = true
				end
			elseif blocking and os.clock() - lastThreat > 0.3 then
				releaseBlock()
			end
		else
			releaseBlock()
		end
		task.wait(0.05)
	end
end)

local hum = getHum()
if hum then
	captureDefaults(hum)
end
refreshPlayerList()
refreshMovesTab()
refreshComboPad()
selectTab("Player")
if LP.Character then
	task.spawn(hookCharacter, LP.Character)
end
task.delay(1, function()
	if running then
		autoDetect(true)
	end
end)

if game.GameId ~= GAME_ID then
	notify("This isn't Jujutsu Shenanigans, but the universal features still work.")
end
notify("Loaded! Tap the JJS button to show / hide the menu.")
