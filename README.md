# Lensmith Studio

Make **Lensmith** camera filters in your browser — with a live preview on your own face.

### ▶ **[Open Lensmith Studio](https://lensmith-app.github.io/lensmith-studio/)**

No install, no account. Everything runs in your browser; nothing is uploaded.

## What you can do

- **Live preview** with your webcam (or a photo) using the same filter engine and face
  tracking as the Android app, so what you see is what the phone shows.
- **Drag stickers onto your face** — scroll to resize, <kbd>Shift</kbd>+scroll to rotate.
- **Everything the app's Creator has:** looks, adjustments, effects, stickers (emoji,
  drawings or your own pictures), face shape, interactive rules, the Catch game and
  background effects.
- **Code it:** the Code tab is the filter's `filter.json`, and edits apply live.
- **Save a `.lensmith`** and open it on your phone, or **open** one shared with you.
- **Publish:** the Publish tab builds exactly what the
  [store](https://github.com/lensmith-app/lensmith-filters) expects, with a thumbnail,
  and walks you through submitting it.

## In this repository

| | |
|---|---|
| [web/](web/) | The Studio web app (plain HTML/JS, no build step) |
| [docs/filter-format.md](docs/filter-format.md) | The `.lensmith` package and `filter.json` format |
| [schema/filter.schema.json](schema/filter.schema.json) | JSON Schema for `filter.json` |
| [tools/lensmith_cli.py](tools/lensmith_cli.py) | Command line: check, pack and unpack filters |

### Running the Studio locally

```bash
python -m http.server 8765 --directory web
```

Then open http://localhost:8765 (a local server is needed for the webcam and ES modules).

### Command line

Needs Python 3.10+ (and `pip install pillow` for picture checks).

```bash
python tools/lensmith_cli.py check  my-filter/            # is this folder a valid filter?
python tools/lensmith_cli.py pack   my-filter/            # → my-filter.lensmith
python tools/lensmith_cli.py unpack shared.lensmith out/  # .lensmith → folder
```

## How the preview matches the phone

`web/js/render.js` embeds the app's GLSL filter shader, `face.js` uses the same MediaPipe
models and face measurements, and `engine.js` is a port of the app's interaction engine.
When the app's renderer changes, update these together.
