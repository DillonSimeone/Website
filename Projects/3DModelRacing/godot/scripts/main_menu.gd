extends Control

const Perf = preload("res://scripts/perf.gd")

func _ready() -> void:
	theme = UiStyle.theme()
	UiStyle.full(self)
	var bg := ColorRect.new()
	var backdrop := ShaderMaterial.new()
	backdrop.shader = load("res://assets/shaders/menu.gdshader")
	bg.material = backdrop
	UiStyle.full(bg)
	add_child(bg)

	var center := VBoxContainer.new()
	center.anchor_left = 0.5
	center.anchor_right = 0.5
	center.anchor_top = 0.5
	center.anchor_bottom = 0.5
	center.offset_left = -320
	center.offset_right = 320
	center.offset_top = -300
	center.offset_bottom = 300
	center.alignment = BoxContainer.ALIGNMENT_CENTER
	center.add_theme_constant_override("separation", 14)
	add_child(center)

	# Title with glow layer
	var title_box := Control.new()
	title_box.custom_minimum_size = Vector2(640, 68)
	center.add_child(title_box)
	var glow := Label.new()
	glow.text = "3D MODEL RACING"
	glow.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	glow.add_theme_font_size_override("font_size", 54)
	glow.add_theme_color_override("font_color", Color(1.0, 0.5, 0.12, 0.5))
	UiStyle.full(glow)
	title_box.add_child(glow)
	var title := Label.new()
	title.text = "3D MODEL RACING"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 54)
	title.add_theme_color_override("font_color", Color(1.0, 0.84, 0.42))
	UiStyle.full(title)
	title_box.add_child(title)

	var pulse := create_tween().set_loops()
	pulse.tween_property(glow, "modulate:a", 0.45, 1.8).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)
	pulse.tween_property(glow, "modulate:a", 1.0, 1.8).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)

	var sub := Label.new()
	sub.text = "Any mesh can race. The shape is the car."
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.add_theme_font_size_override("font_size", 17)
	sub.add_theme_color_override("font_color", Color(0.96, 0.92, 0.82))
	center.add_child(sub)

	var gap := Control.new()
	gap.custom_minimum_size = Vector2(0, 4)
	center.add_child(gap)

	# Mode 1: Arcade Card
	center.add_child(_mode_card(
		"Arcade race",
		"Fixed track  ·  Race to the star ramp",
		Color(1.0, 0.65, 0.25),
		func() -> void:
			Perf.start_transition("MENU", "GARAGE")
			Perf.mark("MENU", "Arcade button clicked")
			GameState.mode = "arcade"
			GameState.run_seed = 1
			MeshPrep.request_track("arcade", 1)
			Perf.mark("MENU", "request_track finished, calling change_scene_to_file(garage)")
			get_tree().change_scene_to_file("res://scenes/garage.tscn")
	))

	# Mode 2: Roguelite Card
	center.add_child(_mode_card(
		"Roguelite run",
		"Random track  ·  XP  ·  Level-ups  ·  Integrity",
		Color(0.35, 0.85, 1.0),
		func() -> void:
			Perf.start_transition("MENU", "GARAGE")
			Perf.mark("MENU", "Roguelite button clicked")
			GameState.mode = "roguelite"
			GameState.run_seed = randi()
			MeshPrep.request_track("roguelite", GameState.run_seed)
			Perf.mark("MENU", "request_track finished, calling change_scene_to_file(garage)")
			get_tree().change_scene_to_file("res://scenes/garage.tscn")
	))

	# Career panel
	var career_panel := PanelContainer.new()
	var c_style := StyleBoxFlat.new()
	c_style.bg_color = Color(0.06, 0.07, 0.12, 0.82)
	c_style.border_color = Color(0.35, 0.42, 0.58, 0.45)
	c_style.set_border_width_all(1)
	c_style.set_corner_radius_all(8)
	c_style.content_margin_left = 18
	c_style.content_margin_right = 18
	c_style.content_margin_top = 8
	c_style.content_margin_bottom = 8
	career_panel.add_theme_stylebox_override("panel", c_style)
	var career := Label.new()
	career.text = GameState.career_text()
	career.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	career.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	career.add_theme_font_size_override("font_size", 14)
	career.add_theme_color_override("font_color", Color(0.95, 0.95, 1.0))
	career_panel.add_child(career)
	center.add_child(career_panel)

	var help := Label.new()
	help.text = "Import STL, OBJ, or GLB. Long and light can take the star ramp off the world."
	help.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	help.add_theme_font_size_override("font_size", 14)
	help.add_theme_color_override("font_color", Color(0.85, 0.88, 0.96))
	center.add_child(help)

func _mode_card(title: String, desc: String, accent: Color, callback: Callable) -> PanelContainer:
	var panel := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.08, 0.08, 0.14, 0.88)
	style.border_color = Color(accent.r, accent.g, accent.b, 0.55)
	style.set_border_width_all(2)
	style.set_corner_radius_all(10)
	style.content_margin_left = 16
	style.content_margin_right = 16
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	panel.add_theme_stylebox_override("panel", style)

	var box := VBoxContainer.new()
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_theme_constant_override("separation", 6)
	panel.add_child(box)

	var btn := UiStyle.button(title, Vector2(380, 48))
	btn.pressed.connect(callback)
	box.add_child(btn)

	var lbl := Label.new()
	lbl.text = desc
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lbl.add_theme_font_size_override("font_size", 14)
	lbl.add_theme_color_override("font_color", Color(0.98, 0.92, 0.78))
	box.add_child(lbl)

	return panel
