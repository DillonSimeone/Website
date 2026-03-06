# Pony XL Prompt Maker 🎨

A premium, high-contrast prompt builder designed specifically for the **Pony Diffusion XL** ecosystem. This tool simplifies the complex tagging requirements of Pony XL by providing a curated, visual interface for prompt engineering.

---

## 🚀 How Pony XL Works

**Pony Diffusion XL** is a specialized fine-tune of Stable Diffusion XL. Unlike standard models that understand natural language (e.g., "a girl walking in the park"), Pony XL is trained on a massive dataset derived from image boorus (**Danbooru** and **e621**).

### 1. The Quality Token System
The model uses specific "Score" and "Source" tokens to determine quality and style. These are not just suggestions; they are core triggers the model was trained on:
- **Score Tokens**: `score_9`, `score_8_up`, `score_7_up`... These act as quality filters. Higher scores generally yield more "polished" images.
- **Source Tokens**: `source_anime`, `source_cartoon`, `source_furry`, `source_pony`. These steer the model's base aesthetic toward specific media styles.

### 2. Booru-Style Tagging
Pony XL treats every word as a discrete "concept" or "tag."
- **Underscores over Spaces**: The model prefers `looking_at_viewer` over " looking at viewer".
- **Naming Conventions**: Mediums are often explicit, such as `oil_painting_(medium)` or `sketch_(medium)`.

---

## 📊 The "Hard Data" Engine

The "confidence" of this prompt maker comes from real-time and cached data from the sources Pony XL was trained on.

### Tag Popularity (The Tints)
Every tag in the sidebar is color-coded based on its prevalence in the original training datasets. We use strict thresholds to reflect the model's actual training density:
- <span style="color:#00ff88">**Green (Popular)**</span>: **100,000+** posts. The model has seen this concept hundreds of thousands of times; it is highly reliable.
- <span style="color:#ffaa00">**Orange (Uncommon)**</span>: **10,000+** posts. The model understands it well, but composition might be less "automatic."
- <span style="color:#ff4444">**Red (Rare)**</span>: **>0** posts. These are niche concepts. They work, but the model is "guessing" based on limited training data.

### Multi-Source Sync (`update_tags.py`)
The project includes a high-performance Python script that synchronizes the data with live Booru APIs:
1.  **Danbooru API**: Primary source for human and anime tags. Uses `name_comma` for efficient batch matching.
2.  **e621 API Fallback**: Automatically queried for any tags missing from Danbooru or returning 0 counts. Ensures that specialized furry and anthro-specific concepts receive accurate popularity tints.
3.  **Batch Processing**: Fetches counts in groups of 50 to minimize API latency and respect rate limits.

---

## 🏗️ Architecture: JSON-Driven Data

The application uses a modular, decoupled architecture where data is separated from the UI:

### 1. Modular Tag Files (`/tags/*.json`)
Instead of hardcoding hundreds of tags in HTML, they are stored in separate category files (e.g., `clothing.json`, `hair.json`). This allows for:
- **Zero HTML Bloat**: The `index.html` remains a lightweight shell.
- **Easy Expansion**: Add new categories by simply creating a new JSON file.

### 2. Central Manifest (`tags/manifest.json`)
A central manifest file controls the order and visibility of categories. To reorder the sidebar, you only need to change the order of IDs in this file.

### 3. Strict Accordion Sidebar
The sidebar implements a premium accordion UX:
- **Focus**: Only one category is open at a time.
- **Always Active**: A category cannot be closed by clicking its header; it only closes when another is opened. This prevents an empty sidebar state.

---

## ✨ Features

- **Glassmorphic UI**: High-contrast, dark-mode design with vibrant neon accents.
- **Dynamic Data Loading**: Tags are fetched and rendered on the fly from modular JSON files.
- **Draggable Workspace**: Tags in the workspace can be reordered to change prompt weight (earlier tags carry more "weight" in SDXL).
- **Negative Prompt Support**: One-click toggle to manage negative quality triggers separately.
- **Booru Search**: Integrated search bar that pulls official Danbooru tag suggestions in real-time.

---

## 🛠️ Maintenance & Expansion

To add new tags or categories:

1.  **Add/Edit JSON**: Create or modify a `.json` file in the `tags/` directory using the existing schema.
2.  **Update Manifest**: If adding a new category, add its ID to `tags/manifest.json`.
3.  **Run Sync**: 
    ```bash
    python update_tags.py
    ```
    This will batch-process all tags in the JSON files, fetch the latest post counts, and update the popularity classes automatically.
4.  **Refresh**: Your new tags will appear in the sidebar with their correct color tints immediately.
