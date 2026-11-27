# Thresholds — Video Generation Prompts & Guide

This guide contains optimized **image-to-video** prompts for each scene in `Thresholds`. Use these prompts with video models (**Veo in Google AI Studio / Gemini**, **Runway Gen-3**, **Luma Dream Machine**, **Kling AI**, etc.).

### 🚀 Automatic Headless Generation (Local GPU)
You can render all remaining videos automatically using your local **RTX 5060 Ti** via the headless LTX-Video generator in `E:\AI\ImageGeneration`:
```powershell
& "E:\AI\ImageGeneration\venv\Scripts\python.exe" "E:\AI\ImageGeneration\generate_video.py" --thresholds
```
*This will iterate through all 11 remaining passages, generate the video for each, save it directly into `assets/videos/`, and skip any scene that already has a video.*

---

### 📁 Manual Setup Instructions
1. Download each generated video clip from an external service (Veo, Runway, Luma, etc.).
2. Place the video file directly into: `public/MiniProjects/Thresholds/assets/videos/` (or `videos/`)
3. Name each file to match the **Target Filename** listed below (e.g., `candle.mp4`).
4. The site will **automatically detect the video**, cross-fade smoothly from the static image plate once loaded, and transition to black at the end.

> [!TIP]
> **Why Video Models Refuse Certain Prompts:**
> - **Avoid thematic words:** Words like *"death"*, *"dying"*, *"afterlife"*, or *"soul"* often trigger safety filters. Focus purely on **physical actions, light shifts, smoke, camera motion, and wind**.
> - **Match the image:** Ensure prompt descriptions don't contradict the still frame (e.g., if a candle is on a table, don't say *"a person holds the candle"*).

---

## 1. The Extinguished Flame (`candle.mp4`)
* **Base Image:** `assets/candle.jpg`
* **Target Video:** `videos/candle.mp4`
* **Primary Prompt:**
  ```text
  Cinematic slow motion: A small warm flame flickers on the candle wick in the dark dusty room. A faint sudden draft causes the flame to waver and gently blow out. A delicate thread of wispy gray smoke curls upward through the sunbeams. The camera slowly pushes in slightly.
  ```
* **Alternative Ambient Prompt:**
  ```text
  Slow cinematic motion. Dust motes float lazily through the volumetric sunbeams. A faint wispy smoke trail curls upward from the candle wick into the light. Static camera, Rembrandt lighting.
  ```

---

## 2. The Golden Maple Grove (`maple.mp4`)
* **Base Image:** `assets/maple.jpg`
* **Target Video:** `videos/maple.mp4`
* **Primary Prompt:**
  ```text
  Cinematic 35mm film: The cloaked figure slowly walks forward along the mossy path into the dense mountain fog. Vibrant red and orange maple leaves drift down from the branches in a gentle autumn wind. Atmospheric mist rolls between the twisted tree trunks. Slow camera tracking forward.
  ```

---

## 3. Footprints That Cease in Snow (`snow.mp4`)
* **Base Image:** `assets/snow.jpg`
* **Target Video:** `videos/snow.mp4`
* **Primary Prompt:**
  ```text
  Bleak Nordic cinematic realism: Low camera slowly glides forward following the deep footprints across the pristine snow. Wind sweeps fine powder across the snow crust, gently blurring the edges of the impressions. Flurries of snow drift across the cold twilight sky.
  ```

---

## 4. Stepping Into the High Wheat (`wheat.mp4`)
* **Base Image:** `assets/wheat.jpg`
* **Target Video:** `videos/wheat.mp4`
* **Primary Prompt:**
  ```text
  Terrence Malick 35mm cinema aesthetic: Golden hour sunlight. Waves of gentle wind roll through the tall dry wheat field, causing the stalks to ripple and sway like ocean water. The traveler continues walking slowly away into the bright golden horizon. Drifting pollen in the warm sun.
  ```

---

## 5. The Plain of Flowers and the Crossing (`river.mp4`)
* **Base Image:** `assets/river.jpg`
* **Target Video:** `videos/river.mp4`
* **Primary Prompt:**
  ```text
  Atmospheric twilight: The small wooden boat glides smoothly down the calm, mirrored river into the distant pink and purple dusk mist. Gentle ripples expand across the water surface. The field of purple wildflowers along the riverbank sways in the evening breeze.
  ```

---

## 6. The Fog and the Ferryman’s Coin (`ferryman.mp4`)
* **Base Image:** `assets/ferryman.jpg`
* **Target Video:** `videos/ferryman.mp4`
* **Primary Prompt:**
  ```text
  Dark moody cinematic: Cold river water gently laps against the mossy rock. Heavy river fog slowly rolls across the dark water and tall reeds. In the background, the shadowy wooden boat sways subtly on the current. The copper coin catches a subtle glint of cold light.
  ```

---

## 7. The Stopped Escapement (`watch.mp4`)
* **Base Image:** `assets/watch.jpg`
* **Target Video:** `videos/watch.mp4`
* **Primary Prompt:**
  ```text
  Extreme macro photography: The intricate brass clockwork gears and balance wheel spin with steady precision. Suddenly, the balance wheel comes to a smooth halt and stops moving. Subtle dust motes float through the warm window light on the old wooden table.
  ```

---

## 8. The 3:00 AM Streetcar (`tram.mp4`)
* **Base Image:** `assets/tram.jpg`
* **Target Video:** `videos/tram.mp4`
* **Primary Prompt:**
  ```text
  Urban noir cinema: Rain falls steadily onto the wet street, splashing in puddles that reflect the glowing amber streetlights and neon signs. Warm light spills from inside the open streetcar doors into the foggy night air. Subtle water droplets run down the camera lens.
  ```

---

## 9. The Unlatched Cage (`cage.mp4`)
* **Base Image:** `assets/cage.jpg`
* **Target Video:** `videos/cage.mp4`
* **Primary Prompt:**
  ```text
  Poetic twilight cinema: The delicate white feather floats and spirals gently upward in the warm night air, rising past the open brass cage door toward the starry sky and crescent moon. The open cage door rocks slightly on its hinge in the breeze.
  ```

---

## 10. The Shadow at High Noon (`shadow.mp4`)
* **Base Image:** `assets/shadow.jpg`
* **Target Video:** `videos/shadow.mp4`
* **Primary Prompt:**
  ```text
  Searing desert chiaroscuro: Heat shimmer mirage waves ripple across the cracked dry clay and sand dunes. A slow, steady desert wind sweeps fine dust across the ground. The long dark shadow remains sharp and elongated across the white earth under the intense sun.
  ```

---

## 11. The Scent of Stone-Cold Tea (`tea.mp4`)
* **Base Image:** `assets/tea.jpg`
* **Target Video:** `videos/tea.mp4`
* **Primary Prompt:**
  ```text
  Quiet meditative cinema: Gentle wisps of steam curl softly upward from the dark ceramic tea bowl, drifting into the cold mountain air and dissolving. The river below flows steadily through the misty forested ravine in the background. Rain-slicked wet stone.
  ```

---

## 12. The Unraveling Loom (`loom.mp4`)
* **Base Image:** `assets/loom.jpg`
* **Target Video:** `videos/loom.mp4`
* **Primary Prompt:**
  ```text
  Shadowy artisan workshop: Soft dust motes drift through the side window light. The loose hanging crimson and natural wool threads sway gently in a subtle draft. Chiaroscuro Rembrandt lighting, static camera.
  ```
