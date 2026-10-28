class_name VehicleLook
extends RefCounted

const PATTERNS: Array[Dictionary] = [
	{"name": "Solid", "animated": false},
	{"name": "Checkers", "animated": false},
	{"name": "Racing stripes", "animated": false},
	{"name": "Carbon", "animated": false},
	{"name": "Scales", "animated": false},
	{"name": "Camo", "animated": false},
	{"name": "Scrolling stripes", "animated": true},
	{"name": "Pulse", "animated": true},
	{"name": "Plasma", "animated": true},
	{"name": "Hologram", "animated": true},
	{"name": "Flame lick", "animated": true},
	{"name": "Scanlines", "animated": true},
]

const COLORS: Array[Color] = [
	Color(0.95, 0.18, 0.15), # Mario Red
	Color(0.15, 0.55, 0.98), # Toad Blue
	Color(0.18, 0.85, 0.25), # Luigi Green
	Color(1.0, 0.88, 0.18),  # Wario Yellow
	Color(0.98, 0.42, 0.72), # Peach Pink
	Color(0.98, 0.52, 0.12), # Bowser Orange
	Color(0.65, 0.22, 0.92), # Waluigi Purple
	Color(0.95, 0.96, 0.98), # Silver / White
]

static var _textures: Dictionary = {}

static func material(color: Color, pattern_id: int) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.25
	mat.metallic = 0.08
	mat.specular_mode = BaseMaterial3D.SPECULAR_SCHLICK_GGX

	mat.emission_enabled = true # Keep emission enabled across all patterns to prevent ANGLE shader re-compilation stalls
	mat.emission = Color.BLACK
	mat.emission_energy_multiplier = 0.0

	var tex: Texture2D = _get_pattern_texture(pattern_id)
	if tex:
		mat.albedo_texture = tex
		mat.uv1_scale = Vector3(2.0, 2.0, 2.0)

	# Special emission for animated / hologram patterns (uniform update only, 0ms stall)
	if pattern_id == 6 or pattern_id == 9: # Scrolling / Hologram
		mat.emission = Color(0.3, 0.75, 1.0)
		mat.emission_energy_multiplier = 0.8
	elif pattern_id == 10: # Flame
		mat.emission = Color(1.0, 0.45, 0.1)
		mat.emission_energy_multiplier = 0.8
	elif pattern_id == 7: # Pulse
		mat.emission = color * 0.6
		mat.emission_energy_multiplier = 1.0

	return mat

static func _get_pattern_texture(id: int) -> Texture2D:
	if id == 0:
		return null
	if _textures.has(id):
		return _textures[id]

	var size := 32
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)

	match id:
		1: # Checkers
			for y in size:
				for x in size:
					var c := 1.0 if ((x / 8) % 2 == (y / 8) % 2) else 0.45
					img.set_pixel(x, y, Color(c, c, c, 1.0))
		2: # Racing stripes
			for y in size:
				for x in size:
					var dist := absf(float(x) - float(size) * 0.5)
					var c := 1.0 if (dist >= 3.0 and dist <= 7.0) else 0.45
					img.set_pixel(x, y, Color(c, c, c, 1.0))
		3: # Carbon
			for y in size:
				for x in size:
					var c := 0.8 if ((x % 4 < 2) != (y % 4 < 2)) else 0.35
					img.set_pixel(x, y, Color(c, c, c, 1.0))
		4: # Scales / Hex
			for y in size:
				for x in size:
					var d := fposmod(float(x * 2 + y), 8.0)
					var c := 0.9 if d < 4.0 else 0.4
					img.set_pixel(x, y, Color(c, c, c, 1.0))
		5: # Camo
			for y in size:
				for x in size:
					var v := sin(float(x) * 0.3) * cos(float(y) * 0.3)
					var c := 0.9 if v > 0.1 else (0.6 if v > -0.2 else 0.35)
					img.set_pixel(x, y, Color(c, c, c, 1.0))
		6: # Scrolling stripes
			for y in size:
				for x in size:
					var c := 0.95 if (y % 8 < 3) else 0.4
					img.set_pixel(x, y, Color(c, c, c, 1.0))
		7: # Pulse
			for y in size:
				for x in size:
					var d := Vector2(x - 16, y - 16).length() / 16.0
					var c := clampf(1.0 - d * 0.5, 0.4, 1.0)
					img.set_pixel(x, y, Color(c, c, c, 1.0))
		8: # Plasma
			for y in size:
				for x in size:
					var v := (sin(float(x) * 0.25) + cos(float(y) * 0.25)) * 0.5 + 0.5
					img.set_pixel(x, y, Color(v, v * 0.8 + 0.2, 1.0, 1.0))
		9: # Hologram scanlines
			for y in size:
				for x in size:
					var c := 0.95 if (y % 4 < 2) else 0.5
					img.set_pixel(x, y, Color(c * 0.6, c * 0.9, c, 1.0))
		10: # Flame
			for y in size:
				for x in size:
					var v := clampf(float(y) / float(size), 0.2, 1.0)
					img.set_pixel(x, y, Color(1.0, v * 0.8, 0.2, 1.0))
		11: # Scanlines
			for y in size:
				for x in size:
					var c := 0.9 if (y % 2 == 0) else 0.35
					img.set_pixel(x, y, Color(c, c, c, 1.0))
		_:
			for y in size:
				for x in size:
					img.set_pixel(x, y, Color(1, 1, 1, 1))

	var tex := ImageTexture.create_from_image(img)
	_textures[id] = tex
	return tex
