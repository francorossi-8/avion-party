/* Tutti Frutti (Basta): letra al azar, categorías, el primero que completa grita ¡Basta!
   Después se revisan las respuestas entre todos. Única 10, repetida 5, si sos el único con respuesta 20. 2 a 8. */
(function () {
  'use strict';
  var U = window.SyncUtil;
  var LETTERS = 'ABCDEFGHIJLMNOPRSTUV'.split('');
  var CLASSIC = ['Nombre', 'Animal', 'País o ciudad', 'Fruta o verdura', 'Color', 'Cosa'];
  var POOL = ['Nombre', 'Apellido', 'Animal', 'País o ciudad', 'Fruta o verdura', 'Color', 'Cosa', 'Comida', 'Marca', 'Profesión',
    'Película o serie', 'Deporte', 'Famoso/a', 'Parte del cuerpo', 'Instrumento', 'Cantante o banda', 'Club de fútbol', 'Ropa',
    'Bebida', 'Algo de la casa', 'Algo que llevás de viaje', 'Verbo', 'Personaje', 'Juego'];
  var WRITE_MS = 120000, GRACE_MS = 3000;

  function valid(ans, letter) {
    var n = U.norm(ans);
    return n.length >= 2 && n.charAt(0) === letter.toLowerCase();
  }

  App.register({
    id: 'tutti', name: 'Tutti Frutti', emoji: '📝', players: '2-8',
    desc: 'Letra al azar, completá las categorías y gritá ¡Basta!',
    create: function (api) {
      var draft = {}, sentTimer = null, lastKey = '';

      function newRound(H) {
        var S = H.S, P = H.P;
        S.round++;
        if (S.round > S.rounds) { S.phase = 'over'; H.publish(); return; }
        var avail = LETTERS.filter(function (l) { return S.used.indexOf(l) < 0; });
        S.letter = avail[Math.floor(Math.random() * avail.length)];
        S.used.push(S.letter);
        S.stage = 'write';
        S.bastaBy = null;
        S.answers = null; S.rejects = {}; S.ready = []; S.roundPts = null;
        P.answers = {};
        H.deadline(WRITE_MS);
        H.later('stop', WRITE_MS, function () { toReview(H); });
        H.publish();
      }
      function toReview(H) {
        var S = H.S, P = H.P;
        if (S.stage !== 'write' && S.stage !== 'stopping') return;
        H.cancel('stop');
        S.stage = 'review';
        S.answers = {};
        S.players.forEach(function (p) {
          var a = (P.answers[p.id] || []).slice(0, S.cats.length);
          while (a.length < S.cats.length) a.push('');
          S.answers[p.id] = a.map(function (x) { return String(x || '').slice(0, 40).trim(); });
        });
        S.rejects = {};
        S.ready = [];
        H.deadline(null);
        H.publish();
      }
      function rejected(S, ci, pid) {
        var votes = (S.rejects[ci] && S.rejects[ci][pid]) || [];
        var others = S.players.length - 1;
        return votes.length > 0 && votes.length >= Math.ceil(others / 2);
      }
      function score(H) {
        var S = H.S;
        S.roundPts = {};
        S.players.forEach(function (p) { S.roundPts[p.id] = []; });
        S.cats.forEach(function (c, ci) {
          var ok = {};
          S.players.forEach(function (p) {
            var a = S.answers[p.id][ci];
            if (valid(a, S.letter) && !rejected(S, ci, p.id)) ok[p.id] = U.norm(a);
          });
          var ids = Object.keys(ok);
          S.players.forEach(function (p) {
            var pts = 0;
            if (ok[p.id] != null) {
              if (ids.length === 1) pts = 20;
              else pts = ids.filter(function (o) { return o !== p.id && ok[o] === ok[p.id]; }).length ? 5 : 10;
            }
            S.roundPts[p.id].push(pts);
            S.scores[p.id] += pts;
          });
        });
        S.stage = 'score';
        H.publish();
      }

      return SyncGame(api, {
        wait: {
          emoji: '📝', title: 'Tutti Frutti', min: 2, max: 8,
          sub: 'Sale una letra y cada uno completa las categorías con palabras que empiecen con esa letra. El primero que termina toca <b>¡Basta!</b> ' +
            'y los demás tienen 3 segundos. Después se revisan las respuestas entre todos: tocá las que no valen.<br>' +
            'Única: 10 · repetida: 5 · si sos el único que puso algo: 20.',
          options: [
            { key: 'rounds', label: 'Rondas', value: 5, choices: [[3, '3'], [5, '5'], [8, '8']] },
            { key: 'cats', label: 'Categorías', value: 'clasicas', choices: [['clasicas', 'Clásicas'], ['azar', 'Al azar']] }
          ]
        },
        start: function (H, vals, players) {
          var cats = vals.cats === 'azar' ? U.shuffle(POOL.slice()).slice(0, 6) : CLASSIC.slice();
          var scores = {};
          players.forEach(function (p) { scores[p.id] = 0; });
          H.set({ phase: 'play', players: players, round: 0, rounds: vals.rounds || 5, cats: cats, used: [], scores: scores }, { answers: {} });
          newRound(H);
        },
        action: function (H, from, d) {
          var S = H.S, P = H.P;
          var inGame = S.players.some(function (p) { return p.id === from; });
          if (!inGame) return;
          if (d.type === 'ans' && (S.stage === 'write' || S.stage === 'stopping') && d.round === S.round && Array.isArray(d.a)) {
            P.answers[from] = d.a.slice(0, S.cats.length).map(function (x) { return String(x || '').slice(0, 40); });
            if (d.basta && S.stage === 'write') {
              var filled = P.answers[from].every(function (x) { return U.norm(x).length > 0; });
              if (!filled) return;
              S.stage = 'stopping'; S.bastaBy = from;
              H.deadline(GRACE_MS);
              H.later('stop', GRACE_MS + 400, function () { toReview(H); });
              H.publish();
            }
          } else if (d.type === 'reject' && S.stage === 'review') {
            var ci = d.ci | 0, pid = d.pid;
            if (pid === from || !S.answers[pid] || ci < 0 || ci >= S.cats.length) return;
            S.rejects[ci] = S.rejects[ci] || {};
            var arr = S.rejects[ci][pid] = S.rejects[ci][pid] || [];
            var k = arr.indexOf(from);
            if (k >= 0) arr.splice(k, 1); else arr.push(from);
            H.publish();
          } else if (d.type === 'ready' && S.stage === 'review') {
            if (S.ready.indexOf(from) < 0) S.ready.push(from);
            var all = S.players.every(function (p) { return S.ready.indexOf(p.id) >= 0 || !H.online(p.id); });
            if (all) score(H); else H.publish();
          } else if (d.type === 'force' && from === api.me) {
            if (S.stage === 'review') score(H);
            else if (S.stage === 'write') toReview(H);
          } else if (d.type === 'next' && from === api.me && S.stage === 'score') {
            newRound(H);
          }
        },
        onState: function (V, prev, cur) {
          if (cur.phase === 'play' && (!prev || prev.phase !== 'play' || prev.round > cur.round)) draft = {};
        },
        resume: function (H) {
          var S = H.S;
          if (S.stage === 'write' || S.stage === 'stopping') H.later('stop', Math.max(1000, H.timeLeft() || 1000), function () { toReview(H); });
        },
        tick: function (V) {
          var c = api.el.querySelector('#tf-clock');
          if (!c) return;
          var l = V.left();
          if (l == null) { c.textContent = ''; return; }
          c.textContent = '⏱ ' + Math.ceil(l / 1000) + 's';
        },
        render: function (V, cur) {
          var el = V.el, me = V.me;
          var playing = cur.players.some(function (p) { return p.id === me; });
          var key = cur.phase + '|' + cur.round + '|' + cur.stage;
          var scoreBar = '<div class="scorebar">' + cur.players.slice().sort(function (a, b) { return cur.scores[b.id] - cur.scores[a.id]; }).map(function (p) {
            return '<span class="score" style="color:' + p.color + '"><span class="sw" style="background:' + p.color + '"></span><span style="color:var(--text)">' +
              V.esc(p.name) + '</span> ' + cur.scores[p.id] + '</span>';
          }).join('') + '</div>';

          if (cur.phase === 'over') {
            lastKey = key;
            var top = cur.players.slice().sort(function (a, b) { return cur.scores[b.id] - cur.scores[a.id]; });
            el.innerHTML = scoreBar + '<div class="wait"><div class="card" style="text-align:center"><div style="font-size:48px">🏆</div>' +
              V.winTitle(cur.players, function (p) { return cur.scores[p.id]; }) +
              '<p class="hint" style="margin:0">' + cur.scores[top[0].id] + ' puntos</p>' + V.endButtons() + '</div></div>';
            return;
          }

          if (cur.stage === 'write' || cur.stage === 'stopping') {
            var d = draft[cur.round] = draft[cur.round] || cur.cats.map(function () { return ''; });
            if (lastKey.indexOf('|' + cur.round + '|') < 0 || !el.querySelector('#tf-form')) {
              // armar el formulario una sola vez por ronda
              var html = scoreBar + '<div class="wait" style="padding-top:6px">' +
                '<div class="tf-head"><div class="tf-letter">' + cur.letter + '</div><div><b>Ronda ' + cur.round + ' de ' + cur.rounds + '</b>' +
                '<div id="tf-clock" class="hint" style="text-align:left;margin:2px 0 0"></div><div id="tf-status" class="hint" style="text-align:left;margin:2px 0 0"></div></div></div>' +
                '<form id="tf-form" autocomplete="off">';
              cur.cats.forEach(function (c, i) {
                html += '<label class="tf-row"><span>' + V.esc(c) + '</span><input class="field" data-i="' + i + '" data-bot-input maxlength="40" ' +
                  (playing ? '' : 'disabled') + ' placeholder="' + cur.letter + '…" autocapitalize="words"></label>';
              });
              html += '</form>' + (playing ? '<button class="btn block" id="tf-basta" data-bot style="margin-top:10px">✋ ¡BASTA!</button>' : '<p class="hint">Estás mirando esta ronda.</p>') +
                (V.isHost() ? '<p class="hint"><button class="btn small ghost" data-a="force">Cortar la ronda</button></p>' : '') + '</div>';
              el.innerHTML = html;
              Array.prototype.forEach.call(el.querySelectorAll('#tf-form input'), function (inp) {
                var i = +inp.getAttribute('data-i');
                inp.value = d[i] || '';
                inp.addEventListener('input', function () { d[i] = inp.value; sendSoon(V, cur.round, false); paintStatus(V); });
                inp.addEventListener('keydown', function (e) {
                  if (e.key === 'Enter') { e.preventDefault(); var nx = el.querySelector('#tf-form input[data-i="' + (i + 1) + '"]'); if (nx) nx.focus(); else inp.blur(); }
                });
              });
              el.onclick = function (e) {
                var b = e.target.closest('#tf-basta,[data-a]');
                if (!b) return;
                if (b.id === 'tf-basta') {
                  var lt = cur.letter;
                  var missing = d.filter(function (x) { return U.norm(x).length === 0; }).length;
                  if (missing) { api.toast('Completá todas las categorías para decir ¡Basta!'); return; }
                  var bad = d.filter(function (x) { return !valid(x, lt); }).length;
                  if (bad) api.toast('Ojo: ' + bad + ' no empieza' + (bad > 1 ? 'n' : '') + ' con ' + lt);
                  V.act({ type: 'ans', round: cur.round, a: d.slice(), basta: true });
                  api.vibrate(60);
                } else V.act({ type: b.getAttribute('data-a') });
              };
            }
            lastKey = key;
            paintStatus(V);
            this.tick(V);
            if (cur.stage === 'stopping') {
              // ¡Basta!: mandar lo que haya y bloquear al terminar la gracia
              V.act({ type: 'ans', round: cur.round, a: d.slice() });
              var l = V.left();
              setTimeout(function () {
                Array.prototype.forEach.call(el.querySelectorAll('#tf-form input'), function (inp) { inp.disabled = true; });
                V.act({ type: 'ans', round: cur.round, a: d.slice() });
              }, Math.max(0, (l == null ? 0 : l) - 150));
            }
            return;
          }

          lastKey = key;
          if (cur.stage === 'review') {
            var html2 = scoreBar + '<div class="wait" style="padding-top:6px"><div class="tf-head"><div class="tf-letter">' + cur.letter + '</div><div><b>Revisión</b>' +
              '<div class="hint" style="text-align:left;margin:2px 0 0">Tocá las respuestas que no valen. Se anulan si la mitad (o más) vota en contra.</div></div></div>';
            cur.cats.forEach(function (c, ci) {
              html2 += '<h2>' + V.esc(c) + '</h2><div class="tf-answers">';
              cur.players.forEach(function (p) {
                var a = cur.answers[p.id][ci];
                var votes = (cur.rejects[ci] && cur.rejects[ci][p.id]) || [];
                var auto = !valid(a, cur.letter);
                var rej = !auto && votes.length > 0 && votes.length >= Math.ceil((cur.players.length - 1) / 2);
                var mineVote = votes.indexOf(me) >= 0;
                var canVote = playing && p.id !== me && !auto;
                html2 += '<button class="tf-ans' + (auto || rej ? ' bad' : '') + (mineVote ? ' voted' : '') + '" ' +
                  (canVote ? 'data-ci="' + ci + '" data-pid="' + p.id + '" data-bot' : 'disabled') + ' style="--c:' + p.color + '">' +
                  '<small>' + V.esc(p.name) + '</small>' + (a ? V.esc(a) : '—') + (votes.length && !auto ? ' <em>✋' + votes.length + '</em>' : '') + '</button>';
              });
              html2 += '</div>';
            });
            var amReady = cur.ready.indexOf(me) >= 0;
            html2 += playing ? '<button class="btn block" id="tf-ready" ' + (amReady ? 'disabled' : 'data-bot') + ' style="margin-top:14px">' +
              (amReady ? 'Esperando a los demás (' + cur.ready.length + '/' + cur.players.length + ')' : '✔ Listo, sumar puntos') + '</button>' : '';
            if (V.isHost()) html2 += '<p class="hint"><button class="btn small ghost" data-a="force">Sumar puntos ya</button></p>';
            el.innerHTML = html2 + '</div>';
            el.onclick = function (e) {
              var b = e.target.closest('[data-ci],#tf-ready,[data-a]');
              if (!b || b.disabled) return;
              if (b.id === 'tf-ready') V.act({ type: 'ready' });
              else if (b.hasAttribute('data-a')) V.act({ type: b.getAttribute('data-a') });
              else V.act({ type: 'reject', ci: +b.getAttribute('data-ci'), pid: b.getAttribute('data-pid') });
            };
            return;
          }

          // puntos de la ronda
          var rows = cur.players.slice().sort(function (a, b) {
            var sa = cur.roundPts[a.id].reduce(function (x, y) { return x + y; }, 0), sb = cur.roundPts[b.id].reduce(function (x, y) { return x + y; }, 0);
            return sb - sa;
          }).map(function (p) {
            var pts = cur.roundPts[p.id], sum = pts.reduce(function (x, y) { return x + y; }, 0);
            return '<div class="pitem" style="flex-wrap:wrap"><span class="sw" style="background:' + p.color + ';color:' + p.color + '"></span>' + V.esc(p.name) +
              '<span class="tag" style="color:var(--text)">+' + sum + '</span><div style="width:100%;font-size:12px;color:var(--muted);font-weight:600">' +
              cur.cats.map(function (c, i) { return V.esc(c) + ': ' + (cur.answers[p.id][i] || '—') + ' (' + pts[i] + ')'; }).join(' · ') + '</div></div>';
          }).join('');
          el.innerHTML = scoreBar + '<div class="wait"><div class="tf-head"><div class="tf-letter">' + cur.letter + '</div><div><b>Puntos de la ronda ' + cur.round + '</b></div></div>' +
            '<div class="plist">' + rows + '</div>' +
            (V.isHost() ? '<button class="btn block" data-a="next" data-bot>' + (cur.round >= cur.rounds ? 'Ver el final' : 'Siguiente letra') + '</button>' : '<p class="hint">El anfitrión arranca la próxima letra.</p>') + '</div>';
          el.onclick = function (e) { var b = e.target.closest('[data-a]'); if (b) V.act({ type: b.getAttribute('data-a') }); };
        }
      });

      function sendSoon(V, round, basta) {
        clearTimeout(sentTimer);
        sentTimer = setTimeout(function () { V.act({ type: 'ans', round: round, a: (draft[round] || []).slice(), basta: basta }); }, 500);
      }
      function paintStatus(V) {
        var cur = V.cur, st = api.el.querySelector('#tf-status');
        if (!st || !cur) return;
        if (cur.stage === 'stopping') {
          st.innerHTML = '<b style="color:var(--danger)">¡' + V.esc(V.player(cur.bastaBy).name) + ' dijo BASTA!</b>';
          var b = api.el.querySelector('#tf-basta');
          if (b) { b.disabled = true; b.removeAttribute('data-bot'); }
          return;
        }
        var d = draft[cur.round] || [];
        var n = d.filter(function (x) { return U.norm(x).length > 0; }).length;
        st.textContent = n + ' de ' + cur.cats.length + ' completas';
        Array.prototype.forEach.call(api.el.querySelectorAll('#tf-form input'), function (inp) {
          var v = inp.value;
          inp.classList.toggle('bad', v.trim().length > 0 && !valid(v, cur.letter));
        });
      }
    }
  });

  var css = document.createElement('style');
  css.textContent =
    '.tf-head{display:flex;gap:14px;align-items:center;margin:4px 0 12px}' +
    '.tf-letter{width:64px;height:64px;border-radius:18px;background:var(--accent);color:var(--accent-ink);font-size:40px;font-weight:900;display:flex;align-items:center;justify-content:center;flex:none;box-shadow:0 6px 18px #ffb54744}' +
    '.tf-row{display:flex;flex-direction:column;gap:4px;margin-bottom:10px;font-weight:800;font-size:13px;color:var(--muted)}' +
    '.tf-row .field{font-size:17px;padding:11px 14px}' +
    '.tf-row .field.bad{border-color:var(--danger)}' +
    '.tf-answers{display:flex;flex-wrap:wrap;gap:6px}' +
    '.tf-ans{border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:12px;padding:6px 10px;font-weight:800;font-size:15px;text-align:left;border-left:4px solid var(--c)}' +
    '.tf-ans small{display:block;font-size:11px;color:var(--muted);font-weight:700}' +
    '.tf-ans.bad{text-decoration:line-through;opacity:.5}' +
    '.tf-ans.voted{box-shadow:0 0 0 2px var(--danger)}' +
    '.tf-ans em{font-style:normal;color:var(--danger);font-size:12px}' +
    '.tf-ans:disabled{cursor:default}' +
    // con el teclado abierto, la letra y el reloj quedan fijos arriba mientras bajás por las categorías
    '.kb .tf-head{position:sticky;top:-6px;z-index:3;background:var(--bg);margin:0 -16px 6px;padding:6px 16px;box-shadow:0 6px 10px -6px #0008}' +
    '.kb .tf-letter{width:44px;height:44px;font-size:28px;border-radius:13px}';
  document.head.appendChild(css);
})();
