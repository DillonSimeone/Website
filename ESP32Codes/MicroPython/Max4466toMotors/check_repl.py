import sys
import time

try:
    import serial
except ImportError:
    # If pyserial isn't found, we can't check, so we assume failure/safety.
    print("MISSING_PYSERIAL")
    sys.exit(1)

if len(sys.argv) < 2:
    print("USAGE: python check_repl.py <COM_PORT>")
    sys.exit(1)

port = sys.argv[1]
baud = 115200

try:
    # Open Serial with strict 2-second timeout
    ser = serial.Serial(port, baud, timeout=2.0)
    
    # 1. Send Interrupt (Ctrl-C) to stop any running loops
    ser.write(b'\x03\x03') 
    time.sleep(0.1)
    
    # 2. Send Enter to request a prompt
    ser.write(b'\r\n')
    time.sleep(0.5)
    
    # 3. Read response
    output = ser.read_all()
    
    # 4. Check for MicroPython signatures
    if b'>>>' in output or b'MicroPython' in output:
        print("FOUND")
        sys.exit(0)

    # 5. Last Ditch: Soft Reset (Ctrl-D)
    ser.write(b'\x04') 
    time.sleep(1.0)
    output += ser.read_all()
    
    if b'MicroPython' in output or b'>>>' in output:
        print("FOUND")
        sys.exit(0)
        
    print("NOT_FOUND")
    sys.exit(1)

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
