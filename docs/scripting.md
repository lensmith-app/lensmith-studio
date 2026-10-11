# Lensmith Script

A filter can carry a `script.js` — plain JavaScript that runs every frame on top of the camera.
That's how mini-games like **Nail It** are made: no app update needed, just write the script in
the Studio's **Script** tab, test it in the preview and publish the filter.

```json
{ "name": "Nail It", "script": "script.js", "minAppVersion": 5, "doubleTapFlip": false }
```

## The three functions

Define any of these; Lensmith calls them by name.

| Function | When |
|---|---|
| `start(lens)` | Once, before the first frame |
| `update(lens, dt)` | Every frame. `dt` = seconds since the last frame. Draw everything here |
| `tap(lens, x, y)` | The screen was tapped at (`x`, `y`). Defining it turns off double-tap-to-flip |

Variables at the top of the file keep their values between frames — that's your game state.
Drawing is immediate: whatever `update` draws is shown for that frame only.

## Full-screen games

The camera's filter carousel covers the bottom of the screen. For a game, add
`"immersive": true` to filter.json (the **Full-screen game** box in the Script tab): the carousel
hides while the filter is on (a small **Filters** button brings it back), so the game can use
everything above the shutter button — about the bottom 22% of the screen is still covered.
Without it, keep the play area above ~45% of the screen height.

## Coordinates

Everything is in **screen widths**, with **y going up**:

- `x` runs from `0` (left edge) to `1` (right edge) — always as the user sees it, even on the
  mirrored selfie camera.
- `y` runs from `0` (bottom) to `lens.screen.top` (about 2 on a tall phone).
- Angles are in **degrees**, counter-clockwise; `0` = pointing right, `90` = up.

`lens.screen` is `{ left: 0, right: 1, bottom: 0, top, width: 1, height }`. Use it instead of
hard-coded numbers so the game fits every phone.

On a wide screen (a tablet held sideways), scripts run in a centred stage no wider than 3:4 —
the same shape as the Studio preview — so a game designed for phones keeps its layout.

## The `lens` object

| Member | |
|---|---|
| `lens.screen` | The visible area, see above |
| `lens.time` | Seconds since the filter started |
| `lens.face` | `null`, or `{ x, y, width, tilt, mouthOpen, smiling, eyesClosed, anchors }`. `x`/`y` is the nose tip; `width` is the face width; `tilt` in degrees; `mouthOpen` 0..1; `smiling`/`eyesClosed` true/false; `anchors.LeftEye` etc. are `{ x, y }` |
| `lens.sprite(art, x, y, width, angle, alpha)` | Draws a picture centred at (x, y). `width` in screen widths (default 0.1), `angle` in degrees, `alpha` 0..1 |
| `lens.text(text, x, y, height, alpha)` | White bold text centred at (x, y) |
| `lens.burst(art, x, y, count, style, size)` | Particle burst. `style`: `Explode`, `Fountain`, `Rain`, `Stream` |
| `lens.popup(text)` | A message that fades in and out |
| `lens.flash(r, g, b)` | Flashes the screen a colour (0..1 each) |
| `lens.random(min, max)` | A random number |
| `lens.log(...)` | Prints to the Studio console (and the phone's log) |
| `lens.anchors` | Names of the face anchors: `Forehead`, `BetweenEyes`, `LeftEye`, `RightEye`, `NoseTip`, `Mouth`, `Chin`, `LeftCheek`, `RightCheek` |

### AI styles (Lensmith 0.8+, portrait styles 0.9+)

`lens.stylize(style, done)` grabs the camera picture (the visible screen, without the filter's
stickers) and redraws it with an on-device AI style model, in the background. When it's ready,
`done(lens, picture, error)` is called: `picture` is art you can draw — to cover the screen exactly,
`lens.sprite(picture, 0.5, lens.screen.top / 2, 1)`. If it failed, `picture` is null and `error`
says why. It returns `false` if a picture is already being styled.

| Style | Look |
|---|---|
| `cartoon-3d` | Animated-movie 3D character (portrait: redraws each face) |
| `cartoon-handdrawn` | Soft illustrated character (portrait) |
| `cartoon-anime` | Full anime redraw (portrait) |
| `face-paint` | Soft painted cartoon, made for faces |
| `paprika` | Bright anime-film colours |
| `celeba` | Clean anime portrait |

The first use of a style downloads it (about 9 MB, once). It takes a few seconds, so show
something while it works. Models come from
[lensmith-models](https://github.com/lensmith-app/lensmith-models) (AnimeGANv2, non-commercial use).
The **Cartoon Me** template in the Studio shows the whole flow.

### Sound (Lensmith 0.10+)

| Member | |
|---|---|
| `lens.sound(name, volume, pitch)` | Plays a short sound effect. `volume` 0..1 (default 1), `pitch` 0.5..2 (default 1; also changes speed) |
| `lens.music(name, volume)` | Loops music (default volume 0.6). Asking for the track that's already playing only changes its volume. `lens.music(null)` stops it |
| `lens.sounds` / `lens.songs` | Names of the built-in sound effects / music loops |

Built-in effects: `pop`, `chomp`, `coin`, `jump`, `boom`, `swish`, `whoosh`, `click`, `ding`,
`buzz`, `win`, `lose`, `laser`, `bounce`, `splash`, `tick`, `kick`, `snare`, `hihat`, `sparkle`,
`shutter`, `whip`, `powerup`. Built-in music: `arcade`, `chill`, `beat`.

Your own sounds work too: add an `.ogg`, `.mp3`, `.wav` or `.m4a` file (2 MB or less) with
**Add sound file** in the Script tab and use its path, e.g. `lens.sound("assets/meow.ogg")`. As
with pictures, write the path as a plain string.

- Music stops when someone switches filter or leaves the app, and starts again only when your
  script asks — so call `lens.music(...)` from `start` (or when a game begins).
- Everything played while someone records is mixed into their video's soundtrack.
- People can turn filter sounds off in Settings; your script doesn't need to handle that.
- In the Studio, click the preview once first: browsers only allow sound after a click.
- Using `lens.sound` or `lens.music` makes the filter need Lensmith 0.10 (minAppVersion 15).

The built-in sounds were made for Lensmith and are free to use in any filter
([source](../tools/sound-pack/synth.py)).

### Art

`art` is one of:

- an emoji: `"⭐"`
- a built-in drawing: `"drawing:Nail"`, `"drawing:WoodPlank"`, `"drawing:Pistol"`, `"drawing:Bullet"`,
  `"drawing:Crown"`, `"drawing:DogNose"`, … (see the Art picker in the Studio)
- your own picture: `"assets/gun.png"` — add it in the Studio's Assets panel. Write the path
  as a plain string so the Studio and the store can see that it's used.

## Example

```js
var stars = [], score = 0;

function tap(lens, x, y) {
  stars.push({ x: x, y: lens.screen.top });
}

function update(lens, dt) {
  for (var i = stars.length - 1; i >= 0; i--) {
    var s = stars[i];
    s.y -= 0.5 * dt;
    var f = lens.face;
    if (f && Math.abs(s.x - f.x) < f.width * 0.3 && Math.abs(s.y - f.y) < f.width * 0.3) {
      score++; lens.burst("✨", s.x, s.y, 8); stars.splice(i, 1);
    } else if (s.y < 0) stars.splice(i, 1);
    else lens.sprite("⭐", s.x, s.y, 0.08, lens.time * 90);
  }
  lens.text("⭐ " + score, 0.5, lens.screen.top - 0.15, 0.08);
}
```

The Studio's Script tab has this starter and the full **Nail It** game as templates.

## Rules and limits

- Write **ES5-style** JavaScript (`var`, `function`) for the widest support. `let`, `const` and
  arrow functions work, but avoid newer features such as `async`, classes with fields, or
  optional chaining — the phone runs scripts with Rhino, not a browser engine.
- No network, files, timers or DOM — only `Math`, `JSON`, arrays, strings and the `lens` object.
- Each call has an instruction budget. An endless loop stops the script (the filter keeps
  showing, the game just freezes) and the error appears in the Studio.
- `script.js` must be 256 KB or less.
- An error stops the script; the Studio shows the message and line number.
