# Phase 1 verification log

Method: render the 3D model from each sample photo's pin (position + heading, eye height 1.6 m, 100° horizontal field of view to match the 14 mm lens). Then compare side by side with the photo for window count and wall, door side and swing, fixtures and archways.

## Room-by-room

| Photo | Room | Result | Note |
|---|---|---|---|
| 3456 | Living | pass | Tray ceiling, east window ahead, hallway opening on the right |
| 3488 | Living | fixed → pass | Pin moved to the east side (7.0, 17.8). The compass heading (WNW) was right. Window + front door on the west wall, kitchen archway on the right |
| 3457 | Living → kitchen | pass | Kitchen through the archway, kitchen east window on the right |
| 3493 | Kitchen | pass | Sink window on the west wall, wall cabinets and counters |
| 3477 | Hallway | pass | Windows on the east wall, doors on the west |
| 3485 | Hallway | pass | Looking back to the living room, east windows on the right |
| 3482 | BD 1 | pass | Single west window with AC beside it |
| 3463 | Hall → BD 1 | pass | Dark door, window opposite |
| 3479 | W/C 1 | pass | Squat pan, basin; no window |
| 3471 | En-suite | pass | Small west window, western toilet |
| 3474 | BD 2 | fixed → pass | Large 3-panel window moved to the west wall; regular window east |
| 3475 | BD 2 | pass | En-suite and bedroom doors on the north wall, window on the right |
| 3445 | Porch | fixed → pass | Pin moved onto the walkway; window, door, pillar and roof overhang |
| 3452 | Outside W/C | fixed → pass | Compound wall moved outside the plot line so the W/C interior shows white |
| 3491 | Kitchen | pass | Cabinets and counter on the sink-window side, large window on the right |
| 3465 | Hall → W/C 1 | pass | Basin and squat pan through the aluminium door |
| 3472 | En-suite | pass | Door through to BD 2 on the far wall |
| 3446 | Porch | pass | Looking south: pillars, front door leaf, west walkway, compound wall |
| 3453 | Outside W/C | pass | Small window looking east along the back walkway |
| 3449 | East walkway | pass | Narrow walkway, house windows on the left |
| 3450 | Parking / west walkway | pass | Front gable with window, west walkway beyond |
| 3497 | Parking | pass | Yard, BD 2 front window, compound wall |
| 3508 | Back walkway | pass | Back walkway ending at the outside W/C |

Corrections made during this check (recorded in `data/estimates.md`):
- BD 2's big window is on the west wall.
- BD 1 and BD 2 AC positions corrected.
- 21 indoor/odd compass headings overridden from the views.
- Two photo pins moved (3445, 3488).
- Compound wall drawn outside the plot line.

## Spec §4 checklist

- [x] Room-by-room check against photos (table above): at least 2 photos per room plus 6 exterior, 23 of 68 photos.
- [x] Every opening from spec §2 exists in `house.json` and the plan: 21 openings, 12 windows (`test/house-data.test.mjs`, `test/plan.test.mjs`).
- [x] All 68 photos pinned inside their room (`test/house-data.test.mjs`).
- [x] Estimates table complete; every dimension has a source and confidence (`data/estimates.md`, data test).
- [x] Dimension editor: changing a room size updates plan and 3D; impossible edits are refused (`test/edits.test.mjs`, smoke tests).
- [x] Desktop and phone: Playwright desktop (1280×800) and iPhone 15 emulation; touch joystick shown in walk mode.
- [x] Exports open: PDF renders (checked visually), GLB has a valid header, PNGs 1920×1080 (`npm run export:check`).

## Environment notes

- Playwright's Chromium download is blocked by the network allowlist. Tests and exports use the system Chrome with software WebGL (SwiftShader).
