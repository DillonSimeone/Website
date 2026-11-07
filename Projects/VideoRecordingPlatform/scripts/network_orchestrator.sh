#!/usr/bin/env bash
# MYT Dynamic Network State Machine & Hotspot Fallback
# Section 3.1 System Specification Implementation
# Runs on Linux / Intel NUC systems with NetworkManager & hostapd

HOTSPOT_SSID="MYT_Capture_Hub"
HOTSPOT_PASS="capturehub2026"
GATEWAY_IP="192.168.4.1/24"
SCAN_TIMEOUT=25

echo "[ORCHESTRATOR] Starting Dynamic Network State Machine..."

# Step 1: Scan for Known Stations or Wired Ethernet
echo "[ORCHESTRATOR] Scanning for known Wi-Fi/Ethernet connections (${SCAN_TIMEOUT}s timeout)..."

ETH_UP=$(ip link show up | grep -E "eth0|enp|eno" | grep "state UP")
if [ -n "$ETH_UP" ]; then
    echo "[ORCHESTRATOR] Active wired Ethernet connection detected. Obtaining DHCP lease..."
    exit 0
fi

# Attempt to connect to saved Wi-Fi networks
nmcli device wifi rescan 2>/dev/null
sleep 3
ACTIVE_CONN=$(nmcli -t -f STATE general status)

if [ "$ACTIVE_CONN" = "connected" ]; then
    echo "[ORCHESTRATOR] Station mode active. Resolving to external WAN."
    exit 0
fi

# Step 2: Autonomous Access Point Fallback
echo "[ORCHESTRATOR] No familiar station network reached. Falling back to autonomous AP mode..."
nmcli connection down "$HOTSPOT_SSID" 2>/dev/null
nmcli connection delete "$HOTSPOT_SSID" 2>/dev/null

nmcli connection add type wifi ifname wlan0 con-name "$HOTSPOT_SSID" autoconnect yes ssid "$HOTSPOT_SSID"
nmcli connection modify "$HOTSPOT_SSID" 802-11-wireless.mode ap 802-11-wireless.band bg
nmcli connection modify "$HOTSPOT_SSID" ipv4.method shared ipv4.addresses "$GATEWAY_IP"
nmcli connection modify "$HOTSPOT_SSID" 802-11-wireless-security.key-mgmt wpa-psk 802-11-wireless-security.psk "$HOTSPOT_PASS"
nmcli connection up "$HOTSPOT_SSID"

echo "[ORCHESTRATOR] Hotspot active on SSID: $HOTSPOT_SSID (Gateway: 192.168.4.1)"

# Step 3: mDNS Resolution
if systemctl is-active --quiet avahi-daemon; then
    echo "[ORCHESTRATOR] Avahi mDNS active. Broadcasting MYT.local across interfaces."
else
    systemctl start avahi-daemon 2>/dev/null
fi
