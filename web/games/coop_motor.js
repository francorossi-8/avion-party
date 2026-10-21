/* Motor de "Todos a la Puerta": niveles, física de plataformas y reglas de botones/puentes/compuertas.
   Alturas calibradas: un salto sube ~2,6 bloques; parado sobre un compañero llegás a 3; sobre dos, a 4. */
(function (root) {
  'use strict';

  var T = 32, PW = 22, PH = 28, G = 1900, JUMP = 560, WALK = 150, MAXFALL = 900, ROWS = 14, FLOOR = 11, BOXV = 75;

  // ------------------------------------------------------------------ niveles
  function build(name, W, fn) {
    var L = { name: name, W: W, H: ROWS, g: [], plates: [], boxes: [], links: {}, key: null, door: null, spawn: 2, hint: '' };
    for (var r = 0; r < ROWS; r++) {
      L.g.push([]);
      for (var c = 0; c < W; c++) L.g[r].push(r >= FLOOR ? '#' : '.');
    }
    function fill(c, r, w, h, ch) {
      for (var y = r; y < r + h; y++) for (var x = c; x < c + w; x++) if (y >= 0 && y < ROWS && x >= 0 && x < W) L.g[y][x] = ch;
    }
    fn({
      fill: fill,
      block: function (c, r, w, h) { fill(c, r, w, h, '#'); },
      // pozo: hueco de 2 de profundidad con pinches abajo
      pit: function (c, w) { fill(c, FLOOR, w, 2, '.'); fill(c, FLOOR + 1, w, 1, '^'); fill(c, FLOOR + 2, w, 1, '#'); },
      plate: function (id, c, r, w, need, latch) { L.plates.push({ id: id, c: c, r: r, w: w, need: need, latch: !!latch }); },
      bridge: function (ch, c, r, w, h, plates) { fill(c, r, w, h, ch); L.links[ch] = { kind: 'bridge', plates: plates }; },
      gate: function (ch, c, r, w, h, plates) { fill(c, r, w, h, ch); L.links[ch] = { kind: 'gate', plates: plates }; },
      box: function (c, r, w, h, need) { L.boxes.push({ c: c, r: r, w: w, h: h, need: need }); },
      key: function (c, r) { L.key = { c: c, r: r }; },
      door: function (c, r) { L.door = { c: c, r: r == null ? FLOOR - 1 : r }; },
      spawn: function (c) { L.spawn = c; },
      // Muro de 3 con la llave arriba. Del otro lado, un botón grande que pide a todos menos uno
      // (se queda prendido): hace aparecer un escalón para que el último también pueda subir.
      keyWall: function (c) {
        fill(c, 8, 3, 3, '#');
        L.key = { c: c + 1, r: 7 };
        fill(c - 1, 10, 1, 1, 'Z');
        L.links.Z = { kind: 'bridge', plates: ['z'] };
        L.plates.push({ id: 'z', c: c + 4, r: 10, w: 6, need: -1, latch: true });
      },
      hint: function (t) { L.hint = t; }
    });
    return L;
  }

  var LEVELS = [
    build('Primer salto', 32, function (L) {
      L.hint('La llave está alta: uno se para y el otro se le sube a la cabeza. Del otro lado, si pisan el botón todos menos uno, aparece un escalón para el último.');
      L.keyWall(13); L.door(28);
    }),
    build('El puente', 44, function (L) {
      L.hint('El puente aparece mientras alguien pisa un botón. Hay uno de cada lado.');
      L.pit(12, 4);
      L.bridge('A', 12, FLOOR, 4, 1, ['a', 'b']);
      L.plate('a', 8, 10, 2, 1); L.plate('b', 18, 10, 2, 1);
      L.keyWall(25); L.door(40);
    }),
    build('Caja pesada', 40, function (L) {
      L.hint('La caja es pesada: hay que empujarla entre varios hasta la pared alta.');
      L.box(9, 9, 2, 2, 2);
      L.block(29, 7, 4, 4); L.key(30, 6); L.door(38);
    }),
    build('Todos juntos', 44, function (L) {
      L.hint('La compuerta se abre cuando todos (hasta 5) se paran en el botón grande.');
      L.plate('a', 8, 10, 6, 5, true);
      L.gate('1', 20, 1, 1, 10, ['a']);
      L.keyWall(27); L.door(41);
    }),
    build('Escalera humana', 48, function (L) {
      L.hint('Suban al muro apilándose. El que llega arriba pisa el botón y aparece una escalera para el último.');
      L.block(15, 8, 6, 3);
      L.plate('a', 18, 7, 2, 1);
      L.bridge('A', 13, 10, 2, 1, ['a']); L.bridge('B', 14, 9, 1, 1, ['a']);
      L.keyWall(28); L.door(44);
    }),
    build('Gran final', 58, function (L) {
      L.hint('Tiren la caja al pozo para cruzar, abran la compuerta entre varios y busquen la llave.');
      L.box(9, 9, 4, 2, 3);
      L.pit(14, 4);
      L.plate('a', 23, 10, 6, 3, true);
      L.gate('1', 33, 1, 1, 10, ['a']);
      L.keyWall(40); L.door(55);
    })
  ];

  /** Cuántos hacen falta con n jugadores. need negativo = "todos menos |need|" (−1: todos menos uno). */
  function needOf(need, n) { return need <= 0 ? Math.max(1, n + need) : Math.max(1, Math.min(need, n)); }

  /** Qué está activo: puentes (sólidos) y compuertas (abiertas). */
  function linkState(L, pressed) {
    var on = {};
    Object.keys(L.links).forEach(function (ch) {
      on[ch] = L.links[ch].plates.some(function (p) { return pressed[p]; });
    });
    return on;
  }
  function tileSolid(L, on, c, r) {
    if (c < 0 || c >= L.W) return true;     // paredes laterales invisibles
    if (r < 0 || r >= ROWS) return false;
    var ch = L.g[r][c];
    if (ch === '#') return true;
    if (ch === '.' || ch === '^') return false;
    var link = L.links[ch];
    if (!link) return false;
    return link.kind === 'bridge' ? !!on[ch] : !on[ch];
  }

  // ------------------------------------------------------------------ física
  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  /** Rectángulos sólidos cerca de una caja de colisión. */
  function solidsNear(L, on, r, extra) {
    var out = [];
    var c0 = Math.floor(r.x / T) - 1, c1 = Math.floor((r.x + r.w) / T) + 1;
    var r0 = Math.floor(r.y / T) - 1, r1 = Math.floor((r.y + r.h) / T) + 1;
    for (var y = r0; y <= r1; y++) for (var x = c0; x <= c1; x++) {
      if (tileSolid(L, on, x, y)) out.push({ x: x * T, y: y * T, w: T, h: T, ref: null });
    }
    if (extra) for (var i = 0; i < extra.length; i++) out.push(extra[i]);
    return out;
  }

  function newPlayer(x, y) {
    return { x: x, y: y, w: PW, h: PH, vx: 0, vy: 0, onGround: false, ground: null, coyote: 0, jumpBuf: 0, facing: 1, pushDir: 0, pushBox: -1, dead: false };
  }

  /**
   * Avanza al jugador propio. inp = {l, r, jump (recién apretado)}.
   * mates = [{id, x, y, w, h, dx, dy}] compañeros (posición que se ve); boxes = [{i, x, y, w, h, dx, dy}].
   */
  function stepPlayer(L, on, p, inp, dt, mates, boxes) {
    p.pushDir = 0; p.pushBox = -1;
    // si una caja o un compañero se me metió encima, salir por el lado más corto
    var dyn = [];
    boxes.forEach(function (b) { dyn.push({ x: b.x, y: b.y, w: b.w, h: b.h, ref: { t: 'b', i: b.i }, dx: b.dx || 0, dy: b.dy || 0 }); });
    dyn.forEach(function (b) {
      if (!overlap(p, b)) return;
      var l = p.x + p.w - b.x, rr = b.x + b.w - p.x, u = p.y + p.h - b.y, d = b.y + b.h - p.y;
      var m = Math.min(l, rr, u, d);
      if (m === u) p.y = b.y - p.h; else if (m === l) p.x = b.x - p.w; else if (m === rr) p.x = b.x + b.w; else p.y = b.y + b.h;
    });
    // los compañeros con los que ya estoy encimado no cuentan (por la demora de red)
    mates.forEach(function (m) {
      if (overlap(p, m)) return;
      dyn.push({ x: m.x, y: m.y, w: m.w, h: m.h, ref: { t: 'p', id: m.id }, dx: m.dx || 0, dy: m.dy || 0 });
    });
    // me llevan: si estoy parado sobre algo que se movió
    if (p.ground) {
      for (var i = 0; i < dyn.length; i++) {
        var g = dyn[i].ref;
        if (g && g.t === p.ground.t && (g.t === 'b' ? g.i === p.ground.i : g.id === p.ground.id)) {
          if (dyn[i].dx) moveX(L, on, p, dyn[i].dx, dyn, true);
          if (dyn[i].dy > 0) moveY(L, on, p, dyn[i].dy, dyn);
          break;
        }
      }
    }
    var dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    p.vx = dir * WALK;
    if (dir) p.facing = dir;
    p.jumpBuf = inp.jump ? 0.12 : Math.max(0, p.jumpBuf - dt);
    p.coyote = p.onGround ? 0.09 : Math.max(0, p.coyote - dt);
    if (p.jumpBuf > 0 && p.coyote > 0) { p.vy = -JUMP; p.jumpBuf = 0; p.coyote = 0; p.onGround = false; p.ground = null; }
    var n = Math.max(1, Math.ceil(dt / (1 / 120))), sdt = dt / n;
    for (var k = 0; k < n; k++) {
      p.vy = Math.min(MAXFALL, p.vy + G * sdt);
      moveX(L, on, p, p.vx * sdt, dyn, false);
      moveY(L, on, p, p.vy * sdt, dyn);
    }
    // pinches y caídas
    var c0 = Math.floor(p.x / T), c1 = Math.floor((p.x + p.w - 0.01) / T);
    var r0 = Math.floor(p.y / T), r1 = Math.floor((p.y + p.h - 0.01) / T);
    for (var y = r0; y <= r1; y++) for (var x = c0; x <= c1; x++) {
      if (y >= 0 && y < ROWS && x >= 0 && x < L.W && L.g[y][x] === '^' && overlap(p, { x: x * T + 4, y: y * T + T / 2, w: T - 8, h: T / 2 })) p.dead = true;
    }
    if (p.y > ROWS * T + 60) p.dead = true;
  }

  function moveX(L, on, p, dx, dyn, carried) {
    if (!dx) return;
    p.x += dx;
    var rs = solidsNear(L, on, p, dyn);
    for (var i = 0; i < rs.length; i++) {
      var s = rs[i];
      if (!overlap(p, s)) continue;
      if (dx > 0) p.x = s.x - p.w; else p.x = s.x + s.w;
      if (!carried && s.ref && s.ref.t === 'b') { p.pushDir = dx > 0 ? 1 : -1; p.pushBox = s.ref.i; }
    }
  }
  function moveY(L, on, p, dy, dyn) {
    if (!dy) return;
    p.y += dy;
    if (dy > 0) { p.onGround = false; p.ground = null; }
    var rs = solidsNear(L, on, p, dyn);
    for (var i = 0; i < rs.length; i++) {
      var s = rs[i];
      if (!overlap(p, s)) continue;
      if (dy > 0) { p.y = s.y - p.h; p.vy = 0; p.onGround = true; p.ground = s.ref; }
      else { p.y = s.y + s.h; p.vy = 0; }
    }
  }

  /** Caja pesada (la mueve el anfitrión). b = {x, y, w, h, vy, falling}. */
  function stepBox(L, on, b, push, dt, others) {
    var dyn = others.map(function (o) { return { x: o.x, y: o.y, w: o.w, h: o.h, ref: null }; });
    // ¿cuánto de la caja está apoyado?
    var probe = { x: b.x + 1, y: b.y + b.h, w: b.w - 2, h: 1 };
    var support = 0;
    solidsNear(L, on, probe, dyn).forEach(function (s) {
      if (overlap(probe, s)) support += Math.min(b.x + b.w, s.x + s.w) - Math.max(b.x, s.x);
    });
    if (!b.falling && support > 0 && support <= T * 0.75 && Math.abs((b.y + b.h) / T - Math.round((b.y + b.h) / T)) < 0.02) {
      // casi toda en el aire: si abajo hay un pozo de su ancho, se acomoda y cae justo adentro
      var row = Math.round((b.y + b.h) / T), wt = Math.round(b.w / T);
      var c0 = Math.floor(b.x / T) - 1, c1 = Math.ceil((b.x + b.w) / T);
      for (var pc = c0; pc <= c1; pc++) {
        var free = true;
        for (var k = 0; k < wt; k++) if (tileSolid(L, on, pc + k, row)) { free = false; break; }
        if (free) { b.x = pc * T; support = 0; break; }
      }
    }
    var supported = support > 0;
    if (!supported && !b.falling) { b.falling = true; b.x = Math.round(b.x / T) * T; }
    if (supported) b.falling = false;
    var vx = b.falling ? 0 : push * BOXV;
    b.vy = Math.min(MAXFALL, (b.vy || 0) + G * dt);
    if (vx) {
      b.x += vx * dt;
      solidsNear(L, on, b, dyn).forEach(function (s) {
        if (!overlap(b, s)) return;
        if (vx > 0) b.x = s.x - b.w; else b.x = s.x + s.w;
      });
    }
    b.y += b.vy * dt;
    solidsNear(L, on, b, dyn).forEach(function (s) {
      if (!overlap(b, s)) return;
      if (b.vy > 0) { b.y = s.y - b.h; b.vy = 0; } else { b.y = s.y + s.h; b.vy = 0; }
    });
  }

  /** Lugar de aparición de cada jugador. */
  function spawnPos(L, idx) {
    return { x: L.spawn * T + 4 + idx * 26, y: (FLOOR) * T - PH };
  }

  root.Coop = {
    T: T, PW: PW, PH: PH, ROWS: ROWS, FLOOR: FLOOR, JUMP: JUMP, G: G, WALK: WALK, BOXV: BOXV, LEVELS: LEVELS,
    needOf: needOf, linkState: linkState, tileSolid: tileSolid, overlap: overlap, solidsNear: solidsNear,
    newPlayer: newPlayer, stepPlayer: stepPlayer, stepBox: stepBox, spawnPos: spawnPos
  };
})(typeof window !== 'undefined' ? window : globalThis);
