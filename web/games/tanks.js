/* Tanques: girar, avanzar, disparar. Balas que rebotan en un laberinto. Tiempo real, 2 a 6. */
(function () {
  'use strict';

  var W = 600, H = 800, CELL = 100, T = 8;
  var R = 15, ROT = 3.1, SPEED = 125, BSPEED = 235, BR = 4, BLIFE = 6, BMAX = 5, COOLDOWN = 0.28;
  var TICK = 33;

  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  function makeMaze(seed) {
    var rand = rng(seed), cols = W / CELL, rows = H / CELL;
    // paredes internas: v[c][r] entre (c,r) y (c+1,r); hz[c][r] entre (c,r) y (c,r+1)
    var v = {}, hz = {}, seen = {};
    for (var c = 0; c < cols; c++) for (var r = 0; r < rows; r++) { v[c + ',' + r] = c < cols - 1; hz[c + ',' + r] = r < rows - 1; }
    var stack = [[0, 0]]; seen['0,0'] = 1;
    while (stack.length) {
      var top = stack[stack.length - 1], x = top[0], y = top[1], opts = [];
      if (x > 0 && !seen[(x - 1) + ',' + y]) opts.push([-1, 0]);
      if (x < cols - 1 && !seen[(x + 1) + ',' + y]) opts.push([1, 0]);
      if (y > 0 && !seen[x + ',' + (y - 1)]) opts.push([0, -1]);
      if (y < rows - 1 && !seen[x + ',' + (y + 1)]) opts.push([0, 1]);
      if (!opts.length) { stack.pop(); continue; }
      var d = opts[(rand() * opts.length) | 0], nx = x + d[0], ny = y + d[1];
      if (d[0] === 1) v[x + ',' + y] = false;
      if (d[0] === -1) v[nx + ',' + ny] = false;
      if (d[1] === 1) hz[x + ',' + y] = false;
      if (d[1] === -1) hz[nx + ',' + ny] = false;
      seen[nx + ',' + ny] = 1;
      stack.push([nx, ny]);
    }
    var walls = [[-T, -T, W + 2 * T, T + T / 2], [-T, H - T / 2, W + 2 * T, T + T / 2], [-T, -T, T + T / 2, H + 2 * T], [W - T / 2, -T, T + T / 2, H + 2 * T]];
    for (c = 0; c < cols; c++) for (r = 0; r < rows; r++) {
      if (v[c + ',' + r] && rand() < 0.5) walls.push([(c + 1) * CELL - T / 2, r * CELL - T / 2, T, CELL + T]);
      if (hz[c + ',' + r] && rand() < 0.5) walls.push([c * CELL - T / 2, (r + 1) * CELL - T / 2, CELL + T, T]);
    }
    return walls;
  }

  function hitsWall(walls, x, y, rad) {
    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      if (x + rad > w[0] && x - rad < w[0] + w[2] && y + rad > w[1] && y - rad < w[1] + w[3]) return true;
    }
    return false;
  }

  function pushOut(walls, t) {
    for (var it = 0; it < 3; it++) {
      for (var i = 0; i < walls.length; i++) {
        var w = walls[i];
        var cx = Math.max(w[0], Math.min(t.x, w[0] + w[2]));
        var cy = Math.max(w[1], Math.min(t.y, w[1] + w[3]));
        var dx = t.x - cx, dy = t.y - cy, d2 = dx * dx + dy * dy;
        if (d2 < R * R) {
          var d = Math.sqrt(d2);
          if (d < 0.001) { // centro adentro de la pared: salir por el lado más corto
            var l = t.x - w[0], rr = w[0] + w[2] - t.x, u = t.y - w[1], b = w[1] + w[3] - t.y, m = Math.min(l, rr, u, b);
            if (m === l) t.x = w[0] - R; else if (m === rr) t.x = w[0] + w[2] + R; else if (m === u) t.y = w[1] - R; else t.y = w[1] + w[3] + R;
          } else {
            t.x = cx + dx / d * R; t.y = cy + dy / d * R;
          }
        }
      }
    }
  }

  function lerpAngle(a, b, f) {
    var d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return a + d * f;
  }

  App.register({
    id: 'tanks', name: 'Tanques', emoji: '🪖', players: '2-8',
    desc: 'Girar, avanzar, disparar. Las balas rebotan.',
    create: function (api) {
      var self = { alive: true };
      var el = api.el;
      var G = null;            // simulación (anfitrión)
      var info = null;         // última info de ronda recibida {walls, players, scores, target, phase, round}
      var snaps = [];          // últimos snapshots [{t, d}]
      var wasHost = api.isHost();
      var lastVals = { target: 5 };
      var timer = null, raf = null;
      var canvas, ctx, scale = 1, dpr = 1;
      var myIn = { r: 0, f: 0 };
      var particles = [];
      var prevAlive = {};

      // ================================================== anfitrión
      function startMatch(vals, keepScores) {
        var ps = api.members().filter(function (m) { return m.online; }).slice(0, 8);
        if (ps.length < 2) { api.toast('Se necesitan 2 jugadores'); return; }
        lastVals = vals;
        G = {
          target: vals.target, round: 0, scores: {},
          players: ps.map(function (p, i) { return { id: p.id, name: p.name, color: api.colors[i % 8] }; }),
          inputs: {}
        };
        G.players.forEach(function (p) { G.scores[p.id] = 0; });
        if (keepScores) G.scores = keepScores;
        newRound();
        runLoop();
      }

      function newRound() {
        var seed = (Math.random() * 1e9) | 0;
        G.walls = makeMaze(seed);
        G.round++;
        G.phase = 'count';
        G.timer = 3;
        G.bullets = [];
        var cells = [];
        for (var c = 0; c < W / CELL; c++) for (var r = 0; r < H / CELL; r++) cells.push([c, r]);
        cells.sort(function () { return Math.random() - 0.5; });
        // elegir celdas separadas entre sí
        var chosen = [];
        // separados lo más posible (con 8 jugadores se relaja la distancia)
        for (var need = 3; need >= 0 && chosen.length < G.players.length; need--) {
          for (var i = 0; i < cells.length && chosen.length < G.players.length; i++) {
            if (chosen.indexOf(cells[i]) >= 0) continue;
            var ok = chosen.every(function (o) { return Math.abs(o[0] - cells[i][0]) + Math.abs(o[1] - cells[i][1]) >= need; });
            if (ok) chosen.push(cells[i]);
          }
        }
        G.tanks = G.players.map(function (p, k) {
          return { id: p.id, x: chosen[k][0] * CELL + CELL / 2, y: chosen[k][1] * CELL + CELL / 2, a: ((Math.random() * 4) | 0) * Math.PI / 2, alive: true, cd: 0 };
        });
        G.winner = null;
        sendInfo();
      }

      function infoMsg() {
        return {
          type: 'r', walls: G.walls, players: G.players, scores: G.scores, target: G.target,
          phase: G.phase, round: G.round, winner: G.winner
        };
      }
      function sendInfo() { api.toAll(infoMsg()); }

      function runLoop() {
        stopLoop();
        var last = Date.now();
        timer = setInterval(function () {
          var now = Date.now(), dt = Math.min(0.06, (now - last) / 1000);
          last = now;
          step(dt);
        }, TICK);
      }
      function stopLoop() { if (timer) clearInterval(timer); timer = null; }

      function step(dt) {
        if (!G || !G.tanks) return;
        if (G.phase === 'count') {
          G.timer -= dt;
          if (G.timer <= 0) { G.phase = 'fight'; sendInfo(); }
        } else if (G.phase === 'fight' || G.phase === 'end') {
          G.tanks.forEach(function (t) {
            if (!t.alive) return;
            var inp = G.inputs[t.id] || {};
            t.cd = Math.max(0, t.cd - dt);
            if (G.phase !== 'fight') return;
            if (inp.r) t.a += ROT * dt;
            if (t.a > Math.PI * 2) t.a -= Math.PI * 2;
            if (inp.f) { t.x += Math.cos(t.a) * SPEED * dt; t.y += Math.sin(t.a) * SPEED * dt; }
            pushOut(G.walls, t);
            if (inp.shoot) {
              inp.shoot = false;
              var mine = G.bullets.filter(function (b) { return b.o === t.id; }).length;
              if (t.cd <= 0 && mine < BMAX) {
                t.cd = COOLDOWN;
                var bx = t.x + Math.cos(t.a) * (R + 3), by = t.y + Math.sin(t.a) * (R + 3);
                if (hitsWall(G.walls, bx, by, BR)) { bx = t.x; by = t.y; }
                G.bullets.push({ x: bx, y: by, vx: Math.cos(t.a) * BSPEED, vy: Math.sin(t.a) * BSPEED, o: t.id, age: 0 });
              }
            }
          });
          // tanques entre sí
          for (var i = 0; i < G.tanks.length; i++) for (var j = i + 1; j < G.tanks.length; j++) {
            var a = G.tanks[i], b = G.tanks[j];
            if (!a.alive || !b.alive) continue;
            var dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy);
            if (d < 2 * R && d > 0.01) {
              var push = (2 * R - d) / 2;
              a.x -= dx / d * push; a.y -= dy / d * push; b.x += dx / d * push; b.y += dy / d * push;
              pushOut(G.walls, a); pushOut(G.walls, b);
            }
          }
          // balas
          G.bullets = G.bullets.filter(function (bl) {
            bl.age += dt;
            if (bl.age > BLIFE) return false;
            var steps = Math.ceil(BSPEED * dt / 3);
            var sdt = dt / steps;
            for (var s = 0; s < steps; s++) {
              var nx = bl.x + bl.vx * sdt, ny = bl.y + bl.vy * sdt;
              if (hitsWall(G.walls, nx, ny, BR)) {
                var hx = hitsWall(G.walls, nx, bl.y, BR), hy = hitsWall(G.walls, bl.x, ny, BR);
                if (hx) bl.vx = -bl.vx;
                if (hy) bl.vy = -bl.vy;
                if (!hx && !hy) { bl.vx = -bl.vx; bl.vy = -bl.vy; }
              } else { bl.x = nx; bl.y = ny; }
              for (var k = 0; k < G.tanks.length; k++) {
                var t = G.tanks[k];
                if (!t.alive) continue;
                if (t.id === bl.o && bl.age < 0.12) continue;
                var ddx = t.x - bl.x, ddy = t.y - bl.y;
                if (ddx * ddx + ddy * ddy < (R + BR) * (R + BR)) { t.alive = false; return false; }
              }
            }
            return true;
          });
          var alive = G.tanks.filter(function (t) { return t.alive; });
          if (G.phase === 'fight' && alive.length <= 1) { G.phase = 'end'; G.timer = 2.2; }
          if (G.phase === 'end') {
            G.timer -= dt;
            if (G.timer <= 0) {
              alive = G.tanks.filter(function (t) { return t.alive; });
              if (alive.length === 1) { G.scores[alive[0].id] = (G.scores[alive[0].id] || 0) + 1; G.winner = alive[0].id; }
              else G.winner = null;
              var champ = null;
              G.players.forEach(function (p) { if (G.scores[p.id] >= G.target) champ = p.id; });
              if (champ) {
                G.phase = 'over'; G.champ = champ; G.bullets = [];
                var m = infoMsg(); m.champ = champ; api.toAll(m);
                stopLoop();
                return;
              }
              newRound();
              return;
            }
          }
        }
        api.toAll({
          type: 's', p: G.phase, c: Math.ceil(G.timer),
          k: G.tanks.map(function (t) { return [Math.round(t.x * 10) / 10, Math.round(t.y * 10) / 10, Math.round(t.a * 100) / 100, t.alive ? 1 : 0]; }),
          b: G.bullets.map(function (b) { return [Math.round(b.x), Math.round(b.y)]; })
        });
      }

      function hostMsg(from, d) {
        if (d.type === 'sync') {
          if (G && G.walls) { var m = infoMsg(); if (G.phase === 'over') m.champ = G.champ; api.to(from, m); }
          else api.to(from, { type: 'r', phase: 'wait' });
          return;
        }
        if (!G) { if (d.type === 'start' && from === api.me) startMatch(d.vals); return; }
        if (d.type === 'start' && from === api.me) { startMatch(d.vals); return; }
        if (d.type === 'lobby' && from === api.me) { stopLoop(); G = null; api.toAll({ type: 'r', phase: 'wait' }); return; }
        if (d.type === 'in') {
          var inp = G.inputs[from] || (G.inputs[from] = {});
          inp.r = !!d.r; inp.f = !!d.f;
          if (d.s) inp.shoot = true;
        }
      }

      // ================================================== todos
      self.onMsg = function (from, d) {
        if (d.type === 'r' || d.type === 's') {
          if (from !== api.hostId() && from !== api.me) return;
          if (d.type === 'r') onInfo(d); else onSnap(d);
          return;
        }
        if (api.isHost()) hostMsg(from, d);
      };

      function onInfo(d) {
        var wasWait = !info || info.phase === 'wait';
        var newRoundStarted = info && d.round !== info.round;
        info = d;
        if (d.phase === 'wait') { stopDraw(); renderWait(); return; }
        if (newRoundStarted) { snaps = []; particles = []; prevAlive = {}; }
        if (wasWait || !canvas) renderPlay();
        updateHud();
        if (d.phase === 'fight') api.vibrate(40);
      }

      function onSnap(d) {
        snaps.push({ t: performance.now(), d: d });
        if (snaps.length > 3) snaps.shift();
        if (!info || !info.players) return;
        // explosiones
        d.k.forEach(function (k, i) {
          var p = info.players[i];
          if (!p) return;
          if (prevAlive[p.id] === 1 && k[3] === 0) {
            boom(k[0], k[1], p.color);
            if (p.id === api.me) api.vibrate(200);
          }
          prevAlive[p.id] = k[3];
        });
        if (info.phase !== d.p) { info.phase = d.p; updateHud(); }
      }

      function boom(x, y, color) {
        for (var i = 0; i < 26; i++) {
          var a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 160;
          particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6 + Math.random() * 0.5, c: i % 3 ? color : '#ffd23f' });
        }
      }

      // ================================================== vista
      function renderWait() {
        stopDraw();
        canvas = null;
        api.waiting({
          emoji: '🪖', title: 'Tanques',
          sub: 'Tres botones: <b>girar</b>, <b>avanzar</b> y <b>disparar</b>. Las balas rebotan en las paredes (¡y te pueden pegar a vos!). El último en pie gana la ronda.',
          min: 2, max: 8, values: lastVals,
          options: [{ key: 'target', label: 'Puntos para ganar', value: 5, choices: [[3, '3'], [5, '5'], [10, '10']] }],
          onStart: function (vals) { api.toHost({ type: 'start', vals: vals }); }
        });
      }

      function renderPlay() {
        el.onclick = null;
        el.innerHTML = '<div id="tk-sb"></div>' +
          '<div style="flex:1;min-height:0;position:relative" id="tk-wrap"><canvas class="arena" id="tk-c"></canvas><div id="tk-ov"></div></div>' +
          '<div class="pad" id="tk-pad">' +
          '<button data-k="r" style="background:#3b4d8f"><span class="ic">⟳</span>Girar</button>' +
          '<button data-k="f" style="background:#2f7a55"><span class="ic">▲</span>Avanzar</button>' +
          '<button data-k="s" style="background:#a8394a"><span class="ic">💥</span>Disparar</button></div>';
        canvas = el.querySelector('#tk-c');
        if (window.ResizeObserver) {
          if (self._ro) self._ro.disconnect();
          self._ro = new ResizeObserver(function () { resize(); });
          self._ro.observe(el.querySelector('#tk-wrap'));
        }
        ctx = canvas.getContext('2d');
        setupPad();
        resize();
        startDraw();
      }

      function resize() {
        if (!canvas) return;
        var wrap = el.querySelector('#tk-wrap');
        var aw = wrap.clientWidth - 12, ah = wrap.clientHeight - 6;
        scale = Math.min(aw / W, ah / H);
        dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.style.width = Math.floor(W * scale) + 'px';
        canvas.style.height = Math.floor(H * scale) + 'px';
        canvas.width = Math.floor(W * scale * dpr);
        canvas.height = Math.floor(H * scale * dpr);
      }

      function setupPad() {
        var pad = el.querySelector('#tk-pad');
        var held = { r: {}, f: {} };
        function upd() {
          var r = Object.keys(held.r).length ? 1 : 0, f = Object.keys(held.f).length ? 1 : 0;
          if (r !== myIn.r || f !== myIn.f) { myIn.r = r; myIn.f = f; api.toHost({ type: 'in', r: r, f: f }); }
        }
        var btns = pad.querySelectorAll('button');
        Array.prototype.forEach.call(btns, function (b) {
          var k = b.getAttribute('data-k');
          b.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            try { b.setPointerCapture(e.pointerId); } catch (x) { }
            b.classList.add('held');
            if (k === 's') { api.toHost({ type: 'in', r: myIn.r, f: myIn.f, s: 1 }); return; }
            held[k][e.pointerId] = 1; upd();
          });
          function up(e) {
            b.classList.remove('held');
            if (k === 's') return;
            delete held[k][e.pointerId]; upd();
          }
          b.addEventListener('pointerup', up);
          b.addEventListener('pointercancel', up);
          b.addEventListener('lostpointercapture', up);
          b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        });
        self._keys = function (e, down) {
          var k = e.key;
          if (k === 'a' || k === 'ArrowLeft' || k === 'ArrowRight' || k === 'd') { held.r.kb = down || undefined; if (!down) delete held.r.kb; upd(); }
          else if (k === 'w' || k === 'ArrowUp') { if (down) held.f.kb = 1; else delete held.f.kb; upd(); }
          else if ((k === ' ' || k === 'Enter') && down && !e.repeat) api.toHost({ type: 'in', r: myIn.r, f: myIn.f, s: 1 });
          else return;
          e.preventDefault();
        };
      }
      function kd(e) { if (self._keys && canvas) self._keys(e, true); }
      function ku(e) { if (self._keys && canvas) self._keys(e, false); }
      document.addEventListener('keydown', kd);
      document.addEventListener('keyup', ku);

      function updateHud() {
        var sb = el.querySelector('#tk-sb');
        if (!sb || !info || !info.players) return;
        sb.innerHTML = App.scoreStrip(info.players.map(function (p) {
          return { id: p.id, name: p.name, color: p.color, score: info.scores[p.id] || 0 };
        }), '🏁 ' + info.target);
        var ov = el.querySelector('#tk-ov');
        if (info.phase === 'over' && info.champ) {
          var cp = info.players.filter(function (p) { return p.id === info.champ; })[0] || { name: '¿?', color: '#fff' };
          ov.innerHTML = '<div class="overlay"><div style="font-size:56px">🏆</div><h3 style="color:' + cp.color + '">¡Ganó ' + api.esc(cp.name) + '!</h3>' +
            (api.isHost() ? '<div style="display:flex;gap:10px"><button class="btn" data-a="again">Revancha</button><button class="btn ghost" data-a="lobby">Salir al menú</button></div>'
              : '<p>Esperando al anfitrión…</p>') + '</div>';
          ov.onclick = function (e) {
            var a = e.target.getAttribute('data-a');
            if (a === 'again') api.toHost({ type: 'start', vals: lastVals });
            if (a === 'lobby') api.toHost({ type: 'lobby' });
          };
        } else {
          ov.innerHTML = '';
        }
        var inGame = info.players.some(function (p) { return p.id === api.me; });
        var pad = el.querySelector('#tk-pad');
        if (pad) pad.style.display = inGame ? '' : 'none';
      }

      function startDraw() {
        stopDraw();
        (function loop() {
          raf = requestAnimationFrame(loop);
          draw();
        })();
      }
      function stopDraw() { if (raf) cancelAnimationFrame(raf); raf = null; }

      var lastFrame = performance.now();
      function draw() {
        if (!canvas || !info || !info.walls) return;
        var now = performance.now(), fdt = Math.min(0.05, (now - lastFrame) / 1000);
        lastFrame = now;
        var c = ctx;
        c.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
        // piso
        c.fillStyle = '#121a38';
        c.fillRect(0, 0, W, H);
        c.strokeStyle = '#ffffff08'; c.lineWidth = 1;
        for (var gx = 0; gx <= W; gx += 25) { c.beginPath(); c.moveTo(gx, 0); c.lineTo(gx, H); c.stroke(); }
        for (var gy = 0; gy <= H; gy += 25) { c.beginPath(); c.moveTo(0, gy); c.lineTo(W, gy); c.stroke(); }
        // paredes
        c.fillStyle = '#4a5ba3';
        info.walls.forEach(function (w) { c.fillRect(w[0], w[1], w[2], w[3]); });
        c.fillStyle = '#6f82d2';
        info.walls.forEach(function (w) { c.fillRect(w[0], w[1], w[2], Math.min(3, w[3])); });

        // interpolar
        var a = snaps[snaps.length - 2], b = snaps[snaps.length - 1];
        if (!b) return;
        var f = a ? Math.min(1, (now - b.t) / TICK) : 1;
        var tanks = b.d.k.map(function (k, i) {
          var p = a && a.d.k[i];
          if (!p) return k;
          return [p[0] + (k[0] - p[0]) * f, p[1] + (k[1] - p[1]) * f, lerpAngle(p[2], k[2], f), k[3]];
        });
        tanks.forEach(function (k, i) {
          var pl = info.players[i];
          if (!pl || !k[3]) return;
          drawTank(c, k[0], k[1], k[2], pl.color, pl.id === api.me);
        });
        // balas
        c.fillStyle = '#fff';
        c.shadowColor = '#fff'; c.shadowBlur = 8;
        b.d.b.forEach(function (bl) { c.beginPath(); c.arc(bl[0], bl[1], BR, 0, Math.PI * 2); c.fill(); });
        c.shadowBlur = 0;
        // partículas
        particles = particles.filter(function (p) {
          p.life -= fdt; if (p.life <= 0) return false;
          p.x += p.vx * fdt; p.y += p.vy * fdt; p.vx *= 0.92; p.vy *= 0.92;
          c.globalAlpha = Math.min(1, p.life * 2);
          c.fillStyle = p.c; c.fillRect(p.x - 3, p.y - 3, 6, 6);
          return true;
        });
        c.globalAlpha = 1;
        // cuenta regresiva / fin de ronda
        if (b.d.p === 'count') {
          c.fillStyle = '#0b1020aa'; c.fillRect(0, H / 2 - 70, W, 140);
          c.fillStyle = '#fff'; c.font = '900 96px ui-rounded, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(String(Math.max(1, b.d.c)), W / 2, H / 2 + 4);
        } else if (b.d.p === 'end') {
          var alive = [];
          b.d.k.forEach(function (k, i) { if (k[3]) alive.push(info.players[i]); });
          c.fillStyle = '#0b1020aa'; c.fillRect(0, H / 2 - 50, W, 100);
          c.font = '900 44px ui-rounded, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          if (alive.length === 1 && alive[0]) { c.fillStyle = alive[0].color; c.fillText('¡Punto para ' + alive[0].name + '!', W / 2, H / 2); }
          else { c.fillStyle = '#fff'; c.fillText('¡Empate!', W / 2, H / 2); }
        }
      }

      function drawTank(c, x, y, a, color, me) {
        c.save();
        c.translate(x, y);
        if (me) {
          c.strokeStyle = '#ffffff55'; c.lineWidth = 2; c.setLineDash([4, 4]);
          c.beginPath(); c.arc(0, 0, R + 7, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
        }
        c.rotate(a);
        c.fillStyle = '#00000088'; c.fillRect(-14, -13, 28, 26);
        c.fillStyle = '#1b1f2e'; c.fillRect(-15, -14, 30, 6); c.fillRect(-15, 8, 30, 6);
        c.fillStyle = color; c.fillRect(-12, -9, 24, 18);
        c.fillStyle = '#ffffff40'; c.fillRect(-12, -9, 24, 4);
        c.fillStyle = '#1b1f2e'; c.fillRect(4, -3, 18, 6);
        c.fillStyle = color; c.beginPath(); c.arc(0, 0, 7, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#0006'; c.lineWidth = 2; c.stroke();
        c.restore();
      }

      // ================================================== ciclo de vida
      self.onRoom = function () {
        var nowHost = api.isHost();
        if (nowHost && !wasHost) {
          api.toast('Ahora sos el anfitrión');
          if (info && info.players && info.phase !== 'wait') {
            var sc = info.scores;
            G = { target: info.target, round: info.round, scores: sc, players: info.players, inputs: {} };
            newRound();
            runLoop();
          }
        }
        wasHost = nowHost;
        if (!info || info.phase === 'wait') renderWait();
        else updateHud();
      };
      self.onReconnect = function () { if (!api.isHost()) api.toHost({ type: 'sync' }); };
      function onResize() { resize(); }
      window.addEventListener('resize', onResize);
      self.destroy = function () {
        if (self._ro) self._ro.disconnect();
        stopLoop(); stopDraw();
        window.removeEventListener('resize', onResize);
        document.removeEventListener('keydown', kd);
        document.removeEventListener('keyup', ku);
      };

      renderWait();
      if (!api.isHost()) api.toHost({ type: 'sync' });
      return self;
    }
  });
})();
