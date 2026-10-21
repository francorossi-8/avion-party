/* Truco argentino (sin flor) de a 2, 4 o 6. Cada uno ve sus cartas en su celular. */
(function () {
  'use strict';
  var T = window.TrucoEngine;
  var SUIT_ICON = { e: '🗡️', b: '🪵', o: '🪙', c: '🍷' };
  var SUIT_NAME = { e: 'espada', b: 'basto', o: 'oro', c: 'copa' };
  var TEAM_COLOR = ['#4fb3ff', '#ff6f7d'];

  function cardHtml(c, cls, attrs) {
    if (!c) return '<div class="tc-card empty ' + (cls || '') + '"></div>';
    return '<div class="tc-card s-' + c[1] + ' ' + (cls || '') + '" ' + (attrs || '') + ' title="' + c[0] + ' de ' + SUIT_NAME[c[1]] + '">' +
      '<b>' + c[0] + '</b><span>' + SUIT_ICON[c[1]] + '</span><i>' + c[0] + '</i></div>';
  }

  App.register({
    id: 'truco', name: 'Truco', emoji: '🃏', players: '2·4·6',
    desc: 'Envido, truco, retruco y vale cuatro. De a 2, 4 o 6.',
    create: function (api) {
      function teamName(S, t) {
        if (S.seats.length === 2) return S.seats[t].name;
        return t === 0 ? 'Equipo A' : 'Equipo B';
      }
      function afterAct(H) {
        var S = H.S;
        if (S.phase === 'over') { S.keep = null; H.publish(); return; }
        if (S.hand.over) {
          H.publish();
          H.later('next', 4200, function () { T.newHand(S, H.P); S.offSince = null; H.publish(); });
          return;
        }
        H.publish();
      }

      return SyncGame(api, {
        wait: {
          emoji: '🃏', title: 'Truco', min: 2, max: 6,
          sub: 'Truco argentino sin flor, de a 2, 4 o 6 (en equipos se sientan intercalados). Cada uno ve sus cartas en su celular. ' +
            'Envido, real envido, falta envido, truco, retruco, vale cuatro y al mazo.',
          options: [
            { key: 'target', label: 'Partida a', value: 30, choices: [[15, '15'], [30, '30']] },
            { key: 'teams', label: 'Equipos', value: 'orden', choices: [['orden', 'Por orden'], ['azar', 'Al azar']] }
          ],
          check: function (players) {
            if ([2, 4, 6].indexOf(players.length) < 0) return 'El truco se juega de a 2, 4 o 6 (hay ' + players.length + ')';
            return null;
          }
        },
        start: function (H, vals, players) {
          if (vals.teams === 'azar') players = window.SyncUtil.shuffle(players.slice());
          var g = T.newGame(players, vals.target || 30);
          g.S.players = g.S.seats.map(function (s) { return { id: s.id, name: s.name, color: TEAM_COLOR[s.team] }; });
          H.set(g.S, g.P);
          H.publish();
        },
        action: function (H, from, d) {
          var S = H.S;
          if (S.phase !== 'play' || typeof d.a !== 'string') return;
          var seat = -1;
          S.seats.forEach(function (s, i) { if (s.id === from) seat = i; });
          if (seat < 0) return;
          var err = T.act(S, H.P, seat, d.a);
          if (err) return;
          S.offSince = null;
          afterAct(H);
        },
        hostTick: function (H) {
          var S = H.S;
          if (S.phase !== 'play' || S.hand.over) return;
          var h = S.hand, n = S.seats.length, who = -1, act = null;
          if (h.call) {
            var resp = [];
            for (var i = 0; i < n; i++) if (i % 2 !== h.call.by) resp.push(i);
            if (resp.every(function (s) { return !H.online(S.seats[s].id); })) { who = resp[0]; act = 'noquiero'; }
          } else if (!H.online(S.seats[h.turn].id)) { who = h.turn; act = 'play_0'; }
          if (who < 0) { S.offSince = null; return; }
          if (!S.offSince) { S.offSince = Date.now(); return; }
          if (Date.now() - S.offSince < 10000) return;
          S.offSince = null;
          if (!T.act(S, H.P, who, act)) afterAct(H);
        },
        resume: function (H) {
          if (H.S.phase === 'play' && H.S.hand.over) H.later('next', 2000, function () { T.newHand(H.S, H.P); H.publish(); });
        },
        priv: function (S, P, id) {
          var seat = -1;
          S.seats.forEach(function (s, i) { if (s.id === id) seat = i; });
          if (seat < 0) return null;
          return { seat: seat, hand: P.hands[seat] || [], legal: T.legal(S, P, seat), env: T.envido(P.orig[seat] || []) };
        },
        render: function (V, cur, priv) {
          var el = V.el, S = cur, h = S.hand, n = S.seats.length;
          var mySeat = priv ? priv.seat : -1;
          var myTeam = mySeat >= 0 ? mySeat % 2 : -1;
          var html = '<div class="tc-score">' + [0, 1].map(function (t) {
            var members = S.seats.filter(function (s) { return s.team === t; }).map(function (s) { return V.esc(s.name); }).join(' · ');
            return '<div class="tc-team" style="--c:' + TEAM_COLOR[t] + '"><small>' + (n === 2 ? '' : (t === 0 ? 'Equipo A' : 'Equipo B') + (t === myTeam ? ' (vos)' : '')) + '</small>' +
              '<b>' + S.score[t] + '</b><span>' + members + '</span></div>';
          }).join('<div class="tc-vs">a ' + S.target + '</div>') + '</div>';

          if (S.phase === 'over') {
            html += '<div class="wait"><div class="card" style="text-align:center"><div style="font-size:52px">🏆</div>' +
              '<p style="font-size:22px;font-weight:900;margin:6px 0;color:' + TEAM_COLOR[S.winner] + '">¡Ganó ' + V.esc(teamName(S, S.winner)) + '!</p>' +
              '<p class="hint" style="margin:0">' + S.score[0] + ' a ' + S.score[1] + '</p>' + V.endButtons() + '</div>' + logHtml(V, S) + '</div>';
            el.innerHTML = html;
            return;
          }

          // canto pendiente
          if (h.call) {
            var who = S.seats[h.call.seat];
            var what = h.call.kind === 'truco' ? T.TRUCO_NAMES[h.call.lvl] : h.call.chain.map(function (k) { return T.label(S, 'env_' + k); }).join(' + ');
            var mustAnswer = myTeam >= 0 && myTeam !== h.call.by;
            html += '<div class="tc-call' + (mustAnswer ? ' me' : '') + '"><b style="color:' + TEAM_COLOR[who.team] + '">' + V.esc(who.name) + '</b> cantó <b>' + what + '</b>' +
              (mustAnswer ? '<br><span>¡Te toca responder!</span>' : '<br><span>Responde ' + V.esc(teamName(S, 1 - h.call.by)) + '…</span>') + '</div>';
          } else if (!h.over) {
            var tp = S.seats[h.turn];
            html += '<div class="tc-turn">' + (h.turn === mySeat ? '<b style="color:var(--accent)">¡Te toca jugar!</b>' : 'Juega <b style="color:' + TEAM_COLOR[tp.team] + '">' + V.esc(tp.name) + '</b>') +
              (h.trucoLvl ? ' · se juega por ' + [1, 2, 3, 4][h.trucoLvl] : '') + '</div>';
          }

          // mesa: una fila por jugador con sus 3 bazas
          html += '<div class="tc-table">';
          for (var i = 0; i < n; i++) {
            var s = S.seats[i];
            var turn = !h.over && !h.call && h.turn === i;
            html += '<div class="tc-row' + (turn ? ' turn' : '') + '" style="--c:' + TEAM_COLOR[s.team] + '"><div class="tc-name">' + V.esc(s.name) +
              (i === mySeat ? ' <small>(vos)</small>' : '') + (i === S.mano ? ' <small>· mano</small>' : '') + '</div><div class="tc-slots">';
            for (var b = 0; b < 3; b++) {
              var bz = h.bazas[b], played = null, win = false;
              if (bz) bz.cards.forEach(function (c) { if (c.seat === i) played = c.card; });
              if (bz && bz.w != null && played) {
                var best = -1;
                bz.cards.forEach(function (c) { best = Math.max(best, T.rank(c.card)); });
                win = T.rank(played) === best && bz.w !== -1;
              }
              html += cardHtml(played, 'mini' + (win ? ' win' : ''));
            }
            html += '</div></div>';
          }
          html += '</div>';

          // resultado de la mano
          if (h.over && h.result) {
            var env = h.envido && h.envido.quiso ? '<br><small>Envido: ' + S.seats.map(function (st, k) { return V.esc(st.name) + ' ' + h.envido.vals[k]; }).join(' · ') + '</small>' : '';
            html += '<div class="tc-result" style="--c:' + TEAM_COLOR[h.result.team] + '"><b>' + V.esc(teamName(S, h.result.team)) + ' +' + h.result.pts + '</b> · ' + V.esc(h.result.why) + env +
              '<br><small>Próxima mano en un momento…</small></div>';
          } else if (h.envido && !h.over) {
            var e = h.envido;
            html += '<div class="tc-note">' + (e.quiso ? 'Envido para ' + V.esc(teamName(S, e.team)) + ' (+' + e.pts + '): ' +
              S.seats.map(function (st, k) { return V.esc(st.name) + ' ' + e.vals[k]; }).join(' · ') : 'No quisieron el envido: ' + V.esc(teamName(S, e.team)) + ' +' + e.pts) + '</div>';
          }

          // mis cartas y acciones
          if (priv) {
            var legal = priv.legal || [];
            html += '<div class="tc-hand">';
            priv.hand.forEach(function (c, k) {
              var can = legal.indexOf('play_' + k) >= 0;
              html += cardHtml(c, can ? 'big can' : 'big', can ? 'data-a="play_' + k + '" data-bot' : '');
            });
            html += '</div><div class="tc-env">Tu envido: <b>' + priv.env + '</b></div>';
            var acts = legal.filter(function (a) { return a.indexOf('play_') < 0 && a !== 'mazo'; });
            html += '<div class="tc-acts">' + acts.map(function (a) {
              var cls = a === 'quiero' ? '' : a === 'noquiero' ? ' ghost' : ' sing';
              return '<button class="btn small' + cls + '" data-a="' + a + '" data-bot>' + T.label(S, a) + '</button>';
            }).join('') + (legal.indexOf('mazo') >= 0 ? '<button class="btn small ghost tc-mazo" data-a="mazo">🏳️ Al mazo</button>' : '') + '</div>';
          } else {
            html += '<p class="hint">Estás mirando la partida.</p>';
          }
          html += logHtml(V, S);
          el.innerHTML = '<div class="tc-wrap">' + html + '</div>';
          el.onclick = function (ev) {
            var t = ev.target.closest('[data-a]');
            if (!t) return;
            var a = t.getAttribute('data-a');
            if (a === 'mazo' && t.getAttribute('data-sure') !== '1') { t.setAttribute('data-sure', '1'); t.textContent = '¿Seguro? Tocá de nuevo'; return; }
            V.act({ a: a });
            api.vibrate(a.indexOf('play_') === 0 ? 15 : 40);
          };
        },
        onState: function (V, prev, cur) {
          if (!prev || !prev.hand || !cur.hand || cur.phase !== 'play') return;
          var c = cur.hand.call, p = prev.hand.call;
          if (c && (!p || p.seat !== c.seat || p.kind !== c.kind || p.lvl !== c.lvl || (p.chain || []).length !== (c.chain || []).length)) api.vibrate([60, 40, 60]);
        }
      });

      function logHtml(V, S) {
        return '<div class="tc-log">' + S.log.slice(-5).reverse().map(function (l) {
          var s = l.s != null ? S.seats[l.s] : null;
          return '<div>' + (s ? '<b style="color:' + TEAM_COLOR[s.team] + '">' + V.esc(s.name) + ':</b> ' : '') + V.esc(l.t) + '</div>';
        }).join('') + '</div>';
      }
    }
  });

  var css = document.createElement('style');
  css.textContent =
    '.tc-wrap{flex:1;overflow-y:auto;padding:8px 12px calc(14px + var(--safe-b))}' +
    '.tc-score{display:flex;align-items:stretch;gap:8px;margin-bottom:8px}' +
    '.tc-team{flex:1;background:var(--panel);border:1px solid var(--line);border-top:4px solid var(--c);border-radius:14px;padding:6px 10px;text-align:center}' +
    '.tc-team small{display:block;font-size:11px;color:var(--muted);font-weight:800;min-height:14px}' +
    '.tc-team b{display:block;font-size:30px;line-height:1.1;color:var(--c)}' +
    '.tc-team span{display:block;font-size:12px;color:var(--muted);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.tc-vs{align-self:center;color:var(--muted);font-weight:800;font-size:12px}' +
    '.tc-call{background:#ffb5471c;border:2px solid var(--accent);border-radius:14px;padding:10px;text-align:center;font-size:17px;margin-bottom:8px;animation:up .2s}' +
    '.tc-call span{font-size:13px;color:var(--muted);font-weight:700}' +
    '.tc-call.me span{color:var(--accent)}' +
    '.tc-turn{text-align:center;font-weight:700;margin:2px 0 8px}' +
    '.tc-table{display:flex;flex-direction:column;gap:5px}' +
    '.tc-row{display:flex;align-items:center;gap:8px;background:var(--panel);border-radius:12px;padding:5px 8px;border-left:4px solid var(--c)}' +
    '.tc-row.turn{box-shadow:0 0 0 2px var(--accent)}' +
    '.tc-name{flex:1;font-weight:800;font-size:14px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.tc-name small{color:var(--muted);font-weight:700}' +
    '.tc-slots{display:flex;gap:5px}' +
    '.tc-card{position:relative;border-radius:8px;background:#fbf7ec;color:#222;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 2px 6px #0006;border:2px solid var(--sc,#999)}' +
    '.tc-card.empty{background:#ffffff0a;border:1px dashed #ffffff22;box-shadow:none}' +
    '.tc-card b{font-weight:900;line-height:1}' +
    '.tc-card i{position:absolute;font-style:normal;font-weight:900}' +
    '.tc-card.mini{width:34px;height:46px}' +
    '.tc-card.mini b{font-size:16px}.tc-card.mini span{font-size:13px}.tc-card.mini i{display:none}' +
    '.tc-card.win{box-shadow:0 0 0 3px var(--accent),0 2px 6px #0006}' +
    '.tc-card.big{width:84px;height:120px}' +
    '.tc-card.big b{font-size:38px}.tc-card.big span{font-size:30px;margin-top:4px}' +
    '.tc-card.big i{top:5px;left:7px;font-size:15px}' +
    '.tc-card.can{cursor:pointer;transform:translateY(-6px);box-shadow:0 0 0 3px #3ddc84,0 8px 16px #0007}' +
    '.tc-card.s-e{--sc:#3f6fd8;color:#24438f}.tc-card.s-b{--sc:#3d8f4a;color:#25602e}.tc-card.s-o{--sc:#d4a417;color:#8a6500}.tc-card.s-c{--sc:#d0433f;color:#952622}' +
    '.tc-hand{display:flex;gap:10px;justify-content:center;margin:14px 0 4px}' +
    '.tc-env{text-align:center;font-size:13px;color:var(--muted);font-weight:700}' +
    '.tc-acts{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:10px 0}' +
    '.tc-acts .sing{background:#c77dff;color:#1a0a2a;box-shadow:0 4px 14px #c77dff33}' +
    '.tc-mazo{opacity:.8}' +
    '.tc-result,.tc-note{margin:10px 0 0;padding:10px;border-radius:14px;background:var(--panel2);text-align:center;border:2px solid var(--c,var(--line))}' +
    '.tc-result small,.tc-note{font-size:13px;color:var(--muted)}' +
    '.tc-log{margin-top:10px;font-size:13px;color:var(--muted);display:flex;flex-direction:column;gap:2px}';
  document.head.appendChild(css);
})();
