class_name Sfx
extends RefCounted

static var _cache: Dictionary = {}

static func blip(parent: Node, kind: String) -> void:
	if parent == null or not parent.is_inside_tree():
		return
	var player := AudioStreamPlayer.new()
	player.stream = _stream(kind)
	player.volume_db = -8.0
	parent.add_child(player)
	player.finished.connect(player.queue_free)
	player.play()

static func _stream(kind: String) -> AudioStreamWAV:
	if _cache.has(kind):
		return _cache[kind]
	var freq := 180.0
	var dur := 0.12
	match kind:
		"hit":
			freq = 90.0
			dur = 0.09
		"xp":
			freq = 520.0
			dur = 0.08
		"level":
			freq = 660.0
			dur = 0.16
		"launch":
			freq = 240.0
			dur = 0.45
		"wreck":
			freq = 70.0
			dur = 0.28
		_:
			pass
	var rate := 22050
	var count := int(rate * dur)
	var data := PackedByteArray()
	data.resize(count * 2)
	for i in count:
		var t := float(i) / float(rate)
		var env := 1.0 - (t / dur)
		var sample := sin(TAU * freq * t) * env
		if kind == "hit":
			sample = (randf() * 2.0 - 1.0) * env
		data.encode_s16(i * 2, int(clampf(sample, -1.0, 1.0) * 32000.0))
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = rate
	wav.stereo = false
	wav.data = data
	_cache[kind] = wav
	return wav
