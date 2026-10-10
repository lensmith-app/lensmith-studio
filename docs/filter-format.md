# Lensmith filter format

**Format version 2** · used by Lensmith 0.3+ (`versionCode` 3)

## The package

A `.lensmith` file is a **zip**:

```
my-filter.lensmith
├── filter.json        the filter (required)
└── assets/            pictures it uses (optional): png, webp, jpg
```

Limits: 200 files, 20 MB total. Files outside `filter.json` and `assets/` are rejected.
In the store repository a filter folder also has `listing.json` and an optional thumbnail —
those are store details, not part of the package.

## filter.json

All fields are optional except `id` and `name`. Units: positions and sizes on the face are in
**face widths**; colours are `[r, g, b]` from 0 to 1.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `formatVersion` | int | 1 | Format this file was written in |
| `minAppVersion` | int | 1 | Oldest app (`versionCode`) that can use it |
| `id` | string | — | Unique id (the store sets `creator.name`) |
| `name` | string | — | 1–24 characters |
| `brightness` | number | 0 | −1 … 1 |
| `contrast` | number | 1 | 0 … 2 |
| `saturation` | number | 1 | 0 (black & white) … 2 |
| `warmth` | number | 0 | −1 (cool) … 1 (warm) |
| `tint` | number | 0 | −1 (green) … 1 (magenta) |
| `fade` | number | 0 | 0 … 1, lifts the blacks |
| `vignette` | number | 0 | 0 … 1, darkens the corners |
| `grain` | number | 0 | 0 … 1, film grain |
| `colorize` / `colorizeAmount` | colour / number | white / 0 | Colour wash and its strength |
| `effect` / `effectParam` | string / number | `None` / 0 | `None`, `Mirror`, `Pixelate`, `Sketch`, `Thermal`, `Posterize`, `Invert`, `RgbSplit` |
| `stickers` | [Sticker] | [] | Pictures pinned to the face |
| `warps` | [Warp] | [] | Face reshaping |
| `background` | string | `None` | `None`, `Blur`, `ColorPop`, `Gradient`, `Galaxy`, `Image` (green screen) |
| `backgroundTop` / `backgroundBottom` | colour | | Gradient colours |
| `rules` | [Rule] | [] | Interactive "when … do …" rules |
| `game` | Game | — | Catch mini-game |
| `doubleTapFlip` | bool | true | Whether double tap flips the camera (always off when a rule uses taps) |

### Art

Anything that is drawn — a sticker, a burst particle, a game item — is one of:

```json
{ "emoji": "💖" }
{ "drawing": "DogEarLeft" }        // DogEarLeft, DogEarRight, DogNose, Tongue, ClownNose, Blush, Crown
{ "image": "assets/tongue.png" }   // a picture in the package
```

### Sticker

```json
{ "emoji": "👑", "anchor": "Forehead", "offsetX": 0, "offsetY": 0.32, "width": 0.8,
  "rotation": 0, "showWhen": "Always", "hidden": false }
```

- `anchor`: `Forehead`, `BetweenEyes`, `LeftEye`, `RightEye`, `NoseTip`, `Mouth`, `Chin`, `LeftCheek`, `RightCheek`
- `offsetX` / `offsetY`: from the anchor, along the face (x across the eyes, y up)
- `showWhen`: `Always`, `MouthOpen`, `MouthClosed`, `Smiling`, `EyesClosed`
- `hidden`: starts hidden; a rule can show it

### Warp

```json
{ "anchor": "LeftEye", "radius": 0.25, "strength": 0.5 }
```
`strength` > 0 grows (bulge), < 0 shrinks (pinch); about −0.6 … 0.6.

### Rule

```json
{ "trigger": "Smile", "cooldownMs": 1500, "actions": [ … ] }
```

Triggers: `Start`, `MouthOpen`, `MouthClose`, `Blink`, `Smile`, `TiltLeft`, `TiltRight`, `Tap`,
`EveryTwoSeconds`, `WhileMouthOpen`, `WhileSmiling`.

Actions:

| `type` | Fields |
|---|---|
| `burst` | art, `anchor` (omit = tap point / screen centre), `count`, `style` (`Explode`, `Fountain`, `Rain`, `Stream`), `size` |
| `show` / `hide` / `toggle` | `index` — position in `stickers` |
| `score` | `points` |
| `popup` | `text` |
| `flash` | `color` |

### Game

One mini-game per filter, chosen by `type`:

**Catch** (`"type": "catch"`, the default): things fall; open your mouth to eat them.

```json
{ "type": "catch", "items": [ { "emoji": "🍔" }, { "image": "assets/coin.png" } ], "durationSeconds": 30 }
```

**Nail It** (`"type": "nails"`, needs `minAppVersion` 4): wooden walls full of nails; a gun follows
your nose and shoots straight up. Drive every nail in.

```json
{ "type": "nails", "nails": 10, "fire": "MouthOpen" }
```

`nails`: 2–16. `fire`: `MouthOpen`, `Tap` or `Blink`.

## Versioning

Readers ignore fields they don't know, so new optional fields don't need a new
`formatVersion`. Bump `formatVersion` (and the apps' `minAppVersion`) only when older apps
would show a filter wrongly.
