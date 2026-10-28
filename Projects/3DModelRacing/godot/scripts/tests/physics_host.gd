extends Node3D

var frames := 0
var vehicle: Vehicle

func _ready() -> void:
	var floor_body := StaticBody3D.new()
	floor_body.collision_layer = 1
	floor_body.collision_mask = 0
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(40, 1, 700)
	shape.shape = box
	shape.position = Vector3(0, -0.5, -300)
	floor_body.add_child(shape)
	add_child(floor_body)
	var _tb: Dictionary = TrackBuilder.construct(self, TrackLayouts.build("arcade", 1))
	var baked: Dictionary = MeshFactory.bake_oriented(MeshFactory.default_vehicle(), Vector3.ZERO)
	vehicle = Vehicle.new()
	vehicle.use_player_input = false
	vehicle.throttle = 1.0
	vehicle.setup(baked.mesh, baked.size, baked.stats, Color(0.9, 0.3, 0.2), 6)
	vehicle.position = Vector3(0, 2.2, 0)
	add_child(vehicle)

func _physics_process(_delta: float) -> void:
	frames += 1
	if frames < 480:
		return
	var height := vehicle.global_position.y
	var speed := vehicle.forward_speed()
	print("SMOKE y=", snappedf(height, 0.01), " speed=", snappedf(speed, 0.01), " grounded=", vehicle.grounded)
	var code := 0
	if height < 0.15 or height > 3.2:
		push_error("hover height %s" % height)
		code = 2
	if speed < 6.0:
		push_error("too slow %s" % speed)
		code = 2
	if code == 0:
		print("SMOKE OK")
	get_tree().quit(code)
