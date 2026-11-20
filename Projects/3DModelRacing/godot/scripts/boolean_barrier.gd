class_name BooleanBarrier
extends Node3D

signal smashed(at: Vector3)

var punches := 0
var xp_given := false
var mesh_node: MeshInstance3D
var body: StaticBody3D

func _ready() -> void:
	add_to_group("barrier")
	mesh_node = MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(0.22, 1.7, 2.4)
	mesh_node.mesh = box
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.95, 0.42, 0.16)
	mat.emission_enabled = true
	mat.emission = Color(1.0, 0.35, 0.08)
	mat.emission_energy_multiplier = 0.6
	mesh_node.material_override = mat
	add_child(mesh_node)
	body = StaticBody3D.new()
	body.collision_layer = 1 << 2
	body.collision_mask = 0
	var shape := CollisionShape3D.new()
	var box_shape := BoxShape3D.new()
	box_shape.size = Vector3(0.22, 1.7, 2.4)
	shape.shape = box_shape
	body.add_child(shape)
	add_child(body)

func punch(world_pos: Vector3) -> void:
	if punches >= 3:
		return
	punches += 1
	var cut := MeshBoolean.subtract_sphere(mesh_node.mesh, mesh_node.to_local(world_pos), 0.7)
	if cut != null:
		mesh_node.mesh = cut
	if not xp_given:
		xp_given = true
		smashed.emit(world_pos)
	if punches >= 3:
		body.collision_layer = 0
		var tween := create_tween()
		tween.tween_property(self, "position:y", position.y - 1.6, 0.3)
