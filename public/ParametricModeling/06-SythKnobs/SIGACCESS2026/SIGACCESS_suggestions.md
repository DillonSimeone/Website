# Further Suggestions for SIGACCESS 2026 Poster Submission

This document lists critical suggestions for refining the academic poster submission and the interactive web modeling tool.

---

## 1. Academic Paper Refinements (ASSETS 2026 Posters & Demos)

### A. Adhering to the 5-Page Limit
- **The Issue**: Our compiled single-column draft is currently 11 pages (due to the double-spaced `manuscript` format). For ASSETS 2026, the Posters & Demos limit is **5 pages** (excluding references).
- **Recommendation**: 
  - Condense the text length. A 5-page single-column manuscript allows for roughly **1,500 to 2,000 words** plus two figures.
  - Trim the detailed methodology of the physical fabrication descriptions and shorten the related work section.
  - Alternatively, if the 5-page limit refers to the post-TAPS output (which is double-column), the 11-page double-spaced manuscript will easily fit into a 4-5 page double-column layout. It is highly recommended to contact the Posters Track Chairs to clarify whether the 5-page limit applies to the *single-column submission PDF* or the *final TAPS publication output*.

### B. Add Figure Accessibility Descriptions (`\Description`)
- **The Issue**: The compiler log outputted warnings about images lacking descriptions:
  `Class acmart Warning: A possible image without description on input line 155.`
  `Class acmart Warning: A possible image without description on input line 184.`
- **Recommendation**: ACM TAPS and SIGACCESS require structural alternative text descriptions for all images. Add a `\Description{...}` tag inside the `figure` environment before the `\caption`:
  ```latex
  \begin{figure}[ht]
    \centering
    \includegraphics[width=0.9\columnwidth]{ProfileShapes.png}
    \Description{A grid of six different knob profiles: a 3-sided triangle, a 4-sided square, a 5-sided pentagon, a 6-sided hexagon, an 8-sided octagon, and a 6-pointed star. Each shows a clear geometric outline.}
    \caption{Profile shape options for tactile and visual distinction.}
    \label{fig:profiles}
  \end{figure}
  ```

### C. Compile with BibTeX for Automated Citations
- **Recommendation**: If you expand the bibliography to a separate `.bib` file, make sure to compile using:
  1. `pdflatex ACCESS_KNOB_draft`
  2. `bibtex ACCESS_KNOB_draft`
  3. `pdflatex ACCESS_KNOB_draft`
  4. `pdflatex ACCESS_KNOB_draft`
  This ensures all citations are correctly linked and cross-referenced in TAPS.

---

## 2. Web Tool Enhancements (Blueprint Rendering & Accessibility)

### A. Add an Audio Mute Toggle
- **Concept**: While sound feedback is an excellent accessibility feature, some users may find continuous oscillator tones fatiguing.
- **Recommendation**: Add a small mute/unmute button next to the View buttons in the toolbar:
  - Add `<button class="btn-sm" id="btnAudioToggle" onclick="toggleMute()">Mute Audio</button>`.
  - In JS, set `let audioMuted = false;` and check it inside `playToneForParam()`.

### B. Handle Mobile Vibration Constraints
- **Concept**: The Vibration API (`navigator.vibrate()`) is only available on mobile/touch devices and is often blocked by browsers unless triggered directly within a user-interaction callback.
- **Recommendation**: Keep the short vibration duration ($15\text{--}20\text{ ms}$) but wrap it in a try-catch block to prevent browser crashes on unsupported platforms:
  ```javascript
  function triggerHapticFeedback() {
    try {
      if (navigator.vibrate) {
        navigator.vibrate(15);
      }
    } catch (e) {
      console.warn("Haptic feedback not supported or blocked by user gesture policy", e);
    }
  }
  ```

### C. Preset Customization Profiles
- **Recommendation**: Add more popular synthesizer presets to the "Synth Preset" dropdown (e.g., Korg Volca, Roland Boutique, Eurorack knurled shafts) to save users time measuring custom shafts.
