import sys
import time
import socket
from stupidArtnet import StupidArtnet

TARGET_IP = '192.168.0.100'
FPS = 30
CHANNELS_PER_UNIVERSE = 512

# Colors to test:
# Port 1 (Universe 0): RED
# Port 2 (Universe 1): GREEN
# Port 3 (Universe 2): BLUE
# Port 4 (Universe 3): MAGENTA
# Port 5 (Universe 4): YELLOW
# Port 6 (Universe 5): CYAN

PORT_COLORS = {
    0: (255, 0, 0),     # Univ 0: RED
    1: (0, 255, 0),     # Univ 1: GREEN
    2: (0, 0, 255),     # Univ 2: BLUE
    3: (255, 0, 255),   # Univ 3: MAGENTA
    4: (255, 255, 0),   # Univ 4: YELLOW
    5: (0, 255, 255),   # Univ 5: CYAN
}

def main():
    print("==================================================")
    print("       Art-Net Port Diagnostic Test Tool")
    print("==================================================")
    print(f"Target Controller: {TARGET_IP}")
    print("Broadcasting test colors:")
    print("  -> Port 1 (Universe 0): RED")
    print("  -> Port 2 (Universe 1): GREEN")
    print("  -> Port 3 (Universe 2): BLUE")
    print("  -> Port 4 (Universe 3): MAGENTA")
    print("  -> Port ? (Universe 4): YELLOW")
    print("\nPress Ctrl+C to stop.")

    clients = {}
    buffers = {}
    for univ, color in PORT_COLORS.items():
        client = StupidArtnet(TARGET_IP, univ, CHANNELS_PER_UNIVERSE, FPS, True, True)
        client.start()
        clients[univ] = client
        
        buf = bytearray(CHANNELS_PER_UNIVERSE)
        # Fill all 170 pixels of the universe with the color
        for p in range(170):
            buf[p * 3]     = color[0]
            buf[p * 3 + 1] = color[1]
            buf[p * 3 + 2] = color[2]
        buffers[univ] = buf

    try:
        while True:
            for univ, client in clients.items():
                client.set(buffers[univ])
                client.show()
            time.sleep(1.0 / FPS)
    except KeyboardInterrupt:
        print("\nStopping diagnostic...")
    finally:
        for client in clients.values():
            client.blackout()
            client.stop()
        print("Done.")

if __name__ == "__main__":
    main()
