/* Chain Reaction: por turnos, 2 a 8 jugadores. El anfitrión valida y todos animan igual. */
(function () {
  'use strict';

  function cap(i, W, H) {
    var x = i % W, y = (i / W) | 0, n = 4;
    if (x === 0 || x === W - 1) n--;
    if (y === 0 || y === H - 1) n--;
    return n;
  }
  function nbs(i, W, H) {
    var x = i % W, y = (i / W) | 0, r = [];
    if (x > 0) r.push(i - 1);
    if (x < W - 1) r.push(i + 1);
    if (y > 0) r.push(i - W);
    if (y < H - 1) r.push(i + W);
    return r;
  }
  function onlyOwner(o, c, p) {
    var any = false;
    for (var k = 0; k < c.length; k++) if (c[k] > 0) { if (o[k] !== p) return false; any = true; }
    return any;
  }
  /** Simulación determinística de una jugada. Devuelve tablero final y cuadros intermedios. */
  function simulate(o0, c0, W, H, i, p, canWin) {
    var o = o0.slice(), c = c0.slice(), frames = [];
    o[i] = p; c[i]++;
    frames.push({ o: o.slice(), c: c.slice(), boom: [] });
    for (var guard = 0; guard < 400; guard++) {
      var boom = [];
      for (var k = 0; k < c.length; k++) if (c[k] >= cap(k, W, H)) boom.push(k);
      if (!boom.length) break;
      boom.forEach(function (k) {
        c[k] -= cap(k, W, H);
        if (c[k] <= 0) { c[k] = 0; o[k] = -1; }
        nbs(k, W, H).forEach(function (n) { o[n] = p; c[n]++; });
      });
      frames.push({ o: o.slice(), c: c.slice(), boom: boom });
      if (canWin && onlyOwner(o, c, p)) break;
    }
    return { o: o, c: c, frames: frames };
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  App.register({
    id: 'chain', name: 'Chain Reaction', emoji: '⚛️', players: '2-8',
    desc: 'Explosiones en cadena. Conquistá todo el tablero.',
    create: function (api) {
      var S = null;          // estado autoritativo (solo el anfitrión)
      var cur = null;        // lo que muestra este celular
      var queue = [], busy = false, wasHost = api.isHost();
      var lastWaitValues = { size: 'S' };
      var self = { alive: true };
      var el = api.el;

      function newWait() { return { phase: 'wait', seq: 0 }; }

      // -------------------------------------------------- anfitrión
      function hostInit() {
        var saved = api.load('S');
        S = saved && saved.phase !== 'wait' ? saved : (cur && cur.phase !== 'wait' ? clone(cur) : newWait());
        if (cur == null) cur = clone(S);
      }
      function publish(anim) {
        S.seq++;
        S.anim = anim || null;
        api.save('S', S);
        api.toAll({ type: 'state', s: S });
      }
      function start(vals) {
        var big = vals.size === 'L';
        var W = big ? 8 : 6, H = big ? 12 : 9;
        var ps = api.members().filter(function (m) { return m.online; }).slice(0, 8);
        if (ps.length < 2) { api.toast('Se necesitan 2 jugadores'); return; }
        lastWaitValues = vals;
        var o = [], c = [];
        for (var k = 0; k < W * H; k++) { o.push(-1); c.push(0); }
        S = {
          phase: 'play', W: W, H: H, o: o, c: c, moves: 0, turn: 0, winner: null, seq: S ? S.seq : 0,
          size: vals.size,
          players: ps.map(function (p, idx) { return { id: p.id, name: p.name, color: api.colors[idx % 8], alive: true }; })
        };
        publish(null);
      }
      function inRoom(id) {
        var r = api.room();
        return r && r.members.indexOf(id) >= 0;
      }
      function nextTurn() {
        var n = S.players.length;
        for (var step = 1; step <= n; step++) {
          var t = (S.turn + step) % n;
          var p = S.players[t];
          if (p.alive && inRoom(p.id)) { S.turn = t; return; }
        }
      }
      function hostAct(from, d) {
        if (!S) return;
        if (d.type === 'sync') { api.to(from, { type: 'state', s: S, sync: true }); return; }
        if (d.type === 'start' && from === api.me) { start(d.vals); return; }
        if (d.type === 'lobby' && from === api.me) { S = newWait(); S.seq = (cur && cur.seq) || 0; publish(null); return; }
        if (d.type === 'skip' && from === api.me && S.phase === 'play') { nextTurn(); publish(null); return; }
        if (d.type !== 'move' || S.phase !== 'play') return;
        var p = S.turn, pl = S.players[p];
        if (!pl || pl.id !== from) return;
        var i = d.i | 0;
        if (i < 0 || i >= S.W * S.H) return;
        if (S.o[i] !== -1 && S.o[i] !== p) return;
        var canWin = S.moves + 1 >= S.players.length;
        var sim = simulate(S.o, S.c, S.W, S.H, i, p, canWin);
        S.o = sim.o; S.c = sim.c; S.moves++;
        if (S.moves >= S.players.length) {
          S.players.forEach(function (pp, idx) {
            if (!pp.alive) return;
            var has = false;
            for (var k = 0; k < S.c.length; k++) if (S.o[k] === idx && S.c[k] > 0) { has = true; break; }
            if (!has) pp.alive = false;
          });
        }
        var alive = S.players.filter(function (pp) { return pp.alive; });
        if (alive.length <= 1) {
          S.phase = 'over';
          S.winner = alive.length ? S.players.indexOf(alive[0]) : p;
        } else {
          nextTurn();
        }
        publish({ i: i, p: p });
      }

      // -------------------------------------------------- todos
      self.onMsg = function (from, d) {
        if (d.type === 'state') {
          if (from !== api.hostId() && from !== api.me) return;
          queue.push(d);
          pump();
          return;
        }
        if (api.isHost()) hostAct(from, d);
      };

      function pump() {
        if (busy || !queue.length || !self.alive) return;
        var d = queue.shift();
        var s = d.s;
        if (cur && s.seq <= cur.seq && !d.sync) { pump(); return; }
        if (cur && cur.phase === 'play' && s.anim && s.seq === cur.seq + 1 && s.W === cur.W) {
          var sim = simulate(cur.o, cur.c, cur.W, cur.H, s.anim.i, s.anim.p, true);
          busy = true;
          var frames = sim.frames, k = 1;
          var tmp = clone(cur);
          var color = cur.players[s.anim.p] ? cur.players[s.anim.p].color : '#fff';
          // olas largas: un poco más rápido para no hacerse eterno
          var fast = frames.length > 12 ? Math.max(0.45, 12 / frames.length) : 1;
          var FLY = Math.round(250 * fast), HOLD = Math.round(70 * fast);
          tmp.o = frames[0].o; tmp.c = frames[0].c;
          draw(tmp, [], s.anim.i);
          pop([s.anim.i]);
          var finish = function () { busy = false; setState(s); pump(); };
          var wave = function () {
            if (!self.alive) return;
            if (k >= frames.length) { finish(); return; }
            var prev = frames[k - 1], fr = frames[k], boom = fr.boom;
            // 1) las celdas que explotan se vacían y sus átomos vuelan a las vecinas
            var mid = { o: prev.o.slice(), c: prev.c.slice() };
            var targets = [];
            boom.forEach(function (b) {
              mid.c[b] -= cap(b, cur.W, cur.H);
              if (mid.c[b] <= 0) { mid.c[b] = 0; mid.o[b] = -1; }
              nbs(b, cur.W, cur.H).forEach(function (n) { targets.push([b, n]); });
            });
            tmp.o = mid.o; tmp.c = mid.c;
            draw(tmp, boom, -1);
            flyOrbs(targets, color, FLY);
            var kk = k;
            k++;
            // 2) llegan: se ve el resultado de la ola
            setTimeout(function () {
              if (!self.alive) return;
              tmp.o = frames[kk].o; tmp.c = frames[kk].c;
              draw(tmp, [], -1);
              pop(targets.map(function (t) { return t[1]; }));
              setTimeout(wave, HOLD);
            }, FLY);
          };
          setTimeout(wave, 200);
        } else {
          setState(s);
          pump();
        }
      }

      function setState(s) {
        var prevPhase = cur && cur.phase;
        var wasMyTurn = cur && cur.phase === 'play' && cur.players[cur.turn] && cur.players[cur.turn].id === api.me;
        cur = clone(s);
        if (api.isHost() && (!S || S.seq < s.seq)) S = clone(s);
        render();
        if (cur.phase === 'play' && cur.players[cur.turn].id === api.me && !wasMyTurn) api.vibrate(60);
        if (cur.phase === 'over' && prevPhase === 'play') api.vibrate([80, 60, 80]);
      }

      // -------------------------------------------------- vista
      var gridEl = null, cellEls = [], cellSize = 30;

      function stripHtml(st) {
        return App.scoreStrip(st.players.map(function (p, idx) {
          var count = 0;
          for (var k = 0; k < st.c.length; k++) if (st.o[k] === idx) count += st.c[k];
          return { id: p.id, name: p.name, color: p.color, score: count,
            cls: (idx === st.turn && st.phase === 'play' ? 'turn' : '') + (p.alive ? '' : ' dead') };
        }));
      }

      /** Átomos que viajan de una celda a otra durante la explosión. */
      function flyOrbs(pairs, color, ms) {
        if (!gridEl || pairs.length > 160 || !Element.prototype.animate) return;
        pairs.forEach(function (pr) {
          var a = pr[0], b = pr[1];
          var ax = (a % cur.W + 0.5) * cellSize, ay = (((a / cur.W) | 0) + 0.5) * cellSize;
          var bx = (b % cur.W + 0.5) * cellSize, by = (((b / cur.W) | 0) + 0.5) * cellSize;
          var o = document.createElement('i');
          o.className = 'cr-fly';
          var sz = Math.round(cellSize * 0.36);
          o.style.cssText = 'width:' + sz + 'px;height:' + sz + 'px;left:' + (ax - sz / 2) + 'px;top:' + (ay - sz / 2) + 'px;--c:' + color;
          gridEl.appendChild(o);
          o.animate([{ transform: 'translate(0,0) scale(1.15)' }, { transform: 'translate(' + (bx - ax) + 'px,' + (by - ay) + 'px) scale(0.9)' }],
            { duration: ms, easing: 'cubic-bezier(.3,.1,.3,1)', fill: 'forwards' });
          setTimeout(function () { o.remove(); }, ms + 30);
        });
      }
      /** Pequeño "salto" de las celdas que reciben átomos. */
      function pop(list) {
        if (!Element.prototype.animate) return;
        var seen = {};
        list.forEach(function (k) {
          if (seen[k] || !cellEls[k]) return;
          seen[k] = 1;
          var orb = cellEls[k].querySelector('.cr-orbs');
          if (orb) orb.animate([{ scale: '1.35' }, { scale: '1' }], { duration: 220, easing: 'ease-out' });
        });
      }
      function render() {
        if (!cur || cur.phase === 'wait') { renderWait(); gridEl = null; return; }
        el.onclick = null;
        el.innerHTML = '<div id="cr-sb">' + stripHtml(cur) + '</div><div class="banner" id="cr-bn">&nbsp;</div>' +
          '<div style="flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:4px 8px" id="cr-wrap"></div>' +
          '<div id="cr-foot" style="min-height:58px;box-sizing:border-box;padding:8px 16px calc(12px + var(--safe-b));display:flex;gap:10px;justify-content:center"></div>';
        buildGrid();
        draw(cur, [], -1);
      }

      function buildGrid() {
        var wrap = el.querySelector('#cr-wrap');
        var aw = wrap.clientWidth - 4, ah = wrap.clientHeight - 4;
        var size = Math.max(22, Math.floor(Math.min(aw / cur.W, ah / cur.H)));
        gridEl = document.createElement('div');
        cellEls = [];
        gridEl.className = 'cr-grid';
        cellSize = size;
        gridEl.style.cssText = 'position:relative;display:grid;grid-template-columns:repeat(' + cur.W + ',' + size + 'px);grid-auto-rows:' + size + 'px;' +
          'border-radius:10px;overflow:hidden;transition:box-shadow .3s, border-color .3s;border:2px solid #fff3;touch-action:manipulation';
        for (var k = 0; k < cur.W * cur.H; k++) {
          var c = document.createElement('div');
          c.className = 'cr-cell';
          c.setAttribute('data-i', k);
          gridEl.appendChild(c);
          cellEls.push(c);
        }
        wrap.appendChild(gridEl);
        gridEl.onclick = function (e) {
          var t = e.target.closest('.cr-cell');
          if (!t || busy || !cur || cur.phase !== 'play') return;
          var me = cur.players[cur.turn];
          if (!me || me.id !== api.me) { api.toast('No es tu turno'); return; }
          var i = +t.getAttribute('data-i');
          if (cur.o[i] !== -1 && cur.o[i] !== cur.turn) { api.vibrate(30); return; }
          api.toHost({ type: 'move', i: i });
        };
      }

      function orbs(n, color, crit) {
        if (!n) return '';
        var pos = n === 1 ? [[50, 50]] : n === 2 ? [[36, 50], [64, 50]] : n === 3 ? [[50, 34], [35, 62], [65, 62]] : [[36, 36], [64, 36], [36, 64], [64, 64]];
        var html = '<div class="cr-orbs' + (crit ? ' crit' : '') + '" style="--c:' + color + '">';
        pos.forEach(function (p) { html += '<i style="left:' + p[0] + '%;top:' + p[1] + '%"></i>'; });
        return html + '</div>';
      }

      function draw(st, boom, placed) {
        if (!gridEl) return;
        var turnColor = st.phase === 'play' ? st.players[st.turn].color : (st.winner != null ? st.players[st.winner].color : '#fff');
        gridEl.style.borderColor = turnColor;
        gridEl.style.boxShadow = '0 0 22px ' + turnColor + '55';
        gridEl.style.setProperty('--line', turnColor + '55');
        var cells = cellEls;
        var boomSet = {};
        (boom || []).forEach(function (b) { boomSet[b] = 1; });
        for (var k = 0; k < cells.length; k++) {
          var n = st.c[k], ow = st.o[k];
          var color = ow >= 0 ? st.players[ow].color : '#fff';
          var crit = n > 0 && n >= cap(k, st.W, st.H) - 1;
          var key = n + '|' + ow + '|' + (crit ? 1 : 0) + '|' + (boomSet[k] ? 'b' : '');
          if (cells[k]._k !== key) {
            cells[k]._k = key;
            cells[k].innerHTML = orbs(Math.min(n, 4), color, crit) + (boomSet[k] ? '<b class="cr-boom" style="--c:' + color + '"></b>' : '');
          }
        }
        // marcador
        var sb = el.querySelector('#cr-sb');
        if (sb) {
          sb.innerHTML = stripHtml(st);
        }
        var bn = el.querySelector('#cr-bn');
        var foot = el.querySelector('#cr-foot');
        if (bn && st === cur) {
          var html = '', fh = '';
          if (st.phase === 'play') {
            var tp = st.players[st.turn];
            if (tp.id === api.me) html = '<span style="color:' + tp.color + '">¡Tu turno!</span>';
            else html = 'Turno de <span style="color:' + tp.color + '">' + api.esc(tp.name) + '</span>' + (api.online(tp.id) ? '' : ' (desconectado)');
            if (api.isHost() && !api.online(tp.id)) fh = '<button class="btn small ghost" data-a="skip">Saltar turno</button>';
            if (api.isHost()) fh += '<button class="btn small ghost" data-a="lobby">Terminar</button>';
          } else if (st.phase === 'over') {
            var w = st.players[st.winner];
            html = '<span style="color:' + w.color + '">🏆 ¡Ganó ' + api.esc(w.name) + '!</span>';
            if (api.isHost()) fh = '<button class="btn small" data-a="again">Revancha</button><button class="btn small ghost" data-a="lobby">Cambiar jugadores</button>';
            else fh = '<span class="hint">El anfitrión puede iniciar la revancha</span>';
          }
          bn.innerHTML = html;
          foot.innerHTML = fh;
          foot.onclick = function (e) {
            var a = e.target.getAttribute('data-a');
            if (a === 'skip') api.toHost({ type: 'skip' });
            if (a === 'lobby') api.toHost({ type: 'lobby' });
            if (a === 'again') api.toHost({ type: 'start', vals: { size: cur.size || 'S' } });
          };
        }
      }

      function renderWait() {
        api.waiting({
          emoji: '⚛️', title: 'Chain Reaction',
          sub: 'Tocá una celda vacía o tuya para sumar un átomo. Cuando una celda se llena, explota y conquista las vecinas.',
          min: 2, max: 8, values: lastWaitValues,
          options: [{ key: 'size', label: 'Tablero', value: 'S', choices: [['S', '6×9'], ['L', '8×12']] }],
          onStart: function (vals) { api.toHost({ type: 'start', vals: vals }); }
        });
      }

      // si alguien se fue de la sala: saltear su turno o terminar si queda uno solo
      function hostCheckLeavers() {
        if (!S || S.phase !== 'play') return;
        var present = S.players.filter(function (p) { return p.alive && inRoom(p.id); });
        if (present.length === 1 && S.players.length > 1) {
          S.phase = 'over';
          S.winner = S.players.indexOf(present[0]);
          publish(null);
        } else if (present.length > 1 && !inRoom(S.players[S.turn].id)) {
          nextTurn();
          publish(null);
        }
      }

      self.onRoom = function () {
        var nowHost = api.isHost();
        if (nowHost && !wasHost) { hostInit(); api.toast('Ahora sos el anfitrión'); }
        wasHost = nowHost;
        if (nowHost) hostCheckLeavers();
        if (!cur || cur.phase === 'wait') renderWait();
        else if (!busy) draw(cur, [], -1);
      };
      self.onReconnect = function () { if (!api.isHost()) api.toHost({ type: 'sync' }); };
      self.destroy = function () { self.alive = false; window.removeEventListener('resize', onResize); };
      function onResize() { if (cur && cur.phase !== 'wait' && !busy) render(); }
      window.addEventListener('resize', onResize);

      if (api.isHost()) {
        hostInit();
        cur = clone(S);
        render();
      } else {
        cur = newWait();
        renderWait();
        api.toHost({ type: 'sync' });
      }
      return self;
    }
  });

  // estilos propios del juego
  var css = document.createElement('style');
  css.textContent =
    '.cr-cell{position:relative;border-right:1px solid var(--line,#fff2);border-bottom:1px solid var(--line,#fff2);background:#0e1430}' +
    '.cr-orbs{position:absolute;inset:0;animation:crspin 3.2s linear infinite}' +
    '.cr-orbs.crit{animation:crspin 1s linear infinite, crshake .18s ease-in-out infinite alternate}' +
    '.cr-orbs i{position:absolute;width:38%;height:38%;margin:-19% 0 0 -19%;border-radius:50%;' +
    'background:var(--c);background-image:radial-gradient(circle at 35% 30%,#ffffffdd 0,#ffffff00 45%),radial-gradient(circle at 60% 70%,#00000000 40%,#00000066 100%);box-shadow:0 0 10px var(--c)}' +
    '.cr-boom{position:absolute;inset:8%;border-radius:50%;background:radial-gradient(circle,#fff,var(--c) 40%,transparent 70%);animation:crboom .3s ease-out forwards}' +
    '.cr-fly{position:absolute;border-radius:50%;pointer-events:none;z-index:3;background:var(--c);background-image:radial-gradient(circle at 35% 30%,#ffffffdd 0,#ffffff00 45%);box-shadow:0 0 12px var(--c)}' +
    '@keyframes crspin{to{transform:rotate(360deg)}}' +
    '@keyframes crshake{from{translate:-1px 0}to{translate:1px 1px}}' +
    '@keyframes crboom{from{transform:scale(.4);opacity:1}to{transform:scale(1.5);opacity:0}}';
  document.head.appendChild(css);
})();
