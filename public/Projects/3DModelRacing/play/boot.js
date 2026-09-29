const engine = new Engine(GODOT_CONFIG);

(function () {
	const statusOverlay = document.getElementById("status");
	const statusProgress = document.getElementById("status-progress");
	const statusNotice = document.getElementById("status-notice");
	let initializing = true;
	let statusMode = "";

	if (GODOT_CONFIG) {
		GODOT_CONFIG.ensureCrossOriginIsolationHeaders = false;
	}

	function setStatusMode(mode) {
		if (statusMode === mode || !initializing) {
			return;
		}
		if (mode === "hidden") {
			statusOverlay.remove();
			initializing = false;
			return;
		}
		statusOverlay.style.visibility = "visible";
		statusProgress.style.display = mode === "progress" ? "block" : "none";
		statusNotice.style.display = mode === "notice" ? "block" : "none";
		statusMode = mode;
	}

	function setStatusNotice(text) {
		statusNotice.textContent = text;
	}

	function displayFailureNotice(err) {
		console.error(err);
		const message = err instanceof Error ? err.message : (typeof err === "string" ? err : "An unknown error occurred.");
		setStatusNotice(message);
		setStatusMode("notice");
		initializing = false;
	}

	const missing = Engine.getMissingFeatures({
		threads: GODOT_THREADS_ENABLED,
	});

	if (missing.length !== 0) {
		displayFailureNotice("This browser is missing features required to run the game:\n" + missing.join("\n"));
		return;
	}

	setStatusMode("progress");
	engine.startGame({
		onProgress: function (current, total) {
			if (current > 0 && total > 0) {
				statusProgress.value = current;
				statusProgress.max = total;
			}
		},
	}).then(function () {
		setStatusMode("hidden");
	}, displayFailureNotice);
}());
