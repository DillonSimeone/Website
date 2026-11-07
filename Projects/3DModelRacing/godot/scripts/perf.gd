class_name Perf
extends RefCounted

static var _last_ms := 0
static var _scene_start_ms := 0
static var _scene_name := ""
static var last_summary := ""
static var _log_lines: Array[String] = []

static func start_transition(from_scene: String, to_scene: String) -> void:
	var now := Time.get_ticks_msec()
	_scene_start_ms = now
	_last_ms = now
	_scene_name = "%s -> %s" % [from_scene, to_scene]
	var line := "[PERF:START] %s initiated at %d ms" % [_scene_name, now]
	print(line)
	_log_lines.append(line)

static func mark(tag: String, detail: String = "") -> void:
	var now := Time.get_ticks_msec()
	var step_delta := now - _last_ms if _last_ms > 0 else 0
	var total_delta := now - _scene_start_ms if _scene_start_ms > 0 else 0
	_last_ms = now
	var line := "[PERF +%4dms | tot %5dms] [%s] %s" % [step_delta, total_delta, tag, detail]
	print(line)
	_log_lines.append(line)
	if _log_lines.size() > 60:
		_log_lines.pop_front()

static func finish_transition(target_name: String) -> String:
	var now := Time.get_ticks_msec()
	var total := now - _scene_start_ms if _scene_start_ms > 0 else 0
	last_summary = "%s loaded in %d ms" % [target_name, total]
	mark(target_name, "READY & INTERACTIVE (total load: %d ms)" % total)
	return last_summary
