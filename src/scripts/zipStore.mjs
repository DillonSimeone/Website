const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC_TABLE[n] = c >>> 0;
}

export function crc32(data) {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function dosStamp(date) {
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
    const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, day };
}

/**
 * Uncompressed zip. Parts can be handed to `new Blob(parts)` without
 * copying every file into one more giant buffer first.
 * @param {{ name: string, data: Uint8Array, crc?: number }[]} files
 */
export function buildStoredZipParts(files, date = new Date()) {
    const { time, day } = dosStamp(date);
    const parts = [];
    const centrals = [];
    let offset = 0;

    for (const file of files) {
        const nameBytes = new TextEncoder().encode(file.name);
        const size = file.data.length;
        const crc = file.crc ?? crc32(file.data);

        const local = new Uint8Array(30 + nameBytes.length);
        const view = new DataView(local.buffer);
        view.setUint32(0, 0x04034b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 0x0800, true);
        view.setUint16(8, 0, true);
        view.setUint16(10, time, true);
        view.setUint16(12, day, true);
        view.setUint32(14, crc, true);
        view.setUint32(18, size, true);
        view.setUint32(22, size, true);
        view.setUint16(26, nameBytes.length, true);
        view.setUint16(28, 0, true);
        local.set(nameBytes, 30);

        const central = new Uint8Array(46 + nameBytes.length);
        const centralView = new DataView(central.buffer);
        centralView.setUint32(0, 0x02014b50, true);
        centralView.setUint16(4, 20, true);
        centralView.setUint16(6, 20, true);
        centralView.setUint16(8, 0x0800, true);
        centralView.setUint16(10, 0, true);
        centralView.setUint16(12, time, true);
        centralView.setUint16(14, day, true);
        centralView.setUint32(16, crc, true);
        centralView.setUint32(20, size, true);
        centralView.setUint32(24, size, true);
        centralView.setUint16(28, nameBytes.length, true);
        centralView.setUint16(30, 0, true);
        centralView.setUint16(32, 0, true);
        centralView.setUint16(34, 0, true);
        centralView.setUint16(36, 0, true);
        centralView.setUint32(38, 0, true);
        centralView.setUint32(42, offset, true);
        central.set(nameBytes, 46);

        parts.push(local, file.data);
        centrals.push(central);
        offset += local.length + size;
    }

    const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    endView.setUint16(20, 0, true);

    return parts.concat(centrals, [end]);
}
