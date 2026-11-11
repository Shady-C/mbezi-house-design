"""Generate data/house.json from the estimates below. Edit numbers here, then re-run.

Coordinates: metres, origin = inner SW corner of the compound wall, +x east, +y north (back of house).
Room polygons are at wall centre-lines; clear interior sizes are ~0.15-0.2 m smaller.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NORTH = 82.0  # compass bearing of +y; median of walkway photos facing the back (see estimates.md)


def D(value, source, confidence):
    return {"value": value, "source": source, "confidence": confidence}


def rect(x0, y0, x1, y1):
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]  # edges: 0=S, 1=E, 2=N, 3=W


def room(id, name, kind, poly, floor, ceiling, est_src, est_conf, note):
    return {"id": id, "name": name, "kind": kind, "polygon": poly, "floor": floor, "ceiling": ceiling,
            "estimate": {"source": est_src, "confidence": est_conf, "note": note}}


def flat(h=3.0, conf="low"):
    return {"type": "flat", "height": D(h, "assumption", conf)}


NONE = {"type": "none"}

# House centre-line box: x 2.3-7.5, y 7.1-25.3
rooms = [
    room("bd2", "BD 2 (main)", "indoor", rect(2.3, 7.1, 7.5, 11.25), "white-diagonal", flat(), "tile-count", "medium",
         "Front wall ≈ 3× window width; ~5 diagonal 600 mm tile diagonals along the front wall (3474, 3467)"),
    room("ensuite", "En-suite", "indoor", rect(2.3, 11.25, 4.65, 13.4), "bath-pattern", flat(), "door-width", "low",
         "Fits WC + shower + basin with 0.75 m door (3470-3472); width set so en-suite + W/C 1 = BD 1 width"),
    room("wc1", "W/C 1", "indoor", rect(4.65, 11.25, 6.05, 13.4), "bath-pattern", flat(), "door-width", "low",
         "Narrow: door + squat pan + shower in one line (3478-3479)"),
    room("bd1", "BD 1", "indoor", rect(2.3, 13.4, 6.05, 17.15), "white-diagonal", flat(), "tile-count", "medium",
         "~4-5 tile diagonals along window wall (3482); near-square room"),
    room("hall", "Hallway", "indoor", rect(6.05, 11.25, 7.5, 17.15), "white-diagonal", flat(), "door-width", "medium",
         "Clear width ≈ 1.3 doors (3476-3477); length = BD 1 + baths"),
    room("living", "Living / dining", "indoor", rect(2.3, 17.15, 7.5, 22.1), "wood-look", {"type": "tray", "height": D(3.0, "assumption", "low")},
         "tile-count", "medium", "~4 wood-look 600×1200 tiles across, tray ceiling (3456, 3486-3489)"),
    room("kitchen", "Kitchen", "indoor", rect(2.3, 22.1, 7.5, 25.3), "wood-look", flat(), "sketch", "low",
         "Full house width per sketch; depth from counter + walkway (3491-3494)"),
    room("owc", "Outside W/C", "indoor", rect(0.0, 25.0, 1.8, 26.6), "bath-pattern", flat(2.6), "door-width", "low",
         "Against compound wall, back-west corner; walkway door only (3443, 3451-3453)"),
    room("porch", "Porch", "outdoor", rect(1.1, 17.15, 2.3, 22.1), "porch-tile", NONE, "paver-count", "low",
         "Raised tiled strip with pillars along living room west wall (3444-3446)"),
    room("walk-w", "West walkway", "outdoor",
         [[0, 7.1], [2.3, 7.1], [2.3, 17.15], [1.1, 17.15], [1.1, 22.1], [2.3, 22.1], [2.3, 25.0], [0, 25.0]],
         "pavers", NONE, "paver-count", "low", "Wider side with porch, pots, breeze-block wall (3444, 3446, 3496)"),
    room("walk-e", "East walkway", "outdoor", rect(7.5, 7.1, 8.6, 25.3), "pavers", NONE, "paver-count", "medium",
         "~5 herringbone paver widths, about 1 m clear (3499-3502)"),
    room("walk-n", "Back walkway", "outdoor", [[1.8, 25.0], [2.3, 25.0], [2.3, 25.3], [8.6, 25.3], [8.6, 26.6], [1.8, 26.6]],
         "pavers", NONE, "paver-count", "low", "AC outdoor units, water lines (3454, 3503-3508)"),
    room("parking", "Parking", "outdoor", rect(0, 0, 8.6, 7.1), "pavers", NONE, "paver-count", "low",
         "Yard about as deep as the plot is wide (3447-3448, 3497-3498)"),
]


def op(id, room, edge, offset, width, height, sill, typ, swing=None, src="door-width", conf="low"):
    return {"id": id, "room": room, "edge": edge, "offset": D(offset, src, conf), "width": D(width, src, conf),
            "height": D(height, "assumption", "low"), "sill": D(sill, "assumption", "low"), "type": typ, "swing": swing}


openings = [
    op("door-front", "living", 3, 0.4, 1.0, 2.2, 0, "door", "in-right"),
    op("win-living-w", "living", 3, 2.2, 1.5, 1.3, 0.9, "window"),
    op("win-living-e", "living", 1, 2.4, 1.8, 1.4, 0.8, "window"),
    op("open-hall", "living", 0, 3.85, 1.25, 2.2, 0, "archway"),
    op("arch-kitchen", "living", 2, 0.3, 2.4, 2.3, 0, "archway"),
    op("win-kitchen-w", "kitchen", 3, 0.9, 1.4, 1.2, 1.05, "window"),
    op("win-kitchen-e", "kitchen", 1, 0.8, 1.6, 1.3, 0.9, "window"),
    op("win-hall-e1", "hall", 1, 1.2, 1.2, 1.3, 0.9, "window"),
    op("win-hall-e2", "hall", 1, 3.8, 1.2, 1.3, 0.9, "window"),
    op("door-bd1", "hall", 3, 0.5, 0.9, 2.1, 0, "door", "out-right"),
    op("door-wc1", "hall", 3, 4.4, 0.75, 2.1, 0, "door", "out-left"),
    op("door-bd2", "hall", 0, 0.25, 0.9, 2.1, 0, "door", "out-left"),
    op("win-bd1-w", "bd1", 3, 1.2, 1.5, 1.3, 0.9, "window"),
    op("door-ensuite", "ensuite", 0, 1.4, 0.75, 2.1, 0, "door", "out-right"),
    op("win-ensuite-w", "ensuite", 3, 0.7, 0.6, 0.8, 1.4, "window"),
    op("win-bd2-s", "bd2", 0, 1.9, 1.5, 1.3, 0.9, "window"),
    op("win-bd2-e", "bd2", 1, 1.4, 1.3, 1.3, 0.9, "window"),
    op("win-bd2-w", "bd2", 3, 0.9, 2.2, 1.4, 0.8, "window"),
    op("door-owc", "owc", 0, 0.5, 0.75, 2.0, 0, "door", "in-left"),
    op("win-owc-e", "owc", 1, 0.9, 0.5, 0.4, 1.5, "window"),
    op("gate", "parking", 3, 0.6, 4.0, 2.4, 0, "gate", None, "paver-count", "low"),
]


def fx(id, room, kind, x, y, w, d, rot=0):
    return {"id": id, "room": room, "kind": kind, "x": x, "y": y, "w": w, "d": d, "rot": rot}


fixtures = [
    fx("counter-w", "kitchen", "counter", 2.72, 23.8, 0.6, 2.6),
    fx("counter-n", "kitchen", "counter", 3.9, 24.92, 1.8, 0.6),
    fx("cabinets-n", "kitchen", "wall-cabinet", 3.9, 25.03, 1.8, 0.35),
    fx("cabinets-w", "kitchen", "wall-cabinet", 2.58, 24.2, 0.35, 1.2),
    fx("toilet-wc1", "wc1", "toilet-squat", 5.35, 12.95, 0.45, 0.6),
    fx("basin-wc1", "wc1", "basin", 4.95, 12.1, 0.45, 0.4),
    fx("shower-wc1", "wc1", "shower", 5.55, 11.75, 0.8, 0.8),
    fx("toilet-ensuite", "ensuite", "toilet-western", 2.75, 12.4, 0.4, 0.7),
    fx("basin-ensuite", "ensuite", "basin", 3.4, 13.1, 0.5, 0.4),
    fx("shower-ensuite", "ensuite", "shower", 2.85, 11.75, 0.9, 0.9),
    fx("toilet-owc", "owc", "toilet-squat", 0.9, 26.1, 0.45, 0.6),
    fx("basin-owc", "owc", "basin", 1.45, 25.6, 0.4, 0.35),
    fx("tank-owc", "owc", "tank", 0.9, 25.8, 1.1, 1.1),
    fx("ac-living", "living", "ac", 4.9, 21.95, 0.9, 0.25),
    fx("ac-bd1", "bd1", "ac", 2.45, 16.5, 0.25, 0.9),
    fx("ac-bd2", "bd2", "ac", 2.45, 7.7, 0.25, 0.9),
    fx("fan-living", "living", "fan", 4.9, 19.6, 1.3, 1.3),
    fx("fan-bd1", "bd1", "fan", 4.2, 15.3, 1.2, 1.2),
    fx("fan-bd2", "bd2", "fan", 4.9, 9.2, 1.3, 1.3),
] + [fx(f"pillar-{i}", "porch", "pillar", 1.25, y, 0.25, 0.25) for i, y in enumerate([17.4, 19.6, 21.85])]

# file -> (room, x, y). Positions are where the camera stood, inferred from each view.
PHOTOS = {
    3443: ("walk-w", 1.0, 22.5), 3444: ("walk-w", 0.7, 16.5), 3445: ("walk-w", 0.6, 19.9), 3446: ("porch", 1.7, 21.5),
    3447: ("parking", 2.5, 4.0), 3448: ("parking", 6.0, 4.0), 3449: ("walk-e", 8.0, 7.5), 3450: ("parking", 1.0, 3.0),
    3451: ("walk-w", 1.0, 23.0), 3452: ("owc", 0.9, 25.2), 3453: ("owc", 0.9, 25.9), 3454: ("owc", 1.6, 25.9),
    3455: ("living", 2.5, 21.2), 3456: ("living", 2.6, 20.0), 3457: ("living", 6.0, 20.5), 3458: ("living", 5.5, 21.5),
    3459: ("living", 5.5, 21.8), 3460: ("living", 5.5, 21.8), 3461: ("living", 6.5, 21.5), 3462: ("living", 6.0, 18.0),
    3463: ("hall", 6.6, 16.2), 3464: ("hall", 6.5, 16.2), 3465: ("hall", 6.5, 12.4), 3466: ("bd2", 6.75, 11.0),
    3467: ("bd2", 6.8, 10.6), 3468: ("bd2", 6.5, 10.8), 3469: ("bd2", 3.0, 7.8), 3470: ("bd2", 4.0, 10.0),
    3471: ("ensuite", 3.8, 12.0), 3472: ("ensuite", 3.5, 12.6), 3473: ("ensuite", 4.0, 11.6), 3474: ("bd2", 4.0, 10.8),
    3475: ("bd2", 3.0, 7.6), 3476: ("bd2", 6.75, 10.8), 3477: ("hall", 6.75, 11.8), 3478: ("hall", 6.6, 12.4),
    3479: ("wc1", 5.6, 12.4), 3480: ("bd1", 5.4, 16.5), 3481: ("bd1", 5.3, 16.0), 3482: ("bd1", 5.0, 14.0),
    3483: ("bd1", 5.6, 16.4), 3484: ("bd1", 3.0, 15.0), 3485: ("hall", 6.75, 13.0), 3486: ("living", 6.6, 17.6),
    3487: ("living", 6.3, 17.6), 3488: ("living", 7.0, 17.8), 3489: ("living", 6.8, 18.3), 3490: ("living", 3.0, 18.0),
    3491: ("kitchen", 6.5, 22.6), 3492: ("kitchen", 6.3, 22.7), 3493: ("kitchen", 6.0, 23.2), 3494: ("kitchen", 6.2, 23.0),
    3495: ("living", 2.6, 21.2), 3496: ("porch", 1.7, 21.8), 3497: ("parking", 4.0, 6.0), 3498: ("parking", 6.5, 6.0),
    3499: ("walk-e", 8.0, 7.6), 3500: ("walk-e", 8.1, 10.0), 3501: ("walk-e", 8.0, 12.0), 3502: ("walk-e", 8.0, 15.0),
    3503: ("walk-e", 8.0, 18.5), 3504: ("walk-e", 8.0, 20.5), 3505: ("walk-e", 8.0, 23.0), 3506: ("walk-e", 8.1, 24.5),
    3507: ("walk-n", 8.0, 25.9), 3508: ("walk-n", 8.0, 26.0), 3509: ("walk-e", 8.1, 24.0), 3510: ("living", 2.6, 21.6),
}


# Plan bearings (0 = back, 90 = east, 180 = street side, 270 = west) read from the view itself, used where the
# phone's compass clearly disagrees with what the photo shows (mostly indoors: steel in walls). See estimates.md.
HEADING_OVERRIDES = {
    3445: 90, 3446: 180, 3453: 90, 3455: 100, 3456: 120, 3457: 350, 3458: 330, 3459: 180, 3460: 180,
    3461: 200, 3462: 180, 3470: 345, 3472: 160, 3474: 180, 3476: 0, 3481: 220, 3484: 270, 3500: 270,
    3501: 0, 3505: 270, 3506: 350,
}


def build():
    exif = {r["file"]: r for r in json.load(open(os.path.join(ROOT, "data", "photo-exif.json")))}
    photos = []
    for n, (rid, x, y) in sorted(PHOTOS.items()):
        f = f"IMG_{n}"
        hd = exif[f]["heading"]
        heading = None if hd is None else round((hd - NORTH) % 360.0, 1)
        if n in HEADING_OVERRIDES:
            heading = float(HEADING_OVERRIDES[n])
        photos.append({"file": f, "x": x, "y": y, "room": rid, "heading": heading})
    return {
        "version": 1,
        "northDeg": D(NORTH, "exif", "medium"),
        "plot": {"polygon": rect(0, 0, 8.6, 26.6), "wallHeight": D(2.4, "assumption", "low")},
        "rooms": rooms, "openings": openings, "fixtures": fixtures, "photos": photos,
        "roof": {"type": "hip-front-gable", "overhang": D(0.6, "assumption", "low"), "pitchDeg": D(22, "assumption", "low")},
    }


if __name__ == "__main__":
    with open(os.path.join(ROOT, "data", "house.json"), "w") as f:
        json.dump(build(), f, indent=1)
    print("wrote data/house.json")
