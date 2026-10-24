# Regenerates test/fixtures/qr.json from the python-qrcode reference encoder, so test/qr.test.js can check public/qr.js
# module for module without a QR library in the repo. Needs:  python3 -m venv /tmp/qrv && /tmp/qrv/bin/pip install qrcode
#   /tmp/qrv/bin/python scripts/qr-fixtures.py
# Every entry forces a mask (the reference scores the mask penalty its own way, so the free choice can differ; any mask scans).
import json, os, sys
import qrcode, qrcode.util
texts = {
  "A": range(8),                                                   # version 1
  "https://puppy.appspurt.dev/j/biscuit-sttz": range(8),           # version 3, the real thing
  "https://puppy.appspurt.com/j/jolene-php9": range(8),            # version 3
  "Pōneke puppy school: " + "x" * 60: [0, 5],                      # version 5, multi-byte UTF-8
  "y" * 100: [1, 6],                                               # version 6
  "z" * 130: [2, 7],                                               # version 8, two block groups
  "https://puppy.appspurt.dev/j/" + "w" * 148: [3, 4],            # version 9, version information
  "v" * 213: [0, 7],                                               # version 10, the top, 16-bit length
  "Māori kupu: kurī " * 9: [2, 5],                                 # version 9, multi-byte
}
out = []
for t, masks in texts.items():
    for m in masks:
        q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=0, mask_pattern=m)
        q.add_data(qrcode.util.QRData(t.encode("utf-8"), mode=qrcode.util.MODE_8BIT_BYTE), optimize=0)
        q.make(fit=True)
        out.append({"text": t, "mask": m, "version": q.version, "rows": ["".join("1" if c else "0" for c in row) for row in q.get_matrix()]})
dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "test", "fixtures", "qr.json")
json.dump(out, open(dest, "w"), ensure_ascii=False)
print(len(out), "fixtures ->", dest)
