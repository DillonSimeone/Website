extends Node

var roads := {}

func _ready() -> void:
	request_track("arcade", 1)

func request_track(mode: String, seed_value: int) -> void:
	var key := _key(mode, seed_value)
	if roads.has(key):
		return
	roads[key] = RoadMesh.build(TrackLayouts.build(mode, seed_value))

func road_ready(mode: String, seed_value: int) -> bool:
	var key := _key(mode, seed_value)
	if not roads.has(key):
		request_track(mode, seed_value)
	return roads.has(key)

func peek_road(mode: String, seed_value: int) -> Dictionary:
	var key := _key(mode, seed_value)
	if not roads.has(key):
		request_track(mode, seed_value)
	return roads.get(key, {})

func peek_car() -> Dictionary:
	if GameState.mesh == null:
		GameState.mesh = MeshFactory.default_vehicle()
	var fitted: Dictionary = MeshFactory.oriented_bounds(GameState.mesh, GameState.euler_deg)
	fitted["mesh"] = GameState.mesh
	return fitted

func _key(mode: String, seed_value: int) -> String:
	return "%s:%d" % [mode, seed_value]
