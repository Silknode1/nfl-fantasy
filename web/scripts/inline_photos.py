"""Build src/inline-data.json for the single-file preview: league snapshot plus small inlined headshots.

Usage: python scripts/inline_photos.py public/data/fantasy.json src/inline-data.json
Photos: every rostered player plus free agents worth more than 3 points a week, cropped square, 112px WebP.
"""
import base64
import io
import json
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

SIZE = 112


def fetch(url: str) -> str | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (nfl-fantasy personal app)"})
        with urllib.request.urlopen(req, timeout=20) as r:
            img = Image.open(io.BytesIO(r.read())).convert("RGBA")
    except Exception:
        return None
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    img = img.crop((left, 0, left + side, side)).resize((SIZE, SIZE), Image.LANCZOS)
    bg = Image.new("RGBA", img.size, (14, 21, 29, 255))
    bg.alpha_composite(img)
    buf = io.BytesIO()
    bg.convert("RGB").save(buf, "WEBP", quality=68, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def main(src: str, dest: str) -> None:
    d = json.load(open(src))
    wk = d["meta"]["week"]
    def value(p):
        return sum(v for k, v in p["proj"].items() if int(k) > wk) / max(1, d["meta"]["lastWeek"] - wk)
    want = [p for p in d["players"] if p["teamId"] or value(p) > 3]
    with ThreadPoolExecutor(12) as ex:
        results = list(ex.map(lambda p: (p["id"], fetch(p["photo"]) or (fetch(p["headshotAlt"]) if p.get("headshotAlt") else None)), want))
    d["photos"] = {pid: uri for pid, uri in results if uri}
    json.dump(d, open(dest, "w"), separators=(",", ":"))
    total = sum(len(u) for u in d["photos"].values())
    print(f"{len(d['photos'])}/{len(want)} photos, {total / 1e6:.1f} MB of images, wrote {dest}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
