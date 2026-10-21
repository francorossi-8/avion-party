/* Dibujá y adiviná: uno dibuja, los demás adivinan escribiendo. Los trazos van directo a todos
   (sin pasar por el anfitrión) para que se vean en vivo. 2 a 8. */
(function () {
  'use strict';
  var U = window.SyncUtil;
  // las palabras están en palabras.js (compartidas con el Teléfono descompuesto)
  var WORDS = (window.PALABRAS && window.PALABRAS.dibujar) || ['casa', 'perro', 'gato', 'avión', 'sol', 'luna', 'árbol', 'flor'];
  var COLORS = ['#111111', '#ffffff', '#ff5d6c', '#ff9f43', '#ffd23f', '#3ddc84', '#4fb3ff', '#c77dff', '#8b5a2b'];
  var SIZES = [4, 9, 18];
  var SZ = 600, CHOOSE_MS = 15000, DRAW_MS = 80000, REVEAL_MS = 4000;

  function lev(a, b) {
    var m = a.length, n = b.length, d = [];
    for (var i = 0; i <= m; i++) { d[i] = [i]; }
    for (var j = 1; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function hintOf(word, shown) {
    return word.split('').map(function (ch, i) { return ch === ' ' ? '  ' : (shown.indexOf(i) >= 0 ? ch.toUpperCase() : '_'); }).join(' ');
  }

  App.register({
    id: 'dibuja', name: 'Dibujá y adiviná', emoji: '🎨', players: '2-8',
    desc: 'Uno dibuja, los demás adivinan por escrito.',
    create: function (api) {
      // trazos del turno actual (todos los guardan; el anfitrión los reenvía a quien se reconecta)
      var strokes = [], strokesTurn = -1;
      var tool = { c: COLORS[0], w: SIZES[1] };
      var drawing = null, pendingPts = [], flushT = null;
      var canvas = null, ctx = null, cscale = 1, layoutKey = '';
      var logShown = 0;

      // ------------------------------------------------ anfitrión
      function nextTurn(H) {
        var S = H.S, P = H.P;
        S.turnIdx++;
        if (S.turnIdx >= S.order.length * S.rounds) { S.phase = 'over'; H.deadline(null); H.publish(); return; }
        S.turnId++;
        S.drawer = S.order[S.turnIdx % S.order.length];
        if (!H.online(S.drawer)) { nextTurn(H); return; }
        S.stage = 'choose';
        S.guessed = []; S.hint = ''; S.word = null; S.log = [];
        var pool = U.shuffle(WORDS.filter(function (w) { return P.used.indexOf(w) < 0; }));
        P.options = pool.slice(0, 3);
        P.word = null; P.near = {};
        H.deadline(CHOOSE_MS);
        H.later('choose', CHOOSE_MS, function () { pick(H, P.options[0]); });
        H.publish();
      }
      function pick(H, word) {
        var S = H.S, P = H.P;
        if (S.stage !== 'choose') return;
        H.cancel('choose');
        P.word = word; P.used.push(word); P.shown = [];
        S.stage = 'draw';
        S.hint = hintOf(word, []);
        S.drawStart = Date.now();
        H.deadline(DRAW_MS);
        H.later('end', DRAW_MS, function () { reveal(H); });
        H.later('h1', DRAW_MS * 0.5, function () { addHint(H); });
        H.later('h2', DRAW_MS * 0.75, function () { addHint(H); });
        H.publish();
      }
      function addHint(H) {
        var S = H.S, P = H.P;
        if (S.stage !== 'draw' || !P.word) return;
        var idx = [];
        P.word.split('').forEach(function (ch, i) { if (ch !== ' ' && P.shown.indexOf(i) < 0) idx.push(i); });
        if (idx.length <= 2) return;
        P.shown.push(idx[Math.floor(Math.random() * idx.length)]);
        S.hint = hintOf(P.word, P.shown);
        H.publish();
      }
      function reveal(H) {
        var S = H.S, P = H.P;
        if (S.stage !== 'draw') return;
        ['end', 'h1', 'h2'].forEach(H.cancel);
        S.stage = 'reveal';
        S.word = P.word;
        H.deadline(REVEAL_MS);
        H.later('next', REVEAL_MS, function () { nextTurn(H); });
        H.publish();
      }

      // re-medir el lienzo cuando cambia el espacio (teclado, giro, marcador)
      window.addEventListener('resize', onResize);
      var ro = window.ResizeObserver ? new ResizeObserver(function () { onResize(); }) : null;
      if (ro) ro.observe(api.el);

      return SyncGame(api, {
        wait: {
          emoji: '🎨', title: 'Dibujá y adiviná', min: 2, max: 8,
          sub: 'Por turnos, uno elige una palabra y la dibuja. Los demás escriben lo que creen que es: cuanto más rápido adivinás, más puntos. ' +
            'El que dibuja suma por cada uno que adivina.',
          options: [{ key: 'rounds', label: 'Vueltas', value: 2, choices: [[1, '1'], [2, '2'], [3, '3']] }]
        },
        start: function (H, vals, players) {
          var scores = {};
          players.forEach(function (p) { scores[p.id] = 0; });
          H.set({ phase: 'play', players: players, order: U.shuffle(players.map(function (p) { return p.id; })), rounds: vals.rounds || 2,
            turnIdx: -1, turnId: 0, scores: scores, guessed: [], log: [] }, { used: [] });
          nextTurn(H);
        },
        action: function (H, from, d) {
          var S = H.S, P = H.P;
          if (d.type === 'pick' && from === S.drawer && S.stage === 'choose' && P.options.indexOf(d.word) >= 0) { pick(H, d.word); return; }
          if (d.type === 'skip' && from === api.me && S.stage !== 'reveal') { if (S.stage === 'choose') pick(H, P.options[0]); reveal(H); return; }
          if (d.type === 'guess' && S.stage === 'draw' && from !== S.drawer && S.guessed.indexOf(from) < 0) {
            var t = String(d.text || '').slice(0, 40).trim();
            if (!t) return;
            var g = U.norm(t), w = U.norm(P.word);
            if (g === w) {
              S.guessed.push(from);
              var left = Math.max(0, H.timeLeft() || 0) / DRAW_MS;
              var pts = 50 + Math.round(50 * left) - (S.guessed.length - 1) * 5;
              S.scores[from] += Math.max(20, pts);
              S.scores[S.drawer] += 15;
              S.log.push({ id: from, ok: true });
              var rest = S.players.filter(function (p) { return p.id !== S.drawer && H.online(p.id); });
              if (rest.every(function (p) { return S.guessed.indexOf(p.id) >= 0; })) { reveal(H); return; }
            } else {
              if (w.length > 3 && lev(g, w) <= 1) P.near[from] = t;
              S.log.push({ id: from, text: t });
            }
            if (S.log.length > 40) S.log.splice(0, S.log.length - 40);
            H.publish();
          }
        },
        hostTick: function (H) {
          var S = H.S;
          if (S.phase === 'play' && S.stage !== 'reveal' && !H.online(S.drawer)) { if (S.stage === 'choose') { H.cancel('choose'); S.stage = 'draw'; } reveal(H); }
        },
        priv: function (S, P, id) {
          if (id === S.drawer) return { options: S.stage === 'choose' ? P.options : null, word: P.word };
          if (S.guessed.indexOf(id) >= 0) return { word: P.word };
          return { near: P.near ? P.near[id] || null : null };
        },
        resume: function (H) {
          var S = H.S;
          if (S.stage === 'choose') H.later('choose', 3000, function () { pick(H, H.P.options[0]); });
          if (S.stage === 'draw') H.later('end', Math.max(2000, H.timeLeft() || 2000), function () { reveal(H); });
          if (S.stage === 'reveal') H.later('next', 2000, function () { nextTurn(H); });
        },
        onSync: function (from, V) {
          if (V.cur) api.to(from, { type: 'dwall', t: strokesTurn, strokes: strokes });
        },
        onRaw: function (from, d, V) {
          var cur = V.cur;
          if (!cur) return;
          if (d.type === 'dwall') { if (d.t === cur.turnId) { strokes = d.strokes || []; strokesTurn = d.t; redrawAll(); } return; }
          if (from !== cur.drawer || from === api.me) return;
          ensureTurn(cur);
          if (d.t !== strokesTurn) return;
          if (d.type === 'dw') {
            var s = strokes[d.s] = strokes[d.s] || { c: d.c, w: d.w, p: [] };
            var start = s.p.length;
            for (var i = 0; i < d.p.length; i++) s.p.push(d.p[i]);
            drawStroke(s, Math.max(0, start - 2));
          } else if (d.type === 'dclr') { strokes = []; redrawAll(); }
          else if (d.type === 'dundo') { strokes.pop(); redrawAll(); }
        },
        onState: function (V, prev, cur) { if (cur.turnId !== strokesTurn) ensureTurn(cur); },
        tick: function (V) {
          var c = api.el.querySelector('#dj-clock');
          if (c) { var l = V.left(); c.textContent = l == null ? '' : Math.ceil(l / 1000) + 's'; }
        },
        render: function (V, cur, priv) {
          var el = V.el, me = V.me;
          ensureTurn(cur);
          var scoreBar = '<div class="scorebar" id="dj-sb">' + scoreHtml(V, cur) + '</div>';
          if (cur.phase === 'over') {
            layoutKey = '';
            var top = cur.players.slice().sort(function (a, b) { return cur.scores[b.id] - cur.scores[a.id]; });
            el.innerHTML = scoreBar + '<div class="wait"><div class="card" style="text-align:center"><div style="font-size:48px">🎨</div>' +
              V.winTitle(cur.players, function (p) { return cur.scores[p.id]; }) + V.endButtons() + '</div></div>';
            return;
          }
          var amDrawer = cur.drawer === me;
          var key = cur.turnId + '|' + cur.stage + '|' + amDrawer;
          if (key !== layoutKey || !el.querySelector('#dj-canvas')) {
            layoutKey = key;
            var html = scoreBar + '<div class="dj-top"><div id="dj-hint" class="dj-hint"></div><div id="dj-clock" class="dj-clock"></div></div>' +
              '<div class="dj-board" id="dj-board"><canvas id="dj-canvas"' + (amDrawer && cur.stage === 'draw' ? ' data-bot-draw' : '') + '></canvas><div id="dj-ov"></div></div>';
            if (amDrawer && cur.stage === 'draw') {
              html += '<div class="dj-tools">' + COLORS.map(function (c) {
                return '<button class="dj-color' + (tool.c === c ? ' on' : '') + '" data-c="' + c + '" style="background:' + c + '"></button>';
              }).join('') + '</div><div class="dj-tools">' + SIZES.map(function (w) {
                return '<button class="dj-size' + (tool.w === w ? ' on' : '') + '" data-w="' + w + '"><i style="width:' + (w + 2) + 'px;height:' + (w + 2) + 'px"></i></button>';
              }).join('') + '<button class="btn small ghost" data-t="undo">↶ Deshacer</button><button class="btn small ghost" data-t="clear">🗑 Borrar</button></div>';
            } else if (!amDrawer) {
              html += '<form class="dj-guess" id="dj-form"><input class="field" id="dj-in" data-bot-input maxlength="40" placeholder="¿Qué es?" autocomplete="off"><button class="btn small" type="submit" data-bot>Enviar</button></form>';
            }
            html += '<div class="dj-log" id="dj-log"></div>';
            if (V.isHost()) html += '<p class="hint kb-hide" style="margin:4px 0 10px"><button class="btn small ghost" data-t="skip">Saltar este turno</button></p>';
            el.innerHTML = html;
            setupCanvas(V, amDrawer && cur.stage === 'draw');
            logShown = 0;
            var form = el.querySelector('#dj-form');
            if (form) form.onsubmit = function (e) {
              e.preventDefault();
              var inp = el.querySelector('#dj-in');
              var t = inp.value.trim();
              if (!t) return;
              inp.value = '';
              V.act({ type: 'guess', text: t });
            };
            el.onclick = function (e) {
              var b = e.target.closest('[data-c],[data-w],[data-t],[data-word]');
              if (!b) return;
              if (b.hasAttribute('data-word')) { V.act({ type: 'pick', word: b.getAttribute('data-word') }); return; }
              if (b.hasAttribute('data-c')) { tool.c = b.getAttribute('data-c'); markTools(); return; }
              if (b.hasAttribute('data-w')) { tool.w = +b.getAttribute('data-w'); markTools(); return; }
              var t = b.getAttribute('data-t');
              if (t === 'skip') { V.act({ type: 'skip' }); return; }
              if (t === 'undo') { strokes.pop(); redrawAll(); api.toAll({ type: 'dundo', t: strokesTurn }); }
              if (t === 'clear') { strokes = []; redrawAll(); api.toAll({ type: 'dclr', t: strokesTurn }); }
            };
          }
          // partes que cambian
          el.querySelector('#dj-sb').innerHTML = scoreHtml(V, cur);
          var hint = el.querySelector('#dj-hint');
          var drawerTag = V.tag(cur.drawer);
          if (cur.stage === 'choose') hint.innerHTML = amDrawer ? 'Elegí qué dibujar' : drawerTag + ' está eligiendo…';
          else if (cur.stage === 'draw') {
            var known = priv && priv.word;
            hint.innerHTML = amDrawer ? 'Dibujá: <b class="dj-word">' + V.esc(known || '') + '</b>' :
              (known ? '¡Adivinaste! <b class="dj-word">' + V.esc(known) + '</b>' : '<span class="dj-mask">' + V.esc(cur.hint) + '</span>');
          } else hint.innerHTML = 'Era: <b class="dj-word">' + V.esc(cur.word || '') + '</b>';
          var ov = el.querySelector('#dj-ov');
          if (cur.stage === 'choose' && amDrawer && priv && priv.options) {
            ov.innerHTML = '<div class="overlay" style="background:#0b1020e8"><h3 style="font-size:20px">Elegí una palabra</h3>' + priv.options.map(function (w) {
              return '<button class="btn block" data-word="' + V.esc(w) + '" data-bot style="max-width:260px">' + V.esc(w) + '</button>';
            }).join('') + '</div>';
          } else if (cur.stage === 'choose') {
            ov.innerHTML = '<div class="overlay" style="background:#0b1020cc"><div style="font-size:44px">✏️</div><p>' + drawerTag + ' va a dibujar</p></div>';
          } else if (cur.stage === 'reveal') {
            ov.innerHTML = '<div class="overlay" style="background:#0b1020aa"><p style="color:#fff">Era</p><h3>' + V.esc(cur.word || '') + '</h3><p>' +
              cur.guessed.length + ' adivinaron</p></div>';
          } else ov.innerHTML = '';
          var inp = el.querySelector('#dj-in');
          if (inp) {
            var done = priv && priv.word;
            inp.disabled = !!done || cur.stage !== 'draw';
            inp.placeholder = done ? '¡Ya adivinaste!' : cur.stage === 'draw' ? '¿Qué es?' : 'Esperá…';
          }
          if (priv && priv.near && cur.stage === 'draw' && !(priv && priv.word)) {
            if (lastNear !== priv.near) { lastNear = priv.near; api.toast('¡“' + priv.near + '” está muy cerca!'); }
          }
          // registro de intentos
          var log = el.querySelector('#dj-log');
          if (log) {
            if (logShown > cur.log.length) { log.innerHTML = ''; logShown = 0; }
            for (var i = logShown; i < cur.log.length; i++) {
              var it = cur.log[i], p = V.player(it.id);
              var row = document.createElement('div');
              row.innerHTML = it.ok ? '<b style="color:#3ddc84">✔ ' + V.esc(p.name) + ' adivinó</b>' : '<b style="color:' + p.color + '">' + V.esc(p.name) + ':</b> ' + V.esc(it.text);
              log.insertBefore(row, log.firstChild);
            }
            logShown = cur.log.length;
          }
          this.tick(V);
        },
        destroy: function () { window.removeEventListener('resize', onResize); if (ro) ro.disconnect(); }
      });

      var lastNear = null;
      function scoreHtml(V, cur) {
        return cur.players.slice().sort(function (a, b) { return cur.scores[b.id] - cur.scores[a.id]; }).map(function (p) {
          var mark = p.id === cur.drawer ? ' ✏️' : (cur.guessed.indexOf(p.id) >= 0 ? ' ✔' : '');
          return '<span class="score" style="color:' + p.color + '"><span class="sw" style="background:' + p.color + '"></span><span style="color:var(--text)">' +
            V.esc(p.name) + mark + '</span> ' + cur.scores[p.id] + '</span>';
        }).join('');
      }
      function markTools() {
        Array.prototype.forEach.call(api.el.querySelectorAll('.dj-color'), function (b) { b.classList.toggle('on', b.getAttribute('data-c') === tool.c); });
        Array.prototype.forEach.call(api.el.querySelectorAll('.dj-size'), function (b) { b.classList.toggle('on', +b.getAttribute('data-w') === tool.w); });
      }
      function ensureTurn(cur) {
        if (cur.turnId !== strokesTurn) { strokesTurn = cur.turnId; strokes = []; redrawAll(); }
      }

      // ------------------------------------------------ lienzo
      function setupCanvas(V, canDraw) {
        canvas = api.el.querySelector('#dj-canvas');
        ctx = canvas.getContext('2d');
        sizeCanvas();
        redrawAll();
        if (!canDraw) return;
        function pos(e) {
          var r = canvas.getBoundingClientRect();
          return [Math.round((e.clientX - r.left) / r.width * SZ), Math.round((e.clientY - r.top) / r.height * SZ)];
        }
        canvas.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          try { canvas.setPointerCapture(e.pointerId); } catch (x) { }
          var p = pos(e);
          drawing = { idx: strokes.length };
          strokes.push({ c: tool.c, w: tool.w, p: [p[0], p[1], p[0], p[1]] });
          pendingPts = [p[0], p[1], p[0], p[1]];
          drawStroke(strokes[drawing.idx], 0);
          flushSoon();
        });
        canvas.addEventListener('pointermove', function (e) {
          if (!drawing) return;
          e.preventDefault();
          var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
          var s = strokes[drawing.idx];
          if (!s) { drawing = null; return; }
          var start = s.p.length;
          evs.forEach(function (ev) {
            var p = pos(ev);
            var lx = s.p[s.p.length - 2], ly = s.p[s.p.length - 1];
            if ((p[0] - lx) * (p[0] - lx) + (p[1] - ly) * (p[1] - ly) < 4) return;
            s.p.push(p[0], p[1]); pendingPts.push(p[0], p[1]);
          });
          drawStroke(s, Math.max(0, start - 2));
          flushSoon();
        });
        function up() { if (drawing) { flush(); drawing = null; } }
        canvas.addEventListener('pointerup', up);
        canvas.addEventListener('pointercancel', up);
      }
      function flushSoon() { if (!flushT) flushT = setTimeout(flush, 40); }
      function flush() {
        clearTimeout(flushT); flushT = null;
        if (!drawing || !pendingPts.length) return;
        var s = strokes[drawing.idx];
        if (!s) return;
        api.toAll({ type: 'dw', t: strokesTurn, s: drawing.idx, c: s.c, w: s.w, p: pendingPts });
        pendingPts = [];
      }
      function sizeCanvas() {
        if (!canvas) return;
        var board = api.el.querySelector('#dj-board'), st = api.el;
        // el lienzo es cuadrado y ocupa lo que dejan libre las otras partes (el teclado incluido)
        var other = 0;
        Array.prototype.forEach.call(st.children, function (c) {
          if (c === board || c.id === 'dj-log') return;
          var cs = getComputedStyle(c);
          if (cs.display === 'none' || cs.position === 'absolute') return;
          other += c.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
        });
        var kb = document.documentElement.classList.contains('kb');
        var avail = st.clientHeight - other - (kb ? 34 : 50) - 4;
        var w = Math.floor(Math.max(120, Math.min(board.clientWidth - 20, avail)));
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.style.width = w + 'px'; canvas.style.height = w + 'px';
        var px = Math.round(w * dpr);
        if (canvas.width !== px) { canvas.width = px; canvas.height = px; }   // reasignar borra el dibujo
        cscale = canvas.width / SZ;
      }
      function redrawAll() {
        if (!ctx) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#f7f4ec'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        strokes.forEach(function (s) { if (s) drawStroke(s, 0); });
      }
      function drawStroke(s, from) {
        if (!ctx || !s || s.p.length < 2) return;
        ctx.setTransform(cscale, 0, 0, cscale, 0, 0);
        ctx.strokeStyle = s.c; ctx.lineWidth = s.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(s.p[from], s.p[from + 1]);
        for (var i = from + 2; i < s.p.length; i += 2) ctx.lineTo(s.p[i], s.p[i + 1]);
        if (s.p.length === from + 2) ctx.lineTo(s.p[from] + 0.1, s.p[from + 1]);
        ctx.stroke();
      }
      function onResize() {
        if (!canvas || !document.body.contains(canvas)) return;
        var before = canvas.style.width;
        sizeCanvas();
        if (canvas.style.width !== before) redrawAll();
      }
    }
  });

  var css = document.createElement('style');
  css.textContent =
    '.dj-top{display:flex;align-items:center;gap:10px;padding:2px 14px 8px}' +
    '.dj-hint{flex:1;font-weight:800;font-size:16px;min-height:24px}' +
    '.dj-mask{font-family:ui-monospace,monospace;letter-spacing:2px;font-size:20px}' +
    '.dj-word{color:var(--accent);font-size:20px}' +
    '.dj-clock{font-weight:900;font-size:18px;color:var(--accent);min-width:42px;text-align:right}' +
    '.dj-board{position:relative;display:flex;justify-content:center;padding:0 10px}' +
    '.dj-board canvas{border-radius:14px;touch-action:none;box-shadow:0 4px 16px #0006;display:block}' +
    '.dj-board .overlay{border-radius:14px;margin:0 10px}' +
    '.dj-tools{display:flex;gap:6px;justify-content:center;padding:8px 10px 0;flex-wrap:wrap;align-items:center}' +
    '.dj-color{width:30px;height:30px;border-radius:50%;border:2px solid #fff3}' +
    '.dj-color.on{outline:3px solid var(--accent);outline-offset:1px}' +
    '.dj-size{width:38px;height:34px;border-radius:10px;border:1px solid var(--line);background:var(--panel);display:flex;align-items:center;justify-content:center}' +
    '.dj-size i{display:block;border-radius:50%;background:#fff}' +
    '.dj-size.on{border-color:var(--accent)}' +
    '.dj-guess{display:flex;gap:8px;padding:8px 12px 0}' +
    '.dj-guess .field{font-size:16px;padding:11px 14px}' +
    '.dj-log{padding:8px 16px;font-size:14.5px;display:flex;flex-direction:column;gap:3px;max-height:120px;overflow-y:auto;flex:1;min-height:50px}' +
    '.kb .dj-top{padding:4px 14px 4px}' +
    '.kb .dj-log{flex:none;min-height:0;max-height:34px;padding:3px 16px;font-size:13.5px}';
  document.head.appendChild(css);
})();
