/* Curvas: víboras que dejan rastro. Izquierda / derecha, no choques. Tiempo real, 2 a 8.
   Para que no haya lag, cada celular mueve SU víbora (respuesta inmediata al doblar) y manda su
   posición a los demás, que la dibujan suavizada. El anfitrión solo maneja rondas, muertes y puntos. */
(function () {
  'use strict';

  var SPEED = 92, TURN = 3.3, LW = 5, CS = 3, SEND_MS = 33, SELF_GRACE = 220;
  // Tamaños de mapa: el mapa más grande se ve del mismo tamaño en pantalla, así que las líneas
  // se ven más finas y las víboras más lentas (la velocidad es la misma en unidades del mapa).
  var SIZES = { s: 0.8, m: 1, l: 1.35, xl: 1.7 };
  function dimsOf(sz) { var f = SIZES[sz] || 1; return { f: f, w: Math.round(600 * f), h: Math.round(800 * f) }; }
  var W = 600, H = 800, F = 1, TS = 1.5, GW = Math.ceil(W / CS), GH = Math.ceil(H / CS);

  function r1(v) { return Math.round(v * 10) / 10; }
  var PATH = 150;   // tramo inicial (~1,6 s) que no tiene que cruzarse con el de otro
  function ptSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    var t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
    var qx = ax + dx * t - px, qy = ay + dy * t - py;
    return Math.sqrt(qx * qx + qy * qy);
  }
  function segDist(ax, ay, bx, by, cx, cy, dx, dy) {
    var d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax), d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    var d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx), d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    if (d1 * d2 < 0 && d3 * d4 < 0) return 0;   // se cruzan
    return Math.min(ptSeg(ax, ay, cx, cy, dx, dy), ptSeg(bx, by, cx, cy, dx, dy), ptSeg(cx, cy, ax, ay, bx, by), ptSeg(dx, dy, ax, ay, bx, by));
  }

  App.register({
    id: 'curvas', name: 'Curvas', emoji: '🐍', players: '2-8',
    desc: 'Dos botones. Esquivá los rastros y encerrá a los demás.',
    create: function (api) {
      var self = { alive: true };
      var el = api.el;
      var G = null;            // anfitrión
      var info = null;         // última info de ronda
      var wasHost = api.isHost();
      var lastVals = { len: 'n', size: 'm' };
      // Puntos para ganar según cuántos juegan: en cada ronda el último vivo suma (jugadores − 1),
      // así que con 8 a "5 puntos" la partida duraba una sola ronda.
      var LEN = { c: 2, n: 4, l: 7 };
      function targetFor(vals, n) {
        if (LEN[vals.len]) return Math.max(3, Math.round(LEN[vals.len] * (n - 1)));
        return vals.target || 10;
      }
      var hostTimers = [], hostIv = null, raf = null;
      var canvas, ctx, trail, tctx, scale = 1, dpr = 1;
      var R = null;            // ronda local
      var held = { l: {}, r: {} };

      // ================================================== anfitrión
      function hostClear() { hostTimers.forEach(clearTimeout); hostTimers = []; }
      function later(fn, ms) { hostTimers.push(setTimeout(fn, ms)); }
      function inRoom(id) { var r = api.room(); return !!(r && r.members.indexOf(id) >= 0); }
      function infoMsg() {
        return { type: 'r', players: G.players, scores: G.scores, target: G.target, phase: G.phase, round: G.round,
          rid: G.rid, size: G.size, spawns: G.spawns, alive: G.alive, champ: G.champ || null };
      }
      function sendInfo() { api.toAll(infoMsg()); }

      function startMatch(vals) {
        var ps = api.members().filter(function (m) { return m.online; }).slice(0, 8);
        if (ps.length < 2) { api.toast('Se necesitan 2 jugadores'); return; }
        lastVals = vals;
        G = { target: targetFor(vals, ps.length), size: SIZES[vals.size] ? vals.size : 'm', round: 0, scores: {}, seen: {},
          players: ps.map(function (p, i) { return { id: p.id, name: p.name, color: api.colors[i % 8] }; }) };
        G.players.forEach(function (p) { G.scores[p.id] = 0; });
        newRound();
      }

      function newRound() {
        hostClear();
        G.round++;
        // identificador único de la ronda: con "Revancha" el número de ronda vuelve a 1 y antes eso
        // hacía que los celulares creyeran que seguía la ronda anterior (rastros viejos y muertes al toque)
        G.rid = 1 + Math.floor(Math.random() * 2e9);
        G.phase = 'count';
        G.champ = null;
        G.alive = {}; G.seen = {};
        var spawns = [], dm = dimsOf(G.size), mg = 90 * dm.f, sep = 120 * dm.f;
        G.players.forEach(function () {
          var best = null;
          for (var tries = 0; tries < 40; tries++) {
            var x = mg + Math.random() * (dm.w - 2 * mg), y = mg + Math.random() * (dm.h - 2 * mg);
            var ok = spawns.every(function (s) { return (s[0] - x) * (s[0] - x) + (s[1] - y) * (s[1] - y) > sep * sep; });
            best = [r1(x), r1(y)];
            if (ok) break;
          }
          // Dirección: con lugar adelante (lejos de la pared) y sin cruzarse con el camino de los
          // demás en los primeros ~1,6 s. Antes todos apuntaban al centro y con 8 se chocaban ahí.
          var x0 = best[0], y0 = best[1], a = 0, bestScore = -1;
          for (var k = 0; k < 40 && bestScore < 1; k++) {
            var ang = Math.random() * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
            var wall = Math.min(ca > 0 ? (dm.w - x0) / ca : ca < 0 ? -x0 / ca : 1e9, sa > 0 ? (dm.h - y0) / sa : sa < 0 ? -y0 / sa : 1e9);
            var near = 1e9;
            spawns.forEach(function (s) {
              near = Math.min(near, segDist(x0, y0, x0 + ca * PATH, y0 + sa * PATH,
                s[0], s[1], s[0] + Math.cos(s[2]) * PATH, s[1] + Math.sin(s[2]) * PATH));
            });
            var score = Math.min(1, wall / 220, near / 45);
            if (score > bestScore) { bestScore = score; a = ang; }
          }
          spawns.push([x0, y0, Math.round(a * 100) / 100]);
        });
        G.spawns = spawns;
        G.players.forEach(function (p) { G.alive[p.id] = 1; });
        sendInfo();
        later(function () {
          G.phase = 'play';
          var t = Date.now();
          G.players.forEach(function (p) { G.seen[p.id] = t; });
          sendInfo();
        }, 3000);
        if (!hostIv) hostIv = setInterval(hostCheck, 500);
      }

      function hostCheck() {
        if (!G || G.phase !== 'play') return;
        var t = Date.now();
        G.players.forEach(function (p) {
          if (G.alive[p.id] && (!inRoom(p.id) || !api.online(p.id) || t - (G.seen[p.id] || 0) > 4000)) kill(p.id);
        });
      }

      function kill(id) {
        if (!G || G.phase !== 'play' || !G.alive[id]) return;
        G.alive[id] = 0;
        var left = 0;
        G.players.forEach(function (p) { if (G.alive[p.id]) { G.scores[p.id] = (G.scores[p.id] || 0) + 1; left++; } });
        if (left <= 1) { G.phase = 'end'; later(endRound, 2400); }
        sendInfo();
      }

      function endRound() {
        var champ = null, best = -1;
        G.players.forEach(function (p) { if (G.scores[p.id] >= G.target && G.scores[p.id] > best) { best = G.scores[p.id]; champ = p.id; } });
        if (champ) { G.phase = 'over'; G.champ = champ; sendInfo(); return; }
        newRound();
      }

      function hostMsg(from, d) {
        if (d.type === 'sync') { api.to(from, G ? infoMsg() : { type: 'r', phase: 'wait' }); return; }
        if (d.type === 'start' && from === api.me) { hostClear(); G = null; startMatch(d.vals); return; }
        if (!G) return;
        if (d.type === 'lobby' && from === api.me) { hostClear(); G = null; api.toAll({ type: 'r', phase: 'wait' }); return; }
        if (d.type === 'p' && d.r === G.rid) G.seen[from] = Date.now();
        if (d.type === 'd' && d.r === G.rid) kill(from);
      }

      // ================================================== mensajes
      self.onMsg = function (from, d) {
        if (d.type === 'r') {
          if (from !== api.hostId()) return;   // solo vale lo que manda el anfitrión actual
          onInfo(d);
          return;
        }
        if (d.type === 'p') { if (from !== api.me) onPos(from, d); if (api.isHost()) hostMsg(from, d); return; }
        if (d.type === 'd') { if (from !== api.me) onDead(from, d); if (api.isHost()) hostMsg(from, d); return; }
        if (api.isHost()) hostMsg(from, d);
      };

      function onInfo(d) {
        var prevPhase = info && info.phase;
        info = d;
        if (d.phase === 'wait') { R = null; stopDraw(); canvas = null; renderWait(); return; }
        applySize(d.size);
        if (!canvas) renderPlay();
        if (!R || R.rid !== d.rid) setupRound(d);
        if (d.phase === 'play' && !R.started) {
          R.started = performance.now();
          R.lastT = R.started; R.lastSend = 0;
          api.vibrate(40);
        }
        // el anfitrión me dio por muerto (por ejemplo, se me cortó la conexión)
        if (R.me && R.me.alive && d.alive && d.alive[api.me] === 0) R.me.alive = false;
        if (prevPhase !== d.phase) updateHud(); else updateHud();
      }

      function setupRound(d) {
        R = { round: d.round, rid: d.rid, grid: new Int8Array(GW * GH), stamp: new Float32Array(GW * GH), others: {}, me: null,
          myIdx: -1, started: 0, lastT: 0, lastSend: 0 };
        clearTrail();
        d.players.forEach(function (p, i) {
          var sp = d.spawns[i];
          if (p.id === api.me) {
            R.myIdx = i;
            R.me = { x: sp[0], y: sp[1], a: sp[2], alive: true, gap: 0, gapIn: 1.2 + Math.random() * 2, color: p.color };
          } else {
            var start = { t: 0, x: sp[0], y: sp[1], g: 0 };
            R.others[p.id] = { i: i, color: p.color, a: sp[2], buf: [], drawn: start, last: start, off: null, jit: 0, alive: true };
          }
        });
      }

      // ---------- posiciones de los demás
      function onPos(from, d) {
        if (!R || d.r !== R.rid) return;
        var o = R.others[from];
        if (!o) return;
        var now = performance.now(), sample = now - d.t;
        if (o.off === null || sample < o.off) o.off = sample;
        else o.off += (sample - o.off) * 0.02;
        o.jit = o.jit * 0.9 + Math.abs(sample - o.off) * 0.1;
        var p = { t: d.t, x: d.x, y: d.y, g: d.g };
        if (p.t <= o.last.t) return;
        if (!p.g && !o.last.g) markSeg(o.last.x, o.last.y, p.x, p.y, o.i, 0);
        o.last = p;
        o.buf.push(p);
      }
      function onDead(from, d) {
        if (!R || d.r !== R.rid) return;
        var o = R.others[from];
        if (o) { o.alive = false; o.diedAt = performance.now(); }
      }

      // ---------- grilla de choques
      function markSeg(x0, y0, x1, y1, idx, t) {
        var dx = x1 - x0, dy = y1 - y0, n = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / 1.5));
        for (var k = 1; k <= n; k++) {
          var x = x0 + dx * k / n, y = y0 + dy * k / n;
          var cx = (x / CS) | 0, cy = (y / CS) | 0;
          for (var ix = -1; ix <= 1; ix++) for (var iy = -1; iy <= 1; iy++) {
            var gx = cx + ix, gy = cy + iy;
            if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) continue;
            var c = gy * GW + gx;
            if (!R.grid[c]) { R.grid[c] = idx + 1; R.stamp[c] = t; }
          }
        }
      }
      function blocked(x, y, t) {
        if (x < 1 || y < 1 || x > W - 1 || y > H - 1) return true;
        var c = ((y / CS) | 0) * GW + ((x / CS) | 0);
        var ow = R.grid[c];
        if (!ow) return false;
        if (ow !== R.myIdx + 1) return true;
        return t - R.stamp[c] > SELF_GRACE;
      }

      // ---------- mi víbora
      function myInput() {
        return { l: Object.keys(held.l).length > 0, r: Object.keys(held.r).length > 0 };
      }
      function simMe(now) {
        if (!R || !R.me || !R.me.alive || !R.started || !info || info.phase !== 'play') return;
        var me = R.me;
        var dt = Math.min(0.06, (now - R.lastT) / 1000);
        R.lastT = now;
        if (dt <= 0) return;
        var n = Math.ceil(dt / (1 / 120)), sdt = dt / n, inp = myInput();
        tctx.lineCap = 'round'; tctx.lineWidth = LW; tctx.strokeStyle = me.color;
        for (var k = 0; k < n; k++) {
          if (inp.l && !inp.r) me.a -= TURN * sdt;
          if (inp.r && !inp.l) me.a += TURN * sdt;
          var ox = me.x, oy = me.y, ca = Math.cos(me.a), sa = Math.sin(me.a);
          me.x += ca * SPEED * sdt; me.y += sa * SPEED * sdt;
          if (me.gap > 0) { me.gap -= sdt; if (me.gap <= 0) me.gapIn = 1.4 + Math.random() * 2.2; }
          else { me.gapIn -= sdt; if (me.gapIn <= 0) me.gap = 0.26; }
          var t = now - R.started;
          if (blocked(me.x + ca * (LW / 2 + 1), me.y + sa * (LW / 2 + 1), t)) { die(now); return; }
          if (me.gap <= 0) {
            markSeg(ox, oy, me.x, me.y, R.myIdx, t);
            tctx.beginPath(); tctx.moveTo(ox, oy); tctx.lineTo(me.x, me.y); tctx.stroke();
          }
        }
        if (now - R.lastSend >= SEND_MS) send(now);
      }
      function send(now) {
        R.lastSend = now;
        var me = R.me;
        api.toAll({ type: 'p', r: R.rid, t: Math.round(now - R.started), x: r1(me.x), y: r1(me.y), g: me.gap > 0 ? 1 : 0 });
      }
      function die(now) {
        R.me.alive = false;
        send(now);
        api.toAll({ type: 'd', r: R.rid });
        api.vibrate(180);
      }

      // ================================================== vista
      function renderWait() {
        stopDraw(); canvas = null; trail = null;
        var nOn = Math.max(2, Math.min(8, api.members().filter(function (m) { return m.online; }).length));
        api.waiting({
          emoji: '🐍', title: 'Curvas',
          sub: 'Mantené <b>◀</b> o <b>▶</b> para doblar. Tu víbora deja un rastro: no choques con nada. Cada vez que alguien choca, los que siguen vivos suman punto.',
          min: 2, max: 8, values: lastVals,
          extraHtml: '<p class="hint" style="margin:-4px 0 12px">Los puntos para ganar se ajustan a cuántos juegan. Mapa más grande = líneas más finas y víboras más lentas; con muchos jugadores, probá el grande.</p>',
          options: [{ key: 'len', label: 'Partida', value: 'n', type: 'select', choices: ['c', 'n', 'l'].map(function (k) {
              return [k, ({ c: 'Corta', n: 'Normal', l: 'Larga' })[k] + ' (a ' + targetFor({ len: k }, nOn) + ' puntos)'];
            }) },
            { key: 'size', label: 'Tamaño del mapa', value: 'm', type: 'select',
              choices: [['s', 'Chico'], ['m', 'Normal'], ['l', 'Grande'], ['xl', 'Enorme']] }],
          onStart: function (vals) { api.toHost({ type: 'start', vals: vals }); }
        });
      }

      function renderPlay() {
        el.onclick = null;
        el.innerHTML = '<div id="cv-sb"></div>' +
          '<div style="flex:1;min-height:0;position:relative" id="cv-wrap"><canvas class="arena" id="cv-c"></canvas><div id="cv-ov"></div></div>' +
          '<div class="pad" id="cv-pad"><button data-k="l" style="background:#3b4d8f"><span class="ic">◀</span>Izquierda</button>' +
          '<button data-k="r" style="background:#3b4d8f"><span class="ic">▶</span>Derecha</button></div>';
        canvas = el.querySelector('#cv-c');
        if (window.ResizeObserver) {
          if (self._ro) self._ro.disconnect();
          self._ro = new ResizeObserver(function () { resize(); });
          self._ro.observe(el.querySelector('#cv-wrap'));
        }
        ctx = canvas.getContext('2d');
        trail = document.createElement('canvas');
        trail.width = Math.ceil(W * TS); trail.height = Math.ceil(H * TS);
        tctx = trail.getContext('2d');
        clearTrail();
        setupPad();
        resize();
        startDraw();
      }

      function applySize(sz) {
        var dm = dimsOf(sz);
        if (dm.f === F && dm.w === W) return;
        F = dm.f; W = dm.w; H = dm.h;
        GW = Math.ceil(W / CS); GH = Math.ceil(H / CS);
        TS = 1.5 / F;   // el rastro tiene la misma cantidad de píxeles en cualquier tamaño
        if (trail) { trail.width = Math.ceil(W * TS); trail.height = Math.ceil(H * TS); clearTrail(); }
        resize();
      }

      function clearTrail() {
        if (!tctx) return;
        tctx.setTransform(TS, 0, 0, TS, 0, 0);
        tctx.clearRect(0, 0, W, H);
      }

      function resize() {
        if (!canvas) return;
        var wrap = el.querySelector('#cv-wrap');
        scale = Math.min((wrap.clientWidth - 12) / W, (wrap.clientHeight - 6) / H);
        dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.style.width = Math.floor(W * scale) + 'px';
        canvas.style.height = Math.floor(H * scale) + 'px';
        canvas.width = Math.floor(W * scale * dpr);
        canvas.height = Math.floor(H * scale * dpr);
      }

      function setupPad() {
        held = { l: {}, r: {} };
        Array.prototype.forEach.call(el.querySelectorAll('#cv-pad button'), function (b) {
          var k = b.getAttribute('data-k');
          b.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            try { b.setPointerCapture(e.pointerId); } catch (x) { }
            b.classList.add('held'); held[k][e.pointerId] = 1;
          });
          function up(e) { b.classList.remove('held'); delete held[k][e.pointerId]; }
          b.addEventListener('pointerup', up);
          b.addEventListener('pointercancel', up);
          b.addEventListener('lostpointercapture', up);
          b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        });
      }
      function key(e, down) {
        if (!canvas) return;
        var k = e.key === 'ArrowLeft' || e.key === 'a' ? 'l' : (e.key === 'ArrowRight' || e.key === 'd' ? 'r' : null);
        if (!k) return;
        e.preventDefault();
        if (down) held[k].kb = 1; else delete held[k].kb;
      }
      function kd(e) { key(e, true); }
      function ku(e) { key(e, false); }
      document.addEventListener('keydown', kd);
      document.addEventListener('keyup', ku);

      function updateHud() {
        var sb = el.querySelector('#cv-sb');
        if (!sb || !info || !info.players) return;
        var order = info.players.slice().sort(function (a, b) { return (info.scores[b.id] || 0) - (info.scores[a.id] || 0); });
        sb.innerHTML = App.scoreStrip(order.map(function (p) {
          var dead = info.phase === 'play' && info.alive && info.alive[p.id] === 0;
          return { id: p.id, name: p.name, color: p.color, score: info.scores[p.id] || 0, cls: dead ? 'dead' : '' };
        }), '🏁 ' + info.target);
        var ov = el.querySelector('#cv-ov');
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
        var pad = el.querySelector('#cv-pad');
        if (pad) pad.style.display = info.players.some(function (p) { return p.id === api.me; }) ? '' : 'none';
      }

      function startDraw() { stopDraw(); (function loop() { raf = requestAnimationFrame(loop); frame(); })(); }
      function stopDraw() { if (raf) cancelAnimationFrame(raf); raf = null; }

      /** Avanza el dibujo de una víbora ajena hasta "ahora menos un colchón" y devuelve su cabeza. */
      function advanceOther(o, now) {
        if (o.off === null) return { x: o.drawn.x, y: o.drawn.y, g: 0, partial: false };
        var delay = Math.min(200, 45 + o.jit * 2.5);
        var rt = now - o.off - delay;
        tctx.lineCap = 'round'; tctx.lineWidth = LW; tctx.strokeStyle = o.color;
        while (o.buf.length && o.buf[0].t <= rt) {
          var p = o.buf.shift();
          if (!p.g && !o.drawn.g) { tctx.beginPath(); tctx.moveTo(o.drawn.x, o.drawn.y); tctx.lineTo(p.x, p.y); tctx.stroke(); }
          o.drawn = p;
        }
        // si se murió y no llegan más puntos, terminar de dibujar lo que haya
        if (!o.alive && o.buf.length && now - o.diedAt > 400) {
          while (o.buf.length) {
            var q = o.buf.shift();
            if (!q.g && !o.drawn.g) { tctx.beginPath(); tctx.moveTo(o.drawn.x, o.drawn.y); tctx.lineTo(q.x, q.y); tctx.stroke(); }
            o.drawn = q;
          }
        }
        if (!o.buf.length) return { x: o.drawn.x, y: o.drawn.y, g: o.drawn.g, partial: false };
        var nx = o.buf[0], span = nx.t - o.drawn.t, f = span > 0 ? (rt - o.drawn.t) / span : 1;
        f = f < 0 ? 0 : (f > 1 ? 1 : f);
        return { x: o.drawn.x + (nx.x - o.drawn.x) * f, y: o.drawn.y + (nx.y - o.drawn.y) * f, g: nx.g || o.drawn.g, partial: true };
      }

      function frame() {
        if (!canvas || !info || !info.players || !R) return;
        var now = performance.now();
        simMe(now);
        var heads = {};
        Object.keys(R.others).forEach(function (id) { heads[id] = advanceOther(R.others[id], now); });

        var c = ctx;
        c.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
        c.fillStyle = '#0d1328'; c.fillRect(0, 0, W, H);
        c.drawImage(trail, 0, 0, W, H);
        c.strokeStyle = '#ffd23f'; c.lineWidth = 4 * F; c.strokeRect(2 * F, 2 * F, W - 4 * F, H - 4 * F);

        // tramo parcial de los demás (entre el último punto dibujado y la cabeza)
        c.lineCap = 'round'; c.lineWidth = LW;
        Object.keys(R.others).forEach(function (id) {
          var o = R.others[id], hd = heads[id];
          if (hd.partial && !hd.g) {
            c.strokeStyle = o.color;
            c.beginPath(); c.moveTo(o.drawn.x, o.drawn.y); c.lineTo(hd.x, hd.y); c.stroke();
          }
        });
        // cabezas
        info.players.forEach(function (p, i) {
          var x, y, alive, gap, a;
          if (p.id === api.me) {
            if (!R.me) return;
            x = R.me.x; y = R.me.y; alive = R.me.alive; gap = R.me.gap > 0; a = R.me.a;
          } else {
            var o = R.others[p.id];
            if (!o) return;
            x = heads[p.id].x; y = heads[p.id].y; alive = o.alive || o.buf.length > 0; gap = heads[p.id].g; a = o.a;
          }
          if (info.phase === 'count') {
            c.strokeStyle = p.color; c.lineWidth = 3 * F;
            c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 30 * F, y + Math.sin(a) * 30 * F); c.stroke();
            c.fillStyle = p.color; c.beginPath(); c.arc(x, y, 7 * F, 0, Math.PI * 2); c.fill();
            if (p.id === api.me) {
              c.font = '800 ' + Math.round(18 * F) + 'px ui-rounded, system-ui, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff';
              c.fillText('VOS', x, y - 16 * F);
            }
            return;
          }
          c.fillStyle = alive ? (gap ? '#ffffffaa' : '#fff') : '#555';
          c.beginPath(); c.arc(x, y, alive ? 4 : 3, 0, Math.PI * 2); c.fill();
          if (p.id === api.me && alive) {
            c.strokeStyle = '#ffffff66'; c.lineWidth = 2 * F;
            c.beginPath(); c.arc(x, y, 9 * F, 0, Math.PI * 2); c.stroke();
          }
        });

        if (info.phase === 'count') {
          c.fillStyle = '#ffffffdd'; c.font = '900 ' + Math.round(64 * F) + 'px ui-rounded, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText('¡Preparados!', W / 2, H / 2);
          c.textBaseline = 'alphabetic';
        } else if (info.phase === 'end') {
          var w = null;
          info.players.forEach(function (p) { if (info.alive[p.id]) w = p; });
          c.fillStyle = '#0b1020aa'; c.fillRect(0, H / 2 - 50 * F, W, 100 * F);
          c.font = '900 ' + Math.round(42 * F) + 'px ui-rounded, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillStyle = w ? w.color : '#fff';
          c.fillText(w ? '¡Ronda para ' + w.name + '!' : '¡Empate!', W / 2, H / 2);
          c.textBaseline = 'alphabetic';
        } else if (R.me && !R.me.alive && info.phase === 'play') {
          c.font = '800 ' + Math.round(26 * F) + 'px ui-rounded, system-ui, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#ffffffaa';
          c.fillText('Chocaste 💥 mirá cómo sigue', W / 2, 40 * F);
        }
      }

      // ================================================== ciclo de vida
      self.onRoom = function () {
        var nowHost = api.isHost();
        if (nowHost && !wasHost) {
          api.toast('Ahora sos el anfitrión');
          if (info && info.players && info.phase !== 'wait' && info.phase !== 'over') {
            G = { target: info.target, size: info.size || 'm', round: info.round, rid: info.rid, scores: info.scores, players: info.players,
              phase: info.phase, alive: info.alive, spawns: info.spawns, seen: {} };
            var t = Date.now();
            G.players.forEach(function (p) { G.seen[p.id] = t; });
            if (!hostIv) hostIv = setInterval(hostCheck, 500);
            if (G.phase === 'count') later(function () { G.phase = 'play'; sendInfo(); }, 1500);
            if (G.phase === 'end') later(endRound, 1500);
          }
        }
        if (!nowHost && wasHost) {
          // dejé de ser anfitrión: frenar mis relojes para no mandar rondas viejas
          hostClear(); G = null;
          if (hostIv) { clearInterval(hostIv); hostIv = null; }
        }
        wasHost = nowHost;
        if (!info || info.phase === 'wait') renderWait(); else updateHud();
      };
      self.onReconnect = function () { if (!api.isHost()) api.toHost({ type: 'sync' }); };
      function onResize() { resize(); }
      window.addEventListener('resize', onResize);
      self.destroy = function () {
        if (self._ro) self._ro.disconnect();
        hostClear(); stopDraw();
        if (hostIv) clearInterval(hostIv);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('keydown', kd);
        document.removeEventListener('keyup', ku);
      };

      // para las pruebas automáticas
      window.__curvas = {
        state: function () {
          if (!R) return null;
          var n = 0;
          for (var i = 0; i < R.grid.length; i++) if (R.grid[i]) n++;
          return { rid: R.rid, round: R.round, cells: n, alive: !!(R.me && R.me.alive), W: W, H: H, F: F, trail: trail ? [trail.width, trail.height] : null, phase: info && info.phase };
        }
      };
      renderWait();
      if (!api.isHost()) api.toHost({ type: 'sync' });
      return self;
    }
  });
})();
