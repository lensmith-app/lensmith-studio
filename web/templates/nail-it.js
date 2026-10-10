// Nail It — a "Shoot the Nails" style game for Lensmith.
//
// The gun on the right swings back and forth. Tap to fire: the bullet flies at the gun's
// angle, ricochets off the walls and the nails, and every nail it touches is hammered in.
// One shot per round — once the bullet is past the last nail you win (all nails) or lose.
// Tap to play again.

var NAILS = 10;        // nails per round (half on each wall)
var WALL = 0.13;       // wall thickness, in screen widths
var NAIL_LENGTH = 0.17;
var BULLET_SPEED = 1.5; // screen widths per second
var BULLET_SIZE = 0.012;
var SWING_SPEED = 2.2;  // how fast the gun swings
var AIM_LOW = 148;      // gun angle range in degrees (90 = straight up, 180 = left)
var AIM_HIGH = 178;     // the perfect shots are shallow: about 170-172° and 177-178°

var nails = [];
var bullet = null;
var state = "aim";      // aim -> flying -> won / lost
var swing = 0;
var score = 0;
var endTime = 0;

function start(lens) {
  newRound(lens);
}

function newRound(lens) {
  var s = lens.screen;
  var bottom = s.bottom + s.height * 0.42;
  var top = s.top - s.height * 0.12;
  var perSide = Math.floor(NAILS / 2);
  var step = (top - bottom) / perSide;
  nails = [];
  for (var i = 0; i < perSide; i++) {
    nails.push({ left: true, y: bottom + step * i, out: 1, hit: false });
    nails.push({ left: false, y: bottom + step * (i + 0.5), out: 1, hit: false });
  }
  bullet = null;
  state = "aim";
  score = 0;
}

// Where the gun sits (fixed, bottom right) and where it's pointing.
function gun(lens) {
  var s = lens.screen;
  var angle = AIM_LOW + (AIM_HIGH - AIM_LOW) * (0.5 + 0.5 * Math.sin(swing));
  return { x: s.right - WALL - 0.1, y: s.bottom + s.height * 0.32, angle: angle };
}

// The span a nail covers, from the wall out to its head.
function nailSpan(lens, n) {
  var s = lens.screen;
  var reach = NAIL_LENGTH * n.out + 0.02;
  if (n.left) return { from: s.left + WALL, to: s.left + WALL + reach };
  return { from: s.right - WALL - reach, to: s.right - WALL };
}

function tap(lens, x, y) {
  if (state === "aim") {
    var g = gun(lens);
    var rad = g.angle * Math.PI / 180;
    var muzzle = 0.07;
    bullet = {
      x: g.x + Math.cos(rad) * muzzle,
      y: g.y + Math.sin(rad) * muzzle,
      vx: Math.cos(rad) * BULLET_SPEED,
      vy: Math.sin(rad) * BULLET_SPEED
    };
    state = "flying";
  } else if (state === "won" || state === "lost") {
    if (lens.time - endTime > 0.8) newRound(lens);
  }
}

function update(lens, dt) {
  var s = lens.screen;
  if (state === "aim") swing += dt * SWING_SPEED;

  if (state === "flying") {
    // Small steps so a fast bullet can't skip through a nail.
    var steps = 6;
    for (var k = 0; k < steps && state === "flying"; k++) moveBullet(lens, dt / steps);
  }

  // Hit nails slide into the wall.
  for (var i = 0; i < nails.length; i++) {
    if (nails[i].hit) nails[i].out = Math.max(0, nails[i].out - dt * 7);
  }

  draw(lens);
}

function moveBullet(lens, dt) {
  var s = lens.screen;
  var b = bullet;
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  // Walls.
  if (b.x < s.left + WALL + BULLET_SIZE) { b.x = s.left + WALL + BULLET_SIZE; b.vx = Math.abs(b.vx); }
  if (b.x > s.right - WALL - BULLET_SIZE) { b.x = s.right - WALL - BULLET_SIZE; b.vx = -Math.abs(b.vx); }

  // Nails: hammer it in and ricochet away from its wall.
  for (var i = 0; i < nails.length; i++) {
    var n = nails[i];
    if (n.hit) continue;
    var span = nailSpan(lens, n);
    if (b.x >= span.from - BULLET_SIZE && b.x <= span.to + BULLET_SIZE && Math.abs(b.y - n.y) < BULLET_SIZE + 0.012) {
      n.hit = true;
      score++;
      b.vx = n.left ? Math.abs(b.vx) : -Math.abs(b.vx);
      lens.burst("💥", n.left ? span.to : span.from, n.y, 1, "Explode", 0.16);
      lens.burst("✨", n.left ? span.to : span.from, n.y, 6, "Explode", 0.04);
    }
  }

  // Past the last nail (or out of the screen): the round is over.
  if (b.y > s.top + 0.05 || b.y < s.bottom - 0.05) {
    state = score === nails.length ? "won" : "lost";
    endTime = lens.time;
    bullet = null;
    if (state === "won") lens.flash(1, 0.9, 0.4);
  }
}

function draw(lens) {
  var s = lens.screen;
  var i, n, span;

  // Nails first, so the walls cover the part inside the wood.
  for (i = 0; i < nails.length; i++) {
    n = nails[i];
    span = nailSpan(lens, n);
    var len = NAIL_LENGTH + 0.03;
    var head = n.left ? span.to : span.from;
    lens.sprite("drawing:Nail", n.left ? head - len / 2 : head + len / 2, n.y, len, n.left ? 0 : 180);
  }

  // Wooden walls.
  var plank = WALL * 210 / 160;
  for (var y = s.bottom + plank / 2; y - plank / 2 < s.top; y += plank) {
    lens.sprite("drawing:WoodPlank", s.left + WALL / 2, y, WALL);
    lens.sprite("drawing:WoodPlank", s.right - WALL / 2, y, WALL);
  }

  // Heads of the nails that were hammered in.
  for (i = 0; i < nails.length; i++) {
    n = nails[i];
    if (n.out < 0.05) {
      lens.sprite("drawing:Nail", n.left ? s.left + WALL + 0.008 : s.right - WALL - 0.008, n.y, 0.06, n.left ? 0 : 180);
    }
  }

  // Gun (the drawing points up, so turn it by angle - 90) and an aiming guide.
  var g = gun(lens);
  if (state === "aim") {
    var rad = g.angle * Math.PI / 180;
    for (var d = 1; d <= 5; d++) {
      lens.sprite("•", g.x + Math.cos(rad) * (0.06 + d * 0.05), g.y + Math.sin(rad) * (0.06 + d * 0.05), 0.02, 0, 1 - d * 0.15);
    }
  }
  lens.sprite("drawing:Pistol", g.x, g.y, 0.12, g.angle - 90);

  if (bullet) {
    var heading = Math.atan2(bullet.vy, bullet.vx) * 180 / Math.PI - 90;
    lens.sprite("drawing:Bullet", bullet.x, bullet.y, 0.028, heading);
  }

  // Score and messages.
  var hud = s.top - s.height * 0.07;
  lens.text(score + "/" + nails.length, (s.left + s.right) / 2, hud, 0.1);
  if (state === "aim") lens.text("Tap to shoot!", (s.left + s.right) / 2, hud - 0.11, 0.055);
  if (state === "won" || state === "lost") {
    var mid = (s.bottom + s.top) / 2;
    lens.text(state === "won" ? "YOU WIN! 🔨" : "YOU LOSE", (s.left + s.right) / 2, mid, 0.13);
    if (lens.time - endTime > 0.8) lens.text("Tap to play again", (s.left + s.right) / 2, mid - 0.12, 0.055);
  }
}
