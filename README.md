# Dillon Simeone | Portfolio & Haptic Lab

[![Vite Build](https://github.com/DillonSimeone/Website/actions/workflows/deploy.yml/badge.svg)](https://github.com/DillonSimeone/Website/actions/workflows/deploy.yml)

A high-performance, modular portfolio showcasing innovation at the intersection of accessibility, haptics, and embedded engineering.

---

## 🚀 Overview
This repository contains the source code for my portfolio website. More than just a static page, this project is a testbed for extreme performance optimization and modular content management. 

I am a **Deaf engineer, maker, and designer** specializing in haptic feedback systems and accessibility technology. This site reflects that multidisciplinary approach, combining sleek aesthetics with rigorous technical foundations.

### Key Features:
- **Modular Content Architecture**: Projects are managed as standalone HTML fragments in `src/content/`, dynamically injected via Handlebars.
- **"Black Ice" Design System**: A high-contrast dark mode with neon accents, optimized for visual clarity and aesthetic impact.
- **Extreme Minification**: Powered by Vite and `vite-plugin-singlefile`, the entire production site is bundled into a single, highly-compressed `index.html`.
- **Haptic Shop**: A direct-to-maker storefront integrated with Stripe for hardware prototypes and art pieces.
- **Performance-First Background**: Uses static SVG "skeletons" with real-time color re-skinning to achieve 60FPS animations with ~0% CPU overhead.

---

## 🛠️ Tech Stack
- **Core**: HTML5, Vanilla JavaScript, CSS3
- **Build Engine**: [Vite](https://vitejs.dev/)
- **Templating**: Handlebars
- **Plugins**: 
  - `vite-plugin-singlefile`: Inlines all assets into one file for the final build.
  - `vite-plugin-handlebars`: Manages modular content injection and HMR.
  - `vite-plugin-minify`: Strips whitespace, comments, and console logs.
  - `Terser`: Advanced JS compression for production.

---

## 📂 Project Structure
- **`src/`**: Source files.
  - **`content/`**: Categorized project cards (`laser/`, `3dprinting/`, `esp32/`, `shop/`).
  - **`partials/`**: Reusable UI components like navigation and the hero section.
  - **`scripts/`**: Modular logic for theme management and animations.
  - **`styles/`**: Centralized CSS with theming variables.
- **`public/`**: Static assets, including mini-projects, images, and research PDFs.
- **`dist/`**: Automated production build output.
- **`legacy/`**: Preservation of original root files and background regeneration tools.

---

## 👨‍💻 Development

### Prerequisites
- [Node.js](https://nodejs.org/) (Latest LTS)
- NPM

### Commands
```bash
# Install dependencies
npm install

# Start local development server (with HMR)
npm run dev

# Generate production build (dist/index.html)
npm run build
```

### Content Generation
To add a new project or shop entry without manual boilerplate, use the provided utility:
```bash
.\CreateEntry.bat
```
Follow the prompts to select a category, and the script will generate a correctly formatted HTML fragment in the appropriate directory.

---

## 🔬 Research & Accessibility
A core pillar of this portfolio is my work on the **GeLu (GestoLumina) Bracers** and the **PULSE Haptic Ecosystem**. These projects focus on universal music design and environmental awareness for the Deaf community. 

For more details, see the documentation in the **Work** and **Embedded** sections of the site.

---

## 📜 License
© Dillon Simeone. All rights reserved.
