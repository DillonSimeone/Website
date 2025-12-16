from machine import Pin
from time import sleep

led = Pin(8, Pin.OUT) # Blue LED on GPIO 8, active HIGH

# Delay range: from 200ms (slow) down to 10ms (fast/solid)
slow_delay = 0.2
fast_delay = 0.01
steps = 20 # Number of steps to change speed

while True:
    # Speed up (slow to fast)
    for i in range(steps):
        delay = slow_delay - (i * (slow_delay - fast_delay) / steps)
        led.value(1) # ON
        sleep(delay)
        led.value(0) # OFF
        sleep(delay)
    
    # Slow down (fast to slow)
    for i in range(steps):
        delay = fast_delay + (i * (slow_delay - fast_delay) / steps)
        led.value(1) # ON
        sleep(delay)
        led.value(0) # OFF
        sleep(delay)
