# Lensmith filter format

**Format version 2** · used by Lensmith 0.3+ (`versionCode` 3)

## The package

A `.lensmith` file is a **zip**:

```
my-filter.lensmith
├── filter.json        the filter (required)
├── script.js          a script (optional, see scripting.md)
└── assets/            files it uses (optional): png, webp, jpg pictures; ogg, mp3, wav, m4a
                       sounds (minAppVersion 15); glb 3D models (minAppVersion 16)
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
| `effect` / `effectParam` | string / number | `None` / 0 | `None`, `Mirror`, `Pixelate`, `Sketch`, `Thermal`, `Posterize`, `Invert`, `RgbSplit`, `Toon` (cartoon look, param = strength 0–1), `Vhs` (retro tape, param = strength). Toon and Vhs need `minAppVersion` 6 |
| `stickers` | [Sticker] | [] | Pictures pinned to the face |
| `warps` | [Warp] | [] | Face reshaping |
| `background` | string | `None` | `None`, `Blur`, `ColorPop`, `Gradient`, `Galaxy`, `Image` (green screen) |
| `backgroundTop` / `backgroundBottom` | colour | | Gradient colours |
| `rules` | [Rule] | [] | Interactive "when … do …" rules |
| `game` | Game | — | Built-in mini-game (Catch) |
| `script` | string | — | `"script.js"`: a game or effect written in JavaScript — see [scripting.md](scripting.md). Needs `minAppVersion` 5 |
| `immersive` | bool | false | Full-screen game: the camera hides its filter carousel while this filter is on. Needs `minAppVersion` 6 |
| `models` | [Model] | [] | 3D models worn on the head. Needs `minAppVersion` 16 |
| `occludeHead` | bool | true | Hide the parts of `models` that are behind the head (the back of a hat brim) |
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

`nails`: 2–16. `fire`: `MouthOpen`, `Tap` or `Blink`. (Kept for old filters — new games should
be scripts, like the Nail It template in the Studio.)

### Script

Anything the built-in pieces can't do — your own mini-game — goes in a `script.js` file next to
`filter.json`, with `"script": "script.js"` and `"minAppVersion": 5`. The script runs on the phone
and in the Studio preview the same way. See [scripting.md](scripting.md).

### Model

A 3D model (binary glTF 2.0, `.glb`) that follows the head, turning and tilting with it:

```json
{ "file": "assets/hat.glb", "position": [0, 17, -4], "rotation": [-8, 0, 0], "size": 22 }
```

| Field | Meaning |
|---|---|
| `file` | The `.glb` in `assets/` |
| `position` | Where its centre goes, in **centimetres** in MediaPipe's face space: origin at the top of the nose, x across the picture, y up, z out of the face (towards the camera). The top of the head is about y = 15 |
| `rotation` | Degrees around x (tilt), y (turn) and z (lean), applied in that order |
| `size` | The model is scaled so its largest side is this many centimetres |

The model is centred on its bounding box. Models should face +z (glTF's front) with y up.
Supported: meshes (triangles) with positions, normals, texture coordinates and vertex colours;
each material's base colour, base colour texture (embedded PNG or JPEG), `alphaMode` `BLEND`,
`doubleSided` and `KHR_materials_unlit`. Not supported: animation, skinning, morph targets,
cameras, lights, external files. Limits: 5 MB and 60,000 triangles per model.

## Thumbnail

A package may carry the filter's own picture at the top level: `thumbnail.png`, `thumbnail.jpg`
or `thumbnail.webp` (square, up to 512px). Lensmith shows it on the camera's filter carousel and in
the store. Apps before 0.7.0 refuse packages with a thumbnail, so such packages set
`minAppVersion` to at least 7 (the Studio, the CLI and the store build do this for you).

## Versioning

Readers ignore fields they don't know, so new optional fields don't need a new
`formatVersion`. Bump `formatVersion` (and the apps' `minAppVersion`) only when older apps
would show a filter wrongly.
