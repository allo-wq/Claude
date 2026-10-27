--[[
    Huss Valley Hub - mobile-friendly utility script (made for Delta)
    Game: https://www.roblox.com/games/107535308163741/Huss-Valley

    Features
      Player   : Speed, High Jump, Infinite Jump, Noclip, Fly (works with the mobile thumbstick)
      Visual   : Player ESP (team-coloured highlight + name / team / distance), Fullbright
      Teleport : Teleport to any player, save / return to a position
      Misc     : Anti-AFK, Rejoin, Unload

    Usage
      Paste into Delta and press Execute. Tap the round "HV" button to show / hide the menu.
      The menu, the HV button and the fly pad can all be dragged.
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

local LP = Players.LocalPlayer
local PLACE_ID = 107535308163741

-- Unload a previous copy so re-executing never stacks two menus.
local genv = (getgenv and getgenv()) or _G
if genv.HussHubUnload then
	pcall(genv.HussHubUnload)
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
}

local running = true
local connections = {}
local function track(conn)
	table.insert(connections, conn)
	return conn
end

local function notify(text)
	pcall(function()
		StarterGui:SetCore("SendNotification", { Title = "Huss Valley Hub", Text = text, Duration = 4 })
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
local flyVertical = 0 -- 1 = up, -1 = down, set by the fly pad (or E / Q on keyboard)

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
	Name = "HussValleyHub",
	ResetOnSpawn = false,
	IgnoreGuiInset = true,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	DisplayOrder = 999,
})
local container = mount(gui)
local espFolder = new("Folder", { Name = "HussValleyESP", Parent = container })
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

-- Runners / Catchers are told apart by team colour when the game uses Teams.
local function espColor(plr)
	if plr.Team and not plr.Neutral then
		return plr.TeamColor.Color
	end
	return Theme.Esp
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

				local color = espColor(plr)
				esp.highlight.FillColor = color
				esp.highlight.OutlineColor = color
				esp.label.TextColor3 = color

				local text = plr.DisplayName
				if plr.Team then
					text ..= " [" .. plr.Team.Name .. "]"
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

local function unload()
	if not running then
		return
	end
	running = false
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
	if genv.HussHubUnload == unload then
		genv.HussHubUnload = nil
	end
end
genv.HussHubUnload = unload

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
	Text = "HV",
	Font = Enum.Font.GothamBold,
	TextSize = 18,
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
		Text = "Huss Valley Hub",
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
	Text = "Tap HV to show / hide  -  drag the title bar to move",
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
		startFly()
	else
		stopFly()
	end
end

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

local function createTab(name)
	local button = new("TextButton", {
		Text = name,
		LayoutOrder = nextOrder(),
		Size = UDim2.new(0.25, -3, 1, 0),
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
			Settings[key] = math.clamp(Settings[key] + delta, min, max)
			render()
		end)
	end
	stepButton("-", -86, -step)
	stepButton("+", -44, step)
	render()
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

-- Keyboard fly controls for anyone running this on PC.
track(UserInputService.InputBegan:Connect(function(input, processed)
	if processed then
		return
	end
	if input.KeyCode == Enum.KeyCode.E then
		flyVertical = 1
	elseif input.KeyCode == Enum.KeyCode.Q then
		flyVertical = -1
	end
end))
track(UserInputService.InputEnded:Connect(function(input)
	if input.KeyCode == Enum.KeyCode.E or input.KeyCode == Enum.KeyCode.Q then
		flyVertical = 0
	end
end))

track(LP.CharacterAdded:Connect(function(char)
	table.clear(noclipped)
	local hum = char:WaitForChild("Humanoid", 10)
	if hum then
		captureDefaults(hum)
	end
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

local hum = getHum()
if hum then
	captureDefaults(hum)
end
refreshPlayerList()
selectTab("Player")

if game.PlaceId ~= PLACE_ID then
	notify("This isn't the Huss Valley place, but the universal features still work.")
end
notify("Loaded! Tap the HV button to show / hide the menu.")
