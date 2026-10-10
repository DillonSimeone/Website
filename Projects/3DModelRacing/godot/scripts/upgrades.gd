class_name Upgrades
extends RefCounted

static func roll(count: int, owned: Dictionary, rng: RandomNumberGenerator) -> Array:
	var pool: Array[Dictionary] = []
	for entry in _catalog():
		var stacks := int(owned.get(entry.id, 0))
		var cap := 1 if bool(entry.unique) else int(entry.max_stacks)
		if stacks < cap:
			pool.append(entry)
	if pool.is_empty():
		pool = _catalog()
	for i in pool.size():
		var swap := rng.randi_range(0, pool.size() - 1)
		var tmp: Dictionary = pool[i]
		pool[i] = pool[swap]
		pool[swap] = tmp
	var picks: Array[Dictionary] = []
	for entry in pool:
		if picks.size() >= count:
			break
		var taken := false
		for have in picks:
			if have.id == entry.id:
				taken = true
		if not taken:
			picks.append(entry)
	while picks.size() < count:
		picks.append(_catalog()[rng.randi() % _catalog().size()])
	return picks

static func apply(id: String, vehicle, director) -> void:
	match id:
		"shed":
			vehicle.stats.mass = maxf(VehicleStats.MASS_MIN, float(vehicle.stats.mass) * 0.82)
			vehicle.mass = float(vehicle.stats.mass)
			director.integrity = maxf(0.0, director.integrity - 12.0)
		"stretch":
			vehicle.stats.top_speed = float(vehicle.stats.top_speed) * 1.12
			vehicle.stats.yaw = float(vehicle.stats.yaw) * 0.86
		"wide":
			vehicle.stats.grip = float(vehicle.stats.grip) * 1.22
			vehicle.stats.yaw = float(vehicle.stats.yaw) * 1.1
			vehicle.stats.top_speed = float(vehicle.stats.top_speed) * 0.94
		"nitro":
			vehicle.nitro_charges += 1
		"repair":
			director.integrity = minf(100.0, director.integrity + 36.0)
			vehicle.clear_dents()
		"downforce":
			vehicle.stats.grip = float(vehicle.stats.grip) * 1.28
			vehicle.launch_mult *= 0.78
			vehicle.downforce_mult = maxf(vehicle.downforce_mult, 1.35)
		"feather":
			vehicle.stats.mass = maxf(VehicleStats.MASS_MIN, float(vehicle.stats.mass) * 0.85)
			vehicle.mass = float(vehicle.stats.mass)
			vehicle.spring_mult *= 0.75
			vehicle.launch_mult *= 1.12
			vehicle.downforce_mult *= 0.45
		"gyro":
			vehicle.upright_mult *= 1.4
			vehicle.stats.yaw = float(vehicle.stats.yaw) * 0.9
		"ram":
			vehicle.smash_xp_mult *= 1.6
			vehicle.knockback *= 1.45
			vehicle.stats.mass = minf(VehicleStats.MASS_MAX, float(vehicle.stats.mass) * 1.1)
			vehicle.mass = float(vehicle.stats.mass)
		"tricks":
			vehicle.trick_xp_mult *= 1.6
			vehicle.spring_damp_mult *= 0.7
		"burner":
			vehicle.stats.accel = float(vehicle.stats.accel) * 1.25
		"slip":
			vehicle.slipstream = true
		"magnet":
			vehicle.magnet = true
		"lighten":
			vehicle.stats.mass = maxf(VehicleStats.MASS_MIN, float(vehicle.stats.mass) * 0.9)
			vehicle.mass = float(vehicle.stats.mass)
		_:
			pass
	director.owned[id] = int(director.owned.get(id, 0)) + 1

static func _catalog() -> Array[Dictionary]:
	return [
		{"id": "shed", "title": "Shed plating", "detail": "Drop mass so the ramp can throw you. Integrity falls with it.", "unique": true, "max_stacks": 1},
		{"id": "stretch", "title": "Stretch gears", "detail": "Higher top speed. The nose gets lazy in turns.", "unique": false, "max_stacks": 3},
		{"id": "wide", "title": "Wide stance", "detail": "Sharper grip and turning. A little more drag.", "unique": false, "max_stacks": 3},
		{"id": "nitro", "title": "Nitro bottle", "detail": "Shift spends a bottle for a hard speed burst.", "unique": false, "max_stacks": 3},
		{"id": "repair", "title": "Repair putty", "detail": "Fill the bites in the mesh and restore integrity.", "unique": false, "max_stacks": 2},
		{"id": "downforce", "title": "Downforce", "detail": "Planted in corners. The sky gets harder to reach.", "unique": true, "max_stacks": 1},
		{"id": "feather", "title": "Feather shell", "detail": "Lighter springs and an easier launch. You float.", "unique": true, "max_stacks": 1},
		{"id": "gyro", "title": "Gyro fins", "detail": "Much harder to flip. Steering softens.", "unique": true, "max_stacks": 1},
		{"id": "ram", "title": "Ram bar", "detail": "Smashes throw rivals harder and pay more XP. You get heavier.", "unique": true, "max_stacks": 1},
		{"id": "tricks", "title": "Trick suspension", "detail": "Air and drifts pay more XP. Landings get bouncy.", "unique": true, "max_stacks": 1},
		{"id": "burner", "title": "Afterburner", "detail": "Acceleration climbs. Mass stays the same.", "unique": false, "max_stacks": 3},
		{"id": "slip", "title": "Slipstream", "detail": "Sit behind another vehicle and your top speed rises.", "unique": true, "max_stacks": 1},
		{"id": "magnet", "title": "Magnet tires", "detail": "Extra grip while you are still slow.", "unique": true, "max_stacks": 1},
		{"id": "lighten", "title": "Lighten frame", "detail": "A smaller cut of mass. Launch rating ticks up.", "unique": false, "max_stacks": 3},
	]
