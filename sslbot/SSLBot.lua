--[[
    SSLBot - auto-play bot for Turbo Soccer (made for Delta)
    Game: https://www.roblox.com/games/101880234193261/Turbo-Soccer

    A Luau port of SSLBot, a hand-coded Rocket League bot for RLBot (Python):
    6 s ball prediction, earliest reachable intercepts measured along the real
    approach path behind the ball, roles (attack / support / back), shadowing
    and retreats, saves, kickoffs, jump shots, dodges, half-flips, aerials and
    air recovery.

    The original thinks in Rocket League units (uu). Here it plays on a "field
    frame" fitted to Turbo Soccer's pitch: x across, y toward the opponent's net
    (so it always plays as blue), z up. Studs per uu comes from the measured
    pitch length, so all of the original's tuning keeps its proportions.

    Usage
      Paste into Delta and press Execute in a match. Tap BOT to start, tap SSL
      for the menu. Running it closes Turbo Soccer Hub if that's open, so the
      two never fight over your car.
]]

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local StarterGui = game:GetService("StarterGui")
local CoreGui = game:GetService("CoreGui")
local VirtualUser = game:GetService("VirtualUser")
local _, VirtualInputManager = pcall(game.GetService, game, "VirtualInputManager")

local LP = Players.LocalPlayer
local PLACE_ID = 101880234193261

-- Unload a previous copy, and Turbo Soccer Hub, so only one thing drives the car.
local genv = (getgenv and getgenv()) or _G
if genv.SSLBotUnload then
	pcall(genv.SSLBotUnload)
end
if genv.TurboHubUnload then
	pcall(genv.TurboHubUnload)
end

local DRIVE_MODES = { "Physics (works on mobile)", "Seat input", "Keys (PC)" }

local Settings = {
	AutoPlay = false,
	DriveMode = 1,
	Aerials = true,
	AirDribble = true,
	FlipReset = true,
	DribbleAssist = true,
	SwapGoals = false,
	DebugMarkers = true,
	AntiAFK = true,
}

local Theme = {
	Bg = Color3.fromRGB(20, 20, 26),
	Top = Color3.fromRGB(28, 28, 36),
	Item = Color3.fromRGB(34, 34, 44),
	Off = Color3.fromRGB(70, 70, 82),
	Stroke = Color3.fromRGB(55, 55, 68),
	Accent = Color3.fromRGB(150, 90, 255),
	Danger = Color3.fromRGB(210, 60, 60),
	Text = Color3.fromRGB(235, 235, 240),
	Sub = Color3.fromRGB(150, 150, 165),
}

local running = true
local connections = {}
local function track(conn)
	table.insert(connections, conn)
	return conn
end

local function notify(text)
	pcall(function()
		StarterGui:SetCore("SendNotification", { Title = "SSLBot", Text = text, Duration = 4 })
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

-- World-space flatten (Roblox is Y-up).
local function flat(v)
	return Vector3.new(v.X, 0, v.Z)
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
	Name = "SSLBot",
	ResetOnSpawn = false,
	IgnoreGuiInset = true,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	DisplayOrder = 999,
})
mount(gui)

---------------------------------------------------------------------------
-- Simulated input (Seat and Keys drive modes)
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

---------------------------------------------------------------------------
-- Finding the ball, your car, the other cars and the goals
---------------------------------------------------------------------------

local car = {
	root = nil,
	driver = nil,
	method = nil,
	reach = 6,
	halfHeight = 2,
	spawn = nil,
	kickoff = nil,
	picked = nil, -- a car you picked by tapping it
	learnedName = nil, -- its model name, to find it again after it respawns
	forwardLocal = Vector3.new(0, 0, -1),
	driveAverage = Vector3.zero,
	steerSign = 1, -- -1 once we learn the controls turn the car the other way
	steerVotes = 0,
	lastSteer = 0,
}
local lastCarScan = -math.huge

local BALL_WORDS = { "ball", "puck", "sphere", "orb" }
local SKIP_WORDS = { "wheel", "tire", "tyre", "sslbot", "turbohub" }
local CAR_WORDS = { "car", "vehicle", "kart", "buggy", "truck" }
local WHEEL_WORDS = { "wheel", "tire", "tyre" }

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

-- The ball: every part is scored on its name (or its parent's), a sphere shape,
-- being the same size every way, being unanchored and having moved since the
-- last scan. Returns a score and whether there's real evidence it's a ball.
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
	if not valid then
		ballCache = nil
	end
	local candidates = scanBalls()
	local best = candidates[1]
	if best and best.accepted and best.part ~= ballCache then
		-- stick with the current ball unless something scores clearly better
		local currentScore = -math.huge
		for _, candidate in ipairs(candidates) do
			if candidate.part == ballCache and candidate.accepted then
				currentScore = candidate.score
				break
			end
		end
		if best.score > currentScore + 30 then
			setBall(best.part, "auto")
		end
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

local function ownsPart(part)
	if isnetworkowner then
		local ok, result = pcall(isnetworkowner, part)
		if ok then
			return result
		end
	end
	-- parts we simulate ourselves report a ReceiveAge of 0
	return part.ReceiveAge == 0
end

local function updateFloor(ball)
	local bottom = ball.Position.Y - ballRadius(ball)
	if not floorY or bottom < floorY then
		floorY = bottom
	end
end

local function mentions(value, plr)
	if value == plr or value == plr.UserId or value == plr.Name then
		return true
	end
	return type(value) == "string"
		and (value == tostring(plr.UserId) or string.lower(value) == string.lower(plr.Name))
end

-- A model that belongs to `plr`: an attribute or value pointing at them, or their name / id in its name.
local function ownedBy(model, plr)
	for _, value in pairs(model:GetAttributes()) do
		if mentions(value, plr) then
			return true
		end
	end
	for _, child in ipairs(model:GetChildren()) do
		if child:IsA("ObjectValue") or child:IsA("StringValue") or child:IsA("IntValue") or child:IsA("NumberValue") then
			if mentions(child.Value, plr) then
				return true
			end
		end
	end
	local lower = string.lower(model.Name)
	return string.find(lower, string.lower(plr.Name), 1, true) ~= nil
		or string.find(lower, tostring(plr.UserId), 1, true) ~= nil
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
	while
		model
		and model.Parent
		and model.Parent ~= workspace
		and model.Parent:IsA("Model")
		and model:GetExtentsSize().Magnitude < 8
	do
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
		if model:IsA("Model") and model ~= char and ownedBy(model, LP) then
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
			car.kickoff = ballCache and ballCache.Position
			local model = modelOf(root)
			local size = model and model:GetExtentsSize() or root.Size
			car.reach = math.clamp(size.Magnitude / 2, 5, 14)
			car.halfHeight = math.clamp(size.Y / 2, 0.5, 8)
			-- until driving teaches us better, guess the nose is along the root's longer side
			car.forwardLocal = root.Size.X > root.Size.Z * 1.2 and Vector3.new(1, 0, 0) or Vector3.new(0, 0, -1)
			car.driveAverage = Vector3.zero
			car.steerSign, car.steerVotes, car.lastSteer = 1, 0, 0
		end
	end
	car.driver, car.method = driver, method
	return car.root, car.driver
end

-- World nose and roof directions. A seat or your character faces forward;
-- otherwise the nose is learned from which way the car moves when driven.
local function carAxes(carRoot, driver)
	if driver then
		return driver.CFrame.LookVector, driver.CFrame.UpVector
	end
	return carRoot.CFrame:VectorToWorldSpace(car.forwardLocal), carRoot.CFrame.UpVector
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

local function seatOf(carRoot)
	if car.driver and car.driver:IsA("VehicleSeat") then
		return car.driver
	end
	local model = modelOf(carRoot)
	return model and model:FindFirstChildWhichIsA("VehicleSeat", true)
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
-- Debug markers (like the original's render: target line, intercept box)
---------------------------------------------------------------------------

local function markerPart(name, shape, size, color)
	return new("Part", {
		Name = name,
		Shape = shape,
		Size = size,
		Anchored = true,
		CanCollide = false,
		CanQuery = false,
		CanTouch = false,
		CastShadow = false,
		Material = Enum.Material.Neon,
		Color = color,
		Transparency = 1,
		Parent = workspace.CurrentCamera,
	})
end

local targetMarker = markerPart("SSLBotTarget", Enum.PartType.Ball, Vector3.new(2.5, 2.5, 2.5), Color3.fromRGB(0, 230, 255))
local lineMarker = markerPart("SSLBotLine", Enum.PartType.Block, Vector3.new(0.25, 0.25, 1), Color3.fromRGB(0, 230, 255))
local icptMarker = markerPart("SSLBotIntercept", Enum.PartType.Block, Vector3.new(2, 2, 2), Color3.fromRGB(255, 50, 50))

---------------------------------------------------------------------------
-- Field frame: Rocket League units on Turbo Soccer's pitch
---------------------------------------------------------------------------

-- Rocket League values the original was tuned with (uu and seconds). The
-- field size and ball radius are replaced by Turbo Soccer's measured pitch.
local C = {
	FIELD_X = 4096,
	GOAL_Y = 5120,
	GOAL_HALF_W = 893,
	GOAL_H = 642,
	CEILING = 2044,
	BALL_RADIUS = 92.75,
	GRAVITY = 650,
	MAX_SPEED = 2300,
	BOOST_ACCEL = 991.666,
	AIR_BOOST_ACCEL = 1058.333,
	BOOST_USE = 33.333,
	JUMP_IMPULSE = 291.667,
	JUMP_HOLD_ACCEL = 1458.333,
	JUMP_HOLD_MAX = 0.2,
	CAR_REST_Z = 17,
}

local Field = { origin = nil, x = nil, y = nil, scale = 1, measuredWalls = false, own = nil, opp = nil, at = -math.huge }

local function fieldRay(origin, direction, maxStuds)
	local ignore = { workspace.CurrentCamera }
	for _, inst in ipairs({ LP.Character, ballCache, car.root and (modelOf(car.root) or car.root) }) do
		if inst then
			table.insert(ignore, inst)
		end
	end
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = ignore
	local hit = workspace:Raycast(origin, direction * maxStuds, params)
	return hit and (hit.Position - origin).Magnitude or nil
end

-- Fits the frame to the pitch: origin at the centre spot, y toward the
-- opponent's net. The pitch's half length (to the end walls above the goals)
-- is 5120 uu, which sets studs per uu; side walls and ceiling are measured too.
local function updateField(own, opp)
	if
		Field.own
		and (Field.own - own).Magnitude < 1
		and (Field.opp - opp).Magnitude < 1
		and os.clock() - Field.at < 15
	then
		return
	end
	local axis = flat(opp - own)
	if axis.Magnitude < 1 or not floorY then
		return
	end
	Field.own, Field.opp, Field.at = own, opp, os.clock()
	local mid = (own + opp) / 2
	Field.y = axis.Unit
	Field.x = Field.y:Cross(Vector3.yAxis)
	Field.origin = Vector3.new(mid.X, floorY, mid.Z)

	local halfLength = axis.Magnitude / 2
	local probe = Field.origin + Vector3.new(0, halfLength * 0.25, 0) -- above the goal mouths
	local front = fieldRay(probe, Field.y, halfLength * 1.5)
	local back = fieldRay(probe, -Field.y, halfLength * 1.5)
	Field.measuredWalls = front ~= nil and back ~= nil
	if Field.measuredWalls then
		halfLength = (front + back) / 2
	end
	Field.scale = halfLength / C.GOAL_Y
	local s = Field.scale

	local sideProbe = Field.origin + Vector3.new(0, 200 * s, 0)
	local left = fieldRay(sideProbe, -Field.x, halfLength * 1.5)
	local right = fieldRay(sideProbe, Field.x, halfLength * 1.5)
	C.FIELD_X = (left and right) and ((left + right) / 2) / s or 4096
	local up = fieldRay(Field.origin + Vector3.new(0, 50 * s, 0), Vector3.yAxis, halfLength)
	C.CEILING = up and (up / s + 50) or 2044
	if ballCache then
		C.BALL_RADIUS = ballRadius(ballCache) / s
	end
end

local function toField(p)
	local d = p - Field.origin
	return Vector3.new(d:Dot(Field.x), d:Dot(Field.y), d.Y) / Field.scale
end

local function dirToField(v)
	return Vector3.new(v:Dot(Field.x), v:Dot(Field.y), v.Y)
end

local function toWorld(p)
	return Field.origin + (Field.x * p.X + Field.y * p.Y + Vector3.yAxis * p.Z) * Field.scale
end

local function toWorldVec(v)
	return (Field.x * v.X + Field.y * v.Y + Vector3.yAxis * v.Z) * Field.scale
end

---------------------------------------------------------------------------
-- SSLBot port: helpers (util/vec.py), all in the field frame, z up
---------------------------------------------------------------------------

local function clamp(v, lo, hi)
	return v < lo and lo or (v > hi and hi or v)
end

local function sgn(v)
	return v >= 0 and 1 or -1
end

local function wrapAngle(a)
	while a > math.pi do
		a -= 2 * math.pi
	end
	while a < -math.pi do
		a += 2 * math.pi
	end
	return a
end

local function fflat(v) -- field-frame flatten (z up)
	return Vector3.new(v.X, v.Y, 0)
end

local function unit(v)
	local n = v.Magnitude
	return n > 1e-9 and v / n or Vector3.zero
end

local function withZ(v, z)
	return Vector3.new(v.X, v.Y, z)
end

-- World direction -> car-local (x forward, y right, z up).
local function relative(ori, v)
	return Vector3.new(v:Dot(ori.forward), v:Dot(ori.right), v:Dot(ori.up))
end

local function localOf(carS, target)
	return relative(carS.ori, target - carS.pos)
end

local function newControls()
	return { throttle = 0, steer = 0, pitch = 0, yaw = 0, roll = 0, jump = false, boost = false, handbrake = false }
end

---------------------------------------------------------------------------
-- mechanics/drive.py
---------------------------------------------------------------------------

local Drive = { DT = 1 / 60, HORIZON = 6 }

-- Rocket League steering curvature (1/uu) vs speed.
local CURV = { { 0, 0.0069 }, { 500, 0.00398 }, { 1000, 0.00235 }, { 1500, 0.001375 }, { 1750, 0.0011 }, { 2300, 0.00088 } }

function Drive.curvature(v)
	v = math.abs(v)
	for i = 1, #CURV - 1 do
		local a, b = CURV[i], CURV[i + 1]
		if v <= b[1] then
			return a[2] + (b[2] - a[2]) * (v - a[1]) / (b[1] - a[1])
		end
	end
	return CURV[#CURV][2]
end

function Drive.turnRadius(v)
	return 1 / Drive.curvature(v)
end

function Drive.throttleAccel(v)
	v = math.abs(v)
	if v < 1400 then
		return 1600 - v * (1440 / 1400)
	end
	if v < 1410 then
		return 160 * (1410 - v) / 10
	end
	return 0
end

-- Cumulative straight-line distance the car can cover at each 1/60 s, full throttle + boost.
function Drive.reachTable(carS)
	local v = math.max(carS.forward_speed, 0)
	local boost = carS.boost
	local d = 0
	local out = { 0 }
	for _ = 1, math.floor(Drive.HORIZON / Drive.DT) do
		local a = Drive.throttleAccel(v)
		if boost > 0 and v < C.MAX_SPEED then
			a += C.BOOST_ACCEL
			boost -= C.BOOST_USE * Drive.DT
		end
		v = math.min(v + a * Drive.DT, C.MAX_SPEED)
		d += v * Drive.DT
		table.insert(out, d)
	end
	return out
end

-- Python's bisect_left, returning a 0-based index.
local function bisectLeft(t, x)
	local lo, hi = 1, #t + 1
	while lo < hi do
		local mid = (lo + hi) // 2
		if t[mid] < x then
			lo = mid + 1
		else
			hi = mid
		end
	end
	return lo - 1
end

function Drive.turnTime(carS, target)
	local loc = localOf(carS, target)
	local ang = math.abs(math.atan2(loc.Y, loc.X))
	local speed = math.max(carS.forward_speed, 0)
	return ang / math.max(1.2, 2.8 - speed / 1500)
end

function Drive.timeToReach(carS, target, tbl, contact)
	local dist = fflat(target - carS.pos).Magnitude - (contact or 130)
	if dist <= 0 then
		return 0
	end
	local i = bisectLeft(tbl, dist)
	if i >= #tbl then
		return math.huge
	end
	return Drive.turnTime(carS, target) + i * Drive.DT
end

-- Steer + throttle toward a ground target. Returns the heading error (rad).
function Drive.to(carS, target, targetSpeed, c, handbrakeOk)
	if handbrakeOk == nil then
		handbrakeOk = true
	end
	local loc = localOf(carS, target)
	local angle = math.atan2(loc.Y, loc.X)
	local fs = carS.forward_speed

	c.steer = clamp(angle * 3.2, -1, 1)

	-- Target inside our turning circle at this speed -> we'd orbit it. Slow down.
	local r = Drive.turnRadius(fs)
	local side = loc.Y >= 0 and 1 or -1
	if Vector3.new(loc.X, loc.Y - side * r, 0).Magnitude < r * 0.95 then
		targetSpeed = math.min(targetSpeed, 450)
	end

	local err = targetSpeed - fs
	if err > 0 then
		c.throttle = 1
		c.boost = targetSpeed > 1300 and err > 60 and math.abs(angle) < 0.3 and carS.on_ground
	elseif err < -250 then
		c.throttle = fs > 0 and -1 or 0
	else
		c.throttle = err < -50 and 0 or 0.6
	end

	c.handbrake = handbrakeOk and math.abs(angle) > 1.7 and fs > 400 and carS.on_ground
	return angle
end

function Drive.clampToField(v)
	local x = clamp(v.X, -(C.FIELD_X - 146), C.FIELD_X - 146)
	local lim = math.abs(x) < C.GOAL_HALF_W - 43 and C.GOAL_Y + 380 or C.GOAL_Y - 170
	return Vector3.new(x, clamp(v.Y, -lim, lim), v.Z)
end

---------------------------------------------------------------------------
-- mechanics/sequences.py
---------------------------------------------------------------------------

local Seq = {}

-- Timed list of { duration, { control = value } } steps. Owns the controls until done.
function Seq.new(steps, name)
	return { steps = steps, start = nil, done = false, name = name or "seq" }
end

function Seq.step(seq, now, c)
	if not seq.start then
		seq.start = now
	end
	local t = now - seq.start
	local acc = 0
	for _, step in ipairs(seq.steps) do
		acc += step[1]
		if t < acc then
			for key, value in pairs(step[2]) do
				c[key] = value
			end
			return
		end
	end
	seq.done = true
end

local function dir2(x, y)
	local n = math.sqrt(x * x + y * y)
	if n < 1e-6 then
		return 1, 0
	end
	return x / n, y / n
end

-- Dodge toward a car-local direction (x forward, y right).
function Seq.flip(lx, ly, boost)
	local x, y = dir2(lx, ly)
	boost = boost or false
	return Seq.new({
		{ 0.07, { jump = true, throttle = 1, boost = boost } },
		{ 0.04, { jump = false, throttle = 1, boost = boost } },
		{ 0.05, { jump = true, pitch = -x, yaw = y, throttle = 1 } },
		{ 0.55, { jump = false, throttle = 1 } },
	}, "flip")
end

function Seq.halfFlip(rollDir)
	return Seq.new({
		{ 0.07, { jump = true, throttle = -1 } },
		{ 0.04, { jump = false, throttle = -1 } },
		{ 0.05, { jump = true, pitch = 1, throttle = -1 } },
		{ 0.15, { jump = false, pitch = -1, throttle = -1 } },
		{ 0.40, { pitch = -1, roll = rollDir, throttle = 1 } },
	}, "half_flip")
end

-- Hold jump to rise, then (optionally) dodge into the ball right before contact.
function Seq.jumpShot(jumpTime, lx, ly, dodge)
	local hold = math.min(C.JUMP_HOLD_MAX, math.max(0.05, jumpTime - 0.05))
	local steps = { { hold, { jump = true, throttle = 1 } } }
	if dodge then
		local x, y = dir2(lx, ly)
		local wait = math.max(0.03, jumpTime - hold - 0.06)
		table.insert(steps, { wait, { jump = false, throttle = 1 } })
		table.insert(steps, { 0.05, { jump = true, pitch = -x, yaw = y, throttle = 1 } })
		table.insert(steps, { 0.45, { jump = false, throttle = 1 } })
	else
		table.insert(steps, { 0.3, { jump = false, throttle = 1 } })
	end
	return Seq.new(steps, "jump_shot")
end

local jumpCurve, jumpMaxHeight, jumpCurveGravity

local function buildJumpCurve()
	local dt = 1 / 120
	local z, vz, t, out = 0, C.JUMP_IMPULSE, 0, {}
	while t < 1.5 do
		local acc = -C.GRAVITY + (t < C.JUMP_HOLD_MAX and C.JUMP_HOLD_ACCEL or 0)
		vz += acc * dt
		z += vz * dt
		t += dt
		table.insert(out, { t, z })
		if vz < 0 then
			break
		end
	end
	jumpCurve, jumpMaxHeight, jumpCurveGravity = out, out[#out][2], C.GRAVITY
end
buildJumpCurve()

-- Seconds for a held single jump to raise the car by `height` uu (rising part only).
function Seq.jumpTimeFor(height)
	if height <= 0 then
		return 0
	end
	for _, point in ipairs(jumpCurve) do
		if point[2] >= height then
			return point[1]
		end
	end
	return nil
end

---------------------------------------------------------------------------
-- mechanics/air.py
---------------------------------------------------------------------------

local Air = {}

-- Points the nose at targetForward and the roof at targetUp. Damping uses the
-- finite difference of the error itself, so it doesn't depend on the
-- angular-velocity sign convention.
local OrientPD = {}
OrientPD.__index = OrientPD
Air.OrientPD = OrientPD

function OrientPD.new()
	return setmetatable({ kp = 3.2, kd = 0.55, kpRoll = 2.0, kdRoll = 0.35, prev = nil, prevT = nil }, OrientPD)
end

function OrientPD:step(carS, targetForward, targetUp, now, c)
	local o = carS.ori
	local f = targetForward
	local pitchErr = math.atan2(f:Dot(o.up), f:Dot(o.forward))
	local yawErr = math.atan2(f:Dot(o.right), f:Dot(o.forward))
	local rollErr = math.atan2(targetUp:Dot(o.right), targetUp:Dot(o.up))

	local d1, d2, d3 = 0, 0, 0
	if self.prev and self.prevT and now - self.prevT > 1e-4 then
		local dt = now - self.prevT
		d1 = wrapAngle(pitchErr - self.prev[1]) / dt
		d2 = wrapAngle(yawErr - self.prev[2]) / dt
		d3 = wrapAngle(rollErr - self.prev[3]) / dt
	end
	self.prev, self.prevT = { pitchErr, yawErr, rollErr }, now

	c.pitch = clamp(self.kp * pitchErr + self.kd * d1, -1, 1)
	c.yaw = clamp(self.kp * yawErr + self.kd * d2, -1, 1)
	-- Only correct roll once the nose is roughly where we want it.
	local w = (math.abs(pitchErr) + math.abs(yawErr) < 0.8) and 1 or 0.3
	c.roll = clamp(w * (self.kpRoll * rollErr + self.kdRoll * d3), -1, 1)
	return math.abs(pitchErr) + math.abs(yawErr)
end

-- Land on wheels, nose along velocity (or toward `face`).
function Air.recover(carS, orient, now, c, face)
	local fwd
	if face then
		fwd = unit(fflat(face))
	else
		local v = fflat(carS.vel)
		fwd = v.Magnitude > 300 and unit(v) or unit(fflat(carS.ori.forward))
	end
	if fwd.Magnitude < 0.5 then
		fwd = Vector3.new(1, 0, 0)
	end
	orient:step(carS, fwd, Vector3.new(0, 0, 1), now, c)
	c.throttle = 1
	c.boost = false
end

-- Constant-acceleration check: can boost alone close the gap ballistic flight leaves?
function Air.aerialFeasible(carS, target, T, boost)
	if T < 0.35 or T > 3.5 then
		return false
	end
	local pos, vel = carS.pos, carS.vel
	if carS.on_ground then
		vel = vel + carS.ori.up * 600 -- first jump + double jump, roughly
		pos = pos + Vector3.new(0, 0, 30)
	end
	local gravity = Vector3.new(0, 0, -C.GRAVITY)
	local delta = target - pos - vel * T - gravity * (0.5 * T * T)
	local req = 2 * delta.Magnitude / (T * T)
	if req > 0.85 * C.AIR_BOOST_ACCEL then
		return false
	end
	-- time needed to swing the nose around
	local ang = math.acos(clamp(carS.ori.forward:Dot(unit(delta)), -1, 1))
	if T < 0.4 + ang * 0.45 then
		return false
	end
	local boostNeeded = (req / C.AIR_BOOST_ACCEL) * T * C.BOOST_USE + 6
	return boostNeeded < boost
end

local function sliceAt(s, t)
	local slices = s.slices
	if #slices == 0 then
		return nil
	end
	local i = math.floor((t - slices[1].time) * 60 + 0.5) + 1
	return slices[clamp(i, 1, #slices)]
end

-- Jump (+ double jump) then boost along the required-acceleration vector.
local Aerial = {}
Aerial.__index = Aerial
Air.Aerial = Aerial

function Aerial.new(shotDir, arrival, now, offset)
	return setmetatable(
		{ shotDir = shotDir, arrival = arrival, start = now, offset = offset or 110, target = nil },
		Aerial
	)
end

function Aerial:step(s, c, orient)
	local me, now = s.me, s.time
	local el = now - self.start
	local T = self.arrival - now
	if T < -0.15 or el > 4 or (el > 0.35 and me.on_ground) then
		return false
	end

	local sl = sliceAt(s, self.arrival)
	if sl then
		self.target = sl.pos - self.shotDir * self.offset
	end
	if not self.target then
		return false
	end

	local Tc = math.max(T, 0.02)
	local gravity = Vector3.new(0, 0, -C.GRAVITY)
	local delta = self.target - me.pos - me.vel * Tc - gravity * (0.5 * Tc * Tc)
	local direction = delta.Magnitude > 1 and delta.Unit or me.ori.forward

	orient:step(me, direction, Vector3.new(0, 0, 1), now, c)
	c.throttle = 1

	if el < 0.2 then
		c.jump = true
	elseif el < 0.23 then
		c.jump = false
	elseif el < 0.27 and not me.double_jumped then
		-- double jump needs a neutral stick or it becomes a dodge
		c.jump = true
		c.pitch, c.yaw, c.roll = 0, 0, 0
	else
		c.jump = false
	end

	local req = 2 * delta.Magnitude / (Tc * Tc)
	local align = me.ori.forward:Dot(direction)
	c.boost = align > 0.85 and req > 200 and me.boost > 0
	return true
end

---------------------------------------------------------------------------
-- strategy/intercept.py
---------------------------------------------------------------------------

local Strat = { JUMP_REACH = 90 } -- car centre sits this far below the ball centre at a good jump hit

function Strat.groundMaxZ()
	return C.BALL_RADIUS + 82.25 -- 175 uu for a Rocket League ball
end

function Strat.onside(s, carS)
	-- True if the car is between the ball and its own goal.
	return (carS.pos.Y - s.ball.pos.Y) * s.side > 0
end

-- Direction we want the ball to leave in: at goal, or away from our net when deep.
function Strat.shotDirection(s, ballPos)
	local aim = Vector3.new(clamp(ballPos.X, -620, 620), -s.ownY, 0)
	local d = unit(fflat(aim - ballPos))
	local fromOwn = fflat(ballPos - s.ownGoal)
	if fromOwn.Magnitude < 3200 then
		local away = unit(fromOwn)
		-- bias toward the nearest sideline so clears don't go back through the middle
		local side = Vector3.new(ballPos.X >= 0 and 1 or -1, 0, 0)
		local w = 1 - fromOwn.Magnitude / 3200
		d = unit(d * (1 - w) + unit(away + side * 0.6) * w)
	end
	return d
end

-- Any touch that sends the ball away from our net. Use the car's own line when it already does.
function Strat.saveDirection(s, carS, ballP)
	local toBall = unit(fflat(ballP - carS.pos))
	local away = unit(fflat(ballP - s.ownGoal))
	if toBall:Dot(away) > -0.2 then
		return unit(toBall + away * 0.5)
	end
	local side = Vector3.new(ballP.X >= 0 and 1 or -1, 0, 0)
	return unit(away + side * 0.7)
end

-- Contact point behind the ball along `shot`, plus an offset waypoint so we arrive aligned.
function Strat.approach(carS, ballP, shot)
	local contact = withZ(ballP - shot * (C.BALL_RADIUS + 55), C.CAR_REST_Z)
	local dist = fflat(contact - carS.pos).Magnitude
	local align = unit(fflat(ballP - carS.pos)):Dot(shot)
	local offset = clamp((1 - align) * dist * 0.45, 0, 1100)
	local target = Drive.clampToField(contact - shot * offset)
	return contact, target, offset
end

function Strat.pathTime(carS, ballP, shot, tbl)
	local _, target, offset = Strat.approach(carS, ballP, shot)
	local length = fflat(target - carS.pos).Magnitude + offset - 40
	if length <= 0 then
		return 0
	end
	local i = bisectLeft(tbl, length)
	if i >= #tbl then
		return math.huge
	end
	return Drive.turnTime(carS, target) + i * Drive.DT
end

-- Earliest predicted ball state this car can reach in time. aligned = true
-- measures the real approach path (getting behind the ball toward our shot
-- direction); false is a cheaper straight-line estimate used for others.
function Strat.findIntercept(s, carS, tbl, step, allowAerial, aligned, shotFn)
	local now = s.time
	shotFn = shotFn or function(p)
		return Strat.shotDirection(s, p)
	end

	local function reach(p)
		if aligned then
			return Strat.pathTime(carS, p, shotFn(p), tbl)
		end
		return Drive.timeToReach(carS, p, tbl)
	end

	for i = 1, #s.slices, step do
		local sl = s.slices[i]
		local T = sl.time - now
		if T > 0 then
			if math.abs(sl.pos.Y) > C.GOAL_Y + C.BALL_RADIUS then
				return nil -- it goes in before we get there
			end
			local z = sl.pos.Z
			if z < Strat.groundMaxZ() then
				if reach(sl.pos) <= T then
					return { slice = sl, kind = "ground", time = sl.time }
				end
			elseif carS.on_ground and z - Strat.JUMP_REACH - C.CAR_REST_Z < jumpMaxHeight - 10 then
				local jt = Seq.jumpTimeFor(z - Strat.JUMP_REACH - C.CAR_REST_Z)
				if jt and T >= jt and reach(sl.pos) <= T then
					return { slice = sl, kind = "jump", time = sl.time }
				end
			elseif allowAerial and z < C.CEILING - 144 and carS.boost > 25 then
				if Air.aerialFeasible(carS, sl.pos, T, carS.boost) then
					return { slice = sl, kind = "aerial", time = sl.time }
				end
			end
		end
	end
	return nil
end

-- First predicted slice that enters our net, or nil.
function Strat.goalThreat(s)
	for i = 1, #s.slices, 2 do
		local sl = s.slices[i]
		if sl.pos.Y * s.side > C.GOAL_Y - 40 and math.abs(sl.pos.X) < C.GOAL_HALF_W + 20 and sl.pos.Z < C.GOAL_H + 20 then
			return sl
		end
		if sl.pos.Y * -s.side > C.GOAL_Y then
			return nil
		end
	end
	return nil
end

---------------------------------------------------------------------------
-- strategy/kickoff.py
---------------------------------------------------------------------------

local Kickoff = {}
Kickoff.__index = Kickoff

function Kickoff.new(s)
	local me, ball = s.me, s.ball.pos
	-- the closest car goes; ties go to the lower index
	local going, bestDist, bestIndex = nil, math.huge, math.huge
	for _, carS in ipairs({ me, table.unpack(s.friends) }) do
		local dist = math.floor(fflat(carS.pos - ball).Magnitude / 50 + 0.5)
		if dist < bestDist or (dist == bestDist and carS.index < bestIndex) then
			going, bestDist, bestIndex = carS, dist, carS.index
		end
	end
	local x = math.abs(me.pos.X)
	return setmetatable({
		going = going == me,
		kind = x > 1500 and "diag" or (x > 200 and "off" or "center"),
		speedFlipDone = false,
	}, Kickoff)
end

function Kickoff:step(brain, s, c)
	local me, ball = s.me, s.ball.pos
	if not self.going then
		brain.label = "kickoff:back"
		return brain:goBack(s, c, true)
	end

	brain.label = "kickoff:" .. self.kind
	if not me.on_ground then
		Air.recover(me, brain.orient, s.time, c, ball - me.pos)
		return
	end

	local dist = fflat(ball - me.pos).Magnitude
	local speed = me.vel.Magnitude
	-- Approach through a point just on our side of the ball so we meet it head-on.
	local aim = dist > 1300 and Vector3.new(0, s.side * 140, 0) or ball
	local angle = Drive.to(me, aim, 2300, c, false)
	c.boost = math.abs(angle) < 0.5
	brain.target = aim

	local loc = localOf(me, ball)
	local flipSpeed = self.kind ~= "center" and 1050 or 1300
	if not self.speedFlipDone and dist > 2300 and speed > flipSpeed and math.abs(angle) < 0.15 then
		brain.seq = Seq.flip(loc.X, loc.Y, true)
		self.speedFlipDone = true
	elseif dist < 1100 and dist / math.max(speed, 1) < 0.30 then
		brain.seq = Seq.flip(1, math.max(-0.4, math.min(0.4, loc.Y / math.max(loc.X, 1))), true)
	end
end

---------------------------------------------------------------------------
-- Air dribble + flip reset (added on top of the original bot)
---------------------------------------------------------------------------

-- Phases: setup (catch the rolling ball on the nose) -> pop (jump it up) ->
-- carry (fly under it toward the net) -> reset (wheels onto the ball to get
-- the flip back) -> aim (nose at the ball, then flip into it, or ram it with
-- boost if there's no flip left). Physics drive mode only: it needs the
-- script's Rocket League car model for air control and to hand back the flip.
-- With Dribble Assist and your device simulating the ball, the ball is also
-- kept on the nose and the final touch is aimed; otherwise only real touches
-- move it, which drops it far more often.
local Dribble = {}
Dribble.__index = Dribble

local DRIBBLE_HEIGHT = 700 -- uu: carry height for the ball
local DRIBBLE_SPEED = 900 -- uu/s toward the net while carrying
local FINAL_SHOT_SPEED = 2800 -- uu/s for an assisted finishing touch

function Dribble.new(now, wantReset)
	return setmetatable({
		phase = "setup",
		start = now,
		phaseAt = now,
		wantReset = wantReset,
		target = nil,
		flip = nil,
		shotFired = false,
	}, Dribble)
end

function Dribble:setPhase(phase, now)
	self.phase, self.phaseAt = phase, now
end

-- Point the nose along the acceleration that holds the car at `spot`, moving
-- with `matchVel` (a PD on position plus gravity compensation), and boost
-- when the nose is lined up with it.
local function hover(me, spot, matchVel, orient, now, c, targetUp)
	local want = (spot - me.pos) * 6 + (matchVel - me.vel) * 2.5 + Vector3.new(0, 0, C.GRAVITY)
	local dir = unit(want)
	if dir.Magnitude < 0.5 then
		dir = me.ori.forward
	end
	local up = targetUp or unit(Vector3.new(0, 0, 1) - dir * dir.Z)
	if up.Magnitude < 0.5 then
		up = me.ori.up
	end
	orient:step(me, dir, up, now, c)
	c.boost = me.ori.forward:Dot(dir) > 0.8 and want.Magnitude > 250
	c.throttle = 1
end

local function finalShot(s, ballP)
	local target = Vector3.new(clamp(ballP.X, -500, 500), s.oppGoal.Y, C.GOAL_H * 0.45)
	return unit(target - ballP) * FINAL_SHOT_SPEED + Vector3.new(0, 0, 150)
end

function Dribble:step(s, c, orient)
	local me, now = s.me, s.time
	local ball, ballVel = s.ball.pos, s.ball.vel
	local R = C.BALL_RADIUS
	local shot = Strat.shotDirection(s, ball)
	local el = now - self.phaseAt
	local toBall = ball - me.pos
	self.target = ball
	if now - self.start > 9 then
		return false
	end

	if self.phase == "setup" then
		-- line up behind the rolling ball and catch it on the nose
		if ball.Z > R + 120 or toBall.Magnitude > 2500 or el > 3.5 then
			return false
		end
		local contact = withZ(ball - shot * (R + 30), C.CAR_REST_Z)
		local loc = localOf(me, ball)
		local catchUp = loc.X > 600 and 700 or 250
		Drive.to(me, contact, clamp(fflat(ballVel):Dot(shot) + catchUp, 500, 1600), c)
		self.target = contact
		if me.on_ground and loc.X > R * 0.5 and loc.X < R + 140 and math.abs(loc.Y) < 60 then
			self:setPhase("pop", now)
			self.popAt = now
			if s.ownBall then
				s.ballCommand = me.vel + Vector3.new(0, 0, 750) + shot * 150
			end
		end
		return true
	end

	if self.phase == "pop" then
		c.jump = el < 0.18
		c.throttle = 1
		c.pitch = -0.3
		if el > 0.25 then
			self:setPhase("carry", now)
		end
		return true
	end

	-- in the air from here on
	if me.on_ground and now - self.popAt > 0.6 then
		return false -- landed: the dribble is over
	end
	if toBall.Magnitude > R + 700 or ball.Z < 150 then
		return false -- lost it
	end
	local nearestFoe = math.huge
	for _, foe in ipairs(s.foes) do
		nearestFoe = math.min(nearestFoe, (foe.pos - ball).Magnitude)
	end
	local toGoal = fflat(s.oppGoal - ball).Magnitude

	if self.phase == "carry" then
		-- sit just behind and under the ball, nose into it, carrying it toward the net
		local below = Vector3.new(0, 0, R * 0.6 + 30)
		local carryVel = shot * DRIBBLE_SPEED + Vector3.new(0, 0, clamp((DRIBBLE_HEIGHT - ball.Z) * 2, -300, 400))
		hover(me, ball - shot * (R + 50) - below, carryVel, orient, now, c)
		if s.ownBall then
			-- keep it resting on the nose
			s.ballCommand = carryVel + (me.pos + shot * (R + 50) + below - ball) * 3
		end
		if toGoal < 2200 or nearestFoe < 700 or el > 4 then
			self:setPhase("aim", now)
		elseif self.wantReset and el > 0.8 and ball.Z > 400 then
			self:setPhase("reset", now)
		end
		return true
	end

	if self.phase == "reset" then
		-- roll the wheels onto the ball: roof away from it, nose toward the net
		local roof = unit(me.pos - ball)
		local nose = unit(shot - roof * shot:Dot(roof))
		if nose.Magnitude < 0.5 then
			nose = me.ori.forward
		end
		orient:step(me, nose, roof, now, c)
		-- slide under it along the nose while it's still ahead
		c.boost = toBall:Dot(me.ori.forward) > 40 and me.ori.forward:Dot(nose) > 0.8
		if s.ownBall then
			-- let it settle onto the wheels, falling with the car
			local wheelSpot = me.pos - me.ori.up * (R + me.halfHeight)
			s.ballCommand = me.vel + (wheelSpot - ball) * 2
		end
		if me.flip_reset or el > 1.2 then
			self:setPhase("aim", now) -- reset (or out of time): go for the shot
		end
		return true
	end

	-- aim: nose at the back of the ball, then flip into it, or ram it with boost
	local dir = unit(ball - shot * (R * 0.5) - me.pos)
	orient:step(me, dir, unit(Vector3.new(0, 0, 1) - dir * dir.Z), now, c)
	c.boost = me.ori.forward:Dot(dir) > 0.75
	local close = toBall.Magnitude < R + 220
	if self.flip then
		Seq.step(self.flip, now, c)
		return not self.flip.done
	end
	if close and me.has_flip then
		local loc = localOf(me, ball)
		local x, y = dir2(loc.X, loc.Y)
		self.flip = Seq.new({
			{ 0.03, { jump = false } },
			{ 0.05, { jump = true, pitch = -x, yaw = y } },
			{ 0.5, { jump = false } },
		}, "flip_shot")
		Seq.step(self.flip, now, c)
	end
	if close and s.ownBall and not self.shotFired then
		s.ballCommand = finalShot(s, ball)
		self.shotFired = true
	end
	return el < 1.5
end

---------------------------------------------------------------------------
-- strategy/brain.py
---------------------------------------------------------------------------

local ARRIVE_EARLY = 0.1
local MIN_APPROACH_SPEED = 900

local Brain = {}
Brain.__index = Brain

function Brain.new()
	return setmetatable({
		allowAerial = true,
		seq = nil,
		aerial = nil,
		kick = nil,
		orient = OrientPD.new(),
		label = "",
		target = nil,
		icpt = nil,
		dribble = nil,
		dribbleReadyAt = 0,
	}, Brain)
end

function Brain:tick(s)
	local c = newControls()
	local me = s.me
	self.target = nil

	if s.kickoff then
		if self.kick == nil and self.seq == nil then
			self.aerial = nil
			self.kick = Kickoff.new(s)
		end
	else
		self.kick = nil
	end

	if self.seq then
		Seq.step(self.seq, s.time, c)
		if not self.seq.done then
			self.label = self.seq.name
			return c
		end
		self.seq = nil
		c = newControls()
	end

	if self.kick then
		self.dribble = nil
		self.kick:step(self, s, c)
		return self:startSeq(s, c)
	end

	if self.dribble then
		self.label = "air_dribble:" .. self.dribble.phase
		if self.dribble:step(s, c, self.orient) then
			self.target = self.dribble.target
			return c
		end
		self.dribble = nil
		self.dribbleReadyAt = s.time + 3
	end

	if self.aerial then
		self.label = "aerial"
		if self.aerial:step(s, c, self.orient) then
			self.target = self.aerial.target
			return c
		end
		self.aerial = nil
	end

	if not me.on_ground then
		self.label = "recover"
		Air.recover(me, self.orient, s.time, c)
		return c
	end

	if me.ori.up.Z < 0.5 then -- on a wall: drive down
		self.label = "wall"
		Drive.to(me, me.pos - Vector3.new(0, 0, 1500) - unit(fflat(me.pos)) * 500, 1400, c)
		return c
	end

	self:groundPlay(s, c)
	return self:startSeq(s, c)
end

function Brain:startSeq(s, c)
	if self.seq then
		local c2 = newControls()
		Seq.step(self.seq, s.time, c2)
		self.label = self.seq.name
		return c2
	end
	return c
end

function Brain:groundPlay(s, c)
	local me, now = s.me, s.time
	local myTable = Drive.reachTable(me)
	local icpt = Strat.findIntercept(s, me, myTable, 2, self.allowAerial, true, nil)
	self.icpt = icpt
	local threat = Strat.goalThreat(s)

	local function score(carS, eta)
		return eta + (Strat.onside(s, carS) and 0 or 0.6) + (carS.boost > 20 and 0 or 0.25)
	end

	-- compare like with like: straight-line estimate for every car
	local mi = Strat.findIntercept(s, me, myTable, 4, false, false, nil)
	local cmpEta = mi and (mi.time - now) or 99
	local mine = score(me, cmpEta)
	local rank = 0
	for _, f in ipairs(s.friends) do
		local fi = Strat.findIntercept(s, f, Drive.reachTable(f), 4, false, false, nil)
		local fs = score(f, fi and (fi.time - now) or 99)
		if fs < mine - 0.05 or (math.abs(fs - mine) <= 0.05 and f.index < me.index) then
			rank += 1
		end
	end

	local foeEta = 99
	for _, f in ipairs(s.foes) do
		local fi = Strat.findIntercept(s, f, Drive.reachTable(f), 4, false, false, nil)
		if fi then
			foeEta = math.min(foeEta, fi.time - now)
		end
	end

	if threat and rank == 0 then
		local saveFn = function(p)
			return Strat.saveDirection(s, me, p)
		end
		local si = Strat.findIntercept(s, me, myTable, 2, self.allowAerial, true, saveFn)
		if si and si.time <= threat.time + 0.05 then
			self.label = "save"
			self.icpt = si
			return self:attack(s, c, si, foeEta, true, saveFn)
		end
		self.label = "net"
		return self:goNet(s, c, threat)
	end

	if rank == 0 then
		if not icpt then
			self.label = "shadow"
			return self:shadow(s, c, 1800)
		end
		if not Strat.onside(s, me) and foeEta + 0.3 < cmpEta then
			self.label = "retreat"
			return self:retreat(s, c)
		end
		if foeEta + 0.7 < cmpEta and cmpEta > 1.2 then
			self.label = "shadow"
			return self:shadow(s, c, 1600)
		end
		self.label = "attack"
		return self:attack(s, c, icpt, foeEta)
	end
	if rank == 1 then
		self.label = "support"
		return self:shadow(s, c, 2700, 50)
	end
	self.label = "back"
	return self:goBack(s, c)
end

function Brain:attack(s, c, icpt, foeEta, urgent, shotFn)
	local me = s.me
	local ballP = icpt.slice.pos
	local T = icpt.time - s.time
	local shot = shotFn and shotFn(ballP) or Strat.shotDirection(s, ballP)

	if icpt.kind == "aerial" then
		local loc = localOf(me, ballP)
		if math.abs(math.atan2(loc.Y, loc.X)) < 0.4 then
			self.aerial = Aerial.new(shot, icpt.time, s.time)
			self.aerial:step(s, c, self.orient)
			self.target = self.aerial.target
			self.label = "aerial"
			return
		end
		Drive.to(me, withZ(ballP, 0), 1400, c)
		self.target = ballP
		return
	end

	if self:canDribble(s, icpt, foeEta, urgent, shotFn) then
		self.dribble = Dribble.new(s.time, Settings.FlipReset)
		self.label = "air_dribble:setup"
		self.dribble:step(s, c, self.orient)
		self.target = self.dribble.target
		return
	end

	local contact, target, offset = Strat.approach(me, ballP, shot)
	local dist = fflat(contact - me.pos).Magnitude
	self.target = target

	local pathLen = fflat(target - me.pos).Magnitude + offset
	-- arrive a touch early; never let slowness push the intercept back
	local needed = pathLen / math.max(T - ARRIVE_EARLY, 0.05)
	local contested = foeEta < T + 0.5
	local speed = (contested or urgent or needed > 1400) and 2300 or clamp(needed * 1.1, MIN_APPROACH_SPEED, 2300)
	local angle = Drive.to(me, target, speed, c)

	local localBall = localOf(me, ballP)
	local lx, ly = localBall.X, localBall.Y
	if icpt.kind == "jump" then
		local jt = Seq.jumpTimeFor(ballP.Z - Strat.JUMP_REACH - C.CAR_REST_Z)
		if not jt or jt == 0 then
			jt = 0.3 -- Python's `or 0.3` also replaces 0
		end
		local reach = math.max(me.forward_speed, 0) * T + 160
		if T <= jt + 0.02 and dist < reach and math.abs(angle) < 0.35 then
			self.seq = Seq.jumpShot(jt, lx, ly, ballP.Z < 260)
		end
		return
	end

	-- ground: dodge into it for power
	if T < 0.22 and dist < 420 and math.abs(angle) < 0.4 and me.forward_speed > 600 then
		local sl = relative(me.ori, shot)
		self.seq = Seq.flip(lx + sl.X, ly + sl.Y)
	end
end

-- Only when it's free: a slow, low ball we're behind, far from their net,
-- with no opponent able to challenge before we'd get there.
function Brain:canDribble(s, icpt, foeEta, urgent, shotFn)
	if not (Settings.AirDribble and Settings.DriveMode == 1) then
		return false
	end
	if urgent or shotFn or s.time < self.dribbleReadyAt then
		return false
	end
	local me, ball = s.me, s.ball.pos
	if ball.Z > C.BALL_RADIUS + 60 or fflat(s.ball.vel).Magnitude > 1500 then
		return false
	end
	if (ball - me.pos).Magnitude > 1800 or fflat(s.oppGoal - ball).Magnitude < 3500 then
		return false
	end
	if foeEta < (icpt.time - s.time) + 1 then
		return false
	end
	return Strat.onside(s, me)
end

function Brain:shadow(s, c, back, wantBoost)
	local me = s.me
	local ball = s.ball.pos
	local d = fflat(s.ownGoal - ball)
	local target = fflat(ball) + unit(d) * math.min(d.Magnitude * 0.6, back)
	target = Drive.clampToField(Vector3.new(target.X * 0.75, target.Y, 0))
	if wantBoost and me.boost < wantBoost then
		local pad = self:bestPad(s, target)
		if pad then
			target = withZ(pad.pos, 0)
		end
	end
	self:travel(s, c, target, ball)
end

function Brain:retreat(s, c)
	local ball = s.ball.pos
	local target = Vector3.new(-sgn(ball.X) * 1100, s.ownY * 0.82, 0)
	self:travel(s, c, target, ball)
end

function Brain:goBack(s, c, kickoff)
	local me = s.me
	local ball = s.ball.pos
	local target = Vector3.new(clamp(ball.X * 0.3, -700, 700), s.ownY * 0.88, 0)
	if me.boost < 40 or kickoff then
		local pad = self:bestPad(s, target, 1500)
		if pad then
			target = withZ(pad.pos, 0)
		end
	end
	self:travel(s, c, target, ball)
end

function Brain:goNet(s, c, threat)
	local x = clamp(threat.pos.X, -650, 650)
	self:travel(s, c, Vector3.new(x, s.ownY * 0.985, 0), s.ball.pos, 180)
end

function Brain:travel(s, c, target, face, arrive)
	arrive = arrive or 280
	local me = s.me
	self.target = target
	local dist = fflat(target - me.pos).Magnitude
	if dist < arrive and face then
		Drive.to(me, face, 0, c)
		if math.abs(me.forward_speed) < 100 then
			c.throttle = 0.15
		end
		return
	end
	local speed = dist > 1500 and 2300 or clamp(dist * 1.2, 500, 1600)
	local angle = Drive.to(me, target, speed, c)
	local fs = me.forward_speed
	if not me.on_ground or me.ori.up.Z < 0.95 then
		return
	end
	if math.abs(angle) > 2.6 and fs > -500 and fs < 250 and dist > 1500 then
		self.seq = Seq.halfFlip(angle > 0 and 1 or -1)
	elseif math.abs(angle) < 0.08 and fs > 1100 and fs < 2000 and dist > 2600 and (me.boost < 10 or not c.boost) then
		self.seq = Seq.flip(1, 0)
	end
end

-- Turbo Soccer's boost pads aren't known, so s.pads is empty and this finds none.
function Brain:bestPad(s, dest, maxDetour)
	local me = s.me
	local base = fflat(dest - me.pos).Magnitude
	local best, cost = nil, maxDetour or 1200
	for _, p in ipairs(s.pads) do
		if p.active and p.big then
			local detour = fflat(p.pos - me.pos).Magnitude + fflat(dest - p.pos).Magnitude - base
			if detour < cost then
				best, cost = p, detour
			end
		end
	end
	return best
end

---------------------------------------------------------------------------
-- util/game.py: building the game state each frame
---------------------------------------------------------------------------

-- 6 s of ball prediction at 60 Hz (2 substeps each), with floor, ceiling,
-- wall and goal handling like the original's test sim, under the real gravity.
local function predictSlices(posF, velF, now)
	local g = workspace.Gravity / Field.scale
	local R = C.BALL_RADIUS
	local x, y, z, vx, vy, vz = posF.X, posF.Y, posF.Z, velF.X, velF.Y, velF.Z
	local dt = 1 / 120
	local slices = table.create(360)
	local t = now
	local scored = false
	for i = 1, 360 do
		for _ = 1, 2 do
			if not scored then
				vz -= g * dt
				local drag = 1 - 0.03 * dt
				vx, vy, vz = vx * drag, vy * drag, vz * drag
				x += vx * dt
				y += vy * dt
				z += vz * dt
				if z < R then
					z = R
					if vz < 0 then
						vz = vz < -60 and -vz * 0.6 or 0
					end
				end
				if z > C.CEILING - R and vz > 0 then
					vz = -vz * 0.6
				end
				if math.abs(x) > C.FIELD_X - R then
					x = sgn(x) * (C.FIELD_X - R)
					vx = -vx * 0.6
				end
				if math.abs(y) > C.GOAL_Y - R then
					if math.abs(x) < C.GOAL_HALF_W - R and z < C.GOAL_H - R then
						scored = math.abs(y) > C.GOAL_Y + R
					else
						y = sgn(y) * (C.GOAL_Y - R)
						vy = -vy * 0.6
					end
				end
			end
		end
		t += 1 / 60
		slices[i] = { pos = Vector3.new(x, y, z), vel = Vector3.new(vx, vy, vz), time = t }
	end
	return slices
end

local function makeCarState(index, posW, velW, forwardW, upW)
	local ori = {
		forward = dirToField(forwardW),
		right = dirToField(unit(forwardW:Cross(upW))),
		up = dirToField(upW),
	}
	local vel = dirToField(velW) / Field.scale
	return {
		index = index,
		pos = toField(posW),
		vel = vel,
		ori = ori,
		forward_speed = vel:Dot(ori.forward),
		boost = 100, -- Turbo Soccer's boost meter isn't readable, so assume some is left
		on_ground = true,
		jumped = false,
		double_jumped = false,
	}
end

local function onGround(carRoot, upW)
	local ignore = { workspace.CurrentCamera, modelOf(carRoot) or carRoot }
	for _, inst in ipairs({ LP.Character, ballCache }) do
		if inst then
			table.insert(ignore, inst)
		end
	end
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = ignore
	return workspace:Raycast(carRoot.Position, -upW * (car.halfHeight + 2), params) ~= nil
end

-- Other cars: friends share your Team, everyone else is a foe.
local others = { list = {}, scannedAt = -math.huge }

local function ownerOf(model)
	for _, plr in ipairs(Players:GetPlayers()) do
		if plr.Character == model or ownedBy(model, plr) then
			return plr
		end
	end
	return nil
end

local function refreshOthers()
	if os.clock() - others.scannedAt < 2 then
		return
	end
	others.scannedAt = os.clock()
	local mine = car.root and (modelOf(car.root) or car.root)
	local list = {}
	for _, entry in ipairs(scanCars()) do
		local model = entry.model
		local isMine = mine and (model == mine or mine:IsDescendantOf(model) or model:IsDescendantOf(mine))
		if not isMine then
			local root = rootOf(model)
			local plr = ownerOf(model)
			if root and plr ~= LP then
				local friend = plr ~= nil and LP.Team ~= nil and not LP.Neutral and plr.Team == LP.Team
				table.insert(list, { model = model, root = root, friend = friend })
			end
		end
	end
	others.list = list
end

local function otherStates()
	local friends, foes = {}, {}
	for i, other in ipairs(others.list) do
		local root = other.root
		if root.Parent then
			local vel = root.AssemblyLinearVelocity
			local heading = flat(vel).Magnitude > 5 and flat(vel) or flat(root.CFrame.LookVector)
			heading = heading.Magnitude > 0.01 and heading.Unit or Vector3.new(0, 0, -1)
			local st = makeCarState(i, root.Position, vel, heading, Vector3.yAxis)
			st.boost = 50
			table.insert(other.friend and friends or foes, st)
		end
	end
	return friends, foes
end

-- Physics-mode jump state (the game's own isn't readable).
local exec = {
	prevJump = false,
	jumped = false,
	doubleJumped = false,
	dodged = false,
	jumpTime = 0,
	jumpAt = -math.huge,
	hasReset = false, -- flip given back by the wheels touching the ball
	resetAt = -math.huge,
	lastAt = 0,
}

local frameCount = 0
local cachedSlices

local function buildState(ball, carRoot, driver)
	local now = os.clock()
	local s = { time = now, side = -1, ownY = -C.GOAL_Y, pads = {} }
	s.ownGoal = Vector3.new(0, s.ownY, 0)
	s.oppGoal = Vector3.new(0, -s.ownY, 0)

	local bp, bv = toField(ball.Position), dirToField(ballVelocity(ball)) / Field.scale
	s.ball = { pos = bp, vel = bv }
	-- No kickoff flag in Roblox: the ball sitting still on the centre spot is a kickoff.
	s.kickoff = fflat(bp).Magnitude < 250 and bv.Magnitude < 40

	frameCount += 1
	if not cachedSlices or frameCount % 2 == 0 then
		cachedSlices = predictSlices(bp, bv, now)
	end
	s.slices = cachedSlices

	local forwardW, upW = carAxes(carRoot, driver)
	local me = makeCarState(0, carRoot.Position, carRoot.AssemblyLinearVelocity, forwardW, upW)
	me.on_ground = onGround(carRoot, upW)
	-- just after a jump the ground is still within the probe's reach; count the
	-- car as airborne so a flip's second press is a dodge, not another jump
	if exec.jumped and now - exec.jumpAt < 0.3 then
		me.on_ground = false
	end
	me.jumped, me.double_jumped = exec.jumped, exec.doubleJumped
	-- a flip is left until it's used, or 1.25 s after the jump (a reset never runs out)
	me.has_flip = not (exec.dodged or exec.doubleJumped) and (exec.jumpTime < 1.25 or exec.hasReset)
	me.flip_reset = exec.hasReset
	me.halfHeight = car.halfHeight / Field.scale
	s.me = me
	s.ownBall = Settings.DribbleAssist and ownsPart(ball)
	s.friends, s.foes = otherStates()
	return s, forwardW, upW
end

---------------------------------------------------------------------------
-- Turning SSLBot's controller output into driving
---------------------------------------------------------------------------

-- Seat and Keys modes: whether positive steer really turns the car right is
-- learned from how it yaws, in case the game has left and right swapped.
local function steerOut(carRoot, steerRight, forwardSpeed)
	if math.abs(car.lastSteer) > 0.5 and forwardSpeed > 200 then
		local yawRight = -carRoot.AssemblyAngularVelocity.Y -- + = turning right
		if math.abs(yawRight) > 0.2 then
			local agreed = (yawRight > 0) == (car.lastSteer > 0)
			car.steerVotes = clamp(car.steerVotes + (agreed and 1 or -1), -40, 40)
			if car.steerVotes <= -20 then
				car.steerSign = -car.steerSign
				car.steerVotes = 0
			end
		end
	end
	car.lastSteer = steerRight
	return steerRight * car.steerSign
end

-- Physics mode: a Rocket League car model (throttle and boost curves, speed-
-- dependent turning, jumps, dodges, air control, RL gravity) drives the car's
-- velocity directly, so no key presses are needed and it works on mobile.
local AIR_TURN_RATE = 5.5 -- rad/s, Rocket League's max angular speed

local function physicsExecute(c, me, carRoot, forwardW, upW, ballPart)
	local now = os.clock()
	local dt = clamp(now - exec.lastAt, 1 / 240, 1 / 20)
	exec.lastAt = now
	local s = Field.scale
	local rightW = forwardW:Cross(upW)
	local rising = c.jump and not exec.prevJump
	exec.prevJump = c.jump

	local v = carRoot.AssemblyLinearVelocity
	local angular
	local full = false
	if me.on_ground then
		exec.jumped, exec.doubleJumped, exec.dodged, exec.jumpTime = false, false, false, 0
		exec.hasReset = false
		local vf = me.forward_speed
		local a
		if c.throttle * vf < -1 then
			a = -3500 * sgn(vf) -- braking
		elseif math.abs(c.throttle) < 0.01 then
			a = math.abs(vf) > 10 and -525 * sgn(vf) or -vf / dt -- coasting
		else
			a = c.throttle * Drive.throttleAccel(vf)
		end
		if c.boost then
			a += C.BOOST_ACCEL
		end
		vf = clamp(vf + a * dt, -C.MAX_SPEED, C.MAX_SPEED)
		-- RL steer + is right; spinning + about the roof turns left
		local yawRate = c.steer * Drive.curvature(vf) * vf * (c.handbrake and 1.6 or 1)
		local planar = forwardW * (vf * s)
		v = Vector3.new(planar.X, v.Y, planar.Z)
		angular = upW * -yawRate
		if rising then
			v += upW * (C.JUMP_IMPULSE * s)
			exec.jumped, exec.jumpTime, exec.jumpAt = true, 0, now
			full = true
		end
	else
		full = true
		exec.jumpTime += dt
		-- Flip reset: all four wheels on the ball gives the flip back, as in Rocket League
		if Settings.FlipReset and ballPart and now - exec.resetAt > 0.5 then
			local toBall = ballPart.Position - carRoot.Position
			if toBall.Magnitude < ballRadius(ballPart) + car.halfHeight + 1 and unit(toBall):Dot(upW) < -0.6 then
				exec.dodged, exec.doubleJumped, exec.jumped, exec.jumpTime = false, false, true, 0
				exec.hasReset, exec.resetAt = true, now
			end
		end
		if c.jump and exec.jumped and not exec.dodged and exec.jumpTime < C.JUMP_HOLD_MAX and not exec.hasReset then
			v += upW * (C.JUMP_HOLD_ACCEL * s * dt)
		end
		if rising and not (exec.dodged or exec.doubleJumped) and (exec.jumpTime < 1.25 or exec.hasReset) then
			if math.abs(c.pitch) + math.abs(c.yaw) > 0.5 then
				local dir = flat(forwardW * -c.pitch + rightW * c.yaw)
				if dir.Magnitude > 0.01 then
					v += dir.Unit * (500 * s)
				end
				v = Vector3.new(v.X, math.max(v.Y, 0), v.Z)
				exec.dodged = true
			else
				v += upW * (C.JUMP_IMPULSE * s)
				exec.doubleJumped = true
			end
			exec.hasReset = false
		end
		if c.boost then
			v += forwardW * (C.AIR_BOOST_ACCEL * s * dt)
		end
		-- fall at Rocket League gravity, whatever the game's gravity is
		v += Vector3.new(0, (workspace.Gravity - C.GRAVITY * s) * dt, 0)
		-- pitch + is nose up, yaw + is nose right, roll + is roll right
		angular = (rightW * c.pitch - upW * c.yaw + forwardW * c.roll) * AIR_TURN_RATE
	end

	local top = C.MAX_SPEED * s
	if v.Magnitude > top then
		v = v.Unit * top
	end
	pendingDrive = { root = carRoot, linear = v, full = full, angular = angular, expires = now + 0.1 }
	applyDrive(pendingDrive)
end

local function seatExecute(c, me, carRoot, seat)
	drivenSeat = seat
	local steer = steerOut(carRoot, c.steer, me.forward_speed)
	pcall(function()
		seat.ThrottleFloat = c.throttle
		seat.Throttle = c.throttle > 0.1 and 1 or (c.throttle < -0.1 and -1 or 0)
		seat.SteerFloat = steer
		seat.Steer = steer > 0.3 and 1 or (steer < -0.3 and -1 or 0)
	end)
	setMouse(0, c.boost)
	setMouse(1, c.jump)
	setKey(Enum.KeyCode.LeftShift, c.handbrake)
end

-- Keys mode: W/S drive (pitch in the air), A/D steer (yaw in the air), Q/E air
-- roll, left mouse boost, right mouse jump, Shift powerslide.
local function keysExecute(c, me, carRoot)
	local K = Enum.KeyCode
	if me.on_ground then
		local steer = steerOut(carRoot, c.steer, me.forward_speed)
		setKey(K.W, c.throttle > 0.2)
		setKey(K.S, c.throttle < -0.2)
		setKey(K.A, steer < -0.3)
		setKey(K.D, steer > 0.3)
		setKey(K.Q, false)
		setKey(K.E, false)
	else
		setKey(K.W, c.pitch < -0.3)
		setKey(K.S, c.pitch > 0.3)
		setKey(K.A, c.yaw < -0.3)
		setKey(K.D, c.yaw > 0.3)
		setKey(K.Q, c.roll < -0.3)
		setKey(K.E, c.roll > 0.3)
	end
	setMouse(0, c.boost)
	setMouse(1, c.jump)
	setKey(K.LeftShift, c.handbrake)
end

local status = "Idle"
local brain = Brain.new()
local botTarget, botIntercept -- world positions for the debug markers

local function sslStep(ball, carRoot, driver, own, opp)
	updateField(own, opp)
	if not Field.origin then
		return false
	end
	-- Physics mode gives the car Rocket League gravity; otherwise plan with the game's own.
	local gravity = Settings.DriveMode == 1 and 650 or workspace.Gravity / Field.scale
	if math.abs(gravity - jumpCurveGravity) > 1 then
		C.GRAVITY = gravity
		buildJumpCurve()
	end
	refreshOthers()
	brain.allowAerial = Settings.Aerials

	local s, forwardW, upW = buildState(ball, carRoot, driver)
	local c = brain:tick(s)
	status = brain.label
	botTarget = brain.target and toWorld(brain.target)
	botIntercept = brain.icpt and toWorld(brain.icpt.slice.pos)

	-- Dribble Assist: the dribble's wish for the ball, applied only while your
	-- device is the one simulating it (otherwise the change wouldn't stick)
	if s.ballCommand and s.ownBall then
		ball.AssemblyLinearVelocity = toWorldVec(s.ballCommand)
	end

	local seat = Settings.DriveMode == 2 and seatOf(carRoot)
	if Settings.DriveMode == 1 then
		physicsExecute(c, s.me, carRoot, forwardW, upW, ball)
	elseif seat then
		seatExecute(c, s.me, carRoot, seat)
	elseif Settings.DriveMode == 2 then
		status = "Seat input picked, but your car has no seat. Tap Test Drive Methods"
	else
		keysExecute(c, s.me, carRoot)
	end
	return true
end

-- Drive test: tries each drive mode for a moment and keeps the first one that
-- actually moves the car, since games differ in what a script may control.
local testing = false
local driveTested = false -- runs once by itself the first time Auto Play has a car
local driveTestResult

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
	local forward = flat((carAxes(root, driver)))
	forward = forward.Magnitude > 0.01 and forward.Unit or Vector3.new(0, 0, -1)

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
	notify("Nothing moved your car (" .. driveTestResult .. "). Try again once you can drive.")
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
	gui:Destroy()
	targetMarker:Destroy()
	lineMarker:Destroy()
	icptMarker:Destroy()
	if genv.SSLBotUnload == unload then
		genv.SSLBotUnload = nil
	end
end
genv.SSLBotUnload = unload

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
	Text = "SSL",
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
		Text = "SSLBot",
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

local page = new("ScrollingFrame", {
	Size = UDim2.new(1, -16, 1, -56),
	Position = UDim2.fromOffset(8, 44),
	BackgroundTransparency = 1,
	BorderSizePixel = 0,
	ScrollBarThickness = 4,
	ScrollBarImageColor3 = Theme.Accent,
	CanvasSize = UDim2.new(),
	AutomaticCanvasSize = Enum.AutomaticSize.Y,
	ScrollingDirection = Enum.ScrollingDirection.Y,
	Parent = main,
}, {
	new("UIListLayout", { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }),
	new("UIPadding", { PaddingRight = UDim.new(0, 6), PaddingTop = UDim.new(0, 2), PaddingBottom = UDim.new(0, 2) }),
})

new("TextLabel", {
	Text = "Tap SSL to show / hide  -  drag the title bar to move",
	Font = Enum.Font.Gotham,
	TextSize = 10,
	TextColor3 = Theme.Sub,
	BackgroundTransparency = 1,
	Size = UDim2.new(1, 0, 0, 8),
	Position = UDim2.new(0, 0, 1, -10),
	Parent = main,
})

---------------------------------------------------------------------------
-- Controls
---------------------------------------------------------------------------

local layoutOrder = 0
local function nextOrder()
	layoutOrder += 1
	return layoutOrder
end

local controlRenders = {}
local function refreshControls()
	for _, render in ipairs(controlRenders) do
		render()
	end
end

local function addSection(text)
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

local function addNote()
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

local function addToggle(text, key, onChange)
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

local function addButton(text, callback)
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

local function renderBotButton()
	botButton.Text = Settings.AutoPlay and "BOT ON" or "BOT OFF"
	botButton.BackgroundColor3 = Settings.AutoPlay and Theme.Accent or Theme.Off
end
table.insert(controlRenders, renderBotButton)

local function setAutoPlay(on)
	Settings.AutoPlay = on
	if not on then
		releaseInputs()
		brain = Brain.new()
		status = "Idle"
	end
	refreshControls()
end

addSection("Bot")
addToggle("Auto Play", "AutoPlay", setAutoPlay)
local driveButton
driveButton = addButton("", function()
	releaseInputs()
	Settings.DriveMode = Settings.DriveMode % #DRIVE_MODES + 1
	refreshControls()
end)
table.insert(controlRenders, function()
	driveButton.Text = "Drive: " .. DRIVE_MODES[Settings.DriveMode]
end)
addButton("Test Drive Methods (picks the one that works)", function()
	task.spawn(function()
		testDriveModes()
		refreshControls()
	end)
end)
addToggle("Aerials", "Aerials")
addToggle("Air Dribble (Physics mode)", "AirDribble")
addToggle("Flip Resets (Physics mode)", "FlipReset")
addToggle("Dribble Assist (when you control the ball)", "DribbleAssist")

addSection("Field")
addButton("Swap Goals (if it attacks your own net)", function()
	Settings.SwapGoals = not Settings.SwapGoals
	notify(Settings.SwapGoals and "Goals swapped." or "Goals back to normal.")
end)
addButton("Rescan Ball, Car & Goals", function()
	ballCache, ballSource, lastBallScan, learnedBall = nil, "auto", -math.huge, nil
	car.root, car.picked, car.learnedName, lastCarScan = nil, nil, nil, -math.huge
	goals.scannedAt, Field.at, others.scannedAt = -math.huge, -math.huge, -math.huge
	floorY = nil
	notify("Rescanning...")
end)

local picking -- "ball" or "car" while waiting for you to tap one on screen
addButton("Pick Ball (then tap it on screen)", function()
	picking = "ball"
	main.Visible = false
	notify("Tap the ball on your screen.")
end)
addButton("Pick Car (then tap your car on screen)", function()
	picking = "car"
	main.Visible = false
	notify("Tap your car on your screen.")
end)
local diagnostics = addNote()

addSection("Debug")
addToggle("Debug Markers (target line, intercept box)", "DebugMarkers")

addSection("Misc")
addToggle("Anti-AFK", "AntiAFK")
addButton("Unload SSLBot", unload)

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
	local ignore = { workspace.CurrentCamera }
	if mode == "ball" and LP.Character then
		table.insert(ignore, LP.Character)
	end
	params.FilterDescendantsInstances = ignore
	local result = workspace:Raycast(ray.Origin, ray.Direction * 2000, params)
	if not result or not result.Instance:IsA("BasePart") then
		notify("Missed. Tap Pick " .. (mode == "ball" and "Ball" or "Car") .. " and try again.")
		return
	end
	local part = result.Instance
	if mode == "car" then
		local model = carModelOf(part)
		car.picked = (model and rootOf(model)) or part.AssemblyRootPart or part
		car.learnedName = model and model.Name
		car.root, lastCarScan = nil, -math.huge -- rerun getCar so spawn, reach and forward reset
		notify("Car set to " .. (model and model.Name or part.Name) .. ".")
		return
	end
	-- a visual mesh welded to the real ball shares its physics root
	if not part.Anchored and part.AssemblyRootPart then
		part = part.AssemblyRootPart
	end
	setBall(part, "picked")
	notify("Ball set to " .. part.Name .. ". It'll be found again after goals.")
end))

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

local function updateMarkers(carRoot)
	local show = Settings.DebugMarkers and Settings.AutoPlay
	if show and botTarget then
		targetMarker.CFrame = CFrame.new(botTarget + Vector3.new(0, 1, 0))
		targetMarker.Transparency = 0.3
		if carRoot then
			local from, to = carRoot.Position, botTarget + Vector3.new(0, 1, 0)
			local length = (to - from).Magnitude
			if length > 0.5 then
				lineMarker.Size = Vector3.new(0.25, 0.25, length)
				lineMarker.CFrame = CFrame.lookAt((from + to) / 2, to)
				lineMarker.Transparency = 0.4
			end
		end
	else
		targetMarker.Transparency = 1
		lineMarker.Transparency = 1
	end
	if show and botIntercept then
		icptMarker.CFrame = CFrame.new(botIntercept)
		icptMarker.Transparency = 0.3
	else
		icptMarker.Transparency = 1
	end
end

local lastBallPos

track(RunService.Heartbeat:Connect(function()
	local ball = findBall()
	local carRoot, driver = getCar()
	-- learn which way the nose points, except while Physics mode is steering it for us
	if carRoot and not (Settings.AutoPlay and Settings.DriveMode == 1) then
		learnForward(carRoot)
	end
	if ball then
		sampleBall(ball)
		updateFloor(ball)
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

	local own, opp
	if ball and carRoot then
		own, opp = getGoals()
	end
	if Settings.AutoPlay and carRoot and not driveTested and not testing then
		task.spawn(testDriveModes)
	end
	if testing then
		-- testDriveModes is driving the car
	elseif Settings.AutoPlay and ball and carRoot and own then
		if not sslStep(ball, carRoot, driver, own, opp) then
			status = "Measuring the pitch..."
		end
	elseif Settings.AutoPlay then
		releaseInputs()
		botTarget, botIntercept = nil, nil
		status = not ball and "Can't find the ball. Open the menu: Pick Ball"
			or not carRoot and "Can't find your car. Open the menu: Pick Car"
			or "Finding the field..."
	end
	updateMarkers(carRoot)
end))

-- Re-apply the Physics command right before the physics step, so a game
-- script that also sets the car's velocity doesn't simply cancel it.
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
		local ballLine = "not found. Use Pick Ball below"
		if ball then
			ballLine = string.format(
				"%s (%s, %s)",
				ball.Name,
				ballSource == "picked" and "picked" or "auto",
				ownsPart(ball) and "you control it" or "server controls it"
			)
		end
		local carLine = "not found. Use Pick Car below"
		if car.root then
			carLine = string.format("%s (found via %s)", (modelOf(car.root) or car.root).Name, car.method or "?")
		end
		local friends, foes = 0, 0
		for _, other in ipairs(others.list) do
			if other.friend then
				friends += 1
			else
				foes += 1
			end
		end
		local fieldLine = "not fitted yet"
		if Field.origin then
			fieldLine = string.format(
				"%d x %d studs, 1 stud = %.1f uu (%s)",
				math.floor(C.GOAL_Y * 2 * Field.scale + 0.5),
				math.floor(C.FIELD_X * 2 * Field.scale + 0.5),
				1 / Field.scale,
				Field.measuredWalls and "walls measured" or "from goal positions"
			)
		end
		local lines = {
			"Ball: " .. ballLine,
			"Car: " .. carLine,
			"Goals: " .. (goals.a and "found both ends" or (car.kickoff and "using kickoff direction" or "not found")),
			"Pitch: " .. fieldLine,
			string.format("Other cars: %d teammates, %d opponents", friends, foes),
			"Drive: " .. DRIVE_MODES[Settings.DriveMode] .. (driveTestResult and ("  (test: " .. driveTestResult .. ")") or ""),
			"Bot: " .. (Settings.AutoPlay and status or "off"),
		}
		diagnostics.Text = table.concat(lines, "\n")
		statusLabel.Visible = Settings.AutoPlay
		statusLabel.Text = "SSLBot: " .. status
		refreshControls()
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

if game.PlaceId ~= PLACE_ID then
	notify("This isn't the Turbo Soccer place, but SSLBot will still try to find a ball and car.")
end
notify("Loaded! Tap BOT to start, or SSL for the menu.")
