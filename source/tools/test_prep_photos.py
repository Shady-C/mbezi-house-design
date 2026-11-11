import json, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAMES = [f"IMG_{n}" for n in range(3443, 3511)]

def test_outputs():
    photos = os.path.join(ROOT, "web", "photos")
    for n in NAMES:
        im = Image.open(os.path.join(photos, n + ".jpg"))
        assert max(im.size) == 1600, n
        th = Image.open(os.path.join(photos, "thumbs", n + ".jpg"))
        assert max(th.size) == 320, n
    data = json.load(open(os.path.join(ROOT, "data", "photo-exif.json")))
    assert [d["file"] for d in data] == NAMES
    for d in data:
        h = d["heading"]
        assert h is None or (isinstance(h, float) and 0 <= h < 360)
        assert d["taken"].startswith("2026-11-11T")
