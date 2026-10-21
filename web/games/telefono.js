/* Teléfono descompuesto (al estilo Gartic Phone). Cada uno escribe una frase; el siguiente la dibuja,
   el otro escribe qué cree que es el dibujo, el siguiente dibuja eso… Al final se muestra cada cadena
   paso por paso para ver cómo se fue deformando. 3 a 8.

   Cadena k = la que empezó el jugador k. En el paso s la cadena k la tiene el jugador (k + s) mod n.
   Paso 0: escribir · pasos impares: dibujar · pasos pares: describir el dibujo.
   Las cadenas quedan en el anfitrión (P). A cada uno le llega solo lo que tiene que dibujar o
   describir (los dibujos van por un mensaje aparte para no reenviarlos en cada actualización). */
(function () {
  'use strict';
  var SZ = 500, WRITE_MS = 45000, DESC_MS = 40000, GRACE = 1800, OFF_MS = 7000;
  var COLORS = ['#111111', '#ffffff', '#ff5d6c', '#ff9f43', '#ffd23f', '#3ddc84', '#4fb3ff', '#c77dff', '#8b5a2b'];
  var SIZES = [4, 9, 18];

  function idea() { return window.PALABRAS ? window.PALABRAS.idea() : 'un gato tomando mate'; }
  function kindOf(step) { return step === 0 ? 'write' : (step % 2 ? 'draw' : 'desc'); }
  function cleanText(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, 80); }
  function cleanStrokes(a) {
    if (!Array.isArray(a)) return [];
    var out = [], pts = 0;
    for (var i = 0; i < a.length && i < 800; i++) {
      var s = a[i];
      if (!s || !Array.isArray(s.p)) continue;
      var p = [];
      for (var j = 0; j + 1 < s.p.length && pts < 25000; j += 2, pts++) {
        p.push(Math.max(0, Math.min(SZ, Math.round(+s.p[j] || 0))), Math.max(0, Math.min(SZ, Math.round(+s.p[j + 1] || 0))));
      }
      if (p.length >= 2) out.push({ c: COLORS.indexOf(s.c) >= 0 ? s.c : '#111111', w: SIZES.indexOf(s.w) >= 0 ? s.w : 9, p: p });
    }
    return out;
  }
  function cleanEntry(e) {
    if (!e || (e.t !== 'img' && e.t !== 'txt')) return null;
    var r = { by: String(e.by || ''), t: e.t, v: e.t === 'img' ? cleanStrokes(e.v) : cleanText(e.v) };
    if (e.auto) r.auto = 1;
    return r;
  }
  // ---------- dibujo
  function paint(canvas, strokes) {
    var ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#f7f4ec'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    (strokes || []).forEach(function (s) { strokeOne(canvas, s, 0); });
  }
  function strokeOne(canvas, s, from) {
    if (!s || s.p.length < 2) return;
    var ctx = canvas.getContext('2d'), k = canvas.width / SZ;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = s.c; ctx.lineWidth = s.w;
    ctx.beginPath(); ctx.moveTo(s.p[from], s.p[from + 1]);
    for (var i = from + 2; i < s.p.length; i += 2) ctx.lineTo(s.p[i], s.p[i + 1]);
    if (s.p.length === from + 2) ctx.lineTo(s.p[from] + 0.1, s.p[from + 1]);
    ctx.stroke();
  }
  function sizeCanvas(canvas, px) {
    var dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(px * dpr);
    canvas.style.width = px + 'px'; canvas.style.height = px + 'px';
    if (canvas.width !== w) { canvas.width = w; canvas.height = w; return true; }
    return false;
  }

  App.register({
    id: 'telefono', name: 'Teléfono descompuesto', emoji: '📞', players: '3-8',
    desc: 'Escribí, dibujá, adiviná… y mirá cómo se deforma todo.',
    create: function (api) {
      var draft = { key: '', text: '', strokes: [] };
      var autoSent = {}, imgCache = {}, rvCache = {}, mine = {}, lastReq = {};
      var layoutKey = '', viewK = null, tool = { c: '#111111', w: 9 }, drawing = null, ro = null;
      var V0 = null;

      // ================================================== anfitrión
      function idx(S, id) { for (var i = 0; i < S.players.length; i++) if (S.players[i].id === id) return i; return -1; }
      function chainOf(S, id, step) { var n = S.players.length, pi = idx(S, id); return pi < 0 ? -1 : ((pi - step) % n + n) % n; }
      function handler(S, k, step) { return S.players[(k + step) % S.players.length].id; }
      function msFor(S, kind) { return kind === 'write' ? WRITE_MS : kind === 'draw' ? S.drawMs : DESC_MS; }
      function autoEntry(S, k, step) {
        var by = handler(S, k, step);
        return kindOf(step) === 'draw' ? { by: by, t: 'img', v: [], auto: 1 } : { by: by, t: 'txt', v: idea(), auto: 1 };
      }

      function beginStep(H, step) {
        var S = H.S;
        S.step = step; S.kind = kindOf(step); S.done = {};
        var ms = msFor(S, S.kind);
        H.deadline(ms);
        H.cancel('adv');
        H.later('deadline', ms + GRACE, function () { closeStep(H); });
        H.publish();
        sendImgs(H);
      }
      function sendImgs(H, onlyId) {
        var S = H.S;
        if (S.phase !== 'play' || S.kind !== 'desc') return;
        S.players.forEach(function (p) {
          if (onlyId && p.id !== onlyId) return;
          var k = chainOf(S, p.id, S.step), prev = H.P.chains[k] && H.P.chains[k][S.step - 1];
          if (prev && prev.t === 'img') api.to(p.id, { type: 'img', gid: S.gid, step: S.step, s: prev.v });
        });
      }
      function fillStep(H, step, onlyK) {
        var S = H.S;
        for (var k = 0; k < S.players.length; k++) {
          if (onlyK != null && k !== onlyK) continue;
          if (!H.P.chains[k][step]) H.P.chains[k][step] = autoEntry(S, k, step);
        }
      }
      function closeStep(H) {
        var S = H.S;
        if (S.phase !== 'play') return;
        H.cancel('deadline'); H.cancel('adv');
        fillStep(H, S.step);
        if (S.step + 1 < S.steps) beginStep(H, S.step + 1);
        else beginShow(H);
      }
      function beginShow(H) {
        var S = H.S;
        for (var s = 0; s < S.steps; s++) fillStep(H, s);
        S.phase = 'show'; S.rk = 0; S.ri = 0; S.done = {};
        H.deadline(null);
        sendReveal(H, 0, 0);
        H.publish();
      }
      function sendReveal(H, k, i, to) {
        var e = H.P.chains[k] && H.P.chains[k][i];
        if (!e) return;
        var m = { type: 'rv', gid: H.S.gid, k: k, i: i, e: e };
        if (to) api.to(to, m); else api.toAll(m);
      }
      function checkAll(H) {
        var S = H.S;
        if (S.players.every(function (p) { return S.done[p.id]; })) H.later('adv', 700, function () { closeStep(H); });
        else H.cancel('adv');
      }

      // ================================================== pantalla
      function dkeyOf(cur) { return cur.gid + '|' + cur.step; }
      function inGame(cur) { return cur.players.some(function (p) { return p.id === api.me; }); }
      function ask(key, d) {
        var t = Date.now();
        if (lastReq[key] && t - lastReq[key] < 2000) return;
        lastReq[key] = t;
        V0.act(d);
      }

      /** Lo que este celular sabe de las cadenas: lo que mandó y lo que le tocó dibujar o describir. */
      function knownItems(V, gid) {
        var m = mine[gid] || {};
        var items = Object.keys(m).map(function (s) { return m[s]; });
        var pv = V && V.priv, cu = V && V.cur;
        if (pv && cu && pv.gid === gid && pv.step === cu.step && pv.step > 0 && pv.prevBy) {
          var dk = gid + '|' + pv.step;
          if (pv.text != null) items.push({ k: pv.k, s: pv.step - 1, e: { by: pv.prevBy, t: 'txt', v: pv.text } });
          else if (pv.img && imgCache[dk]) items.push({ k: pv.k, s: pv.step - 1, e: { by: pv.prevBy, t: 'img', v: imgCache[dk] } });
        }
        return items;
      }

      function submit(V, cur, priv, auto) {
        if (cur.phase !== 'play' || !inGame(cur)) return;
        var kind = cur.kind, v;
        if (kind === 'draw') {
          v = draft.strokes;
          if (!auto && !v.length) { api.toast('Dibujá algo primero'); return; }
        } else {
          var inp = V.el.querySelector('#tl-in');
          if (inp) draft.text = inp.value;
          v = cleanText(draft.text);
          if (!auto && !v) { api.toast(kind === 'write' ? 'Escribí algo (o tocá 🎲)' : 'Escribí qué creés que es'); return; }
        }
        V.act({ type: 'sub', gid: cur.gid, step: cur.step, v: v, auto: !!auto });
        // me lo guardo por si cambia el anfitrión y hay que rearmar las cadenas
        if (priv && priv.gid === cur.gid && priv.step === cur.step) {
          mine[cur.gid] = mine[cur.gid] || {};
          mine[cur.gid][cur.step] = { k: priv.k, s: cur.step, e: { by: api.me, t: kind === 'draw' ? 'img' : 'txt', v: v } };
        }
      }

      function topHtml(cur, label) {
        return '<div class="tl-top"><span><b>Paso ' + (cur.step + 1) + '</b>/' + cur.steps + ' · ' + label + '</span>' +
          '<span class="tl-dots" id="tl-dots"></span><span class="tl-clock" id="tl-clock"></span>' +
          (api.isHost() ? '<button class="tl-skip" id="tl-skip" title="Pasar al siguiente paso">⏭</button>' : '') + '</div>';
      }
      var skipArm = 0;
      function paintDots(V, cur) {
        var d = V.el.querySelector('#tl-dots');
        if (!d) return;
        d.innerHTML = cur.players.map(function (p) {
          var ok = cur.done && cur.done[p.id];
          return '<i class="' + (ok ? 'on' : '') + '" style="background:' + p.color + '" title="' + api.esc(p.name) + '">' + (ok ? '✓' : '') + '</i>';
        }).join('');
      }
      function fitBoard(V) {
        var board = V.el.querySelector('#tl-board'), c = V.el.querySelector('#tl-c');
        if (!board || !c) return;
        var px = Math.floor(Math.max(110, Math.min(board.clientWidth - 16, board.clientHeight - 6, 560)));
        sizeCanvas(c, px);
        paint(c, currentStrokes(V));
      }
      function currentStrokes(V) {
        var cur = V.cur;
        if (!cur || cur.phase !== 'play') return [];
        if (cur.kind === 'draw') return draft.strokes;
        if (cur.kind === 'desc') return imgCache[dkeyOf(cur)] || [];
        return [];
      }
      function observe(V) {
        if (ro) ro.disconnect();
        var board = V.el.querySelector('#tl-board');
        if (board && window.ResizeObserver) { ro = new ResizeObserver(function () { fitBoard(V); }); ro.observe(board); }
        fitBoard(V);
      }

      function setupDrawing(V) {
        var c = V.el.querySelector('#tl-c');
        if (!c) return;
        function pos(e) {
          var r = c.getBoundingClientRect();
          return [Math.round((e.clientX - r.left) / r.width * SZ), Math.round((e.clientY - r.top) / r.height * SZ)];
        }
        c.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          try { c.setPointerCapture(e.pointerId); } catch (x) { }
          var p = pos(e);
          draft.strokes.push({ c: tool.c, w: tool.w, p: [p[0], p[1]] });
          drawing = draft.strokes[draft.strokes.length - 1];
          strokeOne(c, drawing, 0);
        });
        c.addEventListener('pointermove', function (e) {
          if (!drawing) return;
          e.preventDefault();
          var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e], s = drawing, start = s.p.length;
          evs.forEach(function (ev) {
            var p = pos(ev), lx = s.p[s.p.length - 2], ly = s.p[s.p.length - 1];
            if ((p[0] - lx) * (p[0] - lx) + (p[1] - ly) * (p[1] - ly) < 6) return;
            s.p.push(p[0], p[1]);
          });
          if (s.p.length > start) strokeOne(c, s, Math.max(0, start - 2));
        });
        function up() { drawing = null; }
        c.addEventListener('pointerup', up);
        c.addEventListener('pointercancel', up);
      }

      function renderPlay(V, cur, priv) {
        var el = V.el;
        if (!inGame(cur)) {
          layoutKey = 'spec';
          el.innerHTML = '<div class="wait"><div class="big-emoji">📞</div><h3>Partida en curso</h3><p class="sub">Paso ' + (cur.step + 1) + ' de ' + cur.steps +
            '. Al final vas a poder ver las cadenas.</p></div>';
          return;
        }
        var dkey = dkeyOf(cur);
        if (draft.key !== dkey) { draft = { key: dkey, text: '', strokes: [] }; drawing = null; }
        var task = priv && priv.gid === cur.gid && priv.step === cur.step ? priv : null;
        var done = !!(cur.done && cur.done[api.me]);
        var kind = cur.kind;
        var key = 'play|' + dkey + '|' + (done ? 1 : 0) + '|' + (task ? 1 : 0);
        if (key !== layoutKey) {
          layoutKey = key;
          var html = '', foot;
          var waitFoot = '<div class="tl-foot"><div class="tl-wait">✅ ¡Listo! Esperando a los demás…</div>' +
            '<button class="btn ghost small" id="tl-edit">✏️ Editar</button></div>';
          if (kind === 'write') {
            html = topHtml(cur, '✍️ Escribir') + '<div class="tl-body"><div class="card tl-card"><h3>Escribí una frase</h3>' +
              '<p class="hint" style="text-align:left;margin:0 0 12px">El siguiente la va a tener que dibujar. Cuanto más bizarra, mejor.</p>' +
              '<div class="tl-row"><input class="field" id="tl-in" maxlength="80" autocomplete="off" data-bot-input placeholder="Ej: un carpincho haciendo surf"' +
              (done ? ' disabled' : '') + '><button class="btn ghost" id="tl-idea" title="Idea al azar"' + (done ? ' disabled' : '') + '>🎲</button></div></div></div>';
            foot = done ? waitFoot : '<div class="tl-foot"><button class="btn block" id="tl-ok" data-bot>✅ Listo</button></div>';
            html += foot;
          } else if (!task) {
            html = topHtml(cur, kind === 'draw' ? '🎨 Dibujar' : '🔎 Adivinar') + '<div class="tl-body"><p class="hint">Cargando…</p></div>';
          } else if (kind === 'draw') {
            html = topHtml(cur, '🎨 Dibujar') + '<div class="tl-prompt">Dibujá:<b class="tl-what">' + api.esc(task.text || '…') + '</b></div>' +
              '<div class="tl-board" id="tl-board"><canvas id="tl-c"' + (done ? '' : ' data-bot-draw') + '></canvas></div>';
            if (!done) {
              html += '<div class="tl-tools">' + COLORS.map(function (c) {
                return '<button class="tl-color' + (tool.c === c ? ' on' : '') + '" data-c="' + c + '" style="background:' + c + '"></button>';
              }).join('') + '</div><div class="tl-tools">' + SIZES.map(function (w) {
                return '<button class="tl-size' + (tool.w === w ? ' on' : '') + '" data-w="' + w + '"><i style="width:' + (w + 2) + 'px;height:' + (w + 2) + 'px"></i></button>';
              }).join('') + '<button class="btn small ghost" data-t="undo">↶</button><button class="btn small ghost" data-t="clear">🗑</button>' +
                '<button class="btn small" id="tl-ok" data-bot>✅ Listo</button></div>';
              html += '<div style="height:calc(8px + var(--safe-b))"></div>';
            } else html += waitFoot;
          } else {
            var who = task.prevBy ? V.tag(task.prevBy) : 'alguien';
            html = topHtml(cur, '🔎 Adivinar') + '<div class="tl-prompt">¿Qué dibujó ' + who + '?</div>' +
              '<div class="tl-board" id="tl-board"><canvas id="tl-c"></canvas><div class="tl-empty" id="tl-empty"></div></div>';
            html += done ? waitFoot : '<form class="tl-foot" id="tl-form"><input class="field" id="tl-in" maxlength="80" autocomplete="off" data-bot-input placeholder="Es…">' +
              '<button class="btn small" type="submit" data-bot>✅ Listo</button></form>';
            if (done) html = html.replace('<div class="tl-foot">', '<div class="tl-mine">Escribiste: <b>' + api.esc(cleanText(draft.text)) + '</b></div><div class="tl-foot">');
          }
          el.innerHTML = html;
          var inp = el.querySelector('#tl-in');
          if (inp) {
            inp.value = draft.text;
            inp.addEventListener('input', function () { draft.text = inp.value; });
            if (!done) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && kind === 'write') { e.preventDefault(); submit(V, V.cur, V.priv, false); } });
          }
          var form = el.querySelector('#tl-form');
          if (form) form.onsubmit = function (e) { e.preventDefault(); submit(V, V.cur, V.priv, false); };
          el.onclick = function (e) {
            var b = e.target.closest('button');
            if (!b || b.disabled) return;
            if (b.id === 'tl-ok') { submit(V, V.cur, V.priv, false); return; }
            if (b.id === 'tl-skip') {
              // el anfitrión puede cortar el paso si alguien se colgó (lo que falte se completa al azar)
              if (Date.now() - skipArm < 3000) { skipArm = 0; V.act({ type: 'skip', gid: V.cur.gid }); }
              else { skipArm = Date.now(); api.toast('Tocá ⏭ de nuevo para pasar al siguiente paso'); }
              return;
            }
            if (b.id === 'tl-edit') { V.act({ type: 'edit', gid: V.cur.gid, step: V.cur.step }); return; }
            if (b.id === 'tl-idea') { var i2 = el.querySelector('#tl-in'); draft.text = idea(); if (i2) i2.value = draft.text; return; }
            if (b.hasAttribute('data-c')) { tool.c = b.getAttribute('data-c'); markTools(el); return; }
            if (b.hasAttribute('data-w')) { tool.w = +b.getAttribute('data-w'); markTools(el); return; }
            var t = b.getAttribute('data-t');
            if (t === 'undo') { draft.strokes.pop(); fitBoard(V); }
            if (t === 'clear') { draft.strokes = []; fitBoard(V); }
          };
          if (el.querySelector('#tl-board')) observe(V);
          if (kind === 'draw' && !done && task) setupDrawing(V);
        }
        paintDots(V, cur);
        if (kind === 'desc' && task) {
          var have = imgCache[dkey];
          if (!have && task.img) ask('img' + dkey, { type: 'imgq', gid: cur.gid, step: cur.step });
          var em = el.querySelector('#tl-empty');
          if (em) em.innerHTML = have && !have.length ? '<span>🤷 No llegó a dibujar nada.<br>Inventá algo.</span>' : (!have && task.img ? '<span>Cargando dibujo…</span>' : '');
          fitBoard(V);
        }
        tickClock(V);
      }
      function markTools(el) {
        Array.prototype.forEach.call(el.querySelectorAll('.tl-color'), function (b) { b.classList.toggle('on', b.getAttribute('data-c') === tool.c); });
        Array.prototype.forEach.call(el.querySelectorAll('.tl-size'), function (b) { b.classList.toggle('on', +b.getAttribute('data-w') === tool.w); });
      }
      function tickClock(V) {
        var c = V.el.querySelector('#tl-clock');
        if (!c) return;
        var l = V.left();
        c.textContent = l == null ? '' : Math.ceil(l / 1000) + 's';
        c.classList.toggle('low', l != null && l < 10000);
      }

      // ---------- revelación
      function entryHtml(V, e, i) {
        if (!e) return '<div class="tl-by">…</div><p class="hint" style="margin:6px 0">Cargando…</p>';
        var verb = e.t === 'img' ? 'dibujó' : (i === 0 ? 'escribió' : 'entendió');
        var h = '<div class="tl-by">' + V.tag(e.by) + ' ' + verb + ':</div>';
        if (e.t === 'txt' && e.auto) h = '<div class="tl-by">' + V.tag(e.by) + ' no llegó · 🎲 salió al azar:</div>';
        if (e.t === 'txt') return h + '<div class="tl-txt">“' + api.esc(e.v) + '”</div>';
        return h + '<div class="tl-imgw"><canvas class="tl-img"></canvas>' + (e.v.length ? '' : '<div class="tl-empty"><span>🤷 No llegó a dibujar</span></div>') + '</div>';
      }
      /** Muestra las entradas 0..upto de la cadena k en list (agrega solo lo que falta). */
      function fillChain(V, list, gid, k, upto) {
        var added = false;
        for (var i = 0; i <= upto; i++) {
          var e = rvCache[gid + '|' + k + '|' + i];
          var node = list.querySelector('[data-i="' + i + '"]');
          var state = e ? 'ok' : 'wait';
          if (node && node.getAttribute('data-s') === state) continue;
          if (!e) ask('rv' + gid + k + '|' + i, { type: 'rvq', gid: gid, k: k, i: i });
          if (!node) { node = document.createElement('div'); node.className = 'tl-e'; node.setAttribute('data-i', i); list.appendChild(node); added = true; }
          node.setAttribute('data-s', state);
          node.innerHTML = entryHtml(V, e, i);
          var c = node.querySelector('canvas');
          if (c) { sizeCanvas(c, Math.floor(Math.max(150, Math.min(list.clientWidth - 52, 360)))); paint(c, e.v); }
        }
        if (added) setTimeout(function () { list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' }); }, 30);
      }
      function renderShow(V, cur) {
        var el = V.el, owner = cur.players[cur.rk];
        var key = 'show|' + cur.gid + '|' + cur.rk;
        if (key !== layoutKey) {
          layoutKey = key;
          el.innerHTML = '<div class="tl-top"><span>📜 Cadena de ' + V.tag(owner.id) + '</span><span style="flex:1"></span><span>' + (cur.rk + 1) + ' de ' + cur.players.length + '</span></div>' +
            '<div class="tl-list" id="tl-list"></div><div class="tl-foot" id="tl-sfoot"></div>';
          el.onclick = function (e) {
            var b = e.target.closest('#tl-next');
            if (b) V.act({ type: 'next', gid: V.cur.gid });
          };
        }
        fillChain(V, el.querySelector('#tl-list'), cur.gid, cur.rk, cur.ri);
        var f = el.querySelector('#tl-sfoot');
        var lbl = cur.ri < cur.steps - 1 ? 'Siguiente ▶' : (cur.rk < cur.players.length - 1 ? 'Siguiente cadena ⏭' : 'Terminar 🏁');
        f.innerHTML = V.isHost() ? '<button class="btn block" id="tl-next" data-bot>' + lbl + '</button>' :
          '<p class="hint" style="margin:0;flex:1">El anfitrión va mostrando la cadena…</p>';
      }
      function renderOver(V, cur) {
        var el = V.el;
        if (viewK != null && cur.players[viewK]) {
          var key = 'view|' + cur.gid + '|' + viewK;
          if (key !== layoutKey) {
            layoutKey = key;
            el.innerHTML = '<div class="tl-top"><button class="btn ghost small" id="tl-back">← Volver</button><span>Cadena de ' + V.tag(cur.players[viewK].id) + '</span></div>' +
              '<div class="tl-list" id="tl-list"></div>';
            el.onclick = function (e) { if (e.target.closest('#tl-back')) { viewK = null; layoutKey = ''; V.redraw(); } };
          }
          fillChain(V, el.querySelector('#tl-list'), cur.gid, viewK, cur.steps - 1);
          return;
        }
        layoutKey = 'over';
        el.innerHTML = '<div class="wait"><div class="card" style="text-align:center"><div style="font-size:48px">📞</div>' +
          '<h3 style="margin:4px 0 6px">¡Fin del teléfono!</h3><p class="hint" style="margin:0 0 12px">Volvé a ver la que quieras:</p>' +
          '<div class="tl-chains">' + cur.players.map(function (p, k) {
            return '<button class="btn ghost" data-k="' + k + '"><span class="sw" style="background:' + p.color + '"></span>' + api.esc(p.name) + '</button>';
          }).join('') + '</div>' + V.endButtons('Otra partida') + '</div></div>';
        el.onclick = function (e) {
          var b = e.target.closest('[data-k]');
          if (b) { viewK = +b.getAttribute('data-k'); layoutKey = ''; V.redraw(); }
        };
      }

      // para las pruebas automáticas
      window.__tel = {
        state: function () { var c = V0 && V0.cur; return c ? { phase: c.phase, step: c.step, kind: c.kind, done: c.done, rk: c.rk, ri: c.ri, steps: c.steps, strokes: draft.strokes.length, layout: layoutKey } : null; },
        scribble: function (n) {
          for (var j = 0; j < (n || 3); j++) {
            var x = 50 + Math.random() * 400, y = 50 + Math.random() * 400, p = [Math.round(x), Math.round(y)];
            for (var q = 0; q < 12; q++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; p.push(Math.round(Math.max(0, Math.min(SZ, x))), Math.round(Math.max(0, Math.min(SZ, y)))); }
            draft.strokes.push({ c: COLORS[(Math.random() * COLORS.length) | 0], w: SIZES[(Math.random() * 3) | 0], p: p });
          }
          if (V0) fitBoard(V0);
        },
        caches: function () { return { img: Object.keys(imgCache).length, rv: Object.keys(rvCache).length, mine: Object.keys(mine).length }; }
      };

      // ================================================== juego
      return SyncGame(api, {
        wait: {
          emoji: '📞', title: 'Teléfono descompuesto',
          sub: 'Cada uno escribe una frase. El siguiente la dibuja, el otro escribe qué cree que es el dibujo, el siguiente dibuja eso… ' +
            'Al final se ve cómo se fue deformando todo. 😂',
          min: 3, max: 8,
          options: [
            { key: 'draw', label: 'Tiempo para dibujar', value: 90, choices: [[60, '1 min'], [90, '1:30'], [120, '2 min']] },
            { key: 'laps', label: 'Vueltas', value: 1, choices: [[1, '1'], [2, '2']] }
          ]
        },
        start: function (H, vals, players) {
          var laps = vals.laps === 2 ? 2 : 1;
          H.set({ phase: 'play', players: players, gid: 1 + Math.floor(Math.random() * 2e9), steps: players.length * laps, step: 0,
            kind: 'write', drawMs: (+vals.draw || 90) * 1000, done: {} },
            { chains: players.map(function () { return []; }), off: {} });
          beginStep(H, 0);
        },
        action: function (H, from, d) {
          var S = H.S, P = H.P;
          if (!d || d.gid !== S.gid) return;
          if (d.type === 'sub' && S.phase === 'play' && d.step === S.step) {
            var k = chainOf(S, from, S.step);
            if (k < 0) return;
            var e = S.kind === 'draw' ? { by: from, t: 'img', v: cleanStrokes(d.v) } : { by: from, t: 'txt', v: cleanText(d.v) };
            if (e.t === 'txt' && !e.v) { e.v = idea(); e.auto = 1; }
            P.chains[k][S.step] = e;
            S.done[from] = 1;
            checkAll(H);
            H.publish();
          } else if (d.type === 'edit' && S.phase === 'play' && d.step === S.step) {
            delete S.done[from];
            checkAll(H);
            H.publish();
          } else if (d.type === 'imgq' && S.phase === 'play' && d.step === S.step) {
            sendImgs(H, from);
          } else if (d.type === 'rvq') {
            var ok = S.phase === 'over' || (S.phase === 'show' && (d.k < S.rk || (d.k === S.rk && d.i <= S.ri)));
            if (ok) sendReveal(H, d.k, d.i, from);
          } else if (d.type === 'next' && from === api.me && S.phase === 'show') {
            if (S.ri < S.steps - 1) { S.ri++; sendReveal(H, S.rk, S.ri); }
            else if (S.rk < S.players.length - 1) { S.rk++; S.ri = 0; sendReveal(H, S.rk, 0); }
            else S.phase = 'over';
            H.publish();
          } else if (d.type === 'skip' && from === api.me && S.phase === 'play') {
            closeStep(H);
          } else if (d.type === 'dump' && Array.isArray(d.items)) {
            // después de un cambio de anfitrión cada uno reenvía lo que escribió o dibujó
            d.items.forEach(function (it) {
              if (!it || typeof it.k !== 'number' || typeof it.s !== 'number' || it.k < 0 || it.k >= S.players.length || it.s < 0 || it.s >= S.steps) return;
              var own = handler(S, it.k, it.s) === from;
              if (!own && P.chains[it.k][it.s]) return;   // lo que vio otro sirve solo si no hay nada mejor
              var en = cleanEntry(it.e);
              if (!en) return;
              en.by = handler(S, it.k, it.s);
              P.chains[it.k][it.s] = en;
              if (own && S.phase === 'play' && it.s === S.step) S.done[from] = 1;
            });
          }
        },
        priv: function (S, P, id) {
          if (S.phase !== 'play' || !P.chains) return null;
          var k = chainOf(S, id, S.step);
          if (k < 0) return null;
          var prev = S.step > 0 ? P.chains[k][S.step - 1] : null;
          if (S.step > 0 && !prev) return null;
          return { gid: S.gid, step: S.step, k: k, text: prev && prev.t === 'txt' ? prev.v : null, img: !!(prev && prev.t === 'img'), prevBy: prev ? prev.by : null };
        },
        hostTick: function (H) {
          var S = H.S;
          if (S.phase !== 'play') return;
          // alguien se desconectó: después de unos segundos se completa su parte al azar para no frenar a todos
          var now = Date.now(), changed = false;
          S.players.forEach(function (p) {
            if (S.done[p.id] || H.online(p.id)) { delete H.P.off[p.id]; return; }
            if (!H.P.off[p.id]) { H.P.off[p.id] = now; return; }
            if (now - H.P.off[p.id] > OFF_MS) {
              var k = chainOf(S, p.id, S.step);
              fillStep(H, S.step, k);
              S.done[p.id] = 1; changed = true;
            }
          });
          if (changed) { checkAll(H); H.publish(); }
        },
        resume: function (H) {
          var S = H.S;
          if (!H.P.chains) H.P.chains = S.players.map(function () { return []; });
          H.P.off = H.P.off || {};
          if (S.phase === 'play') {
            var l = Math.max(0, H.timeLeft() || 0);
            H.later('deadline', l + GRACE, function () { closeStep(H); });
            setTimeout(function () { sendImgs(H); }, 300);
          }
        },
        adopt: function (H, cur) {
          // se fue el anfitrión: rearmar las cadenas con lo que tiene guardado cada uno
          var S = H.S;
          H.P.chains = S.players.map(function () { return []; });
          H.P.off = {};
          knownItems(V0, S.gid).forEach(function (it) {
            var en = cleanEntry(it.e);
            if (en && H.P.chains[it.k] && (!H.P.chains[it.k][it.s] || en.by === api.me)) H.P.chains[it.k][it.s] = en;
            if (en && en.by === api.me && S.phase === 'play' && it.s === S.step) S.done[api.me] = 1;
          });
          Object.keys(rvCache).forEach(function (key) {
            var a = key.split('|');
            if (+a[0] === S.gid && H.P.chains[+a[1]] && !H.P.chains[+a[1]][+a[2]]) H.P.chains[+a[1]][+a[2]] = rvCache[key];
          });
          api.toAll({ type: 'dumpq', gid: S.gid });
          if (S.phase === 'play') {
            var left = cur.left != null ? cur.left : msFor(S, S.kind);
            H.deadline(left + 3000);
            H.later('deadline', left + 3000 + GRACE, function () { closeStep(H); });
          }
          H.later('rebuild', 2500, function () {
            if (S.phase === 'play') {
              for (var s = 0; s < S.step; s++) fillStep(H, s);
              H.publish();
              sendImgs(H);
            } else if (S.phase === 'show') {
              for (var s2 = 0; s2 < S.steps; s2++) fillStep(H, s2);
              for (var i = 0; i <= S.ri; i++) sendReveal(H, S.rk, i);
            } else if (S.phase === 'over') {
              for (var s3 = 0; s3 < S.steps; s3++) fillStep(H, s3);
            }
          });
          H.publish();
          return true;
        },
        onRaw: function (from, d, V) {
          V0 = V;
          if (from !== api.hostId()) return;
          if (d.type === 'img') {
            imgCache[d.gid + '|' + d.step] = cleanStrokes(d.s);
            if (V.cur && V.cur.phase === 'play') V.redraw();
          } else if (d.type === 'rv') {
            var e = cleanEntry(d.e);
            if (e) rvCache[d.gid + '|' + d.k + '|' + d.i] = e;
            if (V.cur && V.cur.phase !== 'play') V.redraw();
          } else if (d.type === 'dumpq' && d.gid) {
            var items = knownItems(V, d.gid);
            if (items.length) V.act({ type: 'dump', gid: d.gid, items: items });
          }
        },
        onState: function (V, prev, cur) {
          V0 = V;
          if (!prev || prev.gid !== cur.gid) { viewK = null; layoutKey = ''; }
        },
        tick: function (V) {
          V0 = V;
          var cur = V.cur;
          if (!cur || cur.phase !== 'play') return;
          tickClock(V);
          if (!inGame(cur) || (cur.done && cur.done[api.me])) return;
          var l = V.left(), dkey = dkeyOf(cur);
          // se termina el tiempo: mandar lo que haya
          if (l != null && l < 700 && !autoSent[dkey]) { autoSent[dkey] = 1; submit(V, cur, V.priv, true); }
          if (cur.kind === 'desc' && !imgCache[dkey] && V.priv && V.priv.img && V.priv.step === cur.step) ask('img' + dkey, { type: 'imgq', gid: cur.gid, step: cur.step });
        },
        render: function (V, cur, priv) {
          V0 = V;
          if (cur.phase === 'play') renderPlay(V, cur, priv);
          else if (cur.phase === 'show') renderShow(V, cur);
          else renderOver(V, cur);
        },
        destroy: function () { if (ro) ro.disconnect(); }
      });
    }
  });

  var css = document.createElement('style');
  css.textContent =
    '.tl-top{display:flex;align-items:center;gap:8px;padding:6px 14px;font-size:13.5px;color:var(--muted);font-weight:700;flex:none;min-height:36px}' +
    '.tl-top b{color:var(--text)}' +
    '.tl-dots{display:flex;gap:4px;flex:1;justify-content:center;flex-wrap:wrap}' +
    '.tl-dots i{width:18px;height:18px;border-radius:50%;opacity:.3;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:11px;color:#000;font-weight:900}' +
    '.tl-dots i.on{opacity:1}' +
    '.tl-clock{font-weight:900;color:var(--accent);font-size:17px;min-width:40px;text-align:right}' +
    '.tl-clock.low{color:var(--danger)}' +
    '.tl-skip{border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:10px;height:30px;min-width:34px;font-size:14px}' +
    '.tl-prompt{padding:2px 14px 8px;font-size:14px;color:var(--muted);font-weight:700;text-align:center;flex:none}' +
    '.tl-prompt .tl-what{display:block;color:var(--text);font-size:21px;line-height:1.2;margin-top:2px}' +
    '.tl-prompt{font-size:16px}' +
    '.tl-board{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:0 8px;position:relative}' +
    '.tl-board canvas{border-radius:14px;touch-action:none;box-shadow:0 4px 16px #0006;display:block}' +
    '.tl-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;text-align:center;color:#555;font-weight:800;font-size:16px}' +
    '.tl-empty:empty{display:none}' +
    '.tl-tools{display:flex;gap:6px;justify-content:center;padding:8px 10px 0;flex-wrap:wrap;align-items:center;flex:none}' +
    '.tl-color{width:30px;height:30px;border-radius:50%;border:2px solid #fff3}' +
    '.tl-color.on{outline:3px solid var(--accent);outline-offset:1px}' +
    '.tl-size{width:38px;height:34px;border-radius:10px;border:1px solid var(--line);background:var(--panel);display:flex;align-items:center;justify-content:center}' +
    '.tl-size i{display:block;border-radius:50%;background:#fff}' +
    '.tl-size.on{border-color:var(--accent)}' +
    '.tl-foot{display:flex;gap:8px;align-items:center;padding:8px 12px calc(10px + var(--safe-b));flex:none}' +
    '.tl-foot .field{flex:1;font-size:16px;padding:11px 14px}' +
    '.tl-wait{flex:1;font-weight:800;color:var(--ok);font-size:15px}' +
    '.tl-mine{padding:0 14px;color:var(--muted);font-size:14px;text-align:center;flex:none}' +
    '.tl-mine b{color:var(--text)}' +
    '.tl-body{flex:1;overflow-y:auto;padding:16px}' +
    '.tl-card h3{margin:0 0 4px;font-size:20px}' +
    '.tl-row{display:flex;gap:8px}' +
    '.tl-row .field{flex:1;font-size:17px}' +
    '.tl-list{flex:1;min-height:0;overflow-y:auto;padding:8px 14px 16px;display:flex;flex-direction:column;gap:12px}' +
    '.tl-e{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:10px 12px;animation:fade .35s;flex:none}' +
    '.tl-by{font-size:13px;font-weight:800;color:var(--muted);margin-bottom:6px}' +
    '.tl-txt{font-size:20px;font-weight:800;line-height:1.25}' +
    '.tl-txt small{font-size:12px;color:var(--muted);font-weight:700}' +
    '.tl-imgw{position:relative}' +
    '.tl-img{display:block;border-radius:12px;margin:0 auto}' +
    '.tl-chains{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:12px}' +
    '.tl-chains .btn{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;font-size:15px}' +
    '.tl-chains .sw{width:12px;height:12px;border-radius:50%}' +
    '.kb .tl-prompt{padding-bottom:4px}' +
    '.kb .tl-prompt .tl-what{font-size:18px}' +
    '.kb .tl-mine{display:none}';
  document.head.appendChild(css);
})();
