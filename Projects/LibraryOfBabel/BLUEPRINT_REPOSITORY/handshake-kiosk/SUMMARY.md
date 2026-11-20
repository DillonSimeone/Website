# Handshake Kiosk — One-Page Summary

## Headline

A zero-touch ASL translation kiosk that replaces $70,000/year in interpreter subscription fees with a $4,800 piece of wall-mounted infrastructure.

---

## The Problem

A deaf patient arrives at an ER at 3 am. The hospital's video interpreter contract covers day hours only. The nurse spends 11 minutes loading a tablet app, the connection drops twice, and critical triage questions about medication allergies and onset time are answered late. The same failure plays out at airport gates, courthouse intake desks, and DMV counters across the country — every time a deaf person needs to interact with an institution that hasn't staffed a human ASL interpreter for that shift. Video Remote Interpreting (VRI) services charge $5–$15 per minute with monthly minimums, and they still require a working tablet, an app login, and a human operator on the other end of a call. There is no zero-touch, always-on hardware solution at a price institutions can justify.

---

## The Solution

Handshake Kiosk is a wall-mounted IP65 stainless-steel kiosk that watches a user's hands through a 1080p RGB camera and an Intel RealSense D435i depth sensor, recognizes American Sign Language signs in real time using a MediaPipe Hands + MobileViT-S neural network pipeline, converts the recognized signs to text on a 13-inch sunlight-readable display, and speaks the translation through a directional speaker aimed at the staff member — all without the user touching anything, downloading anything, or waiting for a human operator to connect. It runs 24/7, tolerates hospital disinfectants, and pushes health and error telemetry to a remote operator dashboard over Ethernet or LTE backup.

---

## Tech Stack (one line per layer)

- **Sensors:** Sony IMX415 1080p RGB camera + Intel RealSense D435i stereo depth
- **Compute:** NVIDIA Jetson Orin Nano 8GB (40 TOPS, 10 W TDP, fanless passive cooling)
- **Vision AI:** MediaPipe Hands keypoint extraction + MobileViT-S TensorRT INT8 ASL classifier (~200 signs + fingerspelling fallback, 25 ms/inference)
- **Audio output:** coqui-TTS VITS model offline (40 ms) → directional parametric speaker array; Amazon Polly cloud fallback
- **Enclosure:** 316 stainless steel 2mm sheet, IP65, anti-microbial vinyl wrap, 6mm AR-coated tempered cover glass, UV-C idle sanitization
- **Dashboard:** MQTT telemetry → Node.js operator dashboard; no video, no audio recorded — HIPAA/GDPR by design

---

## Economics

| Metric                            | Value                    |
|-----------------------------------|--------------------------|
| Total COGS (@ 1k units)           | ~$1,589 per unit         |
| Retail MSRP                       | $4,800 per unit          |
| Gross margin (direct)             | ~67%                     |
| SaaS layer (dashboard + updates)  | $1,200/unit/year         |
| Break-even vs VRI (hospital ER)   | ~32 days of equivalent usage |
| US TAM (Fermi)                    | ~13,000 units / ~$62M hardware |
| 5-year deployment target          | ~1,500 units             |

---

## Why Now

Three converging factors make 2025–2027 the right deployment window. First, the Jetson Orin Nano (released 2023) is the first sub-$200 compute module capable of running a production-quality ASL classifier at 30 fps within a 10 W passive thermal envelope — previous generations required active cooling or compromised accuracy. Second, MediaPipe Hands reached production stability and permissive Apache 2.0 licensing in 2022, eliminating the need for a proprietary hand-tracking pipeline. Third, post-COVID institutional awareness of contactless interfaces is at an all-time high, and ADA enforcement actions against healthcare institutions for inadequate interpreter access have increased — institutions are looking for defensible infrastructure, not subscription workarounds.

The product has no direct hardware competitor. The incumbent is a phone call.
