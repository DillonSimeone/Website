# **System Specification: Local-First Multi-Device Video Capture & Automated Sync Engine**

**Version:** 1.0

**Status:** Draft Architecture Specification

**Architecture Model:** Local-First Capture, Asynchronous Background Ingestion, Quota-Managed Cloud Sync

## **1\. Executive Summary**

This document details the system design for a portable field-recording hub running on an Intel NUC (or similar small-form-factor x86 unit). The system provides multi-client browser recording, local zero-loss device capture, synchronized session storage, and scheduled background ingestion to both local storage and cloud distribution endpoints (e.g., YouTube playlists).

&nbsp;

Under this updated operational model, client devices (smartphones, tablets, laptops) record video files directly to local device cache or stream chunks locally, eliminating network packet-drop risks during live matches. Files and scorecards are transferred locally to the NUC when capacity allows, after which an asynchronous cloud-sync daemon uploads sessions as bandwidth and YouTube Data API quotas permit.

## **2\. System Architecture & Core Components**

| Component | Technology / Package | Primary Responsibility |
| :---- | :---- | :---- |
| **Network Orchestrator** | NetworkManager, hostapd, dnsmasq, Avahi | Manages Station (Wi-Fi/Ethernet) and Hotspot fallbacks; advertises mDNS (MYT.local). |
| **Web Application & Gateway** | Node.js / Express or Python FastAPI \+ Caddy | Serves local HTTPS PWA, roster CRUD, scorecard interface, and file-receiver endpoints. |
| **Clock Synchronization Daemon** | Chrony (NTP server) \+ WebSocket ping-pong | Provides millisecond-accurate NUC master clock offsets to recording devices. |
| **Client Capture Engine** | HTML5 MediaStream Recording API (PWA) | Records locally to client device storage in robust chunks (IndexedDB/Blob cache). |
| **Local Ingestion Worker** | Tus-node / Chunked Resumable Ingestion | Transfers completed local recordings from phone to NUC reliably over local Wi-Fi. |
| **Sync Daemon & Quota Manager** | Python / SQLite3 / YouTube Data API v3 | Tracks WAN status, monitors 10,000 unit/day quota, and schedules cloud uploads. |

## **3\. Network & Discovery Layer**

### **3.1 Dynamic Network State Machine**

Upon booting, the NUC runs an orchestration script to establish communication capability without manual display or peripheral connection:

> 1. **Known Station Mode Scan:** Searches for known local Wi-Fi SSIDs or active wired Ethernet connections. If found, obtains DHCP lease and resolves to external internet.  
> 2. **Autonomous Access Point Fallback:** If no familiar network is detected within 25 seconds, switches internal Wi-Fi to Access Point mode (SSID: MYT\_Capture\_Hub). Runs local dnsmasq serving IPs on 192.168.4.0/24.  
> 3. **mDNS & Hostname Resolution:** Runs avahi-daemon broadcasting MYT.local across all active interfaces.

### **3.2 SSL/TLS & Browser Security Layer**

Browsers require secure origins for navigator.mediaDevices.getUserMedia. Plain HTTP connections over local IPs or mDNS block video capture completely.

> * An internal certificate authority (via tools like mkcert) issues a certificate covering MYT.local, localhost, and the AP gateway IP (192.168.4.1).  
> * A lightweight reverse proxy (such as Caddy or Nginx) handles termination, ensuring zero camera permission exceptions on client browsers.

## **4\. Client-Side Capture & Local Persistence Model**

### **4.1 Offline Local Recording Pipeline**

To eliminate video degradation caused by saturated Wi-Fi during live recording, client devices store full-bitrate video directly on the client handset before uploading to the NUC:

> 1. **Pre-Roll Clock Sync:** Client connects to NUC via WebSocket; measures Round-Trip Time (RTT) and determines clock offset ($\\Delta t$) relative to NUC master clock.  
> 2. **Local Capture:** User selects player and begins recording. MediaRecorder captures high-bitrate VP8/VP9 or H.264 video to device RAM and buffers incrementally to IndexedDB in 5-second slice blobs.  
> 3. **Crash Safety:** If network disconnects or browser reloads mid-game, video slices remain preserved in client-side storage until explicitly flushed.  
> 4. **Session Manifest:** A client manifest records start time (NUC-corrected epoch), frame rate, device UUID, and hardware metadata.

### **4.2 Ingestion to NUC (Background Ingestion Queue)**

Once recording ends, or as network conditions permit, the client uploads stored blobs to the NUC over an HTTP chunked/resumable upload endpoint (e.g., Tus protocol). This decouples recording fidelity from instantaneous Wi-Fi signal strength.

## **5\. File Organization & Metadata Schema**

Files written to the NUC's NVMe drive follow a deterministic hierarchy allowing straightforward indexing and programmatic post-processing:

/storage/recordings/  
├── {player\_slug}/  
│   └── {YYYY-MM-DD}/  
│       └── session\_{session\_uuid}/  
│           ├── session\_meta.json  
│           ├── scorecard.json  
│           ├── raw/  
│           │   ├── dev\_{device\_id}\_angle1.webm  
│           │   └── dev\_{device\_id}\_angle2.webm  
│           └── processed/  
│               └── synced\_composite.mp4

### **5.1 Session Metadata Specification (session\_meta.json)**

{  
&nbsp;&nbsp;"session\_uuid": "e3a89f92-7210-4f54-b529-bdfbc9876211",  
&nbsp;&nbsp;"player\_name": "Player One",  
&nbsp;&nbsp;"start\_epoch\_nuc\_ms": 1789218000150,  
&nbsp;&nbsp;"end\_epoch\_nuc\_ms": 1789218320400,  
&nbsp;&nbsp;"devices": \[  
&nbsp;&nbsp;&nbsp;&nbsp;{  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"device\_id": "phone\_pixel7\_a1b2",  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"clock\_offset\_ms": \-42,  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"filename": "dev\_pixel7\_a1b2\_angle1.webm",  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"upload\_completed": true  
&nbsp;&nbsp;&nbsp;&nbsp;},  
&nbsp;&nbsp;&nbsp;&nbsp;{  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"device\_id": "iphone14\_c3d4",  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"clock\_offset\_ms": 118,  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"filename": "dev\_iphone14\_c3d4\_angle2.webm",  
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"upload\_completed": true  
&nbsp;&nbsp;&nbsp;&nbsp;}  
&nbsp;&nbsp;\],  
&nbsp;&nbsp;"sync\_state": "PENDING\_UPLOAD"  
}

## **6\. YouTube Data API v3 Background Ingestion Daemon**

### **6.1 API Quota Economics**

The standard YouTube Data API v3 allocation provides 10,000 units per day (resetting at 00:00 PST). The videos.insert endpoint consumes 1,600 units per upload call.

| Operation | Unit Cost | System Impact |
| :---- | :---- | :---- |
| videos.insert (Video Upload) | 1,600 units | Max 6 individual uploads per 24 hours under default free quota. |
| playlistItems.insert (Add to Playlist) | 50 units | Negligible cost; attaches uploaded video ID to target player playlist. |
| Composite Multi-Angle Render | 0 API units | Local FFmpeg job: stitches multi-angles into 1 video, preserving daily quota. |

### **6.2 Upload Queue State Machine**

The synchronization daemon runs as a persistent systemd service on the NUC, governed by the following operational flow:

> 1. **Connectivity Check:** Daemon verifies public WAN reachability via lightweight HTTP probe.  
> 2. **Quota Evaluation:** Queries local SQLite database for units consumed during the current 24-hour cycle. If remaining quota is \< 1,650 units, daemon enters sleep state until next quota reset.  
> 3. **Job Processing:**  
   * Pulls oldest QUEUED session from database.  
   * Uploads designated video file (individual clip or composite render) using Google API resumable upload protocol.  
   * Adds created video ID to player's specific playlist.  
   * Appends video URL and YouTube ID to session\_meta.json and local scorecard.  
   * Updates queue item status to COMPLETED and logs 1,650 units consumed.  
> 4. **Failure Handling:** Network dropouts during upload trigger exponential backoff without marking the job as failed.

## **7\. Implementation Roadmap**

> 1. **Phase 1 (Base Core):** Set up base OS on NUC with NetworkManager hotspot auto-failover, Avahi mDNS, and Caddy self-signed HTTPS.  
> 2. **Phase 2 (Capture PWA):** Build front-end capture page with IndexedDB chunk buffering, WebSocket clock synchronization, and chunked upload receiver.  
> 3. **Phase 3 (Post-Processing):** Implement automated FFmpeg alignment script that inspects clock\_offset\_ms and outputs synchronized multi-angle playback.  
> 4. **Phase 4 (Cloud Daemon):** Write background Python service for YouTube OAuth2 token renewal, playlist sorting, and daily quota budgeting.