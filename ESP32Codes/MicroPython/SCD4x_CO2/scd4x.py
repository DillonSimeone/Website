import time
import struct

class SCD4X:
    def __init__(self, i2c, address=0x62):
        self.i2c = i2c
        self.address = address
        self._buf = bytearray(18)
        self.stop_periodic_measurement()

    def _crc8(self, buffer):
        crc = 0xFF
        for byte in buffer:
            crc ^= byte
            for _ in range(8):
                if crc & 0x80:
                    crc = (crc << 1) ^ 0x31
                else:
                    crc = crc << 1
        return crc & 0xFF

    def _write_command(self, command):
        self.i2c.writeto(self.address, struct.pack('>H', command))

    def _read_reply(self, length):
        self.i2c.readfrom_into(self.address, self._buf)
        data = []
        for i in range(0, length * 3, 3):
            value = (self._buf[i] << 8) | self._buf[i+1]
            crc = self._buf[i+2]
            if self._crc8(self._buf[i:i+2]) != crc:
                raise RuntimeError("CRC error")
            data.append(value)
        return data

    def start_periodic_measurement(self):
        self._write_command(0x21B1)

    def stop_periodic_measurement(self):
        self._write_command(0x3F86)
        time.sleep(0.5)

    def get_data_ready_status(self):
        self._write_command(0xE4B8)
        time.sleep(0.01)
        data = self._read_reply(1)
        return (data[0] & 0x07FF) != 0

    def read_measurement(self):
        self._write_command(0xEC05)
        time.sleep(0.01)
        data = self._read_reply(3)
        co2 = data[0]
        temp = -45 + 175 * data[1] / 65536
        hum = 100 * data[2] / 65536
        return co2, temp, hum
