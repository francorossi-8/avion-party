/* Impostor: todos reciben la misma palabra menos uno. Pistas, votación y a ver quién miente. 3 a 10. */
(function () {
  'use strict';

  var WORDS = {
    'Comida': ['Asado', 'Empanada', 'Milanesa', 'Choripán', 'Alfajor', 'Dulce de leche', 'Pizza', 'Sushi', 'Ñoquis', 'Locro', 'Medialuna',
      'Provoleta', 'Helado', 'Hamburguesa', 'Tacos', 'Ravioles', 'Chipá', 'Panqueque', 'Fainá', 'Sándwich de miga', 'Papas fritas',
      'Tarta', 'Flan', 'Pochoclo', 'Pancho', 'Paella', 'Guiso', 'Tortilla de papas', 'Sopa', 'Mate cocido'],
    'Lugares': ['Aeropuerto', 'Playa', 'Hospital', 'Estadio de fútbol', 'Escuela', 'Cine', 'Supermercado', 'Gimnasio', 'Boliche', 'Biblioteca',
      'Zoológico', 'Iglesia', 'Banco', 'Estación de servicio', 'Hotel', 'Museo', 'Subte', 'Peluquería', 'Farmacia', 'Casino',
      'Parque de diversiones', 'Isla desierta', 'Crucero', 'Cárcel', 'Montaña', 'Camping', 'Spa', 'Kiosco', 'Volcán', 'Casamiento'],
    'Animales': ['Perro', 'Gato', 'Caballo', 'Vaca', 'Pingüino', 'Elefante', 'Jirafa', 'León', 'Tiburón', 'Delfín', 'Mono', 'Serpiente',
      'Cocodrilo', 'Águila', 'Loro', 'Oveja', 'Carpincho', 'Pulpo', 'Tortuga', 'Conejo', 'Murciélago', 'Oso', 'Hormiga', 'Mosquito',
      'Cangrejo', 'Flamenco', 'Camello', 'Ballena', 'Abeja', 'Gallina'],
    'Objetos': ['Celular', 'Paraguas', 'Mate', 'Termo', 'Llaves', 'Guitarra', 'Reloj', 'Anteojos', 'Mochila', 'Almohada', 'Cepillo de dientes',
      'Control remoto', 'Bicicleta', 'Vela', 'Espejo', 'Tijera', 'Pelota', 'Auriculares', 'Cámara de fotos', 'Billetera', 'Cuchara',
      'Escoba', 'Linterna', 'Sartén', 'Ventilador', 'Heladera', 'Lavarropas', 'Inodoro', 'Microondas', 'Silla'],
    'Profesiones': ['Médico', 'Bombero', 'Policía', 'Piloto', 'Azafata', 'Chef', 'Docente', 'Abogado', 'Ingeniero', 'Carpintero', 'Plomero',
      'Electricista', 'Peluquero', 'Futbolista', 'Astronauta', 'Dentista', 'Veterinario', 'Periodista', 'Cantante', 'Payaso', 'Mago',
      'Taxista', 'Panadero', 'Jardinero', 'Programador', 'Arquitecto', 'Contador', 'Cirujano', 'Influencer', 'DJ'],
    'Deportes': ['Fútbol', 'Tenis', 'Básquet', 'Rugby', 'Hockey', 'Natación', 'Boxeo', 'Golf', 'Vóley', 'Ajedrez', 'Esquí', 'Surf', 'Ciclismo',
      'Pádel', 'Atletismo', 'Karate', 'Polo', 'Escalada', 'Skate', 'Bowling', 'Ping pong', 'Handball', 'Patinaje', 'Maratón',
      'Fórmula 1', 'Buceo', 'Paracaidismo', 'Equitación', 'Esgrima', 'Remo'],
    'Viajes': ['Pasaporte', 'Valija', 'Avión', 'Tren', 'Mapa', 'Brújula', 'Protector solar', 'Souvenir', 'Aduana', 'Tarjeta de embarque',
      'Turbulencia', 'Duty free', 'Jet lag', 'Mochilero', 'Excursión', 'Guía turístico', 'Hostel', 'Equipaje de mano',
      'Cinturón de seguridad', 'Ventanilla', 'Auto de alquiler', 'Postal', 'Check-in', 'Escala', 'Migraciones', 'Reposera',
      'Sombrilla', 'Hamaca paraguaya', 'Snorkel', 'Selfie']
  };
  var CATS = Object.keys(WORDS);

  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]/g, '').replace(/\s+/g, ' ').trim();
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0; var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  App.register({
    id: 'impostor', name: 'Impostor', emoji: '🕵️', players: '3-10',
    desc: 'Todos tienen la misma palabra… menos uno.',
    create: function (api) {
      var self = { alive: true };
      var el = api.el;
      var S = null, P = null;     // anfitrión: público y privado
      var cur = null, secret = null, wasHost = api.isHost();
      var lastVals = { cat: 'Mezcla', rounds: 2, hint: true };
      var showWord = false;

      // ================================================== anfitrión
      function hostInit() {
        var s = api.load('S'), p = api.load('P');
        if (s && p && s.phase !== 'wait') { S = s; P = p; }
        else S = { phase: 'wait', seq: (cur && cur.seq) || 0, scores: (cur && cur.scores) || {} };
      }
      function publish() {
        S.seq++;
        api.save('S', S); api.save('P', P);
        api.toAll({ type: 'state', s: S });
      }
      function sendSecret(id) {
        if (!P || !S.players) return;
        var isImp = id === P.impostor;
        var inGame = S.players.some(function (p) { return p.id === id; });
        if (!inGame) return;
        api.to(id, { type: 'secret', round: S.round, impostor: isImp, word: isImp ? null : P.word, cat: (!isImp || S.hint) ? S.cat : null });
      }
      function start(vals) {
        var ps = api.members().filter(function (m) { return m.online; }).slice(0, 10);
        if (ps.length < 3) { api.toast('Se necesitan al menos 3 jugadores'); return; }
        lastVals = vals;
        var cat = vals.cat === 'Mezcla' ? CATS[(Math.random() * CATS.length) | 0] : vals.cat;
        var list = WORDS[cat];
        var word = list[(Math.random() * list.length) | 0];
        var players = ps.map(function (p, i) { return { id: p.id, name: p.name, color: api.colors[i % 8] }; });
        var imp = players[(Math.random() * players.length) | 0].id;
        P = { word: word, impostor: imp };
        var scores = S.scores || {};
        players.forEach(function (p) { if (scores[p.id] == null) scores[p.id] = 0; });
        S = {
          phase: 'reveal', seq: S.seq || 0, round: (S.round || 0) + 1, players: players, cat: cat, hint: !!vals.hint,
          rounds: vals.rounds, ready: {}, clues: [], votes: {}, scores: scores, vals: vals
        };
        players.forEach(function (p) { sendSecret(p.id); });
        publish();
      }
      function inGame(id) { return S.players && S.players.some(function (p) { return p.id === id; }); }
      function activeIds() { return S.players.filter(function (p) { return api.online(p.id); }).map(function (p) { return p.id; }); }

      function toClues() {
        var order = shuffle(S.players.map(function (p) { return p.id; }));
        if (order[0] === P.impostor && order.length > 1) { order.push(order.shift()); }
        S.phase = 'clues'; S.order = order; S.turn = 0; S.clueRound = 1;
      }
      function advanceClue() {
        S.turn++;
        if (S.turn >= S.order.length) {
          S.turn = 0; S.clueRound++;
          if (S.clueRound > S.rounds) { S.phase = 'vote'; S.votes = {}; }
        }
      }
      function tally() {
        var cnt = {};
        Object.keys(S.votes).forEach(function (v) { var t = S.votes[v]; cnt[t] = (cnt[t] || 0) + 1; });
        var best = 0, top = [];
        Object.keys(cnt).forEach(function (id) {
          if (cnt[id] > best) { best = cnt[id]; top = [id]; } else if (cnt[id] === best) top.push(id);
        });
        S.count = cnt;
        S.accused = top.length === 1 ? top[0] : null;
        if (S.accused === P.impostor) { S.phase = 'guess'; }
        else finish('impostor', false);
      }
      function finish(winner, stole) {
        S.phase = 'result';
        S.result = { winner: winner, impostor: P.impostor, word: P.word, accused: S.accused, stole: !!stole, guess: S.guess || null };
        if (winner === 'group') S.players.forEach(function (p) { if (p.id !== P.impostor) S.scores[p.id] = (S.scores[p.id] || 0) + 1; });
        else S.scores[P.impostor] = (S.scores[P.impostor] || 0) + (stole ? 3 : 2);
      }

      function hostAct(from, d) {
        if (!S) return;
        if (d.type === 'sync') { api.to(from, { type: 'state', s: S, sync: true }); sendSecret(from); return; }
        var host = from === api.me;
        if (d.type === 'start' && host) { start(d.vals); return; }
        if (d.type === 'lobby' && host) { S = { phase: 'wait', seq: S.seq, scores: S.scores || {} }; P = null; publish(); return; }
        if (!inGame(from) && !host) return;
        if (S.phase === 'reveal') {
          if (d.type === 'ready' && inGame(from)) S.ready[from] = 1;
          var all = activeIds().every(function (id) { return S.ready[id]; });
          if (all || (d.type === 'force' && host)) toClues();
          publish();
        } else if (S.phase === 'clues') {
          if (d.type === 'clue' && from === S.order[S.turn]) {
            var t = String(d.text || '').trim().slice(0, 32);
            if (!t) return;
            S.clues.push({ id: from, text: t, r: S.clueRound });
            advanceClue();
            publish();
          } else if (d.type === 'skip' && host) {
            S.clues.push({ id: S.order[S.turn], text: '(pasó)', r: S.clueRound });
            advanceClue(); publish();
          } else if (d.type === 'tovote' && host) {
            S.phase = 'vote'; S.votes = {}; publish();
          }
        } else if (S.phase === 'vote') {
          if (d.type === 'vote' && inGame(from) && d.target !== from && inGame(d.target)) {
            S.votes[from] = d.target;
            var done = activeIds().every(function (id) { return S.votes[id]; });
            if (done) tally();
            publish();
          } else if (d.type === 'close' && host) {
            if (Object.keys(S.votes).length) tally(); else finish('impostor', false);
            publish();
          }
        } else if (S.phase === 'guess') {
          if (d.type === 'guess' && from === P.impostor) {
            S.guess = String(d.text || '').slice(0, 40);
            var ok = norm(S.guess) === norm(P.word);
            finish(ok ? 'impostor' : 'group', ok);
            publish();
          } else if (d.type === 'skipguess' && host) { finish('group', false); publish(); }
        }
      }

      // ================================================== todos
      self.onMsg = function (from, d) {
        if (d.type === 'state') {
          if (from !== api.hostId() && from !== api.me) return;
          if (cur && d.s.seq <= cur.seq && !d.sync) return;
          var prevPhase = cur && cur.phase, prevRound = cur && cur.round;
          cur = d.s;
          if (api.isHost() && (!S || S.seq < cur.seq)) S = clone(cur);
          if (cur.round !== prevRound) showWord = false;
          if (prevPhase !== cur.phase) api.vibrate(40);
          render();
          return;
        }
        if (d.type === 'secret') {
          if (from !== api.hostId() && from !== api.me) return;
          secret = d; render(); return;
        }
        if (api.isHost()) hostAct(from, d);
      };

      function pl(id) {
        if (!cur || !cur.players) return { name: api.name(id), color: '#fff' };
        for (var i = 0; i < cur.players.length; i++) if (cur.players[i].id === id) return cur.players[i];
        return { name: api.name(id), color: '#fff' };
      }
      function tag(id) {
        var p = pl(id);
        return '<b style="color:' + p.color + '">' + api.esc(p.name) + (id === api.me ? ' (vos)' : '') + '</b>';
      }
      function card(inner) { return '<div class="card" style="margin-bottom:12px">' + inner + '</div>'; }

      function render() {
        if (!cur || cur.phase === 'wait') { renderWait(); return; }
        var me = api.me, host = api.isHost();
        var playing = cur.players.some(function (p) { return p.id === me; });
        var mySecret = secret && secret.round === cur.round ? secret : null;
        var html = '<div class="wait" style="padding-top:12px">';
        html += '<div class="banner" style="font-size:14px;color:var(--muted)">Ronda ' + cur.round + ' · Categoría: ' +
          (mySecret && mySecret.cat ? '<b style="color:var(--text)">' + api.esc(mySecret.cat) + '</b>' : (playing ? '¿?' : api.esc(cur.cat))) + '</div>';

        if (cur.phase === 'reveal') {
          if (playing) {
            var inner;
            if (!mySecret) inner = '<p class="hint">Recibiendo tu palabra…</p>';
            else if (!showWord) inner = '<div style="font-size:52px">🃏</div><p style="font-weight:800;font-size:18px;margin:6px 0">Tocá para ver tu palabra</p><p class="hint" style="margin:0">Que nadie mire tu pantalla 👀</p>';
            else if (mySecret.impostor) inner = '<div style="font-size:52px">🤫</div><p style="font-weight:900;font-size:28px;margin:4px 0;color:var(--danger)">Sos el IMPOSTOR</p>' +
              '<p class="hint" style="margin:0">' + (mySecret.cat ? 'La categoría es <b>' + api.esc(mySecret.cat) + '</b>. ' : '') + 'Disimulá y descubrí la palabra.</p>';
            else inner = '<div style="font-size:52px">🔑</div><p class="hint" style="margin:0">Tu palabra es</p><p style="font-weight:900;font-size:32px;margin:4px 0;color:var(--accent)">' + api.esc(mySecret.word) + '</p>';
            html += '<div class="card" id="im-card" style="text-align:center;padding:28px 16px;margin-bottom:14px;cursor:pointer">' + inner + '</div>';
            if (!cur.ready[me]) html += '<button class="btn block" data-a="ready"' + (mySecret ? '' : ' disabled') + '>Ya la vi ✔</button>';
            else html += '<p class="hint">Listo. Esperando al resto…</p>';
          } else html += card('<p class="hint">Estás mirando esta ronda. Entrás en la próxima.</p>');
          html += '<h2>Listos</h2><div class="people">' + cur.players.map(function (p) {
            return '<span class="chip' + (cur.ready[p.id] ? '' : ' off') + '"><span class="sw" style="background:' + p.color + '"></span>' + api.esc(p.name) + (cur.ready[p.id] ? ' ✔' : '') + '</span>';
          }).join('') + '</div>';
          if (host) html += '<p class="hint"><button class="btn small ghost" data-a="force">Seguir sin esperar</button></p>';
        }

        if (cur.phase === 'clues') {
          var turnId = cur.order[cur.turn];
          html += card('<p style="margin:0 0 6px;font-weight:800">Pistas · vuelta ' + cur.clueRound + ' de ' + cur.rounds + '</p>' +
            '<p class="hint" style="text-align:left;margin:0">Cada uno da una pista corta de la palabra, sin decirla. El impostor tiene que disimular.</p>');
          if (turnId === me) {
            html += '<form id="im-form" style="display:flex;gap:8px;margin-bottom:14px"><input class="field" id="im-in" maxlength="32" placeholder="Tu pista…" autocomplete="off">' +
              '<button class="btn" type="submit">Dar</button></form>';
          } else {
            html += '<p class="banner">Turno de ' + tag(turnId) + (api.online(turnId) ? '' : ' (desconectado)') + '</p>';
          }
          html += cluesHtml();
          if (host) html += '<div style="display:flex;gap:8px;justify-content:center;margin-top:12px">' +
            '<button class="btn small ghost" data-a="skip">Saltar turno</button><button class="btn small ghost" data-a="tovote">Votar ya</button></div>';
        }

        if (cur.phase === 'vote') {
          html += card('<p style="margin:0;font-weight:800">🗳️ ¿Quién es el impostor?</p><p class="hint" style="text-align:left;margin:4px 0 0">Podés cambiar tu voto hasta que voten todos.</p>');
          html += '<div class="plist">';
          cur.players.forEach(function (p) {
            var mine = cur.votes[me] === p.id;
            var dis = p.id === me || !playing;
            html += '<button class="pitem" data-vote="' + p.id + '" style="color:var(--text);text-align:left;' + (mine ? 'border-color:var(--accent);background:var(--panel2)' : '') + '"' + (dis ? ' disabled' : '') + '>' +
              '<span class="sw" style="background:' + p.color + ';color:' + p.color + '"></span>' + api.esc(p.name) + (p.id === me ? ' (vos)' : '') +
              '<span class="tag">' + (cur.votes[p.id] ? 'votó ✔' : '') + (mine ? ' · tu voto' : '') + '</span></button>';
          });
          html += '</div>' + cluesHtml();
          if (host) html += '<p class="hint"><button class="btn small ghost" data-a="close">Cerrar votación</button></p>';
        }

        if (cur.phase === 'guess') {
          var imp = cur.accused;
          if (imp === me) {
            html += card('<p style="font-weight:900;font-size:20px;margin:0 0 6px;color:var(--danger)">¡Te descubrieron! 😬</p>' +
              '<p class="hint" style="text-align:left;margin:0">Última chance: si adivinás la palabra, ganás igual.</p>');
            html += '<form id="im-guess" style="display:flex;gap:8px;margin-bottom:14px"><input class="field" id="im-gin" maxlength="40" placeholder="¿Cuál era la palabra?" autocomplete="off">' +
              '<button class="btn" type="submit">Arriesgar</button></form>';
          } else {
            html += card('<p style="font-weight:900;font-size:20px;margin:0 0 6px">¡Atraparon a ' + tag(imp) + '!</p><p class="hint" style="text-align:left;margin:0">Ahora intenta adivinar la palabra para robar la victoria…</p>');
          }
          html += cluesHtml();
          if (host) html += '<p class="hint"><button class="btn small ghost" data-a="skipguess">Cerrar sin adivinar</button></p>';
        }

        if (cur.phase === 'result') {
          var r = cur.result, gw = r.winner === 'group';
          html += '<div class="card" style="text-align:center;padding:22px 14px;margin-bottom:12px">' +
            '<div style="font-size:52px">' + (gw ? '🎉' : '🕵️') + '</div>' +
            '<p style="font-weight:900;font-size:24px;margin:6px 0">' + (gw ? '¡Ganó el grupo!' : '¡Ganó el impostor!') + '</p>' +
            '<p style="margin:4px 0">El impostor era ' + tag(r.impostor) + '</p>' +
            '<p style="margin:4px 0">La palabra: <b style="color:var(--accent)">' + api.esc(r.word) + '</b></p>' +
            (r.guess ? '<p class="hint" style="margin:4px 0">Arriesgó: “' + api.esc(r.guess) + '”' + (r.stole ? ' ✔ ¡Robó la victoria!' : ' ✘') + '</p>' : '') +
            (!r.accused ? '<p class="hint" style="margin:4px 0">Empate en la votación: el impostor zafó.</p>' : (r.accused !== r.impostor ? '<p class="hint" style="margin:4px 0">Echaron a ' + tag(r.accused) + ', que era inocente.</p>' : '')) +
            '</div>';
          html += '<h2>Votos</h2><div class="plist">';
          cur.players.forEach(function (p) {
            var who = Object.keys(cur.votes).filter(function (v) { return cur.votes[v] === p.id; }).map(function (v) { return api.esc(pl(v).name); });
            html += '<div class="pitem"><span class="sw" style="background:' + p.color + ';color:' + p.color + '"></span>' + api.esc(p.name) +
              (p.id === r.impostor ? ' 🕵️' : '') + '<span class="tag">' + (who.length ? who.length + ': ' + who.join(', ') : '—') + '</span></div>';
          });
          html += '</div>';
          html += scoresHtml();
          if (host) html += '<div style="display:flex;gap:10px;margin-top:6px"><button class="btn block" data-a="again">Otra ronda</button><button class="btn ghost block" data-a="lobby">Menú</button></div>';
          else html += '<p class="hint">El anfitrión arranca la próxima ronda.</p>';
        }
        html += '</div>';
        el.innerHTML = html;

        el.onclick = function (e) {
          var c = e.target.closest('#im-card');
          if (c) { showWord = !showWord; render(); return; }
          var v = e.target.closest('[data-vote]');
          if (v && !v.disabled) { api.toHost({ type: 'vote', target: v.getAttribute('data-vote') }); return; }
          var a = e.target.getAttribute && e.target.getAttribute('data-a');
          if (!a) return;
          if (a === 'again') api.toHost({ type: 'start', vals: cur.vals || lastVals });
          else api.toHost({ type: a });
        };
        var f = el.querySelector('#im-form');
        if (f) {
          var inp = el.querySelector('#im-in');
          f.onsubmit = function (e) { e.preventDefault(); var t = inp.value.trim(); if (t) api.toHost({ type: 'clue', text: t }); };
          setTimeout(function () { try { inp.focus(); } catch (x) { } }, 60);
        }
        var g = el.querySelector('#im-guess');
        if (g) {
          var gi = el.querySelector('#im-gin');
          g.onsubmit = function (e) { e.preventDefault(); var t = gi.value.trim(); if (t) api.toHost({ type: 'guess', text: t }); };
        }
      }

      function cluesHtml() {
        if (!cur.clues || !cur.clues.length) return '<p class="hint">Todavía no hay pistas.</p>';
        var html = '<h2>Pistas</h2><div class="plist">';
        cur.clues.forEach(function (c) {
          html += '<div class="pitem" style="font-weight:600">' + tag(c.id) + '<span style="margin-left:auto;font-weight:800">' + api.esc(c.text) + '</span></div>';
        });
        return html + '</div>';
      }
      function scoresHtml() {
        var ids = Object.keys(cur.scores || {});
        if (!ids.length) return '';
        ids.sort(function (a, b) { return cur.scores[b] - cur.scores[a]; });
        return '<h2>Puntos</h2><div class="people" style="margin-bottom:14px">' + ids.map(function (id) {
          var p = pl(id);
          return '<span class="chip"><span class="sw" style="background:' + p.color + '"></span>' + api.esc(p.name) + ' · ' + cur.scores[id] + '</span>';
        }).join('') + '</div>';
      }

      function renderWait() {
        var opts = {
          emoji: '🕵️', title: 'Impostor',
          sub: 'Todos reciben la misma palabra secreta, menos el impostor. Den pistas por turno, voten, y si atrapan al impostor todavía puede ganar adivinando la palabra.',
          min: 3, max: 10, values: lastVals,
          options: [
            { key: 'cat', label: 'Categoría', type: 'select', value: 'Mezcla', choices: [['Mezcla', '🎲 Mezcla']].concat(CATS.map(function (c) { return [c, c]; })) },
            { key: 'rounds', label: 'Vueltas de pistas', value: 2, choices: [[1, '1'], [2, '2'], [3, '3']] },
            { key: 'hint', label: 'El impostor ve la categoría', value: true, choices: [[true, 'Sí'], [false, 'No']] }
          ],
          onStart: function (vals) {
            api.toHost({ type: 'start', vals: { cat: vals.cat, rounds: vals.rounds, hint: vals.hint } });
          }
        };
        if (cur && cur.scores && Object.keys(cur.scores).length) {
          var ids = Object.keys(cur.scores).sort(function (a, b) { return cur.scores[b] - cur.scores[a]; });
          opts.extraHtml = '<h2>Puntos</h2><div class="people" style="margin-bottom:14px">' + ids.map(function (id) {
            return '<span class="chip">' + api.esc(api.name(id)) + ' · ' + cur.scores[id] + '</span>';
          }).join('') + '</div>';
        }
        api.waiting(opts);
      }

      self.onRoom = function () {
        var nowHost = api.isHost();
        if (nowHost && !wasHost) {
          api.toast('Ahora sos el anfitrión');
          var saved = api.load('P');
          if (cur && cur.phase !== 'wait' && saved && api.load('S') && api.load('S').round === cur.round) { S = clone(cur); P = saved; }
          else {
            S = { phase: 'wait', seq: (cur && cur.seq) || 0, scores: (cur && cur.scores) || {} };
            P = null;
            if (cur && cur.phase !== 'wait') { api.toast('Se cortó la ronda: el anfitrión anterior se fue'); publish(); }
          }
        }
        wasHost = nowHost;
        if (!cur || cur.phase === 'wait') renderWait();
      };
      self.onReconnect = function () { if (!api.isHost()) api.toHost({ type: 'sync' }); };
      self.destroy = function () { };

      if (api.isHost()) { hostInit(); cur = clone(S); render(); if (P) sendSecret(api.me); }
      else { cur = { phase: 'wait', seq: 0 }; renderWait(); api.toHost({ type: 'sync' }); }
      return self;
    }
  });
})();
