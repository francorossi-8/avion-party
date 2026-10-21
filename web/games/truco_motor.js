/* Reglas del truco argentino (sin flor) para 2, 4 o 6 jugadores. Corre en el anfitrión.
   Equipos: asiento par = equipo 0, impar = equipo 1. */
(function (root) {
  'use strict';

  var SUITS = ['e', 'b', 'o', 'c'];
  var NUMS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
  var TRUCO_NAMES = ['', '¡Truco!', '¡Retruco!', '¡Vale cuatro!'];
  var ENV_NAMES = { envido: 'Envido', real: 'Real envido', falta: 'Falta envido' };

  function rank(c) {
    var n = c[0], s = c[1];
    if (n === 1 && s === 'e') return 14;
    if (n === 1 && s === 'b') return 13;
    if (n === 7 && s === 'e') return 12;
    if (n === 7 && s === 'o') return 11;
    if (n === 3) return 10;
    if (n === 2) return 9;
    if (n === 1) return 8;
    if (n === 12) return 7;
    if (n === 11) return 6;
    if (n === 10) return 5;
    if (n === 7) return 4;
    if (n === 6) return 3;
    if (n === 5) return 2;
    return 1;
  }
  function envVal(n) { return n >= 10 ? 0 : n; }
  function envido(cards) {
    var best = 0, i, j;
    for (i = 0; i < cards.length; i++) {
      best = Math.max(best, envVal(cards[i][0]));
      for (j = i + 1; j < cards.length; j++) {
        if (cards[i][1] === cards[j][1]) best = Math.max(best, 20 + envVal(cards[i][0]) + envVal(cards[j][0]));
      }
    }
    return best;
  }
  function trucoVal(lvl) { return [1, 2, 3, 4][lvl]; }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0; var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function newGame(players, target) {
    var S = {
      phase: 'play', seats: players.map(function (p, i) { return { id: p.id, name: p.name, color: p.color, team: i % 2 }; }),
      target: target, score: [0, 0], handNo: 0, mano: Math.floor(Math.random() * players.length), log: [], winner: null
    };
    var P = { hands: {}, orig: {} };
    newHand(S, P, true);
    return { S: S, P: P };
  }

  function newHand(S, P, first) {
    var n = S.seats.length;
    if (!first) S.mano = (S.mano + 1) % n;
    S.handNo++;
    var deck = [];
    SUITS.forEach(function (s) { NUMS.forEach(function (num) { deck.push([num, s]); }); });
    shuffle(deck);
    P.hands = {}; P.orig = {};
    for (var i = 0; i < n; i++) {
      P.hands[i] = deck.slice(i * 3, i * 3 + 3);
      P.orig[i] = P.hands[i].slice();
    }
    S.hand = {
      bazas: [{ lead: S.mano, cards: [], w: null }], turn: S.mano,
      trucoLvl: 0, trucoOwner: null, call: null, savedTruco: null,
      envidoDone: false, envido: null, over: false, result: null, reveal: null
    };
    log(S, null, 'Mano nueva · reparte ' + S.seats[(S.mano + n - 1) % n].name);
  }

  function log(S, seat, txt) {
    S.log.push({ s: seat, t: txt });
    if (S.log.length > 12) S.log.splice(0, S.log.length - 12);
  }

  function falta(S) { return S.target - Math.max(S.score[0], S.score[1]); }
  function envPoints(S, chain) {
    if (chain.indexOf('falta') >= 0) return falta(S);
    var t = 0;
    chain.forEach(function (k) { t += k === 'real' ? 3 : 2; });
    return t;
  }

  /** Acciones permitidas para un asiento. */
  function legal(S, P, seat) {
    var h = S.hand, out = [];
    if (S.phase !== 'play' || !h || h.over) return out;
    var team = seat % 2;
    var first = h.bazas.length === 1;
    var played = h.bazas[0].cards.some(function (c) { return c.seat === seat; });
    var envOk = !h.envidoDone && first && !played;
    if (h.call) {
      if (h.call.by === team) return ['mazo'];
      out.push('quiero', 'noquiero');
      if (h.call.kind === 'truco') {
        if (h.call.lvl < 3) out.push('truco');
        if (h.call.lvl === 1 && envOk) out.push('env_envido', 'env_real', 'env_falta');
      } else {
        var ch = h.call.chain, last = ch[ch.length - 1];
        var nEnv = ch.filter(function (x) { return x === 'envido'; }).length;
        if (last === 'envido' && nEnv < 2) out.push('env_envido');
        if (ch.indexOf('real') < 0 && last !== 'falta') out.push('env_real');
        if (last !== 'falta') out.push('env_falta');
      }
      out.push('mazo');
      return out;
    }
    if (h.turn === seat) {
      (P.hands[seat] || []).forEach(function (c, i) { out.push('play_' + i); });
      if (h.trucoLvl < 3 && (h.trucoOwner === null || h.trucoOwner === team)) out.push('truco');
      if (envOk) out.push('env_envido', 'env_real', 'env_falta');
    }
    out.push('mazo');
    return out;
  }

  /** Texto del botón para una acción. */
  function label(S, a) {
    var h = S.hand;
    if (a === 'truco') {
      var lvl = h.call && h.call.kind === 'truco' ? h.call.lvl + 1 : h.trucoLvl + 1;
      return TRUCO_NAMES[lvl];
    }
    if (a.indexOf('env_') === 0) return ENV_NAMES[a.slice(4)];
    if (a === 'quiero') return '¡Quiero!';
    if (a === 'noquiero') return 'No quiero';
    if (a === 'mazo') return 'Al mazo';
    return a;
  }

  function handWinner(W, manoTeam) {
    var wins = [0, 0];
    W.forEach(function (w) { if (w >= 0) wins[w]++; });
    if (wins[0] >= 2) return 0;
    if (wins[1] >= 2) return 1;
    if (W.length >= 2) {
      if (W[0] === -1 && W[1] >= 0) return W[1];
      if (W[0] >= 0 && W[1] === -1) return W[0];
    }
    if (W.length === 3) {
      if (W[2] >= 0) return W[2];
      if (W[0] >= 0) return W[0];
      return manoTeam;
    }
    return null;
  }

  function endHand(S, P, team, pts, why) {
    var h = S.hand;
    S.score[team] += pts;
    h.over = true;
    h.result = { team: team, pts: pts, why: why };
    h.reveal = {};
    Object.keys(P.hands).forEach(function (k) { h.reveal[k] = P.hands[k].slice(); });
    log(S, null, (team === 0 ? 'Equipo A' : 'Equipo B') + ' +' + pts + ' (' + why + ')');
    checkGame(S);
  }
  function checkGame(S) {
    if (S.score[0] >= S.target || S.score[1] >= S.target) {
      S.phase = 'over';
      S.winner = S.score[0] >= S.target ? 0 : 1;
      if (S.hand) S.hand.over = true;
      return true;
    }
    return false;
  }

  function resolveEnvido(S, P, quiso) {
    var h = S.hand, n = S.seats.length, call = h.call;
    h.envidoDone = true;
    if (!quiso) {
      var pts0 = call.chain.length === 1 ? 1 : envPoints(S, call.chain.slice(0, -1));
      S.score[call.by] += pts0;
      h.envido = { quiso: false, team: call.by, pts: pts0, chain: call.chain };
      log(S, null, 'No quiso el envido: ' + (call.by === 0 ? 'Equipo A' : 'Equipo B') + ' +' + pts0);
    } else {
      var vals = {}, max = -1;
      for (var i = 0; i < n; i++) { vals[i] = envido(P.orig[i]); max = Math.max(max, vals[i]); }
      var winner = 0;
      for (var k = 0; k < n; k++) {
        var seat = (S.mano + k) % n;
        if (vals[seat] === max) { winner = seat % 2; break; }
      }
      var pts = envPoints(S, call.chain);
      S.score[winner] += pts;
      h.envido = { quiso: true, team: winner, pts: pts, vals: vals, chain: call.chain };
      log(S, null, 'Envido: gana ' + (winner === 0 ? 'Equipo A' : 'Equipo B') + ' con ' + max + ' (+' + pts + ')');
    }
    h.call = h.savedTruco || null;
    h.savedTruco = null;
    checkGame(S);
  }

  /** Aplica una acción. Devuelve null si salió bien o un texto de error. */
  function act(S, P, seat, a) {
    if (legal(S, P, seat).indexOf(a) < 0) return 'Acción no permitida';
    var h = S.hand, n = S.seats.length, team = seat % 2;
    if (a.indexOf('play_') === 0) {
      var i = +a.slice(5);
      var card = P.hands[seat].splice(i, 1)[0];
      var baza = h.bazas[h.bazas.length - 1];
      baza.cards.push({ seat: seat, card: card });
      if (baza.cards.length < n) { h.turn = (seat + 1) % n; return null; }
      // baza completa
      var top = -1, tops = [];
      baza.cards.forEach(function (c) {
        var r = rank(c.card);
        if (r > top) { top = r; tops = [c]; } else if (r === top) tops.push(c);
      });
      var teams = [];
      tops.forEach(function (c) { if (teams.indexOf(c.seat % 2) < 0) teams.push(c.seat % 2); });
      baza.w = teams.length > 1 ? -1 : teams[0];
      var W = h.bazas.map(function (b) { return b.w; });
      var hw = handWinner(W, S.mano % 2);
      if (hw !== null) { endHand(S, P, hw, trucoVal(h.trucoLvl), 'ganó las bazas'); return null; }
      var lead = baza.w === -1 ? baza.lead : tops[0].seat;
      h.bazas.push({ lead: lead, cards: [], w: null });
      h.turn = lead;
      return null;
    }
    if (a === 'truco') {
      var lvl;
      if (h.call && h.call.kind === 'truco') { h.trucoLvl = h.call.lvl; lvl = h.call.lvl + 1; }
      else lvl = h.trucoLvl + 1;
      h.call = { kind: 'truco', lvl: lvl, by: team, seat: seat };
      log(S, seat, TRUCO_NAMES[lvl]);
      return null;
    }
    if (a.indexOf('env_') === 0) {
      var k = a.slice(4);
      if (h.call && h.call.kind === 'truco') { h.savedTruco = h.call; h.call = { kind: 'envido', chain: [k], by: team, seat: seat }; log(S, seat, 'El envido está primero: ' + ENV_NAMES[k]); }
      else if (h.call && h.call.kind === 'envido') { h.call = { kind: 'envido', chain: h.call.chain.concat([k]), by: team, seat: seat }; log(S, seat, ENV_NAMES[k] + '!'); }
      else { h.call = { kind: 'envido', chain: [k], by: team, seat: seat }; log(S, seat, ENV_NAMES[k] + '!'); }
      return null;
    }
    if (a === 'quiero') {
      log(S, seat, '¡Quiero!');
      if (h.call.kind === 'truco') { h.trucoLvl = h.call.lvl; h.trucoOwner = team; h.call = null; }
      else resolveEnvido(S, P, true);
      return null;
    }
    if (a === 'noquiero') {
      log(S, seat, 'No quiero');
      if (h.call.kind === 'truco') { var c = h.call; h.call = null; endHand(S, P, c.by, c.lvl, 'no quiso el ' + TRUCO_NAMES[c.lvl].replace(/[¡!]/g, '').toLowerCase()); }
      else resolveEnvido(S, P, false);
      return null;
    }
    if (a === 'mazo') {
      log(S, seat, 'Se va al mazo');
      h.call = null;
      endHand(S, P, 1 - team, trucoVal(h.trucoLvl), 'se fue al mazo');
      return null;
    }
    return 'Acción desconocida';
  }

  root.TrucoEngine = {
    rank: rank, envido: envido, newGame: newGame, newHand: newHand, legal: legal, act: act, label: label,
    handWinner: handWinner, TRUCO_NAMES: TRUCO_NAMES
  };
})(typeof window !== 'undefined' ? window : globalThis);
