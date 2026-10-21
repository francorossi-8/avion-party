/* Reflejos: la pantalla se pone verde y gana el más rápido. Cada celular mide su propio tiempo,
   así que la demora del wifi no influye. A veces hay trampa: pantalla azul, ¡no toques! 1 a 8. */
(function () {
  'use strict';

  App.register({
    id: 'reflejos', name: 'Reflejos', emoji: '⚡', players: '1-8',
    desc: 'Tocá apenas se ponga verde. Si te adelantás, perdés.',
    create: function (api) {
      var R = null; // ronda local {rid, t0, delay, trap, trapAt, done, greenAt, result}
      var timers = [];
      function clearT() { timers.forEach(clearTimeout); timers = []; }

      function newRound(H) {
        var S = H.S;
        S.round++;
        S.rid++;
        S.stage = 'go';
        S.delay = 1600 + Math.floor(Math.random() * 3200);
        S.trap = Math.random() < 0.3;
        S.trapAt = S.trap ? 500 + Math.floor(Math.random() * (S.delay - 900)) : 0;
        S.results = {};
        H.publish();
        H.later('close', S.delay + 3500, function () { closeRound(H); });
      }
      function closeRound(H) {
        var S = H.S;
        if (S.stage !== 'go') return;
        H.cancel('close');
        S.stage = 'results';
        var valid = [];
        S.players.forEach(function (p) {
          var r = S.results[p.id];
          if (r == null) S.results[p.id] = { miss: true };
          else if (!r.early && r.ms != null) valid.push([p.id, r.ms]);
        });
        valid.sort(function (a, b) { return a[1] - b[1]; });
        var pts = [3, 2, 1];
        S.gain = {};
        valid.forEach(function (v, i) { if (pts[i]) { S.gain[v[0]] = pts[i]; S.scores[v[0]] += pts[i]; } });
        S.players.forEach(function (p) { if (S.results[p.id].early) { S.gain[p.id] = -1; S.scores[p.id] -= 1; } });
        if (valid.length) {
          var b = S.best;
          if (!b || valid[0][1] < b.ms) S.best = { id: valid[0][0], ms: valid[0][1] };
        }
        H.publish();
        H.later('next', 3200, function () {
          if (S.round >= S.rounds) { S.phase = 'over'; S.stage = 'over'; S.keep = { scores: S.scores, players: S.players }; H.publish(); }
          else newRound(H);
        });
      }

      return SyncGame(api, {
        wait: {
          emoji: '⚡', title: 'Reflejos', min: 1, max: 8,
          sub: 'Cuando la pantalla se ponga <b style="color:#3ddc84">VERDE</b>, tocá lo más rápido que puedas. ' +
            'Si tocás antes, perdés un punto. Ojo: a veces aparece <b style="color:#4fb3ff">AZUL</b> para engañarte.<br>' +
            'Cada ronda: 1° 3 pts · 2° 2 pts · 3° 1 pt.',
          options: [{ key: 'rounds', label: 'Rondas', value: 10, choices: [[5, '5'], [10, '10'], [15, '15']] }]
        },
        start: function (H, vals, players) {
          var scores = {};
          players.forEach(function (p) { scores[p.id] = 0; });
          H.set({ phase: 'play', players: players, round: 0, rounds: vals.rounds || 10, rid: 0, stage: 'go', scores: scores, results: {}, best: null });
          newRound(H);
        },
        action: function (H, from, d) {
          var S = H.S;
          if (d.type !== 'tap' || S.stage !== 'go' || d.rid !== S.rid) return;
          if (!S.players.some(function (p) { return p.id === from; }) || S.results[from]) return;
          S.results[from] = d.early ? { early: true } : (d.ms == null ? { miss: true } : { ms: Math.max(60, Math.min(5000, +d.ms)) });
          var all = S.players.every(function (p) { return S.results[p.id] || !H.online(p.id); });
          if (all) closeRound(H); else H.publish();
        },
        resume: function (H) { if (H.S.stage === 'go') H.later('close', 4000, function () { closeRound(H); }); },
        onState: function (V, prev, cur) {
          if (cur.phase !== 'play' || cur.stage !== 'go') return;
          if (R && R.rid === cur.rid) return;
          // ronda nueva: línea de tiempo local
          clearT();
          var playing = cur.players.some(function (p) { return p.id === V.me; });
          R = { rid: cur.rid, t0: performance.now(), delay: cur.delay, trap: cur.trap, trapAt: cur.trapAt, state: 'wait', playing: playing };
          if (cur.trap) {
            timers.push(setTimeout(function () { if (R.state === 'wait') { R.state = 'trap'; paint(V); } }, cur.trapAt));
            timers.push(setTimeout(function () { if (R.state === 'trap') { R.state = 'wait'; paint(V); } }, cur.trapAt + 650));
          }
          timers.push(setTimeout(function () {
            if (R.state === 'wait' || R.state === 'trap') { R.state = 'go'; R.greenAt = performance.now(); paint(V); api.vibrate(30); }
          }, cur.delay));
          timers.push(setTimeout(function () {
            if (R.state === 'go' && R.playing) { R.state = 'miss'; V.act({ type: 'tap', rid: R.rid, ms: null }); paint(V); }
          }, cur.delay + 2500));
        },
        render: function (V, cur) {
          var el = V.el;
          var order = cur.players.slice().sort(function (a, b) { return cur.scores[b.id] - cur.scores[a.id]; });
          var html = '<div class="scorebar">' + order.map(function (p) {
            return '<span class="score" style="color:' + p.color + '"><span class="sw" style="background:' + p.color + '"></span><span style="color:var(--text)">' +
              V.esc(p.name) + '</span> ' + cur.scores[p.id] + '</span>';
          }).join('') + '</div>';
          if (cur.phase === 'over') {
            var w = order[0];
            html += '<div class="wait"><div class="card" style="text-align:center"><div style="font-size:52px">⚡</div>' +
              V.winTitle(cur.players, function (p) { return cur.scores[p.id]; }) +
              (cur.best ? '<p class="hint" style="margin:0">Récord: ' + V.tag(cur.best.id) + ' con ' + cur.best.ms + ' ms</p>' : '') +
              V.endButtons() + '</div></div>';
            el.innerHTML = html;
            el.onpointerdown = null;
            return;
          }
          html += '<div class="banner" style="font-size:14px;color:var(--muted)">Ronda ' + cur.round + ' de ' + cur.rounds + '</div>';
          html += '<div id="rf-pad" class="rf-pad" data-bot></div>';
          if (cur.stage === 'results') {
            var rows = cur.players.slice().sort(function (a, b) {
              var ra = cur.results[a.id], rb = cur.results[b.id];
              var va = ra.ms != null ? ra.ms : (ra.early ? 1e9 : 1e8), vb = rb.ms != null ? rb.ms : (rb.early ? 1e9 : 1e8);
              return va - vb;
            }).map(function (p) {
              var r = cur.results[p.id], g = cur.gain && cur.gain[p.id];
              var txt = r.ms != null ? r.ms + ' ms' : r.early ? '¡Se adelantó!' : 'No tocó';
              return '<div class="pitem"><span class="sw" style="background:' + p.color + ';color:' + p.color + '"></span>' + V.esc(p.name) +
                '<span class="tag" style="color:var(--text)">' + txt + (g ? ' · ' + (g > 0 ? '+' : '') + g : '') + '</span></div>';
            }).join('');
            html += '<div class="wait" style="flex:0 0 auto;padding-top:0"><div class="plist">' + rows + '</div></div>';
          }
          el.innerHTML = html;
          paint(V);
          el.onpointerdown = function (e) {
            if (!e.target.closest('#rf-pad')) return;
            e.preventDefault();
            if (!R || !R.playing || cur.stage !== 'go' || R.rid !== cur.rid) return;
            if (R.state === 'wait' || R.state === 'trap') {
              R.state = 'early'; V.act({ type: 'tap', rid: R.rid, early: true }); api.vibrate(200); paint(V);
            } else if (R.state === 'go') {
              var ms = Math.round(performance.now() - R.greenAt);
              R.state = 'done'; R.ms = ms; V.act({ type: 'tap', rid: R.rid, ms: ms }); paint(V);
            }
          };
        },
        destroy: clearT
      });

      function paint(V) {
        var pad = api.el.querySelector('#rf-pad');
        var cur = V.cur;
        if (!pad || !cur) return;
        var bg = '#2a3050', big = '', small = '';
        if (cur.stage === 'results') { bg = '#1b2445'; big = '🏁'; small = 'Siguiente ronda en un momento…'; }
        else if (!R || R.rid !== cur.rid) { big = '…'; }
        else if (!R.playing) {
          bg = R.state === 'go' ? '#1f8f52' : R.state === 'trap' ? '#1f5f9f' : '#8f2a36'; big = '👀'; small = 'Estás mirando';
        } else if (R.state === 'wait') { bg = '#a8293a'; big = 'Esperá…'; small = 'No toques todavía'; }
        else if (R.state === 'trap') { bg = '#1f62b0'; big = '¡NO!'; small = 'Es una trampa'; }
        else if (R.state === 'go') { bg = '#1fae5c'; big = '¡TOCÁ!'; }
        else if (R.state === 'done') { bg = '#1b2445'; big = R.ms + ' ms'; small = 'Esperando a los demás…'; }
        else if (R.state === 'early') { bg = '#3a1a22'; big = '😬'; small = 'Te adelantaste (−1)'; }
        else if (R.state === 'miss') { bg = '#1b2445'; big = '😴'; small = 'No tocaste'; }
        pad.style.background = bg;
        pad.innerHTML = '<div class="rf-big">' + big + '</div><div class="rf-small">' + small + '</div>';
      }
    }
  });

  var css = document.createElement('style');
  css.textContent =
    '.rf-pad{flex:1;min-height:200px;margin:6px 12px calc(14px + var(--safe-b));border-radius:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'touch-action:none;user-select:none;transition:background .06s;box-shadow:inset 0 0 0 2px #ffffff14}' +
    '.rf-big{font-size:54px;font-weight:900;color:#fff;text-shadow:0 4px 18px #0006}' +
    '.rf-small{font-size:16px;font-weight:700;color:#ffffffcc;margin-top:8px}';
  document.head.appendChild(css);
})();
