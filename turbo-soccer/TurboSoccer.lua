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

local DRIVE_MODES = { "Physics (works on mobile)", "Seat input", "Keys (PC)" }

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

local drivenSeat -- VehicleSeat the Seat input mode is steering
local pendingDrive -- last Physics command, re-applied just before the next physics step

local function releaseInputs()
	for code in pairs(heldKeys) do
		setKey(code, false)
	end
	for button in pairs(heldMouse) do
		setMouse(button, false)
	end
	if drivenSeat then
		local seat = drivenSeat
		drivenSeat = nil
		pcall(function()
			seat.ThrottleFloat, seat.SteerFloat, seat.Throttle, seat.Steer = 0, 0, 0, 0
		end)
	end
	pendingDrive = nil
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

local car = {
	root = nil,
	driver = nil,
	method = nil,
	reach = 6,
	spawn = nil,
	kickoff = nil,
	picked = nil, -- a car you picked by tapping it
	learnedName = nil, -- its model name, to find it again after it respawns
	forwardLocal = Vector3.new(0, 0, -1),
	driveAverage = Vector3.zero,
}
local lastCarScan = -math.huge

-- The ball. Every part gets a score from its name (or its parent's), a sphere
-- shape, being the same size every way, being unanchored and having moved since
-- the last scan. Cars, players and the hub's own marker are skipped.
local BALL_WORDS = { "ball", "puck", "sphere", "orb" }
local SKIP_WORDS = { "wheel", "tire", "tyre", "turbohub" }

local function hasWord(name, words)
	local lower = string.lower(name)
	for _, word in ipairs(words) do
		if string.find(lower, word, 1, true) then
			return true
		end
	end
	return false
end

-- The model a part belongs to. Workspace is itself a Model, so loose parts get nil.
local function modelOf(inst)
	local model = inst:FindFirstAncestorOfClass("Model")
	return model ~= workspace and model or nil
end

local learnedBall -- { name, size } of a ball you picked, so it's found again after it respawns
local prevBallPos = setmetatable({}, { __mode = "k" })

-- Returns a score and whether there's real evidence it's a ball (not just a big loose part).
local function ballScore(part, skipModel, vehicleCache)
	local size = part.Size
	local biggest = math.max(size.X, size.Y, size.Z)
	if biggest < 2 or biggest > 60 or hasWord(part.Name, SKIP_WORDS) then
		return nil
	end
	local model = modelOf(part)
	if model then
		if model == skipModel or Players:GetPlayerFromCharacter(model) then
			return nil
		end
		local isCar = vehicleCache[model]
		if isCar == nil then
			isCar = model:FindFirstChildWhichIsA("VehicleSeat", true) ~= nil
			vehicleCache[model] = isCar
		end
		if isCar then
			return nil
		end
	end

	local score, evidence = 0, false
	if hasWord(part.Name, BALL_WORDS) then
		score += 50
		evidence = true
	elseif part.Parent and part.Parent ~= workspace and hasWord(part.Parent.Name, BALL_WORDS) then
		score += 35
		evidence = true
	end
	if learnedBall and part.Name == learnedBall.name and (size - learnedBall.size).Magnitude < 1 then
		score += 100
		evidence = true
	end
	if part:IsA("Part") and part.Shape == Enum.PartType.Ball then
		score += 40
		evidence = true
	end
	if math.min(size.X, size.Y, size.Z) / biggest > 0.9 then
		score += 15
		evidence = true
	end
	if not part.Anchored then
		score += 10
	end
	local previous = prevBallPos[part]
	if previous and (part.Position - previous).Magnitude > 1 then
		score += 30
	end
	prevBallPos[part] = part.Position
	return score + math.min(biggest, 20), evidence
end

-- All plausible balls, best first.
local function scanBalls()
	local found = {}
	local skipModel = car.root and modelOf(car.root)
	local vehicleCache = {}
	for _, obj in ipairs(workspace:GetDescendants()) do
		if obj:IsA("BasePart") then
			local score, evidence = ballScore(obj, skipModel, vehicleCache)
			if score then
				table.insert(found, { part = obj, score = score, accepted = evidence and score >= 45 })
			end
		end
	end
	table.sort(found, function(a, b)
		return a.score > b.score
	end)
	return found
end

local ballCache, ballSource, lastBallScan = nil, "auto", -math.huge
local floorY -- lowest the ball has sat, i.e. the pitch height

local function setBall(part, source)
	ballCache, ballSource = part, source
	floorY = nil
	if source == "picked" then
		learnedBall = { name = part.Name, size = part.Size }
	end
end

-- Rescans every second while there's no ball, and every 3 s otherwise so a
-- better (moving) candidate can take over. A ball you picked is kept.
local function findBall()
	local valid = ballCache ~= nil and ballCache:IsDescendantOf(workspace)
	if valid and ballSource == "picked" then
		return ballCache
	end
	if os.clock() - lastBallScan < (valid and 3 or 1) then
		return valid and ballCache or nil
	end
	lastBallScan = os.clock()
	local best = scanBalls()[1]
	if best and best.accepted then
		if best.part ~= ballCache then
			setBall(best.part, "auto")
		end
	elseif not valid then
		ballCache = nil
	end
	return ballCache
end

-- Anchored / CFrame-driven balls report zero velocity, so measure it from movement.
local ballSample = { part = nil, pos = nil, time = 0, vel = Vector3.zero }

local function sampleBall(ball)
	local now = os.clock()
	if ballSample.part == ball and now > ballSample.time then
		local measured = (ball.Position - ballSample.pos) / (now - ballSample.time)
		ballSample.vel = ballSample.vel:Lerp(measured, 0.5)
	elseif ballSample.part ~= ball then
		ballSample.vel = Vector3.zero
	end
	ballSample.part, ballSample.pos, ballSample.time = ball, ball.Position, now
end

local function ballVelocity(ball)
	local reported = ball.AssemblyLinearVelocity
	if reported.Magnitude > 0.5 then
		return reported
	end
	return ballSample.part == ball and ballSample.vel or reported
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

local CAR_WORDS = { "car", "vehicle", "kart", "buggy", "truck" }
local WHEEL_WORDS = { "wheel", "tire", "tyre" }

local function mentionsMe(value)
	if value == LP or value == LP.UserId or value == LP.Name then
		return true
	end
	return type(value) == "string"
		and (value == tostring(LP.UserId) or string.lower(value) == string.lower(LP.Name))
end

-- A model that belongs to you: an attribute or value pointing at you, or your name / id in its name.
local function ownedBy(model)
	for _, value in pairs(model:GetAttributes()) do
		if mentionsMe(value) then
			return true
		end
	end
	for _, child in ipairs(model:GetChildren()) do
		if child:IsA("ObjectValue") or child:IsA("StringValue") or child:IsA("IntValue") or child:IsA("NumberValue") then
			if mentionsMe(child.Value) then
				return true
			end
		end
	end
	local lower = string.lower(model.Name)
	return string.find(lower, string.lower(LP.Name), 1, true) ~= nil
		or string.find(lower, tostring(LP.UserId), 1, true) ~= nil
end

local function looksLikeCar(model)
	if model:FindFirstChildWhichIsA("VehicleSeat", true) then
		return true
	end
	local wheels = 0
	for _, part in ipairs(model:GetDescendants()) do
		if part:IsA("BasePart") and hasWord(part.Name, WHEEL_WORDS) then
			wheels += 1
		end
	end
	if wheels >= 2 then
		return true
	end
	-- no head but car-sized: a custom character that is the car
	return not model:FindFirstChild("Head") and model:GetExtentsSize().Magnitude > 6
end

local function rootOf(model)
	local part = model.PrimaryPart
		or model:FindFirstChild("HumanoidRootPart")
		or model:FindFirstChildWhichIsA("BasePart", true)
	return part and (part.AssemblyRootPart or part)
end

-- The car-sized model a part belongs to: climbs out of small sub-models like "Wheels".
local function carModelOf(part)
	local model = modelOf(part)
	while model and model.Parent and model.Parent ~= workspace and model.Parent:IsA("Model") and model:GetExtentsSize().Magnitude < 8 do
		model = model.Parent
	end
	return model
end

local function cameraFocus()
	return workspace.CurrentCamera.Focus.Position
end

-- After a picked car respawns: the model with the same name closest to the camera.
local function nearestNamedModel(name)
	local focus = cameraFocus()
	local best, bestDistance
	for _, model in ipairs(workspace:GetDescendants()) do
		if model:IsA("Model") and model.Name == name then
			local distance = (model:GetPivot().Position - focus).Magnitude
			if not bestDistance or distance < bestDistance then
				best, bestDistance = model, distance
			end
		end
	end
	return best
end

-- Every car-like model in the map, nearest to the camera first.
local function scanCars()
	local wheels, flagged = {}, {}
	for _, obj in ipairs(workspace:GetDescendants()) do
		if obj:IsA("VehicleSeat") or (obj:IsA("BasePart") and hasWord(obj.Name, WHEEL_WORDS)) then
			local model = carModelOf(obj)
			if model then
				wheels[model] = (wheels[model] or 0) + (obj:IsA("VehicleSeat") and 2 or 1)
			end
		elseif obj:IsA("Model") and hasWord(obj.Name, CAR_WORDS) then
			flagged[obj] = true
		end
	end
	for model, count in pairs(wheels) do
		if count >= 2 then
			flagged[model] = true
		end
	end
	local focus = cameraFocus()
	local found = {}
	for model in pairs(flagged) do
		if model:IsDescendantOf(workspace) then
			table.insert(found, { model = model, distance = (model:GetPivot().Position - focus).Magnitude })
		end
	end
	table.sort(found, function(a, b)
		return a.distance < b.distance
	end)
	return found
end

-- Returns the car's physics root, the part that reliably faces forward (a seat
-- or your character, if any) and how it was found. Tries, in order: a car you
-- picked, a seat, whatever the camera follows, being welded into a car, your
-- character being the car, then a model tagged with your name or id.
local function scanCar()
	local char = LP.Character
	if car.picked and car.picked:IsDescendantOf(workspace) then
		return car.picked.AssemblyRootPart or car.picked, nil, "picked"
	end
	if car.learnedName then
		local model = nearestNamedModel(car.learnedName)
		local root = model and rootOf(model)
		if root then
			car.picked = root
			return root, nil, "picked"
		end
	end

	local hum = getHum()
	local seat = hum and hum.SeatPart
	if seat then
		return seat.AssemblyRootPart or seat, seat, "seat"
	end

	local subject = workspace.CurrentCamera.CameraSubject
	if subject and subject ~= ballCache and not hasWord(subject.Name, BALL_WORDS) then
		if subject:IsA("BasePart") and not (char and subject:IsDescendantOf(char)) then
			local seatPart = (subject:IsA("VehicleSeat") or subject:IsA("Seat")) and subject or nil
			return subject.AssemblyRootPart or subject, seatPart, "camera"
		elseif subject:IsA("Humanoid") and subject.Parent and subject.Parent ~= char then
			local root = rootOf(subject.Parent)
			if root then
				return root, nil, "camera"
			end
		end
	end

	local hrp = getRoot()
	if hrp then
		for _, part in ipairs(hrp:GetConnectedParts(true)) do
			if not part:IsDescendantOf(char) then
				return hrp.AssemblyRootPart or hrp, hrp, "welded"
			end
		end
	end

	if char and looksLikeCar(char) then
		local root = rootOf(char)
		if root then
			return root, nil, "your character"
		end
	end

	for _, model in ipairs(workspace:GetDescendants()) do
		if model:IsA("Model") and model ~= char and ownedBy(model) then
			local root = rootOf(model)
			if root then
				return root, nil, "name tag"
			end
		end
	end
	return nil
end

local function getCar()
	-- rescan every 2 s while we have a car, every 1 s while looking, and at once if it's gone
	local valid = car.root ~= nil and car.root:IsDescendantOf(workspace)
	if (valid or not car.root) and os.clock() - lastCarScan < (valid and 2 or 1) then
		return car.root, car.driver
	end
	lastCarScan = os.clock()
	local root, driver, method = scanCar()
	if root ~= car.root then
		car.root = root
		if root then
			car.spawn = root.Position
			local ball = findBall()
			car.kickoff = ball and ball.Position
			local model = modelOf(root)
			car.reach = math.clamp(model and model:GetExtentsSize().Magnitude / 2 or 6, 5, 14)
			-- until driving teaches us better, guess the nose is along the root's longer side
			car.forwardLocal = root.Size.X > root.Size.Z * 1.2 and Vector3.new(1, 0, 0) or Vector3.new(0, 0, -1)
			car.driveAverage = Vector3.zero
		end
	end
	car.driver, car.method = driver, method
	return car.root, car.driver
end

-- Which way the car's nose points. A seat or your character faces forward;
-- otherwise it's learned from which way the car moves while it drives normally.
local function carForward(carRoot, driver)
	local forward = driver and flat(driver.CFrame.LookVector)
		or flat(carRoot.CFrame:VectorToWorldSpace(car.forwardLocal))
	return forward.Magnitude > 0.01 and forward.Unit or Vector3.new(0, 0, -1)
end

local function learnForward(carRoot)
	local velocity = flat(carRoot.AssemblyLinearVelocity)
	if car.driver or velocity.Magnitude < 15 then
		return
	end
	local localDir = carRoot.CFrame:VectorToObjectSpace(velocity.Unit)
	car.driveAverage = car.driveAverage:Lerp(Vector3.new(localDir.X, 0, localDir.Z), 0.03)
	local avg = car.driveAverage
	if avg.Magnitude > 0.5 then
		-- snap to the dominant local axis, since cars drive forward far more than backward
		if math.abs(avg.X) > math.abs(avg.Z) then
			car.forwardLocal = Vector3.new(math.sign(avg.X), 0, 0)
		else
			car.forwardLocal = Vector3.new(0, 0, math.sign(avg.Z))
		end
	end
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
	elseif car.spawn and (car.kickoff or ballCache) then
		-- no goals in the map: the field runs from where the car spawned through the ball
		car.kickoff = car.kickoff or ballCache.Position
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
	local p, v = ball.Position, ballVelocity(ball)
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

local function applyDrive(command)
	local root = command.root
	if not root.Parent then
		return
	end
	root.AssemblyAngularVelocity = command.angular
	if command.full then
		root.AssemblyLinearVelocity = command.linear
	else
		root.AssemblyLinearVelocity = Vector3.new(command.linear.X, root.AssemblyLinearVelocity.Y, command.linear.Z)
	end
end

-- Physics mode drives the car's velocity directly, so it needs no key presses.
-- The command is applied now and again just before the next physics step, so a
-- game script that also sets the car's velocity doesn't simply cancel it.
local function physicsDrive(carRoot, forward, target, aerialTarget)
	local angle, dot = steer(carRoot, forward, target)
	local velocity = carRoot.AssemblyLinearVelocity
	local topSpeed = Settings.Boost and Settings.BotSpeed or Settings.BotSpeed * 0.7
	local linear, full
	if aerialTarget then
		linear = velocity:Lerp((aerialTarget - carRoot.Position).Unit * topSpeed, 0.3)
		full = true
	else
		local goal = forward * topSpeed * math.max(dot, 0.3) -- ease off through tight turns
		linear = Vector3.new(lerp(velocity.X, goal.X, 0.35), 0, lerp(velocity.Z, goal.Z, 0.35))
	end
	pendingDrive = {
		root = carRoot,
		linear = linear,
		full = full,
		angular = Vector3.new(0, math.clamp(angle * 5, -Settings.TurnRate, Settings.TurnRate), 0),
		expires = os.clock() + 0.1,
	}
	applyDrive(pendingDrive)
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

local function seatOf(carRoot)
	if car.driver and car.driver:IsA("VehicleSeat") then
		return car.driver
	end
	local model = modelOf(carRoot)
	return model and model:FindFirstChildWhichIsA("VehicleSeat", true)
end

-- Seat input mode sets the VehicleSeat's own throttle and steering, the values
-- the game's car script reads from your controls. No key presses needed.
local function seatDrive(seat, carRoot, forward, target, aerial)
	local angle = steer(carRoot, forward, target)
	drivenSeat = seat
	pcall(function()
		seat.ThrottleFloat = 1
		seat.Throttle = 1
		seat.SteerFloat = math.clamp(-angle * 2, -1, 1) -- +1 steers right, angle + is left
		seat.Steer = angle > 0.12 and -1 or (angle < -0.12 and 1 or 0)
	end)
	setMouse(0, Settings.Boost and math.abs(angle) < 0.3 and flat(target - carRoot.Position).Magnitude > 25)
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
	local ballPos, ballVel = ball.Position, ballVelocity(ball)
	local t = interceptTime(carPos, ballPos, ballVel, Settings.BotSpeed, r)
	local predicted = predictBall(ballPos, ballVel, t, r)

	-- Without goals it still plays: it just drives through the ball the way it's facing it.
	local defending = own ~= nil and Settings.AutoSave and isThreat(ballPos, ballVel, own, opp)
	local hitDir
	if own then
		hitDir = flat(defending and (predicted - own) or (opp - predicted))
		if hitDir.Magnitude < 0.1 then
			hitDir = flat(opp - own)
		end
	else
		hitDir = flat(predicted - carPos)
	end
	hitDir = hitDir.Magnitude > 0.1 and hitDir.Unit or Vector3.new(0, 0, -1)

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

	if not own then
		status ..= " (no goals found: just chasing)"
	end

	local forward = carForward(carRoot, driver)
	local seat = Settings.DriveMode == 2 and seatOf(carRoot)
	if Settings.DriveMode == 1 then
		physicsDrive(carRoot, forward, target, aerial and predicted - hitDir * (r * 0.8) or nil)
	elseif seat then
		seatDrive(seat, carRoot, forward, target, aerial)
	elseif Settings.DriveMode == 2 then
		status = "Seat input picked, but your car has no seat. Tap Test Drive Methods"
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

-- Drive test: tries each drive mode for a moment and keeps the first one that
-- actually moves the car, since games differ in what they let a script control.
local testing = false
local driveTested = false -- runs once by itself the first time Auto Play has a car
local driveTestResult -- text summary for the diagnostics

local function measureMove(seconds, apply, stop)
	local root = car.root
	local start = root.Position
	local deadline = os.clock() + seconds
	while running and os.clock() < deadline and root.Parent do
		apply(root)
		RunService.Heartbeat:Wait()
	end
	if stop then
		stop()
	end
	return math.floor(flat(root.Position - start).Magnitude)
end

local function testDriveModes()
	if testing then
		return
	end
	local root, driver = getCar()
	if not root then
		notify("Get in your car first, then test again.")
		return
	end
	testing, driveTested = true, true
	releaseInputs()
	status = "Testing drive methods..."
	notify("Testing how to drive your car (about 3 seconds)...")
	local forward = carForward(root, driver)

	local results = {}
	results[1] = measureMove(0.6, function(part)
		local v = part.AssemblyLinearVelocity
		part.AssemblyLinearVelocity = Vector3.new(forward.X * 60, v.Y, forward.Z * 60)
	end)
	task.wait(0.4)
	local seat = seatOf(root)
	if seat then
		results[2] = measureMove(0.8, function()
			pcall(function()
				seat.ThrottleFloat, seat.Throttle = 1, 1
			end)
		end, function()
			pcall(function()
				seat.ThrottleFloat, seat.Throttle = 0, 0
			end)
		end)
		task.wait(0.4)
	end
	results[3] = measureMove(0.8, function()
		setKey(Enum.KeyCode.W, true)
	end, function()
		setKey(Enum.KeyCode.W, false)
	end)
	testing = false

	driveTestResult = string.format(
		"Physics %d, Seat %s, Keys %d studs",
		results[1],
		results[2] and tostring(results[2]) or "no seat",
		results[3]
	)
	for mode = 1, 3 do
		if results[mode] and results[mode] > 6 then
			Settings.DriveMode = mode
			notify("Driving with " .. DRIVE_MODES[mode] .. ". (" .. driveTestResult .. ")")
			return
		end
	end
	notify("Nothing moved your car (" .. driveTestResult .. "). Try again once you can drive, or send me the diagnostics.")
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
		ballLabel.Text = string.format("BALL  %d studs  |  speed %d", distance, math.floor(ballVelocity(ball).Magnitude))
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

-- What the bot is doing, shown under the BOT pill (and dragged with it).
local statusLabel = new("TextLabel", {
	Size = UDim2.fromOffset(280, 16),
	Position = UDim2.new(0, 2, 1, 4),
	BackgroundTransparency = 1,
	Font = Enum.Font.GothamBold,
	TextSize = 12,
	TextColor3 = Color3.new(1, 1, 1),
	TextStrokeTransparency = 0.2,
	TextXAlignment = Enum.TextXAlignment.Left,
	Visible = false,
	Parent = botButton,
})

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
addButton(botPage, "Test Drive Methods (picks the one that works)", function()
	task.spawn(function()
		testDriveModes()
		refreshControls()
	end)
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
	ballCache, ballSource, lastBallScan, learnedBall = nil, "auto", -math.huge, nil
	car.root, car.picked, car.learnedName, lastCarScan = nil, nil, nil, -math.huge
	goals.scannedAt = -math.huge
	floorY = nil
	notify("Rescanning...")
end)
local diagnostics = addNote(botPage)

local picking -- "ball" or "car" while waiting for you to tap one on screen

addSection(botPage, "Ball not found?")
addButton(botPage, "Pick Ball (then tap it on screen)", function()
	picking = "ball"
	main.Visible = false
	notify("Tap the ball on your screen.")
end)

local candidateList = new("Frame", {
	BackgroundTransparency = 1,
	Size = UDim2.new(1, 0, 0, 0),
	AutomaticSize = Enum.AutomaticSize.Y,
	LayoutOrder = 0, -- placed below its button once that exists
	Parent = botPage,
}, { new("UIListLayout", { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }) })

local function showCandidates()
	for _, child in ipairs(candidateList:GetChildren()) do
		if child:IsA("TextButton") then
			child:Destroy()
		end
	end
	local candidates = scanBalls()
	if #candidates == 0 then
		notify("Nothing ball-like found. Are you in a match?")
	end
	for i = 1, math.min(#candidates, 6) do
		local part = candidates[i].part
		local size = math.floor(math.max(part.Size.X, part.Size.Y, part.Size.Z) * 10) / 10
		local button = new("TextButton", {
			Text = string.format("Use: %s  (size %s, score %d)", part.Name, size, math.floor(candidates[i].score)),
			Font = Enum.Font.Gotham,
			TextSize = 13,
			TextColor3 = part == ballCache and Theme.Accent or Theme.Text,
			TextXAlignment = Enum.TextXAlignment.Left,
			TextTruncate = Enum.TextTruncate.AtEnd,
			BackgroundColor3 = Theme.Item,
			Size = UDim2.new(1, 0, 0, 34),
			LayoutOrder = i,
			Parent = candidateList,
		}, { round(0, 8), new("UIPadding", { PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 10) }) })
		button.Activated:Connect(function()
			if part:IsDescendantOf(workspace) then
				setBall(part, "picked")
				notify("Ball set to " .. part.Name .. ".")
				showCandidates()
			end
		end)
	end
end
addButton(botPage, "Show Ball Candidates", showCandidates)
candidateList.LayoutOrder = nextOrder()

local function pickCar(root, model)
	car.picked = root
	car.learnedName = model and model.Name
	car.root, lastCarScan = nil, -math.huge -- rerun getCar so spawn, reach and forward reset
	notify("Car set to " .. (model and model.Name or root.Name) .. ". It'll be found again after respawns.")
end

addSection(botPage, "Car not found?")
addButton(botPage, "Pick Car (then tap your car on screen)", function()
	picking = "car"
	main.Visible = false
	notify("Tap your car on your screen.")
end)

local carCandidateList = new("Frame", {
	BackgroundTransparency = 1,
	Size = UDim2.new(1, 0, 0, 0),
	AutomaticSize = Enum.AutomaticSize.Y,
	LayoutOrder = 0, -- placed below its button once that exists
	Parent = botPage,
}, { new("UIListLayout", { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }) })

local function showCarCandidates()
	for _, child in ipairs(carCandidateList:GetChildren()) do
		if child:IsA("TextButton") then
			child:Destroy()
		end
	end
	local candidates = scanCars()
	if #candidates == 0 then
		notify("No car-like models found. Are you in a match?")
	end
	local current = car.root and modelOf(car.root)
	for i = 1, math.min(#candidates, 6) do
		local model = candidates[i].model
		local button = new("TextButton", {
			Text = string.format("Use: %s  (%d studs from camera)", model.Name, math.floor(candidates[i].distance)),
			Font = Enum.Font.Gotham,
			TextSize = 13,
			TextColor3 = model == current and Theme.Accent or Theme.Text,
			TextXAlignment = Enum.TextXAlignment.Left,
			TextTruncate = Enum.TextTruncate.AtEnd,
			BackgroundColor3 = Theme.Item,
			Size = UDim2.new(1, 0, 0, 34),
			LayoutOrder = i,
			Parent = carCandidateList,
		}, { round(0, 8), new("UIPadding", { PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 10) }) })
		button.Activated:Connect(function()
			local root = model:IsDescendantOf(workspace) and rootOf(model)
			if root then
				pickCar(root, model)
				showCarCandidates()
			end
		end)
	end
end
addButton(botPage, "Show Car Candidates", showCarCandidates)
carCandidateList.LayoutOrder = nextOrder()

-- Pick Ball / Pick Car: the next tap on the game world chooses what's under your finger.
track(UserInputService.InputBegan:Connect(function(input, processed)
	if not picking or processed then
		return
	end
	if input.UserInputType ~= Enum.UserInputType.Touch and input.UserInputType ~= Enum.UserInputType.MouseButton1 then
		return
	end
	local mode = picking
	picking = nil
	local ray = workspace.CurrentCamera:ScreenPointToRay(input.Position.X, input.Position.Y)
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	-- your character may be the car, so only skip it when picking the ball
	params.FilterDescendantsInstances = mode == "ball" and { LP.Character, marker } or { marker }
	local result = workspace:Raycast(ray.Origin, ray.Direction * 2000, params)
	if not result or not result.Instance:IsA("BasePart") then
		notify("Missed. Tap Pick " .. (mode == "ball" and "Ball" or "Car") .. " and try again.")
		return
	end
	local part = result.Instance
	if mode == "car" then
		local model = carModelOf(part)
		pickCar((model and rootOf(model)) or part.AssemblyRootPart or part, model)
		return
	end
	-- a visual mesh welded to the real ball shares its physics root
	if not part.Anchored and part.AssemblyRootPart then
		part = part.AssemblyRootPart
	end
	setBall(part, "picked")
	notify("Ball set to " .. part.Name .. ". It'll be found again after goals.")
end))

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
	-- learn which way the nose points, except while Physics mode is steering it for us
	if carRoot and not (Settings.AutoPlay and Settings.DriveMode == 1) then
		learnForward(carRoot)
	end
	if ball then
		sampleBall(ball)
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
	if Settings.AutoPlay and carRoot and not driveTested and not testing then
		task.spawn(testDriveModes)
	end
	if testing then
		-- testDriveModes is driving the car
	elseif Settings.AutoPlay and ball and carRoot then
		botStep(ball, carRoot, driver, own, opp)
	elseif Settings.AutoPlay then
		releaseInputs()
		status = not ball and "Can't find the ball. Open the menu: Pick Ball"
			or "Can't find your car. Open the menu: Pick Car"
	end
	if Settings.PerfectAim and ball and carRoot and opp then
		aimStep(ball, carRoot, opp)
	end
end))

-- Re-apply the Physics command right before the physics step (see physicsDrive).
track(RunService.Stepped:Connect(function()
	local command = pendingDrive
	if command and Settings.AutoPlay and os.clock() < command.expires then
		applyDrive(command)
	end
end))

-- Live diagnostics: shows what the bot found, to help when something doesn't work.
task.spawn(function()
	while running do
		local ball = ballCache
		local ballLine = "not found. Use Pick Ball or Show Ball Candidates below"
		if ball then
			ballLine = string.format(
				"%s (%s, %s)",
				ball.Name,
				ballSource == "picked" and "picked" or "auto",
				ownsBall(ball) and "you control it" or "server controls it"
			)
		end
		local lines = {
			"Ball: " .. ballLine,
			"Car: " .. (car.root and string.format(
				"%s (found via %s)",
				(modelOf(car.root) or car.root).Name,
				car.method or "?"
			) or "not found. Use Pick Car or Show Car Candidates below"),
			"Car physics: " .. (car.root and (ownsBall(car.root) and "your device" or "the server, so only Seat / Keys can drive it") or "-"),
			"Goals: " .. (goals.a and "found both ends" or (car.kickoff and "using kickoff direction" or "not found")),
			"Drive: " .. DRIVE_MODES[Settings.DriveMode] .. (driveTestResult and ("  (test: " .. driveTestResult .. ")") or ""),
			"Bot: " .. (Settings.AutoPlay and status or "off"),
		}
		diagnostics.Text = table.concat(lines, "\n")
		statusLabel.Visible = Settings.AutoPlay
		statusLabel.Text = status
		refreshControls() -- the drive test may have changed modes
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
