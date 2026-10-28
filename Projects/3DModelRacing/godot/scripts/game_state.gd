extends Node

const Perf = preload("res://scripts/perf.gd")

signal car_changed(ok: bool, message: String)

var mesh: ArrayMesh
var euler_deg := Vector3.ZERO
var color := Color(0.92, 0.28, 0.16)
var pattern_id := 6
var mode := "arcade"
var run_seed := 1
var car_revision := 0
var meta := {
	"runs": 0,
	"ascents": 0,
	"best_launch": 0.0,
	"best_xp": 0,
	"best_distance": 0.0,
}

var _js_hook: JavaScriptObject
var _web_ready := false

func _ready() -> void:
	_bind_input()
	_load_meta()
	_load_car()
	_install_web_picker()

func _bind_input() -> void:
	_action("throttle", [KEY_W, KEY_UP])
	_action("brake", [KEY_S, KEY_DOWN])
	_action("left", [KEY_A, KEY_LEFT])
	_action("right", [KEY_D, KEY_RIGHT])
	_action("boost", [KEY_SHIFT])
	_action("respawn", [KEY_R])
	_action("pause", [KEY_ESCAPE])

func _action(action: String, keys: Array) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action, 0.2)
	for key in keys:
		var event := InputEventKey.new()
		event.physical_keycode = key
		var exists := false
		for old in InputMap.action_get_events(action):
			if old is InputEventKey and (old as InputEventKey).physical_keycode == key:
				exists = true
		if not exists:
			InputMap.action_add_event(action, event)

func current_bake() -> Dictionary:
	if mesh == null:
		mesh = MeshFactory.default_vehicle()
	return MeshFactory.bake_oriented(mesh, euler_deg)

func import_bytes(file_name: String, bytes: PackedByteArray) -> void:
	var result := MeshImporter.load_bytes(file_name, bytes)
	if result.has("error"):
		car_changed.emit(false, str(result.error))
		return
	mesh = result.mesh
	euler_deg = Vector3.ZERO
	car_revision += 1
	_save_car()
	car_changed.emit(true, "Loaded %s (%d tris)" % [file_name.get_file(), int(result.get("tris", 0))])

func reset_car() -> void:
	mesh = MeshFactory.default_vehicle()
	euler_deg = Vector3.ZERO
	color = Color(0.92, 0.28, 0.16)
	pattern_id = 6
	car_revision += 1
	_save_car()
	car_changed.emit(true, "Back to the default wedge.")

func set_rotation(next_euler: Vector3) -> void:
	euler_deg = next_euler
	car_revision += 1
	_save_cfg()

func set_look(next_color: Color, next_pattern: int) -> void:
	color = next_color
	pattern_id = next_pattern
	_save_cfg()

func record_result(kind: String, energy: float, xp: int, distance: float) -> void:
	meta.runs = int(meta.get("runs", 0)) + 1
	if kind == "Ascended":
		meta.ascents = int(meta.get("ascents", 0)) + 1
		meta.best_launch = maxf(float(meta.get("best_launch", 0.0)), energy)
	meta.best_xp = maxi(int(meta.get("best_xp", 0)), xp)
	meta.best_distance = maxf(float(meta.get("best_distance", 0.0)), distance)
	_save_meta()

func career_text() -> String:
	return "Runs %d   Ascents %d   Best launch %.0f   Best XP %d   Best distance %.0f m" % [
		int(meta.get("runs", 0)),
		int(meta.get("ascents", 0)),
		float(meta.get("best_launch", 0.0)),
		int(meta.get("best_xp", 0)),
		float(meta.get("best_distance", 0.0)),
	]

func _load_car() -> void:
	var t0 := Time.get_ticks_msec()
	if ResourceLoader.exists("user://car.res"):
		var res: Resource = ResourceLoader.load("user://car.res")
		if res is ArrayMesh:
			mesh = res
	if mesh == null:
		mesh = MeshFactory.default_vehicle()
	var tri_count := 0
	if mesh:
		for s in mesh.get_surface_count():
			var arrays: Array = mesh.surface_get_arrays(s)
			if arrays.size() > Mesh.ARRAY_INDEX and arrays[Mesh.ARRAY_INDEX] != null:
				tri_count += (arrays[Mesh.ARRAY_INDEX] as PackedInt32Array).size() / 3
			elif arrays.size() > Mesh.ARRAY_VERTEX:
				tri_count += (arrays[Mesh.ARRAY_VERTEX] as PackedVector3Array).size() / 3
	Perf.mark("STATE", "_load_car took %d ms (%d tris)" % [Time.get_ticks_msec() - t0, tri_count])
	var cfg := ConfigFile.new()
	if cfg.load("user://car.cfg") == OK:
		euler_deg = cfg.get_value("car", "euler", Vector3.ZERO)
		color = cfg.get_value("car", "color", color)
		pattern_id = int(cfg.get_value("car", "pattern", pattern_id))

func _save_car() -> void:
	if mesh:
		ResourceSaver.save(mesh, "user://car.res")
	_save_cfg()

func _save_cfg() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("car", "euler", euler_deg)
	cfg.set_value("car", "color", color)
	cfg.set_value("car", "pattern", pattern_id)
	cfg.save("user://car.cfg")

func _load_meta() -> void:
	var cfg := ConfigFile.new()
	if cfg.load("user://profile.cfg") != OK:
		return
	meta.runs = int(cfg.get_value("meta", "runs", 0))
	meta.ascents = int(cfg.get_value("meta", "ascents", 0))
	meta.best_launch = float(cfg.get_value("meta", "best_launch", 0.0))
	meta.best_xp = int(cfg.get_value("meta", "best_xp", 0))
	meta.best_distance = float(cfg.get_value("meta", "best_distance", 0.0))

func _save_meta() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("meta", "runs", int(meta.runs))
	cfg.set_value("meta", "ascents", int(meta.ascents))
	cfg.set_value("meta", "best_launch", float(meta.best_launch))
	cfg.set_value("meta", "best_xp", int(meta.best_xp))
	cfg.set_value("meta", "best_distance", float(meta.best_distance))
	cfg.save("user://profile.cfg")

func _install_web_picker() -> void:
	if not OS.has_feature("web") or _web_ready:
		return
	_web_ready = true
	_js_hook = JavaScriptBridge.create_callback(_on_web_file)
	var window := JavaScriptBridge.get_interface("window")
	window.godotReceiveMesh = _js_hook
	JavaScriptBridge.eval("""
		(function(){
			if (window.__meshPickerInstalled) return;
			window.__meshPickerInstalled = true;
			function send(file){
				if (!file) return;
				var reader = new FileReader();
				reader.onload = function(){
					var bytes = new Uint8Array(reader.result);
					var binary = '';
					var chunk = 8192;
					for (var i = 0; i < bytes.length; i += chunk){
						binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
					}
					if (window.godotReceiveMesh) window.godotReceiveMesh(file.name, btoa(binary));
				};
				reader.readAsArrayBuffer(file);
			}
			window.godotOpenMeshPicker = function(){
				var input = document.createElement('input');
				input.type = 'file';
				input.accept = '.stl,.obj,.glb,.gltf';
				input.onchange = function(e){ send(e.target.files[0]); };
				input.click();
			};
			window.addEventListener('dragover', function(e){ e.preventDefault(); });
			window.addEventListener('drop', function(e){
				e.preventDefault();
				if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length){
					send(e.dataTransfer.files[0]);
				}
			});
		})();
	""", true)

func open_file_picker(parent: Node) -> void:
	if OS.has_feature("web"):
		_install_web_picker()
		JavaScriptBridge.eval("window.godotOpenMeshPicker && window.godotOpenMeshPicker();", true)
		return
	var dialog := FileDialog.new()
	dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	dialog.access = FileDialog.ACCESS_FILESYSTEM
	dialog.filters = PackedStringArray(["*.stl, *.obj, *.glb, *.gltf ; 3D models"])
	dialog.file_selected.connect(func(path: String) -> void:
		var file := FileAccess.open(path, FileAccess.READ)
		if file == null:
			car_changed.emit(false, "Could not open that file.")
			return
		var bytes := file.get_buffer(file.get_length())
		file.close()
		import_bytes(path.get_file(), bytes)
	)
	parent.add_child(dialog)
	dialog.popup_centered_ratio(0.7)

func _on_web_file(args: Array) -> void:
	if args.size() < 2:
		return
	var file_name := str(args[0])
	var raw := Marshalls.base64_to_raw(str(args[1]))
	import_bytes(file_name, raw)
