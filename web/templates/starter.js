// A starter game: tap to drop stars, catch them on your nose.
//
// lens.screen  — the visible area: x 0 (left) .. 1 (right), y 0 (bottom) .. top, UP is +y
// lens.face    — null, or { x, y (nose), width, tilt, mouthOpen, smiling, eyesClosed, anchors }
// lens.sprite(art, x, y, width, angleDegrees, alpha)   art: "⭐", "drawing:Crown", "assets/me.png"
// lens.text(text, x, y, height)
// lens.burst(art, x, y, count, style, size)          style: Explode, Fountain, Rain, Stream
// lens.popup(text) · lens.flash(r, g, b) · lens.random(min, max) · lens.time · lens.log(...)

var stars = [];
var score = 0;

function start(lens) {
  lens.popup("Tap to drop a star!");
}

function tap(lens, x, y) {
  stars.push({ x: x, y: lens.screen.top, speed: lens.random(0.3, 0.6) });
}

function update(lens, dt) {
  for (var i = stars.length - 1; i >= 0; i--) {
    var star = stars[i];
    star.y -= star.speed * dt;
    var face = lens.face;
    if (face && Math.abs(star.x - face.x) < face.width * 0.3 && Math.abs(star.y - face.y) < face.width * 0.3) {
      score++;
      lens.burst("✨", star.x, star.y, 8);
      stars.splice(i, 1);
    } else if (star.y < lens.screen.bottom) {
      stars.splice(i, 1);
    } else {
      lens.sprite("⭐", star.x, star.y, 0.08, lens.time * 90);
    }
  }
  lens.text("⭐ " + score, 0.5, lens.screen.top - 0.15, 0.08);
}
