# Subsonic Signer — Architecture Blueprint

**Elevator pitch:** Pressure-rated, on-device computer-vision module that recognizes RSTC/CMAS diver hand signals and ASL fingerspelling underwater and relays classifications — not raw video — over a tethered Ethernet uplink to a surface tender's haptic vest.

---

## Problem Statement

Commercial saturation diving is one of the most hazardous industrial occupations on earth. A dive supervisor managing a bell-bounce team at 60 m depth must monitor two or three divers simultaneously through an umbilical camera feed that competes with murk, backscatter, and a 200 ms acoustic delay if voice comms are present at all. When a diver signals distress, abort, or gas-share using RSTC hand signals, the supervisor may be watching a different diver's feed, reviewing the dive plan, or communicating with the diving medical officer. The window between a misread signal and a fatal outcome can be under ninety seconds.

Three user populations face this acutely:

**Commercial dive supervisors on saturation jobs** (North Sea, Gulf of Mexico, offshore Asia-Pacific) oversee divers whose only real-time out-of-band communication channel is hand signals. A missed "I'm low on gas" or "ascend immediately" signal is a fatality. Current tooling — fixed CCTV cameras streamed to a surface monitor — requires continuous human attention and has no alerting layer.

**Deaf-tender / hearing-diver crews** are a growing operational configuration enabled by ADA accommodation in commercial diving and sport-diving instruction. A hearing-impaired surface tender cannot interpret audio alerts from a camera operator; a purely visual channel with no semantic parsing means the tender must maintain unbroken visual contact or rely on a hearing intermediary.

**Search-and-rescue underwater teams** (USCG, USAF pararescue, civilian SAR dive teams) operate in zero-to-low visibility conditions where verbal comms are impossible and diver spacing may prevent direct eye contact. An automated classification relay changes inter-diver signaling from a point-to-point visual act into a broadcast notification to the entire team.

Existing products (Outland Technology UWC series, SubC Imaging Rayfin, Imenco BUC cameras) are high-quality underwater video cameras. They stream raw or compressed video to surface monitors. None perform semantic parsing of hand signals. None produce structured event notifications. None integrate with haptic alert systems. Subsonic Signer is not a camera; it is a diver-state sensor whose output is a classified event, not a pixel stream.

---

## System Block Diagram (ASCII)

```
UNDERWATER (<=60 m)                         TOPSIDE / SURFACE TENDER
+-----------------------------------------+  +---------------------------+
|  STEREO OPTICAL ASSEMBLY                |  |                           |
|  [IMX415 L] [IMX415 R]                  |  |  Tether Termination Box   |
|  Sapphire ports, 90 deg HFOV            |  |  TI DP83822 PHY (topside) |
|         |           |                   |  |  PoE splitter / DC rail   |
|         v           v                   |  |         |                 |
|  [ISP / MIPI CSI-2 x2 lanes]           |  |         v                 |
|         |                               |  |  Surface Linux Host       |
|         v                               |  |  (event demux, logging,   |
|  HOST SoC                               |  |   alert routing)          |
|  Rockchip RV1126 or NXP i.MX 8M Plus   |  |         |                 |
|  |- MIPI CSI-2 input mux               |  |         v                 |
|  |- H.264 HW encoder (debug only)      |  |  [Haptic Vest MCU]        |
|  |- NPU 2 TOPS (RV1126) or 2.3 TOPS    |  |  (tactile-terrain HW)     |
|     (i.MX 8M Plus)                     |  |                           |
|         |                               |  +---------------------------+
|         v                               |
|  [Google Coral M.2 Edge TPU]            |
|  4 TOPS USB/PCIe, TFLite INT8          |
|  (supplementary inference or           |
|   parallel hand-ROI pipeline)          |
|         |                               |
|         v                               |
|  CLASSIFICATION + CBOR FRAMING         |
|  (signal_id, diver_id, xyz_mm,         |
|   confidence, timestamp_ms)            |
|         |                               |
|  [TI DP83822 100BASE-TX PHY]           |
|  [Ethernet-over-shielded-twisted-pair] |
|  <========= 200 m tether =============>|
|                                         |
|  [100 Wh Li-ion Pack + BMS]            |
|  [Passive Al-bulk thermal mass]        |
|  [6061-T6 Al housing, dual O-ring]     |
+-----------------------------------------+
```

---

## Subsystem Breakdown

### Stereo Cameras and Sapphire Optical Port

Each imaging channel uses a **Sony IMX415** 8.3 MP (4K) rolling-shutter CMOS sensor in a custom PCB carrier, driven over MIPI CSI-2 (2-lane per sensor). The IMX415 was selected over the IMX477 (12.3 MP global shutter, used in HQ Pi Cam) because the 415 offers lower read noise at ISO 3200 — critical at 60 m depth where PAR is roughly 1–3% of surface levels — and its 1/2.8" format fits the interocular baseline achievable in a GoPro-footprint housing. The IMX477 remains the fallback if a global-shutter variant becomes necessary to freeze fast hand motion; the mechanical envelope accommodates either.

Stereo baseline is 60 mm (center-to-center). Disparity at arm's length (0.5–1.5 m) resolves to ±15 mm depth, sufficient to assign a classified gesture to one of up to four divers in a 2 m × 2 m spatial cell.

Optical ports are **synthetic sapphire (Al2O3) flat windows**, 25 mm diameter, 3 mm thick, AR-coated for 400–700 nm. Sapphire is chosen over BK7 borosilicate because: (a) Vickers hardness ~2000 HV vs. ~600 HV for BK7, making sapphire essentially immune to fine-sediment abrasive scratching that would degrade optical clarity after dozens of dives; (b) sapphire maintains dimensional stability under 7–10 bar cyclic pressure without the microcrack propagation that degrades BK7 seals; (c) the Mohs 9 surface survives stainless hardware contact during port swaps. A scratch on the port sits in front of the lens and directly occludes the model's input; sapphire justifies the 4× cost premium over BK7 for this application.

### Edge Inference: Coral TPU + Host NPU Trade Study

Three candidate inference paths were evaluated:

**Google Coral Edge TPU M.2 (Accelerator Module)** delivers 4 TOPS at <2 W on INT8 TFLite models. It requires model compilation to the Edge TPU compiler (quantize-then-compile) and only runs the quantized portion; any unsupported ops fall back to CPU. Latency for a MobileNetV3-based gesture classifier at 224×224: ~8 ms per frame.

**Rockchip RV1126 integrated RKNN NPU (2 TOPS)** is embedded in the host SoC, zero additional M.2 slot cost, runs RKNN-Toolkit2-compiled models with INT8/INT16 support. The RKNN toolchain has excellent OpenCV and GStreamer integration but smaller community than TFLite. Latency for equivalent model: ~12 ms per frame.

**NXP i.MX 8M Plus NPU (2.3 TOPS)** uses the Ethos-U NPU under the Arm ML platform, TFLite delegate supported. Best Linux BSP maturity (Yocto meta-imx), easiest to achieve DO-178 adjacent safety documentation. Slightly higher idle power (~1.2 W baseline vs. RV1126's 0.8 W).

**Selected approach:** RV1126 as primary host SoC (lowest idle power, native ISP for MIPI CSI-2, proven in IP camera products at depth after potting) with the Coral M.2 running the hand-region-of-interest (ROI) crop-and-classify pipeline in parallel. This dual-pipeline architecture lets the RV1126 RKNN NPU run stereo disparity and person detection while the Coral handles the higher-accuracy gesture classifier, achieving <20 ms end-to-end on dual 30 fps streams.

### Tether Modem and Physical Layer

The tether is a shielded twisted-pair (STP) Cat5e-equivalent cable rated for saltwater immersion, with an outer polyurethane jacket for abrasion resistance and a Kevlar strength member. Electrical layer uses **100BASE-TX Fast Ethernet** with **TI DP83822HF** PHYs at both ends. The DP83822HF was selected for: cable reach to 150 m (per TI app note SNLA326 using Category-5 STP), integrated cable-diagnostics TDR (useful for troubleshooting underwater tether integrity), 3.3 V I/O compatible with RV1126 RGMII, and <100 mW at full duplex. For tether runs beyond 150 m, a VDSL2 or 10BASE-T1L (IEEE 802.3cg, 1 km over single pair) bridge can be substituted with no firmware change above the PHY layer.

Classification payloads are CBOR-encoded (RFC 7049) structs transmitted as UDP datagrams with sequence numbers and a 100 ms re-transmit. A topside Linux host demultiplexes events by diver_id and routes to the haptic vest via the tactile-terrain vest MCU protocol.

### Pressure Housing

Housing is machined from **6061-T6 aluminum** billet: hard-anodize (MIL-A-8625 Type III, 25 µm) followed by PTFE impregnation for saltwater corrosion resistance. The housing is designed for 10 bar working pressure (100 m equivalent) with a 1.5× safety factor to 15 bar proof-test. **Dual O-ring face-seal** on the rear bulkhead (AS568-series nitrile primary, EPDM secondary) plus a single O-ring on each sapphire port retainer ring. O-ring grooves per AS4716 tolerances. A sacrificial zinc anode is bonded to the housing exterior to suppress galvanic corrosion when mounted to a stainless lift line or cage.

### Thermal Management

The RV1126 dissipates ~3 W under full load; the Coral TPU ~2 W. Total internal dissipation: ~6–7 W worst case. At 60 m, water temperature is typically 4–15°C, providing a large thermal delta. The housing acts as a **passive aluminum heat spreader**: a copper thermal interface pad couples the SoC and TPU die to the housing floor (thermal resistance ~1.5°C/W housing-to-water). At 7°C water and 7 W dissipation, junction temperature is approximately 7 + (7 × 1.5) = 17.5°C — well within silicon limits. No active cooling or phase-change fill is required for the operational dive profile. Topside storage at 50°C requires the unit be shaded or placed in a cool environment; the housing will equilibrate to ambient with all electronics off, no damage risk.

### Battery and Power

**Internal pack:** 6 × Sony US18650VTC6 cells (3000 mAh, 3.6 V nominal) in 3S2P configuration: 10.8 V nominal, 6 Ah = **64.8 Wh** (derated to 62 Wh usable at 25°C). A second tray accommodates 3S3P (97.2 Wh, rounding to the marketed 100 Wh). BMS IC: **TI BQ77915** with pressure-rated vent holes sealed with hydrophobic Gore-Tex membrane vents (allow gas egress if a cell vents, block water ingress). Tether PoE (802.3af, 12.95 W budget) supplements or fully replaces internal pack during surface-supplied operations.

At typical 4.5 W system load: **100 Wh / 4.5 W = ~22 hours** operational. At worst-case 8 W: ~12.5 hours — covers a full saturation bell run (typically 6–8 hours per bell bounce).

---

## Power Budget

| Subsystem | Typical (mW) | Worst Case (mW) |
|---|---|---|
| RV1126 SoC (dual CSI active, NPU 50%) | 1800 | 3200 |
| Coral Edge TPU M.2 | 1000 | 2000 |
| IMX415 × 2 (30 fps, full-res) | 400 | 600 |
| DP83822 PHY + magnetics | 100 | 120 |
| BMS + fuel-gauge | 50 | 80 |
| LED indicator (status) | 20 | 50 |
| Misc. LDO quiescent | 100 | 150 |
| **TOTAL** | **3470 mW** | **6200 mW** |

Battery life (100 Wh pack): **~28 hr typical / ~16 hr worst case**

---

## Environmental Specification

| Parameter | Value |
|---|---|
| Operational depth | 60 m (6 bar gauge, ~7 bar absolute) |
| Survival depth | 100 m (10 bar gauge), proof-tested to 15 bar |
| Ingress protection | NEMA 6P (IP68 equivalent), saltwater rated |
| Operating temperature (water) | 0°C to 30°C |
| Storage temperature | -20°C to 50°C |
| Corrosion resistance | 6061-T6 + MIL-A-8625 Type III hardcoat + zinc anode |
| Shock | MIL-STD-810H Method 516 (30 g, 11 ms half-sine) |
| Vibration | MIL-STD-810H Method 514 (deck crane transport) |

---

## Firmware Architecture

**OS:** Yocto Project (Kirkstone LTS) with meta-rockchip BSP layer. Kernel 5.10 LTS. Systemd unit files manage pipeline lifecycle.

**Imaging pipeline:** GStreamer 1.20 pipeline: `v4l2src (left) → tee → appsink (inference) + fakesink; v4l2src (right) → tee → appsink (disparity) + fakesink`. A custom GStreamer plugin (`gst-rknn-infer`) calls into RKNN-Toolkit2 runtime for person-detection on the RV1126 NPU; detected bounding boxes are cropped and fed to the Coral TFLite runtime via `libedgetpu` for gesture classification.

**Models:**
- Person/hand detector: MobileNetV3-SSD INT8, 300×300 input, RKNN compiled
- Gesture classifier: EfficientNet-Lite1 INT8, 224×224 input, Edge TPU compiled; covers 40 RSTC/CMAS signals + 26 ASL fingerspelling letters

**Stereo disparity:** OpenCV StereoBM or StereoSGBM on RV1126 CPU cores (NEON-optimized); outputs sparse disparity map used only for diver XYZ assignment, not dense reconstruction.

**Output protocol:** CBOR-encoded struct per event:
```
{ signal_id: u16, diver_id: u8, x_mm: i16, y_mm: i16, z_mm: u16,
  confidence: f32, timestamp_ms: u64, frame_seq: u32 }
```
Transmitted as UDP/IPv4 on port 5150. Topside host ACKs; missing ACK triggers 3× retransmit at 100 ms intervals.

**OTA updates:** SWUpdate with dual-copy rootfs on eMMC. Factory reset via recessed button on rear bulkhead.

---

## Top 5 Risks and Mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Sediment / low visibility degrading CV accuracy** — turbid water or backscatter can drop usable frame rate to near zero, causing the model to output no classification or random noise | Confidence threshold gating: events with confidence <0.75 are held; three consecutive sub-threshold frames trigger a "visibility degraded" event to topside rather than a false classification. Fallback: surface tender is audibly/haptically alerted to switch to manual monitoring mode |
| 2 | **Sapphire port scratching or crazing** — despite hardness, point-impact from tank hardware or cage bars can chip the port edge | Recessed port geometry (sapphire sits 1.5 mm below housing face); stainless protective bezel ring; replacement ports are field-swappable with O-ring seal in 5 minutes |
| 3 | **Model accuracy on CMAS dialect variants** — RSTC and CMAS signal vocabularies have regional execution variants (e.g., "OK" signed with one hand vs. two); a model trained on one set misclassifies the other | Training dataset must include labeled footage from RSTC, CMAS, and NAUI instructors across at least 3 geographic regions. Model ships with a calibration mode (10-signal enrollment per diver) that fine-tunes the final softmax layer on-device |
| 4 | **Tether fouling or separation** — the umbilical can be cut by cage edges, prop wash, or entanglement; loss of tether drops Ethernet link, stranding classified events | On tether loss, the device buffers up to 60 seconds of events in RAM and retransmits on link restoration. Acoustic pinger (28 kHz) activates on link-loss >30 s to assist recovery. Unit floats slightly positive when unpowered (foam collar) |
| 5 | **Regulatory compliance (USCG/UK HSE)** — commercial diving operations in US and UK require equipment used in the working dive environment to meet USCG 46 CFR Subchapter V and UK HSE Diving at Work Regulations 1997; a novel electronic device attached to lift lines may require Type Approval | Engage DNV GL (or Bureau Veritas) for Type Approval testing early in production phase. Market initial units as "supervisor's auxiliary monitoring aid, not life-safety equipment" to permit field trials under existing operator authority before formal certification |
