# Mbezi house: dimension estimates

All sizes are estimates from photos (no tape measurements). Expect ±10–15 %. Correct any of them in the page's Edit tab or in `tools/build_house.py`.

Clear size = inside face to inside face (what furniture must fit in). Centre-line size = the drawn room outline, ~0.15–0.2 m larger.

| Room | Clear size (m) | Clear area (m²) | Method | Photos used | Confidence |
|---|---|---|---|---|---|
| BD 2 (main) | 5.0 × 4.0 | ~20 | Front wall ≈ 3× its window; ~5 diagonal 600 mm tile runs along it | 3467, 3474, 3475 | medium |
| BD 1 | 3.6 × 3.6 | ~13 | 4–5 diagonal tile runs along the window wall | 3480–3484 | medium |
| En-suite | 2.2 × 2.0 | ~4.4 | Fits WC, shower and basin beside a 0.75 m door | 3470–3473 | low |
| W/C 1 | 1.25 × 2.0 | ~2.5 | Door, squat pan and shower in one line | 3478–3479 | low |
| Hallway | 1.3 × 5.8 | ~7.5 | Clear width ≈ 1.3 door leaves | 3476, 3477, 3485 | medium |
| Living / dining | 5.0 × 4.8 | ~24 | ~4 wood-look 600×1200 tiles across | 3456, 3486–3489 | medium |
| Kitchen | 5.0 × 3.0 | ~15 | Full house width (sketch); depth from counter + floor space | 3491–3494 | low |
| Outside W/C | 1.6 × 1.4 | ~2.2 | Squat pan, basin, 0.75 m door | 3443, 3452–3453 | low |
| Porch | 1.2 × 4.95 | ~6 | Raised tiled strip with 3 pillars | 3444–3446 | low |

Outside (centre-lines):

| Area | Size (m) | Method | Confidence |
|---|---|---|---|
| House footprint (outside faces) | 5.4 × 18.4 | Sum of rooms + walls | medium |
| Plot inside compound wall | 8.6 × 26.6 | House + walkways + parking | low |
| West walkway | 2.3 wide (incl. 1.2 porch) | Pavers + porch strip | low |
| East walkway | 1.1 wide | ~5 herringbone paver widths | medium |
| Back walkway | 1.3 wide | Pavers, AC units | low |
| Parking | 8.6 × 7.1 | Yard about as deep as plot width | low |
| Gate | 4.0 wide, west wall | Paver count across gate | low |

Assumptions: ceilings 3.0 m (outside W/C 2.6 m); tray ceiling in living room; compound wall 2.4 m; exterior walls 0.20 m, interior 0.15 m; roof hip with front gable, 22° pitch, 0.6 m overhang (no roof photos).

## North

Plan "north" (+y, towards the back of the house) points to compass **82°** (roughly east). That's the median compass heading of 9 walkway photos taken looking towards the back (3443, 3444, 3449, 3450, 3451, 3499, 3502, 3503, 3504). So the street side faces roughly west. Indoor compass readings are less reliable (steel in the walls), so photo headings were used only as hints indoors.

## Corrections to the spec found while estimating

- **Kitchen windows:** the sink window is on the **west** wall, the one visible from the walkway by the outside W/C (3443, 3451, 3458). The second, large window is on the **east** wall (3457, 3505), not the back. The opening id is `win-kitchen-e` instead of `win-kitchen-n`.
- **Porch:** a covered, raised tiled strip with pillars along a straight west wall (3444). It's not a recess cut into the house.
- **BD 2 windows:** the large 3-panel window is on the **west** wall (3474, which faces the street side) and the regular window is on the east wall (3475). The BD 2 AC sits on the west wall (3467, 3469).
- **Compass overrides:** 21 photos have a compass heading that clearly disagrees with what they show, mostly indoors where steel in the walls throws the phone's compass off. For these the pin direction is read from the view instead (plan bearing; 0 = back, 90 = east, 180 = street side, 270 = west):
  3445 → 90, 3446 → 180, 3453 → 90, 3455 → 100, 3456 → 120, 3457 → 350, 3458 → 330, 3459 → 180, 3460 → 180, 3461 → 200, 3462 → 180, 3470 → 345, 3472 → 160, 3474 → 180, 3476 → 0, 3481 → 220, 3484 → 270, 3500 → 270, 3501 → 0, 3505 → 270, 3506 → 350.
