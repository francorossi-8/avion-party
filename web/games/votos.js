/* ¿Quién es más probable que…? Sale una pregunta y todos votan a alguien del grupo. 3 a 10. */
(function () {
  'use strict';
  var U = window.SyncUtil;
  var Q = [
    'se quede dormido y pierda el vuelo', 'se pierda en un aeropuerto', 'llegue tarde a su propio casamiento',
    'se haga famoso en internet', 'gane la lotería y la gaste en un mes', 'adopte diez gatos', 'se mude a otro país de un día para el otro',
    'termine viviendo en una isla', 'se ría en el peor momento', 'se olvide el pasaporte', 'hable con desconocidos en el avión',
    'se coma todo el snack del avión', 'se duerma en la primera media hora de vuelo', 'aplauda cuando aterriza el avión',
    'pida ver la cabina del piloto', 'se pierda en una ciudad con el GPS en la mano', 'termine bailando arriba de una mesa',
    'cante en un karaoke sin que nadie se lo pida', 'se haga amigo del mozo', 'pida lo mismo de siempre en el restaurante',
    'pruebe la comida más rara del menú', 'se queme con el sol el primer día', 'se olvide el cargador', 'llegue con la valija más pesada',
    'compre algo inútil en el free shop', 'saque 500 fotos del mismo paisaje', 'se haga el que sabe el idioma', 'regatee en cualquier lado',
    'se tatúe algo en un viaje', 'organice todo en un Excel', 'cambie de planes a último momento', 'se ofrezca para manejar',
    'se maree en un barco', 'tenga miedo en una montaña rusa', 'se meta al mar aunque esté helado', 'pierda la billetera',
    'se haga millonario', 'sea presidente', 'escriba un libro', 'tenga un podcast', 'abra un restaurante', 'viva hasta los 100',
    'sobreviva a un apocalipsis zombie', 'muera primero en una película de terror', 'se ponga a llorar con una película de Pixar',
    'mande un audio de 5 minutos', 'deje en visto a todos', 'tenga 300 pestañas abiertas', 'tenga el celular en 1% de batería',
    'se olvide un cumpleaños', 'mande un mensaje al grupo equivocado', 'stalkee a alguien hasta 2012', 'se haga vegano un mes y abandone',
    'arranque el gimnasio el lunes y no vaya más', 'se compre algo caro de impulso', 'se quede hablando 2 horas en una despedida',
    'cuente un chiste malo', 'se ría de su propio chiste', 'se enoje jugando a un juego de mesa', 'haga trampa en el truco',
    'gane una discusión sin tener razón', 'diga "yo te dije"', 'se haga el dormido para no ayudar', 'se coma lo de otro de la heladera',
    'se pierda buscando el baño', 'se haga amigo de un perro callejero', 'termine en la foto de otros turistas', 'cocine algo y lo queme',
    'se ponga a bailar sin música', 'despierte a todos con la alarma', 'pida un Uber de 3 cuadras', 'se cuele en una fiesta ajena',
    'conozca a alguien famoso', 'termine siendo influencer', 'se meta en una pelea por un lugar de estacionamiento',
    'llore en un casamiento', 'dé el discurso más largo en una boda', 'agarre el ramo en un casamiento', 'se emborrache primero en una fiesta',
    'se olvide de qué estaba hablando a mitad de una frase', 'tenga un plan B, C y D', 'deje todo para último momento',
    'responda un mensaje 3 días después', 'se compre un auto que no puede pagar', 'se haga experto en algo que vio en un video',
    'renuncie para viajar por el mundo', 'se quede en el aeropuerto por perder la conexión', 'pase más tiempo en el free shop que en la ciudad',
    'haga amigos en la fila de migraciones', 'se lleve la toalla del hotel', 'se pierda el desayuno del hotel', 'pida room service a las 3 am',
    'sea el último en estar listo para salir', 'se cambie de ropa tres veces antes de salir', 'cuente spoilers sin querer',
    'se ofenda por un meme', 'gane un reality show', 'sea el villano de una película', 'adopte un acento después de un viaje',
    'termine casado con alguien que conoció de viaje', 'se ponga a hablar de trabajo en una fiesta', 'haga un asado para 30 personas',
    'se case en Las Vegas', 'se tatúe el nombre de su pareja', 'termine viviendo en el campo con gallinas', 'le abra una cuenta de redes a su mascota', 'se compre un barco', 'deje todo para ser DJ', 'se suba a un escenario sin que lo inviten', 'gane un concurso de comer panchos', 'se quede afuera de su casa sin llaves', 'pierda las llaves del auto alquilado', 'raye el auto alquilado', 'se duerma en el cine', 'se emocione con una publicidad', 'tenga una teoría conspirativa', 'crea en fantasmas', 'hable con las plantas', 'le ponga nombre a su auto', 'tenga una colección rarísima', 'se aprenda una coreografía entera de un video', 'mire una serie entera en un día', 'lea el final de un libro primero', 'cuente la misma anécdota diez veces', 'exagere todas sus historias', 'invente la mejor excusa para faltar', 'llegue tarde a todos lados', 'llegue cuatro horas antes al aeropuerto', 'pida una segunda porción de postre', 'pruebe comer un insecto', 'cebe el peor mate', 'se olvide la bombilla', 'le ponga azúcar al mate', 'sea el último en irse de una fiesta', 'se vaya de una fiesta sin saludar', 'se haga amigo del DJ', 'pida cumbia en un casamiento', 'se saque los zapatos en la pista', 'termine la noche comiendo un choripán', 'se duerma en la previa', 'organice la previa', 'se le escape un secreto', 'guarde un secreto para siempre', 'descubra su regalo antes de tiempo', 'se olvide dónde estacionó', 'hable solo por la calle', 'salude a alguien que no lo estaba saludando', 'se tropiece en público y lo disimule', 'se caiga a la pileta vestido', 'se tire a una pileta helada', 'vuelva del viaje más bronceado', 'vuelva del viaje con cinco kilos de más', 'traiga souvenirs para todo el mundo', 'traiga un imán de heladera de cada ciudad', 'se quede sin plata a mitad del viaje', 'se quede dormido en el colectivo y se pase de parada', 'se haga amigo del taxista', 'pague de más sin darse cuenta', 'discuta con el GPS', 'duerma en un aeropuerto por elección', 'maneje por el lado equivocado de la calle', 'casi se suba al avión equivocado', 'pida ventanilla y se duerma igual', 'se pelee por el apoyabrazos', 'vea cinco películas seguidas en el avión', 'se quede sin batería justo para la foto', 'filme todo el viaje y nunca edite el video', 'tenga 20.000 fotos sin ordenar', 'sea el fotógrafo oficial del grupo', 'salga con los ojos cerrados en todas las fotos', 'se enamore en las vacaciones', 'llore al despedirse en el aeropuerto', 'se quiera quedar a vivir donde fue de vacaciones', 'se olvide de llevar abrigo', 'lleve ropa para un mes en un viaje de tres días', 'arme la valija una hora antes de salir', 'deje la valija sin desarmar una semana', 'coma lo mismo todos los días sin aburrirse', 'pida el plato más caro sin mirar el precio', 'divida la cuenta hasta el último centavo', 'se haga el distraído cuando llega la cuenta', 'invite una ronda para todos', 'tenga hambre todo el tiempo', 'se ponga de mal humor cuando tiene hambre', 'duerma doce horas seguidas', 'se levante a las 6 de la mañana en vacaciones para aprovechar', 'haga una lista para todo', 'pierda la lista que hizo', 'se acuerde de todos los cumpleaños', 'conteste con stickers en vez de escribir', 'tenga miles de mensajes sin leer', 'conteste mails a las 3 de la mañana', 'trabaje en vacaciones', 'arme un mueble sin leer las instrucciones', 'arregle todo con cinta', 'desarme algo para ver cómo funciona', 'sobreviva solo en una isla desierta', 'sea abducido por extraterrestres', 'tenga un superpoder inútil', 'viaje en el tiempo y arruine todo', 'sea elegido para ir a Marte', 'adopte un animal exótico', 'tenga una banda de rock', 'salga en las noticias por algo absurdo', 'sea el primero en dormirse en una pijamada', 'haga la mejor imitación de alguien del grupo', 'cante en el auto a todo volumen', 'ponga la peor música en un viaje en auto', 'se haga el gracioso con la azafata', 'rompa algo en un negocio', 'pruebe todas las muestras gratis del súper', 'se lleve los sobrecitos de azúcar del bar', 'haga un video bailando en el medio del aeropuerto', 'sea el primero del grupo en casarse', 'sea el abuelo más divertido', 'cuide sus plantas como si fueran hijos', 'pierda una pelea contra una gaviota', 'se haga amigo de un gato en cada viaje', 'se pierda en un shopping', 'compre algo en la tele a las 3 de la mañana', 'se olvide de apagar la hornalla', 'confunda el nombre de alguien al presentarlo', 'mande una foto al chat equivocado', 'se ría tanto que le salga bebida por la nariz', 'grite en una película de terror', 'se esconda detrás del sillón en una de miedo'
  ];

  App.register({
    id: 'votos', name: '¿Quién es más probable?', emoji: '🗳️', players: '3-10',
    desc: 'Sale una pregunta y todos votan a alguien del grupo.',
    create: function (api) {
      function nextQ(H) {
        var S = H.S, P = H.P;
        S.round++;
        if (S.round > S.rounds) {
          S.phase = 'over';
          S.keep = null;
          H.publish();
          return;
        }
        S.q = Q[P.order[S.round - 1] % Q.length];
        S.stage = 'vote';
        S.voted = [];
        S.result = null;
        P.votes = {};
        H.publish();
      }
      function reveal(H) {
        var S = H.S, P = H.P;
        var counts = {};
        Object.keys(P.votes).forEach(function (v) { var t = P.votes[v]; counts[t] = (counts[t] || 0) + 1; S.tally[t] = (S.tally[t] || 0) + 1; });
        S.result = { counts: counts, who: S.secret ? null : U.clone(P.votes) };
        S.stage = 'reveal';
        S.history.push({ q: S.q, counts: counts });
        H.publish();
      }

      return SyncGame(api, {
        wait: {
          emoji: '🗳️', title: '¿Quién es más probable que…?', min: 3, max: 10,
          sub: 'Sale una pregunta y cada uno vota a alguien del grupo (también podés votarte). Después se ve quién se llevó más votos.',
          options: [
            { key: 'rounds', label: 'Preguntas', value: 10, choices: [[10, '10'], [20, '20'], [30, '30']] },
            { key: 'secret', label: 'Votos secretos', value: true, choices: [[true, 'Sí'], [false, 'No']] }
          ]
        },
        start: function (H, vals, players) {
          var order = U.shuffle(Q.map(function (q, i) { return i; }));
          H.set({ phase: 'play', players: players, round: 0, rounds: vals.rounds || 10, secret: vals.secret !== false, tally: {}, history: [] },
            { order: order, votes: {} });
          nextQ(H);
        },
        action: function (H, from, d) {
          var S = H.S, P = H.P;
          if (d.type === 'vote' && S.stage === 'vote') {
            if (!S.players.some(function (p) { return p.id === from; })) return;
            if (!S.players.some(function (p) { return p.id === d.to; })) return;
            P.votes[from] = d.to;
            if (S.voted.indexOf(from) < 0) S.voted.push(from);
            var all = S.players.every(function (p) { return P.votes[p.id] || !H.online(p.id); });
            if (all) reveal(H); else H.publish();
          } else if (d.type === 'next' && S.stage === 'reveal' && from === api.me) {
            nextQ(H);
          } else if (d.type === 'close' && S.stage === 'vote' && from === api.me) {
            reveal(H);
          }
        },
        priv: function (S, P, id) { return { mine: P.votes ? P.votes[id] || null : null }; },
        render: function (V, cur, priv) {
          var el = V.el, me = V.me;
          var html = '<div class="wait" style="padding-top:12px">';
          if (cur.phase === 'over') {
            var ids = Object.keys(cur.tally).sort(function (a, b) { return cur.tally[b] - cur.tally[a]; });
            html += '<div class="card" style="text-align:center;margin-bottom:12px"><div style="font-size:48px">👑</div>' +
              (ids.length ? '<p style="font-size:20px;font-weight:900;margin:6px 0">El más votado de la noche: ' + V.tag(ids[0]) + '</p>' : '') + '</div>';
            html += '<h2>Votos totales</h2><div class="plist">' + ids.map(function (id) {
              var p = V.player(id);
              return '<div class="pitem"><span class="sw" style="background:' + p.color + ';color:' + p.color + '"></span>' + V.esc(p.name) +
                '<span class="tag" style="color:var(--text)">' + cur.tally[id] + '</span></div>';
            }).join('') + '</div>' + V.endButtons('Otra ronda');
            html += '</div>';
            el.innerHTML = html;
            return;
          }
          html += '<p class="banner" style="font-size:13px;color:var(--muted);margin:0">Pregunta ' + cur.round + ' de ' + cur.rounds + '</p>';
          html += '<div class="card vt-q"><span>¿Quién es más probable que…</span><b>' + V.esc(cur.q) + '?</b></div>';
          var playing = cur.players.some(function (p) { return p.id === me; });
          if (cur.stage === 'vote') {
            var mine = priv && priv.mine;
            html += '<div class="plist">';
            cur.players.forEach(function (p) {
              var sel = mine === p.id;
              html += '<button class="pitem" data-to="' + p.id + '"' + (playing ? ' data-bot' : ' disabled') + ' style="color:var(--text);text-align:left;' +
                (sel ? 'border-color:var(--accent);background:var(--panel2)' : '') + '"><span class="sw" style="background:' + p.color + ';color:' + p.color + '"></span>' +
                V.esc(p.name) + (p.id === me ? ' (vos)' : '') + '<span class="tag">' + (cur.voted.indexOf(p.id) >= 0 ? 'votó ✔' : '') + (sel ? ' · tu voto' : '') + '</span></button>';
            });
            html += '</div><p class="hint">' + cur.voted.length + ' de ' + cur.players.length + ' votaron' + (cur.secret ? ' · los votos son secretos' : '') + '</p>';
            if (V.isHost()) html += '<p class="hint"><button class="btn small ghost" data-a="close">Mostrar resultado ya</button></p>';
          } else {
            var counts = cur.result.counts;
            var max = 0;
            Object.keys(counts).forEach(function (k) { max = Math.max(max, counts[k]); });
            var order = cur.players.slice().sort(function (a, b) { return (counts[b.id] || 0) - (counts[a.id] || 0); });
            html += '<div class="plist">';
            order.forEach(function (p) {
              var n = counts[p.id] || 0;
              var who = cur.result.who ? Object.keys(cur.result.who).filter(function (v) { return cur.result.who[v] === p.id; }).map(function (v) { return V.esc(V.player(v).name); }) : [];
              html += '<div class="pitem vt-bar" style="--w:' + (max ? Math.round(100 * n / max) : 0) + '%;--c:' + p.color + '"><span class="sw" style="background:' + p.color + ';color:' + p.color + '"></span>' +
                V.esc(p.name) + (n === max && n > 0 ? ' 👑' : '') + '<span class="tag" style="color:var(--text)">' + n + (who.length ? ' · ' + who.join(', ') : '') + '</span></div>';
            });
            html += '</div>';
            if (V.isHost()) html += '<button class="btn block" data-a="next" data-bot>' + (cur.round >= cur.rounds ? 'Ver el final' : 'Siguiente pregunta') + '</button>';
            else html += '<p class="hint">El anfitrión pasa a la siguiente pregunta.</p>';
          }
          html += '</div>';
          el.innerHTML = html;
          el.onclick = function (e) {
            var b = e.target.closest('[data-to],[data-a]');
            if (!b || b.disabled) return;
            if (b.hasAttribute('data-to')) { V.act({ type: 'vote', to: b.getAttribute('data-to') }); api.vibrate(15); }
            else V.act({ type: b.getAttribute('data-a') });
          };
        }
      });
    }
  });

  var css = document.createElement('style');
  css.textContent =
    '.vt-q{text-align:center;margin:10px 0 16px;padding:20px 16px}' +
    '.vt-q span{display:block;color:var(--muted);font-weight:700;font-size:15px}' +
    '.vt-q b{display:block;font-size:24px;line-height:1.25;margin-top:6px}' +
    '.vt-bar{position:relative;overflow:hidden}' +
    '.vt-bar::before{content:"";position:absolute;left:0;top:0;bottom:0;width:var(--w);background:var(--c);opacity:.18}';
  document.head.appendChild(css);
})();
