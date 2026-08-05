# Further Suggestions for SIGACCESS 2026 Poster Submission & Web Tool

This document outlines additional suggestions for compressing the academic draft to fit the official ACM single-column template page limits and enhancing the parametric modeling tool.

---

## 1. Academic Paper Optimization (Targeting the 5-Page Limit)

The compiled manuscript PDF in double-spaced single-column format is currently **11 pages**, including the bibliography. To satisfy the ASSETS 2026 Poster session limit of **5 pages** (excluding references), we must selectively compress the text.

### Proposed Trimming Strategy
- **Trim Section 2 (Related Work)**: Reduce the review of generic DMIs (Digital Musical Instruments) and 3D printing literature by roughly 50%. Focus strictly on the intersection of parametric customization and physical motor adaptations.
- **Merge Subsection 3.2 (Mounting Modes) and 3.3 (Mutation Engine)**: Condense these sections into concise paragraphs. Much of the mutation logic can be summarized in a table or single list rather than long narrative blocks.
- **Shorten Section 4 (Engineering Evaluation)**:
  - The mechanical torque physics equations are highly informative but can be stated more concisely in a single sentence referencing the leverage ratio.
  - Trim the detailed material properties analysis. Focus on the core recommendation (e.g., using PETG for sleeves and PLA for swap-ins) rather than explaining print dynamics.
- **Consolidate Section 5 (Discussion)**:
  - Condense the "Parametric Flexibility and User Agency" subsection. While philosophically rich, it can be tightened to highlight the direct impact of hands-free design.
  - Shorten the "Limitations and Future Work" subsection by merging paragraphs.

---

## 2. Web Tool Enhancements

To make the browser-based parametric suite a world-class accessibility tool and a standout demonstration for SIGACCESS, we suggest the following features:

### A. Focus State Styling (Keyboard Accessibility)
- **Problem**: For users operating the tool via platform-level Switch Control (head-tracking, facial gestures, blow switches), visual focus states are critical to understanding which slider or button is selected.
- **Recommendation**: Add high-contrast glowing borders to interactive elements on focus:
  ```css
  input:focus, select:focus, button:focus, .shape-btn:focus {
    outline: 2px solid #00f2ff;
    box-shadow: 0 0 10px rgba(0, 242, 255, 0.6);
  }
  ```

### B. 2D Vector Exports (Laser Cutting / CNC Routing)
- **Problem**: Some users or makerspaces may not have access to a 3D printer but have a laser cutter or CNC router. Accessible grips can be cut out of wood, acrylic, or thick felt.
- **Recommendation**: Add a **SVG/DXF Export** button that outputs a 2D profile projection of the custom knob shape. This expands the utility of the parametric design suite beyond 3D printing to sub-millimeter subtractive fabrication.

### C. Preset Share/Save Feature
- **Problem**: Users designing complex knobs want to save their current custom parameters without exporting a full STL.
- **Recommendation**: Implement a **Share URL** button. In JavaScript, construct a share link containing the encoded base64 parameters in the query string:
  `http://localhost:3000/knob-parametric.html?cfg=ey...`
  On load, parse the URL query parameters and automatically load the custom config.

### D. Multi-Shaft Configuration Support
- **Problem**: Synthesizers use different shaft types (D-shafts, knurled split shafts, round solid shafts).
- **Recommendation**: Add a dropdown selecting the shaft type:
  - *D-Shaft*: Generates the flat locking bore (as currently implemented).
  - *Knurled (18-tooth or 24-tooth)*: Generates a splined interior bore.
  - *Solid Round*: Generates a clean cylindrical bore (requires set-screw).
