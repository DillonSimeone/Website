00 — MANIFESTO
Most computers assume the world is stable. They assume a wall outlet, a cloud server, a functioning supply chain. The Apocalypse Deck assumes none of those things.
This isn't a survival fantasy. It's a design philosophy: build for the hardest conditions, and the easy ones take care of themselves. Every component decision asks the same question — does this still work when things fall apart?
The result is a machine with no single point of failure for power. Not because the world is ending, but because dependency is a design flaw. A cyberdeck that only runs on USB-C is a cyberdeck that stops at the airport, at the campsite, after the storm.
The Apocalypse Deck is built for agency. Full source access. Field-repairable hardware. Documented schematics. If you can find the part, you can fix the machine.
Core principles:

Accept any source of electricity, not just convenient ones
Squeeze maximum energy from weak or salvaged sources
Every subsystem is replaceable without specialized tools
The aesthetic is earned — nothing is decorative that isn't also functional


01 — THE OMNIVORE
Universal Power Input: 5V to 120V
The defining feature of the Apocalypse Deck is its power front-end. Where a typical cyberdeck accepts one input (usually USB-C 5V), the Omnivore stage accepts virtually anything:
SourceVoltageExampleSalvaged cells1–6VAA batteries, AAA, lantern cellsStandard DC5–24VUSB-A, barrel jacks, car adaptersHigher DC24–72VeBike batteries, solar panels, tool packsExtended DC72–120VIndustrial supplies, wind generator outputAC mains100–120VWall outlet, generator, shore power
How it works:
Every source enters through a wide-input buck-boost converter — a switching regulator that can step voltage up or down to produce a stable internal bus regardless of what came in. This is paired with an MPPT controller (Maximum Power Point Tracker).
MPPT is most commonly associated with solar panels, but the underlying principle applies to any source with internal resistance: a degraded battery, a hand-crank generator, a thermoelectric cell. These sources have a "sweet spot" — a load impedance where they deliver the most power before their voltage collapses. MPPT continuously hunts for that sweet spot rather than applying a fixed load, which means meaningfully more usable energy extracted from weak or unconventional sources.
In plain terms: plug in a stack of old AA batteries that wouldn't run a flashlight anymore, and the Omnivore stage will still find enough juice to keep the deck alive for hours.
AC input (up to 120V) is handled by a bridge rectifier and bulk capacitor ahead of the buck stage, allowing direct connection to wall outlets, small inverters, and AC-output generators without an external adapter.
The entire front-end uses through-hole and large SMD components — deliberately chosen for field replaceability. No proprietary ICs that can't be cross-sourced from any electronics supplier on earth.

02 — NEURAL MESH
Offline-First Networking
A computer that can't communicate is an island. But a computer that requires the internet to function has traded one dependency for another.
The Neural Mesh is the Apocalypse Deck's radio layer: a distributed, infrastructure-free network built on ESP-NOW — a low-overhead protocol that lets devices communicate directly without a router, without a cellular tower, without any fixed infrastructure at all.
Within a mesh network of Apocalypse Decks (or any compatible node), the devices:

Share text, files, and sensor data peer-to-peer
Route packets through each other to extend range
Operate identically whether one other node is present or a hundred

The mesh is supplemented by LoRa (Long Range radio) for low-bandwidth, long-distance links — think kilometers, not meters — suitable for location beacons, status pings, or slow text when nodes are too far apart for ESP-NOW.
For moments when conventional internet is available, a standard WiFi/LTE module bridges the mesh to the wider network — but it's an addition, not a requirement. The deck doesn't wait for it.
This is directly informed by work on PULSE, a distributed haptic broadcast system also using ESP-NOW, which demonstrated that reliable mesh coordination across dozens of nodes is achievable with sub-$5 hardware per node.

03 — REPAIRABILITY
Design for the Person Who Will Fix It
The most sustainable computer is the one that gets repaired instead of replaced.
Every assembly decision in the Apocalypse Deck prioritizes the person who will open it in the field — possibly under stress, possibly without their full toolkit, possibly years from now when the original builder isn't available.
How this shows up in practice:
Modular subsystems. Power, compute, display, radio, and input are separate boards connected by documented headers. A failed power board doesn't strand the compute. A cracked display doesn't brick the device.
Documented everything. Full schematics, BOM with cross-reference alternatives, assembly photos at every step. Not as an afterthought — as a deliverable equal in importance to the hardware itself.
Common fasteners. M3 screws throughout. No security bits, no proprietary clips, no glued assemblies.
Component selection policy. Where a specialized IC and a discrete solution both work, the discrete solution is preferred. Where an IC is necessary, it must be available from at least three independent suppliers. JLCPCB basic parts list is the sourcing baseline — if it's on that list, it's replaceable anywhere on earth.
The case. 3D printed in PLA using a closed recycling loop — failed prints and retired cases go back to filament. Print files are open. Any FDM printer can produce them. Tolerances are documented, not assumed.

04 — ADAPTIVE COMPUTE
Right-Sized Processing for the Task
The compute layer isn't fixed. The Apocalypse Deck is designed around a carrier board that accepts swappable compute modules — currently targeting the Raspberry Pi CM4 family, with the footprint and power budget accommodating alternatives.
This means the same chassis can run:

A lightweight communications node (minimal compute, maximum battery life)
A full Linux workstation with display and keyboard
A sensor aggregation hub for field data collection
A creative instrument running audio, visual, or haptic software

Power scaling is automatic. The Omnivore front-end and MPPT stage report available power to the compute module, which adjusts clock speed and peripheral power accordingly. When input is weak (a single solar panel at dusk), the deck throttles gracefully and keeps core functions alive. When input is strong, full performance is available.
The operating environment is intentionally minimal — a terminal-first interface with a custom status layer (the APOCALYPSE_OS HUD) showing live power telemetry, mesh bandwidth, and system state. Graphical desktop mode is available but optional. The deck is fully operable without it.
The HUD is also a diagnostic tool. The live readout of INPUT_V, LOAD_W, and EFFICIENCY isn't decorative — it tells the operator exactly what the power system is doing, which is critical for making decisions about workload when running on a constrained source.