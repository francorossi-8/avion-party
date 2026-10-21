/* Todos a la Puerta: plataformas cooperativas de 2 a 8.
   Cada celular mueve su propio personaje (sin demora) y manda su posición; el anfitrión maneja
   la llave, los botones, las cajas pesadas y la puerta. Hay que entrar todos para pasar de nivel. */
(function () {
  'use strict';
  var C = window.Coop, T = C.T, PW = C.PW, PH = C.PH;
  var SEND_MS = 50;
  var PLATE_COLORS = { a: '#ff9f43', b: '#2ee6d6', c: '#c77dff', d: '#3ddc84', e: '#ff6fb5' };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function fmtTime(ms) { var s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  App.register({
    id: 'coop', name: 'Todos a la Puerta', emoji: '🗝️', players: '2-8',
    desc: 'Puzzles en equipo: apílense, pisen botones, empujen cajas y entren todos.',
    create: function (api) {
      // ------------------------------------------------ estado local
      var L = null, lseq = -1, on = {}, cur = null;
      var me = null, myIdx = -1, myIn = false;
      var mates = {};                  // id -> {buf, off, jit, x, y, px, py, f, inDoor}
      var boxView = [];                // {buf:[{t,x,y}], x, y, px, py, w, h}
      var held = { l: {}, r: {} }, jumpQ = false;
      var canvas, ctx, raf = null, scale = 1, dpr = 1, bg = null, bgKey = '';
      var lastSend = 0, lastAct = {}, lastT = 0, hideHint = {}, holdDir = 0;
      var Href = null, hostIv = null, hpos = {}, hbox = [], tick = 0;

      function act(V, type, extra, gap) {
        var now = performance.now();
        if (gap && lastAct[type] && now - lastAct[type] < gap) return;
        lastAct[type] = now;
        var d = { type: type, ls: lseq };
        if (extra) Object.keys(extra).forEach(function (k) { d[k] = extra[k]; });
        V.act(d);
      }
      function pressedOf(S) {
        var p = {};
        Object.keys(S.pressed || {}).forEach(function (k) { if (S.pressed[k]) p[k] = true; });
        Object.keys(S.latched || {}).forEach(function (k) { if (S.latched[k]) p[k] = true; });
        return p;
      }

      // ================================================ anfitrión
      function activeCount(H) {
        var n = 0;
        H.S.players.forEach(function (p) { if (H.online(p.id)) n++; });
        return Math.max(1, n);
      }
      function startLevel(H, li) {
        var S = H.S, Lv = C.LEVELS[li];
        S.li = li; S.lseq = (S.lseq || 0) + 1; S.phase = 'play';
        S.key = { x: Lv.key.c * T + 4, y: Lv.key.r * T + 4, holder: null, used: false };
        S.door = false; S.inDoor = []; S.pressed = {}; S.latched = {}; S.counts = {};
        hbox = Lv.boxes.map(function (b) { return { x: b.c * T, y: b.r * T, w: b.w * T, h: b.h * T, vy: 0, falling: false, need: b.need }; });
        S.boxes = hbox.map(function (b) { return [b.x, b.y]; });
        S.levelStart = Date.now();
        hpos = {};
        H.publish();
      }
      function rebuildBoxes(S) {
        var Lv = C.LEVELS[S.li];
        hbox = Lv.boxes.map(function (b, i) {
          var p = S.boxes && S.boxes[i];
          return { x: p ? p[0] : b.c * T, y: p ? p[1] : b.r * T, w: b.w * T, h: b.h * T, vy: 0, falling: false, need: b.need };
        });
      }
      function ensureLoop(H) {
        Href = H;
        if (!hostIv) hostIv = setInterval(function () { try { hostLoop(Href); } catch (e) { console.error(e); } }, 33);
      }
      function hostLoop(H) {
        var S = H.S;
        if (!S || S.phase !== 'play' || S.li == null) return;
        tick++;
        var Lv = C.LEVELS[S.li], n = activeCount(H), now = Date.now();
        var onSt = C.linkState(Lv, pressedOf(S));
        var moved = false, changed = false;
        // cajas pesadas
        hbox.forEach(function (b, i) {
          var need = C.needOf(b.need, n), cnt = { '1': 0, '-1': 0 };
          // empujan los que tocan la caja y los que empujan a alguien que empuja (en fila)
          [1, -1].forEach(function (dir) {
            var cand = Object.keys(hpos).filter(function (id) {
              var q = hpos[id];
              return q && q.hd === dir && now - q.at <= 300 && S.inDoor.indexOf(id) < 0;
            });
            var chain = [];
            cand.forEach(function (id) {
              var q = hpos[id];
              var adj = dir > 0 ? Math.abs(q.x + PW - b.x) < 8 : Math.abs(q.x - (b.x + b.w)) < 8;
              if (adj && q.y < b.y + b.h && q.y + PH > b.y) chain.push(id);
            });
            var grew = true;
            while (grew) {
              grew = false;
              cand.forEach(function (id) {
                if (chain.indexOf(id) >= 0) return;
                var q = hpos[id];
                var touch = chain.some(function (cid) {
                  var m = hpos[cid];
                  var adj = dir > 0 ? Math.abs(q.x + PW - m.x) < 8 : Math.abs(q.x - (m.x + PW)) < 8;
                  return adj && q.y < m.y + PH && q.y + PH > m.y;
                });
                if (touch) { chain.push(id); grew = true; }
              });
            }
            cnt[dir] = chain.length;
          });
          var push = cnt['1'] >= need ? 1 : (cnt['-1'] >= need ? -1 : 0);
          var ox = b.x, oy = b.y;
          C.stepBox(Lv, onSt, b, push, 1 / 30, hbox.filter(function (o, j) { return j !== i; }));
          if (Math.abs(b.x - ox) > 0.01 || Math.abs(b.y - oy) > 0.01) moved = true;
          var pushers = Math.max(cnt['1'], cnt['-1']);
          if (b.pushers !== pushers) { b.pushers = pushers; changed = true; }
        });
        // botones
        S.counts = S.counts || {};
        Lv.plates.forEach(function (pl) {
          var need = C.needOf(pl.need, n), x0 = pl.c * T, x1 = (pl.c + pl.w) * T, top = (pl.r + 1) * T, count = 0;
          S.players.forEach(function (p) {
            var q = hpos[p.id];
            if (!q || !H.online(p.id) || S.inDoor.indexOf(p.id) >= 0 || now - q.at > 1500) return;
            if (Math.abs(q.y + PH - top) < 3 && q.x + PW > x0 + 2 && q.x < x1 - 2) count++;
          });
          hbox.forEach(function (b) { if (Math.abs(b.y + b.h - top) < 3 && b.x + b.w > x0 + 2 && b.x < x1 - 2) count++; });
          var pr = count >= need;
          if (pl.latch && pr && !S.latched[pl.id]) { S.latched[pl.id] = true; changed = true; }
          if (!!S.pressed[pl.id] !== pr) { S.pressed[pl.id] = pr; changed = true; }
          if ((S.counts[pl.id] || 0) !== count) { S.counts[pl.id] = count; changed = true; }
        });
        // llave de alguien que se desconectó: vuelve a su lugar
        if (S.key.holder && !H.online(S.key.holder)) {
          S.key.holder = null; S.key.x = Lv.key.c * T + 4; S.key.y = Lv.key.r * T + 4; changed = true;
        }
        // ¿entraron todos?
        var active = S.players.filter(function (p) { return H.online(p.id); });
        if (S.door && active.length && active.every(function (p) { return S.inDoor.indexOf(p.id) >= 0; })) { win(H); return; }
        if (moved) S.boxes = hbox.map(function (b) { return [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10]; });
        if (moved || changed) S.pushers = hbox.map(function (b) { return b.pushers || 0; });
        if (changed || (moved && tick % 2 === 0)) H.publish();
      }
      function win(H) {
        var S = H.S;
        S.phase = 'win';
        S.lastTime = Date.now() - S.levelStart;
        H.publish();
        H.later('next', 2600, function () {
          if (S.li + 1 < C.LEVELS.length) startLevel(H, S.li + 1);
          else { S.phase = 'over'; S.total = Date.now() - S.t0; H.publish(); }
        });
      }
      function near(q, x, y, w, h, tol) {
        return q && q.x + PW > x - tol && q.x < x + w + tol && q.y + PH > y - tol && q.y < y + h + tol;
      }

      var ro = null, hudKey = '';
      document.addEventListener('keydown', kd);
      document.addEventListener('keyup', ku);
      window.addEventListener('resize', resize);
      // ganchos para pruebas automáticas
      window.__coop = {
        tp: function (x, y) { if (me) { me.x = x; me.y = y; me.vx = 0; me.vy = 0; } },
        me: function () { return me && { x: me.x, y: me.y, g: me.onGround }; },
        state: function () { return cur; }
      };

      return SyncGame(api, {
        wait: {
          emoji: '🗝️', title: 'Todos a la Puerta', min: 2, max: 8,
          sub: 'Plataformas en equipo. Consigan la llave, abran la puerta y <b>entren todos</b>. Para llegar alto, súbanse a la cabeza de un compañero; ' +
            'algunos botones necesitan a varios parados encima y las cajas pesadas se empujan entre varios.<br>' + C.LEVELS.length + ' niveles.',
          options: [{ key: 'from', label: 'Empezar en el nivel', value: 0, choices: C.LEVELS.map(function (l, i) { return [i, String(i + 1)]; }) }]
        },
        start: function (H, vals, players) {
          H.set({ phase: 'play', players: players, li: null, lseq: 0, deaths: 0, t0: Date.now(), counts: {} });
          ensureLoop(H);
          startLevel(H, Math.max(0, Math.min(C.LEVELS.length - 1, vals.from | 0)));
        },
        resume: function (H) { rebuildBoxes(H.S); ensureLoop(H); if (H.S.phase === 'win') H.later('next', 1500, function () { startLevel(H, Math.min(C.LEVELS.length - 1, H.S.li + 1)); }); },
        adopt: function (H) {
          // no hay secretos: el nuevo anfitrión sigue la partida desde donde estaba
          rebuildBoxes(H.S); hpos = {}; ensureLoop(H);
          if (H.S.phase === 'win') H.later('next', 1500, function () { startLevel(H, Math.min(C.LEVELS.length - 1, H.S.li + 1)); });
          H.publish();
          return true;
        },
        action: function (H, from, d) {
          var S = H.S;
          if (d.type === 'restart' && from === api.me) { H.cancel('next'); startLevel(H, S.li); return; }
          if (d.type === 'skip' && from === api.me) {
            H.cancel('next');
            if (S.li + 1 < C.LEVELS.length) startLevel(H, S.li + 1); else { S.phase = 'over'; S.total = Date.now() - S.t0; H.publish(); }
            return;
          }
          if (S.phase !== 'play' || d.ls !== S.lseq) return;
          var Lv = C.LEVELS[S.li], q = hpos[from];
          var dr = Lv.door, dx = dr.c * T, dy = (dr.r - 1) * T;
          if (d.type === 'grab') {
            if (S.key.holder || S.key.used || !near(q, S.key.x, S.key.y, 24, 24, 30)) return;
            S.key.holder = from; H.publish();
          } else if (d.type === 'unlock') {
            if (S.key.holder !== from || S.door || !near(q, dx, dy, T, 2 * T, 30)) return;
            S.door = true; S.key.holder = null; S.key.used = true; H.publish();
          } else if (d.type === 'enter') {
            if (!S.door || S.inDoor.indexOf(from) >= 0 || !near(q, dx, dy, T, 2 * T, 30)) return;
            S.inDoor.push(from); H.publish();
          } else if (d.type === 'exit') {
            var k = S.inDoor.indexOf(from);
            if (k >= 0) { S.inDoor.splice(k, 1); H.publish(); }
          } else if (d.type === 'died') {
            S.deaths = (S.deaths || 0) + 1;
          }
        },
        onRaw: function (from, d, V) {
          if (d.type !== 'p') return;
          // el anfitrión anota dónde está cada uno (botones, cajas)
          if (V.isHost() && Href && Href.S && d.ls === Href.S.lseq) hpos[from] = { x: d.x, y: d.y, hd: d.hd || 0, at: Date.now() };
          if (from === api.me || d.ls !== lseq) return;
          var m = mates[from];
          if (!m) return;
          var now = performance.now(), sample = now - d.t;
          if (m.off === null || sample < m.off) m.off = sample; else m.off += (sample - m.off) * 0.02;
          m.jit = m.jit * 0.9 + Math.abs(sample - m.off) * 0.1;
          if (m.buf.length && d.t <= m.buf[m.buf.length - 1].t) return;
          m.buf.push({ t: d.t, x: d.x, y: d.y, f: d.f, g: d.g });
          if (m.buf.length > 40) m.buf.splice(0, m.buf.length - 40);
        },
        onState: function (V, prev, s) {
          cur = s;
          if (s.phase === 'wait' || !s.players) return;
          if (s.li == null) return;
          if (s.lseq !== lseq) enterLevel(s);
          on = C.linkState(L, pressedOf(s));
          var now = performance.now();
          (s.boxes || []).forEach(function (b, i) {
            var bv = boxView[i];
            if (!bv) return;
            bv.buf.push({ t: now, x: b[0], y: b[1] });
            if (bv.buf.length > 12) bv.buf.shift();
          });
          myIn = s.inDoor.indexOf(api.me) >= 0;
          if (prev && prev.door !== s.door && s.door) api.vibrate([40, 30, 40]);
        },
        render: function (V, s) {
          cur = s;
          var el = V.el;
          if (s.phase === 'over') {
            stopDraw(); canvas = null;
            el.innerHTML = '<div class="wait"><div class="card" style="text-align:center"><div style="font-size:54px">🏆</div>' +
              '<p style="font-size:22px;font-weight:900;margin:6px 0">¡Lo lograron!</p>' +
              '<p class="hint" style="margin:0">Tiempo total: ' + fmtTime(s.total || 0) + ' · Caídas: ' + (s.deaths || 0) + '</p>' + V.endButtons('Jugar de nuevo') + '</div></div>';
            return;
          }
          if (s.li == null) return;
          if (!canvas || !el.contains(canvas)) buildUi(V);
          hud(V, s);
        },
        destroy: function () {
          stopDraw();
          if (hostIv) clearInterval(hostIv);
          document.removeEventListener('keydown', kd);
          document.removeEventListener('keyup', ku);
          window.removeEventListener('resize', resize);
          if (ro) ro.disconnect();
        }
      });

      // ================================================ nivel local
      function enterLevel(s) {
        lseq = s.lseq;
        L = C.LEVELS[s.li];
        myIdx = -1;
        s.players.forEach(function (p, i) { if (p.id === api.me) myIdx = i; });
        var sp = C.spawnPos(L, Math.max(0, myIdx));
        me = myIdx >= 0 ? C.newPlayer(sp.x, sp.y) : null;
        mates = {};
        s.players.forEach(function (p, i) {
          if (p.id === api.me) return;
          var q = C.spawnPos(L, i);
          mates[p.id] = { buf: [], off: null, jit: 0, x: q.x, y: q.y, px: q.x, py: q.y, f: 1, color: p.color, name: p.name };
        });
        boxView = L.boxes.map(function (b, i) {
          var p = s.boxes && s.boxes[i] ? s.boxes[i] : [b.c * T, b.r * T];
          return { buf: [{ t: performance.now() - 1000, x: p[0], y: p[1] }], x: p[0], y: p[1], px: p[0], py: p[1], w: b.w * T, h: b.h * T };
        });
        bgKey = '';
        lastT = 0;
      }

      // ================================================ interfaz
      function buildUi(V) {
        var el = V.el;
        el.onclick = null;
        el.innerHTML = '<div id="co-sb"></div><div class="co-head"><div id="co-title"></div><div id="co-tools"></div></div><div id="co-hint" class="co-hint"></div>' +
          '<div style="flex:1;min-height:0;position:relative;overflow:hidden" id="co-wrap"><canvas class="arena" id="co-c"></canvas>' +
          '<button class="btn co-door" id="co-door" style="display:none"></button><div id="co-ov"></div></div>' +
          '<div class="pad" id="co-pad"><button data-k="l" style="background:#3b4d8f"><span class="ic">◀</span></button>' +
          '<button data-k="r" style="background:#3b4d8f"><span class="ic">▶</span></button>' +
          '<button data-k="j" style="background:#2f7a55;flex:1.3"><span class="ic">⤒</span>Saltar</button></div>';
        canvas = el.querySelector('#co-c');
        ctx = canvas.getContext('2d');
        setupPad(V);
        el.querySelector('#co-door').addEventListener('pointerdown', function (e) {
          e.preventDefault();
          if (myIn) act(V, 'exit'); else act(V, 'enter', null, 300);
        });
        el.querySelector('#co-tools').onclick = function (e) {
          var b = e.target.closest('[data-t]');
          if (!b) return;
          var t = b.getAttribute('data-t');
          if (t === 'restart' || t === 'skip') {
            if (b.getAttribute('data-sure') !== '1') { b.setAttribute('data-sure', '1'); api.toast(t === 'restart' ? 'Tocá de nuevo para reiniciar el nivel' : 'Tocá de nuevo para saltar el nivel'); return; }
            V.act({ type: t });
          }
        };
        el.querySelector('#co-hint').onclick = function () { hideHint[lseq] = true; this.style.display = 'none'; };
        if (window.ResizeObserver) { if (ro) ro.disconnect(); ro = new ResizeObserver(resize); ro.observe(el.querySelector('#co-wrap')); }
        resize();
        startDraw(V);
      }
      function hud(V, s) {
        var el = V.el;
        var items = s.players.map(function (p) {
          var inD = s.inDoor.indexOf(p.id) >= 0;
          return { id: p.id, name: p.name, color: p.color, score: '', mark: (s.key.holder === p.id ? '🗝️' : '') + (inD ? '🚪' : '') };
        });
        var k = JSON.stringify([s.li, s.phase, s.inDoor, s.key.holder, s.door, V.isHost(), items.map(function (i) { return i.name; })]);
        if (k === hudKey) return;
        hudKey = k;
        el.querySelector('#co-sb').innerHTML = App.scoreStrip(items, s.inDoor.length + '/' + s.players.length + ' 🚪');
        el.querySelector('#co-title').innerHTML = 'Nivel ' + (s.li + 1) + '/' + C.LEVELS.length + ' · <b>' + V.esc(L.name) + '</b>';
        el.querySelector('#co-tools').innerHTML = V.isHost() ? '<button class="iconbtn" data-t="restart" title="Reiniciar nivel">↺</button><button class="iconbtn" data-t="skip" title="Saltar nivel">⏭</button>' : '';
        var h = el.querySelector('#co-hint');
        h.textContent = '💡 ' + L.hint + '  ✕';
        h.style.display = hideHint[lseq] ? 'none' : '';
        var ov = el.querySelector('#co-ov');
        ov.innerHTML = s.phase === 'win' ? '<div class="overlay" style="background:#0b1020cc"><div style="font-size:52px">🎉</div><h3>¡Nivel superado!</h3><p>' +
          fmtTime(s.lastTime || 0) + (s.li + 1 < C.LEVELS.length ? ' · siguiente nivel…' : '') + '</p></div>' : '';
      }

      function setupPad(V) {
        held = { l: {}, r: {} };
        Array.prototype.forEach.call(V.el.querySelectorAll('#co-pad button'), function (b) {
          var k = b.getAttribute('data-k');
          b.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            try { b.setPointerCapture(e.pointerId); } catch (x) { }
            b.classList.add('held');
            if (k === 'j') { jumpQ = true; return; }
            held[k][e.pointerId] = 1;
          });
          function up(e) { b.classList.remove('held'); if (k !== 'j') delete held[k][e.pointerId]; }
          b.addEventListener('pointerup', up);
          b.addEventListener('pointercancel', up);
          b.addEventListener('lostpointercapture', up);
          b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        });
      }
      function key(e, down) {
        if (!canvas) return;
        var k = e.key;
        if (k === 'ArrowLeft' || k === 'a') { if (down) held.l.kb = 1; else delete held.l.kb; }
        else if (k === 'ArrowRight' || k === 'd') { if (down) held.r.kb = 1; else delete held.r.kb; }
        else if ((k === ' ' || k === 'ArrowUp' || k === 'w') && down && !e.repeat) jumpQ = true;
        else if ((k === 'Enter' || k === 'e') && down && !e.repeat) { var b = api.el.querySelector('#co-door'); if (b && b.style.display !== 'none') b.dispatchEvent(new Event('pointerdown')); }
        else return;
        e.preventDefault();
      }
      function kd(e) { key(e, true); }
      function ku(e) { key(e, false); }

      function resize() {
        if (!canvas || !api.el.contains(canvas)) return;
        var wrap = api.el.querySelector('#co-wrap');
        var land = window.innerWidth > window.innerHeight;
        api.el.classList.toggle('co-land', land);
        var w = wrap.clientWidth, h = wrap.clientHeight;
        // mostrar todo el alto del nivel o, si queda chico, acercar (la cámara sigue al personaje)
        scale = Math.max(h / (C.ROWS * T), w / ((land ? 22 : 12) * T));
        dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
        canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
        bgKey = '';
      }

      function startDraw(V) { stopDraw(); (function loop() { raf = requestAnimationFrame(loop); try { frame(V); } catch (e) { console.error(e); } })(); }
      function stopDraw() { if (raf) cancelAnimationFrame(raf); raf = null; }

      // ================================================ cada cuadro
      function frame(V) {
        if (!canvas || !cur || !L || cur.li == null) return;
        var now = performance.now();
        var dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0;
        lastT = now;
        // compañeros (posición suavizada)
        var mateList = [];
        Object.keys(mates).forEach(function (id) {
          var m = mates[id];
          m.px = m.x; m.py = m.y;
          if (m.off !== null && m.buf.length) {
            var rt = now - m.off - Math.min(200, 60 + m.jit * 2.5);
            while (m.buf.length > 1 && m.buf[1].t <= rt) m.buf.shift();
            var a = m.buf[0], b = m.buf[1];
            if (b && rt > a.t) { var f = clamp((rt - a.t) / (b.t - a.t), 0, 1); m.x = a.x + (b.x - a.x) * f; m.y = a.y + (b.y - a.y) * f; m.f = b.f; }
            else { m.x = a.x; m.y = a.y; m.f = a.f; }
          }
          m.inDoor = cur.inDoor.indexOf(id) >= 0;
          if (!m.inDoor) mateList.push({ id: id, x: m.x, y: m.y, w: PW, h: PH, dx: m.x - m.px, dy: m.y - m.py });
        });
        // cajas (posición suavizada)
        var boxList = boxView.map(function (bv, i) {
          bv.px = bv.x; bv.py = bv.y;
          var rt = now - 90;
          while (bv.buf.length > 1 && bv.buf[1].t <= rt) bv.buf.shift();
          var a = bv.buf[0], b = bv.buf[1];
          if (b && rt > a.t) { var f = clamp((rt - a.t) / (b.t - a.t), 0, 1); bv.x = a.x + (b.x - a.x) * f; bv.y = a.y + (b.y - a.y) * f; }
          else { bv.x = a.x; bv.y = a.y; }
          return { i: i, x: bv.x, y: bv.y, w: bv.w, h: bv.h, dx: bv.x - bv.px, dy: bv.y - bv.py };
        });
        // mi personaje
        var atDoor = false;
        if (me && cur.phase === 'play' && !myIn && dt > 0) {
          var inp = { l: Object.keys(held.l).length > 0, r: Object.keys(held.r).length > 0, jump: jumpQ };
          holdDir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
          jumpQ = false;
          C.stepPlayer(L, on, me, inp, dt, mateList, boxList);
          if (me.dead) {
            var sp = C.spawnPos(L, myIdx);
            var keepFacing = me.facing;
            me = C.newPlayer(sp.x, sp.y); me.facing = keepFacing;
            act(V, 'died');
            api.vibrate(150);
          }
          // llave, puerta
          var k = cur.key;
          if (!k.holder && !k.used && C.overlap(me, { x: k.x, y: k.y, w: 24, h: 24 })) act(V, 'grab', null, 400);
          var dr = L.door, drect = { x: dr.c * T, y: (dr.r - 1) * T, w: T, h: 2 * T };
          var touching = C.overlap(me, { x: drect.x - 6, y: drect.y, w: drect.w + 12, h: drect.h });
          if (k.holder === api.me && !cur.door && touching) act(V, 'unlock', null, 400);
          atDoor = cur.door && touching;
        } else jumpQ = false;
        if (me && now - lastSend >= SEND_MS) {
          lastSend = now;
          api.toAll({ type: 'p', ls: lseq, t: Math.round(now), x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, f: me.facing, hd: myIn ? 0 : holdDir, g: me.onGround ? 1 : 0 });
        }
        var db = api.el.querySelector('#co-door');
        if (db) {
          var show = cur.phase === 'play' && (myIn || atDoor);
          var txt = myIn ? '🚪 Salir de la puerta' : '🚪 Entrar';
          if ((db.style.display !== 'none') !== show) db.style.display = show ? '' : 'none';
          if (db.textContent !== txt) db.textContent = txt;
        }
        draw(now);
      }

      // ================================================ dibujo
      function camX(viewW) {
        var lw = L.W * T;
        if (lw <= viewW) return (lw - viewW) / 2;
        var cx = me ? me.x + PW / 2 : lw / 2;
        if (!me) {
          // si estoy mirando: seguir al promedio de los demás
          var xs = Object.keys(mates).map(function (id) { return mates[id].x; });
          if (xs.length) cx = xs.reduce(function (a, b) { return a + b; }, 0) / xs.length;
        }
        return clamp(cx - viewW / 2, 0, lw - viewW);
      }
      function staticLayer() {
        var key = lseq + '|' + canvas.height + '|' + scale;
        if (bgKey === key) return bg;
        bgKey = key;
        var s = scale * dpr;
        bg = document.createElement('canvas');
        bg.width = Math.ceil(L.W * T * s); bg.height = Math.ceil(C.ROWS * T * s);
        var c = bg.getContext('2d');
        c.setTransform(s, 0, 0, s, 0, 0);
        for (var r = 0; r < C.ROWS; r++) for (var x = 0; x < L.W; x++) {
          var ch = L.g[r][x];
          if (ch === '#') {
            var top = r === 0 || L.g[r - 1][x] !== '#';
            c.fillStyle = r >= C.FLOOR + 1 ? '#2a3466' : '#3b4a8f';
            c.fillRect(x * T, r * T, T, T);
            c.strokeStyle = '#00000022'; c.lineWidth = 1; c.strokeRect(x * T + 0.5, r * T + 0.5, T - 1, T - 1);
            if (top) { c.fillStyle = '#7d92e6'; c.fillRect(x * T, r * T, T, 5); }
          } else if (ch === '^') {
            c.fillStyle = '#d7dcf5';
            for (var k = 0; k < 4; k++) {
              c.beginPath(); c.moveTo(x * T + k * 8, r * T + T); c.lineTo(x * T + k * 8 + 4, r * T + T / 2); c.lineTo(x * T + k * 8 + 8, r * T + T); c.fill();
            }
          }
        }
        return bg;
      }
      function camY(viewH) {
        var lh = C.ROWS * T;
        if (viewH >= lh) return lh - viewH;
        var fy = me ? me.y + PH / 2 : (C.FLOOR - 3) * T;
        return clamp(fy - viewH * 0.5, 0, lh - viewH);
      }
      function draw(now) {
        var c = ctx, cw = canvas.width, ch = canvas.height, s = scale * dpr;
        var viewW = cw / s, viewH = ch / s;
        var cx = camX(viewW), cy = camY(viewH);
        c.setTransform(1, 0, 0, 1, 0, 0);
        var g = c.createLinearGradient(0, 0, 0, ch);
        g.addColorStop(0, '#1d2a5c'); g.addColorStop(1, '#0d1330');
        c.fillStyle = g; c.fillRect(0, 0, cw, ch);
        // estrellas con un poco de paralaje
        c.fillStyle = '#ffffff30';
        for (var i = 0; i < 40; i++) {
          var sx = ((i * 197 - cx * s * 0.3) % cw + cw) % cw, sy = (i * 89) % (ch * 0.6);
          c.fillRect(sx, sy, 2, 2);
        }
        c.drawImage(staticLayer(), -cx * s, -cy * s);
        c.setTransform(s, 0, 0, s, -cx * s, -cy * s);
        var t = now / 1000;
        // puentes y compuertas
        for (var r = 0; r < C.ROWS; r++) for (var x = Math.max(0, Math.floor(cx / T)); x < Math.min(L.W, Math.ceil((cx + viewW) / T) + 1); x++) {
          var chh = L.g[r][x], link = L.links[chh];
          if (!link) continue;
          var col = PLATE_COLORS[link.plates[0]] || '#fff';
          var solid = C.tileSolid(L, on, x, r);
          if (link.kind === 'bridge') {
            if (solid) {
              c.fillStyle = '#b8753a'; c.fillRect(x * T, r * T + 2, T, T - 4);
              c.fillStyle = '#d99a55'; c.fillRect(x * T, r * T + 2, T, 5);
              c.strokeStyle = '#6e4220'; c.lineWidth = 2; c.strokeRect(x * T + 1, r * T + 3, T - 2, T - 6);
            } else {
              c.strokeStyle = col + '88'; c.lineWidth = 2; c.setLineDash([5, 5]);
              c.strokeRect(x * T + 3, r * T + 3, T - 6, T - 6); c.setLineDash([]);
            }
          } else {
            if (solid) {
              c.fillStyle = '#4a5170'; c.fillRect(x * T + 4, r * T, T - 8, T);
              c.fillStyle = '#8a93b8';
              for (var bx = 0; bx < 3; bx++) c.fillRect(x * T + 7 + bx * 7, r * T, 3, T);
              c.fillStyle = col; c.fillRect(x * T + 4, r * T + T / 2 - 2, T - 8, 4);
            } else {
              c.strokeStyle = col + '55'; c.lineWidth = 2; c.setLineDash([4, 6]);
              c.strokeRect(x * T + 5, r * T + 1, T - 10, T - 2); c.setLineDash([]);
            }
          }
        }
        // botones
        var n = 0;
        cur.players.forEach(function () { n++; });
        L.plates.forEach(function (pl) {
          var col = PLATE_COLORS[pl.id] || '#fff';
          var pressed = !!(cur.pressed[pl.id] || cur.latched[pl.id]);
          var x0 = pl.c * T + 3, w = pl.w * T - 6, top = (pl.r + 1) * T;
          c.fillStyle = '#00000055'; c.fillRect(x0, top - 3, w, 3);
          c.fillStyle = col; c.fillRect(x0 + 2, top - (pressed ? 3 : 8), w - 4, pressed ? 3 : 8);
          if (pressed) { c.shadowColor = col; c.shadowBlur = 12; c.fillRect(x0 + 2, top - 3, w - 4, 3); c.shadowBlur = 0; }
          var need = C.needOf(pl.need, n);
          c.font = '800 13px ui-rounded, system-ui, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff';
          c.fillText(cur.latched[pl.id] ? '✔' : ((cur.counts && cur.counts[pl.id]) || 0) + '/' + need + ' 👤', pl.c * T + pl.w * T / 2, top - 14);
        });
        // cajas
        boxView.forEach(function (bv, i) {
          var Lb = L.boxes[i];
          c.fillStyle = '#9b6a35'; c.fillRect(bv.x, bv.y, bv.w, bv.h);
          c.strokeStyle = '#5e3c1a'; c.lineWidth = 4; c.strokeRect(bv.x + 2, bv.y + 2, bv.w - 4, bv.h - 4);
          c.beginPath(); c.moveTo(bv.x + 4, bv.y + 4); c.lineTo(bv.x + bv.w - 4, bv.y + bv.h - 4); c.moveTo(bv.x + bv.w - 4, bv.y + 4); c.lineTo(bv.x + 4, bv.y + bv.h - 4); c.stroke();
          var need = C.needOf(Lb.need, n), pushers = (cur.pushers && cur.pushers[i]) || 0;
          c.fillStyle = '#000a'; c.fillRect(bv.x + bv.w / 2 - 26, bv.y + bv.h / 2 - 12, 52, 24);
          c.fillStyle = pushers >= need ? '#3ddc84' : '#fff'; c.font = '900 14px ui-rounded, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText((pushers ? pushers + '/' : '') + need + ' 👤', bv.x + bv.w / 2, bv.y + bv.h / 2 + 1);
          c.textBaseline = 'alphabetic';
        });
        // puerta
        var dr = L.door, dx = dr.c * T, dy = (dr.r - 1) * T;
        c.fillStyle = '#5e3a1a'; c.fillRect(dx - 4, dy - 4, T + 8, 2 * T + 4);
        if (cur.door) {
          c.fillStyle = '#05070f'; c.fillRect(dx, dy, T, 2 * T);
          var gl = c.createLinearGradient(dx, dy, dx, dy + 2 * T); gl.addColorStop(0, '#ffd23f33'); gl.addColorStop(1, '#ffd23f00');
          c.fillStyle = gl; c.fillRect(dx, dy, T, 2 * T);
        } else {
          c.fillStyle = '#a8743c'; c.fillRect(dx, dy, T, 2 * T);
          c.fillStyle = '#ffd23f'; c.fillRect(dx + T / 2 - 4, dy + T - 4, 8, 10);
          c.fillStyle = '#5e3a1a'; c.fillRect(dx + T / 2 - 1, dy + T, 2, 4);
        }
        c.font = '800 13px ui-rounded, system-ui, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff';
        c.fillText(cur.inDoor.length + '/' + cur.players.length, dx + T / 2, dy - 10);
        // llave
        var k = cur.key;
        if (!k.used) {
          var kx = k.x, ky = k.y + Math.sin(t * 3) * 3;
          if (k.holder) {
            var hp = k.holder === api.me ? me : mates[k.holder];
            if (hp) { kx = hp.x + PW / 2 - 12; ky = hp.y - 26; }
          }
          drawKey(c, kx, ky);
        }
        // compañeros y yo
        cur.players.forEach(function (p) {
          if (p.id === api.me) return;
          var m = mates[p.id];
          if (!m || m.inDoor) return;
          drawGuy(c, m.x, m.y, p.color, m.f || 1, false, p.name, t);
        });
        if (me && !myIn) drawGuy(c, me.x, me.y, cur.players[myIdx].color, me.facing, true, null, t);
        // indicadores de los que están fuera de la pantalla
        c.setTransform(s, 0, 0, s, 0, 0);
        cur.players.forEach(function (p) {
          if (p.id === api.me) return;
          var m = mates[p.id];
          if (!m || m.inDoor) return;
          var sx = m.x - cx;
          if (sx > -PW && sx < viewW) return;
          var left = sx <= -PW, ax = left ? 10 : viewW - 10, ay = clamp(m.y + PH / 2 - cy, 20, viewH - 20);
          c.fillStyle = p.color;
          c.beginPath();
          if (left) { c.moveTo(ax - 6, ay); c.lineTo(ax + 6, ay - 8); c.lineTo(ax + 6, ay + 8); }
          else { c.moveTo(ax + 6, ay); c.lineTo(ax - 6, ay - 8); c.lineTo(ax - 6, ay + 8); }
          c.fill();
        });
      }
      function drawKey(c, x, y) {
        c.save();
        c.shadowColor = '#ffd23f'; c.shadowBlur = 10;
        c.fillStyle = '#ffd23f';
        c.beginPath(); c.arc(x + 7, y + 12, 7, 0, Math.PI * 2); c.fill();
        c.fillRect(x + 12, y + 10, 12, 4); c.fillRect(x + 19, y + 14, 3, 5); c.fillRect(x + 15, y + 14, 3, 4);
        c.shadowBlur = 0;
        c.fillStyle = '#0d1330'; c.beginPath(); c.arc(x + 7, y + 12, 3, 0, Math.PI * 2); c.fill();
        c.restore();
      }
      function drawGuy(c, x, y, color, facing, isMe, name, t) {
        // cuerpo
        c.fillStyle = '#00000044'; c.fillRect(x + 2, y + PH - 2, PW, 3);
        c.fillStyle = color;
        var r = 7;
        c.beginPath();
        c.moveTo(x + r, y); c.arcTo(x + PW, y, x + PW, y + PH, r); c.arcTo(x + PW, y + PH, x, y + PH, 4);
        c.arcTo(x, y + PH, x, y, 4); c.arcTo(x, y, x + PW, y, r); c.closePath(); c.fill();
        c.strokeStyle = '#0006'; c.lineWidth = 1.5; c.stroke();
        // antena
        c.strokeStyle = color; c.lineWidth = 2;
        c.beginPath(); c.moveTo(x + PW / 2, y); c.lineTo(x + PW / 2 + facing * 3, y - 7); c.stroke();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(x + PW / 2 + facing * 3, y - 8, 2.5, 0, Math.PI * 2); c.fill();
        // ojos
        var ex = x + PW / 2 + facing * 3;
        c.fillStyle = '#fff';
        c.beginPath(); c.arc(ex - 4, y + 10, 3.5, 0, Math.PI * 2); c.arc(ex + 4, y + 10, 3.5, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#111';
        c.beginPath(); c.arc(ex - 4 + facing * 1.4, y + 10.5, 1.8, 0, Math.PI * 2); c.arc(ex + 4 + facing * 1.4, y + 10.5, 1.8, 0, Math.PI * 2); c.fill();
        if (isMe) {
          c.fillStyle = '#fff'; c.font = '900 10px ui-rounded, system-ui, sans-serif'; c.textAlign = 'center';
          c.beginPath(); c.moveTo(x + PW / 2 - 5, y - 16); c.lineTo(x + PW / 2 + 5, y - 16); c.lineTo(x + PW / 2, y - 11); c.fill();
          c.fillText('VOS', x + PW / 2, y - 19);
        } else if (name) {
          c.fillStyle = '#ffffffbb'; c.font = '700 9px ui-rounded, system-ui, sans-serif'; c.textAlign = 'center';
          c.fillText(name.slice(0, 8), x + PW / 2, y - 13);
        }
      }

    }
  });

  var css = document.createElement('style');
  css.textContent =
    '.co-head{display:flex;align-items:center;gap:8px;padding:0 12px 2px}' +
    '#co-title{flex:1;font-size:14px;font-weight:700;color:var(--muted)}' +
    '#co-title b{color:var(--text)}' +
    '#co-tools{display:flex;gap:6px}' +
    '#co-tools .iconbtn{height:30px;min-width:30px;font-size:14px;padding:0 8px}' +
    '.co-hint{font-size:12.5px;color:var(--muted);padding:0 12px 6px;line-height:1.3;cursor:pointer}' +
    '.co-door{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:4;padding:10px 16px;font-size:16px}' +
    '#co-wrap canvas{border-radius:0}' +
    // horizontal: botones flotando sobre el juego
    '.co-land #co-hint{display:none}' +
    '.co-land #co-pad{position:absolute;left:0;right:0;bottom:0;background:transparent;pointer-events:none;padding:0 10px calc(8px + var(--safe-b))}' +
    '.co-land #co-pad button{pointer-events:auto;flex:none!important;width:84px;height:62px;opacity:.82}' +
    '.co-land #co-pad button[data-k=j]{margin-left:auto;width:118px}';
  document.head.appendChild(css);
})();
