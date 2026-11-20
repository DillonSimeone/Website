# Project: 22-hapticZoo1 (Open Underside Cutouts Swamp Biome Plate)

## Overview
A monolithic, single-piece parametric 3D modeling and Web Bluetooth tactile testing environment designed for **The Haptic Petting Zoo** touring exhibition ($96,000 OCF Grant).

This architecture implements a **pure drop-in swamp habitat plate with open underside cutouts directly into each animal's hollow cavity**, sized precisely for the smallest ordered transit case (`216 × 165 × 95 mm`, 11/11 bulk hardware batch EXP-008).

---

## 1. Mechanical & Spatial Architecture

### Transit Case Drop Fit (`216 × 165 × 95 mm`)
* **Plate Elevation**: Dropped **30 mm** from the box bottom (parametric range: 15–50 mm).
* **Headroom (65 mm)**: Plentiful vertical clearance above the animals (which rise 11–15 mm above the plate), leaving ample clearance below the closed case lid.
* **No Box Walls**: Pure drop-in contoured plate ($4.0\text{ mm}$ thickness) with zero vertical skirt walls or bottom ground plate.

### Diagonal Creature Separation
All three creatures are positioned across distinct corners for maximum physical spacing and petting ergonomics:
* 🐊 **Alligator**: Located at the **Bottom-Left (SW Corner)** basking diagonally along the bank.
* 🐢 **Snapping Turtle**: Located at the **Top-Right (NE Corner)** perched on an elevated rock shelf (~140 mm diagonal separation from the Alligator).
* 🐟 **Swamp Fish**: Located at the **Bottom-Right (SE Corner)** swimming through the water lagoon ripples.
* 🌱 **Swamp Scenery**: Central driftwood log dividing the zones and floating lily pads near the lagoon.

### 100% Hollow Open-Bottom Shells & Dorsal Pockets
* **True Open Bottoms**: All planar bottom cap faces have been stripped. The models have a continuous 1.8mm wall thickness forming an upside-down shell, with 92% to 95% of the base area 100% open into the interior cavity.
* **Underbelly Installation Workflow**: Flipping the plate over provides direct visual and physical access into the cavernous hollow belly of the Alligator, the dome of the Turtle carapace, and the fish body.
* **Dorsal Motor Pockets**: Each animal features a cylindrical mounting socket (10.6mm inner diameter, 3.6mm depth) at the highest dorsal ceiling. The 5V coin vibration motors are pressed and glued into these sockets directly from the underbelly.
* **Underbelly Wiring & Reverse Electronics**:
  * Red and black silicone lead wires drop down from each motor into the cavity.
  * Reverse chassis mounts on the plate underside hold the **L298N Mini Dual H-Bridge** driver (`24 × 22 × 8 mm`) and **ESP32-C3 SuperMini** (`18 × 25 × 4.5 mm`).
* **Underbelly Viewport Cameras**: Includes quick-focus camera presets (`🐊 Gator Cavity`, `🐢 Turtle Cavity`, `🐟 Fish Cavity`) and dedicated underbelly cavity spotlights that illuminate the ceiling and wiring when flipped.
* **Monolithic STL Export**: Single-click export merges the plate, hollow creatures, and scenery into a single watertight STL ready for Bambu Studio / PrusaSlicer.

---

## 2. Web Bluetooth (WebBLE) Protocol
* **Device Name**: `HapticZoo-Swamp`
* **Service UUID**: `4fafc201-1fb5-459e-8fcc-c5c9c331914b`
* **Characteristic UUID**: `beb5483e-36e1-4688-b7f5-ea07361b26a8` (Read/Write/Notify)
* **Pinout**:
  * GPIO 0: Alligator (PWM Ch 0) -> L298N IN1
  * GPIO 1: Fish (PWM Ch 1) -> L298N IN2
  * GPIO 2: Turtle (PWM Ch 2) -> L298N IN3
  * GPIO 8: Built-in Blue Status LED
