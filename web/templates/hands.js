// Hands starter — shows what lens.hands sees and pops bubbles with your fingertip.
// Pinch (thumb + index together) to blow a new bubble. Needs Lensmith 0.10+.
var bubbles = [], wasPinch = false;

function update(lens, dt) {
  var s = lens.screen;
  // Float bubbles up.
  for (var i = bubbles.length - 1; i >= 0; i--) {
    var b = bubbles[i];
    b.y += 0.15 * dt;
    if (b.y > s.top + 0.1) bubbles.splice(i, 1);
  }
  var pinching = false;
  for (var h = 0; h < lens.hands.length; h++) {
    var hand = lens.hands[h];
    // Every point of the hand, the fingertip a bit bigger.
    for (var p = 0; p < hand.points.length; p++) lens.sprite("⚪", hand.points[p].x, hand.points[p].y, 0.015);
    lens.sprite("🔵", hand.tip.x, hand.tip.y, 0.035);
    lens.text(hand.side + " · " + hand.gesture, hand.x, hand.y + hand.size * 0.9, 0.045);
    // Pop bubbles the fingertip touches.
    for (var j = bubbles.length - 1; j >= 0; j--) {
      var q = bubbles[j];
      if (Math.abs(q.x - hand.tip.x) < q.size / 2 && Math.abs(q.y - hand.tip.y) < q.size / 2) {
        lens.burst("💧", q.x, q.y, 6, "Explode", 0.03);
        lens.sound("pop", 1, lens.random(0.9, 1.4));
        bubbles.splice(j, 1);
      }
    }
    if (hand.pinch) pinching = true;
    if (hand.pinch && !wasPinch) {
      bubbles.push({ x: hand.thumb.x, y: hand.thumb.y, size: lens.random(0.08, 0.14) });
      lens.sound("bounce", 0.6);
    }
  }
  wasPinch = pinching;
  for (var k = 0; k < bubbles.length; k++) lens.sprite("🫧", bubbles[k].x, bubbles[k].y, bubbles[k].size);
  if (!lens.hands.length) lens.text("Hold up a hand ✋", 0.5, s.top - 0.22, 0.06);
  else lens.text("Pinch 🤏 to blow a bubble, poke it to pop!", 0.5, s.top - 0.22, 0.05);
}
