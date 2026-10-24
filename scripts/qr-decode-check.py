# Reads public/qr.js's own SVG output back with a real decoder, the check test/qr.test.js cannot do: that test proves the
# module grid matches python-qrcode, this proves the drawn symbol (quiet zone, white ground, path) decodes to the text.
# zxing-cpp is the decoder family phone camera apps descend from. Needs node, rsvg-convert and:
#   python3 -m venv /tmp/qrv && /tmp/qrv/bin/pip install zxing-cpp opencv-python-headless
#   /tmp/qrv/bin/python -I scripts/qr-decode-check.py
# Every text is drawn with the free mask choice and with all eight masks forced, rasterised at several sizes (an odd
# pixel pitch is the hard case) and read with zxing-cpp. OpenCV's reader, when installed, is reported but not counted:
# it misses some mid-size renders of larger symbols that python-qrcode's own output misses too.
import os, subprocess, sys, tempfile
import cv2, zxingcpp
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
texts = [
  "https://puppy.appspurt.dev/j/abc",                               # version 2, the shortest real join link
  "https://puppy.appspurt.dev/j/biscuit-7k2m9x",                    # version 3, the real thing
  "https://puppy.appspurt.com/j/pepper-and-molly-2026",             # version 4
  "https://puppy.appspurt.com/j/" + "z9" * 20,                      # version 5, the longest join link (40-character code)
  "https://puppy.appspurt.dev/m/" + "a" * 40 + "." + "b" * 43,      # version 7, version information (sign-in links are not drawn, but the encoder allows them)
  "Pōneke tēnā koe 犬 🐶 https://puppy.appspurt.dev/j/x",            # version 4, multi-byte UTF-8
  "a",                                                               # version 1
  "x" * 213,                                                         # version 10, the top
]
sizes = (240, 320, 400, 512, 600, 800, 1000)
node = """
const [qrPath, out, listPath] = process.argv.slice(-3), Q = require(qrPath), fs = require("fs"), texts = JSON.parse(fs.readFileSync(listPath, "utf8"));
texts.forEach((t, i) => {
  fs.writeFileSync(`${out}/t${i}_free.svg`, Q.svg(t, { label: "check" }));
  for (let m = 0; m < 8; m++) { const r = Q.encode(t, { mask: m }), n = r.size + 8; let d = "";
    r.modules.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x + 4} ${y + 4}h1v1h-1z`; }));
    fs.writeFileSync(`${out}/t${i}_m${m}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`); }
});
"""
def zx(img):
    r = zxingcpp.read_barcodes(img, formats=zxingcpp.BarcodeFormat.QRCode)
    return r[0].text if r else None
cv = cv2.QRCodeDetector()
with tempfile.TemporaryDirectory() as tmp:
    import json
    lst = os.path.join(tmp, "texts.json"); json.dump(texts, open(lst, "w"), ensure_ascii=False)
    subprocess.run(["node", "-e", node, os.path.join(root, "public", "qr.js"), tmp, lst], check=True)
    ok = bad = cvmiss = 0
    def check(svg, want, px):
        global ok, bad, cvmiss
        png = svg[:-4] + f"_{px}.png"
        subprocess.run(["rsvg-convert", "-w", str(px), "-h", str(px), svg, "-o", png], check=True)
        img = cv2.imread(png); os.remove(png)
        good = zx(img) == want; ok += good; bad += not good
        if cv.detectAndDecode(img)[0] != want: cvmiss += 1
        return good
    for i, t in enumerate(texts):
        free = [check(os.path.join(tmp, f"t{i}_free.svg"), t, px) for px in sizes]
        forced = [check(os.path.join(tmp, f"t{i}_m{m}.svg"), t, 512) for m in range(8)]
        print(f"text {i} ({len(t.encode('utf-8'))} bytes): free mask " + " ".join(f"{px}:{'ok' if g else 'MISS'}" for px, g in zip(sizes, free)) + "; forced masks at 512: " + " ".join("ok" if g else "MISS" for g in forced))
    print(f"zxing-cpp: {ok} read, {bad} missed (OpenCV, for interest: {cvmiss} missed)")
    sys.exit(1 if bad else 0)
