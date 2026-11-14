extends Node3D

var frames := 0
var race: Node3D

func _ready() -> void:
	GameState.mode = "roguelite"
	GameState.run_seed = 4
	race = load("res://scenes/race.tscn").instantiate()
	add_child(race)

func _process(_delta: float) -> void:
	frames += 1
	if frames < 40:
		return
	var y: float = race.vehicle.global_position.y
	var has_director: bool = race.director != null
	print("ROGUE y=", snappedf(y, 0.01), " director=", has_director, " phase=", race.phase)
	var code := 0
	if y < 0.1 or y > 6.0 or not has_director:
		push_error("roguelite start failed")
		code = 3
	else:
		print("ROGUE OK")
	get_tree().quit(code)
