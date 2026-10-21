/* Carrera (todos a la vez) y Mini golf (por turnos).
   Tocar una vez fija la dirección de la flecha que gira; tocar otra vez dispara con la fuerza del momento.
   El anfitrión valida los tiros y los reparte; cada celular simula el recorrido por su cuenta (sin lag). */
(function () {
  'use strict';
  var RD = window.Rodar;
  var W = RD.W, H = RD.H, STEP_MS = RD.STEP_MS;
  var SPIN = 2.7;        // rad/s de la flecha
  var POW_PERIOD = 1500; // ms de ida y vuelta de la fuerza
  var GOLF_MAX = 8;
  var RACE_PTS = [3, 2, 1];
  var RACE_CLOSE = 20000;

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0; var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function createGame(api, golf) {
    var self = { alive: true };
    var el = api.el;
    var HOLE_V = golf ? 470 : 620;
    var S = null;           // estado autoritativo (anfitrión)
    var hostSims = {};      // tiros en vuelo según el anfitrión
    var pending = {};       // carrera: tiro que llegó antes de que la bola frenara
    var timers = {}, hostIv = null;
    var cur = null;         // estado que muestra este celular
    var anims = {};         // carrera: id -> {n, x, y, sim, t0}
    var gshot = null;       // golf: tiro en curso {sq, id, n, list, sim, idx, t0}
    var aim = null;         // {stage:0|1, t0, ang, t1}
    var closeLocal = null;
    var wasHost = api.isHost();
    var lastVals = { rounds: golf ? 6 : 5 };
    var canvas, ctx, bg = null, bgFor = '', scale = 1, dpr = 1, raf = null;
    var uiKey = '';

    function nowMs() { return Date.now(); }
    function curMap() { return cur && cur.maps && cur.mi >= 0 ? RD.MAPS[cur.maps[cur.mi]] : null; }
    function inRoom(id) { var r = api.room(); return !!(r && r.members.indexOf(id) >= 0); }

    // ================================================================ anfitrión
    function clearTimers() {
      Object.keys(timers).forEach(function (k) { clearTimeout(timers[k]); });
      timers = {};
    }
    function buildState() {
      var s = clone(S);
      s.fly = {};
      Object.keys(hostSims).forEach(function (id) {
        var f = hostSims[id];
        if (golf) s.fly[id] = { id: id, n: f.n, sq: f.sq, vx: f.vx, vy: f.vy, list: f.list, el: nowMs() - f.t };
        else s.fly[id] = { n: f.n, x: f.x, y: f.y, vx: f.vx, vy: f.vy, el: nowMs() - f.t };
      });
      s.closeLeft = S.closeAt ? Math.max(0, S.closeAt - nowMs()) : null;
      delete s.closeAt;
      return s;
    }
    function publish() {
      S.seq++;
      api.save('S', S);
      api.toAll({ type: 'state', s: buildState() });
    }
    function ensureIv() { if (!hostIv) hostIv = setInterval(hostTick, 500); }

    function start(vals) {
      var ps = api.members().filter(function (m) { return m.online; }).slice(0, 8);
      if (!ps.length) return;
      lastVals = vals;
      clearTimers(); hostSims = {}; pending = {};
      var order = shuffle(RD.MAPS.map(function (m, i) { return i; })).slice(0, vals.rounds);
      S = {
        phase: 'play', seq: S ? S.seq : 0, golf: golf, maps: order, mi: -1, rounds: vals.rounds,
        players: ps.map(function (p, i) { return { id: p.id, name: p.name, color: api.colors[i % 8] }; }),
        scores: {}, last: null
      };
      S.players.forEach(function (p) { S.scores[p.id] = 0; });
      ensureIv();
      nextMap();
    }

    function nextMap() {
      clearTimers(); hostSims = {}; pending = {};
      S.mi++;
      if (S.mi >= S.maps.length) { S.phase = 'over'; publish(); return; }
      var map = RD.MAPS[S.maps[S.mi]];
      S.balls = {};
      // carrera: cada uno sale de un lugar distinto alrededor de la salida, sorteado en cada mapa
      var slots = golf ? [] : shuffle(RD.startSlots(map).slice());
      S.players.forEach(function (p, i) {
        var st = slots.length ? slots[i % slots.length] : map.s;
        S.balls[p.id] = { x: st[0], y: st[1], sx: st[0], sy: st[1], shot: 0, strokes: 0, done: false, place: 0, out: false };
      });
      S.finished = 0; S.closeAt = null; S.offSince = null; S.sq = 0;
      if (golf) {
        S.phase = 'play';
        S.turn = S.mi % S.players.length;
        ensureTurn(false);
        publish();
      } else {
        S.phase = 'count';
        publish();
        timers.count = setTimeout(function () { S.phase = 'play'; publish(); }, 3000);
      }
    }

    /** Golf: bolas en la mesa, en orden fijo. Las que todavía no tiraron no están (salvo la que tira). */
    function golfList(st, shooterId) {
      var list = [];
      st.players.forEach(function (p) {
        var b = st.balls[p.id];
        if (!b || b.done || (b.strokes === 0 && p.id !== shooterId)) return;
        list.push([p.id, b.x, b.y, b.sx == null ? b.x : b.sx, b.sy == null ? b.y : b.sy]);
      });
      return list;
    }
    function listIndex(list, id) {
      for (var i = 0; i < list.length; i++) if (list[i][0] === id) return i;
      return -1;
    }

    function canPlay(id) { var b = S.balls[id]; return b && !b.done && inRoom(id); }

    function ensureTurn(advance) {
      var n = S.players.length;
      for (var k = advance ? 1 : 0; k <= n; k++) {
        var t = (S.turn + k) % n;
        if (canPlay(S.players[t].id)) { S.turn = t; S.offSince = null; return true; }
      }
      return false;
    }

    function hostShoot(from, d) {
      if (!S || S.phase !== 'play') return;
      var b = S.balls[from];
      if (!b || b.done || d.n !== b.shot + 1) return;
      if (golf && (S.players[S.turn].id !== from || hostSims[from])) return;
      if (hostSims[from]) { pending[from] = d; return; }
      fire(from, d.vx, d.vy);
    }

    function fire(id, vx, vy) {
      var b = S.balls[id], map = RD.MAPS[S.maps[S.mi]];
      vx = Math.round(+vx * 100) / 100; vy = Math.round(+vy * 100) / 100;
      var sp = Math.sqrt(vx * vx + vy * vy);
      if (!(sp > 0) || sp > RD.VMAX * 1.01) return;
      if (golf) {
        var list = golfList(S, id);
        var gsim = RD.simulateMulti(map, list, listIndex(list, id), vx, vy, HOLE_V);
        b.shot++; b.strokes++;
        hostSims[id] = { n: b.shot, sq: S.sq + 1, vx: vx, vy: vy, t: nowMs(), list: list, multi: gsim };
        api.toAll({ type: 'shot', id: id, n: b.shot, sq: S.sq + 1, vx: vx, vy: vy, list: list });
        timers['s' + id] = setTimeout(function () { landed(id); }, gsim.steps * STEP_MS + 80);
        return;
      }
      var sim = RD.simulate(map, b.x, b.y, vx, vy, HOLE_V, b.sx, b.sy);
      b.shot++; b.strokes++;
      hostSims[id] = { n: b.shot, x: b.x, y: b.y, vx: vx, vy: vy, t: nowMs(), sim: sim };
      api.toAll({ type: 'shot', id: id, n: b.shot, x: b.x, y: b.y, vx: vx, vy: vy });
      timers['s' + id] = setTimeout(function () { landed(id); }, sim.steps * STEP_MS + 80);
    }

    function landed(id) {
      var f = hostSims[id];
      if (!f || !S || S.phase !== 'play') return;
      delete hostSims[id];
      delete timers['s' + id];
      var b = S.balls[id];
      if (golf) {
        applyGolf(S, f.list, f.multi);
        S.sq = f.sq;
        if (!b.done && b.strokes >= GOLF_MAX) { b.done = true; b.out = true; b.strokes = GOLF_MAX + 1; }
        ensureTurn(true);
        if (checkMapEnd()) return;
        publish();
        return;
      }
      b.x = f.sim.x; b.y = f.sim.y;
      if (f.sim.holed) {
        b.done = true;
        if (!golf) {
          b.place = ++S.finished;
          S.scores[id] += RACE_PTS[b.place - 1] || 0;
          if (!S.closeAt) S.closeAt = nowMs() + RACE_CLOSE;
        }
      } else if (golf && b.strokes >= GOLF_MAX) {
        b.done = true; b.out = true; b.strokes = GOLF_MAX + 1;
      }
      if (golf) ensureTurn(true);
      if (checkMapEnd()) return;
      publish();
      if (pending[id]) { var d = pending[id]; delete pending[id]; hostShoot(id, d); }
    }

    /** Golf: aplica el resultado de un tiro (todas las bolas que se movieron, embocadas por empujón incluidas). */
    function applyGolf(st, list, sim) {
      list.forEach(function (e, i) {
        var bb = st.balls[e[0]];
        if (!bb) return;
        bb.x = sim.end[i][0]; bb.y = sim.end[i][1];
        if (sim.holedAt[i] != null) bb.done = true;
      });
    }

    function checkMapEnd() {
      if (S.phase !== 'play') return false;
      var ids = S.players.filter(function (p) { return inRoom(p.id); }).map(function (p) { return p.id; });
      var allDone = ids.every(function (id) { return S.balls[id].done; });
      var timeUp = !golf && S.closeAt && nowMs() >= S.closeAt;
      if (!ids.length || allDone || timeUp) { endMap(); return true; }
      return false;
    }

    function endMap() {
      clearTimers(); hostSims = {}; pending = {};
      var map = RD.MAPS[S.maps[S.mi]];
      var res = [];
      S.players.forEach(function (p) {
        var b = S.balls[p.id];
        if (golf) {
          if (!b.done) { b.out = true; b.strokes = GOLF_MAX + 1; }
          S.scores[p.id] += b.strokes;
          res.push({ id: p.id, strokes: b.strokes, out: b.out });
        } else {
          res.push({ id: p.id, place: b.place, pts: RACE_PTS[b.place - 1] || 0 });
        }
      });
      S.last = { name: map.n, par: map.par, res: res };
      S.closeAt = null;
      S.phase = 'between';
      publish();
      timers.next = setTimeout(nextMap, 4500);
    }

    function hostTick() {
      if (!S || S.phase !== 'play') return;
      if (checkMapEnd()) return;
      if (golf) {
        var tp = S.players[S.turn];
        if (!canPlay(tp.id)) { if (ensureTurn(true)) publish(); else checkMapEnd(); return; }
        if (!api.online(tp.id) && !hostSims[tp.id]) {
          if (!S.offSince) S.offSince = nowMs();
          else if (nowMs() - S.offSince > 6000) { skipTurn(); }
        } else S.offSince = null;
      }
    }

    function skipTurn() {
      var b = S.balls[S.players[S.turn].id];
      if (hostSims[S.players[S.turn].id]) return;
      b.strokes++; b.shot++;
      if (b.strokes >= GOLF_MAX) { b.done = true; b.out = true; b.strokes = GOLF_MAX + 1; }
      ensureTurn(true);
      if (!checkMapEnd()) publish();
    }

    function hostMsg(from, d) {
      if (d.type === 'sync') { if (S) api.to(from, { type: 'state', s: buildState(), sync: true }); return; }
      var host = from === api.me;
      if (d.type === 'start' && host) { start(d.vals); return; }
      if (!S) return;
      if (d.type === 'lobby' && host) {
        clearTimers(); hostSims = {}; pending = {};
        S = { phase: 'wait', seq: S.seq }; publish(); return;
      }
      if (d.type === 'skip' && host && golf && S.phase === 'play') { skipTurn(); return; }
      if (d.type === 'shoot') hostShoot(from, d);
    }

    /** El anfitrión anterior se fue: retomar desde lo que este celular vio. */
    function adopt() {
      if (!cur || !cur.players || cur.phase === 'wait') {
        S = { phase: 'wait', seq: (cur && cur.seq) || 0 };
        return;
      }
      S = clone(cur);
      delete S.fly; delete S.closeLeft;
      S.closeAt = closeLocal ? nowMs() + Math.max(0, closeLocal - performance.now()) : null;
      clearTimers(); hostSims = {}; pending = {};
      ensureIv();
      if (S.phase === 'play' && S.balls && golf) {
        if (gshot && gshot.sq > (S.sq || 0)) {
          var sb = S.balls[gshot.id];
          applyGolf(S, gshot.list, gshot.sim);
          S.sq = gshot.sq;
          if (sb) { sb.shot = Math.max(sb.shot, gshot.n); sb.strokes += 1; if (!sb.done && sb.strokes >= GOLF_MAX) { sb.done = true; sb.out = true; sb.strokes = GOLF_MAX + 1; } }
          ensureTurn(true);
        } else ensureTurn(false);
        if (!checkMapEnd()) publish();
      } else if (S.phase === 'play' && S.balls) {
        Object.keys(anims).forEach(function (id) {
          var a = anims[id], b = S.balls[id];
          if (!b || a.n <= b.shot) return;
          b.strokes += a.n - b.shot; b.shot = a.n;
          b.x = a.sim.x; b.y = a.sim.y;
          if (a.sim.holed && !b.done) {
            b.done = true;
            if (!golf) { b.place = ++S.finished; S.scores[id] += RACE_PTS[b.place - 1] || 0; if (!S.closeAt) S.closeAt = nowMs() + RACE_CLOSE; }
          }
        });
        if (golf) ensureTurn(false);
        if (!checkMapEnd()) publish();
      } else if (S.phase === 'count') {
        timers.count = setTimeout(function () { S.phase = 'play'; publish(); }, 1500);
        publish();
      } else if (S.phase === 'between') {
        timers.next = setTimeout(nextMap, 2500);
      }
    }

    // ================================================================ todos
    self.onMsg = function (from, d) {
      if (d.type === 'state') {
        if (from !== api.hostId() && from !== api.me) return;
        if (cur && d.s.seq <= cur.seq && !d.sync) return;
        setState(d.s);
        return;
      }
      if (d.type === 'shot') {
        if (from !== api.hostId() && from !== api.me) return;
        if (golf) startGolf(d, 0);
        else startAnim(d.id, d.n, d.x, d.y, d.vx, d.vy, 0);
        return;
      }
      if (api.isHost()) hostMsg(from, d);
    };

    function setState(s) {
      var prev = cur;
      cur = s;
      if (s.phase === 'wait' || !s.players) { stopDraw(); canvas = null; renderWait(); return; }
      if (!prev || prev.mi !== s.mi || prev.maps !== s.maps && JSON.stringify(prev.maps) !== JSON.stringify(s.maps)) {
        anims = {}; gshot = null; aim = null; bgFor = '';
      }
      closeLocal = s.closeLeft != null ? performance.now() + s.closeLeft : null;
      if (s.fly) Object.keys(s.fly).forEach(function (id) {
        var f = s.fly[id];
        if (golf) startGolf(f, f.el);
        else startAnim(id, f.n, f.x, f.y, f.vx, f.vy, f.el);
      });
      if (!canvas) renderPlay();
      uiKey = '';
      updateUi();
      if (prev && prev.phase !== s.phase) api.vibrate(30);
      if (golf && s.phase === 'play' && s.players[s.turn] && s.players[s.turn].id === api.me &&
        !(prev && prev.phase === 'play' && prev.turn === s.turn && prev.mi === s.mi)) api.vibrate([40, 40, 40]);
    }

    function startAnim(id, n, x, y, vx, vy, el) {
      var a = anims[id];
      if (a && a.n > n) return;
      if (a && a.n === n && Math.abs(a.x - x) < 0.5 && Math.abs(a.y - y) < 0.5) return;
      var map = curMap();
      if (!map) return;
      var bb = cur.balls && cur.balls[id];
      var sim = RD.simulate(map, x, y, vx, vy, HOLE_V, bb ? bb.sx : null, bb ? bb.sy : null);
      anims[id] = { n: n, x: x, y: y, sim: sim, t0: (a && a.n === n) ? a.t0 : performance.now() - (el || 0) };
    }

    function startGolf(d, el) {
      if (gshot && gshot.sq > d.sq) return;
      if (gshot && gshot.sq === d.sq && JSON.stringify(gshot.list) === JSON.stringify(d.list)) return;
      var map = curMap();
      if (!map || !d.list) return;
      var idx = {};
      d.list.forEach(function (e, i) { idx[e[0]] = i; });
      var sim = RD.simulateMulti(map, d.list, idx[d.id], d.vx, d.vy, HOLE_V);
      var t0 = (gshot && gshot.sq === d.sq) ? gshot.t0 : performance.now() - (el || 0);
      gshot = { sq: d.sq, id: d.id, n: d.n, list: d.list, sim: sim, idx: idx, t0: t0 };
    }
    function golfMoving(t) {
      return !!gshot && (gshot.sq > (cur.sq || 0) || (t - gshot.t0) / STEP_MS < gshot.sim.steps);
    }

    /** Golf: dónde está cada bola (con el tiro en curso, todas las que se mueven). */
    function golfBallAt(id, t) {
      var b = cur.balls && cur.balls[id];
      if (!b || b.out) return null;
      var g = gshot, sq = cur.sq || 0;
      if (g && g.sq >= sq && g.idx[id] != null) {
        var i = g.idx[id], N = g.sim.n, p = g.sim.pts;
        var k = (t - g.t0) / STEP_MS;
        var ha = g.sim.holedAt[i];
        if (k < g.sim.steps || g.sq > sq) {
          var kk = Math.min(k, g.sim.steps);
          var a = Math.max(0, Math.floor(kk)), f = kk - a, a2 = Math.min(a + 1, g.sim.steps);
          var x0 = p[(a * N + i) * 2], y0 = p[(a * N + i) * 2 + 1];
          var x1 = p[(a2 * N + i) * 2], y1 = p[(a2 * N + i) * 2 + 1];
          var moving = k < g.sim.steps && (x0 !== x1 || y0 !== y1);
          return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f, moving: moving,
            holed: ha != null && k >= ha, since: ha != null ? (k - ha) * STEP_MS : 0 };
        }
        if (ha != null) return { x: b.x, y: b.y, moving: false, holed: true, since: (k - ha) * STEP_MS };
      }
      // todavía no tiró en este hoyo: no está en la mesa (salvo que sea su turno)
      if (b.strokes === 0 && !b.done && !(cur.players[cur.turn] && cur.players[cur.turn].id === id)) return null;
      return { x: b.x, y: b.y, moving: false, holed: b.done && !b.out, since: 1e9 };
    }

    /** Posición de una bola en este momento. */
    function ballAt(id, t) {
      if (golf) return golfBallAt(id, t);
      var b = cur.balls && cur.balls[id];
      if (!b) return null;
      var a = anims[id];
      if (a && a.n >= b.shot) {
        var k = (t - a.t0) / STEP_MS;
        if (k < a.sim.steps) {
          var i = Math.max(0, Math.floor(k)), f = k - i, p = a.sim.pts;
          return { x: p[2 * i] + (p[2 * i + 2] - p[2 * i]) * f, y: p[2 * i + 1] + (p[2 * i + 3] - p[2 * i + 1]) * f, moving: true };
        }
        var since = t - a.t0 - a.sim.steps * STEP_MS;
        if (a.n > b.shot) return { x: a.sim.x, y: a.sim.y, moving: false, holed: a.sim.holed, since: since, unconfirmed: true };
        return { x: b.x, y: b.y, moving: false, holed: a.sim.holed || b.done && !b.out, since: since };
      }
      return { x: b.x, y: b.y, moving: false, holed: b.done && !b.out, since: 1e9 };
    }

    function myShots() {
      var b = cur.balls[api.me], a = anims[api.me];
      return Math.max(b.shot, a ? a.n : 0);
    }

    function canAim(t) {
      if (!cur || cur.phase !== 'play' || !cur.balls) return false;
      var b = cur.balls[api.me];
      if (!b || b.done) return false;
      if (golf) {
        if (!cur.players[cur.turn] || cur.players[cur.turn].id !== api.me) return false;
        if (golfMoving(t)) return false;                // hay bolas rodando o falta confirmación
        if (cur.fly && Object.keys(cur.fly).length) return false;
      }
      var p = ballAt(api.me, t);
      return !!p && !p.moving && !p.holed;
    }

    function angleAt(t) { return -Math.PI / 2 + (t - aim.t0) / 1000 * SPIN; }
    function powerAt(t) {
      var ph = ((t - aim.t1) % POW_PERIOD) / POW_PERIOD;
      return ph < 0.5 ? ph * 2 : 2 - ph * 2;
    }

    function tap() {
      var t = performance.now();
      if (!canAim(t)) return;
      if (!aim) { aim = { stage: 0, t0: t }; return; }
      if (aim.stage === 0) {
        aim.ang = angleAt(t); aim.stage = 1; aim.t1 = t;
        api.vibrate(15);
        return;
      }
      var p = Math.max(0.02, powerAt(t));
      var v = RD.shotVel(aim.ang, p);
      aim = null;
      if (golf) {
        var gn = cur.balls[api.me].shot + 1;
        startGolf({ id: api.me, n: gn, sq: (cur.sq || 0) + 1, vx: v[0], vy: v[1], list: golfList(cur, api.me) }, 0);
        api.toHost({ type: 'shoot', n: gn, vx: v[0], vy: v[1] });
        api.vibrate(25);
        return;
      }
      var pos = ballAt(api.me, t);
      var n = myShots() + 1;
      startAnim(api.me, n, pos.x, pos.y, v[0], v[1], 0);
      api.toHost({ type: 'shoot', n: n, vx: v[0], vy: v[1] });
      api.vibrate(25);
    }

    // ================================================================ vista
    function renderWait() {
      api.waiting({
        emoji: golf ? '⛳' : '🏁', title: golf ? 'Mini golf' : 'Carrera',
        sub: (golf
          ? 'Por turnos: cada uno tira y pasa al siguiente. Gana el que emboque con <b>menos golpes</b> en total. Las bolas <b>chocan</b>: podés empujar la de otro (¡y hasta metérsela!).'
          : '¡Todos a la vez! Apenas tu bola frena, podés volver a tirar. Primero en embocar: 3 pts, segundo: 2, tercero: 1.') +
          '<br><br>Tocá una vez para <b>fijar la dirección</b> de la flecha que gira, y otra vez para <b>tirar</b> con la fuerza del momento.<br>' +
          '🟫 barro frena · ⏩ cintas te empujan · 🌀 agujero negro te manda al inicio',
        min: 1, max: 8, values: lastVals,
        options: [{ key: 'rounds', label: golf ? 'Hoyos' : 'Carreras', value: golf ? 6 : 5,
          choices: golf ? [[3, '3'], [6, '6'], [9, '9']] : [[3, '3'], [5, '5'], [8, '8']] }],
        onStart: function (vals) { api.toHost({ type: 'start', vals: vals }); }
      });
    }

    function renderPlay() {
      el.onclick = null;
      el.innerHTML = '<div id="rd-sb"></div><div class="banner" id="rd-bn" style="font-size:15px"></div>' +
        '<div style="flex:1;min-height:0;position:relative" id="rd-wrap"><canvas class="arena" id="rd-c"></canvas><div id="rd-ov"></div></div>' +
        '<div class="pad"><button id="rd-btn" style="background:#2f7a55"><span class="ic" id="rd-ic">🎯</span><span id="rd-lb">Fijar dirección</span></button></div>';
      canvas = el.querySelector('#rd-c');
        if (window.ResizeObserver) {
          if (self._ro) self._ro.disconnect();
          self._ro = new ResizeObserver(function () { resize(); });
          self._ro.observe(el.querySelector('#rd-wrap'));
        }
      ctx = canvas.getContext('2d');
      var btn = el.querySelector('#rd-btn');
      btn.addEventListener('pointerdown', function (e) { e.preventDefault(); btn.classList.add('held'); tap(); });
      btn.addEventListener('pointerup', function () { btn.classList.remove('held'); });
      btn.addEventListener('pointercancel', function () { btn.classList.remove('held'); });
      btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); tap(); });
      resize();
      startDraw();
    }

    function resize() {
      if (!canvas) return;
      var wrap = el.querySelector('#rd-wrap');
      scale = Math.min((wrap.clientWidth - 12) / W, (wrap.clientHeight - 6) / H);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.width = Math.floor(W * scale) + 'px';
      canvas.style.height = Math.floor(H * scale) + 'px';
      canvas.width = Math.floor(W * scale * dpr);
      canvas.height = Math.floor(H * scale * dpr);
      bgFor = '';
    }

    function startDraw() { stopDraw(); (function loop() { raf = requestAnimationFrame(loop); frame(); })(); }
    function stopDraw() { if (raf) cancelAnimationFrame(raf); raf = null; }

    function frame() {
      if (!canvas || !cur || !cur.players) return;
      var map = curMap();
      var t = performance.now();
      var c = ctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      if (!map) { c.fillStyle = '#0b1020'; c.fillRect(0, 0, canvas.width, canvas.height); updateUi(); return; }
      var key = cur.mi + '|' + canvas.width;
      if (bgFor !== key) {
        bg = document.createElement('canvas');
        bg.width = canvas.width; bg.height = canvas.height;
        var bc = bg.getContext('2d');
        bc.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
        RD.drawStatic(bc, map);
        bgFor = key;
      }
      c.drawImage(bg, 0, 0);
      c.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      RD.drawDynamic(c, map, t / 1000);

      // bolas: primero las de los demás, la mía arriba
      var mine = null;
      cur.players.forEach(function (p) {
        var pos = ballAt(p.id, t);
        if (!pos) return;
        if (p.id === api.me) { mine = { p: p, pos: pos }; return; }
        drawOne(c, p, pos, false);
      });
      if (mine) drawOne(c, mine.p, mine.pos, true);

      // flecha
      if (canAim(t)) {
        if (!aim) aim = { stage: 0, t0: t };
        var bp = mine.pos;
        var ang = aim.stage === 0 ? angleAt(t) : aim.ang;
        var pw = aim.stage === 1 ? powerAt(t) : 0.35;
        var len = 26 + pw * 104;
        var col = aim.stage === 1 ? 'hsl(' + Math.round((1 - pw) * 120) + ',90%,55%)' : '#ffffff';
        drawArrow(c, bp.x, bp.y, ang, len, col, aim.stage === 0);
        if (aim.stage === 1) {
          c.strokeStyle = '#ffffff22'; c.lineWidth = 2; c.setLineDash([4, 6]);
          c.beginPath(); c.arc(bp.x, bp.y, 26 + 104 + 4, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
        }
      } else {
        aim = null;
      }

      // cuenta regresiva
      if (cur.phase === 'count') {
        c.fillStyle = '#0b1020aa'; c.fillRect(0, H / 2 - 70, W, 140);
        c.fillStyle = '#fff'; c.font = '900 64px ui-rounded, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('¡Preparados!', W / 2, H / 2);
        c.textBaseline = 'alphabetic';
      }
      updateUi();
    }

    function drawOne(c, p, pos, me) {
      var sc = 1;
      if (pos.holed) {
        sc = Math.max(0, 1 - (pos.since || 0) / 350);
        if (sc <= 0) return;
      }
      RD.drawBall(c, pos.x, pos.y, p.color, me, sc);
    }

    function drawArrow(c, x, y, ang, len, color, dashed) {
      var cs = Math.cos(ang), sn = Math.sin(ang);
      var sx = x + cs * 13, sy = y + sn * 13, ex = x + cs * (13 + len), ey = y + sn * (13 + len);
      c.strokeStyle = '#000a'; c.lineWidth = 9; c.lineCap = 'round';
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.stroke();
      c.strokeStyle = color; c.lineWidth = 5;
      if (dashed) c.setLineDash([8, 7]);
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.stroke();
      c.setLineDash([]);
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(ex + cs * 12, ey + sn * 12);
      c.lineTo(ex - sn * 10, ey + cs * 10);
      c.lineTo(ex + sn * 10, ey - cs * 10);
      c.closePath(); c.fill();
      c.strokeStyle = '#000a'; c.lineWidth = 1.5; c.stroke();
    }

    function playerById(id) {
      for (var i = 0; i < cur.players.length; i++) if (cur.players[i].id === id) return cur.players[i];
      return { name: api.name(id), color: '#fff' };
    }

    /** Textos, marcador, botón y pantallas de resumen (solo se toca el DOM si algo cambió). */
    function updateUi() {
      if (!cur || !cur.players || !canvas) return;
      var t = performance.now();
      var map = curMap();
      var b = cur.balls && cur.balls[api.me];
      var playing = !!b;
      var aimOk = canAim(t);
      // botón
      var ic = '⏳', lb = 'Esperando…', bgc = '#3b4258';
      if (cur.phase === 'count') { ic = '🏁'; lb = 'Preparados…'; }
      else if (cur.phase === 'play') {
        if (!playing) { ic = '👀'; lb = 'Mirando'; }
        else if (b.done) { ic = b.out ? '😵' : '✅'; lb = b.out ? 'Te pasaste de golpes' : '¡Embocaste!'; }
        else if (aimOk) {
          if (!aim || aim.stage === 0) { ic = '🎯'; lb = 'Fijar dirección'; bgc = '#2f7a55'; }
          else { ic = '💥'; lb = '¡Tirar!'; bgc = '#a8394a'; }
        } else if (golf && cur.players[cur.turn] && cur.players[cur.turn].id !== api.me) {
          ic = '⏳'; lb = 'Turno de ' + cur.players[cur.turn].name;
        } else { ic = '🎱'; lb = 'Rodando…'; }
      } else if (cur.phase === 'between' || cur.phase === 'over') { ic = '🏆'; lb = 'Resultados'; }

      var closeTxt = '';
      if (!golf && closeLocal && cur.phase === 'play') closeTxt = ' · ⏱ ' + Math.max(0, Math.ceil((closeLocal - t) / 1000)) + 's';
      var bn = '';
      if (map && cur.phase !== 'over') {
        bn = (golf ? '⛳ Hoyo ' : '🏁 Carrera ') + (cur.mi + 1) + '/' + cur.maps.length + ' · <b>' + api.esc(map.n) + '</b>' +
          (golf ? ' · par ' + map.par : '') + closeTxt;
        if (golf && cur.phase === 'play' && cur.players[cur.turn]) {
          var tp = cur.players[cur.turn];
          bn += '<br><span style="color:' + tp.color + '">' + (tp.id === api.me ? '¡Tu turno!' : 'Turno de ' + api.esc(tp.name)) +
            '</span> · golpe ' + (cur.balls[tp.id].strokes + 1);
        }
      }
      var key = [ic, lb, bgc, bn, cur.seq, cur.phase].join('|');
      if (key === uiKey) return;
      uiKey = key;

      el.querySelector('#rd-ic').textContent = ic;
      el.querySelector('#rd-lb').textContent = lb;
      el.querySelector('#rd-btn').style.background = bgc;
      el.querySelector('#rd-bn').innerHTML = bn;

      // marcador
      var sb = el.querySelector('#rd-sb');
      sb.innerHTML = App.scoreStrip(cur.players.map(function (p, idx) {
        var bb = cur.balls && cur.balls[p.id];
        var val;
        if (golf) {
          var extra = bb && cur.phase === 'play' ? bb.strokes : 0;
          val = (cur.scores[p.id] || 0) + extra;
        } else val = cur.scores[p.id] || 0;
        var turn = golf && cur.phase === 'play' && cur.turn === idx;
        return { id: p.id, name: p.name, color: p.color, score: val, cls: turn ? 'turn' : '', mark: bb && bb.done && cur.phase === 'play' ? ' ✔' : '' };
      }), golf ? 'golpes' : 'puntos');

      // resúmenes
      var ov = el.querySelector('#rd-ov');
      if (cur.phase === 'between' && cur.last) {
        var rows = cur.last.res.slice().sort(function (a, b2) {
          if (golf) return a.strokes - b2.strokes;
          return (a.place || 99) - (b2.place || 99);
        }).map(function (r) {
          var p = playerById(r.id);
          var right;
          if (golf) {
            var diff = r.strokes - cur.last.par;
            right = r.out ? r.strokes + ' (se pasó)' : r.strokes + ' golpes · ' + (r.strokes === 1 ? '¡HOYO EN UNO!' : diff === 0 ? 'par' : (diff > 0 ? '+' + diff : diff));
          } else {
            right = r.place ? r.place + '° · +' + r.pts : 'no llegó';
          }
          return '<div class="pitem"><span class="sw" style="background:' + p.color + ';color:' + p.color + '"></span>' + api.esc(p.name) +
            '<span class="tag" style="color:var(--text)">' + right + '</span></div>';
        }).join('');
        ov.innerHTML = '<div class="overlay" style="background:#0b1020f0"><h3>' + api.esc(cur.last.name) + '</h3><div class="plist" style="width:100%;max-width:340px">' + rows + '</div>' +
          '<p>' + (cur.mi + 1 < cur.maps.length ? 'Siguiente mapa en unos segundos…' : 'Último mapa…') + '</p></div>';
      } else if (cur.phase === 'over') {
        var order = cur.players.slice().sort(function (a, b2) {
          return golf ? cur.scores[a.id] - cur.scores[b2.id] : cur.scores[b2.id] - cur.scores[a.id];
        });
        var w = order[0];
        var tied = order.filter(function (p) { return cur.scores[p.id] === cur.scores[w.id]; });
        var title = tied.length > 1
          ? '<h3>¡Empate entre ' + tied.map(function (p) { return '<span style="color:' + p.color + '">' + api.esc(p.name) + '</span>'; }).join(' y ') + '!</h3>'
          : '<h3 style="color:' + w.color + '">¡Ganó ' + api.esc(w.name) + '!</h3>';
        ov.innerHTML = '<div class="overlay" style="background:#0b1020f0"><div style="font-size:56px">🏆</div>' + title +
          '<div class="plist" style="width:100%;max-width:340px">' + order.map(function (p, i) {
            return '<div class="pitem"><span class="sw" style="background:' + p.color + ';color:' + p.color + '"></span>' + (1 + order.filter(function (q) { return golf ? cur.scores[q.id] < cur.scores[p.id] : cur.scores[q.id] > cur.scores[p.id]; }).length) + '. ' + api.esc(p.name) +
              '<span class="tag" style="color:var(--text)">' + cur.scores[p.id] + (golf ? ' golpes' : ' pts') + '</span></div>';
          }).join('') + '</div>' +
          (api.isHost() ? '<div style="display:flex;gap:10px"><button class="btn" data-a="again">Revancha</button><button class="btn ghost" data-a="lobby">Menú</button></div>'
            : '<p>Esperando al anfitrión…</p>') + '</div>';
        ov.onclick = function (e) {
          var a = e.target.getAttribute && e.target.getAttribute('data-a');
          if (a === 'again') api.toHost({ type: 'start', vals: lastVals });
          if (a === 'lobby') api.toHost({ type: 'lobby' });
        };
      } else if (golf && api.isHost() && cur.phase === 'play' && cur.players[cur.turn] && !api.online(cur.players[cur.turn].id)) {
        ov.innerHTML = '<div style="position:absolute;top:8px;left:0;right:0;text-align:center;z-index:4">' +
          '<button class="btn small ghost" data-a="skip">Saltar turno de ' + api.esc(cur.players[cur.turn].name) + '</button></div>';
        ov.onclick = function (e) { if (e.target.getAttribute('data-a') === 'skip') api.toHost({ type: 'skip' }); };
      } else {
        ov.innerHTML = '';
      }
    }

    // ================================================================ ciclo de vida
    self.onRoom = function () {
      var nowHost = api.isHost();
      if (nowHost && !wasHost) { api.toast('Ahora sos el anfitrión'); adopt(); }
      wasHost = nowHost;
      if (!cur || cur.phase === 'wait' || !cur.players) renderWait();
      else uiKey = '';
    };
    self.onReconnect = function () { if (!api.isHost()) api.toHost({ type: 'sync' }); };
    function onResize() { resize(); }
    window.addEventListener('resize', onResize);
    function onKey(e) { if ((e.key === ' ' || e.key === 'Enter') && canvas && !e.repeat && document.activeElement === document.body) { e.preventDefault(); tap(); } }
    document.addEventListener('keydown', onKey);
    self.destroy = function () {
        if (self._ro) self._ro.disconnect();
      clearTimers(); stopDraw();
      if (hostIv) clearInterval(hostIv);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKey);
    };

    if (api.isHost()) {
      var saved = api.load('S');
      if (saved && saved.phase && saved.phase !== 'wait' && saved.players) {
        // el anfitrión recargó la página: retomar
        cur = saved; cur.fly = {}; adopt();
        setState(clone(S));
      } else {
        S = { phase: 'wait', seq: 0 };
        renderWait();
      }
    } else {
      renderWait();
      api.toHost({ type: 'sync' });
    }
    return self;
  }

  App.register({
    id: 'carrera', name: 'Carrera', emoji: '🏁', players: '1-8',
    desc: 'Todos a la vez. Apuntá, cargá fuerza y llegá primero al hoyo.',
    create: function (api) { return createGame(api, false); }
  });
  App.register({
    id: 'golf', name: 'Mini golf', emoji: '⛳', players: '1-8',
    desc: 'Por turnos. Embocá con la menor cantidad de golpes.',
    create: function (api) { return createGame(api, true); }
  });
})();
