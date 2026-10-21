/* Generala: 5 dados, hasta 3 tiros por turno, 11 categorías. 1 a 8 jugadores. */
(function () {
  'use strict';
  var U = window.SyncUtil;
  var CATS = [
    ['1', 'Al 1'], ['2', 'Al 2'], ['3', 'Al 3'], ['4', 'Al 4'], ['5', 'Al 5'], ['6', 'Al 6'],
    ['E', 'Escalera'], ['F', 'Full'], ['P', 'Póker'], ['G', 'Generala'], ['D', 'Doble'] ];
  var PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

  function counts(d) { var c = [0, 0, 0, 0, 0, 0, 0]; d.forEach(function (v) { c[v]++; }); return c; }
  function isEscalera(d) {
    var s = d.slice().sort().join('');
    return s === '12345' || s === '23456' || s === '13456';
  }
  /** Puntos que vale anotar `cat` con estos dados. */
  function points(cat, d, servida, sheet) {
    var c = counts(d);
    if (/^[1-6]$/.test(cat)) { var n = +cat; return c[n] * n; }
    var max = Math.max.apply(null, c);
    var hasFull = c.indexOf(3) >= 0 && c.indexOf(2) >= 0;
    if (cat === 'E') return isEscalera(d) ? (servida ? 25 : 20) : 0;
    if (cat === 'F') return hasFull ? (servida ? 35 : 30) : 0;
    if (cat === 'P') return max >= 4 ? (servida ? 45 : 40) : 0;
    if (cat === 'G') return max === 5 ? 50 : 0;
    if (cat === 'D') return max === 5 && sheet && sheet.G === 50 ? 100 : 0;
    return 0;
  }
  function total(sheet) {
    var t = 0;
    Object.keys(sheet || {}).forEach(function (k) { if (sheet[k] != null) t += sheet[k]; });
    return t;
  }
  function full(sheet) { return CATS.every(function (c) { return sheet[c[0]] != null; }); }
  function dieHtml(v, cls, extra) {
    var html = '<div class="gn-die ' + (cls || '') + '"' + (extra || '') + '>';
    for (var i = 0; i < 9; i++) html += '<i' + (PIPS[v] && PIPS[v].indexOf(i) >= 0 ? ' class="on"' : '') + '></i>';
    return html + '</div>';
  }
  function roll() { return 1 + Math.floor(Math.random() * 6); }

  App.register({
    id: 'generala', name: 'Generala', emoji: '🎲', players: '1-8',
    desc: 'Dados por turnos: escalera, full, póker y generala.',
    create: function (api) {
      var anim = { id: -1, until: 0 };
      var shownDice = [0, 0, 0, 0, 0];
      var lastRollSeen = -1;

      function nextTurn(H) {
        var S = H.S, n = S.players.length;
        for (var k = 1; k <= n; k++) {
          var t = (S.turn + k) % n;
          if (!full(S.sheet[S.players[t].id])) {
            S.turn = t; S.rolls = 0; S.held = [false, false, false, false, false]; S.offSince = null;
            return true;
          }
        }
        return false;
      }
      function finish(H, winnerId, why) {
        var S = H.S;
        S.phase = 'over';
        if (!winnerId) {
          var best = -1;
          S.players.forEach(function (p) { var t = total(S.sheet[p.id]); if (t > best) { best = t; winnerId = p.id; } });
        }
        S.winner = winnerId; S.why = why || null;
        H.publish();
      }

      return SyncGame(api, {
        wait: {
          emoji: '🎲', title: 'Generala', min: 1, max: 8,
          sub: 'Hasta 3 tiros por turno: tocá los dados que querés guardar y volvé a tirar. Después anotá en una categoría (o tachá una). ' +
            'Escalera 20, Full 30, Póker 40, Generala 50 (+5 si sale servida). Doble generala 100.',
          options: [{ key: 'servida', label: 'Generala servida gana', value: true, choices: [[true, 'Sí'], [false, 'No']] }]
        },
        start: function (H, vals, players) {
          var sheet = {};
          players.forEach(function (p) { sheet[p.id] = {}; });
          H.set({
            phase: 'play', players: players, turn: Math.floor(Math.random() * players.length), dice: [1, 2, 3, 4, 5],
            held: [false, false, false, false, false], rolls: 0, rollId: 0, sheet: sheet, servidaWins: vals.servida !== false, last: null
          });
          H.publish();
        },
        action: function (H, from, d) {
          var S = H.S;
          if (S.phase !== 'play') return;
          var tp = S.players[S.turn];
          if (!tp || tp.id !== from) return;
          if (d.type === 'roll') {
            if (S.rolls >= 3) return;
            S.dice = S.dice.map(function (v, i) { return S.rolls > 0 && S.held[i] ? v : roll(); });
            S.rolls++; S.rollId++;
            if (S.rolls === 1) S.held = [false, false, false, false, false];
            if (S.rolls === 1 && counts(S.dice).indexOf(5) >= 0 && S.servidaWins) {
              S.last = { id: from, cat: 'G', pts: 50, servida: true };
              finish(H, from, '¡Generala servida!');
              return;
            }
            H.publish();
          } else if (d.type === 'hold') {
            if (S.rolls < 1 || S.rolls >= 3) return;
            var i = d.i | 0;
            if (i < 0 || i > 4) return;
            S.held[i] = !S.held[i];
            H.publish();
          } else if (d.type === 'score') {
            if (S.rolls < 1) return;
            var sh = S.sheet[from];
            if (!sh || sh[d.cat] != null || !CATS.some(function (c) { return c[0] === d.cat; })) return;
            var pts = points(d.cat, S.dice, S.rolls === 1, sh);
            sh[d.cat] = pts;
            S.last = { id: from, cat: d.cat, pts: pts, servida: S.rolls === 1 && pts > 0 && /[EFPG]/.test(d.cat) };
            if (!nextTurn(H)) { finish(H); return; }
            H.publish();
          }
        },
        hostTick: function (H) {
          var S = H.S;
          if (S.phase !== 'play') return;
          var tp = S.players[S.turn];
          if (H.online(tp.id)) { S.offSince = null; return; }
          if (!S.offSince) { S.offSince = Date.now(); return; }
          if (Date.now() - S.offSince < 8000) return;
          // jugador desconectado: se le tacha la primera categoría libre
          var sh = S.sheet[tp.id];
          for (var i = 0; i < CATS.length; i++) if (sh[CATS[i][0]] == null) { sh[CATS[i][0]] = 0; break; }
          S.last = { id: tp.id, cat: CATS[i] ? CATS[i][0] : '', pts: 0, auto: true };
          if (!nextTurn(H)) { finish(H); return; }
          H.publish();
        },
        render: function (V, cur) {
          var me = V.me, el = V.el;
          shownDice = cur.rolls === 0 && cur.phase === 'play' ? [0, 0, 0, 0, 0] : cur.dice.slice();
          var tp = cur.players[cur.turn];
          var myTurn = cur.phase === 'play' && tp && tp.id === me;
          // animación de tirada
          if (cur.rollId !== lastRollSeen) {
            if (lastRollSeen !== -1 && cur.rolls > 0) { anim = { id: cur.rollId, until: performance.now() + 550 }; api.vibrate(20); }
            lastRollSeen = cur.rollId;
          }
          var html = '<div class="scorebar">' + cur.players.map(function (p, i) {
            return '<span class="score' + (cur.phase === 'play' && i === cur.turn ? ' turn' : '') + '" style="color:' + p.color + '"><span class="sw" style="background:' + p.color + '"></span>' +
              '<span style="color:var(--text)">' + V.esc(p.name) + '</span> ' + total(cur.sheet[p.id]) + '</span>';
          }).join('') + '</div>';
          html += '<div class="wait" style="padding-top:4px">';
          if (cur.phase === 'over') {
            var w = V.player(cur.winner);
            html += '<div class="card" style="text-align:center;margin-bottom:12px"><div style="font-size:48px">🏆</div>' +
              (cur.why ? '<p style="font-size:22px;font-weight:900;margin:4px 0;color:' + w.color + '">¡Ganó ' + V.esc(w.name) + '!</p>'
                : V.winTitle(cur.players, function (p) { return total(cur.sheet[p.id]); })) +
              (cur.why ? '<p class="hint" style="margin:0">' + cur.why + '</p>' : '') + V.endButtons() + '</div>';
          } else {
            html += '<p class="banner" style="margin:0">' + (myTurn ? '<span style="color:' + tp.color + '">¡Tu turno!</span>' : 'Turno de ' + V.tag(tp.id)) +
              ' · tiro ' + cur.rolls + '/3</p>';
          }
          // dados
          html += '<div class="gn-dice" id="gn-dice">';
          cur.dice.forEach(function (v, i) {
            var held = cur.held[i] && cur.rolls > 0 && cur.rolls < 3;
            var canHold = myTurn && cur.rolls >= 1 && cur.rolls < 3;
            html += dieHtml(cur.rolls === 0 && cur.phase === 'play' ? 0 : v, (held ? 'held' : '') + (canHold ? ' tap' : ''),
              ' data-i="' + i + '"' + (canHold ? ' data-bot' : ''));
          });
          html += '</div>';
          if (myTurn) {
            html += '<button class="btn block" id="gn-roll" ' + (cur.rolls >= 3 ? 'disabled' : 'data-bot') + ' style="margin:6px 0 4px">🎲 ' +
              (cur.rolls === 0 ? 'Tirar los dados' : cur.rolls >= 3 ? 'Ya tiraste 3 veces: anotá' : 'Volver a tirar (' + (cur.rolls + 1) + '/3)') + '</button>';
            html += '<p class="hint" style="margin:2px 0 8px">' + (cur.rolls === 0 ? 'Tirá para empezar.' : cur.rolls < 3 ? 'Tocá los dados para guardarlos · tocá una categoría para anotar.' : 'Elegí dónde anotar (o tachá).') + '</p>';
          } else if (cur.last && cur.phase === 'play') {
            var lp = V.player(cur.last.id);
            html += '<p class="hint" style="margin:4px 0 8px">' + V.esc(lp.name) + ' anotó ' + (cur.last.pts ? cur.last.pts : 'tachó') + ' en ' +
              (CATS.filter(function (c) { return c[0] === cur.last.cat; })[0] || ['', '?'])[1] + (cur.last.servida ? ' (¡servida!)' : '') + '</p>';
          }
          // planilla
          var sheetMine = cur.sheet[me];
          html += '<div class="gn-sheet"><table><thead><tr><th></th>' + cur.players.map(function (p) {
            return '<th style="color:' + p.color + '">' + V.esc(p.name.slice(0, 4)) + '</th>';
          }).join('') + '</tr></thead><tbody>';
          CATS.forEach(function (c) {
            html += '<tr><td class="lbl">' + c[1] + '</td>';
            cur.players.forEach(function (p) {
              var v = cur.sheet[p.id][c[0]];
              var mine = p.id === me;
              if (v != null) html += '<td class="' + (mine ? 'mine' : '') + '">' + (v === 0 ? '✕' : v) + '</td>';
              else if (mine && myTurn && cur.rolls > 0) {
                var pt = points(c[0], cur.dice, cur.rolls === 1, sheetMine);
                html += '<td class="mine opt" data-cat="' + c[0] + '" data-bot>' + (pt ? pt : '✕') + '</td>';
              } else html += '<td class="' + (mine ? 'mine' : '') + '"></td>';
            });
            html += '</tr>';
          });
          html += '<tr class="tot"><td class="lbl">Total</td>' + cur.players.map(function (p) { return '<td>' + total(cur.sheet[p.id]) + '</td>'; }).join('') + '</tr>';
          html += '</tbody></table></div></div>';
          el.innerHTML = html;
          if (anim.until > performance.now()) shake();

          el.onclick = function (e) {
            var t = e.target.closest('[data-i],[data-cat],#gn-roll');
            if (!t || !myTurn) return;
            if (t.id === 'gn-roll') { V.act({ type: 'roll' }); return; }
            if (t.hasAttribute('data-cat')) {
              var cat = t.getAttribute('data-cat');
              var pt = points(cat, cur.dice, cur.rolls === 1, sheetMine);
              // tachar pide un segundo toque (para no hacerlo sin querer)
              if (pt === 0 && t.getAttribute('data-sure') !== '1') {
                t.setAttribute('data-sure', '1'); t.textContent = '¿tachar?';
                api.toast('Tocá de nuevo para tachar');
                return;
              }
              V.act({ type: 'score', cat: cat });
              return;
            }
            if (t.hasAttribute('data-i') && cur.rolls >= 1 && cur.rolls < 3) V.act({ type: 'hold', i: +t.getAttribute('data-i') });
          };
        }
      });

      function shake() {
        var box = api.el.querySelector('#gn-dice');
        if (!box) return;
        var animating = anim.until > performance.now();
        Array.prototype.forEach.call(box.children, function (d, k) {
          if (d.classList.contains('held')) return;
          var v = animating ? roll() : shownDice[k];
          Array.prototype.forEach.call(d.children, function (pip, i) { pip.className = PIPS[v] && PIPS[v].indexOf(i) >= 0 ? 'on' : ''; });
          d.style.transform = animating ? 'rotate(' + Math.round(Math.random() * 40 - 20) + 'deg)' : '';
        });
        if (animating) setTimeout(shake, 80);
      }
    }
  });

  var css = document.createElement('style');
  css.textContent =
    '.gn-dice{display:flex;gap:8px;justify-content:center;margin:10px 0 6px}' +
    '.gn-die{width:56px;height:56px;border-radius:12px;background:#f4f1e8;box-shadow:inset 0 -4px 0 #0002,0 4px 10px #0006;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);padding:7px;gap:2px;transition:transform .15s;position:relative}' +
    '.gn-die i{border-radius:50%;margin:2px}' +
    '.gn-die i.on{background:#1c1c28}' +
    '.gn-die.tap{cursor:pointer}' +
    '.gn-die.held{transform:translateY(-8px);box-shadow:0 0 0 3px var(--accent),0 8px 14px #0007}' +
    '.gn-die.held::after{content:"guardado";position:absolute;bottom:-20px;left:50%;transform:translateX(-50%);font-size:10px;font-weight:800;color:var(--accent)}' +
    '.gn-sheet{overflow-x:auto;margin-top:16px}' +
    '.gn-sheet table{width:100%;border-collapse:collapse;font-size:14px}' +
    '.gn-sheet th{font-size:12px;padding:4px 2px;font-weight:800}' +
    '.gn-sheet td{border-top:1px solid var(--line);text-align:center;padding:7px 2px;font-weight:700;min-width:30px}' +
    '.gn-sheet td.lbl{text-align:left;color:var(--muted);font-weight:700;white-space:nowrap;padding-left:4px}' +
    '.gn-sheet td.mine{background:#ffffff08}' +
    '.gn-sheet td.opt{color:var(--accent);background:#ffb54718;cursor:pointer;border-radius:6px}' +
    '.gn-sheet tr.tot td{font-weight:900;font-size:15px;color:var(--text)}';
  document.head.appendChild(css);
})();
