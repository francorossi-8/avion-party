/* Motor compartido de Carrera y Mini golf: mapas, física determinística y dibujo del mapa.
   La física solo usa + - * / y sqrt, así todos los celulares calculan exactamente el mismo tiro. */
(function (root) {
  'use strict';

  var W = 600, H = 800, BR = 9, HR = 13, DT = 1 / 60, SUB = 4;
  var FRIC = 0.983, FRIC_MUD = 0.9, BELT_V = 230, BELT_ACC = 12, BUMP = 260, VCAP = 1400;
  var VMIN = 110, VMAX = 1150, REST = 8, MAXSTEPS = 1500;
  var STEP_MS = 1000 / 60;
  var DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
  var BORDER = [[-60, -60, W + 120, 72], [-60, H - 12, W + 120, 72], [-60, -60, 72, H + 120], [W - 12, -60, 72, H + 120]];

  function line(x0, y0, x1, y1, n, r) {
    var out = [];
    for (var i = 0; i < n; i++) out.push([Math.round(x0 + (x1 - x0) * i / (n - 1)), Math.round(y0 + (y1 - y0) * i / (n - 1)), r]);
    return out;
  }

  // n: nombre · s: salida · h: hoyo · w: paredes [x,y,ancho,alto] · p: postes [x,y,r] · b: rebotadores [x,y,r]
  // m: barro [x,y,w,h] · c: cintas [x,y,w,h,dir] · t: trampas que te mandan al inicio [x,y,r] · par: golpes ideales
  var MAPS = [
    { n: 'Calentamiento', s: [300, 720], h: [300, 110],
      w: [[150, 400, 300, 16]], p: [[200, 240, 14], [400, 240, 14]], m: [[230, 540, 140, 60]] },
    { n: 'Zigzag', s: [90, 730], h: [510, 110],
      w: [[12, 600, 420, 16], [168, 420, 420, 16], [12, 240, 420, 16]],
      c: [[200, 480, 200, 60, 'l']], m: [[260, 300, 120, 70]] },
    { n: 'Ascensor', s: [300, 740], h: [300, 80],
      w: [[200, 170, 14, 480], [386, 170, 14, 480]],
      c: [[214, 170, 172, 480, 'u'], [40, 200, 140, 420, 'd'], [420, 200, 140, 420, 'd']],
      p: [[236, 112, 12], [364, 112, 12]] },
    { n: 'Pantano', s: [100, 730], h: [500, 110],
      m: [[12, 300, 250, 200], [338, 300, 250, 200], [380, 560, 208, 130], [420, 40, 168, 40]],
      p: [[300, 540, 12], [300, 260, 12]] },
    { n: 'Pinball', s: [300, 740], h: [300, 100],
      b: [[150, 550, 24], [450, 550, 24], [300, 440, 28], [180, 300, 22], [420, 300, 22], [300, 210, 20]],
      w: [[12, 650, 110, 14], [478, 650, 110, 14]] },
    { n: 'Agujero negro', s: [300, 740], h: [300, 140],
      w: [[236, 80, 14, 130], [350, 80, 14, 130], [236, 196, 128, 14]],
      t: [[300, 420, 28], [470, 230, 18]],
      c: [[40, 30, 190, 44, 'r'], [370, 30, 190, 44, 'l']] },
    { n: 'Laberinto', s: [60, 740], h: [540, 70],
      w: [[120, 560, 14, 228], [12, 460, 380, 14], [250, 474, 14, 200], [480, 300, 14, 330], [200, 300, 280, 14], [12, 180, 400, 14]],
      m: [[494, 640, 94, 148], [12, 314, 120, 100]] },
    { n: 'Rotonda', s: [300, 740], h: [300, 400],
      w: [[220, 320, 160, 14], [220, 466, 160, 14], [220, 320, 14, 160], [366, 320, 14, 90]],
      c: [[100, 180, 400, 60, 'r'], [440, 240, 60, 380, 'd'], [100, 620, 400, 60, 'l'], [100, 240, 60, 380, 'u']] },
    { n: 'Embudo', s: [300, 740], h: [300, 90],
      p: line(30, 640, 252, 262, 12, 13).concat(line(570, 640, 348, 262, 12, 13)),
      c: [[265, 160, 70, 90, 'u']], m: [[12, 240, 130, 200], [458, 240, 130, 200]] },
    { n: 'Escalera', s: [60, 740], h: [540, 80],
      w: [[150, 660, 110, 128], [260, 540, 110, 248], [370, 420, 110, 368], [480, 300, 108, 488]],
      c: [[150, 616, 110, 44, 'l'], [260, 496, 110, 44, 'l'], [370, 376, 110, 44, 'l']],
      t: [[300, 230, 16]], p: [[500, 150, 12], [560, 200, 12]] },
    { n: 'Contracorriente', s: [300, 740], h: [300, 80],
      c: [[12, 300, 576, 200, 'd'], [12, 150, 250, 40, 'r'], [338, 150, 250, 40, 'l']],
      w: [[150, 580, 300, 14]], p: [[200, 230, 12], [400, 230, 12]] },
    { n: 'Islas', s: [80, 730], h: [520, 100],
      m: [[12, 500, 200, 130], [300, 620, 288, 168], [250, 380, 338, 130], [12, 200, 320, 150], [400, 180, 188, 110]],
      p: [[420, 560, 14], [180, 440, 14]], t: [[560, 460, 16]] }
  ];

  // par de cada mapa (mínimo encontrado por el buscador automático + 1)
  [2, 4, 2, 3, 3, 3, 4, 3, 2, 3, 3, 3].forEach(function (p, i) { MAPS[i].par = p; });

  // ------------------------------------------------------------------ física
  function rect(b, r, e) {
    var cx = b.x < r[0] ? r[0] : (b.x > r[0] + r[2] ? r[0] + r[2] : b.x);
    var cy = b.y < r[1] ? r[1] : (b.y > r[1] + r[3] ? r[1] + r[3] : b.y);
    var dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy;
    if (d2 >= BR * BR) return;
    var nx, ny;
    if (d2 > 1e-9) {
      var d = Math.sqrt(d2);
      nx = dx / d; ny = dy / d;
      b.x = cx + nx * BR; b.y = cy + ny * BR;
    } else {
      var l = b.x - r[0], rr = r[0] + r[2] - b.x, u = b.y - r[1], dd = r[1] + r[3] - b.y;
      var m = Math.min(l, rr, u, dd);
      if (m === l) { nx = -1; ny = 0; b.x = r[0] - BR; }
      else if (m === rr) { nx = 1; ny = 0; b.x = r[0] + r[2] + BR; }
      else if (m === u) { nx = 0; ny = -1; b.y = r[1] - BR; }
      else { nx = 0; ny = 1; b.y = r[1] + r[3] + BR; }
    }
    var vn = b.vx * nx + b.vy * ny;
    if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; }
  }

  function circ(b, c, e, kick) {
    var dx = b.x - c[0], dy = b.y - c[1], rr = c[2] + BR, d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return;
    var nx = 0, ny = -1;
    if (d2 > 1e-9) { var d = Math.sqrt(d2); nx = dx / d; ny = dy / d; }
    b.x = c[0] + nx * rr; b.y = c[1] + ny * rr;
    var vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
      if (kick) {
        b.vx += nx * kick; b.vy += ny * kick;
        var sp2 = b.vx * b.vx + b.vy * b.vy;
        if (sp2 > VCAP * VCAP) { var k = VCAP / Math.sqrt(sp2); b.vx *= k; b.vy *= k; }
      }
    }
  }

  function inside(b, r) { return b.x >= r[0] && b.x <= r[0] + r[2] && b.y >= r[1] && b.y <= r[1] + r[3]; }

  /** ¿Se puede poner una bola acá? (lejos de paredes, postes, trampas, cintas y barro) */
  function freeAt(map, x, y, taken) {
    var walls = map._walls || (map._walls = BORDER.concat(map.w || []));
    var cl = BR + 4, i;
    for (i = 0; i < walls.length; i++) {
      var r = walls[i];
      var cx = x < r[0] ? r[0] : (x > r[0] + r[2] ? r[0] + r[2] : x);
      var cy = y < r[1] ? r[1] : (y > r[1] + r[3] ? r[1] + r[3] : y);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < cl * cl) return false;
    }
    var circs = (map.p || []).concat(map.b || []);
    for (i = 0; i < circs.length; i++) {
      var c = circs[i], d = c[2] + cl;
      if ((x - c[0]) * (x - c[0]) + (y - c[1]) * (y - c[1]) < d * d) return false;
    }
    var traps = map.t || [];
    for (i = 0; i < traps.length; i++) {
      var t = traps[i], dt = t[2] + cl + 30;
      if ((x - t[0]) * (x - t[0]) + (y - t[1]) * (y - t[1]) < dt * dt) return false;
    }
    var zones = (map.c || []).concat(map.m || []);
    for (i = 0; i < zones.length; i++) {
      var z = zones[i];
      if (x > z[0] - BR && x < z[0] + z[2] + BR && y > z[1] - BR && y < z[1] + z[3] + BR) return false;
    }
    for (i = 0; i < taken.length; i++) {
      var o = taken[i];
      if ((x - o[0]) * (x - o[0]) + (y - o[1]) * (y - o[1]) < (2 * BR + 8) * (2 * BR + 8)) return false;
    }
    return true;
  }

  /** 8 lugares de salida alrededor de la salida del mapa (los más cercanos que estén libres). */
  function startSlots(map) {
    if (map._slots) return map._slots;
    var cand = [];
    for (var j = -4; j <= 4; j++) for (var i = -5; i <= 5; i++) {
      var x = map.s[0] + i * 28 + (j % 2 ? 14 : 0), y = map.s[1] + j * 26;
      var dx = x - map.s[0], dy = y - map.s[1];
      cand.push([x, y, dx * dx + dy * dy + (dy > 0 ? 0.5 : 0) + (dx > 0 ? 0.25 : 0)]);
    }
    cand.sort(function (a, b) { return a[2] - b[2]; });
    var out = [];
    for (var k = 0; k < cand.length && out.length < 8; k++) {
      if (freeAt(map, cand[k][0], cand[k][1], out)) out.push([cand[k][0], cand[k][1]]);
    }
    map._slots = out;
    return out;
  }

  /** Simula un tiro completo. Devuelve los puntos de cada paso y cómo terminó. */
  function simulate(map, x, y, vx, vy, holeV, sx, sy) {
    if (sx == null) { sx = map.s[0]; sy = map.s[1]; }
    var walls = map._walls || (map._walls = BORDER.concat(map.w || []));
    var posts = map.p || [], bumps = map.b || [], mud = map.m || [], belts = map.c || [], traps = map.t || [];
    var b = { x: x, y: y, vx: vx, vy: vy };
    var pts = new Float32Array((MAXSTEPS + 2) * 2);
    pts[0] = x; pts[1] = y;
    var n = 1, stuck = 0, sdt = DT / SUB, hx = map.h[0], hy = map.h[1];
    var res = { holed: false, reset: false };
    var i, s;
    for (s = 0; s < MAXSTEPS; s++) {
      var px = b.x, py = b.y;
      for (var k = 0; k < SUB; k++) {
        b.x += b.vx * sdt; b.y += b.vy * sdt;
        for (i = 0; i < walls.length; i++) rect(b, walls[i], 0.72);
        for (i = 0; i < posts.length; i++) circ(b, posts[i], 0.8, 0);
        for (i = 0; i < bumps.length; i++) circ(b, bumps[i], 1, BUMP);
      }
      var f = FRIC;
      for (i = 0; i < mud.length; i++) if (inside(b, mud[i])) { f = FRIC_MUD; break; }
      var belt = null;
      for (i = 0; i < belts.length; i++) if (inside(b, belts[i])) { belt = DIRS[belts[i][4]]; break; }
      if (belt) {
        var al = b.vx * belt[0] + b.vy * belt[1];
        if (al < BELT_V) {
          var dv = (BELT_V - al) * 0.07;
          if (dv > BELT_ACC) dv = BELT_ACC;
          b.vx += belt[0] * dv; b.vy += belt[1] * dv;
        }
        al = b.vx * belt[0] + b.vy * belt[1];
        b.vx -= (b.vx - belt[0] * al) * 0.04; b.vy -= (b.vy - belt[1] * al) * 0.04;
      }
      b.vx *= f; b.vy *= f;

      var trapped = false;
      for (i = 0; i < traps.length; i++) {
        var tx = b.x - traps[i][0], ty = b.y - traps[i][1];
        if (tx * tx + ty * ty < traps[i][2] * traps[i][2]) { trapped = true; break; }
      }
      if (trapped) {
        pts[2 * n] = b.x; pts[2 * n + 1] = b.y; n++;
        res.reset = true; res.resetAt = n - 1;
        b.x = sx; b.y = sy;
        pts[2 * n] = b.x; pts[2 * n + 1] = b.y; n++;
        break;
      }
      var sp2 = b.vx * b.vx + b.vy * b.vy;
      var ex = b.x - hx, ey = b.y - hy;
      if (ex * ex + ey * ey < HR * HR && sp2 < holeV * holeV) {
        b.x = hx; b.y = hy; res.holed = true;
        pts[2 * n] = b.x; pts[2 * n + 1] = b.y; n++;
        break;
      }
      pts[2 * n] = b.x; pts[2 * n + 1] = b.y; n++;
      var mx = b.x - px, my = b.y - py;
      if (mx * mx + my * my < 0.04) stuck++; else stuck = 0;
      if ((sp2 < REST * REST && !belt) || stuck > 30) break;
    }
    res.steps = n - 1;
    res.x = b.x; res.y = b.y;
    res.pts = pts;
    return res;
  }

  /**
   * Golf con choques: simula un tiro con varias bolas en la mesa.
   * list = [[id, x, y, sx, sy], ...] en un orden fijo; la bola `shooter` sale con (vx, vy).
   * Las demás están quietas hasta que alguien las golpea. Devuelve el recorrido de todas.
   */
  function simulateMulti(map, list, shooter, vx, vy, holeV) {
    var walls = map._walls || (map._walls = BORDER.concat(map.w || []));
    var posts = map.p || [], bumps = map.b || [], mud = map.m || [], belts = map.c || [], traps = map.t || [];
    var N = list.length, i, j, k, s;
    var B = list.map(function (e) { return { x: e[1], y: e[2], vx: 0, vy: 0, on: false, gone: false, stuck: 0 }; });
    B[shooter].vx = vx; B[shooter].vy = vy; B[shooter].on = true;
    var cap = MAXSTEPS + 2;
    var pts = new Float32Array(cap * N * 2);
    var holedAt = [], resetAt = [], hit = [];
    for (i = 0; i < N; i++) { pts[2 * i] = B[i].x; pts[2 * i + 1] = B[i].y; holedAt.push(null); resetAt.push(null); hit.push(i === shooter); }
    var n = 1, sdt = DT / SUB, hx = map.h[0], hy = map.h[1], D2 = 4 * BR * BR;
    for (s = 0; s < MAXSTEPS; s++) {
      var any = false;
      for (i = 0; i < N; i++) if (B[i].on) { any = true; break; }
      if (!any) break;
      var px = [], py = [];
      for (i = 0; i < N; i++) { px.push(B[i].x); py.push(B[i].y); }
      for (k = 0; k < SUB; k++) {
        for (i = 0; i < N; i++) {
          var b = B[i];
          if (!b.on) continue;
          b.x += b.vx * sdt; b.y += b.vy * sdt;
          for (j = 0; j < walls.length; j++) rect(b, walls[j], 0.72);
          for (j = 0; j < posts.length; j++) circ(b, posts[j], 0.8, 0);
          for (j = 0; j < bumps.length; j++) circ(b, bumps[j], 1, BUMP);
        }
        // choques entre bolas (masas iguales)
        for (i = 0; i < N; i++) {
          if (B[i].gone) continue;
          for (j = i + 1; j < N; j++) {
            if (B[j].gone || (!B[i].on && !B[j].on)) continue;
            var a = B[i], c = B[j];
            var dx = c.x - a.x, dy = c.y - a.y, d2 = dx * dx + dy * dy;
            if (d2 >= D2) continue;
            var nx = 1, ny = 0, d = 0;
            if (d2 > 1e-9) { d = Math.sqrt(d2); nx = dx / d; ny = dy / d; }
            var push = (2 * BR - d) / 2;
            a.x -= nx * push; a.y -= ny * push; c.x += nx * push; c.y += ny * push;
            var rel = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
            if (rel > 0) {
              var imp = rel * 0.96;
              a.vx -= imp * nx; a.vy -= imp * ny; c.vx += imp * nx; c.vy += imp * ny;
            }
            if (!a.on) { a.on = true; a.stuck = 0; hit[i] = true; }
            if (!c.on) { c.on = true; c.stuck = 0; hit[j] = true; }
          }
        }
      }
      for (i = 0; i < N; i++) {
        var q = B[i];
        if (!q.on) continue;
        var f = FRIC;
        for (j = 0; j < mud.length; j++) if (inside(q, mud[j])) { f = FRIC_MUD; break; }
        var belt = null;
        for (j = 0; j < belts.length; j++) if (inside(q, belts[j])) { belt = DIRS[belts[j][4]]; break; }
        if (belt) {
          var al = q.vx * belt[0] + q.vy * belt[1];
          if (al < BELT_V) {
            var dv = (BELT_V - al) * 0.07;
            if (dv > BELT_ACC) dv = BELT_ACC;
            q.vx += belt[0] * dv; q.vy += belt[1] * dv;
          }
          al = q.vx * belt[0] + q.vy * belt[1];
          q.vx -= (q.vx - belt[0] * al) * 0.04; q.vy -= (q.vy - belt[1] * al) * 0.04;
        }
        q.vx *= f; q.vy *= f;
        var trapped = false;
        for (j = 0; j < traps.length; j++) {
          var tx = q.x - traps[j][0], ty = q.y - traps[j][1];
          if (tx * tx + ty * ty < traps[j][2] * traps[j][2]) { trapped = true; break; }
        }
        if (trapped) {
          q.x = list[i][3]; q.y = list[i][4]; q.vx = 0; q.vy = 0; q.on = false;
          resetAt[i] = n;
          continue;
        }
        var sp2 = q.vx * q.vx + q.vy * q.vy;
        var ex = q.x - hx, ey = q.y - hy;
        if (ex * ex + ey * ey < HR * HR && sp2 < holeV * holeV) {
          q.x = hx; q.y = hy; q.vx = 0; q.vy = 0; q.on = false; q.gone = true;
          holedAt[i] = n;
          continue;
        }
        var mx = q.x - px[i], my = q.y - py[i];
        if (mx * mx + my * my < 0.04) q.stuck++; else q.stuck = 0;
        if ((sp2 < REST * REST && !belt) || q.stuck > 30) { q.vx = 0; q.vy = 0; q.on = false; }
      }
      for (i = 0; i < N; i++) { pts[(n * N + i) * 2] = B[i].x; pts[(n * N + i) * 2 + 1] = B[i].y; }
      n++;
    }
    return {
      n: N, steps: n - 1, pts: pts, holedAt: holedAt, resetAt: resetAt, hit: hit,
      end: B.map(function (b) { return [b.x, b.y]; })
    };
  }

  function r2(v) { return Math.round(v * 100) / 100; }

  /** Velocidad de un tiro a partir del ángulo (radianes) y la fuerza (0..1), redondeada. */
  function shotVel(ang, p) {
    var sp = VMIN + p * (VMAX - VMIN);
    return [r2(Math.cos(ang) * sp), r2(Math.sin(ang) * sp)];
  }

  // ------------------------------------------------------------------ dibujo
  function rrect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /** Dibuja lo que no se mueve del mapa (fondo, barro, paredes, postes...). */
  function drawStatic(c, map) {
    c.fillStyle = '#0f3a2c';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = '#ffffff07'; c.lineWidth = 1;
    for (var gx = 0; gx <= W; gx += 40) { c.beginPath(); c.moveTo(gx, 0); c.lineTo(gx, H); c.stroke(); }
    for (var gy = 0; gy <= H; gy += 40) { c.beginPath(); c.moveTo(0, gy); c.lineTo(W, gy); c.stroke(); }
    // barro
    (map.m || []).forEach(function (r, k) {
      c.fillStyle = '#5b3c20'; rrect(c, r[0], r[1], r[2], r[3], 14); c.fill();
      c.strokeStyle = '#7a5531'; c.lineWidth = 2; c.stroke();
      c.save(); rrect(c, r[0], r[1], r[2], r[3], 14); c.clip();
      var seed = 7 + k * 13;
      c.fillStyle = '#3e2813';
      for (var i = 0; i < r[2] * r[3] / 260; i++) {
        seed = (seed * 9301 + 49297) % 233280; var fx = seed / 233280;
        seed = (seed * 9301 + 49297) % 233280; var fy = seed / 233280;
        seed = (seed * 9301 + 49297) % 233280; var fr = 2 + 4 * seed / 233280;
        c.beginPath(); c.arc(r[0] + fx * r[2], r[1] + fy * r[3], fr, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    });
    // base de las cintas
    (map.c || []).forEach(function (r) {
      c.fillStyle = '#20263d'; c.fillRect(r[0], r[1], r[2], r[3]);
      c.strokeStyle = '#3a4466'; c.lineWidth = 3;
      if (r[4] === 'u' || r[4] === 'd') {
        c.beginPath(); c.moveTo(r[0] + 1.5, r[1]); c.lineTo(r[0] + 1.5, r[1] + r[3]);
        c.moveTo(r[0] + r[2] - 1.5, r[1]); c.lineTo(r[0] + r[2] - 1.5, r[1] + r[3]); c.stroke();
      } else {
        c.beginPath(); c.moveTo(r[0], r[1] + 1.5); c.lineTo(r[0] + r[2], r[1] + 1.5);
        c.moveTo(r[0], r[1] + r[3] - 1.5); c.lineTo(r[0] + r[2], r[1] + r[3] - 1.5); c.stroke();
      }
    });
    // salida
    c.strokeStyle = '#ffffff40'; c.lineWidth = 2; c.setLineDash([4, 4]);
    c.beginPath(); c.arc(map.s[0], map.s[1], 16, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    // paredes
    var walls = (map.w || []);
    c.fillStyle = '#00000055';
    walls.forEach(function (r) { rrect(c, r[0] + 3, r[1] + 4, r[2], r[3], 4); c.fill(); });
    walls.forEach(function (r) {
      c.fillStyle = '#5167b8'; rrect(c, r[0], r[1], r[2], r[3], 4); c.fill();
      c.fillStyle = '#7d92e6'; c.fillRect(r[0] + 2, r[1] + 1, r[2] - 4, Math.min(3, r[3] - 2));
    });
    // borde
    c.strokeStyle = '#5167b8'; c.lineWidth = 12; c.strokeRect(6, 6, W - 12, H - 12);
    c.strokeStyle = '#7d92e6'; c.lineWidth = 2; c.strokeRect(12, 12, W - 24, H - 24);
    // postes
    (map.p || []).forEach(function (p) {
      c.fillStyle = '#00000055'; c.beginPath(); c.arc(p[0] + 2, p[1] + 3, p[2], 0, Math.PI * 2); c.fill();
      c.fillStyle = '#5167b8'; c.beginPath(); c.arc(p[0], p[1], p[2], 0, Math.PI * 2); c.fill();
      c.fillStyle = '#9aaaf0'; c.beginPath(); c.arc(p[0] - p[2] * 0.3, p[1] - p[2] * 0.3, p[2] * 0.35, 0, Math.PI * 2); c.fill();
    });
    // rebotadores
    (map.b || []).forEach(function (p) {
      c.fillStyle = '#3a1430'; c.beginPath(); c.arc(p[0], p[1], p[2], 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#ff6fb5'; c.lineWidth = 5; c.beginPath(); c.arc(p[0], p[1], p[2] - 2.5, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#ff6fb5'; c.beginPath(); c.arc(p[0], p[1], p[2] * 0.3, 0, Math.PI * 2); c.fill();
    });
    // hoyo
    var h = map.h;
    c.fillStyle = '#ffffff22'; c.beginPath(); c.arc(h[0], h[1], HR + 6, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#050805'; c.beginPath(); c.arc(h[0], h[1], HR, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#ffffffcc'; c.lineWidth = 2; c.beginPath(); c.arc(h[0], h[1], HR, 0, Math.PI * 2); c.stroke();
  }

  /** Lo que se anima: cintas, trampas y bandera. t en segundos. */
  function drawDynamic(c, map, t) {
    (map.c || []).forEach(function (r) {
      var d = DIRS[r[4]], vert = d[0] === 0, sp = 24;
      var off = (t * 70) % sp;
      c.save();
      c.beginPath(); c.rect(r[0] + 3, r[1] + 3, r[2] - 6, r[3] - 6); c.clip();
      c.strokeStyle = '#ffd23f66'; c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath();
      var along = vert ? r[3] : r[2], across = vert ? r[2] : r[3];
      var nAcross = Math.max(1, Math.round(across / 34));
      for (var j = 0; j < nAcross; j++) {
        var ca = (j + 0.5) * across / nAcross;
        for (var a = -sp; a < along + sp; a += sp) {
          var pa = a + off;
          // punta de la flecha en la dirección de la cinta
          var tipA = d[0] + d[1] > 0 ? pa : along - pa;
          var back = d[0] + d[1] > 0 ? -7 : 7;
          var x0, y0, x1, y1, x2, y2;
          if (vert) {
            x0 = r[0] + ca - 8; y0 = r[1] + tipA + back; x1 = r[0] + ca; y1 = r[1] + tipA; x2 = r[0] + ca + 8; y2 = y0;
          } else {
            x0 = r[0] + tipA + back; y0 = r[1] + ca - 8; x1 = r[0] + tipA; y1 = r[1] + ca; x2 = x0; y2 = r[1] + ca + 8;
          }
          c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x2, y2);
        }
      }
      c.stroke();
      c.restore();
    });
    (map.t || []).forEach(function (p) {
      var g = c.createRadialGradient(p[0], p[1], 2, p[0], p[1], p[2] + 6);
      g.addColorStop(0, '#000'); g.addColorStop(0.6, '#2a0b3d'); g.addColorStop(1, '#2a0b3d00');
      c.fillStyle = g; c.beginPath(); c.arc(p[0], p[1], p[2] + 6, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#ff5d6c'; c.lineWidth = 2.5;
      for (var k = 0; k < 3; k++) {
        var a0 = t * 3 + k * Math.PI * 2 / 3;
        c.beginPath(); c.arc(p[0], p[1], p[2] * (0.45 + 0.18 * k), a0, a0 + 1.6); c.stroke();
      }
    });
    var h = map.h, wave = Math.sin(t * 5) * 3;
    c.strokeStyle = '#e8e8e8'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(h[0], h[1]); c.lineTo(h[0], h[1] - 40); c.stroke();
    c.fillStyle = '#ff5d6c';
    c.beginPath(); c.moveTo(h[0], h[1] - 40); c.lineTo(h[0] + 24, h[1] - 33 + wave); c.lineTo(h[0], h[1] - 26); c.closePath(); c.fill();
  }

  function drawBall(c, x, y, color, me, scale) {
    var r = BR * (scale == null ? 1 : scale);
    if (r <= 0.3) return;
    c.fillStyle = '#00000066'; c.beginPath(); c.arc(x + 2, y + 3, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = color; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#0008'; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = '#ffffffb0'; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.35, r * 0.32, 0, Math.PI * 2); c.fill();
    if (me) {
      c.strokeStyle = '#ffffffaa'; c.lineWidth = 2; c.setLineDash([3, 4]);
      c.beginPath(); c.arc(x, y, r + 6, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    }
  }

  root.Rodar = {
    W: W, H: H, BR: BR, HR: HR, STEP_MS: STEP_MS, VMIN: VMIN, VMAX: VMAX, MAPS: MAPS, DIRS: DIRS, BORDER: BORDER,
    simulate: simulate, simulateMulti: simulateMulti, shotVel: shotVel, startSlots: startSlots, drawStatic: drawStatic, drawDynamic: drawDynamic, drawBall: drawBall
  };
})(typeof window !== 'undefined' ? window : globalThis);
