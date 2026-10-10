class_name MiniMap
extends Control

var points: PackedVector3Array = PackedVector3Array()
var player := Vector3.ZERO
var heading := Vector3(0, 0, -1)

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = Vector2(168, 168)

func follow(next_points: PackedVector3Array, at: Vector3, dir: Vector3) -> void:
	points = next_points
	player = at
	heading = dir
	queue_redraw()

func _draw() -> void:
	var rect := Rect2(Vector2.ZERO, size)
	draw_rect(rect, Color(0.04, 0.035, 0.06, 0.72))
	draw_rect(rect, Color(1.0, 0.62, 0.22, 0.55), false, 1.5)
	if points.size() < 2:
		return
	var mn := Vector2(INF, INF)
	var mx := Vector2(-INF, -INF)
	for p in points:
		mn.x = minf(mn.x, p.x)
		mn.y = minf(mn.y, p.z)
		mx.x = maxf(mx.x, p.x)
		mx.y = maxf(mx.y, p.z)
	var pad := 14.0
	var span := Vector2(maxf(mx.x - mn.x, 8.0), maxf(mx.y - mn.y, 8.0))
	var poly := PackedVector2Array()
	for p in points:
		poly.append(Vector2(
			pad + (p.x - mn.x) / span.x * (size.x - pad * 2.0),
			pad + (p.z - mn.y) / span.y * (size.y - pad * 2.0)
		))
	if poly.size() >= 2:
		draw_polyline(poly, Color(1.0, 0.7, 0.28, 0.9), 2.4, true)
	var me := Vector2(
		pad + (player.x - mn.x) / span.x * (size.x - pad * 2.0),
		pad + (player.z - mn.y) / span.y * (size.y - pad * 2.0)
	)
	var nose := Vector2(heading.x, heading.z)
	if nose.length() > 0.05:
		nose = nose.normalized() * 10.0
		draw_line(me, me + Vector2(nose.x, nose.y), Color(0.55, 0.85, 1.0), 2.0)
	draw_circle(me, 4.5, Color(1.0, 0.9, 0.4))
