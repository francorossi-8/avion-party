/* Base para juegos por turnos o rondas.
   El anfitrión tiene el estado (S, público) y los secretos (P: cartas, palabras...). Cada cambio se
   publica a todos y a cada jugador le llega solo su parte privada.

   def = {
     wait: { emoji, title, sub, min, max, options, check(players) -> mensaje de error o null },
     start(H, vals, players)       -> arma S/P con H.set(S, P) y publica
     action(H, from, d)            -> acción de un jugador (solo corre en el anfitrión)
     priv(S, P, id)                -> datos privados para id (opcional)
     render(V, cur, priv)          -> dibuja la pantalla del juego
     tick(V)                       -> cada 250 ms en todos (relojes, animaciones) (opcional)
     hostTick(H)                   -> cada 500 ms en el anfitrión (opcional)
     resume(H)                     -> el anfitrión recargó la página: rearmar temporizadores (opcional)
     onRaw(from, d, V)             -> mensajes propios que no pasan por el anfitrión (opcional)
     onSync(from, V)               -> el anfitrión le reenvía a alguien que se reconectó lo que haga falta (opcional)
     destroy()                     -> limpieza (opcional)
   }
*/
(function () {
  'use strict';

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  window.SyncGame = function (api, def) {
    var self = { alive: true };
    var S = null, P = null, timers = {}, hostIv = null, viewIv = null;
    var cur = null, priv = null, localEnd = null;
    var wasHost = api.isHost();
    var lastVals = {};
    (def.wait.options || []).forEach(function (o) { lastVals[o.key] = o.value; });

    function inRoom(id) { var r = api.room(); return !!(r && r.members.indexOf(id) >= 0); }

    // ------------------------------------------------------------ anfitrión
    function cancel(key) { if (timers[key]) { clearTimeout(timers[key]); delete timers[key]; } }
    function cancelAll() { Object.keys(timers).forEach(cancel); }
    function pub() {
      var s = clone(S);
      if (S.endAt) s.left = Math.max(0, S.endAt - Date.now());
      delete s.endAt;
      return s;
    }
    function sendPriv(id) {
      if (!def.priv || !S || !S.players) return;
      var d = def.priv(S, P, id);
      if (d != null) api.to(id, { type: 'pv', seq: S.seq, d: d });
    }
    function publish() {
      S.seq = (S.seq || 0) + 1;
      api.save('S', S); api.save('P', P);
      api.toAll({ type: 'st', s: pub() });
      if (S.players) S.players.forEach(function (p) { sendPriv(p.id); });
    }
    var H = {
      api: api,
      get S() { return S; },
      get P() { return P; },
      set: function (s, p) { s.seq = S ? S.seq || 0 : 0; S = s; P = p || {}; },
      publish: publish,
      later: function (key, ms, fn) {
        cancel(key);
        timers[key] = setTimeout(function () { delete timers[key]; if (self.alive && S) fn(); }, ms);
      },
      cancel: cancel,
      cancelAll: cancelAll,
      deadline: function (ms) { S.endAt = ms == null ? null : Date.now() + ms; },
      timeLeft: function () { return S && S.endAt ? S.endAt - Date.now() : null; },
      inRoom: inRoom,
      online: function (id) { return api.online(id) && inRoom(id); },
      toLobby: toLobby
    };
    function toLobby() {
      cancelAll();
      var keep = S && S.keep ? S.keep : null;
      S = { phase: 'wait', seq: S ? S.seq : 0, keep: keep };
      P = {};
      publish();
    }
    function hostAction(from, d) {
      if (!d) return;
      if (d.type === '_start') {
        if (from !== api.me) return;
        var players = api.members().filter(function (m) { return m.online; }).slice(0, def.wait.max)
          .map(function (m, i) { return { id: m.id, name: m.name, color: api.colors[i % 8] }; });
        if (players.length < def.wait.min) { api.toast('Faltan jugadores'); return; }
        if (def.wait.check) { var err = def.wait.check(players, d.vals); if (err) { api.toast(err); return; } }
        lastVals = d.vals || lastVals;
        cancelAll();
        def.start(H, d.vals || {}, players);
        if (!hostIv && def.hostTick) hostIv = setInterval(function () { if (S && S.phase !== 'wait') def.hostTick(H); }, 500);
        return;
      }
      if (d.type === '_lobby') { if (from === api.me) toLobby(); return; }
      if (!S || S.phase === 'wait') return;
      def.action(H, from, d);
    }

    // ------------------------------------------------------------ todos
    var V = {
      api: api, el: api.el, esc: api.esc, h: api.h,
      get me() { return api.me; },
      get cur() { return cur; },
      get priv() { return priv; },
      isHost: function () { return api.isHost(); },
      act: function (d) { api.toHost({ type: 'a', d: d }); },
      left: function () { return localEnd == null ? null : Math.max(0, localEnd - performance.now()); },
      player: function (id) {
        if (cur && cur.players) for (var i = 0; i < cur.players.length; i++) if (cur.players[i].id === id) return cur.players[i];
        return { id: id, name: api.name(id), color: '#fff' };
      },
      tag: function (id) {
        var p = V.player(id);
        return '<b style="color:' + p.color + '">' + api.esc(p.name) + (id === api.me ? ' (vos)' : '') + '</b>';
      },
      lobby: function () { V.act({ type: '_lobby' }); },
      /** Título de fin de partida, con empates. */
      winTitle: function (players, scoreOf, lowWins) {
        var sorted = players.slice().sort(function (a, b) { return lowWins ? scoreOf(a) - scoreOf(b) : scoreOf(b) - scoreOf(a); });
        var best = scoreOf(sorted[0]);
        var tied = sorted.filter(function (p) { return scoreOf(p) === best; });
        if (tied.length > 1) return '<p style="font-size:22px;font-weight:900;margin:6px 0">¡Empate entre ' + tied.map(function (p) {
          return '<span style="color:' + p.color + '">' + api.esc(p.name) + '</span>';
        }).join(' y ') + '!</p>';
        return '<p style="font-size:22px;font-weight:900;margin:6px 0;color:' + sorted[0].color + '">¡Ganó ' + api.esc(sorted[0].name) + '!</p>';
      },
      redraw: function () { draw(); },
      lastVals: function () { return lastVals; },
      // botones estándar del final de partida
      endButtons: function (againLabel) {
        if (!api.isHost()) return '<p class="hint">Esperando al anfitrión…</p>';
        return '<div style="display:flex;gap:10px;margin-top:8px"><button class="btn block" data-sync="again">' + (againLabel || 'Revancha') +
          '</button><button class="btn ghost block" data-sync="lobby">Menú</button></div>';
      }
    };

    function renderWait() {
      var w = def.wait;
      var extra = '';
      if (cur && cur.keep && def.keepHtml) extra = def.keepHtml(V, cur.keep);
      api.waiting({
        emoji: w.emoji, title: w.title, sub: w.sub, min: w.min, max: w.max, values: lastVals, options: w.options,
        extraHtml: extra,
        onStart: function (vals) { lastVals = vals; V.act({ type: '_start', vals: vals }); }
      });
    }

    function draw() {
      if (!self.alive) return;
      if (!cur || cur.phase === 'wait' || !cur.players) { renderWait(); return; }
      try { def.render(V, cur, priv); } catch (e) { console.error(e); }
    }

    api.el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-sync]');
      if (!b) return;
      var a = b.getAttribute('data-sync');
      if (a === 'again') V.act({ type: '_start', vals: lastVals });
      if (a === 'lobby') V.act({ type: '_lobby' });
    });

    self.onMsg = function (from, d) {
      if (d.type === 'st') {
        if (from !== api.hostId() && from !== api.me) return;
        if (cur && d.s.seq <= cur.seq && !d.sync) return;
        var prev = cur;
        cur = d.s;
        localEnd = d.s.left != null ? performance.now() + d.s.left : null;
        if (!cur.players || cur.phase === 'wait') priv = null;
        if (def.onState) def.onState(V, prev, cur);
        draw();
        return;
      }
      if (d.type === 'pv') {
        if (from !== api.hostId() && from !== api.me) return;
        priv = d.d;
        draw();
        return;
      }
      if (d.type === 'a') { if (api.isHost()) hostAction(from, d.d); return; }
      if (d.type === 'sync') {
        if (api.isHost() && S) { api.to(from, { type: 'st', s: pub(), sync: true }); sendPriv(from); if (def.onSync) def.onSync(from, V); }
        return;
      }
      if (def.onRaw) def.onRaw(from, d, V);
    };

    self.onRoom = function () {
      var nowHost = api.isHost();
      if (nowHost && !wasHost) {
        api.toast('Ahora sos el anfitrión');
        if (cur && cur.phase !== 'wait' && cur.players) {
          // los secretos del anfitrión anterior se perdieron: la partida vuelve al menú, se guardan los puntos
          S = clone(cur); delete S.left;
          P = {};
          if (def.adopt && def.adopt(H, cur)) { /* el juego pudo seguir */ }
          else { api.toast('Se fue el anfitrión: la partida volvió al menú'); toLobby(); }
          if (!hostIv && def.hostTick) hostIv = setInterval(function () { if (S && S.phase !== 'wait') def.hostTick(H); }, 500);
        } else {
          S = { phase: 'wait', seq: cur ? cur.seq : 0, keep: cur && cur.keep };
          P = {};
        }
      }
      wasHost = nowHost;
      if (def.onRoomChange) def.onRoomChange(V);
      if (!cur || cur.phase === 'wait') renderWait();
    };
    self.onReconnect = function () { if (!api.isHost()) api.toHost({ type: 'sync' }); };
    viewIv = setInterval(function () { if (self.alive && cur && cur.phase !== 'wait' && def.tick) def.tick(V); }, 250);
    self.destroy = function () {
      self.alive = false;
      cancelAll();
      if (hostIv) clearInterval(hostIv);
      clearInterval(viewIv);
      if (def.destroy) def.destroy();
    };

    // arranque
    if (api.isHost()) {
      var sv = api.load('S');
      if (sv && sv.phase && sv.phase !== 'wait' && sv.players) {
        S = sv; P = api.load('P') || {};
        cur = pub();
        if (def.resume) def.resume(H);
        if (!hostIv && def.hostTick) hostIv = setInterval(function () { if (S && S.phase !== 'wait') def.hostTick(H); }, 500);
        publish();
      } else {
        S = { phase: 'wait', seq: 0 };
        P = {};
        renderWait();
      }
    } else {
      renderWait();
      api.toHost({ type: 'sync' });
    }
    return self;
  };

  // utilidades compartidas
  window.SyncUtil = {
    shuffle: function (a) {
      for (var i = a.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0; var t = a[i]; a[i] = a[j]; a[j] = t; }
      return a;
    },
    norm: function (s) {
      return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]/g, '').replace(/\s+/g, ' ').trim();
    },
    clone: clone
  };
})();
