class_name TrackLayouts
extends RefCounted

const SOLID := 1
const LIP := 2
const FINISH := 4
const GAP := 8
const RAMP := 32
const GATE := 64
const TUNNEL_TAG := 128
const BRIDGE_TAG := 256

enum CellType {
	START,
	STRAIGHT,
	TURN_LEFT,
	TURN_RIGHT,
	CHICANE,
	TUNNEL,
	BRIDGE,
	STAR_RAMP
}

static func build(mode: String, seed_value: int) -> Dictionary:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value if mode == "roguelite" else 1

	var cell_plan: Array[int] = []
	if mode == "arcade":
		cell_plan = [
			CellType.START,
			CellType.STRAIGHT,
			CellType.TURN_RIGHT,
			CellType.TUNNEL,
			CellType.TURN_LEFT,
			CellType.BRIDGE,
			CellType.CHICANE,
			CellType.TURN_LEFT,
			CellType.STRAIGHT,
			CellType.TURN_RIGHT,
			CellType.STAR_RAMP
		]
	else:
		cell_plan.append(CellType.START)
		var yaw_state := 0 # -1 = -45 deg, 0 = 0 deg, +1 = +45 deg
		var count := 8 + (seed_value % 4)

		for i in count:
			var choices: Array[int] = []
			if yaw_state == 0:
				choices = [
					CellType.STRAIGHT,
					CellType.TUNNEL,
					CellType.BRIDGE,
					CellType.CHICANE,
					CellType.TURN_LEFT,
					CellType.TURN_RIGHT
				]
			elif yaw_state > 0:
				# Heading right; only straight or turn back left
				choices = [
					CellType.STRAIGHT,
					CellType.TUNNEL,
					CellType.BRIDGE,
					CellType.TURN_LEFT,
					CellType.TURN_LEFT
				]
			else:
				# Heading left; only straight or turn back right
				choices = [
					CellType.STRAIGHT,
					CellType.TUNNEL,
					CellType.BRIDGE,
					CellType.TURN_RIGHT,
					CellType.TURN_RIGHT
				]
			var pick: int = choices[rng.randi() % choices.size()]
			cell_plan.append(pick)
			if pick == CellType.TURN_LEFT:
				yaw_state -= 1
			elif pick == CellType.TURN_RIGHT:
				yaw_state += 1

		# If still turned, straighten out before the launch ramp
		if yaw_state > 0:
			cell_plan.append(CellType.TURN_LEFT)
		elif yaw_state < 0:
			cell_plan.append(CellType.TURN_RIGHT)

		cell_plan.append(CellType.STAR_RAMP)

	var points := PackedVector3Array()
	var tags := PackedInt32Array()
	var widths := PackedFloat32Array()

	var cur_pos := Vector3.ZERO
	var cur_yaw := 0.0 # 0 = forward along -Z
	var cur_h := 0.0

	for c_idx in cell_plan.size():
		var type := cell_plan[c_idx]

		var step_pts: Array[Vector3] = []
		var step_tags: Array[int] = []
		var step_w: Array[float] = []

		match type:
			CellType.START:
				var count := 16
				var dist := 3.8
				for i in count:
					var p := cur_pos + _dir(cur_yaw) * (float(i) * dist)
					p.y = cur_h
					step_pts.append(p)
					step_tags.append(SOLID)
					step_w.append(11.0)
				cur_pos = step_pts[step_pts.size() - 1]

			CellType.STRAIGHT:
				var count := 18
				var dist := 3.8
				for i in range(1, count + 1):
					var p := cur_pos + _dir(cur_yaw) * (float(i) * dist)
					p.y = cur_h
					step_pts.append(p)
					step_tags.append(SOLID)
					step_w.append(11.0)
				cur_pos = step_pts[step_pts.size() - 1]

			CellType.TURN_LEFT:
				var arc_deg := 45.0
				var radius := 72.0
				var count := 14
				var d_theta := deg_to_rad(arc_deg) / float(count)
				for i in range(1, count + 1):
					cur_yaw += d_theta
					cur_pos += _dir(cur_yaw) * (radius * d_theta)
					cur_pos.y = cur_h
					step_pts.append(cur_pos)
					step_tags.append(SOLID)
					step_w.append(11.0)

			CellType.TURN_RIGHT:
				var arc_deg := 45.0
				var radius := 72.0
				var count := 14
				var d_theta := deg_to_rad(arc_deg) / float(count)
				for i in range(1, count + 1):
					cur_yaw -= d_theta
					cur_pos += _dir(cur_yaw) * (radius * d_theta)
					cur_pos.y = cur_h
					step_pts.append(cur_pos)
					step_tags.append(SOLID)
					step_w.append(11.0)

			CellType.CHICANE:
				var count := 18
				var dist := 3.6
				for i in range(1, count + 1):
					var t := float(i) / float(count)
					var lateral_offset := sin(t * TAU) * 3.8
					var right_vec := _dir(cur_yaw).cross(Vector3.UP).normalized()
					var forward_step := _dir(cur_yaw) * (float(i) * dist)
					var p := cur_pos + forward_step + right_vec * lateral_offset
					p.y = cur_h
					step_pts.append(p)
					step_tags.append(SOLID | GATE)
					step_w.append(11.0)
				cur_pos = cur_pos + _dir(cur_yaw) * (float(count) * dist)

			CellType.TUNNEL:
				var count := 20
				var dist := 3.8
				for i in range(1, count + 1):
					var p := cur_pos + _dir(cur_yaw) * (float(i) * dist)
					p.y = cur_h
					step_pts.append(p)
					step_tags.append(SOLID | TUNNEL_TAG)
					step_w.append(11.0)
				cur_pos = step_pts[step_pts.size() - 1]

			CellType.BRIDGE:
				var count := 22
				var dist := 3.8
				var rise := 7.0
				for i in range(1, count + 1):
					var t := float(i) / float(count)
					var p := cur_pos + _dir(cur_yaw) * (float(i) * dist)
					# Smooth arch elevation that returns exactly to 0.0 at the end
					p.y = cur_h + sin(t * PI) * rise
					step_pts.append(p)
					step_tags.append(SOLID | BRIDGE_TAG)
					step_w.append(11.0)
				cur_pos = step_pts[step_pts.size() - 1]

			CellType.STAR_RAMP:
				var count := 24
				var dist := 3.8
				for i in range(1, count + 1):
					var t := float(i) / float(count)
					var p := cur_pos + _dir(cur_yaw) * (float(i) * dist)
					# Parabolic ascent ramp into the stars
					p.y = cur_h + t * t * 26.0
					var tag := SOLID | RAMP
					if t > 0.72:
						tag |= LIP
					if i >= count - 1:
						tag |= FINISH
					step_pts.append(p)
					step_tags.append(tag)
					step_w.append(lerpf(11.0, 18.0, t))
				cur_pos = step_pts[step_pts.size() - 1]

		for j in step_pts.size():
			points.append(step_pts[j])
			tags.append(step_tags[j])
			widths.append(step_w[j])

	return {
		"points": points,
		"tags": tags,
		"widths": widths,
	}

static func _dir(yaw_rad: float) -> Vector3:
	return Vector3(-sin(yaw_rad), 0.0, -cos(yaw_rad)).normalized()
