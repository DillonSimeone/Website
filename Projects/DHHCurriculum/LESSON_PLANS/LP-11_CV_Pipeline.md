# LP-11 — CV Pipeline: Train Your Own Sign Classifier

**Grade band:** 9-12 (CREATION)
**Duration:** 90 minutes × 4 sessions
**Prerequisites:** LP-07, LP-10.

## Big idea
LP-07 used a fixed list of four handshapes. Now you decide which handshapes the system recognizes — and you train it yourself.

## Learning Objectives
1. Collect a labeled dataset of at least 5 distinct ASL handshapes (≥ 100 samples each).
2. Train a small classifier on hand landmarks (MediaPipe Hands → 21 keypoints → small MLP or k-NN).
3. Report precision, recall, and confusion matrix per class.
4. Deploy the trained model to the CyberDeck's Sign-to-Beat pipeline and validate live.
5. Sign DATASET, LABEL, TRAIN, PRECISION, RECALL, CONFUSION-MATRIX.

## ASL Gloss Vocabulary (new)
DATASET (DATA + COLLECT), LABEL (sticker motion), TRAIN (TEACH-MACHINE), PRECISION (loaned + sign EXACT), RECALL (loaned + sign FIND-AGAIN), CONFUSION-MATRIX (loaned + GRID), MODEL (sign BRAIN-PROGRAM).

## CyberDeck / PULSE Setup
- Preset: `912_CVLab.preset`. Boots Python 3.12 with:
  - `mediapipe`, `numpy`, `scikit-learn`, `onnxruntime`.
  - JupyterLab + a starter notebook.
  - Sign-to-Beat pipeline in inference mode (loads `.onnx` model from a known path).
- USB camera (or built-in CyberDeck camera).
- Optional GPU module on the CyberDeck (for groups training larger models).
- PULSE vest + LED bar to validate inference live.

## Lesson Sequence

### Session 1 (90 min) — Data collection
| Time | Activity |
|------|----------|
| 0:00-0:10 | Greeting; discuss data ethics: who owns these images? (Answer per project policy: the student, stored locally on the CyberDeck, never uploaded.) |
| 0:10-0:30 | Decide as a class which 5+ handshapes to support. Recommend: 5, S, B, V, Y. |
| 0:30-0:80 | Each student records ≥ 100 frames per class, varying angle and lighting. The notebook stores landmark vectors (21 × 3 floats), not images, for privacy. |
| 0:80-0:90 | Inspect collected dataset; identify imbalances. |

### Session 2 (90 min) — Train
| Time | Activity |
|------|----------|
| 0:00-0:15 | Brief on classifier choice: k-NN vs. small MLP; trade-offs in size vs. accuracy. |
| 0:15-0:60 | Train both; record metrics. |
| 0:60-0:85 | Generate confusion matrix; identify worst pair (often B vs. 5). |
| 0:85-0:90 | Decide next steps to improve. |

### Session 3 (90 min) — Iterate + Deploy
| Time | Activity |
|------|----------|
| 0:00-0:30 | Collect targeted additional data for confused pair. |
| 0:30-0:55 | Retrain. |
| 0:55-0:80 | Export to ONNX; deploy to Sign-to-Beat pipeline. |
| 0:80-0:90 | Live test with vest. |

### Session 4 (90 min) — Report
| Time | Activity |
|------|----------|
| 0:00-0:60 | Write a 1,000-word technical report including methodology, metrics, and one limitation. ASL-video version equally acceptable, transcribed via the CyberDeck's on-device speech-to-text + ASL gloss tooling. |
| 0:60-0:80 | Present 5-minute demo to class. |
| 0:80-0:90 | Peer evaluation. |

## Differentiation
- **9-10:** Use the pre-built k-NN classifier; modify hyperparameters only.
- **11-12:** Train a from-scratch MLP, tune hyperparameters, write the deploy script.
- **Mobility-restricted students:** Use a partner's hands or a pre-recorded dataset; perform the analysis role.
- **Hearing peers:** Must collect their own data; no pre-trained shortcuts.

## Safety + Ethics
- All data stored locally on the CyberDeck; nothing leaves the device.
- Each student approves use of their data; can delete at any time.
- Mirrors the data-ethics protocol of the NEA application (p.10).

## Assessment Rubric

| Criterion | 4 | 3 | 2 | 1 |
|---|---|---|---|---|
| **Dataset quality** | 5+ classes, ≥ 150/class, balanced. | 5 classes, ≥ 100/class. | 4 classes, 50-100. | < 4 classes or sparse. |
| **Reported metrics** | Reports precision, recall, F1, confusion. | 3 of 4 metrics. | 1-2 metrics. | None. |
| **Live deployment** | Deployed model works with vest, > 85% acc. | Works > 70%. | Works > 50%. | Fails to deploy. |
| **Report depth** | 1,000+ words + 1 reflection on bias or limitation. | Meets length, partial reflection. | Below length. | Missing. |
| **ASL vocab use** | All 7 new signs. | 5-6. | 3-4. | 0-2. |

**Evidence:** Trained `.onnx` model; notebook; confusion-matrix image; deployment video; report.

## Connections
- TECHNICAL_SPEC §3 (CV pipeline architecture).
- Pillar 4 — students now train, not just modify.
- Direct preparation for NEA scaling phase: students become co-investigators on future iterations.
- **CSTA 3B-AI-10** (AI ethics and bias), **3B-DA-06** (model evaluation).
