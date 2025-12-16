import network
import time
import secrets
import machine
import ubinascii
import usocket
import struct

hostname = "co2"

def announce_mdns(ip, host):
    # Simple mDNS announcer to broadcast "co2.local"
    # This acts as a backup if the router doesn't resolve the DHCP hostname
    MCAST_GRP = '224.0.0.251'
    MCAST_PORT = 5353
    
    sock = usocket.socket(usocket.AF_INET, usocket.SOCK_DGRAM)
    sock.setsockopt(usocket.SOL_SOCKET, usocket.SO_REUSEADDR, 1)
    
    # Construct a basic mDNS response packet
    # Transaction ID (0), Flags (Answer), Questions (0), Answer RRs (1)
    packet = b'\x00\x00\x84\x00\x00\x00\x00\x01\x00\x00\x00\x00'
    
    # Name: co2.local (3co25local0)
    packet += b'\x03' + host.encode() + b'\x05local\x00'
    # Type: A (1), Class: IN (1), TTL: 120
    packet += b'\x00\x01\x00\x01\x00\x00\x00\x78'
    # Data Length: 4, Address
    packet += b'\x00\x04' + usocket.inet_pton(usocket.AF_INET, ip)
    
    try:
        sock.sendto(packet, (MCAST_GRP, MCAST_PORT))
    except:
        pass
    finally:
        sock.close()

# Connect to WiFi
wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.config(dhcp_hostname=hostname) # Ask router to name us 'co2'

if not wlan.isconnected():
    print('Connecting to WiFi...')
    wlan.connect(secrets.SSID, secrets.PASSWORD)
    
    # Wait for connection
    max_wait = 10
    while max_wait > 0:
        if wlan.isconnected():
            break
        max_wait -= 1
        time.sleep(1)

if wlan.isconnected():
    ip = wlan.ifconfig()[0]
    print('WiFi Connected!')
    print(f'IP Address: {ip}')
    print(f'Hostname: {hostname}.local')
    
    # Announce mDNS a few times to be sure
    for _ in range(3):
        announce_mdns(ip, hostname)
        time.sleep(0.1)
else:
    print('WiFi Connection Failed')
