"""Make web-sized copies of the house photos and extract EXIF compass headings.

Usage: python3 prep_photos.py SRC_DIR OUT_DIR
Writes OUT_DIR/web/photos/*.jpg, OUT_DIR/web/photos/thumbs/*.jpg, OUT_DIR/data/photo-exif.json.
Originals in SRC_DIR are only read.
"""
import json
import math
import os
import sys

from PIL import ExifTags, Image, ImageOps

LONG_EDGE = 1600
THUMB_EDGE = 320


def _heading(exif):
    try:
        gps = exif.get_ifd(0x8825)
        h = float(gps.get(17))
    except (TypeError, ValueError, KeyError):
        return None
    if not math.isfinite(h):
        return None
    return h % 360.0


def _taken(exif):
    sub = exif.get_ifd(0x8769)
    raw = sub.get(36867) or exif.get(306)  # DateTimeOriginal, DateTime
    if not raw:
        return None
    date, time = str(raw).split(" ")
    return date.replace(":", "-") + "T" + time


def _resize(im, edge):
    out = im.copy()
    out.thumbnail((edge, edge), Image.LANCZOS)
    return out


def prep(src_dir, out_dir):
    photos = os.path.join(out_dir, "web", "photos")
    thumbs = os.path.join(photos, "thumbs")
    os.makedirs(thumbs, exist_ok=True)
    os.makedirs(os.path.join(out_dir, "data"), exist_ok=True)
    records = []
    for name in sorted(f for f in os.listdir(src_dir) if f.lower().endswith(".png")):
        stem = os.path.splitext(name)[0]
        im = Image.open(os.path.join(src_dir, name))
        exif = im.getexif()
        rec = {"file": stem, "heading": _heading(exif), "taken": _taken(exif)}
        im = ImageOps.exif_transpose(im).convert("RGB")
        _resize(im, LONG_EDGE).save(os.path.join(photos, stem + ".jpg"), quality=80, optimize=True)
        _resize(im, THUMB_EDGE).save(os.path.join(thumbs, stem + ".jpg"), quality=75, optimize=True)
        records.append(rec)
    with open(os.path.join(out_dir, "data", "photo-exif.json"), "w") as f:
        json.dump(records, f, indent=1)
    return records


if __name__ == "__main__":
    recs = prep(sys.argv[1], sys.argv[2])
    print(len(recs), "photos;", sum(r["heading"] is None for r in recs), "without heading")
