import sys
import asyncio
from bleak import BleakScanner, BleakClient

DEVICE_NAME = "BioniBLE"
CHARACTERISTIC_UUID = "87654321-4321-4321-4321-cba987654321"

async def main():
    if len(sys.argv) < 2:
        print("Usage: python ble_send.py <choice>")
        return

    choice = sys.argv[1]
    command = None
    if choice == "1":
        command = 0x01
    elif choice == "2":
        command = 0x02
    elif choice == "0":
        command = 0xFF
    else:
        print("Invalid choice")
        return

    print(f"Scanning for {DEVICE_NAME}...")
    device = await BleakScanner.find_device_by_name(DEVICE_NAME, timeout=10.0)
    
    if not device:
        print(f"Device '{DEVICE_NAME}' not found. Make sure it is advertising.")
        return

    print(f"Found {DEVICE_NAME} at {device.address}! Connecting...")
    try:
        async with BleakClient(device) as client:
            print("Connected!")
            await client.write_gatt_char(CHARACTERISTIC_UUID, bytearray([command]), response=True)
            print(f"Successfully sent command: {hex(command)}")
    except Exception as e:
        print(f"Failed to connect or send command: {e}")

if __name__ == "__main__":
    asyncio.run(main())
