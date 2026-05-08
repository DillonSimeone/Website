# Project: Fan Duct Works (Parametric Adapter)

This project provides a parametric 3D model for adapting fans into ductworks. The design features a slide-in slot that allows for tool-less fan installation and removal, perfect for rapid prototyping or maintenance-heavy systems.

## 🚀 Design Philosophy
- **Screw-less Integration**: Fans slot directly into a precision-engineered housing between two ducts.
- **Universal Adaptability**: Adjust duct diameters, fan dimensions, and wall thicknesses to match any standard or custom hardware.
- **Maintenance Friendly**: Slide the fan out for cleaning or replacement without disconnecting the entire duct system.

## 🛠️ Technical Details
- **Kernel**: ForgeCAD (via Manifold WASM).
- **Rendering**: Three.js with Physical materials.
- **Key Parameters**:
    - `Fan Side`: The width/height of the fan housing (e.g., 40mm, 80mm, 120mm).
    - `Fan Thick`: The depth of the fan (e.g., 10mm, 25mm).
    - `Duct Inner D`: The inside diameter of the connected ducts.
    - `Transition`: The length of the organic "Bell Mouth" flare.
    - `Bell Curvature`: Controls the "gentleness" of the curve. Higher values create a more pronounced flare that expands rapidly near the fan, reaching out to the corners for maximum airflow efficiency.
    - `Tolerance`: Adjusts the fit of the slide-in slot.

## 💡 Usage Patterns
1. Measure your fan and duct tubing.
2. Input dimensions into the ForgeCAD Studio panel.
3. Use the `Explosion` slider to visualize the fan fitment.
4. Export the `.STL` for 3D printing.

## 📂 Structure
- `index.html`: The monolithic ForgeCAD application.
- `gemini.md`: This documentation.
