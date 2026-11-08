"""Minimal VIA/Vial raw-HID client for reading/writing keymaps."""
import hid, json, lzma, struct, sys, time

MSG = 32


class Kb:
    def __init__(self, vid, pid):
        d = [x for x in hid.enumerate(vid, pid) if x['usage_page'] == 0xFF60 and x['usage'] == 0x61]
        if not d:
            raise SystemExit(f'no raw hid for {vid:04x}:{pid:04x}')
        self.dev = hid.device()
        self.dev.open_path(d[0]['path'])
        self.name = d[0]['product_string']

    def xfer(self, *data, retries=3):
        buf = bytes(data) + b'\x00' * (MSG - len(data))
        for _ in range(retries):
            self.dev.write(b'\x00' + buf)
            r = self.dev.read(MSG, 2000)
            if r:
                return bytes(r)
            time.sleep(0.1)
        raise IOError('no response to %r' % (data[:4],))

    # --- VIA ---
    def protocol(self):
        r = self.xfer(0x01)
        return (r[1] << 8) | r[2]

    def layer_count(self):
        return self.xfer(0x11)[1]

    def get_buffer(self, total):
        out = b''
        off = 0
        while off < total:
            n = min(28, total - off)
            r = self.xfer(0x12, off >> 8, off & 0xFF, n)
            out += r[4:4 + n]
            off += n
        return out

    def get_key(self, layer, row, col):
        r = self.xfer(0x04, layer, row, col)
        return (r[4] << 8) | r[5]

    def set_key(self, layer, row, col, kc):
        r = self.xfer(0x05, layer, row, col, kc >> 8, kc & 0xFF)
        return r

    def get_encoder(self, layer, idx, cw):
        r = self.xfer(0x14, layer, idx, cw)
        return (r[4] << 8) | r[5]

    def set_encoder(self, layer, idx, cw, kc):
        return self.xfer(0x15, layer, idx, cw, kc >> 8, kc & 0xFF)

    # --- Vial ---
    def vial_id(self):
        r = self.xfer(0xFE, 0x00)
        ver = struct.unpack('<I', r[0:4])[0]
        uid = r[4:12]
        return ver, uid

    def vial_definition(self):
        r = self.xfer(0xFE, 0x01)
        size = struct.unpack('<I', r[0:4])[0]
        data = b''
        page = 0
        while len(data) < size:
            r = self.xfer(0xFE, 0x02, *struct.pack('<I', page))
            data += r
            page += 1
        return json.loads(lzma.decompress(data[:size]))
