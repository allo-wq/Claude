--[[
    Turbo Soccer Hub - mobile-friendly auto-play script (made for Delta)
    Game: https://www.roblox.com/games/101880234193261/Turbo-Soccer

    Features
      Bot     : Auto Play with skill presets (Casual / Pro / SSL), Physics or Keys driving,
                Boost, Aerials, Auto Save, Perfect Aim, goal swap, live diagnostics
      Visual  : Ball ESP (distance + speed), landing marker, Fullbright
      Misc    : Anti-AFK, Rejoin, Unload

    Usage
      Paste into Delta and press Execute. Tap the round "TS" button for the menu,
      or the BOT pill to switch Auto Play on and off mid-match.
      Everything can be dragged. Running the script again replaces the old copy.
]]

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local Lighting = game:GetService("Lighting")
local StarterGui = game:GetService("StarterGui")
local TeleportService = game:GetService("TeleportService")
local CoreGui = game:GetService("CoreGui")
local VirtualUser = game:GetService("VirtualUser")
local _, VirtualInputManager = pcall(game.GetService, game, "VirtualInputManager")

local LP = Players.LocalPlayer
local PLACE_ID = 101880234193261

-- Unload a previous copy so re-executing never stacks two menus.
local genv = (getgenv and getgenv()) or _G
if genv.TurboHubUnload then
	pcall(genv.TurboHubUnload)
end

-- Skill presets fill in the Bot settings below; every value can still be tuned after.
local PRESETS = {
	{
		name = "Casual",
		info = "Chases the ball at normal speed. Ground play only, no boost.",
		values = {
			BotSpeed = 60,
			TurnRate = 3.5,
			ShotPower = 90,
			Boost = false,
			Aerials = false,
			AutoSave = false,
			PerfectAim = false,
		},
	},
	{
		name = "Pro",
		info = "Boosts, goes up for aerials and drops back to save.",
		values = {
			BotSpeed = 85,
			TurnRate = 5,
			ShotPower = 110,
			Boost = true,
			Aerials = true,
			AutoSave = true,
			PerfectAim = false,
		},
	},
	{
		name = "SSL",
		info = "Supersonic Legend: fastest rotations, aerials, saves and every touch aimed at the net.",
		values = {
			BotSpeed = 110,
			TurnRate = 7,
			ShotPower = 140,
			Boost = true,
			Aerials = true,
			AutoSave = true,
			PerfectAim = true,
		},
	},
}

local DRIVE_MODES = { "Physics (works on mobile)", "Keys (PC)" }

local Settings = {
	AutoPlay = false,
	Preset = 3,
	DriveMode = 1,
	BotSpeed = 110,
	TurnRate = 7,
	ShotPower = 140,
	Boost = true,
	Aerials = true,
	AutoSave = true,
	PerfectAim = true,
	SwapGoals = false,
	BallESP = true,
	LandingMarker = true,
	Fullbright = false,
	AntiAFK = true,
}

local Theme = {
	Bg = Color3.fromRGB(20, 20, 26),
	Top = Color3.fromRGB(28, 28, 36),
	Item = Color3.fromRGB(34, 34, 44),
	Off = Color3.fromRGB(70, 70, 82),
	Stroke = Color3.fromRGB(55, 55, 68),
	Accent = Color3.fromRGB(0, 160, 255),
	Danger = Color3.fromRGB(210, 60, 60),
	Text = Color3.fromRGB(235, 235, 240),
	Sub = Color3.fromRGB(150, 150, 165),
	Ball = Color3.fromRGB(255, 150, 30),
}

local running = true
local connections = {}
local function track(conn)
	table.insert(connections, conn)
	return conn
end

local function notify(text)
	pcall(function()
		StarterGui:SetCore("SendNotification", { Title = "Turbo Soccer Hub", Text = text, Duration = 4 })
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

local function flat(v)
	return Vector3.new(v.X, 0, v.Z)
end

local function lerp(a, b, t)
	return a + (b - a) * t
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

local gui = new("ScreenGui", {
	Name = "TurboSoccerHub",
	ResetOnSpawn = false,
	IgnoreGuiInset = true,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	DisplayOrder = 999,
})
local container = mount(gui)
local espFolder = new("Folder", { Name = "TurboSoccerHubESP", Parent = container })

---------------------------------------------------------------------------
-- Simulated input (Keys drive mode)
---------------------------------------------------------------------------

-- Our own windows. A simulated click must never land on them.
local clickBlockers = {}

local function coveredByHub(point)
	for _, obj in ipairs(clickBlockers) do
		if obj.Visible then
			local pos, size = obj.AbsolutePosition, obj.AbsoluteSize
			if point.X >= pos.X and point.X <= pos.X + size.X and point.Y >= pos.Y and point.Y <= pos.Y + size.Y then
				return true
			end
		end
	end
	return false
end

local CLICK_SPOTS = {
	Vector2.new(0.5, 0.45),
	Vector2.new(0.5, 0.7),
	Vector2.new(0.3, 0.45),
	Vector2.new(0.7, 0.45),
}

local function clickPoint()
	local viewport = workspace.CurrentCamera.ViewportSize
	for _, spot in ipairs(CLICK_SPOTS) do
		local point = Vector2.new(viewport.X * spot.X, viewport.Y * spot.Y)
		if not coveredByHub(point) then
			return point
		end
	end
	return nil
end

local heldKeys = {} -- [KeyCode] = true while we hold it
local heldMouse = {} -- [button] = screen point it was pressed at (0 = left / boost, 1 = right / jump)

local function setKey(code, down)
	if (heldKeys[code] == true) == down then
		return
	end
	heldKeys[code] = down or nil
	pcall(function()
		VirtualInputManager:SendKeyEvent(down, code, false, game)
	end)
end

local function setMouse(button, down)
	if (heldMouse[button] ~= nil) == down then
		return
	end
	local point = down and clickPoint() or heldMouse[button]
	if not point then
		return
	end
	heldMouse[button] = down and point or nil
	pcall(function()
		VirtualInputManager:SendMouseButtonEvent(point.X, point.Y, button, down, game, 0)
	end)
end

local function releaseInputs()
	for code in pairs(heldKeys) do
		setKey(code, false)
	end
	for button in pairs(heldMouse) do
		setMouse(button, false)
	end
end

local jumpReadyAt = 0
local function tapJump()
	if os.clock() < jumpReadyAt then
		return
	end
	jumpReadyAt = os.clock() + 1.2
	task.spawn(function()
		setMouse(1, true)
		task.wait(0.12)
		setMouse(1, false)
	end)
end

---------------------------------------------------------------------------
-- Finding the ball, your car and the goals
---------------------------------------------------------------------------

-- The ball: the biggest part with "ball" in its name that isn't on a player.
local ballCache, lastBallScan = nil, -math.huge
local function findBall()
	if ballCache and ballCache:IsDescendantOf(workspace) then
		return ballCache
	end
	if os.clock() - lastBallScan < 1 then
		return nil
	end
	lastBallScan = os.clock()
	local best, bestScore
	for _, obj in ipairs(workspace:GetDescendants()) do
		if obj:IsA("BasePart") and string.find(string.lower(obj.Name), "ball", 1, true) then
			local model = obj:FindFirstAncestorOfClass("Model")
			if not (model and Players:GetPlayerFromCharacter(model)) then
				local score = obj.Size.Magnitude + (obj.Anchored and 0 or 1000)
				if not bestScore or score > bestScore then
					best, bestScore = obj, score
				end
			end
		end
	end
	ballCache = best
	return best
end

local function ballRadius(ball)
	return math.max(ball.Size.X, ball.Size.Y, ball.Size.Z) / 2
end

local function ownsBall(ball)
	if isnetworkowner then
		local ok, result = pcall(isnetworkowner, ball)
		if ok then
			return result
		end
	end
	-- parts we simulate ourselves report a ReceiveAge of 0
	return ball.ReceiveAge == 0
end

local function ownedBy(model)
	for _, name in ipairs({ "Owner", "Player", "Driver" }) do
		local attr = model:GetAttribute(name)
		if attr == LP.Name or attr == LP.UserId then
			return true
		end
		local value = model:FindFirstChild(name)
		if value then
			if value:IsA("ObjectValue") and value.Value == LP then
				return true
			elseif value:IsA("StringValue") and value.Value == LP.Name then
				return true
			elseif (value:IsA("IntValue") or value:IsA("NumberValue")) and value.Value == LP.UserId then
				return true
			end
		end
	end
	return model.Name == LP.Name and model ~= LP.Character
end

-- Returns the car's physics root and the part that faces forward (seat or driver).
local function scanCar()
	local hum = getHum()
	local seat = hum and hum.SeatPart
	if seat then
		return seat.AssemblyRootPart or seat, seat
	end
	-- welded into a car: the character's assembly reaches parts outside the character
	local hrp = getRoot()
	if hrp then
		for _, part in ipairs(hrp:GetConnectedParts(true)) do
			if not part:IsDescendantOf(LP.Character) then
				return hrp.AssemblyRootPart or hrp, hrp
			end
		end
	end
	-- a car model tagged with our name
	for _, model in ipairs(workspace:GetDescendants()) do
		if model:IsA("Model") and model ~= LP.Character and ownedBy(model) then
			local primary = model.PrimaryPart or model:FindFirstChildWhichIsA("BasePart", true)
			if primary then
				return primary.AssemblyRootPart or primary, primary
			end
		end
	end
	return nil
end

local car = { root = nil, driver = nil, reach = 6, spawn = nil, kickoff = nil }
local lastCarScan = -math.huge

local function getCar()
	-- rescan every 2 s while we have a car, every 1 s while looking, and at once if it's gone
	local valid = car.root ~= nil and car.root:IsDescendantOf(workspace)
	if (valid or not car.root) and os.clock() - lastCarScan < (valid and 2 or 1) then
		return car.root, car.driver
	end
	lastCarScan = os.clock()
	local root, driver = scanCar()
	if root ~= car.root then
		car.root = root
		if root then
			car.spawn = root.Position
			local ball = findBall()
			car.kickoff = ball and ball.Position
			local model = root:FindFirstAncestorOfClass("Model")
			car.reach = math.clamp(model and model:GetExtentsSize().Magnitude / 2 or 6, 5, 14)
		end
	end
	car.driver = driver
	return car.root, car.driver
end

-- Goals: everything named "goal", split into the two ends of the field.
local goals = { a = nil, b = nil, scannedAt = -math.huge }

local function scanGoals()
	local points = {}
	for _, obj in ipairs(workspace:GetDescendants()) do
		if #points >= 300 then
			break
		end
		if (obj:IsA("BasePart") or obj:IsA("Model")) and string.find(string.lower(obj.Name), "goal", 1, true) then
			local ok, pos = pcall(function()
				return obj:IsA("Model") and obj:GetPivot().Position or obj.Position
			end)
			if ok then
				table.insert(points, pos)
			end
		end
	end
	if #points < 2 then
		return nil
	end
	local a, b, best = nil, nil, 0
	for i = 1, #points do
		for j = i + 1, #points do
			local distance = (points[i] - points[j]).Magnitude
			if distance > best then
				a, b, best = points[i], points[j], distance
			end
		end
	end
	local sumA, countA, sumB, countB = Vector3.zero, 0, Vector3.zero, 0
	for _, p in ipairs(points) do
		if (p - a).Magnitude < (p - b).Magnitude then
			sumA += p
			countA += 1
		else
			sumB += p
			countB += 1
		end
	end
	return sumA / countA, sumB / countB
end

-- Your goal is the end nearest where your car spawned. Without named goals,
-- the field runs from your spawn through the kickoff spot.
local function getGoals()
	if os.clock() - goals.scannedAt > 10 then
		goals.a, goals.b = scanGoals()
		goals.scannedAt = os.clock()
	end
	local own, opp
	if goals.a and car.spawn then
		if (goals.a - car.spawn).Magnitude <= (goals.b - car.spawn).Magnitude then
			own, opp = goals.a, goals.b
		else
			own, opp = goals.b, goals.a
		end
	elseif car.spawn and car.kickoff then
		local axis = flat(car.kickoff - car.spawn)
		if axis.Magnitude < 1 then
			return nil
		end
		axis = axis.Unit
		own, opp = car.kickoff - axis * 150, car.kickoff + axis * 150
	else
		return nil
	end
	if Settings.SwapGoals then
		own, opp = opp, own
	end
	return own, opp
end

---------------------------------------------------------------------------
-- Ball prediction
---------------------------------------------------------------------------

local floorY -- lowest the ball has sat, i.e. the pitch height

local function updateFloor(ball, r)
	local bottom = ball.Position.Y - r
	if not floorY or bottom < floorY then
		floorY = bottom
	end
end

-- Where the ball will be after `t` seconds (gravity only, no bounces).
local function predictBall(p, v, t, r)
	local y = p.Y + v.Y * t - 0.5 * workspace.Gravity * t * t
	return Vector3.new(p.X + v.X * t, math.max(y, floorY + r), p.Z + v.Z * t)
end

-- Earliest time the car can reach the ball, checked every 0.05 s up to 3 s.
local function interceptTime(from, p, v, speed, r)
	for t = 0, 3, 0.05 do
		if (predictBall(p, v, t, r) - from).Magnitude <= speed * t + r + 2 then
			return t
		end
	end
	return 3
end

local function landingPoint(ball, r)
	local p, v = ball.Position, ball.AssemblyLinearVelocity
	local g = workspace.Gravity
	local height = p.Y - (floorY + r)
	if height < 0.5 and math.abs(v.Y) < 2 then
		return Vector3.new(p.X, floorY, p.Z)
	end
	local t = (v.Y + math.sqrt(math.max(v.Y * v.Y + 2 * g * math.max(height, 0), 0))) / g
	return Vector3.new(p.X + v.X * t, floorY, p.Z + v.Z * t)
end

---------------------------------------------------------------------------
-- Bot
---------------------------------------------------------------------------

-- Signed angle from the car's facing to the target, + = target is to the left.
local function steer(carRoot, forward, target)
	local desired = flat(target - carRoot.Position)
	if desired.Magnitude < 0.5 then
		return 0, 1
	end
	desired = desired.Unit
	return math.atan2(forward:Cross(desired).Y, forward:Dot(desired)), forward:Dot(desired)
end

-- Physics mode drives the car's velocity directly, so it needs no key presses.
local function physicsDrive(carRoot, forward, target, aerialTarget)
	local angle, dot = steer(carRoot, forward, target)
	carRoot.AssemblyAngularVelocity = Vector3.new(0, math.clamp(angle * 5, -Settings.TurnRate, Settings.TurnRate), 0)
	local velocity = carRoot.AssemblyLinearVelocity
	local topSpeed = Settings.Boost and Settings.BotSpeed or Settings.BotSpeed * 0.7
	if aerialTarget then
		local toBall = (aerialTarget - carRoot.Position).Unit
		carRoot.AssemblyLinearVelocity = velocity:Lerp(toBall * topSpeed, 0.25)
		return
	end
	local goal = forward * topSpeed * math.max(dot, 0.3) -- ease off through tight turns
	carRoot.AssemblyLinearVelocity = Vector3.new(lerp(velocity.X, goal.X, 0.2), velocity.Y, lerp(velocity.Z, goal.Z, 0.2))
end

-- Keys mode presses W / A / D, holds left mouse to boost and taps right mouse to jump.
local function keysDrive(carRoot, forward, target, aerial)
	local angle = steer(carRoot, forward, target)
	local distance = flat(target - carRoot.Position).Magnitude
	setKey(Enum.KeyCode.W, true)
	setKey(Enum.KeyCode.A, angle > 0.12)
	setKey(Enum.KeyCode.D, angle < -0.12)
	setMouse(0, Settings.Boost and math.abs(angle) < 0.3 and distance > 25)
	if aerial then
		tapJump()
	end
end

-- Ball in our half and heading for our net, or already close to it.
local function isThreat(ballPos, ballVel, own, opp)
	local middle = (own + opp) / 2
	local inOurHalf = flat(ballPos - middle):Dot(flat(own - middle)) > 0
	local towardUs = ballVel:Dot(flat(own - ballPos).Unit) > 5
	return (inOurHalf and towardUs) or flat(ballPos - own).Magnitude < 40
end

local lastBallPos
local status = "Idle"

local function botStep(ball, carRoot, driver, own, opp)
	local r = ballRadius(ball)
	local carPos = carRoot.Position
	local ballPos, ballVel = ball.Position, ball.AssemblyLinearVelocity
	local t = interceptTime(carPos, ballPos, ballVel, Settings.BotSpeed, r)
	local predicted = predictBall(ballPos, ballVel, t, r)

	local defending = Settings.AutoSave and isThreat(ballPos, ballVel, own, opp)
	local hitDir = flat(defending and (predicted - own) or (opp - predicted))
	if hitDir.Magnitude < 0.1 then
		hitDir = flat(opp - own)
	end
	hitDir = hitDir.Unit

	-- Line up behind the ball on the hit line. From the wrong side, swing
	-- round it instead of pushing it back toward our own net.
	local approach = predicted - hitDir * (r + 4)
	local fromBall = flat(carPos - predicted)
	local target
	if fromBall:Dot(hitDir) > 0 and fromBall.Magnitude > r + 2 then
		local side = hitDir:Cross(Vector3.yAxis)
		if fromBall:Dot(side) < 0 then
			side = -side
		end
		target = approach + side * (r + 10)
		status = defending and "Saving: getting goal-side" or "Rotating around the ball"
	elseif flat(carPos - approach).Magnitude < r + 6 then
		target = predicted + hitDir * 4
		status = defending and "Saving: clearing" or "Shooting"
	else
		target = approach
		status = defending and "Saving: covering the net" or "Lining up the shot"
	end

	local aerial = Settings.Aerials
		and predicted.Y - floorY > r + 6
		and flat(predicted - carPos).Magnitude < 30
		and t < 1.6
	if aerial then
		status = "Aerial"
	end

	local forward = flat((driver or carRoot).CFrame.LookVector)
	forward = forward.Magnitude > 0.01 and forward.Unit or Vector3.new(0, 0, -1)
	if Settings.DriveMode == 1 then
		physicsDrive(carRoot, forward, target, aerial and predicted - hitDir * (r * 0.8) or nil)
	else
		keysDrive(carRoot, forward, target, aerial)
	end
end

-- Perfect Aim: when the ball is touching your car, send it at the goal.
-- Only works while your game is simulating the ball (you're its network owner).
local aimReadyAt = 0
local function aimStep(ball, carRoot, opp)
	if os.clock() < aimReadyAt then
		return
	end
	local r = ballRadius(ball)
	if (ball.Position - carRoot.Position).Magnitude > r + car.reach or not ownsBall(ball) then
		return
	end
	local aim = (opp + Vector3.new(0, r + 2, 0) - ball.Position).Unit
	ball.AssemblyLinearVelocity = aim * Settings.ShotPower + Vector3.new(0, Settings.ShotPower * 0.12, 0)
	aimReadyAt = os.clock() + 0.3
end

---------------------------------------------------------------------------
-- Ball ESP and landing marker
---------------------------------------------------------------------------

local ballHighlight = new("Highlight", {
	FillColor = Theme.Ball,
	FillTransparency = 0.5,
	OutlineColor = Color3.new(1, 1, 1),
	DepthMode = Enum.HighlightDepthMode.AlwaysOnTop,
	Enabled = false,
	Parent = espFolder,
})
local ballBillboard = new("BillboardGui", {
	Size = UDim2.fromOffset(180, 30),
	AlwaysOnTop = true,
	LightInfluence = 0,
	Enabled = false,
	Parent = espFolder,
})
local ballLabel = new("TextLabel", {
	BackgroundTransparency = 1,
	Size = UDim2.fromScale(1, 1),
	Font = Enum.Font.GothamBold,
	TextSize = 14,
	TextColor3 = Theme.Ball,
	TextStrokeTransparency = 0.3,
	Parent = ballBillboard,
})

-- A flat disc where the ball will land. Parented to the camera so only you see it.
local marker = new("Part", {
	Name = "TurboHubLanding",
	Shape = Enum.PartType.Cylinder,
	Size = Vector3.new(0.3, 8, 8),
	Anchored = true,
	CanCollide = false,
	CanQuery = false,
	CanTouch = false,
	CastShadow = false,
	Material = Enum.Material.Neon,
	Color = Theme.Ball,
	Transparency = 1,
	Parent = workspace.CurrentCamera,
})

local function updateVisuals(ball)
	local show = Settings.BallESP and ball ~= nil
	ballHighlight.Enabled = show
	ballBillboard.Enabled = show
	if show then
		local r = ballRadius(ball)
		ballHighlight.Adornee = ball
		ballBillboard.Adornee = ball
		ballBillboard.StudsOffset = Vector3.new(0, r + 2, 0)
		local root = car.root or getRoot()
		local distance = root and math.floor((root.Position - ball.Position).Magnitude) or 0
		ballLabel.Text = string.format("BALL  %d studs  |  speed %d", distance, math.floor(ball.AssemblyLinearVelocity.Magnitude))
	end
	if Settings.LandingMarker and ball and floorY then
		local spot = landingPoint(ball, ballRadius(ball))
		marker.CFrame = CFrame.new(spot + Vector3.new(0, 0.2, 0)) * CFrame.Angles(0, 0, math.rad(90))
		marker.Transparency = 0.45
	else
		marker.Transparency = 1
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
	releaseInputs()
	setFullbright(false)
	gui:Destroy()
	espFolder:Destroy()
	marker:Destroy()
	if genv.TurboHubUnload == unload then
		genv.TurboHubUnload = nil
	end
end
genv.TurboHubUnload = unload

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
	Text = "TS",
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

-- BOT pill: switches Auto Play without opening the menu.
local botButton = new("TextButton", {
	Size = UDim2.fromOffset(76, 32),
	Position = UDim2.new(0, 2, 0.3, 60),
	Font = Enum.Font.GothamBold,
	TextSize = 13,
	TextColor3 = Color3.new(1, 1, 1),
	Parent = gui,
}, { round(1, 0) })

local main = new("Frame", {
	Size = UDim2.fromOffset(PANEL_W, PANEL_H),
	Position = UDim2.new(0.5, -PANEL_W / 2, 0.5, -PANEL_H / 2),
	BackgroundColor3 = Theme.Bg,
	BorderSizePixel = 0,
	Active = true,
	Parent = gui,
}, { round(0, 10), new("UIStroke", { Color = Theme.Stroke, Thickness = 1 }) })

table.insert(clickBlockers, main)
table.insert(clickBlockers, openButton)
table.insert(clickBlockers, botButton)

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
		Text = "Turbo Soccer Hub",
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
	Text = "Tap TS to show / hide  -  drag the title bar to move",
	Font = Enum.Font.Gotham,
	TextSize = 10,
	TextColor3 = Theme.Sub,
	BackgroundTransparency = 1,
	Size = UDim2.new(1, 0, 0, 8),
	Position = UDim2.new(0, 0, 1, -10),
	Parent = main,
})

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

local TAB_COUNT = 3

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

-- Every toggle and stepper registers here so a preset can redraw them all.
local controlRenders = {}
local function refreshControls()
	for _, render in ipairs(controlRenders) do
		render()
	end
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

local function addNote(page)
	return new("TextLabel", {
		Font = Enum.Font.Gotham,
		TextSize = 12,
		TextColor3 = Theme.Sub,
		TextWrapped = true,
		TextXAlignment = Enum.TextXAlignment.Left,
		BackgroundTransparency = 1,
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		LayoutOrder = nextOrder(),
		Parent = page,
	}, { new("UIPadding", { PaddingLeft = UDim.new(0, 4), PaddingRight = UDim.new(0, 4) }) })
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
	table.insert(controlRenders, render)
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
			-- round to 2 decimals so 0.5 steps don't drift
			Settings[key] = math.round(math.clamp(Settings[key] + delta, min, max) * 100) / 100
			render()
		end)
	end
	stepButton("-", -86, -step)
	stepButton("+", -44, step)
	render()
	table.insert(controlRenders, render)
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

-- Bot ---------------------------------------------------------------------

local function renderBotButton()
	botButton.Text = Settings.AutoPlay and "BOT ON" or "BOT OFF"
	botButton.BackgroundColor3 = Settings.AutoPlay and Theme.Accent or Theme.Off
end
table.insert(controlRenders, renderBotButton)

local function setAutoPlay(on)
	Settings.AutoPlay = on
	if not on then
		releaseInputs()
		status = "Idle"
	end
	refreshControls()
end

local botPage = createTab("Bot")
addSection(botPage, "Auto Play")
addToggle(botPage, "Auto Play", "AutoPlay", setAutoPlay)

local presetButton, presetNote
local function renderPreset()
	local preset = PRESETS[Settings.Preset]
	presetButton.Text = "Preset: " .. preset.name .. "  (tap to change)"
	presetNote.Text = preset.info
end
presetButton = addButton(botPage, "", function()
	Settings.Preset = Settings.Preset % #PRESETS + 1
	for key, value in pairs(PRESETS[Settings.Preset].values) do
		Settings[key] = value
	end
	refreshControls()
	notify(PRESETS[Settings.Preset].name .. " preset loaded.")
end)
presetNote = addNote(botPage)
table.insert(controlRenders, renderPreset)

local driveButton
driveButton = addButton(botPage, "", function()
	releaseInputs()
	Settings.DriveMode = Settings.DriveMode % #DRIVE_MODES + 1
	refreshControls()
end)
table.insert(controlRenders, function()
	driveButton.Text = "Drive: " .. DRIVE_MODES[Settings.DriveMode]
end)

addSection(botPage, "Skills")
addToggle(botPage, "Boost", "Boost")
addToggle(botPage, "Aerials", "Aerials")
addToggle(botPage, "Auto Save (defend your net)", "AutoSave")
addToggle(botPage, "Perfect Aim (also when you drive)", "PerfectAim")
addStepper(botPage, "Bot Speed", "BotSpeed", 5, 30, 200)
addStepper(botPage, "Turn Rate", "TurnRate", 0.5, 2, 12)
addStepper(botPage, "Shot Power", "ShotPower", 10, 50, 250)

addSection(botPage, "Field")
addButton(botPage, "Swap Goals (if it attacks your own net)", function()
	Settings.SwapGoals = not Settings.SwapGoals
	notify(Settings.SwapGoals and "Goals swapped." or "Goals back to normal.")
end)
addButton(botPage, "Rescan Ball, Car & Goals", function()
	ballCache, lastBallScan = nil, -math.huge
	car.root, lastCarScan = nil, -math.huge
	goals.scannedAt = -math.huge
	floorY = nil
	notify("Rescanning...")
end)
local diagnostics = addNote(botPage)

-- Visual ------------------------------------------------------------------

local visualPage = createTab("Visual")
addSection(visualPage, "Ball")
addToggle(visualPage, "Ball ESP", "BallESP")
addToggle(visualPage, "Landing Marker", "LandingMarker")
addSection(visualPage, "World")
addToggle(visualPage, "Fullbright", "Fullbright", setFullbright)

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
local botDrag = makeDraggable(botButton, botButton)
botButton.Activated:Connect(function()
	if not botDrag.moved then
		setAutoPlay(not Settings.AutoPlay)
	end
end)
makeDraggable(topBar, main)
hideButton.Activated:Connect(function()
	main.Visible = false
end)
closeButton.Activated:Connect(unload)

track(RunService.Heartbeat:Connect(function()
	local ball = findBall()
	local carRoot, driver = getCar()
	if ball then
		updateFloor(ball, ballRadius(ball))
		-- the ball jumping across the map means a kickoff: re-read which end is ours
		if lastBallPos and (ball.Position - lastBallPos).Magnitude > 40 then
			Settings.SwapGoals = false
			task.delay(0.5, function()
				if car.root then
					car.spawn = car.root.Position
					car.kickoff = ball.Position
				end
			end)
		end
		lastBallPos = ball.Position
	end
	updateVisuals(ball)

	local own, opp
	if ball and carRoot then
		own, opp = getGoals()
	end
	if Settings.AutoPlay and ball and carRoot and own then
		botStep(ball, carRoot, driver, own, opp)
	elseif Settings.AutoPlay then
		releaseInputs()
		status = not ball and "Waiting for the ball" or not carRoot and "Waiting for your car" or "Finding the goals"
	end
	if Settings.PerfectAim and ball and carRoot and opp then
		aimStep(ball, carRoot, opp)
	end
end))

-- Live diagnostics: shows what the bot found, to help when something doesn't work.
task.spawn(function()
	while running do
		local ball = ballCache
		local lines = {
			"Ball: "
				.. (ball and (ball.Name .. (ownsBall(ball) and "  (you control it)" or "  (server controls it)")) or "not found"),
			"Car: " .. (car.root and car.root:GetFullName() or "not found, get in a match"),
			"Goals: " .. (goals.a and "found both ends" or (car.kickoff and "using kickoff direction" or "not found")),
			"Bot: " .. (Settings.AutoPlay and status or "off"),
		}
		diagnostics.Text = table.concat(lines, "\n")
		if Settings.Fullbright then
			applyFullbright()
		end
		task.wait(0.5)
	end
end)

track(LP.Idled:Connect(function()
	if not Settings.AntiAFK then
		return
	end
	pcall(function()
		VirtualUser:CaptureController()
		VirtualUser:ClickButton2(Vector2.new())
	end)
end))

refreshControls()
selectTab("Bot")

if game.PlaceId ~= PLACE_ID then
	notify("This isn't the Turbo Soccer place, but the hub will still try to find a ball and car.")
end
notify("Loaded! Tap TS for the menu or BOT to start Auto Play.")
