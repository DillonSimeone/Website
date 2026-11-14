# 3D Model Racing — Agent Reference

## 0. Scoping Rules
- Confine all reads/writes to `public/Projects/3DModelRacing/`.
- Do NOT run `npm run build` or any Vite commands; Three.js runs natively via browser ES modules.
- Do NOT spawn browser subagents for testing.
- Provide numbered test-step plans for the user to verify in-browser.

---

## 1. Architecture & Pivot to Three.js

- **Engine**: Three.js r160 (ESM) loaded directly in browser.
- **Why Three.js**: Godot 4 single-threaded WebGL exports carry heavy WASM overhead and D3D11/ANGLE shader compilation stalls. Three.js delivers instant scene transitions (< 50ms), native V8 JIT performance, and stable 120 FPS.
- **Project Structure**:
```
3DModelRacing/
├── three.js/                   # ACTIVE Three.js project
│   ├── index.html              # Main HTML5 entry, HUD layout & compositor canvas overlay
│   ├── style.css               # Glassmorphism dark mode UI & hyperspace compositor styles
│   ├── configure/
│   │   └── grass.json          # Multi-ring grass configuration profiles & LOD parameters
│   ├── benchmark.html          # Headless automated 400-frame test harness
│   ├── run_benchmark.mjs       # Headless Puppeteer runner script
│   ├── RunBenchmark.bat        # CLI launcher for automated performance audits
│   ├── benchmark_report.md     # Performance telemetry & subsystem timings report
│   └── js/
│       ├── main.js             # State machine (Menu/Garage/Launch/Race), render loop, camera, loading compositor
│       ├── vehicle.js          # Unified Vehicle class for Player & NPC Rivals with hover physics, dynamic pitch & shadows
│       ├── vehicle_stats.js    # Bounding box physics calculations, live AABB & default Formula wedge
│       ├── model_loader.js     # STL / OBJ / GLB importer & canvas pattern generator
│       ├── road_streamer.js    # Infinite procedural C1 Hermite spline chunk streamer & stunt cells
│       ├── track_gen.js        # Ribbon road mesh, dashed line, checkered curbs, star ramp
│       ├── terrain.js          # Shared landscape elevation math across JavaScript and GLSL shaders
│       ├── world.js            # Environment coordinator: 85s Day-Night cycle, skydome shader, ground
│       ├── grass.js            # High-Performance GLSL Multi-Ring Concentric Triangle Grass (Ghibli/Peter Adams)
│       ├── trees.js            # Procedural pines, oaks, birches, bushes & wildflower meadow patches
│       ├── props.js            # 3D street lamps, guardrails, chevrons, grandstands, bridge, turbines, balloons, rocks
│       ├── fog.js              # Synchronized time-of-day atmospheric fog engine
│       ├── weather.js          # Dynamic precipitation & cloud coverage weather coordinator
│       ├── rivals.js           # Multi-lane autonomous AI traffic recycling & waypoint tracking
│       ├── audio.js            # Procedural Web Audio API synth (engine, boost, drift, chime)
│       └── hud.js              # Speedometer, boost gauge, FPS counter, 2D radar minimap, upgrade/results modal
├── play/
│   └── index.html              # Redirects to ../three.js/index.html
└── godot/                      # ARCHIVED Godot 4.7 project (all original Godot files preserved)
```

---

## 2. Core Three.js Architecture
- **Rendering & Math**: Three.js r160 ESM.
- **Model Import**: Three.js official loaders (`STLLoader`, `OBJLoader`, `GLTFLoader`) with auto-normalization to 3.0m longest axis and bounding box physics calculation.
- **Track Extrusion**: Dynamic continuous ribbon mesh with shared vertices (zero curve slits), checkered Mario Kart red/white curbs, and dashed yellow center line.
- **Atmosphere & Scenery**: 85s continuous Day-Night cycle, 3D street lamps with glowing asphalt pools, grandstands, guardrails, trees, chevron signs, and hot air balloons.
- **True Silhouette Shadows**: Real-time road-projected 2D silhouettes for player and rival 3D models with zero shader compilation latency.
- **HUD & UI**: Modern glassmorphism UI with speedometer, boost gauge, 2D minimap, progress bar, roguelite upgrades, and finish modal.
- **Volumetric Cloud Skydome Shader**: Procedural 4-octave fractional Brownian motion (fBm) noise cloud dome with Rayleigh/Mie atmospheric scattering and dynamic day/sunset/night illumination.
- **Continuous Elevation & Zero Road Clipping**: Elevated track baseline ($y \ge 1.1\text{m}$) over ground at $y = 0.0\text{m}$ guarantees the road never clips beneath the terrain.
- **Algorithmic Spatial Placement**: Multi-pass clearance reservation algorithm (`isOccupied`, `reserve`) ensures zero overlap or clipping between lamps, chevrons, grandstands, and trees.
- **Realistic Street Lamps**: Warm Three.js `PointLight` fixtures with quadratic distance decay (zero fake cone geometry).
- **Garage Directional Turntable**: 360-degree interactive mouse/touch orbiting with illuminated "FRONT ➔" floor indicator and Xenon headlights/taillights.
- **Modular World Subsystems, Rolling Hills & GLSL Triangle Grass**:
  - `terrain.js`: Shared procedural landscape elevation function (`getTerrainHeight`) matching exactly in JavaScript and GLSL shaders for zero-discrepancy terrain contours across road, physics, trees, and grass.
  - `road_streamer.js`: Infinite procedural C1 Hermite spline chunk streamer maintaining dynamic forward horizon (~650m) and chunk retirement (>180m behind) with diverse stunt cells (`MeadowCruise`, `HillClimbDrop`, `SkyLoop`, `ChasmJump`, `MountainChicane`, `BankedVelodrome`). Chunks smoothly rise from -35m underground on spawn and sink before disposal.
  - `track_gen.js`: Weathered country dirt & gravel rally road following natural hills and plains, featuring clay gravel ruts, packed earth tire tracks, and soft grassy shoulders (no plastic curbs).
  - `grass.js`: Multi-ring concentric LOD field with adaptive density calculation, local patch-space radial fading (`smoothstep`), interactive multi-vehicle trample flattening, and VBO vertex bounds strictly capped to prevent WebGL buffer allocation faults.
  - `trees.js`: Procedural conifer pines, deciduous/fruit trees, flowering shrubs, and hillside meadow groves grounded on terrain with wind-swaying foliage canopies and 4-zone radial placement.
  - `props.js`: Real 8-light PointLight pool (zero runtime shader recompiles), continuous tubular safety guardrails, yellow chevron boards, distance markers, grandstands with cheering spectators, checkpoint truss bridge, instanced boulders, animated wind turbines, and floating hot air balloons.
  - `world.js`: Clean environment coordinator for sky, sun, day-night cycle, synchronized time-of-day fog (`fog.js`), and subdivided rolling terrain mesh.
- **Stutter-Free Compositor Loading**: Asynchronous screen capture (960×540 ImageBitmaps) between $t=1.0\text{s}$ and $2.0\text{s}$ of garage launch, driving a 24 FPS ping-pong loop on `#compositor-canvas` while world generation executes in decoupled background steps with double rAF yielding and a hardware-accelerated 850ms dissolve.
- **In-Engine Telemetry**: Upper-left cluster with real-time exponentially smoothed FPS display (`hud.js`), distance odometer (`KM`), and dynamic radar minimap.

---

## 3. Autoloads

| Name | Script | Purpose |
|------|--------|---------|
| `GameState` | game_state.gd | Holds mesh, euler, color, pattern, mode, seed, career meta. Handles file import (web picker + native FileDialog), persistence to `user://`. |
| `MeshPrep` | mesh_prep.gd | Shader warm-up (one per frame in _process), road build pump (incremental via RoadMesh.pump). Caches built roads in `roads` dict keyed by `"mode:seed"`. |

---

## 4. Scene Flow

```
main_menu.tscn → garage.tscn → race.tscn
                  ↑                ↓ (retry)
                  └────────────────┘
                  ← (menu button) ←
```

1. **Main Menu**: shader background, two buttons (Arcade/Roguelite), career stats, help text. On button press: sets `GameState.mode`, `GameState.run_seed`, calls `MeshPrep.request_track()`, changes scene to garage.
2. **Garage**: SubViewport preview of mesh on turntable, rotation buttons, color swatches, pattern grid (static+animated), Import/Reset/Start/SwitchMode. On Start: calls `MeshPrep.request_track()` again, changes scene to race.
3. **Race**: `_ready` calls `MeshPrep.request_track`, `_build_world` (sky, camera, stars). The actual track + vehicle spawn happens in `_boot_race()` which is called when the road data is ready. Shows "ARMING THE GRID" boot overlay until road is built.

---

## 5. Known Bugs & Issues

### 5.1 HUD drive() Signature Mismatch — FIXED
`race.gd` now passes a full Dictionary to `race_hud.gd:drive()` with all 14 keys: `speed, title, clock, sub, progress, boost, show_launch, launch, show_health, health, nitro, points, player, heading`. The minimap now receives track points and player position.

### 5.2 Scene Load Latency & Pumping — FIXED
`MeshPrep.request_track()` now builds tracks synchronously via `RoadMesh.build()`, completing in ~2ms. The multi-frame pump queue and fake shader warmup SubViewports were removed, eliminating the 7-12 second scene transitions. `race.gd` boots synchronously in `_ready()`.

### 5.3 Road Collision Sticking & Boost Slam — FIXED
- Batched BoxShape3D road colliders with overlapping spans were replaced with a seamless `ConcavePolygonShape3D` built from `built.mesh.create_trimesh_shape()`.
- Vehicle hover rays now cast from inside the vehicle body down along `-global_basis.y` with adequate offset, preventing rays from starting underneath the road.
- Boost provides actual forward thrust while downforce is capped so hover springs are never overpowered.
- Vehicle collision box is slightly inset and elevated so it cannot snag on the road.

### 5.4 Respawn & Teleport on RigidBody3D — FIXED
In Godot 4, directly setting `global_transform` on a RigidBody3D is ignored by the physics server. `Vehicle.teleport()` was implemented using `PhysicsServer3D.body_set_state` to properly update transform and zero velocities, with an elevation offset.

### 5.5 Garage Controls & Visuals — FIXED
Replaced button-based facing controls (Yaw/Pitch/Roll) with interactive mouse dragging on the 3D viewport (Yaw/Pitch on drag, Roll on Shift+drag). Added 3D holographic turntable axis rings, particle motes, 3-point showroom lighting, and high-contrast card UI.

### 5.6 Zero-Compile StandardMaterial3D & Instant Transitions — FIXED
- Symptom: 7.4s freeze entering Garage, 15.7s freeze entering Race on WebGL2/ANGLE (GTX 980 / Direct3D11 backend).
- Cause: Custom Spatial Shaders with dynamic branches, procedural noise, and custom light models forced the browser's D3D11 HLSL compiler (`d3dcompiler_47.dll`) into massive optimization cycles on the first draw call.
- Fix: Replaced all custom spatial shaders with Godot's built-in `StandardMaterial3D` (procedural triplanar pattern textures, vertex color albedo, emission) and `ProceduralSkyMaterial`. Built-in engine materials are precompiled during engine boot, reducing runtime scene transition overhead to < 50ms (a 180x speedup).

### 5.7 ConcavePolygonShape3D Backface Culling & Endless Fall Loop — FIXED
- Symptom: Vehicle spawned, immediately fell through the road, hit $y < -8.0$, respawned, and fell in an infinite loop.
- Cause: The road mesh generated by SurfaceTool produced some downward-facing trimesh faces. By default, Godot 4 `ConcavePolygonShape3D` ignores backfaces and `PhysicsRayQueryParameters3D.hit_back_faces` is false. Hover rays cast downward missed the road geometry completely (`hit.is_empty() == true`).
- Fix: Set `shape.backface_collision = true` in `track_builder.gd`, and set `query.hit_back_faces = true` and `query.hit_from_inside = true` in `vehicle.gd`. Added normal rectification (`if n.dot(Vector3.UP) < 0.0: n = -n`) to guarantee stable hover cushion physics.

### 5.8 Bounded-Heading Modular Track Architecture & Scenery (Labyrinth Pattern) — FIXED
- Symptom: Track self-intersected, had gaps, and clipped through mountains.
- Cause: Unbounded turn selection allowed tracks to turn 180°+ and cross over earlier road segments. Mountain ring was fixed at $Z = 340$ with an inner radius that intersected the $700$m-long track.
- Fix:
  - Constrained track heading to $[-45^\circ, +45^\circ]$ around North ($-Z$). Because forward progress is strictly monotonic ($-\cos(\text{yaw}) \le -0.707$), self-intersection is mathematically impossible.
  - Dynamically sized and centered the ground plane and mountain peaks around the exact bounding box of the track, enforcing a minimum $220$m mountain clearance margin.
  - Added modular scenery per cell type: bridge support columns to the ground, glowing hexagonal tunnel arches, starting gantry, and launch towers.

### 5.10 Mario Kart Theme & Road Visibility — FIXED
- Symptom: Road was mostly invisible; vehicle shadow was rendered as a block instead of the custom vehicle model.
- Cause: `deck` vertex color alpha was set to `0.15` in `road_mesh.gd`, and `StandardMaterial3D.cull_mode` defaulted to `CULL_BACK` causing winding culls. The shadow quad had replaced the projected vehicle mesh.
- Fix:
  - Road deck is now 100% opaque slate-blue asphalt (`Color(0.25, 0.28, 0.36, 1.0)`) with `cull_mode = CULL_DISABLED`.
  - Added Mario Kart alternating red-and-white checkered curbs (`Color(0.95, 0.2, 0.22)` and `Color(0.98, 0.98, 1.0)`) and dashed golden center lines.
  - World environment updated to vibrant Mario Kart daytime: bright blue sky, emerald green grass ground (`Color(0.28, 0.68, 0.32)`), and colorful rolling hills.

### 5.11 Day-Night Cycle, 3D Street Lamps, Scenery & Silhouette Shadow — FIXED
- Symptoms:
  - Road curves had gaps/slits between segments.
  - Vehicle shadow was invisible on the road.
  - Scene load had an 8.4s freeze before Tick #1 due to custom shader compilation on the 80k-triangle vehicle mesh.
  - Disconnected cyan torus frames floated in mid-air near the road without posts or lamps.
  - The world felt empty; NPC rivals were locked to the exact center line.
- Fix:
  - **Zero-Gap Ribbon Road Extrusion**: Precalculated shared cross-section points (`left_pts`, `right_pts`, `curb_l_pts`, `curb_r_pts`, `stripe_l_pts`, `stripe_r_pts`) using tangent averaging so adjacent segments share exact vertices, eliminating curve slits.
  - **Zero-Stall Silhouette Shadow**: Replaced `shadow.gdshader` with a `top_level = true` `MeshInstance3D` using built-in `StandardMaterial3D` (`SHADING_MODE_UNSHADED`, semi-transparent dark navy). The shadow raycasts to Layer 1, aligns with the road surface normal, and squashes local $Y$ to $0.002$. This renders the exact 2D top-down silhouette of any custom 3D model with zero WebGL/ANGLE HLSL compilation stall. Rivals also received this shadow.
  - **Dynamic Day-Night Cycle**: Smooth 85-second continuous cycle transitioning through Daytime (bright blue sky, warm sunlight), Sunset (coral/gold horizon glow, long shadows), Night (deep starry indigo, moon glow, stars), and Dawn.
  - **Anchored 3D Street Lamps**: Replaced floating rings with real 3D street lamps featuring a curbside base, 5.2m pole, curved overhang arm, hanging fixture, emissive bulb, and warm asphalt light pools. Lamps automatically turn on at dusk and illuminate the road through the night.
  - **Populated Mario Kart World**: Added multi-tier spectator grandstands with striped red/white canopies and cheering banners, red-and-white tire safety barrier walls at turn runoffs, dual-post turn direction chevron boards, conifer and fruit tree groupings, and hot air balloons floating over the distant mountain valley.
  - **Dynamic Multi-Lane Rival AI**: Rivals actively swap between 4 driving lanes ($[-3.0, -1.8, 1.8, 3.0]$) to overtake and avoid the center line, and tilt/bank into turn apexes.

### 5.12 NPC Vehicle Shadow Contours, Ground-Anchored Trees & World Scenery — FIXED
- Symptoms:
  - NPC rivals had blocky/rectangular shadows.
  - Tree foliage spheres floated in the air disconnected from trunks.
  - Signposts floated slightly above the road embankment.
  - The world still felt empty around track curves.
- Cause:
  - Rivals `kind % 3 == 0` spawned as a literal `BoxMesh` with an unscaled shadow basis, producing a rectangular block shadow.
  - Roadside trees had their base position hardcoded to `y = -14.0` while the road undulating height varied, leaving foliage detached from the trunk in hilly sections.
  - Sign posts were only 2.8m tall and didn't penetrate deep enough below ground level.
- Fix:
  - **Aerodynamic Rival Vehicle Meshes**: All rivals now use streamlined aerodynamic racer meshes from `MeshFactory.default_vehicle()` with proportional shadow basis scaling (`Basis(gright * s_scale.x, hit_norm * 0.002, gfwd * s_scale.z)`), producing realistic, contour-matched vehicle silhouette shadows.
  - **Ground-Anchored Trees**: Trees are placed at track elevation `p.y` with trunks sinking 3.0m deep into the embankment and rising 4.5m up into the foliage. Foliage overlaps the trunk top by 2m, guaranteeing zero gaps or floating spheres.
  - **Deep-Sunk Sign & Stand Posts**: Signposts now penetrate 3.8m deep, and grandstands feature 6m foundation pillars sunk into the earth.
  - **Continuous Guardrails & Circuit Dressing**: Added continuous tubular steel guardrails with red/white safety stripes along outer curve bends, roadside sponsor billboards ("SUPER MODEL GP", "TURBO SPEEDWAY"), cheering spectator silhouettes in bleachers, and alternating street lamps every 16–20m.

### 5.13 Unified Vehicle Architecture, Autonomous AI Rivals, Skydome Fix & Populated Scenery — FIXED
- Symptoms:
  - Repeated/duplicate physics and vehicle code between player and NPC rivals.
  - Black hole visible in the distance that moved with the vehicle.
  - Rotating vehicle in garage didn't affect heading/orientation when starting the race.
  - World felt empty across the meadow and plains.
  - NPC rivals wandered across plains or drove beneath elevated road geometry.
- Fix:
  - **Unified `Vehicle` Class (DRY Architecture)**: Replaced separate physics implementations with a single `Vehicle` class (`three.js/js/vehicle.js`) utilized by both the player and NPC rivals. Unified hover cushion suspension, ground raycasting, slope alignment, 2D silhouette shadows, and drift mechanics. Deleted obsolete `physics.js`.
  - **Autonomous Waypoint-Following AI Racers**: Rivals now run real `Vehicle` physics with autonomous AI controllers that track forward spline waypoints (18–24m lookahead), dynamically manage lane offsets, steer into apexes, brake for sharp turns, and self-recover if pushed off-track. AI racers strictly adhere to asphalt ribbons and never drive under the track or across plains.
  - **Camera-Centered Skydome & Far Plane Fix**: Increased camera far plane to 3000m, enlarged skydome radius to 1600m, replaced singular horizon division in shader with spherical azimuth/elevation mapping, and updated render loop to center skydome directly on camera position every frame. The distant black hole artifact is completely eradicated.
  - **Garage Heading & Oriented Geometry Baking**: Mouse/touch dragging in the garage rotates the model relative to the fixed "▲ FRONT" floor indicator. `VehicleStats.measureOrientedGeometry()` calculates the oriented AABB dimensions live ($L, W, H$), modifying speed, acceleration, handling, and mass in real time. On starting the race, the exact garage rotation is baked into the cloned geometry vertices via `geom.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(garageEuler))`.
  - **Populated Mario Kart Scenery**: Added 18 clustered meadow tree groves (70+ trees) across valley floor, 35 granite boulders, 3 animated wind turbines with rotating blades and blinking red aviation beacons, an overhead steel truss checkpoint bridge ("SECTOR 2 CHECKPOINT") at mid-track, and gently floating hot air balloons.

### 5.14 Volumetric Instanced Grass, Star Ascension Columns, Street Lights & Garage Front Guide — FIXED
- Symptoms:
  - Street lamps cast barely any visible light onto the asphalt at night.
  - Vehicle shadow was cut off on road hills and ramps.
  - Plains still felt empty between tree groves.
  - Rivals driving off final ramp were teleporting back instead of ascending into skies.
  - Garage front was difficult to distinguish when rotating vehicle.
  - Vehicle did not snap to front when moving from start menu to garage.
  - Start menu had technical badges ("Target: 120 fps", Three.js engine badge).
- Fix:
  - **30,000-Blade Instanced Wind Grass (`InstancedMesh`)**: Crossed 3-blade grass cluster geometry with vertex shader breeze displacement (`sin(uTime * 2.8 + pos.x * 0.14) * uv.y²`) creating a living, swaying green sea across the valley in a single draw call with zero road clipping.
  - **Luminous Street Lamps & Road Light Pools**: Increased `PointLight` intensity to 85.0 with distance 36m and added golden radial light pool decals on the asphalt under each fixture.
  - **Anti-Clipping Silhouette Shadows**: Aligned shadow orientation directly to the road's surface slope (`ground.slope`) rather than chassis spring bounce, elevated by 8cm with aggressive GPU polygon offsetting (`factor: -6, units: -12`), eliminating road curvature clipping.
  - **Universal Celestial Star Ascension**: Both player and NPC rivals launch off the final star ramp, turning radiant pure white (`emissiveIntensity = 4.5`) while a 600m celestial cyan/white column of light beams into the heavens.
  - **Unmistakable Garage Front Guide**: Added a bold 3D floor runway arrow (`▲ FRONT DIRECTION ▲`), glowing cyan bumper alignment laser beam, and vertical dual pylons.
  - **Menu-to-Garage Front Snap**: Entering the garage smoothly interpolates turntable yaw/pitch/roll to 0 facing the front indicator.
  - **Clean Start Menu UI**: Stripped out all tech jargon ("120 fps", "Next-Gen Three.js Engine") for a clean, professional video game UI.

### 5.15 NPC Rival AI Fix, Seamless Skybox, Crisp Grass Trample & Overhauled Rocks/Trees — FIXED
- Symptoms:
  - Rocks and trees looked very plain and repetitive.
  - Skybox had visible seams cutting across the dome.
  - Grass was too tall, and displacement radius around cars was too tight.
  - NPC rivals were stationary at the starting grid instead of racing.
- Fix:
  - **NPC Rivals AI Driver Loop**: Fixed missing `this.rivals.update(delta)` in `main.js` `_loop()` and enhanced `rivals.js` with rolling start velocities (`speed = 10.0`), monotonic waypoint forward tracking, and stall-free throttle logic (`throttle = 1.0` and `brake = 0.0` when `< 12 m/s`). Rivals now race fiercely and dynamically swap lanes.
  - **Seamless Planar Skybox Projection**: Replaced discontinuous `atan(dir.z, dir.x)` polar mapping with smooth planar projection `(dir.xz / (max(dir.y, 0.02) + 0.38))` and 3D directional cell hashing for stars, completely eradicating all skybox and night-star seams.
  - **Halved Grass Height & Expanded Vehicle Wake**: Halved blade height to `maxBladeHeight: 0.38` and `heightNoiseAmplitude: 1.4` for clean meadow coverage. Increased displacement push radius to 6.4m with increased flattening power (`transformed.xz += pushDir * (pushFactor * 3.4)`), creating a wide, prominent parting wake as vehicles speed through the grass.
  - **Organic Rock Outcroppings (`props.js`)**: Replaced plain single dodecahedrons with 55 multi-stone geological outcroppings featuring deformed crystalline facets, mossy alpine lichen tops (`#3c5c28`), stratified stone bands, and scattered scree chunks.
  - **Botanical Trees Overhaul (`trees.js`)**: Replaced primitive shapes with majestic conifer pines (4 scalloped needle tiers, deep Scots pine tones), broadleaf oaks, and golden autumn birches with root-flared trunks, crooked boughs, organic deformed foliage cloud puffs, and multi-frequency wind swaying.

### 5.16 Infinite Road Streamer, Stunt Cells, Real Soft Shadows, Slope Attitude Pitch & Road-Masked Grass — FIXED
- Symptoms:
  - Grass grew directly on the road surface and roadbed.
  - Night sky stars looked like blocky, pixelated stair dashes.
  - Grass blades were too thin and sparse with large bare gaps.
  - Vehicle did not tilt forward or backward when driving up hills or down slopes.
  - Shadow under the car was a fake squashed plane quad instead of a true dynamic shadow.
  - Road set was static and boring with a dumb finish ramp at 900m.
- Fix:
  - **Dynamic Infinite Road Streamer (`road_streamer.js`)**: Replaced the static 900m circuit with an endless chunk-streaming system inspired by `public/Labyrinth/`. As the car drives, chunks spawn dynamically ahead (~650m forward horizon) and despawn behind (>180m), maintaining continuous C1 Hermite spline connectivity.
  - **Diverse Stunt Cells**:
    1. `MeadowCruise`: Flowing rally road through wildflower meadows.
    2. `HillClimbDrop`: Climbs high (+35m elevation gain) over the valley with safety guardrails, reaching a precipice that suddenly plunges down -30m in a roller-coaster cliff drop with amber boost pads into a straightaway.
    3. `SkyLoop`: 360-degree vertical loop-de-loop suspended in the sky with glowing cyan magnetic track guides and support trusses.
    4. `ChasmJump`: High-speed launch ramp leaping across a 20m canyon air gap onto an angled landing deck.
    5. `MountainChicane` & `BankedVelodrome`: Technical S-bends and 40° banked turns.
  - **Shader Road Masking & Lush Density (`grass.js`)**: Passed active road spline points to the grass vertex shader to evaluate radial road clearance, mathematically suppressing grass within 6.8m of the road ribbon and blending softly at shoulders. Concentrated 160,000 blades into an 85m sliding patch (25 blades/m²) with widened 0.22m blade profiles for a lush, thick carpet.
  - **Astronomical Celestial Star Dome (`world.js`)**: Replaced quantized fragment shader cell math with a dedicated 2,800-point Three.js celestial hemisphere using soft Gaussian circular star sprites, natural astronomical palettes, and slow celestial sphere revolution with zero stepping artifacts.
  - **Real Native Three.js Soft Shadows**: Enabled `PCFSoftShadowMap` on `WebGLRenderer`. Directional sunlight tracks the vehicle with a high-resolution 2048x2048 shadow frustum, casting soft volumetric shadows across the vehicle, roadbed (`receiveShadow = true`), and rolling terrain. Removed the artificial squashed plane mesh.
  - **3D Ground Differential Pitch & Roll (`vehicle.js`)**: Sampled terrain and road elevation ahead (+1.6m) and behind (-1.6m) along vehicle heading to calculate true pitch angle (`Math.atan2(frontGround.y - rearGround.y, 3.2)`), plus cross-slope roll. Vehicles now tilt upwards on climbs, tilt downwards on steep drops, and bank into curved berms.
  - **HUD Distance Odometer & Radar Minimap (`hud.js`)**: Added a distance driven counter (`0.00 KM`) and updated the 2D minimap into a dynamic radar scanner centered on the vehicle within a 240m horizon.

### 5.17 Endless Mode Traffic, Infinite Toroidal Scenery, Two-Tier LOD Grass & Attitude Pitch Fix — FIXED
- Symptoms:
  - World became empty after driving; wind turbines and hot air balloons disappeared.
  - Road still clipped under the ground and had a rectangular gap between chunks.
  - Rocks did not use the same infinite sliding window code as grass.
  - Boost did not recharge over time; backside of the vehicle was jacked high up on hills and nose pointed down.
  - NPCs disappeared into the distance forever instead of behaving like endless traffic.
  - Hot air balloons were bare spheres lacking baskets, rigging, and burners.
  - Street lamps were ugly and signs were boring yellow boxes closely duplicated.
- Fix:
  - **Infinite Toroidal Scenery Sliding Window (`props.js`, `world.js`)**: Passed `playerPos || cameraPos` to `props.update()`. Embedded wind turbines (8 turbines across a 900m sliding window) and hot air balloons (6 balloons across an 850m sliding window) with toroidal modulo wrapping, guaranteeing they never despawn or run out as the player drives indefinitely.
  - **Infinite Instanced Rocks Matching Grass (`props.js`)**: Implemented 95 GPU instanced granite boulders (`THREE.InstancedMesh`) operating on a 240m sliding window dynamically grounded to `getTerrainHeight(rx, rz)`, identical to the grass sliding window with zero runtime allocations.
  - **Zero Chunk Gaps & Deep Road Berm Skirts (`road_streamer.js`)**: Pre-pended `this.headPos.clone()` as the starting point of every newly extruded road chunk, mathematically eliminating the 5.6m chunk gap hole. Deepened downward road foundation skirts to 5.5m and increased cross-slope sampling to $\pm 7.5$m with $+1.25$m clearance so roads never clip beneath hilly terrain.
  - **Inverted Pitch Attitude & Boost Auto-Recharge (`vehicle.js`)**: Corrected the pitch rotation sign (`targetPitch = -Math.atan2(frontGround.y - rearGround.y, 3.2)`), aligning the car parallel to hills, ramps, and slopes without nose-diving or rear-jacking. Added automatic boost regeneration over time (+0.50 s/s) and hill-climbing torque assistance.
  - **Endless Mode Traffic Recycling AI (`rivals.js`, `main.js`)**: Replaced linear race logic with an organic traffic simulation. Rivals dynamically wander lanes, vary cruising speeds (79–130 km/h), and actively respawn 55% ahead (70–140m) or 45% behind (45–85m) whenever they fall outside $[-125\text{m}, +185\text{m}]$ from the player or get stuck, keeping the road bustling with lively racers.
  - **Authentic Teardrop Hot Air Balloons (`props.js`)**: Replaced primitive spheres with authentic `LatheGeometry` teardrop envelopes featuring vibrant vertical gore stripes, 4 stainless suspension cables, detailed woven wicker baskets with rims, and gas burner heads with luminous flickering flames.
  - **Real PointLight Street Lamps & Zero Ground Circle Decals (`props.js`)**: Completely removed the fake circular plane decal meshes (`poolMesh` / `sharedPoolGeom` / `poolMat`). Implemented an active dynamic pool of 8 real Three.js `PointLight` light sources (`0xffeedd`, intensity 85.0, distance 36.0m) positioned at the luminaire heads of the closest lamps to the player. They cast real 3D shader illumination on the road, player car, NPC traffic, and roadside terrain with quadratic physical distance falloff.
  - **Three.js Grassworks Multi-Blade Curved Tufts & Organic Shader (`grass.js`)**: Replaced stiff single-triangle blades with 3-blade fanned curved tufts generating over 195,000 dense interlocking blades in the near field (~30 blades/m²). Decoupled geometry parameters from colors, replacing the black base bug with an authentic Grassworks gradient (deep forest moss root -> rich meadow emerald -> sun-kissed golden lime tip), parabolic arch curvature, and root ambient occlusion for a lush, seamless meadow carpet.
  - **Clean Sign Post Mounting (`props.js`)**: Repositioned sign support posts cleanly behind the board (`z = -0.09`) and set their height to 2.2m (stopping at $y = 1.35\text{m}$, well below the $1.725\text{m}$ board top). Posts now anchor deep into the earth without slicing through or protruding above the sign.
  - **Zero-Error Chunk Despawn & Scenery Disposal (`road_streamer.js`, `props.js`, `trees.js`)**: Implemented safe `removeLamp` and `removeTree` methods with defensive type guards, ensuring dynamic road chunk despawning behind the vehicle never throws errors or leaks memory during long driving runs.

### 5.17 Dynamic Atmospheric Fog, Smooth Chunk Rise/Sink, Distance Grass & Headless Benchmarking Suite — FIXED
- Symptoms & Needs:
  - Distance areas beyond the 55m near grass patch exposed bare terrain in the horizon.
  - Grass Study Lab had restrictive min/max range sliders preventing arbitrary value exploration.
  - Rocks suddenly disappeared/teleported across the screen as the player moved.
  - New road chunks and scenery popped in abruptly.
  - Needed an automated benchmarking harness with agent-readable markdown reports.
- Fix:
  - **Unbounded Numeric Inputs in Grass Study Lab (`grassStudy/index.html`)**: Replaced restrictive sliders with direct `<input type="number">` controls for both near and distance grass fields (`farCellSize`, `farPatchSize`, `farBladesPerTuft`, `farBladeWidth`, `farMaxBladeHeight`).
  - **Synchronized Atmospheric Fog (`three.js/js/fog.js` & `world.js`)**: Created dynamic time-of-day atmospheric fog smoothly transitioning across Dawn, Noon, Sunset, and Night over an 85m–390m distance window, blending distant rolling hills seamlessly into the skydome horizon.
  - **Distance Grass Coverage (`grass.json` & `grass.js`)**: Expanded distance grass reach to 380m patch size with 0.22m billboard tufts and soft alpha blending out to 370m, directly meeting the atmospheric fog boundary with zero visible seam or bald patches.
  - **Fixed Rock Despawning & Modulo Wrap Bug (`props.js`)**: Removed the buggy 95-rock sliding instanced mesh that wrapped relative to `playerPos`, eliminating random rock teleportation. All boulders and geological outcroppings are cleanly anchored to chunk scenery.
  - **Smooth Procedural Chunk Rise & Sink Animations (`road_streamer.js`)**: Road chunks and associated scenery (props, guardrails, trees, rocks) spawn at $y = -35.0\text{m}$ beneath the ground and smoothly rise up over 1.4s with cubic ease-out. Despawning chunks sink into the earth over 1.2s before disposal.
  - **Automated Headless Benchmarking Suite (`benchmark.html`, `run_benchmark.mjs`, `RunBenchmark.bat`)**: Built an automated performance benchmark harness that runs a 400-frame simulated test drive with an autonomous bot, measuring steady-state FPS, 1% lows, draw calls, triangles, and subsystem timings (GPU render, grass, streamer, physics). Generated [benchmark_report.md](file:///f:/Github/Website/public/Projects/3DModelRacing/three.js/benchmark_report.md) showing stable 653.6 FPS with 12.58M triangles.

### 5.18 Elimination of 1km PointLight Freezes, AI Ramp Monotonic Pathing, 4-Ring Concentric Grass, Bushes & Flowers — FIXED
- Symptoms & Needs:
  - Freezes of 600–900ms occurred around 1km as dusk transitioned into night.
  - AI rivals flew off tall ramps and started circling around backwards instead of driving forward.
  - Trees only grew right next to the asphalt ribbon instead of across the expansive landscape.
  - Abrupt density transitions between near grass and distant terrain.
  - Needed bushes and wildflowers alongside roadside verges and meadow clearings.
  - Scenery needed to spawn underground and rise up, then sink underground before despawning.
- Fix:
  - **Eliminated PointLight Shader Recompilation Stalls (`props.js`)**: Diagnosed that toggling `PointLight.visible` dynamically changed Three.js `#define NUM_POINT_LIGHTS`, triggering full GPU pipeline recompiles for every material in the scene (918ms freeze). Fixed by keeping `visible = true` permanently for all 8 pooled lights and only modulating `intensity` (0.0 to 85.0) and position `(0, -999, 0)`, reducing frame spikes by 42x to a smooth 21ms.
  - **Monotonic 2D Spline Waypoint Tracking & Mid-Air Flight Stabilization (`rivals.js`)**: Replaced 3D Euclidean distance with 2D horizontal ($XZ$) distance so 30m cliff drops no longer fool waypoint searches. Enforced monotonic forward waypoint advancement, preventing rivals from turning backwards. Added mid-air flight stabilization and `onChunkShift` waypoint index offsets.
  - **4-Ring Concentric Multi-LOD Grass Field (`grass.js`)**: Implemented 4 concentric radial rings centered on the player:
    1. *Ring 1 (Ultra)*: 0m–34m (1.6M blades, 12 blades/tuft, 3 segments, interactive trample).
    2. *Ring 2 (Medium)*: 24m–108m (7 tufts/m², 7 blades/tuft, 2 segments, seamless density bridge).
    3. *Ring 3 (Far)*: 80m–250m (4 blades/tuft, 0.22m billboard tufts, rich green hill coverage).
    4. *Ring 4 (Horizon)*: 185m–425m (0.55m wide foliage clusters, seamlessly merges into atmospheric fog).
  - **Bushes, Flowering Shrubs & Wildflower Patches (`trees.js`, `road_streamer.js`)**: Added Archetypes 3 (Lush Meadow Bush), 4 (Flowering Shrub with crimson & golden blossoms), and 5 (Wildflower Meadow Patch with multi-colored petals) with two-tier LODs.
  - **Expansive 4-Zone Landscape Scenery with Subterranean Rise & Sink (`road_streamer.js`)**: Populated chunks in 4 radial zones: Road Verge (7–16m), Roadside (14–38m), Rolling Meadow Groves (38–130m, 2–3 tree clusters across fields), and Distant Ridges (130–260m). All objects attach to `chunk.propsGroup`, smoothly rising out of the earth (-35m to 0m) on spawn and sinking underground before despawn.

### 5.19 Headlight & Taillight Orientation Sync, Decoupled Silk-Smooth Loading & Seamless Cyberpunk Dissolve — FIXED
- Symptoms & Needs:
  - Rotating vehicle in garage rotated headlights and brake lights, but entering race caused lights to revert to axis-aligned world front (-Z) and rear (+Z).
  - Loading animation lagged for a second at 96% and progression bar jumped rather than moving smoothly.
  - Vehicle disappeared during screen transitions; desired seamless dissolve where the cyberpunk grid and retro sun fade out and the world fades in without the vehicle ever leaving sight.
- Fix:
  - **Rotated Headlights & Brake Lights Sync (`vehicle.js`, `main.js`)**: Passed `garageEuler` and unrotated `baseGeometry` to `Vehicle` constructor. Light positions and orientations are calculated from the base model bounds and multiplied by `rotM = new THREE.Matrix4().makeRotationFromEuler(garageEuler)`. Headlights and taillights are mounted directly to the vehicle chassis at the exact rotated positions and orientations matching the garage showroom.
  - **Decoupled Silk-Smooth Loading (`main.js`)**: Eliminated the blocking synchronous `this.renderer.render` warmup call that locked the main thread at 96%. Structured loading into 8 lightweight asynchronous steps with 85ms breathing windows. Decoupled DOM loading progress from execution by interpolating `loadingDisplayProgress` continuously every frame via `lerp(..., delta * 5.0)` for a liquid-smooth 0–100% bar.
  - **Seamless Cyberpunk Landscape Dissolve (`main.js`)**: Elevated void driving baseline to match the race track's starting elevation (`getTerrainHeight(0, 0) + 0.65`). Added `uOpacity` and `uCenter` uniforms to the cyberpunk grid shader and sun material. Removed black/white flash overlays. Implemented a dual render pass during the 1.25s dissolve where `raceScene` renders the lush Mario Kart landscape underneath, while `garageScene` renders the fading neon grid and retro sun on top. The vehicle stays continuously visible in the exact same world position throughout the entire transition with zero jump, zero hitch, and zero teleportation.

### 5.20 Stutter-Free Compositor Loading, Ping-Pong Canvas Recording, Stepped Async Yielding, Escape Lifecycle Teardown & Hardware-Accelerated Dissolve — FIXED
- Symptoms & Needs:
  - Cyberpunk neon grid and retro sun stuttered heavily along with world asset construction; at 100% loading progress the frame froze before abruptly snapping into the race world.
  - Initial video recording started immediately at launch, capturing the vehicle leaving the platform pedestal and repeatedly snapping/teleporting back on loop.
  - Calling synchronous or full-canvas `createImageBitmap(this.canvas)` on large WebGL viewports blocked the GPU readback pipeline, dropping frames and causing progress bar hitching.
  - Fade-swap failed to trigger or snapped abruptly because CSS transition conflicts and Web Animations remained attached to `#launch-compositor-overlay`.
  - Pressing `Escape` during `RACE` to return to `GARAGE` broke subsequent launches because `hasSwappedToCompositor = true` persisted and overlay Web Animations remained in a canceled/frozen state, preventing `_startPingPongPlayback` or `_fallbackCompositorSwap` from firing.
  - Ground grid scrolled when vehicle was stationary on the turntable platform.
  - Vehicle shadow was left behind during launch acceleration instead of tracking the vehicle.
- Fix:
  - **Timed Forward Cruising Capture Window (`main.js`)**: Frame capture delayed to start at $t = 1.0\text{s}$ post-takeoff and record until $t = 2.0\text{s}$. This records the vehicle cruising smoothly forward along the neon grid runway, completely eliminating platform reset snaps. Camera position is locked rigidly behind vehicle (`camera.position.set(0, carElev + 2.5, -launchCarDist + 6.2)`) with zero jerking.
  - **Downsampled GPU Frame Readback (`main.js`)**: Captures frames at 40ms intervals using `createImageBitmap(this.canvas, { resizeWidth: 960, resizeHeight: 540, resizeQuality: 'medium' })`. Offloads image decode to worker pool without stalling WebGL render thread.
  - **Forward-Reverse Ping-Pong Compositor Playback (`main.js`, `index.html`)**: Renders frames onto `#compositor-canvas` using ping-pong traversal (`compFrameIdx += compFrameDir`, reversing at ends) at 24 FPS. Eliminates jump cuts and creates an infinite seamless cruising loop while background loading runs.
  - **Strictly Decoupled Stepped Async Background Loading (`main.js`)**: World loading (`_startSteppedLoading()`) ONLY triggers AFTER ping-pong playback is active on `#launch-compositor-overlay`. Loading is sliced into 10 isolated asynchronous tasks (spline generation, world & sky compile, 6 individual grass ring builds & compiles, vehicle cloning with baked turntable rotation, rival arming, warp drive engagement). Yields via double `requestAnimationFrame()` between steps, allowing the compositor canvas and DOM progress bar to render at uninterrupted 60 FPS.
  - **Full Lifecycle Escape Teardown (`main.js`)**: In `switchState('GARAGE')`, explicitly cancels all Web Animations on `#launch-compositor-overlay`, resets `hasSwappedToCompositor = false`, `pingPongActive = false`, `isCapturingFrames = false`, `launchCarDist = 0`, `launchCarSpeed = 0`, `isRaceLoaded = false`, closes and frees all `ImageBitmap` buffers, and sets grid `uSpeed.value = 0.0`. Allows repeated launch/abort cycles without state contamination.
  - **Hardware-Accelerated 850ms rAF Dissolve (`main.js`)**: Replaced fragile CSS transitions with a dedicated `requestAnimationFrame()` opacity fade step using cubic ease-out (`1.0 - Math.pow(1.0 - progress, 3)`), closing bitmaps and hiding overlay only when completely transparent.
  - **Dynamic Ground Grid Motion & Shadow Sync (`main.js`)**: Garage grid uniform `uSpeed` is set to `0.0` while on the platform and only set to `4.0` during `GARAGE_LAUNCH` when `launchCarSpeed > 0.5`. Garage display shadow position rigidly updates every frame (`this.garageDisplayShadow.position.set(0, -0.15, -this.launchCarDist)`).

### 5.21 Grass WebGL VBO Allocation Ceiling, NaN Vertex Generation Bug, Ring 1/2 Cell Density Tuning & Smoothstep Coordinate Space Fix — FIXED
- Symptoms & Needs:
  - All grass blades disappeared entirely from the scene after changing ring parameters.
  - WebGL console threw memory/buffer warnings or silently culled draw calls.
  - Innermost grass ring had a visible, abrupt boundary cliff without smooth radial blending.
- Root Cause:
  - In `_calculateAdaptiveDensity()`, intermediate variables (`tuftsReq`, `cellsAxis`, `adaptiveCell`) were inadvertently deleted or undefined during a replacement edit, causing `cellSize = NaN`. A cell size of `NaN` resulted in `cellsPerAxis = 0`, generating a 0-vertex buffer.
  - Attempting to set Ring 1 cell size to 0.16m across a 140m patch generated $>14.6\text{M}$ vertices and $>29\text{M}$ indices in a single `BufferGeometry`, exceeding Windows ANGLE/Direct3D11 VBO limits and causing GPU driver allocation failure.
  - In vertex shader, evaluating radial distance from wrapped world coordinates (`worldXZ - cameraPosition.xz`) caused discontinuous steps at patch edges.
- Fix:
  - **Repaired Adaptive Cell Calculation & Clamped Safety Guardrails (`grass.js`)**: Restored `tuftsReq = capacity / (ring.bladesPerTuft || 4)` and `adaptiveCell = patchSize / cellsAxis`. Added hard clamped safety bounds:
    ```javascript
    const baseCell = ring.cellSize || 0.5;
    const minCell = Math.max(0.20, baseCell * 0.85);
    const maxCell = Math.max(minCell, baseCell * 1.35);
    return Math.min(maxCell, Math.max(minCell, adaptiveCell));
    ```
  - **Calibrated Ring Density & Triangle Budgets (`grass.js`, `three.js/configure/grass.json`)**:
    - Ring 1 (Ultra Carpet): `cellSize = 0.32m`, 4 blades/tuft, `bladeWidth = 0.042m`, fade 36m–70m (~2.7M–3.2M vertices).
    - Ring 2 (Fine Meadow): `cellSize = 0.58m`, 4 blades/tuft, `bladeWidth = 0.054m`, fade 78m–125m (~3.1M–4.5M vertices).
    - Guarantees total geometry vertex count per ring stays well below WebGL buffer allocation limits while maintaining lush, dense coverage.
  - **Local Patch-Space Radial Distance & Smoothstep Taper (`grass.js`)**: Evaluates `distFromCam = max(0.0, length(origin.xz) + radialJitter)` where `origin.xz` is strictly in local wrapped patch space $[-halfPatch, +halfPatch]$. Replaced `pow(fade, 0.45)` with `smoothstep(0.0, 1.0, fade)` for smooth Ghibli blade height and width tapering across ring overlap zones.

### 5.22 In-Engine Real-Time FPS HUD Telemetry — FIXED
- Symptoms & Needs:
  - Position/Rank badge in top-left corner was redundant and static in single-player/endless modes.
  - Needed a high-visibility, real-time FPS counter to monitor rendering performance and frame stability during gameplay.
- Fix:
  - **FPS Telemetry Counter (`index.html`, `hud.js`, `main.js`)**: Replaced `#hud-rank-val` with `#hud-fps-val` in upper-left telemetry HUD cluster.
  - **Exponentially Smoothed Frame Rate Calculation (`main.js`)**: Computed `rawFps = 1.0 / Math.max(0.001, delta)` and smoothed via `this.currentFps = lerp(this.currentFps || 60, rawFps, 0.08)`, passed every tick to `hud.drive({ fps: this.currentFps })`.

---

## 6. Architecture Deep Dive

### 6.1 Vehicle Physics (vehicle.gd)
- Extends `RigidBody3D`, not a `VehicleBody3D`. Custom hover-car physics.
- 4-corner raycasts (`_hover`) with spring force, damping, ground-normal detection.
- `_drive`: forward force capped at `stats.top_speed`, lateral grip force, yaw torque, upright torque, downforce.
- `_tricks`: air time tracking, flip/spin detection, drift detection. Emits `trick` signal with XP.
- `_bite`: on hard impact, calls `MeshBoolean.subtract_sphere` to remove geometry from the mesh. Limited to 3 bites.
- Visual juice via `_sync_visuals`: squash on landing, stretch on accel, lean on lateral velocity, all fed to node scale & rotation.
- Shadow: duplicate custom vehicle mesh projected onto road plane via streamlined shadow.gdshader.

### 6.2 Track Generation Pipeline
1. `TrackLayouts.build(mode, seed)` → generates SVG path string (fixed for arcade, random curves for roguelite).
2. `SvgPath.sample(d, spacing)` → tessellates SVG into `PackedVector2Array` with even spacing.
3. Height function `_height(u, seed)` → sinusoidal waves + jump ramps + final ascent ramp.
4. Tag system: each point gets bitflags: `SOLID=1, LIP=2, FINISH=4, GAP=8, RAMP=32, GATE=64`.
5. `RoadMesh.begin/pump/finish` → incremental SurfaceTool mesh generation. Road quads, center stripe, curbs, ceiling tiles. Returns mesh + metadata (spawn, checkpoints, lip, finish, length).
6. `TrackBuilder.assemble` → adds colliders (batched BoxShape3D), BooleanBarriers, gates, signs.

### 6.3 Roguelite System
- `RunDirector`: tracks XP, level, integrity, distance. XP sources: tricks, smashes, barriers, distance (1.15 XP per meter), near misses.
- Level-up: `need = 70 + level * 50`. On level: pauses game, `Upgrades.roll(3, owned, rng)` picks 3 unique choices.
- `Upgrades`: 14-entry catalog. Each has id, title, detail, unique flag, max_stacks. `apply()` modifies vehicle stats/multipliers and director integrity directly.
- Integrity: starts at 100, lost on wall impacts (`hurt(impulse*0.5)`) and barrier hits (`hurt(5)`). At 0 → wrecked → game over.

### 6.4 Ascension Mechanic
- Launch energy = `speed² / mass * launch_mult`.
- Threshold: `VehicleStats.LAUNCH_ENERGY = 175.0`, min speed 18 m/s.
- Final 16% of track is ascending ramp. Last ~7% tagged LIP.
- On entering LIP area with enough energy: phase → "ascent", gravity → 0.12, time_scale → 0.62, sky → space mode, star particles on. After 3.8s → game end "Ascended".

### 6.5 Mesh Import Pipeline
1. Web: JS file picker or drag-and-drop → FileReader → base64 → `godotReceiveMesh` callback → `GameState.import_bytes`.
2. Desktop: native FileDialog → `FileAccess.open` → `GameState.import_bytes`.
3. `MeshImporter.load_bytes`: detects format by extension and magic bytes. Parses STL (binary + ASCII), OBJ, GLB (via GLTFDocument). All paths → `MeshFactory.weld_triangles` → `normalize_longest` (scales longest axis to 3m).
4. Limits: 20MB file size, 80k triangles max.

---

## 7. Shader Reference

| Shader | Type | Key Uniforms | Notes |
|--------|------|-------------|-------|
| vehicle.gdshader | spatial | albedo, pattern_id (0–11), squash/stretch/lean_amount, boost_glow, dent0–3, dent_count | Vertex deform for squash/stretch/lean. Fragment: 12 pattern branches. Dent spheres → discard. Rim emission. |
| road.gdshader | spatial | hot, pulse | Uses vertex COLOR for tint (ramp=orange, normal=dark). Lane glow animation. |
| sky.gdshader | sky | space | Horizon→zenith gradient. Orange horizon glow when not in space. Procedural stars. |
| terrain.gdshader | spatial | peaks | Vertex displacement (sin waves). Grid emission. Rolling sweep. peaks=1 for mountain ring. |
| shadow.gdshader | spatial | plane_origin, plane_normal, max_lift | Projects mesh onto ground plane. Fade by distance. |
| menu.gdshader | canvas_item | (none) | Radial vignette, rotating sweep, grid lines, horizon band. |

---

## 8. Tag Bitflags (TrackLayouts)

| Const | Value | Meaning |
|-------|-------|---------|
| SOLID | 1 | Drivable surface, gets colliders |
| LIP | 2 | Ascension trigger zone |
| FINISH | 4 | Finish line trigger |
| GAP | 8 | No road segment (jump gap) |
| RAMP | 32 | Ramp surface (orange tint, no curbs) |
| GATE | 64 | Narrow gate section |

---

## 9. Collision Layers

| Layer | Bit | Used By |
|-------|-----|---------|
| 1 | 0 | Road/ground StaticBody3D |
| 2 | 1 | Player Vehicle (RigidBody3D) |
| 3 | 2 | BooleanBarrier StaticBody3D |
| 4 | 3 | Rival CharacterBody3D |

Vehicle collision_mask = layers 1,3,4. Rival collision_mask = layers 2,3.

---

## 10. Upgrade Catalog (roguelite)

| ID | Title | Effect | Unique | MaxStack |
|----|-------|--------|--------|----------|
| shed | Shed plating | mass×0.82, integrity−12 | yes | 1 |
| stretch | Stretch gears | speed×1.12, yaw×0.86 | no | 3 |
| wide | Wide stance | grip×1.22, yaw×1.1, speed×0.94 | no | 3 |
| nitro | Nitro bottle | +1 nitro charge | no | 3 |
| repair | Repair putty | integrity+36, clear dents | no | 2 |
| downforce | Downforce | grip×1.28, launch×0.78, downforce=1.35 | yes | 1 |
| feather | Feather shell | mass×0.85, spring×0.75, launch×1.12, downforce×0.45 | yes | 1 |
| gyro | Gyro fins | upright×1.4, yaw×0.9 | yes | 1 |
| ram | Ram bar | smash_xp×1.6, knockback×1.45, mass×1.1 | yes | 1 |
| tricks | Trick suspension | trick_xp×1.6, spring_damp×0.7 | yes | 1 |
| burner | Afterburner | accel×1.25 | no | 3 |
| slip | Slipstream | behind rivals → speed×1.14 | yes | 1 |
| magnet | Magnet tires | grip×1.35 when slow | yes | 1 |
| lighten | Lighten frame | mass×0.9 | no | 3 |

---

## 11. Vehicle Stats Formulas (VehicleStats)

```
mass     = clamp(L * W * H * 1.6, 0.45, 7.5)
top_speed = 36 * (L / 3.0) / (1 + 0.45 * W * H)
accel    = 34 / mass
grip     = 6.5 * (W / 1.2) * (0.55 / H)
yaw      = 2.2 * (W / L) * (0.55 / H)
launch   = top_speed² / mass
```

Ascension threshold: `launch ≥ 175`, speed ≥ 18 m/s.

---

## 12. Web Export

- Export preset: "Web" platform, custom shell `res://web/shell.html`.
- Output: `play/` directory (`.gdignore` prevents Godot import).
- `shell.html` references `boot.js` + `style.css` + `$GODOT_URL` (engine JS).
- `boot.js`: creates Engine, starts game with progress bar, removes status overlay on load.
- Threads disabled (`GODOT_THREADS_ENABLED = false`).
- To export: `Godot_v4.7.2-stable_win64_console.exe --headless --export-release "Web"` from project root.

---

## 13. File Persistence (user://)

| File | Contents |
|------|----------|
| user://car.res | Saved ArrayMesh resource |
| user://car.cfg | euler, color, pattern_id |
| user://profile.cfg | runs, ascents, best_launch, best_xp, best_distance |

On web these map to IndexedDB via Godot's virtual filesystem.

---

## 14. Input Map (runtime-defined)

| Action | Keys |
|--------|------|
| throttle | W, Up |
| brake | S, Down |
| left | A, Left |
| right | D, Right |
| boost | Shift |
| respawn | R |
| pause | Escape |

Gamepad: left stick X = steer, left stick Y = throttle/brake.

---

## 15. Pattern IDs (vehicle shader)

| ID | Name | Animated |
|----|------|----------|
| 0 | Solid | no |
| 1 | Checkers | no |
| 2 | Racing stripes | no |
| 3 | Carbon | no |
| 4 | Scales | no |
| 5 | Camo | no |
| 6 | Scrolling stripes | yes |
| 7 | Pulse | yes |
| 8 | Plasma | yes |
| 9 | Hologram | yes |
| 10 | Flame lick | yes |
| 11 | Scanlines | yes |

---

## 16. Design Quality Notes (Historical Godot 4.7 Reference)
*(Historical Note: The shortcomings listed below applied to the archived Godot 4.7 implementation and have been completely resolved and superseded by the active Three.js r160 production engine.)*

### Menu
- menu.gdshader is a dim radial vignette + faint grid. Reads as a dark flat screen.
- Title is plain Label with font_size 48, no glow/particles/animation.
- Buttons are small rectangles with no hover animation beyond color swap.

### Garage
- Dark flat ColorRect background, no atmosphere or lighting interest.
- Stats bars are flat ColorRects with no animation.

### Race World
- Ground: a single 1800×1800 PlaneMesh at y=−14. terrain.gdshader adds subtle dune displacement + grid emission, but it's far below the road and barely visible.
- Mountain ring: a simple triangle fan of 36 segments at radius ~340–520. Single flat color (0.28, 0.12, 0.22). No texture variation.
- Road: flat quads with thin center stripe and small curbs. No edge markings, rumble strips, or texture detail.
- No roadside decoration (trees, rocks, signs, spectators).
- No particle effects for tire dust, boost exhaust, or impact sparks (only chip debris on hit).
- Sky shader is serviceable but minimal. No clouds, no sun disc.
- Lighting: one warm directional + one cool fill + ambient. No dynamic shadows (all shadow_enabled=false for perf on web).

### General
- All UI is built entirely in GDScript _ready() with no .tscn node trees. Scene files are bare roots with a single script attachment.
- No audio beyond procedural blips (Sfx generates sine/noise wav at runtime). No engine sound, no music.

---

## 17. Three.js Engine Machine Specifications & Agent Reference

### 17.1 Module Hierarchy & Dependency Graph
```
index.html (Entry DOM, HUD layout, Compositor Overlay #launch-compositor-overlay, Canvas #compositor-canvas)
  │
  ├── main.js (GameApp: state coordinator, render loop, compositor capture, stepped async loading, escape teardown)
  │     ├── vehicle.js (Unified Vehicle physics, hover springs, pitch/roll attitude, shadows, light mounts)
  │     │     └── vehicle_stats.js (Oriented AABB live physics calculation, mass, top speed, grip)
  │     ├── road_streamer.js (Infinite procedural C1 Hermite spline, chunk lifecycle, stunt cells, scenery attachment)
  │     │     └── terrain.js (Shared getTerrainHeight math across JS & GLSL)
  │     ├── world.js (Atmospheric sky shader, celestial 2800-star dome, sun trajectory, ground mesh)
  │     │     ├── fog.js (Dynamic time-of-day atmospheric fog engine)
  │     │     ├── weather.js (Dynamic precipitation & cloud coverage)
  │     │     ├── grass.js (Multi-ring concentric Ghibli grass, adaptive density, trample flattening)
  │     │     ├── trees.js (5 botanical archetypes, 4-zone radial placement, wind vertex sway)
  │     │     └── props.js (8-PointLight pool, guardrails, chevrons, grandstands, turbines, balloons, rocks)
  │     ├── rivals.js (RivalManager: autonomous waypoint navigation, 2D planar tracking, lane swap, respawn)
  │     ├── hud.js (DOM HUD telemetry, smoothed FPS counter, radar minimap, speedometer/boost canvas gauges)
  │     ├── audio.js (Web Audio API synth: engine harmonics, boost whine, tire skid, chimes)
  │     └── model_loader.js (STL / OBJ / GLTF importers, vertex weld, normalization to 3.0m, pattern generator)
```

### 17.2 Hyperspace Compositor Loading Pipeline
- **State Machine Sequence**:
  `GARAGE` ➔ `GARAGE_LAUNCH` (on click Start) ➔ `RACE` (post stepped loading & dissolve).
- **Phased Launch & Frame Recording Timing**:
  1. $t \in [0.0\text{s}, 1.0\text{s}]$: Vehicle accelerates smoothly forward along neon grid ($0 \to 50\text{ m/s}$), chase camera locked rigidly at `(0, carElev + 2.5, -launchCarDist + 6.2)`. Grid uniform `uSpeed` engages to `4.0`. Display shadow updates to `(0, -0.15, -launchCarDist)`. No recording occurs during platform departure.
  2. $t \in [1.0\text{s}, 2.0\text{s}]$: Frame capture window active (`isCapturingFrames = true`). Every 40ms, downsamples WebGL drawing buffer via:
     ```javascript
     createImageBitmap(this.canvas, { resizeWidth: 960, resizeHeight: 540, resizeQuality: 'medium' })
     ```
     Stores bitmaps in `this.launchBitmaps` without stalling the GPU pipeline.
  3. $t \ge 2.0\text{s}$: Calls `_startPingPongPlayback()`. Mounts `#compositor-canvas` at full window size, starts 24 FPS ping-pong loop (`compFrameIdx += compFrameDir`, reversing at buffer ends).
- **Decoupled Stepped Background Execution**:
  World loading (`_startSteppedLoading()`) ONLY triggers AFTER ping-pong playback is active. Sliced into 10 discrete steps with double `requestAnimationFrame()` yields:
  - Step 1 (14%): Spline generation & RoadStreamer init.
  - Step 2 (26%): World, sky, ground, prop managers construction & shader compile.
  - Steps 3–8 (26%–84%): Incremental build & GPU compilation of grass rings 0 through 5.
  - Step 9 (92%): Player vehicle creation with baked garage rotation matrix, spawn teleport, rival traffic arming.
  - Step 10 (100%): Warp drive ready.
- **Hardware-Accelerated Dissolve**:
  `_finalizeRaceLaunch()` switches state to `RACE`, shows HUD, and runs an 850ms rAF opacity fade with cubic ease-out (`1.0 - Math.pow(1.0 - progress, 3)`). Closes and frees all `ImageBitmap` buffers upon completion.
- **Full Escape / Abort Lifecycle Teardown**:
  Pressing `Escape` during `RACE` or `GARAGE_LAUNCH` invokes `switchState('GARAGE')`. Must perform atomic cleanup:
  - Cancel all running/finished Web Animations on `#launch-compositor-overlay`.
  - Set `overlay.style.display = 'none'`, `overlay.style.opacity = '1'`.
  - Set `pingPongActive = false`, `hasSwappedToCompositor = false`, `isRaceLoaded = false`, `isCapturingFrames = false`.
  - Reset vehicle launch counters: `launchCarDist = 0`, `launchCarSpeed = 0`.
  - Free all stored `ImageBitmap` handles via `bmp.close()`.
  - Reset grid shader uniforms: `uSpeed.value = 0.0`, `uOpacity.value = 1.0`.

### 17.3 Multi-Ring Concentric Grass & WebGL VBO Safety Invariants
- **WebGL Buffer Allocation Ceiling**:
  Windows ANGLE/Direct3D11 fails silently or drops draw calls if a single `BufferGeometry` exceeds ~10M vertices (~20M indices).
- **Adaptive Density Math & Clamping**:
  ```javascript
  const baseCell = ring.cellSize || 0.5;
  const minCell = Math.max(0.20, baseCell * 0.85);
  const maxCell = Math.max(minCell, baseCell * 1.35);
  return Math.min(maxCell, Math.max(minCell, adaptiveCell));
  ```
  *Hard Invariant*: Ring 1 cell size must NEVER be set below `0.20m`. Ring 2 must NEVER be set below `0.45m`.
- **Active Ring Density Profile (`three.js/configure/grass.json`)**:
  - *Ring 1 (Ultra Carpet)*: `patchSize = 140m`, `cellSize = 0.32m`, 4 blades/tuft, `bladeWidth = 0.042m`, fade 36m–70m (~2.7M vertices).
  - *Ring 2 (Fine Meadow)*: `patchSize = 240m`, `cellSize = 0.58m`, 4 blades/tuft, `bladeWidth = 0.054m`, fade 78m–125m (~3.1M vertices).
  - *Rings 3–6*: Distance & horizon billboard tufts extending to 425m, seamlessly meeting atmospheric fog boundary.
- **GLSL Coordinate Space & Radial Fade Rules**:
  - In vertex shader, `origin.xz = mod(origin.xz - uPlayerPosition.xz + halfPatch, uPatchSize) - halfPatch;`
  - Radial distance MUST be evaluated against local patch origin:
    ```glsl
    float distFromCam = max(0.0, length(origin.xz) + radialJitter);
    ```
  - *Fatal Anti-Pattern*: DO NOT evaluate distance using `length(worldXZ - cameraPosition.xz)` because `worldXZ` wraps modulo patch boundaries, causing sharp circular boundary cliffs.
  - Blade taper across ring overlap zones uses `smoothstep(0.0, 1.0, fade)`.
- **Interactive Multi-Vehicle Trample**:
  Shader receives `uPlayerPos` and `uRivalPositions[4]`. Blades within 6.4m radius flatten radially outward:
  ```glsl
  transformed.xz += pushDir * (pushFactor * 3.4);
  ```

### 17.4 Infinite Road Streaming & Stunt Cells
- **Horizon & Retirement Rules**:
  Maintains ~650m active forward track and retires chunks >180m behind player.
- **C1 Hermite Spline Continuity**:
  Point 0 of every newly extruded road chunk is pre-pended with `this.headPos.clone()`. Eliminates road gaps and seam tears.
- **Deep Foundation Berms**:
  Foundation skirts sink 5.5m deep with lateral sampling $\pm 7.5\text{m}$ and $+1.25\text{m}$ clearance over `getTerrainHeight(x, z)`.
- **Catalog of Procedural Stunt Cells**:
  1. `MeadowCruise`: Flowing country rally ribbon with soft grassy shoulders.
  2. `HillClimbDrop`: +35m steep elevation climb with guardrails into a roller-coaster -30m cliff plunge with boost pads.
  3. `SkyLoop`: 360° vertical loop-de-loop suspended in the sky with glowing cyan magnetic guides.
  4. `ChasmJump`: High-speed launch ramp leaping across a 20m canyon air gap.
  5. `MountainChicane` & `BankedVelodrome`: Technical S-bends and 40° banked berms.
- **Subterranean Spawning & Despawning Lifecycles**:
  Chunks and child scenery spawn at $y = -35.0\text{m}$ and smoothly rise to $0.0\text{m}$ over 1.4s with cubic ease-out. Despawning chunks sink to $-35.0\text{m}$ over 1.2s before disposal.

### 17.5 Dynamic Lighting, Shadow & PointLight Invariants
- **PointLight Shader Recompilation Rule (CRITICAL)**:
  NEVER toggle `PointLight.visible = false/true`. In Three.js, changing light visibility modifies `#define NUM_POINT_LIGHTS`, causing full GPU pipeline shader recompilations for every material in the scene (600–920ms frame freeze).
  *Rule*: Keep all 8 pooled lights `visible = true` permanently. Modulate `intensity` (0.0 to 85.0) and position `(0, -999, 0)` to turn lamps off.
- **Native Directional Soft Shadows**:
  Uses `PCFSoftShadowMap` with a 2048×2048 directional shadow frustum centered on the player. Chassis, roadbed (`receiveShadow = true`), and terrain participate.

### 17.6 Vehicle Physics & Slope Dynamics
- **Hover Cushion**:
  4-corner raycasts with spring force, damping, and terrain normal rectification (`if (norm.y < 0.0) norm.negate()`).
- **3D Ground Differential Pitch & Roll**:
  Evaluates terrain/road elevation ahead (+1.6m) and behind (-1.6m):
  ```javascript
  targetPitch = -Math.atan2(frontGround.y - rearGround.y, 3.2);
  ```
  Aligns vehicle parallel to steep climbs and cliff drops without nose-diving.
- **Garage Heading & Orientation Baking**:
  Turntable rotation angles are baked into the cloned geometry vertices via `Matrix4().makeRotationFromEuler(garageEuler)`. Headlights and taillights are calculated from base model bounds and multiplied by the rotation matrix.

### 17.7 Headless Automated Benchmarking Suite
- **Files**:
  `three.js/benchmark.html`, `three.js/run_benchmark.mjs`, `three.js/RunBenchmark.bat`, `three.js/benchmark_report.md`.
- **Command**:
  Run `RunBenchmark.bat` or `node three.js/run_benchmark.mjs` to execute automated 400-frame test drive with autonomous bot.
- **Metrics Collected**:
  Steady-state FPS, 1% lows, draw calls, triangle count, heap memory, and subsystem execution times (GPU render, grass, streamer, physics).

### 17.8 Strict Agent Anti-Patterns (DO NOT DO)
1. **DO NOT run `npm run build` or Vite commands**: The project runs vanilla ESM in browser.
2. **DO NOT spawn browser subagents**: User tests in their browser via numbered test plans.
3. **DO NOT toggle `PointLight.visible`**: Causes massive GPU shader recompilation freezes.
4. **DO NOT read back full-resolution WebGL canvas with `createImageBitmap`**: Stalls GPU pipeline; downsample to 960×540.
5. **DO NOT set grass `cellSize < 0.20m`**: Overflows WebGL VBO vertex limits (>10M vertices).
6. **DO NOT evaluate grass radial distance with wrapped `worldXZ` coordinates**: Breaks radial falloff; use local patch-space `origin.xz`.
7. **DO NOT leave uncleared state on Escape**: Always reset `hasSwappedToCompositor = false`, cancel overlay Web Animations, and close bitmaps in `switchState('GARAGE')`.

