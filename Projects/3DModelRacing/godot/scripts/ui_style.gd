class_name UiStyle
extends RefCounted

static func theme() -> Theme:
	var theme := Theme.new()
	theme.default_font_size = 18
	var normal := _box(Color(0.14, 0.15, 0.2), Color(0.95, 0.62, 0.22))
	var hover := _box(Color(0.22, 0.18, 0.12), Color(1.0, 0.78, 0.35))
	var pressed := _box(Color(0.32, 0.2, 0.08), Color(1.0, 0.84, 0.45))
	theme.set_stylebox("normal", "Button", normal)
	theme.set_stylebox("hover", "Button", hover)
	theme.set_stylebox("pressed", "Button", pressed)
	theme.set_stylebox("focus", "Button", hover)
	theme.set_color("font_color", "Button", Color(0.96, 0.94, 0.9))
	theme.set_color("font_hover_color", "Button", Color(1, 0.95, 0.85))
	theme.set_color("font_color", "Label", Color(0.94, 0.93, 0.9))
	return theme

static func _box(bg: Color, border: Color) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = bg
	box.border_color = border
	box.set_border_width_all(2)
	box.set_corner_radius_all(8)
	box.content_margin_left = 16
	box.content_margin_right = 16
	box.content_margin_top = 10
	box.content_margin_bottom = 10
	return box

static func full(node: Control) -> void:
	node.set_anchors_preset(Control.PRESET_FULL_RECT)
	node.offset_left = 0
	node.offset_top = 0
	node.offset_right = 0
	node.offset_bottom = 0

static func button(text: String, min_size: Vector2 = Vector2(260, 52)) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = min_size
	return button
