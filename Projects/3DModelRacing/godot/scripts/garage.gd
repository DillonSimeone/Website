extends Control

const Perf = preload("res://scripts/perf.gd")

var preview: MeshInstance3D
var preview_mat: StandardMaterial3D
var status: Label
var stat_labels: Dictionary = {}
var stat_fills: Dictionary = {}
var start_button: Button
var pattern_buttons: Array[Button] = []
var cam: Camera3D
var perf_badge: Label
var _first_frame := true

var _dragging := false
var _drag_last := Vector2.ZERO

func _init() -> void:
	Perf.mark("GARAGE", "_init called")

func _ready() -> void:
	Perf.mark("GARAGE", "_ready started")
	theme = UiStyle.theme()
	UiStyle.full(self)

	var bg := ColorRect.new()
	bg.color = Color(0.05, 0.055, 0.08)
	UiStyle.full(bg)
	add_child(bg)

	var margin := MarginContainer.new()
	UiStyle.full(margin)
	margin.add_theme_constant_override("margin_left", 24)
	margin.add_theme_constant_override("margin_right", 24)
	margin.add_theme_constant_override("margin_top", 16)
	margin.add_theme_constant_override("margin_bottom", 16)
	add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 10)
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	margin.add_child(root)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 16)
	root.add_child(header)

	var title := Label.new()
	title.text = "GARAGE"
	title.add_theme_font_size_override("font_size", 30)
	title.add_theme_color_override("font_color", Color(1.0, 0.8, 0.35))
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)

	perf_badge = Label.new()
	perf_badge.add_theme_font_size_override("font_size", 13)
	perf_badge.add_theme_color_override("font_color", Color(0.4, 0.85, 0.6))
	header.add_child(perf_badge)

	var back := UiStyle.button("Menu", Vector2(110, 40))
	back.pressed.connect(func() -> void:
		Perf.start_transition("GARAGE", "MENU")
		get_tree().change_scene_to_file("res://scenes/main_menu.tscn")
	)
	header.add_child(back)

	var columns := HBoxContainer.new()
	columns.size_flags_vertical = Control.SIZE_EXPAND_FILL
	columns.add_theme_constant_override("separation", 20)
	root.add_child(columns)

	var t0 := Time.get_ticks_msec()
	columns.add_child(_left())
	Perf.mark("GARAGE", "_left() (SubViewport + 3D) created in %d ms" % (Time.get_ticks_msec() - t0))

	t0 = Time.get_ticks_msec()
	columns.add_child(_right())
	Perf.mark("GARAGE", "_right() (UI panels) created in %d ms" % (Time.get_ticks_msec() - t0))

	GameState.car_changed.connect(_on_car_changed)

	t0 = Time.get_ticks_msec()
	_refresh()
	Perf.mark("GARAGE", "_refresh() finished in %d ms" % (Time.get_ticks_msec() - t0))

func _process(_delta: float) -> void:
	if _first_frame:
		_first_frame = false
		var summary := Perf.finish_transition("GARAGE")
		if perf_badge:
			perf_badge.text = "[Load: " + summary + "]"

func _left() -> Control:
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 8)

	# 3D Viewport container
	var frame := SubViewportContainer.new()
	frame.stretch = true
	frame.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	frame.size_flags_vertical = Control.SIZE_EXPAND_FILL
	frame.custom_minimum_size = Vector2(580, 440)
	frame.gui_input.connect(_on_viewport_input)
	col.add_child(frame)

	var vp := SubViewport.new()
	vp.own_world_3d = true
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	vp.size = Vector2i(620, 460)
	frame.add_child(vp)

	var world := Node3D.new()
	vp.add_child(world)

	# Atmosphere / Environment
	var env_node := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.08, 0.09, 0.12)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.7, 0.75, 0.85)
	env.ambient_light_energy = 1.0
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	env_node.environment = env
	world.add_child(env_node)

	# Clean showroom light
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-35, 38, 0)
	sun.light_color = Color(1.0, 0.96, 0.9)
	sun.light_energy = 1.3
	sun.shadow_enabled = false
	world.add_child(sun)

	# Camera
	cam = Camera3D.new()
	cam.fov = 38
	cam.current = true
	cam.look_at_from_position(Vector3(3.2, 2.0, 3.6), Vector3(0, 0.35, 0), Vector3.UP)
	world.add_child(cam)

	# Glowing holographic turntable pedestal
	var pad := MeshInstance3D.new()
	var disc := CylinderMesh.new()
	disc.top_radius = 2.4
	disc.bottom_radius = 2.5
	disc.height = 0.08
	pad.mesh = disc
	pad.position.y = -0.04
	var pad_mat := StandardMaterial3D.new()
	pad_mat.albedo_color = Color(0.1, 0.11, 0.15)
	pad_mat.roughness = 0.3
	pad.material_override = pad_mat
	world.add_child(pad)

	# Outer glowing ring on pedestal
	var ring := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 2.32
	torus.outer_radius = 2.42
	torus.rings = 36
	torus.ring_segments = 12
	ring.mesh = torus
	ring.position.y = 0.01
	var ring_mat := StandardMaterial3D.new()
	ring_mat.albedo_color = Color(1.0, 0.65, 0.2)
	ring_mat.emission_enabled = true
	ring_mat.emission = Color(1.0, 0.65, 0.2)
	ring_mat.emission_energy_multiplier = 1.6
	ring_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ring.material_override = ring_mat
	world.add_child(ring)

	# Visual 3D rotation gizmo rings around vehicle
	var yaw_ring := MeshInstance3D.new()
	var yaw_torus := TorusMesh.new()
	yaw_torus.inner_radius = 1.95
	yaw_torus.outer_radius = 1.98
	yaw_torus.rings = 36
	yaw_torus.ring_segments = 8
	yaw_ring.mesh = yaw_torus
	yaw_ring.position.y = 0.02
	var yaw_mat := StandardMaterial3D.new()
	yaw_mat.albedo_color = Color(0.3, 0.75, 1.0)
	yaw_mat.emission_enabled = true
	yaw_mat.emission = Color(0.3, 0.75, 1.0)
	yaw_mat.emission_energy_multiplier = 1.2
	yaw_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	yaw_ring.material_override = yaw_mat
	world.add_child(yaw_ring)

	# Ambient rising energy particles
	var motes := CPUParticles3D.new()
	var dot := SphereMesh.new()
	dot.radius = 0.022
	dot.height = 0.044
	motes.mesh = dot
	motes.amount = 32
	motes.lifetime = 3.5
	motes.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	motes.emission_sphere_radius = 2.2
	motes.direction = Vector3.UP
	motes.spread = 15.0
	motes.gravity = Vector3(0, 0.1, 0)
	motes.initial_velocity_min = 0.15
	motes.initial_velocity_max = 0.4
	var dot_mat := StandardMaterial3D.new()
	dot_mat.albedo_color = Color(1, 0.8, 0.4)
	dot_mat.emission_enabled = true
	dot_mat.emission = Color(1.0, 0.75, 0.3)
	dot_mat.emission_energy_multiplier = 2.0
	dot_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	dot.material = dot_mat
	world.add_child(motes)

	# Vehicle mesh preview
	preview = MeshInstance3D.new()
	world.add_child(preview)

	# Direction indicators
	var nose := Label3D.new()
	nose.text = "▲ FORWARD"
	nose.font_size = 28
	nose.modulate = Color(1.0, 0.8, 0.3)
	nose.position = Vector3(0, 0.15, -2.1)
	nose.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	world.add_child(nose)

	# Controls row below preview: drag instruction & reset button
	var control_bar := HBoxContainer.new()
	control_bar.add_theme_constant_override("separation", 14)
	col.add_child(control_bar)

	var hint := Label.new()
	hint.text = "🖱️ Drag vehicle to rotate (Yaw / Pitch)   ·   Shift + Drag for Roll"
	hint.add_theme_font_size_override("font_size", 14)
	hint.add_theme_color_override("font_color", Color(0.78, 0.82, 0.92))
	hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	control_bar.add_child(hint)

	var reset := UiStyle.button("Reset orientation", Vector2(170, 38))
	reset.pressed.connect(func() -> void:
		GameState.set_rotation(Vector3.ZERO)
		_refresh()
	)
	control_bar.add_child(reset)

	status = Label.new()
	status.text = "Drop an STL, OBJ, or GLB. Longest side becomes 3 m. Point the nose at FORWARD."
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status.add_theme_font_size_override("font_size", 13)
	status.add_theme_color_override("font_color", Color(0.7, 0.74, 0.82))
	col.add_child(status)

	return col

func _on_viewport_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_LEFT or mb.button_index == MOUSE_BUTTON_RIGHT:
			_dragging = mb.pressed
			_drag_last = mb.position
		elif mb.button_index == MOUSE_BUTTON_WHEEL_UP:
			if cam:
				cam.position = cam.position.move_toward(Vector3(0, 0.35, 0), 0.25)
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			if cam:
				cam.position = cam.position.move_toward(Vector3(0, 0.35, 0), -0.25)
	elif event is InputEventMouseMotion and _dragging:
		var mm := event as InputEventMouseMotion
		var delta: Vector2 = mm.relative
		var euler := GameState.euler_deg
		if Input.is_key_pressed(KEY_SHIFT) or mm.button_mask & MOUSE_BUTTON_MASK_RIGHT != 0:
			euler.z = wrapf(euler.z + delta.x * 0.7, -180.0, 180.0)
		else:
			euler.y = wrapf(euler.y + delta.x * 0.7, -180.0, 180.0)
			euler.x = clampf(euler.x + delta.y * 0.7, -90.0, 90.0)
		GameState.set_rotation(euler)
		_refresh()

func _right() -> Control:
	var scroll := ScrollContainer.new()
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.custom_minimum_size = Vector2(380, 0)

	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 10)
	scroll.add_child(col)

	# Section 1: Shape Stats Card
	col.add_child(_section_card("Vehicle Shape & Stats", _build_stats()))

	# Section 2: Colors Card
	col.add_child(_section_card("Paint Color", _build_colors()))

	# Section 3: Textures Card
	col.add_child(_section_card("Static Patterns", _pattern_grid(false)))
	col.add_child(_section_card("Animated Holograms", _pattern_grid(true)))

	# Action Buttons
	var actions_card := PanelContainer.new()
	var a_style := StyleBoxFlat.new()
	a_style.bg_color = Color(0.08, 0.085, 0.13, 0.9)
	a_style.border_color = Color(0.3, 0.35, 0.5, 0.4)
	a_style.set_border_width_all(1)
	a_style.set_corner_radius_all(10)
	a_style.content_margin_left = 14
	a_style.content_margin_right = 14
	a_style.content_margin_top = 12
	a_style.content_margin_bottom = 12
	actions_card.add_theme_stylebox_override("panel", a_style)

	var a_box := VBoxContainer.new()
	a_box.add_theme_constant_override("separation", 8)
	actions_card.add_child(a_box)

	var import_button := UiStyle.button("Import 3D model (STL/OBJ/GLB)", Vector2(340, 46))
	import_button.pressed.connect(func() -> void:
		status.text = "Reading mesh..."
		GameState.open_file_picker(self)
	)
	a_box.add_child(import_button)

	var wedge := UiStyle.button("Reset to default wedge", Vector2(340, 42))
	wedge.pressed.connect(func() -> void:
		GameState.reset_car()
	)
	a_box.add_child(wedge)

	start_button = UiStyle.button("Start", Vector2(340, 52))
	start_button.pressed.connect(_start)
	a_box.add_child(start_button)

	var swap := UiStyle.button("Switch mode", Vector2(340, 42))
	swap.pressed.connect(func() -> void:
		GameState.mode = "arcade" if GameState.mode == "roguelite" else "roguelite"
		_sync_start()
	)
	a_box.add_child(swap)

	col.add_child(actions_card)
	return scroll

func _section_card(title_text: String, content: Control) -> PanelContainer:
	var panel := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.08, 0.085, 0.13, 0.9)
	style.border_color = Color(0.28, 0.32, 0.45, 0.45)
	style.set_border_width_all(1)
	style.set_corner_radius_all(10)
	style.content_margin_left = 14
	style.content_margin_right = 14
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	panel.add_theme_stylebox_override("panel", style)

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	panel.add_child(box)

	var hdr := Label.new()
	hdr.text = title_text
	hdr.add_theme_font_size_override("font_size", 16)
	hdr.add_theme_color_override("font_color", Color(1.0, 0.82, 0.42))
	box.add_child(hdr)

	box.add_child(content)
	return panel

func _build_stats() -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	for key in ["speed", "handling", "weight", "launch"]:
		box.add_child(_stat_row(key))
	return box

func _build_colors() -> Control:
	var colors := HBoxContainer.new()
	colors.add_theme_constant_override("separation", 6)
	for paint in VehicleLook.COLORS:
		var swatch := Button.new()
		swatch.custom_minimum_size = Vector2(36, 36)
		var style := StyleBoxFlat.new()
		style.bg_color = paint
		style.set_corner_radius_all(6)
		swatch.add_theme_stylebox_override("normal", style)
		swatch.add_theme_stylebox_override("hover", style)
		swatch.add_theme_stylebox_override("pressed", style)
		var chosen := paint
		swatch.pressed.connect(func() -> void:
			GameState.set_look(chosen, GameState.pattern_id)
			_refresh()
		)
		colors.add_child(swatch)
	return colors

func _stat_row(key: String) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 4)
	var label := Label.new()
	label.name = key
	label.add_theme_font_size_override("font_size", 14)
	label.add_theme_color_override("font_color", Color(0.92, 0.94, 0.98))
	stat_labels[key] = label
	box.add_child(label)

	var track := Control.new()
	track.custom_minimum_size = Vector2(330, 14)
	var back := ColorRect.new()
	back.color = Color(0.14, 0.15, 0.22)
	back.mouse_filter = Control.MOUSE_FILTER_IGNORE
	UiStyle.full(back)
	track.add_child(back)

	var fill := ColorRect.new()
	fill.color = Color(0.95, 0.65, 0.25)
	fill.anchor_top = 0
	fill.anchor_bottom = 1
	fill.anchor_left = 0
	fill.anchor_right = 0.2
	fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	track.add_child(fill)
	stat_fills[key] = fill

	box.add_child(track)
	return box

func _pattern_grid(animated: bool) -> GridContainer:
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	for i in VehicleLook.PATTERNS.size():
		var entry: Dictionary = VehicleLook.PATTERNS[i]
		if bool(entry.animated) != animated:
			continue
		var button := UiStyle.button(str(entry.name), Vector2(165, 38))
		var id := i
		button.pressed.connect(func() -> void:
			GameState.set_look(GameState.color, id)
			_refresh()
		)
		button.set_meta("pattern", id)
		pattern_buttons.append(button)
		grid.add_child(button)
	return grid

func _refresh() -> void:
	if preview.mesh != GameState.mesh:
		preview.mesh = GameState.mesh
	var fitted: Dictionary = MeshFactory.oriented_bounds(GameState.mesh, GameState.euler_deg)
	preview.basis = fitted.rotation
	preview.position = Vector3(0, -fitted.min_v.y, 0)
	preview_mat = VehicleLook.material(GameState.color, GameState.pattern_id)
	preview.material_override = preview_mat
	var stats: Dictionary = fitted.stats
	_fill("speed", "Top Speed:  %d km/h" % int(round(float(stats.top_speed) * 3.6)), float(stats.top_speed) / 40.0)
	_fill("handling", "Handling & Grip:  %.2f" % float(stats.yaw), float(stats.yaw) / 3.0)
	_fill("weight", "Vehicle Mass:  %d kg" % int(float(stats.mass) * 180.0), float(stats.mass) / VehicleStats.MASS_MAX)
	var launch_ratio := float(stats.launch) / VehicleStats.LAUNCH_ENERGY
	var launch_text := "Launch Capability:  %d%%" % int(clampf(launch_ratio, 0.0, 1.5) * 100.0)
	if launch_ratio >= 1.0:
		launch_text += "  [ESCAPE READY]"
		(stat_fills.launch as ColorRect).color = Color(0.4, 0.9, 1.0)
	else:
		(stat_fills.launch as ColorRect).color = Color(0.95, 0.65, 0.25)
	_fill("launch", launch_text, launch_ratio)
	status.text = "Dimensions: %.2f m long · %.2f m wide · %.2f m tall. Point the front nose forward." % [
		float(stats.length), float(stats.width), float(stats.height)
	]
	for button in pattern_buttons:
		var on := int(button.get_meta("pattern")) == GameState.pattern_id
		button.modulate = Color(1, 0.92, 0.5) if on else Color.WHITE
	_sync_start()

func _fill(key: String, text: String, ratio: float) -> void:
	(stat_labels[key] as Label).text = text
	var fill := stat_fills[key] as ColorRect
	fill.anchor_right = clampf(ratio, 0.02, 1.0)

func _sync_start() -> void:
	if GameState.mode == "roguelite":
		start_button.text = "Start Roguelite Race"
	else:
		start_button.text = "Start Arcade Race"

func _start() -> void:
	Perf.start_transition("GARAGE", "RACE")
	Perf.mark("GARAGE", "Start clicked, requesting track")
	MeshPrep.request_track(str(GameState.mode), int(GameState.run_seed))
	Perf.mark("GARAGE", "request_track finished, calling change_scene_to_file(race)")
	get_tree().change_scene_to_file("res://scenes/race.tscn")

func _on_car_changed(ok: bool, message: String) -> void:
	status.text = message
	if ok:
		_refresh()
