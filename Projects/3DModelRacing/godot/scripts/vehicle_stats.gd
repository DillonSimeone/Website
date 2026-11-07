class_name VehicleStats
extends RefCounted

const MASS_PER_M3 := 1.6
const MASS_MIN := 0.45
const MASS_MAX := 7.5
const SPEED_BASE := 36.0
const DRAG_K := 0.45
const L_REF := 3.0
const ACCEL_BASE := 34.0
const GRIP_BASE := 6.5
const YAW_BASE := 2.2
const H_REF := 0.55
const W_REF := 1.2
const LAUNCH_ENERGY := 175.0
const LAUNCH_MIN_SPEED := 18.0

static func from_size(size: Vector3) -> Dictionary:
	var width := maxf(size.x, 0.05)
	var height := maxf(size.y, 0.05)
	var length := maxf(size.z, 0.05)
	var volume := length * width * height
	var frontal := width * height
	var mass := clampf(volume * MASS_PER_M3, MASS_MIN, MASS_MAX)
	var top_speed := SPEED_BASE * (length / L_REF) / (1.0 + DRAG_K * frontal)
	var accel := ACCEL_BASE / mass
	var grip := GRIP_BASE * (width / W_REF) * (H_REF / height)
	var yaw := YAW_BASE * (width / length) * (H_REF / height)
	var launch := (top_speed * top_speed) / mass
	return {
		"length": length,
		"width": width,
		"height": height,
		"mass": mass,
		"top_speed": top_speed,
		"accel": accel,
		"grip": grip,
		"yaw": yaw,
		"launch": launch,
		"frontal": frontal,
	}
