class_name SvgPath
extends RefCounted

static func sample(d: String, spacing: float) -> PackedVector2Array:
	var tokens := _tokenize(d)
	var out := PackedVector2Array()
	var i := 0
	var pen := Vector2.ZERO
	var start := Vector2.ZERO
	var cmd := ""
	while i < tokens.size():
		var tok := str(tokens[i])
		if tok.length() == 1 and _is_cmd(tok):
			cmd = tok
			i += 1
			if cmd.to_upper() == "Z":
				_line(out, pen, start, spacing)
				pen = start
			continue
		if cmd == "":
			i += 1
			continue
		var rel := cmd == cmd.to_lower()
		match cmd.to_upper():
			"M":
				pen = _xy(tokens, i, pen, rel)
				i += 2
				start = pen
				_push(out, pen, spacing)
				cmd = "l" if rel else "L"
			"L":
				var point := _xy(tokens, i, pen, rel)
				i += 2
				_line(out, pen, point, spacing)
				pen = point
			"H":
				var x := float(tokens[i])
				i += 1
				var point := Vector2(pen.x + x if rel else x, pen.y)
				_line(out, pen, point, spacing)
				pen = point
			"V":
				var y := float(tokens[i])
				i += 1
				var point := Vector2(pen.x, pen.y + y if rel else y)
				_line(out, pen, point, spacing)
				pen = point
			"C":
				var c1 := _xy(tokens, i, pen, rel)
				var c2 := _xy(tokens, i + 2, pen, rel)
				var point := _xy(tokens, i + 4, pen, rel)
				i += 6
				_curve(out, pen, c1, c2, point, spacing, true)
				pen = point
			"Q":
				var c1 := _xy(tokens, i, pen, rel)
				var point := _xy(tokens, i + 2, pen, rel)
				i += 4
				_curve(out, pen, c1, c1, point, spacing, false)
				pen = point
			_:
				i += 1
	if out.is_empty() or out[out.size() - 1].distance_to(pen) > 0.05:
		out.append(pen)
	return out

static func _curve(out: PackedVector2Array, p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2, spacing: float, cubic: bool) -> void:
	var rough := p0.distance_to(p1) + p1.distance_to(p2) + p2.distance_to(p3)
	var steps := maxi(2, int(rough / maxf(spacing * 0.45, 0.2)))
	for s in steps:
		var t := float(s + 1) / float(steps)
		var u := 1.0 - t
		var point := u * u * p0 + 2.0 * u * t * p1 + t * t * p3
		if cubic:
			point = u * u * u * p0 + 3.0 * u * u * t * p1 + 3.0 * u * t * t * p2 + t * t * t * p3
		_push(out, point, spacing)

static func _line(out: PackedVector2Array, a: Vector2, b: Vector2, spacing: float) -> void:
	var dist := a.distance_to(b)
	var steps := maxi(1, int(ceil(dist / maxf(spacing, 0.2))))
	for s in steps:
		_push(out, a.lerp(b, float(s + 1) / float(steps)), spacing)

static func _push(out: PackedVector2Array, point: Vector2, spacing: float) -> void:
	if out.is_empty() or out[out.size() - 1].distance_to(point) >= spacing * 0.72:
		out.append(point)

static func _xy(tokens: PackedStringArray, index: int, pen: Vector2, rel: bool) -> Vector2:
	var point := Vector2(float(tokens[index]), float(tokens[index + 1]))
	return pen + point if rel else point

static func _is_cmd(tok: String) -> bool:
	return "MmLlHhVvCcQqZz".contains(tok)

static func _tokenize(d: String) -> PackedStringArray:
	var out := PackedStringArray()
	var i := 0
	var n := d.length()
	while i < n:
		var c := d[i]
		if c == " " or c == "," or c == "\n" or c == "\t" or c == "\r":
			i += 1
			continue
		if (c >= "A" and c <= "Z") or (c >= "a" and c <= "z"):
			out.append(c)
			i += 1
			continue
		var j := i
		if d[j] == "-" or d[j] == "+":
			j += 1
		var dot := false
		while j < n:
			var ch := d[j]
			if ch >= "0" and ch <= "9":
				j += 1
			elif ch == "." and not dot:
				dot = true
				j += 1
			else:
				break
		if j == i:
			i += 1
		else:
			out.append(d.substr(i, j - i))
			i = j
	return out
