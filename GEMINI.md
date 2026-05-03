# Portfolio Website Documentation

## 1. Modular Architecture (Vite)
The website is a modular SPA powered by **Vite** and **Handlebars**. Content is decoupled from the main template for ease of maintenance.

### Project Structure
*   **`src/`**: Source code.
    *   **`index.html`**: The main Handlebars template.
    *   **`partials/`**: Reusable components (`nav.html`, `hero.html`).
    *   **`content/`**: Categorized HTML fragments injected via `vite.config.js`.
    *   **`scripts/`**: Business logic (`indexScript.js`, `background.js`).
*   **`public/`**: Static assets (Images, PDFs, Mini-Projects) served as-is.
*   **`dist/`**: Single-file production build (generated via `npm run build`).

### Content Injection Mapping
The `getCards` helper in `vite.config.js` maps folders to Handlebars variables:
| Folder | Handlebars Variable | Usage |
| :--- | :--- | :--- |
| `src/content/laser/` | `{{laserCards}}` | Laser Cutting section |
| `src/content/3dprinting/` | `{{printingCards}}` | 3D Printing section |
| `src/content/work/` | `{{workCards}}` | Professional works |
| `src/content/mini-projects/`| `{{miniProjectCards}}`| Grid-based mini projects |
| `src/content/esp32/` | `{{esp32Cards}}` | Embedded tech (sorted ASC) |
| `src/content/shop/` | `{{shopCards}}` | Stripe products (sorted DESC) |

---

## 2. Media & Gallery System
Images are handled dynamically in `indexScript.js` via the `initSectionGalleries` function.

### How it works:
1.  **Detection**: The script looks for `.images` or `.medias` containers within project cards.
2.  **Conversion**: If multiple images are found, the script hides the list and generates a **Gallery Thumbnail**.
3.  **Modal**: Clicking the thumbnail opens a high-performance modal gallery (`openGallery`) that supports lazy-loading and staggered entrance animations.

---

## 3. Background Optimization
The background uses high-performance SVG "skeletons" to avoid the heavy math overhead of `trianglify.js` on every load.
1.  **Static Paths**: Stored as strings in `background.js`.
2.  **Thematic Re-skinning**: A random palette is applied to the paths on load.
3.  **Zero Overhead**: CPU usage is ~0% after initial paint.

---

## 4. Shop & Stripe Integration
The shop section uses a modular product system.
- **Product Files**: Located in `src/content/shop/`.
- **Naming**: Use `01-`, `02-` prefixes to control order (Sorted in reverse in `vite.config.js`).
- **Payments**: Uses direct Stripe Checkout links (`buy.stripe.com`).

---

## 5. Development & Build Pipeline
*   **Dev Mode (`npm run dev`)**: The Handlebars `context` is a **function** that re-reads content files on every request, allowing for Hot Module Replacement (HMR) of content fragments.
*   **Single-File Build**: `vite-plugin-singlefile` inlines all CSS, JS, and small assets into a single `dist/index.html` for extreme portability and speed.
*   **Post-Build Cleanup**: Automatically removes `node_modules`, `.pio`, and other build artifacts from sub-project directories in `dist`.

---

## 6. Maintenance Tools
*   **`CreateEntry.bat`**: The recommended way to add new projects. Supports Laser, 3D Print, Work, Mini-Projects, ESP32, and Shop categories.
*   **`RegenerateBackground.bat`**: Located in `legacy/`, used to generate new SVG skeletons if the background layout needs to change.

