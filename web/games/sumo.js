/* Sumo de autitos: autitos chocadores en una plataforma que se achica. El último arriba gana la ronda. 2 a 8.
   El anfitrión simula la física y manda fotos 30 veces por segundo; los demás las suavizan. */
(function () {
  'use strict';

  var W = 800, H = 800, CX = 400, CY = 400, R0 = 360, RMIN = 140, SHRINK_FROM = 8, SHRINK_TO = 55;
  var CR = 25, ACC = 245, DRAG = 1.7, ROT = 3.3, BOOST = 430, BOOST_CD = 1.6, BUMP = 90, TICK = 33;

  function lerpA(a, b, f) {
    var d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return a + d * f;
  }

  App.register({
    id: 'sumo', name: 'Sumo de autitos', emoji: '🚗', players: '2-8',
    desc: 'Chocá a los demás fuera de la plataforma que se achica.',
    create: function (api) {
      var self = { alive: true };
      var el = api.el;
      var G = null, info = null, snaps = [], timer = null, raf = null;
      var wasHost = api.isHost(), lastVals = { target: 5 };
      var canvas, ctx, scale = 1, dpr = 1;
      var held = { l: {}, r: {} }, myIn = { l: 0, r: 0 };
      var fx = [], prevAlive = {};

      // ================================================== anfitrión
      function startMatch(vals) {
        var ps = api.members().filter(function (m) { return m.online; }).slice(0, 8);
        if (ps.length < 2) { api.toast('Se necesitan 2 jugadores'); return; }
        lastVals = vals;
        G = { target: vals.target, round: 0, scores: {}, inputs: {},
          players: ps.map(function (p, i) { return { id: p.id, name: p.name, color: api.colors[i % 8] }; }) };
        G.players.forEach(function (p) { G.scores[p.id] = 0; });
        newRound();
        runLoop();
      }
      function newRound() {
        G.round++;
        G.phase = 'count'; G.timer = 3; G.t = 0; G.radius = R0;
        var n = G.players.length, off = Math.random() * Math.PI * 2;
        G.cars = G.players.map(function (p, i) {
          var a = off + i * Math.PI * 2 / n;
          return { id: p.id, x: CX + Math.cos(a) * 230, y: CY + Math.sin(a) * 230, vx: 0, vy: 0, a: a + Math.PI, alive: true, cd: 0, fall: 0 };
        });
        G.winner = null;
        sendInfo();
      }
      function infoMsg() { return { type: 'r', players: G.players, scores: G.scores, target: G.target, phase: G.phase, round: G.round, winner: G.winner, champ: G.champ || null }; }
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
        if (!G || !G.cars) return;
        if (G.phase === 'count') {
          G.timer -= dt;
          if (G.timer <= 0) { G.phase = 'fight'; sendInfo(); }
        } else if (G.phase === 'fight' || G.phase === 'end') {
          G.t += dt;
          var k = Math.max(0, Math.min(1, (G.t - SHRINK_FROM) / (SHRINK_TO - SHRINK_FROM)));
          G.radius = R0 + (RMIN - R0) * k;
          var sub = 2, sdt = dt / sub;
          for (var s = 0; s < sub; s++) {
            G.cars.forEach(function (c) {
              if (!c.alive) { c.fall += sdt; return; }
              var inp = G.inputs[c.id] || {};
              c.cd = Math.max(0, c.cd - sdt);
              if (inp.l && !inp.r) c.a -= ROT * sdt;
              if (inp.r && !inp.l) c.a += ROT * sdt;
              var ca = Math.cos(c.a), sa = Math.sin(c.a);
              if (G.phase === 'fight') { c.vx += ca * ACC * sdt; c.vy += sa * ACC * sdt; }
              if (inp.boost && c.cd <= 0 && G.phase === 'fight') { c.vx += ca * BOOST; c.vy += sa * BOOST; c.cd = BOOST_CD; c.boostT = 0.3; }
              inp.boost = false;
              if (c.boostT) c.boostT = Math.max(0, c.boostT - sdt);
              c.vx -= c.vx * DRAG * sdt; c.vy -= c.vy * DRAG * sdt;
              c.x += c.vx * sdt; c.y += c.vy * sdt;
            });
            // choques
            for (var i = 0; i < G.cars.length; i++) for (var j = i + 1; j < G.cars.length; j++) {
              var a = G.cars[i], b = G.cars[j];
              if (!a.alive || !b.alive) continue;
              var dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
              if (d2 >= 4 * CR * CR || d2 < 1e-6) continue;
              var d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = (2 * CR - d) / 2;
              a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
              var rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
              if (rel > 0) {
                var imp = rel + BUMP;
                a.vx -= nx * imp; a.vy -= ny * imp; b.vx += nx * imp; b.vy += ny * imp;
                G.hits = (G.hits || 0) + 1;
              }
            }
            // ¿se cayó alguno?
            G.cars.forEach(function (c) {
              if (!c.alive) return;
              var ex = c.x - CX, ey = c.y - CY;
              if (ex * ex + ey * ey > (G.radius + CR * 0.4) * (G.radius + CR * 0.4)) { c.alive = false; c.fall = 0; }
            });
          }
          var alive = G.cars.filter(function (c) { return c.alive; });
          if (G.phase === 'fight' && alive.length <= 1) { G.phase = 'end'; G.timer = 2.4; G.winner = alive[0] ? alive[0].id : null; if (G.winner) G.scores[G.winner]++; sendInfo(); }
          if (G.phase === 'end') {
            G.timer -= dt;
            if (G.timer <= 0) {
              var champ = null;
              G.players.forEach(function (p) { if (G.scores[p.id] >= G.target) champ = p.id; });
              if (champ) { G.phase = 'over'; G.champ = champ; sendInfo(); stopLoop(); return; }
              newRound();
              return;
            }
          }
        }
        api.toAll({
          type: 's', p: G.phase, c: Math.ceil(G.timer), rad: Math.round(G.radius), h: G.hits || 0,
          k: G.cars.map(function (c) { return [Math.round(c.x * 10) / 10, Math.round(c.y * 10) / 10, Math.round(c.a * 100) / 100, c.alive ? 1 : 0, c.boostT ? 1 : 0, Math.round(c.fall * 100) / 100, Math.round(c.cd * 10) / 10]; })
        });
      }
      function hostMsg(from, d) {
        if (d.type === 'sync') { api.to(from, G ? infoMsg() : { type: 'r', phase: 'wait' }); return; }
        if (d.type === 'start' && from === api.me) { stopLoop(); G = null; startMatch(d.vals); return; }
        if (!G) return;
        if (d.type === 'lobby' && from === api.me) { stopLoop(); G = null; api.toAll({ type: 'r', phase: 'wait' }); return; }
        if (d.type === 'in') {
          var inp = G.inputs[from] || (G.inputs[from] = {});
          inp.l = !!d.l; inp.r = !!d.r;
          if (d.b) inp.boost = true;
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
        var newRound = info && d.round !== info.round;
        info = d;
        if (d.phase === 'wait') { stopDraw(); canvas = null; renderWait(); return; }
        if (newRound) { snaps = []; fx = []; prevAlive = {}; }
        if (wasWait || !canvas) renderPlay();
        updateHud();
        if (d.phase === 'fight') api.vibrate(40);
      }
      var lastHits = 0;
      function onSnap(d) {
        snaps.push({ t: performance.now(), d: d });
        if (snaps.length > 3) snaps.shift();
        if (!info || !info.players) return;
        d.k.forEach(function (k, i) {
          var p = info.players[i];
          if (!p) return;
          if (prevAlive[p.id] === 1 && k[3] === 0 && p.id === api.me) api.vibrate(250);
          prevAlive[p.id] = k[3];
        });
        if (d.h > lastHits) { lastHits = d.h; }
        if (info.phase !== d.p) { info.phase = d.p; updateHud(); }
      }

      // ================================================== vista
      function renderWait() {
        stopDraw(); canvas = null;
        api.waiting({
          emoji: '🚗', title: 'Sumo de autitos',
          sub: 'Tu autito avanza solo: doblá con <b>◀ ▶</b> y usá el <b>🚀 turbo</b> para embestir. La plataforma se va achicando: ' +
            'el último que queda arriba gana la ronda.',
          min: 2, max: 8, values: lastVals,
          options: [{ key: 'target', label: 'Rondas para ganar', value: 5, choices: [[3, '3'], [5, '5'], [7, '7']] }],
          onStart: function (vals) { api.toHost({ type: 'start', vals: vals }); }
        });
      }
      function renderPlay() {
        el.onclick = null;
        el.innerHTML = '<div id="sm-sb"></div>' +
          '<div style="flex:1;min-height:0;position:relative" id="sm-wrap"><canvas class="arena" id="sm-c"></canvas><div id="sm-ov"></div></div>' +
          '<div class="pad" id="sm-pad"><button data-k="l" style="background:#3b4d8f"><span class="ic">◀</span>Izq.</button>' +
          '<button data-k="b" style="background:#a8394a"><span class="ic">🚀</span>Turbo</button>' +
          '<button data-k="r" style="background:#3b4d8f"><span class="ic">▶</span>Der.</button></div>';
        canvas = el.querySelector('#sm-c');
        if (window.ResizeObserver) {
          if (self._ro) self._ro.disconnect();
          self._ro = new ResizeObserver(function () { resize(); });
          self._ro.observe(el.querySelector('#sm-wrap'));
        }
        ctx = canvas.getContext('2d');
        setupPad();
        resize();
        startDraw();
      }
      function resize() {
        if (!canvas) return;
        var wrap = el.querySelector('#sm-wrap');
        scale = Math.min((wrap.clientWidth - 8) / W, (wrap.clientHeight - 6) / H);
        dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.style.width = Math.floor(W * scale) + 'px';
        canvas.style.height = Math.floor(H * scale) + 'px';
        canvas.width = Math.floor(W * scale * dpr);
        canvas.height = Math.floor(H * scale * dpr);
      }
      function setupPad() {
        held = { l: {}, r: {} };
        function upd() {
          var l = Object.keys(held.l).length ? 1 : 0, r = Object.keys(held.r).length ? 1 : 0;
          if (l !== myIn.l || r !== myIn.r) { myIn.l = l; myIn.r = r; api.toHost({ type: 'in', l: l, r: r }); }
        }
        Array.prototype.forEach.call(el.querySelectorAll('#sm-pad button'), function (b) {
          var k = b.getAttribute('data-k');
          b.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            try { b.setPointerCapture(e.pointerId); } catch (x) { }
            b.classList.add('held');
            if (k === 'b') { api.toHost({ type: 'in', l: myIn.l, r: myIn.r, b: 1 }); return; }
            held[k][e.pointerId] = 1; upd();
          });
          function up(e) { b.classList.remove('held'); if (k !== 'b') { delete held[k][e.pointerId]; upd(); } }
          b.addEventListener('pointerup', up);
          b.addEventListener('pointercancel', up);
          b.addEventListener('lostpointercapture', up);
          b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        });
        self._keys = function (e, down) {
          var k = e.key;
          if (k === 'ArrowLeft' || k === 'a') { if (down) held.l.kb = 1; else delete held.l.kb; upd(); }
          else if (k === 'ArrowRight' || k === 'd') { if (down) held.r.kb = 1; else delete held.r.kb; upd(); }
          else if ((k === ' ' || k === 'ArrowUp' || k === 'w') && down && !e.repeat) api.toHost({ type: 'in', l: myIn.l, r: myIn.r, b: 1 });
          else return;
          e.preventDefault();
        };
      }
      function kd(e) { if (self._keys && canvas) self._keys(e, true); }
      function ku(e) { if (self._keys && canvas) self._keys(e, false); }
      document.addEventListener('keydown', kd);
      document.addEventListener('keyup', ku);

      function updateHud() {
        var sb = el.querySelector('#sm-sb');
        if (!sb || !info || !info.players) return;
        sb.innerHTML = App.scoreStrip(info.players.map(function (p) {
          return { id: p.id, name: p.name, color: p.color, score: info.scores[p.id] || 0 };
        }), '🏁 ' + info.target);
        var ov = el.querySelector('#sm-ov');
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
        } else ov.innerHTML = '';
        var pad = el.querySelector('#sm-pad');
        if (pad) pad.style.display = info.players.some(function (p) { return p.id === api.me; }) ? '' : 'none';
      }

      function startDraw() { stopDraw(); (function loop() { raf = requestAnimationFrame(loop); draw(); })(); }
      function stopDraw() { if (raf) cancelAnimationFrame(raf); raf = null; }

      function draw() {
        if (!canvas || !info || !info.players) return;
        var c = ctx, now = performance.now();
        c.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
        c.fillStyle = '#070a16'; c.fillRect(0, 0, W, H);
        // estrellitas del vacío
        c.fillStyle = '#ffffff22';
        for (var s = 0; s < 60; s++) { var sx = (s * 137) % W, sy = (s * 251) % H; c.fillRect(sx, sy, 2, 2); }
        var a = snaps[snaps.length - 2], b = snaps[snaps.length - 1];
        var rad = b ? b.d.rad : R0;
        // plataforma
        var g = c.createRadialGradient(CX, CY, rad * 0.2, CX, CY, rad);
        g.addColorStop(0, '#2b3866'); g.addColorStop(1, '#1b2448');
        c.fillStyle = g; c.beginPath(); c.arc(CX, CY, rad, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#ff5d6c'; c.lineWidth = 6; c.setLineDash([18, 12]);
        c.lineDashOffset = -now / 40;
        c.beginPath(); c.arc(CX, CY, rad - 3, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
        c.strokeStyle = '#ffffff10'; c.lineWidth = 2;
        c.beginPath(); c.arc(CX, CY, rad * 0.5, 0, Math.PI * 2); c.stroke();
        if (!b) return;
        var f = a ? Math.min(1, (now - b.t) / TICK) : 1;
        var me = null;
        b.d.k.forEach(function (k, i) {
          var p = info.players[i];
          if (!p) return;
          var q = a && a.d.k[i];
          var x = q ? q[0] + (k[0] - q[0]) * f : k[0], y = q ? q[1] + (k[1] - q[1]) * f : k[1], ang = q ? lerpA(q[2], k[2], f) : k[2];
          var sc = k[3] ? 1 : Math.max(0, 1 - k[5] * 1.6);
          if (sc <= 0) return;
          if (p.id === api.me) { me = [x, y, ang, sc, k, p]; return; }
          car(c, x, y, ang, p.color, false, sc, k[4]);
        });
        if (me) car(c, me[0], me[1], me[2], me[5].color, true, me[3], me[4][4], me[4][6]);
        if (b.d.p === 'count') banner(c, String(Math.max(1, b.d.c)), '#fff', 96);
        else if (b.d.p === 'end') {
          var w = info.players.filter(function (p) { return p.id === info.winner; })[0];
          banner(c, w ? '¡Ronda para ' + w.name + '!' : '¡Empate!', w ? w.color : '#fff', 44);
        }
      }
      function banner(c, txt, color, size) {
        c.fillStyle = '#0b1020aa'; c.fillRect(0, H / 2 - size, W, size * 2);
        c.fillStyle = color; c.font = '900 ' + size + 'px ui-rounded, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(txt, W / 2, H / 2 + 2);
        c.textBaseline = 'alphabetic';
      }
      function car(c, x, y, ang, color, me, sc, boosting, cd) {
        c.save();
        c.translate(x, y);
        c.scale(sc, sc);
        if (me) {
          c.strokeStyle = '#ffffffaa'; c.lineWidth = 2; c.setLineDash([4, 5]);
          c.beginPath(); c.arc(0, 0, CR + 9, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
          if (cd != null) {
            c.strokeStyle = cd > 0 ? '#ffffff33' : '#ffd23f'; c.lineWidth = 3;
            c.beginPath(); c.arc(0, 0, CR + 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - Math.min(1, cd / BOOST_CD))); c.stroke();
          }
        }
        c.rotate(ang);
        if (boosting) {
          c.fillStyle = '#ffd23f'; c.beginPath(); c.moveTo(-CR, -7); c.lineTo(-CR - 22 - Math.random() * 8, 0); c.lineTo(-CR, 7); c.fill();
        }
        c.fillStyle = '#00000066'; c.beginPath(); c.arc(3, 4, CR, 0, Math.PI * 2); c.fill();
        c.fillStyle = color; c.beginPath(); c.arc(0, 0, CR, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#0008'; c.lineWidth = 3; c.stroke();
        c.fillStyle = '#ffffffcc'; c.fillRect(-CR + 6, -3, CR * 2 - 12, 6);
        c.fillStyle = '#1b1f2e'; c.beginPath(); c.arc(CR * 0.45, 0, 7, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#9fe7ff'; c.beginPath(); c.arc(CR * 0.5, 0, 4, 0, Math.PI * 2); c.fill();
        c.restore();
      }

      // ================================================== ciclo de vida
      self.onRoom = function () {
        var nowHost = api.isHost();
        if (nowHost && !wasHost) {
          api.toast('Ahora sos el anfitrión');
          if (info && info.players && info.phase !== 'wait' && info.phase !== 'over') {
            G = { target: info.target, round: info.round, scores: info.scores, players: info.players, inputs: {} };
            newRound(); runLoop();
          }
        }
        wasHost = nowHost;
        if (!info || info.phase === 'wait') renderWait(); else updateHud();
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
