# The Frequency Below — Publishing & Pipeline Guidelines

## 1. Directory & Architectural Invariants (Single Source of Truth)
* **`build/` (Outputs Only):** Canonical home for all generated compilation artifacts:
  - `build/The_Frequency_Below_Manuscript.md`
  - `build/The_Frequency_Below.html`
  - `build/The_Frequency_Below.pdf`
  - `build/The_Frequency_Below.epub`
  - `build/dist/` (channels structured for Butler uploads)
* **`tools/` (Utilities Only):** Strictly for executables, scripts, and source image assets (`butler.exe`, `compile_book.py`, `generate_cover.py`, `push_to_itch.ps1`, cover masters).
* **No Duplicate Artifacts:** Never copy `.epub` or `.pdf` outputs into `tools/`.

## 2. Compilation & Prose Invariants
* **Zero Spoilers in Headings:** Never inject developmental beat outline notes (e.g., *Eli · Fired · No ADA*) beneath chapter titles in book builds or in `Chapters/*.html` reading headers. Keep chapter titles clean and literary.
* **Tag & Spacing Preservation:** Never use raw `get_text(strip=True)` on chapter paragraphs. Always preserve inner HTML tags (`<em>`, `<strong>`) and adjacent spacing to prevent concatenated words.
* **Thematic Asides:** All `<span class="prose-aside">` elements must be compiled into styled block-quotes in HTML, PDF, EPUB, and Markdown.
* **No Em Dashes:** Maintain zero em dashes (`—` / `--`) across all prose; substitute with colons, semicolons, commas, or restructured sentences.

## 3. Marketplace Constraints (itch.io)
* **Cover Dimensions:** Height must never exceed 2,160 px. Standard portrait: 1,250 × 2,000 px. Card preview: 1,260 × 1,000 px (2× retina of 630×500).
* **Automation:** Run `.\tools\push_to_itch.ps1` to upload EPUB and PDF channels via Butler CLI.
