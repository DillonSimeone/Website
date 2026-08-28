# ESP-NOW Channel Hopping (Light Baton)

The reactive handle broadcasts a single `float` motion energy value (0.0–1.0) over **ESP-NOW** to Ember wearables and other listeners. ESP-NOW only works when the sender and receiver share the **same 2.4 GHz Wi-Fi channel**.

## The problem

| Receiver mode | Typical channel |
|---------------|-----------------|
| Ember AP mode (captive portal) | **1** |
| Ember on home Wi-Fi (STA) | Whatever your router uses (often **6** or **11**) |

A sender stuck on channel 1 will reach AP-mode Embers but miss STA-mode ones on other channels.

The ESP32 has **one radio** — it cannot transmit on all channels at once. The fix is **channel hopping**: send on channel 1, then 2, then 3, … then 11, and repeat.

## Configuration

Edit `src/main.cpp` in the **Configuration** section:

```cpp
constexpr bool CHANNEL_HOPPING = true;   // toggle this
constexpr uint8_t FIXED_CHANNEL = 1;     // used when hopping is off
constexpr uint8_t HOP_CHANNEL_MIN = 1;
constexpr uint8_t HOP_CHANNEL_MAX = 11;
```

| Setting | Meaning |
|---------|---------|
| `CHANNEL_HOPPING = true` | Rotate through channels 1–11; one packet per channel per send interval (~30 ms). |
| `CHANNEL_HOPPING = false` | Stay on `FIXED_CHANNEL` (default 1). |

Rebuild and upload after changing the flag.

On boot, serial (115200 baud) prints either:

- `ESP-NOW: channel hopping ON (channels 1–11)`
- `ESP-NOW: fixed channel 1`

While hopping, the 500 ms debug line includes `ESP-NOW ch: N` for the channel used on the last send.

## How hopping behaves

Every **30 ms** the baton:

1. Sets the radio to the current hop channel
2. Broadcasts `energyLevel` to `FF:FF:FF:FF:FF:FF`
3. Advances to the next channel (wraps 11 → 1)

A full sweep of 11 channels takes about **11 × 30 ms ≈ 330 ms**. Each receiver hears roughly **3 updates per second** on its channel — enough for smoothed motion visuals on Ember.

## Pros and cons

### Channel hopping (`true`) — recommended default

**Pros**

- Works with Ember in **AP mode** (channel 1) and **home Wi-Fi** (any common channel)
- No pairing or per-network configuration
- One firmware build for all setups

**Cons**

- Lower update rate per receiver (~3 Hz vs ~33 Hz on a fixed matched channel)
- Slightly more radio activity (negligible for this payload size)

### Fixed channel (`false`)

**Pros**

- Maximum update rate (~33 Hz) on the chosen channel
- Simplest airtime behavior

**Cons**

- Only reliable when you **know** every receiver’s channel
- STA-mode Ember on a router channel other than `FIXED_CHANNEL` will not receive motion

Use fixed mode when all receivers are on channel 1 (e.g. Ember AP-only deployments), or when you have set `FIXED_CHANNEL` to match your router (check Ember serial: `espnow: listening on channel N`).

## Verifying with Ember

1. Flash updated **Ember** firmware (logs `espnow: listening on channel N`).
2. Flash the baton with `CHANNEL_HOPPING = true`.
3. Open Ember’s **ESP32NOW** tab — motion bar should move when you swing the baton.
4. Test both AP mode and home Wi-Fi if you use both.

If motion works in AP mode but not on Wi-Fi with hopping off, enable hopping or set `FIXED_CHANNEL` to Ember’s reported channel.

## Related projects

- **Ember** — receiver; uses `motion()` in patterns and the ESP32NOW dashboard tab.
- This project — **reactiveHandleLightMotion** — sender; MPU6050 → energy level → ESP-NOW broadcast.
