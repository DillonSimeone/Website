class_name RaceHud
extends Node

signal picked(index: int)

var speed_label: Label
var unit_label: Label
var title_chip: Label
var clock_label: Label
var sub_label: Label
var boost_fill: ColorRect
var launch_wrap: Control
var launch_fill: ColorRect
var launch_label: Label
var progress_fill: ColorRect
var health_fill: ColorRect
var health_wrap: Control
var popup_box: VBoxContainer
var modal: CenterContainer
var card_row: HBoxContainer
var result_box: VBoxContainer
var title_label: Label
var boot: Control
var boot_label: Label
var map: MiniMap
var nitro_row: HBoxContainer

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	var layer := CanvasLayer.new()
	layer.process_mode = Node.PROCESS_MODE_ALWAYS
	add_child(layer)
	var root := Control.new()
	root.theme = UiStyle.theme()
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	UiStyle.full(root)
	layer.add_child(root)
	_top(root)
	_speed(root)
	_map(root)
	_launch(root)
	_popups(root)
	_modal(root)
	_boot(root)

func drive(data: Dictionary) -> void:
	speed_label.text = "%d" % int(data.get("speed", 0))
	title_chip.text = str(data.get("title", "RACE"))
	clock_label.text = str(data.get("clock", "00:00"))
	sub_label.text = str(data.get("sub", ""))
	progress_fill.anchor_right = clampf(float(data.get("progress", 0.0)), 0.0, 1.0)
	boost_fill.anchor_right = clampf(float(data.get("boost", 0.0)), 0.0, 1.0)
	var show_launch := bool(data.get("show_launch", false))
	launch_wrap.visible = show_launch
	if show_launch:
		var ratio := clampf(float(data.get("launch", 0.0)), 0.0, 1.5)
		launch_fill.anchor_right = clampf(ratio, 0.0, 1.0)
		launch_label.text = "LAUNCH  %d%%" % int(ratio * 100.0)
		launch_fill.color = Color(0.45, 0.9, 1.0) if ratio >= 1.0 else Color(1.0, 0.55, 0.2)
	health_wrap.visible = bool(data.get("show_health", false))
	if health_wrap.visible:
		health_fill.anchor_right = clampf(float(data.get("health", 1.0)), 0.0, 1.0)
	_pips(int(data.get("nitro", 0)))
	if data.has("points"):
		map.follow(data.points, data.get("player", Vector3.ZERO), data.get("heading", Vector3(0, 0, -1)))

func popup(text: String, color: Color) -> void:
	var label := Label.new()
	label.text = text
	label.modulate = color
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 26)
	popup_box.add_child(label)
	var tween := create_tween()
	tween.tween_interval(1.05)
	tween.tween_property(label, "modulate:a", 0.0, 0.25)
	tween.tween_callback(label.queue_free)

func set_boot(text: String, on: bool) -> void:
	boot.visible = on
	boot_label.text = text

func open_choices(title: String, choices: Array) -> void:
	_show(title)
	card_row.visible = true
	result_box.visible = false
	for child in card_row.get_children():
		child.queue_free()
	for i in choices.size():
		var entry: Dictionary = choices[i]
		var button := UiStyle.button("%s\n%s" % [entry.title, entry.detail], Vector2(240, 132))
		button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		var index := i
		button.pressed.connect(func() -> void:
			close()
			picked.emit(index)
		)
		card_row.add_child(button)

func open_actions(title: String, body: String, actions: Array) -> void:
	_show(title)
	card_row.visible = false
	result_box.visible = true
	for child in result_box.get_children():
		child.queue_free()
	if body != "":
		var label := Label.new()
		label.text = body
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		result_box.add_child(label)
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 12)
	result_box.add_child(row)
	for action in actions:
		var button := UiStyle.button(str(action[0]), Vector2(160, 48))
		button.pressed.connect(action[1])
		row.add_child(button)

func close() -> void:
	modal.visible = false

func _top(root: Control) -> void:
	var shell := _shell(root)
	shell.anchor_right = 1.0
	shell.offset_left = 220
	shell.offset_top = 16
	shell.offset_right = -210
	shell.offset_bottom = 44

	var inner := Control.new()
	inner.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	inner.size_flags_vertical = Control.SIZE_EXPAND_FILL
	shell.add_child(inner)

	var bg := ColorRect.new()
	bg.color = Color(1.0, 1.0, 1.0, 0.08)
	bg.anchor_right = 1.0
	bg.anchor_bottom = 1.0
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	inner.add_child(bg)

	progress_fill = ColorRect.new()
	progress_fill.color = Color(1.0, 0.62, 0.22)
	progress_fill.anchor_left = 0.0
	progress_fill.anchor_top = 0.0
	progress_fill.anchor_right = 0.0
	progress_fill.anchor_bottom = 1.0
	progress_fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	inner.add_child(progress_fill)

	title_chip = _ghost(root, 18, Vector2(18, 14), Vector2(200, 40))
	clock_label = _ghost(root, 18, Vector2(18, 44), Vector2(200, 28))
	clock_label.add_theme_color_override("font_color", Color(0.8, 0.82, 0.88))

func _speed(root: Control) -> void:
	var panel := _shell(root)
	panel.anchor_top = 1.0
	panel.anchor_bottom = 1.0
	panel.offset_left = 22
	panel.offset_top = -168
	panel.offset_right = 268
	panel.offset_bottom = -18
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 2)
	panel.add_child(col)
	speed_label = Label.new()
	speed_label.text = "0"
	speed_label.add_theme_font_size_override("font_size", 64)
	speed_label.add_theme_color_override("font_color", Color(1.0, 0.82, 0.38))
	col.add_child(speed_label)
	unit_label = Label.new()
	unit_label.text = "KM/H"
	unit_label.add_theme_font_size_override("font_size", 13)
	unit_label.add_theme_color_override("font_color", Color(0.78, 0.72, 0.6))
	col.add_child(unit_label)
	boost_fill = _named_bar(col, "BOOST", Color(0.35, 0.85, 1.0))
	health_wrap = Control.new()
	health_wrap.visible = false
	health_wrap.custom_minimum_size = Vector2(0, 28)
	col.add_child(health_wrap)
	var hlab := Label.new()
	hlab.text = "INTEGRITY"
	hlab.add_theme_font_size_override("font_size", 11)
	health_wrap.add_child(hlab)
	health_fill = _fill_on(_track(health_wrap, Vector2(0, 16)), Color(0.95, 0.35, 0.28))
	nitro_row = HBoxContainer.new()
	nitro_row.add_theme_constant_override("separation", 6)
	col.add_child(nitro_row)
	sub_label = Label.new()
	sub_label.add_theme_font_size_override("font_size", 13)
	sub_label.add_theme_color_override("font_color", Color(0.72, 0.74, 0.8))
	sub_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(sub_label)

func _map(root: Control) -> void:
	var panel := _shell(root)
	panel.anchor_left = 1.0
	panel.anchor_right = 1.0
	panel.offset_left = -196
	panel.offset_top = 16
	panel.offset_right = -16
	panel.offset_bottom = 196
	map = MiniMap.new()
	UiStyle.full(map)
	panel.add_child(map)
	var hint := _ghost(root, 13, Vector2(-18, -36), Vector2(420, 24))
	hint.anchor_left = 1.0
	hint.anchor_top = 1.0
	hint.anchor_right = 1.0
	hint.anchor_bottom = 1.0
	hint.offset_left = -430
	hint.offset_top = -34
	hint.offset_right = -18
	hint.offset_bottom = -12
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	hint.add_theme_color_override("font_color", Color(0.62, 0.64, 0.7, 0.8))
	hint.text = "WASD drive   Shift boost   R respawn   Esc pause"

func _launch(root: Control) -> void:
	launch_wrap = _shell(root)
	launch_wrap.visible = false
	launch_wrap.anchor_left = 0.5
	launch_wrap.anchor_right = 0.5
	launch_wrap.anchor_top = 1.0
	launch_wrap.anchor_bottom = 1.0
	launch_wrap.offset_left = -170
	launch_wrap.offset_right = 170
	launch_wrap.offset_top = -92
	launch_wrap.offset_bottom = -48
	var col := VBoxContainer.new()
	launch_wrap.add_child(col)
	launch_label = Label.new()
	launch_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	launch_label.add_theme_font_size_override("font_size", 18)
	col.add_child(launch_label)
	launch_fill = _fill_on(_track(col), Color(0.45, 0.9, 1.0))

func _boot(root: Control) -> void:
	boot = ColorRect.new()
	boot.color = Color(0.05, 0.04, 0.07, 0.55)
	boot.visible = false
	boot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	UiStyle.full(boot)
	root.add_child(boot)
	boot_label = Label.new()
	boot_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	boot_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	boot_label.add_theme_font_size_override("font_size", 28)
	boot_label.add_theme_color_override("font_color", Color(1.0, 0.78, 0.36))
	UiStyle.full(boot_label)
	boot.add_child(boot_label)

func _popups(root: Control) -> void:
	popup_box = VBoxContainer.new()
	popup_box.anchor_left = 0.5
	popup_box.anchor_right = 0.5
	popup_box.offset_left = -200
	popup_box.offset_right = 200
	popup_box.offset_top = 56
	popup_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(popup_box)

func _modal(root: Control) -> void:
	modal = CenterContainer.new()
	UiStyle.full(modal)
	modal.visible = false
	modal.mouse_filter = Control.MOUSE_FILTER_STOP
	root.add_child(modal)
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _style())
	modal.add_child(panel)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 14)
	panel.add_child(col)
	title_label = Label.new()
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_label.add_theme_font_size_override("font_size", 30)
	title_label.add_theme_color_override("font_color", Color(1.0, 0.78, 0.36))
	col.add_child(title_label)
	card_row = HBoxContainer.new()
	card_row.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_child(card_row)
	result_box = VBoxContainer.new()
	result_box.visible = false
	col.add_child(result_box)

func _show(title: String) -> void:
	modal.visible = true
	title_label.text = title

func _pips(count: int) -> void:
	while nitro_row.get_child_count() < count:
		var pip := ColorRect.new()
		pip.custom_minimum_size = Vector2(16, 10)
		pip.color = Color(0.4, 0.85, 1.0)
		nitro_row.add_child(pip)
	while nitro_row.get_child_count() > count:
		nitro_row.get_child(nitro_row.get_child_count() - 1).queue_free()

func _shell(root: Control) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_theme_stylebox_override("panel", _style())
	root.add_child(panel)
	return panel

func _ghost(root: Control, size: int, pos: Vector2, box: Vector2) -> Label:
	var label := Label.new()
	label.position = pos
	label.size = box
	label.add_theme_font_size_override("font_size", size)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(label)
	return label

func _named_bar(parent: Control, caption: String, color: Color) -> ColorRect:
	var wrap := VBoxContainer.new()
	wrap.add_theme_constant_override("separation", 2)
	parent.add_child(wrap)
	var label := Label.new()
	label.text = caption
	label.add_theme_font_size_override("font_size", 11)
	wrap.add_child(label)
	return _fill_on(_track(wrap), color)

func _track(parent: Control, extra := Vector2.ZERO) -> ColorRect:
	var track := ColorRect.new()
	track.custom_minimum_size = Vector2(0, 10)
	track.color = Color(1, 1, 1, 0.08)
	track.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if extra != Vector2.ZERO:
		track.position = extra
		track.size = Vector2(220, 10)
	parent.add_child(track)
	return track

func _fill_on(track: Control, color: Color) -> ColorRect:
	var fill := ColorRect.new()
	fill.color = color
	fill.anchor_right = 0.0
	fill.anchor_bottom = 1.0
	fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	track.add_child(fill)
	return fill

func _style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.05, 0.045, 0.07, 0.78)
	style.border_color = Color(0.95, 0.62, 0.22, 0.85)
	style.set_border_width_all(1)
	style.set_corner_radius_all(10)
	style.set_content_margin_all(10)
	return style
