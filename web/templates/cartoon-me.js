// Cartoon Me — tap and an on-device AI model turns the picture into a cartoon.
// Tap the style name at the top to switch styles. Tap again to go back to the camera.
//
// lens.stylize(style, function (lens, picture, error) { ... }) grabs the camera picture (without
// stickers) and redraws it in the background; `picture` can be drawn with lens.sprite. The
// portrait styles redraw each face as a cartoon character: "cartoon-3d", "cartoon-handdrawn",
// "cartoon-anime". The first use of a style downloads it (about 12 MB).

var STYLES = [["cartoon-3d", "3D Cartoon"], ["cartoon-handdrawn", "Hand-drawn"], ["cartoon-anime", "Anime"]];
var style = 0;
var state = "live";     // live -> working -> showing
var picture = null;
var shownAt = 0;
var sparkle = 0;

function tap(lens, x, y) {
  var s = lens.screen;
  if (state === "working") return;
  if (state === "showing") {
    state = "live";
    picture = null;
    return;
  }
  // The style chip at the top.
  if (y > s.top - 0.32) {
    style = (style + 1) % STYLES.length;
    return;
  }
  if (!lens.face) lens.popup("Face the camera for the full effect");
  var started = lens.stylize(STYLES[style][0], function (lens, art, error) {
    if (!art) {
      state = "live";
      lens.popup(error || "Couldn't make the cartoon");
      return;
    }
    picture = art;
    state = "showing";
    shownAt = lens.time;
    lens.flash(1, 1, 1);
  });
  if (started) state = "working";
}

function update(lens, dt) {
  var s = lens.screen;
  var f = lens.face;

  if (state === "showing") {
    // Fade the cartoon in over the camera.
    var k = Math.min(1, (lens.time - shownAt) / 0.5);
    lens.sprite(picture, 0.5, s.top / 2, 1, 0, k);
    if (k < 1 && Math.random() < 0.5) lens.burst("✨", lens.random(0.1, 0.9), lens.random(s.top * 0.3, s.top * 0.9), 2, "Explode", 0.05);
    lens.text("Tap to go back", 0.5, s.top * 0.3, 0.05, 0.8);
    return;
  }

  if (state === "working") {
    sparkle -= dt;
    if (sparkle <= 0) {
      sparkle = 0.15;
      var cx = f ? f.x : 0.5, cy = f ? f.y : s.top / 2, r = f ? f.width * 0.7 : 0.3;
      var a = lens.random(0, Math.PI * 2);
      lens.burst("✨", cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3, "Explode", 0.05);
    }
    var dots = ["", ".", "..", "..."][Math.floor(lens.time * 3) % 4];
    lens.text("Drawing you" + dots, 0.5, s.top * 0.3, 0.06);
    return;
  }

  lens.text("✨ " + STYLES[style][1] + " ✨", 0.5, s.top - 0.2, 0.065);
  lens.text("tap here to change style", 0.5, s.top - 0.27, 0.035, 0.7);
  lens.text("Tap to turn cartoon", 0.5, s.top * 0.3, 0.06);
}
