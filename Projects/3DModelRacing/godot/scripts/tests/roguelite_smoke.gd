extends SceneTree

func _initialize() -> void:
	call_deferred("_go")

func _go() -> void:
	root.add_child(load("res://scripts/tests/roguelite_host.gd").new())
