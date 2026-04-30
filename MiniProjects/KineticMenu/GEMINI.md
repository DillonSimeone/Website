# Kinetic Interface — Approach History

This repository documents the evolution of a high-fidelity, kinetic 3D navigation system.

## 📂 Project Structure

### 1. [Approach1_ShaderLabyrinth](file:///f:/Github/Website/MiniProjects/KineticMenu/Approach1_ShaderLabyrinth/)
The immersive, technical R&D phase focusing on generative depth.
- **Background Engine**: Modular `ShaderBackground` controller.
- **Aesthetics**: 3D Generative (Alchemy, Circuits, Rainbow).
- **Core Technologies**: 
  - **World-Space Projection**: Maps shaders to 3D cube/sphere volumes to enable natural perspective skewing.
  - **Rotational Parallax**: Rolling 3D ray projection that prevents coordinate breakdown and "line stretching."
  - **Velocity-Gating**: Background movement is locked unless camera velocity exceeds a defined threshold (2.0), ensuring static stability during idle states.
- **DEVMODE**: Real-time uniform tuning for font size, zoom, and complexity via a context-aware control panel.

### 2. [Approach2_KineticChoreography](file:///f:/Github/Website/MiniProjects/KineticMenu/Approach2_KineticChoreography/)
The refined production phase focusing on performance and cinematography.
- **Technology**: Mesh-based rasterization + JavaScript Rail Navigation.
- **Aesthetic**: Glowing Geometric Lattice, High-Contrast Lighting, Parallax UI.
- **Key Features**: Dutch Angles, Spring-Snap movement, 20+ Visibility-Aware Orbs.

## 🏁 Entry Point
The root [index.html](file:///f:/Github/Website/MiniProjects/KineticMenu/index.html) serves as a dashboard to launch and compare both approaches.
