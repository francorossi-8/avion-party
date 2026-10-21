/* Avión Party — núcleo: conexión, lobby, chat y marco para juegos. */
(function () {
  'use strict';

  var COLORS = ['#ff5d6c', '#4fb3ff', '#ffd23f', '#3ddc84', '#c77dff', '#ff9f43', '#2ee6d6', '#ff6fb5'];
  var QUICK = ['😂', '🔥', '👏', '😱', 'GG', 'Revancha!', '¿Jugamos?', '✈️'];

  function mkStore(kind) {
    return {
      get: function (k, d) {
        try { var v = window[kind].getItem('ap_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
      },
      set: function (k, v) {
        try { window[kind].setItem('ap_' + k, JSON.stringify(v)); } catch (e) { }
      },
      del: function (k) { try { window[kind].removeItem('ap_' + k); } catch (e) { } }
    };
  }
  var store = mkStore('localStorage');
  var sstore = mkStore('sessionStorage');

  // Modo internet: la página se abre desde un dominio (el servidor en la nube) y no desde una IP local.
  var CLOUD = !/^(\d{1,3}\.){3}\d{1,3}$/.test(location.hostname) && location.hostname !== 'localhost';
  function cleanGroup(g) { return String(g || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12); }
  var GROUP = '';
  if (CLOUD) {
    var mg = location.search.match(/[?&]g=([^&]*)/);
    GROUP = cleanGroup(mg ? decodeURIComponent(mg[1]) : store.get('group', ''));
    if (GROUP) store.set('group', GROUP);
  }
  function randomGroup() {
    var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', g = '';
    for (var i = 0; i < 6; i++) g += A[(Math.random() * A.length) | 0];
    return g;
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function h(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  function hashColor(id) {
    var x = 0; id = String(id || '');
    for (var i = 0; i < id.length; i++) x = (x * 31 + id.charCodeAt(i)) >>> 0;
    return COLORS[x % COLORS.length];
  }
  function hhmm(ts) {
    var d = new Date(ts); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  var toastTimer;
  function toast(msg, ms) {
    var t = $('#toast'); t.textContent = msg; t.className = 'show';
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = ''; }, ms || 2400);
  }
  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { } }

  var App = {
    COLORS: COLORS, esc: esc, h: h, toast: toast, vibrate: vibrate, store: store, cloud: CLOUD, group: GROUP,
    games: {}, order: [],
    me: { id: store.get('id', null), name: store.get('name', '') },
    users: [], rooms: [], chat: [], unread: 0,
    dms: [], conv: 'all', unreadAll: 0, unreadBy: {},
    connected: false, ws: null, view: null, tab: 'games',
    roomId: null, wantRoom: null, inst: null, chatViews: [], drawer: null,

    register: function (def) { this.games[def.id] = def; this.order.push(def.id); },

    /**
     * Marcador compacto para los juegos con tablero: una sola fila con el color y los puntos de cada uno
     * y "Sos ●" para saber tu color. Tocándolo se muestran u ocultan los nombres.
     * items: [{id, name, color, score, cls ('turn'|'dead'), mark}]
     */
    scoreStrip: function (items, extra) {
      var me = this.me.id;
      var mine = null;
      items.forEach(function (it) { if (it.id === me) mine = it; });
      var html = '<div class="sstrip' + (store.get('names', false) ? ' names' : '') + '" data-sstrip>';
      function chip(it) {
        var isMe = it.id === me;
        return '<span class="ss-it' + (isMe ? ' me' : '') + (it.cls ? ' ' + it.cls : '') + '" style="--c:' + it.color + '">' +
          (isMe ? '<small>Sos</small>' : '') + '<i></i><em>' + esc(it.name) + '</em><b>' + it.score + '</b>' + (it.mark || '') + '</span>';
      }
      // tu ficha primero ("Sos ●"), después los demás
      if (mine) html += chip(mine);
      items.forEach(function (it) { if (it.id !== me) html += chip(it); });
      if (extra) html += '<span class="ss-x">' + extra + '</span>';
      return html + '<span class="ss-tog">👤</span></div>';
    },

    boot: function () {
      var self = this;
      // Alto realmente visible. Con el teclado abierto el navegador puede achicar la página
      // (Chrome con interactive-widget=resizes-content) o solo correr la vista hacia arriba
      // (Safari y otros): en ese caso usamos visualViewport para que la app ocupe justo la
      // parte de arriba del teclado y no se vaya todo para arriba.
      var vv = window.visualViewport, root = document.documentElement, fullH = {}, kbOn = false, lastH = 0, lastTop = -1;
      function typing() {
        var a = document.activeElement;
        return !!a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !/^(button|submit|checkbox|radio|range|color)$/i.test(a.type)));
      }
      function setH() {
        var hgt = Math.round(vv ? vv.height : window.innerHeight);
        if (!(hgt > 80)) hgt = Math.round(window.innerHeight);
        var top = vv ? Math.max(0, Math.round(vv.offsetTop)) : 0;
        var wkey = Math.round(window.innerWidth);
        if (!fullH[wkey] || hgt > fullH[wkey]) fullH[wkey] = hgt;
        var kb = typing() && hgt < fullH[wkey] - 120;
        if (hgt !== lastH) { lastH = hgt; root.style.setProperty('--app-h', hgt + 'px'); }
        if (top !== lastTop) { lastTop = top; root.style.setProperty('--app-top', top + 'px'); }
        if (kb !== kbOn) {
          kbOn = kb;
          root.classList.toggle('kb', kb);
          window.dispatchEvent(new Event('resize'));   // los juegos se vuelven a medir
        }
        if (kb) setTimeout(revealFocus, 60);
      }
      // si el campo quedó tapado dentro de una lista con scroll, la corremos (sin mover la página)
      function revealFocus() {
        var a = document.activeElement;
        if (!a || !typing()) return;
        for (var p = a.parentElement; p && p !== document.body; p = p.parentElement) {
          var oy = getComputedStyle(p).overflowY;
          if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) {
            var r = a.getBoundingClientRect(), pr = p.getBoundingClientRect();
            if (r.bottom > pr.bottom - 10) p.scrollTop += r.bottom - pr.bottom + 16;
            else if (r.top < pr.top + 10) p.scrollTop -= pr.top - r.top + 16;
            return;
          }
        }
      }
      setH();
      window.addEventListener('resize', setH);
      if (vv) { vv.addEventListener('resize', setH); vv.addEventListener('scroll', setH); }
      window.addEventListener('orientationchange', function () { setTimeout(setH, 250); });
      document.addEventListener('focusin', function () { setTimeout(setH, 50); setTimeout(setH, 400); });
      document.addEventListener('focusout', function () { setTimeout(setH, 50); setTimeout(setH, 400); });
      // tocar el marcador muestra u oculta los nombres
      document.addEventListener('click', function (e) {
        var st = e.target.closest && e.target.closest('[data-sstrip]');
        if (!st) return;
        var on = !store.get('names', false);
        store.set('names', on);
        var all = document.querySelectorAll('.sstrip');
        for (var i = 0; i < all.length; i++) all[i].classList.toggle('names', on);
        window.dispatchEvent(new Event('resize'));
      });
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && (!self.ws || self.ws.readyState > 1)) self.connect();
        if (!document.hidden) self.nativePending();
      });
      window.addEventListener('focus', function () { self.nativePending(); });
      setTimeout(function () { self.nativePending(); }, 1500);
      document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
      // en modo internet el link lleva el código del grupo (así "Agregar a inicio" lo guarda)
      if (CLOUD && GROUP && !/[?&]g=/.test(location.search)) { try { history.replaceState(null, '', location.pathname + '?g=' + GROUP); } catch (e) { } }
      if (!this.me.name || (CLOUD && !this.group)) this.renderName();
      else { this.renderLobby(); this.connect(); }
    },

    // ------------------------------------------------------------- conexión
    connect: function () {
      var self = this;
      clearTimeout(this.retryTimer);
      if (this.ws && this.ws.readyState <= 1) return;
      var ws;
      try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws' + (this.group ? '?g=' + encodeURIComponent(this.group) : '')); }
      catch (e) { this.retryTimer = setTimeout(function () { self.connect(); }, 1500); return; }
      this.ws = ws;
      ws.onopen = function () { ws.send(JSON.stringify({ t: 'hello', id: self.me.id, name: self.me.name })); };
      ws.onmessage = function (ev) {
        var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        self.handle(m);
      };
      ws.onclose = function () {
        if (self.ws !== ws) return;
        self.connected = false; self.updateConn();
        self.retryTimer = setTimeout(function () { self.connect(); }, 1200);
      };
      ws.onerror = function () { try { ws.close(); } catch (e) { } };
      if (!this.pinger) this.pinger = setInterval(function () { self.send({ t: 'ping' }); }, 15000);
    },

    send: function (o) {
      if (this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify(o)); return true; }
      return false;
    },

    handle: function (m) {
      switch (m.t) {
        case 'welcome':
          this.me.id = m.id; store.set('id', m.id);
          this.connected = true;
          this.chat = m.chat || [];
          this.dms = m.dms || [];
          this.nativeHello();
          if (m.room) {
            if (this.roomId === m.room && this.inst) {
              if (this.inst.onReconnect) this.inst.onReconnect();
            } else {
              if (this.roomId) this.closeRoom(true);
              this.wantRoom = m.room;
            }
          } else if (this.roomId) {
            this.closeRoom();
            toast('Saliste de la sala');
          }
          this.updateConn();
          this.chatViews.forEach(function (v) { v.reset(); });
          if (this.view === 'lobby') this.renderLobbyBody();
          break;
        case 'lobby':
          this.users = m.users || []; this.rooms = m.rooms || [];
          if (this.wantRoom) {
            var w = this.room(this.wantRoom);
            if (w) { this.wantRoom = null; this.openRoom(w.id); }
          }
          if (this.roomId) {
            var r = this.room(this.roomId);
            if (!r) { this.closeRoom(); toast('La sala se cerró'); }
            else if (this.inst && this.inst.onRoom) this.inst.onRoom(r);
          }
          if (this.view === 'lobby') this.renderLobbyBody();
          break;
        case 'chat':
          this.chat.push(m);
          if (this.chat.length > 150) this.chat.shift();
          var seen = false;
          this.chatViews.forEach(function (v) { if (v.append(m, 'all') && v.visible()) seen = true; });
          if ((!seen || document.hidden) && m.from !== this.me.id) {
            if (!seen) this.unreadAll++;
            if (this.view === 'room' && !document.hidden) toast(m.name + ': ' + m.text);
            this.attention('chat', m.name + ' · Chat', m.text, { conv: 'all' });
          }
          this.updateBadges();
          break;
        case 'dm':
          this.dms.push(m);
          if (this.dms.length > 400) this.dms.shift();
          var other = m.from === this.me.id ? m.to : m.from, seenDm = false;
          this.chatViews.forEach(function (v) { if (v.append(m, other) && v.visible()) seenDm = true; });
          if (m.from !== this.me.id && (!seenDm || document.hidden)) {
            if (!seenDm) this.unreadBy[other] = (this.unreadBy[other] || 0) + 1;
            this.attention('dm', '🔒 ' + m.name, m.text, { conv: other });
          }
          this.updateBadges();
          break;
        case 'call':
          this.attention('call', '📣 ' + m.name, m.text + (m.room ? '' : ''), { room: m.room, from: m.from });
          break;
        case 'joined':
          if (this.roomId !== m.room) {
            if (this.roomId) this.closeRoom(true);
            this.wantRoom = m.room;
            var rr = this.room(m.room);
            if (rr) { this.wantRoom = null; this.openRoom(m.room); }
          }
          break;
        case 'left':
          break;
        case 'error':
          toast(m.msg || 'Error');
          break;
        case 'g':
          if (this.inst && this.inst.onMsg) {
            try { this.inst.onMsg(m.from, m.d || {}); } catch (e) { console.error(e); }
          }
          break;
      }
    },

    room: function (id) {
      for (var i = 0; i < this.rooms.length; i++) if (this.rooms[i].id === id) return this.rooms[i];
      return null;
    },
    user: function (id) {
      for (var i = 0; i < this.users.length; i++) if (this.users[i].id === id) return this.users[i];
      return null;
    },
    userName: function (id) { var u = this.user(id); return u ? u.name : '¿?'; },

    updateConn: function () {
      var dots = document.querySelectorAll('.conn-dot');
      for (var i = 0; i < dots.length; i++) dots[i].className = 'dot conn-dot' + (this.connected ? '' : ' off');
      var b = $('#connBanner');
      if (b) b.style.display = this.connected ? 'none' : 'block';
    },

    updateBadges: function () {
      var self = this, tot = this.unreadAll;
      Object.keys(this.unreadBy).forEach(function (k) { tot += self.unreadBy[k] || 0; });
      this.unread = tot;
      var els = document.querySelectorAll('.chat-badge');
      for (var i = 0; i < els.length; i++) {
        els[i].textContent = tot > 9 ? '9+' : tot;
        els[i].style.display = tot ? 'flex' : 'none';
      }
      this.chatViews.forEach(function (v) { if (v.paintConvs) v.paintConvs(); });
      try { document.title = (tot ? '(' + tot + ') ' : '') + 'Avión Party'; } catch (e) { }
    },

    // ------------------------------------------------------------- avisos
    notifPrefs: function () { return store.get('notif', { chat: true }); },
    /** Algo pide atención: cartel arriba (con la app abierta) o aviso del sistema (con la app en segundo plano). */
    attention: function (kind, title, body, act) {
      var self = this, pr = this.notifPrefs();
      if (kind === 'chat' && !pr.chat) return;
      if (document.hidden) {
        // la app Android ya avisa por su cuenta; en el navegador, si se puede, aviso del sistema
        if (window.AndroidHost && window.AndroidHost.setUser) return;
        try {
          if (window.Notification && Notification.permission === 'granted') {
            var n = new Notification(title, { body: body, tag: kind + (act.conv || act.room || ''), icon: 'icon-192.png' });
            n.onclick = function () { try { window.focus(); } catch (e) { } self.doAction(kind, act); n.close(); };
          }
        } catch (e) { }
        return;
      }
      if (kind === 'chat') return;   // el chat general con la app abierta: alcanza con el cartelito de siempre
      vibrate(kind === 'call' ? [80, 60, 80] : 60);
      this.beep();
      var bar = $('#alertBar');
      if (!bar) { bar = h('<div id="alertBar"></div>'); document.body.appendChild(bar); }
      bar.innerHTML = '<b>' + esc(title) + '</b><span>' + esc(body) + '</span>' +
        (kind === 'call' && act.room ? '<button class="btn small">Unirme</button>' : (kind === 'dm' ? '<button class="btn small ghost">Responder</button>' : ''));
      bar.className = 'show';
      clearTimeout(this.alertT);
      this.alertT = setTimeout(function () { bar.className = ''; }, 6000);
      bar.onclick = function () { bar.className = ''; self.doAction(kind, act); };
    },
    doAction: function (kind, act) {
      act = act || {};
      if (kind === 'call' && act.room) {
        if (this.roomId === act.room) return;
        if (this.room(act.room)) this.send({ t: 'join', room: act.room });
        else toast('Esa sala ya no existe');
        return;
      }
      if (kind === 'dm' || kind === 'chat') this.openConv(act.conv || 'all');
    },
    /** Abre el chat en una conversación ('all' = general, o el id de alguien para el privado). */
    openConv: function (conv) {
      this.conv = conv || 'all';
      if (this.conv === 'all') this.unreadAll = 0; else this.unreadBy[this.conv] = 0;
      if (this.view === 'room') { if (this.drawer) this.closeDrawer(); this.openDrawer(); }
      else if (this.view === 'lobby') { this.tab = 'chat'; this.renderLobbyBody(true); }
      this.updateBadges();
    },
    beep: function () {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        var ac = this._ac || (this._ac = new AC());
        if (ac.state === 'suspended') ac.resume();
        var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
        o.type = 'sine'; o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(1320, t + 0.09);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.27);
      } catch (e) { }
    },
    /** "¡Vengan a jugar!" a todos los conectados (si estás en una sala, los invita a esa sala). */
    callAll: function (text) {
      var now = Date.now();
      if (this.lastCall && now - this.lastCall < 8000) { toast('Esperá unos segundos para volver a llamar'); return; }
      this.lastCall = now;
      if (this.send({ t: 'call', text: text })) toast('📣 Les avisé a todos');
      else toast('Sin conexión');
    },
    /** Le cuenta a la app Android quién soy y dónde está el servidor, para que avise con el celular bloqueado. */
    nativeHello: function () {
      var host = window.AndroidHost;
      if (!host || !host.setUser) return;
      try {
        host.setUser(this.me.id, this.me.name, (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws' + (this.group ? '?g=' + encodeURIComponent(this.group) : ''));
        if (host.setNotifPrefs) host.setNotifPrefs(JSON.stringify(this.notifPrefs()));
      } catch (e) { }
    },
    /** Si se abrió tocando un aviso de la app Android, hacer lo que corresponda. */
    nativePending: function () {
      var host = window.AndroidHost;
      if (!host || !host.takePending) return;
      try {
        var p = host.takePending();
        if (!p) return;
        p = JSON.parse(p);
        var self = this;
        setTimeout(function () { self.doAction(p.kind, { conv: p.kind === 'dm' ? p.from : 'all', room: p.room }); }, 400);
      } catch (e) { }
    },

    // ------------------------------------------------------------- nombre
    renderName: function () {
      var self = this;
      this.view = 'name';
      var el = $('#app');
      el.innerHTML =
        '<div class="screen"><div class="hero">' +
        '<div class="logo">✈️</div>' +
        '<h1>Avión <em>Party</em></h1>' +
        (CLOUD ? '<p>Chat y juegos por internet. Entrá con el mismo <b>código de grupo</b> que tus amigos.</p>'
          : '<p>Chat y juegos multijugador sin internet. Todos conectados al mismo wifi.</p>') +
        '<input class="field" id="nameIn" maxlength="18" placeholder="¿Cómo te llamás?" autocomplete="off">' +
        (CLOUD ? '<div style="display:flex;gap:8px"><input class="field" id="grpIn" maxlength="12" placeholder="Código del grupo" autocomplete="off" autocapitalize="characters" style="text-transform:uppercase">' +
          '<button class="btn ghost" id="grpNew" title="Inventar uno">🎲</button></div>' +
          '<p class="hint" style="margin:-8px 0 0;text-align:left">Inventá uno (o tocá 🎲) y pasáselo a tus amigos. Solo ven tus salas los que tienen el mismo código.</p>' : '') +
        '<button class="btn block" id="nameGo">Entrar</button>' +
        '</div></div>';
      var inp = $('#nameIn'), gin = $('#grpIn');
      inp.value = this.me.name || '';
      if (gin) {
        gin.value = this.group || '';
        $('#grpNew').onclick = function () { gin.value = randomGroup(); };
      }
      function go() {
        var n = inp.value.trim();
        if (!n) { inp.focus(); return; }
        if (gin) {
          var g = cleanGroup(gin.value);
          if (!g) { gin.focus(); toast('Poné un código de grupo'); return; }
          if (g !== self.group) {
            // otro grupo: recargar con el código nuevo en el link
            self.me.name = n.slice(0, 18); store.set('name', self.me.name); store.set('group', g);
            location.replace(location.pathname + '?g=' + g);
            return;
          }
        }
        var first = !self.me.name || !self.connected;
        self.me.name = n.slice(0, 18); store.set('name', self.me.name);
        if (first) { self.renderLobby(); self.connect(); }
        else { self.send({ t: 'name', name: self.me.name }); self.renderLobby(); }
      }
      $('#nameGo').onclick = go;
      inp.onkeydown = function (e) { if (e.key === 'Enter') go(); };
      setTimeout(function () { inp.focus(); }, 50);
    },

    // ------------------------------------------------------------- lobby
    renderLobby: function () {
      var self = this;
      this.view = 'lobby';
      this.unmountChats();
      var el = $('#app');
      el.innerHTML =
        '<div class="screen">' +
        '<div class="conn-banner" id="connBanner" style="display:none">Sin conexión con el servidor… reconectando</div>' +
        '<div class="topbar"><h1><span class="dot conn-dot"></span><span class="title-txt">Avión Party ' + (CLOUD ? '🌐' : '✈️') + '</span>' +
        (CLOUD ? '<small>' + esc(this.group) + '</small>' : '') + '</h1>' +
        '<button class="iconbtn" id="meBtn">👤 ' + esc(this.me.name) + '</button></div>' +
        '<div class="tabs">' +
        '<button class="tab" data-tab="games">Juegos</button>' +
        '<button class="tab" data-tab="chat">Chat<span class="badge chat-badge" style="display:none"></span></button>' +
        '<button class="tab" data-tab="join">Invitar</button>' +
        '</div>' +
        '<div id="lobbyBody" style="flex:1;min-height:0;display:flex;flex-direction:column"></div>' +
        '</div>';
      $('#meBtn').onclick = function () { self.renderName(); };
      var tabs = el.querySelectorAll('.tab');
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].onclick = function () { self.tab = this.getAttribute('data-tab'); self.renderLobbyBody(true); };
      }
      this.updateConn();
      this.renderLobbyBody(true);
    },

    renderLobbyBody: function (force) {
      var self = this;
      var body = $('#lobbyBody');
      if (!body) return;
      var tabs = document.querySelectorAll('.tab');
      for (var i = 0; i < tabs.length; i++) tabs[i].className = 'tab' + (tabs[i].getAttribute('data-tab') === this.tab ? ' on' : '');

      if (this.tab === 'chat') {
        if (force || !body.querySelector('.chat')) {
          this.unmountChats();
          body.innerHTML = '';
          this.mountChat(body);
        }
        if (this.conv === 'all') this.unreadAll = 0; else this.unreadBy[this.conv] = 0;
        this.updateBadges();
        return;
      }
      this.unmountChats();
      this.updateBadges();
      if (this.tab === 'join') {
        if (force || !body.querySelector('.join-box')) this.renderJoin(body);
        return;
      }

      // pestaña juegos
      var scrollTop = body.firstChild && body.firstChild.scrollTop;
      var html = '<div class="scroll">';
      html += '<h2>Salas abiertas</h2>';
      if (!this.rooms.length) {
        html += '<div class="empty">Todavía no hay salas. Creá una abajo 👇</div>';
      } else {
        this.rooms.forEach(function (r) {
          var g = self.games[r.game] || { emoji: '🎲', name: r.game };
          var names = r.members.map(function (id) { return self.userName(id); }).join(', ');
          html += '<div class="card room-row"><div class="emoji">' + g.emoji + '</div>' +
            '<div class="info"><b>' + esc(g.name) + ' · ' + esc(r.title) + '</b><span>' + r.members.length + ' · ' + esc(names) + '</span></div>' +
            '<button class="btn small" data-join="' + esc(r.id) + '">Unirse</button></div>';
        });
      }
      html += '<h2>Crear sala</h2><div class="games">';
      this.order.forEach(function (id) {
        var g = self.games[id];
        html += '<button class="game-card" data-create="' + id + '"><div class="emoji">' + g.emoji + '</div>' +
          '<div class="pl">' + g.players + '</div><b>' + esc(g.name) + '</b><span>' + esc(g.desc) + '</span></button>';
      });
      html += '</div>';
      var online = this.users.filter(function (u) { return u.online; });
      html += '<h2 style="display:flex;align-items:center;gap:8px">Conectados (' + online.length + ')<span style="flex:1"></span>' +
        (online.length > 1 ? '<button class="btn small ghost" data-callall style="text-transform:none;letter-spacing:0">📣 Llamar a jugar</button>' : '') + '</h2><div class="people">';
      this.users.forEach(function (u) {
        if (!u.online) return;
        var where = u.room ? ' · ' + ((self.games[(self.room(u.room) || {}).game] || {}).emoji || '🎲') : '';
        var mine = u.id === self.me.id, unr = self.unreadBy[u.id];
        html += (mine ? '<span' : '<button data-dm="' + esc(u.id) + '"') + ' class="chip' + (mine ? ' me' : '') + '"><span class="sw" style="background:' + hashColor(u.id) + '"></span>' +
          esc(u.name) + where + (mine ? '' : ' <span class="dm-ic">💬' + (unr ? '<i>' + unr + '</i>' : '') + '</span>') + (mine ? '</span>' : '</button>');
      });
      html += '</div><p class="hint" style="text-align:left;margin:8px 2px 0">Tocá a alguien para escribirle en privado.</p></div>';
      body.innerHTML = html;
      if (scrollTop) body.firstChild.scrollTop = scrollTop;
      body.onclick = function (e) {
        var dmb = e.target.closest('[data-dm]');
        if (dmb) { self.openConv(dmb.getAttribute('data-dm')); return; }
        if (e.target.closest('[data-callall]')) { self.callAll('¡Vengan a jugar!'); return; }
        var t = e.target.closest('[data-join],[data-create]');
        if (!t) return;
        if (!self.connected) { toast('Sin conexión todavía…'); return; }
        if (t.hasAttribute('data-join')) self.send({ t: 'join', room: t.getAttribute('data-join') });
        else self.send({ t: 'create', game: t.getAttribute('data-create') });
      };
    },

    renderJoin: function (body) {
      var self = this;
      var host = window.AndroidHost;
      var canSwitch = !!(host && host.setMode);   // solo dentro de la app Android
      body.innerHTML = '<div class="scroll"><div class="card join-box" id="joinBox"><p class="hint">Buscando la dirección…</p></div>' +
        '<div id="modeBox"></div></div>';
      var box = $('#joinBox');
      function qr(url) {
        try {
          var q = qrcode(0, 'M'); q.addData(url); q.make();
          return '<div class="qr">' + q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }) + '</div>';
        } catch (e) { return ''; }
      }
      function draw(url) {
        if (CLOUD) {
          box.innerHTML =
            '<h2 style="margin-top:0">🌐 Por internet</h2>' + qr(url) +
            '<div class="url" style="font-size:17px">' + esc(url) + '</div>' +
            '<p style="margin:10px 0 0;font-weight:800">Código del grupo: <span style="color:var(--accent);letter-spacing:1px">' + esc(self.group) + '</span></p>' +
            '<ol class="steps">' +
            '<li>Mandales el link (o que escaneen el QR). Sirve desde cualquier lugar con <b>internet</b>.</li>' +
            '<li>Si les pide código, que pongan <b>' + esc(self.group) + '</b>.</li>' +
            '<li>Si tarda en abrir, esperá un minuto: el servidor gratis se "despierta" cuando entra el primero.</li>' +
            '<li>En iPhone: <b>Compartir → Agregar a inicio</b> para usarla como app.</li>' +
            '</ol>' +
            (navigator.share ? '<p style="margin:12px 0 0"><button class="btn small" id="shareBtn">📤 Compartir link</button></p>' : '');
          var sb = $('#shareBtn');
          if (sb) sb.onclick = function () { try { navigator.share({ title: 'Avión Party', text: 'Entrá a jugar (grupo ' + self.group + '):', url: url }); } catch (e) { } };
          // avisos del navegador (por internet la página es https y se pueden pedir)
          if (!host && window.Notification && Notification.permission !== 'granted') {
            box.insertAdjacentHTML('beforeend', '<p style="margin:12px 0 0"><button class="btn small ghost" id="notifBtn">🔔 Activar avisos en este celular</button></p>' +
              '<p class="hint" style="text-align:left">Te avisa de mensajes privados e invitaciones mientras la página esté abierta, aunque estés en otra app. En iPhone funciona si la agregaste a inicio.</p>');
            $('#notifBtn').onclick = function () {
              try { Notification.requestPermission().then(function (r) { toast(r === 'granted' ? '🔔 Listo, te voy a avisar' : 'No se activaron los avisos'); self.renderLobbyBody(true); }); } catch (e) { }
            };
          }
          return;
        }
        box.innerHTML =
          '<h2 style="margin-top:0">📶 Hotspot o wifi de la casa</h2>' + qr(url) +
          '<div class="url">' + esc(url) + '</div>' +
          '<ol class="steps">' +
          '<li>Conectate al <b>hotspot</b> del celular anfitrión, o al <b>mismo wifi</b> de la casa en el que está él.</li>' +
          '<li>Si aparece “wifi sin internet”, elegí <b>Mantener conexión</b>.</li>' +
          '<li>Abrí la dirección en <b>Safari o Chrome</b> (o escaneá el QR con la cámara).</li>' +
          '<li>En iPhone: <b>Compartir → Agregar a inicio</b> para usarla como app.</li>' +
          '</ol>' +
          '<p class="hint" style="text-align:left">Si en el wifi de una casa no conecta, puede ser la “red de invitados” del router (no deja que los equipos se vean entre sí): usá la red principal o el hotspot.</p>';
      }
      // cambiar de modo (solo en la app Android)
      if (canSwitch) {
        var mb = $('#modeBox'), nmode = '';
        try { nmode = host.getMode(); } catch (e) { }
        if (nmode === 'join') {
          mb.innerHTML = '<div class="card" style="margin-top:12px"><b>🙋 Estás en la partida de otro celular</b><p class="hint" style="text-align:left;margin:4px 0 10px">' +
            'Te llegan los mensajes privados y las invitaciones aunque tengas el celular bloqueado.</p></div>';
        } else if (CLOUD) {
          mb.innerHTML = '<div class="card" style="margin-top:12px"><b>¿Están todos juntos?</b><p class="hint" style="text-align:left;margin:4px 0 10px">' +
            'Sin internet funciona con tu hotspot o el wifi de la casa.</p><button class="btn ghost block" id="toLocal">📶 Volver al modo hotspot / wifi</button></div>';
          $('#toLocal').onclick = function () { host.setMode('local', ''); };
        } else {
          var saved = '';
          try { saved = host.getCloudUrl() || ''; } catch (e) { }
          mb.innerHTML = '<div class="card" style="margin-top:12px"><b>🌐 Jugar por internet</b><p class="hint" style="text-align:left;margin:4px 0 10px">' +
            'Para jugar cada uno desde su casa. Pegá la dirección de tu servidor en internet (la de Render).</p>' +
            '<input class="field" id="cloudIn" placeholder="https://avion-party.onrender.com" autocomplete="off" autocapitalize="off" style="font-size:15px;margin-bottom:10px">' +
            '<button class="btn block" id="toCloud">🌐 Pasar al modo internet</button></div>';
          var ci = $('#cloudIn');
          ci.value = saved;
          $('#toCloud').onclick = function () {
            var u = ci.value.trim().replace(/\/+$/, '');
            if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
            if (!/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(u)) { toast('Pegá la dirección completa, por ejemplo https://avion-party.onrender.com'); return; }
            host.setMode('cloud', u);
          };
        }
        if (host.chooseMode) {
          mb.insertAdjacentHTML('beforeend', '<p style="margin:12px 0 0;text-align:center"><button class="btn small ghost" id="chMode">⚙️ Cambiar de modo</button></p>');
          $('#chMode').onclick = function () { self.confirm(nmode === 'local' ? '¿Cambiar de modo? Se apaga el servidor de este celular y se corta la partida para todos.' : '¿Cambiar de modo? Vas a volver a la pantalla de inicio.', 'Cambiar', function () { host.chooseMode(); }); };
        }
      }
      if (CLOUD) { draw(location.origin + '/?g=' + encodeURIComponent(this.group)); return; }
      var isLocal = /^(127\.|localhost)/.test(location.hostname);
      if (!isLocal) draw(location.origin);
      function offerApk(info) {
        // un amigo con Android desde el navegador: puede bajarse la app desde este mismo celular, sin internet
        if (host || !info.apk || !/Android/i.test(navigator.userAgent) || $('#apkBox')) return;
        $('#modeBox').insertAdjacentHTML('beforeend', '<div class="card" id="apkBox" style="margin-top:12px"><b>📲 ¿Tenés Android? Bajate la app</b>' +
          '<p class="hint" style="text-align:left;margin:4px 0 10px">Con la app te llegan los mensajes privados y las invitaciones aunque tengas el celular bloqueado. ' +
          'Se baja desde el celular del anfitrión, no hace falta internet. Al abrirla elegí <b>Me uno a la de un amigo</b>.</p>' +
          '<a class="btn block" href="/AvionParty.apk" download="AvionParty.apk" style="display:block;text-align:center;text-decoration:none">Bajar la app</a></div>');
      }
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/info');
      xhr.onload = function () {
        try {
          var info = JSON.parse(xhr.responseText);
          offerApk(info);
          if (isLocal) {
            if (info.ips && info.ips.length) draw('http://' + info.ips[0].ip + ':' + info.port);
            else box.innerHTML = '<p class="hint">No encuentro la red. Activá el <b>hotspot</b> o conectate a un <b>wifi</b> y volvé a abrir esta pestaña.</p>';
            if (host && host.openHotspotSettings) {
              box.insertAdjacentHTML('beforeend', '<p style="margin:14px 0 0"><button class="btn small ghost" id="hsBtn">📶 Abrir ajustes del hotspot</button></p>');
              $('#hsBtn').onclick = function () { try { host.openHotspotSettings(); } catch (e) { } };
            }
            if (info.ips && info.ips.length > 1) {
              box.insertAdjacentHTML('beforeend', '<p class="hint">Otras direcciones: ' +
                info.ips.slice(1).map(function (x) { return esc(x.ip + ':' + info.port) + ' (' + esc(x.iface) + ')'; }).join(', ') + '</p>');
            }
          }
        } catch (e) { }
      };
      xhr.send();
    },

    // ------------------------------------------------------------- chat
    mountChat: function (container) {
      var self = this;
      var wrap = h('<div class="chat"><div class="convs"></div><div class="chat-list"></div>' +
        '<div class="quick">' + QUICK.map(function (q) { return '<button>' + esc(q) + '</button>'; }).join('') + '</div>' +
        '<form class="chat-form"><input class="field" maxlength="400" placeholder="Escribí un mensaje…" autocomplete="off">' +
        '<button class="btn small" type="submit">Enviar</button></form></div>');
      container.appendChild(wrap);
      var list = wrap.querySelector('.chat-list'), convs = wrap.querySelector('.convs');
      var inp = wrap.querySelector('input');
      function msgsOf(conv) {
        if (conv === 'all') return self.chat;
        return self.dms.filter(function (d) { return d.from === conv || d.to === conv; });
      }
      function nameOf(id) {
        var u = self.user(id);
        if (u) return u.name;
        for (var i = self.dms.length - 1; i >= 0; i--) if (self.dms[i].from === id) return self.dms[i].name;
        return '¿?';
      }
      function item(m) {
        var mine = m.from === self.me.id;
        return h('<div class="msg' + (mine ? ' mine' : '') + (m.t === 'dm' ? ' dm' : '') + '"><div class="who" style="color:' + hashColor(m.from) + '">' + esc(m.name) + '</div>' +
          esc(m.text) + '<span class="tm">' + hhmm(m.ts) + '</span></div>');
      }
      function paintConvs() {
        // conversaciones: el chat de todos + uno privado con cada persona (conectados primero)
        var ids = [], seenIds = {};
        self.users.forEach(function (u) { if (u.id !== self.me.id && u.online) { ids.push(u.id); seenIds[u.id] = 1; } });
        self.dms.forEach(function (d) {
          var o = d.from === self.me.id ? d.to : d.from;
          if (!seenIds[o]) { ids.push(o); seenIds[o] = 1; }
        });
        if (self.conv !== 'all' && !seenIds[self.conv]) ids.unshift(self.conv);
        function badge(n) { return n ? '<i>' + (n > 9 ? '9+' : n) + '</i>' : ''; }
        var pr = self.notifPrefs();
        convs.innerHTML = '<button class="conv' + (self.conv === 'all' ? ' on' : '') + '" data-conv="all">💬 Todos' + badge(self.unreadAll) + '</button>' +
          ids.map(function (id) {
            var u = self.user(id), off = !u || !u.online;
            return '<button class="conv' + (self.conv === id ? ' on' : '') + (off ? ' off' : '') + '" data-conv="' + esc(id) + '">' +
              '<span class="sw" style="background:' + hashColor(id) + '"></span>🔒 ' + esc(nameOf(id)) + badge(self.unreadBy[id]) + '</button>';
          }).join('') +
          (self.conv === 'all' ? '<button class="conv bell" data-bell title="Avisos del chat de todos">' + (pr.chat ? '🔔' : '🔕') + '</button>' : '');
        inp.placeholder = self.conv === 'all' ? 'Escribí un mensaje…' : 'Mensaje privado a ' + nameOf(self.conv) + '…';
      }
      var view = {
        append: function (m, conv) {
          if (conv !== self.conv) return false;
          var em = list.querySelector('.empty'); if (em) em.remove();
          var atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
          list.appendChild(item(m));
          if (atBottom || m.from === self.me.id) list.scrollTop = list.scrollHeight;
          return true;
        },
        reset: function () {
          list.innerHTML = '';
          var ms = msgsOf(self.conv);
          if (!ms.length) list.appendChild(h('<div class="empty" style="margin:auto 0">' + (self.conv === 'all' ? 'Nadie escribió todavía. ¡Rompé el hielo!' :
            '🔒 Chat privado con ' + esc(nameOf(self.conv)) + '. Solo lo ven ustedes dos.') + '</div>'));
          ms.forEach(function (m) { list.appendChild(item(m)); });
          list.scrollTop = list.scrollHeight;
          paintConvs();
        },
        paintConvs: paintConvs,
        visible: function () { return document.body.contains(wrap); },
        el: wrap
      };
      view.reset();
      if (self.conv === 'all') self.unreadAll = 0; else self.unreadBy[self.conv] = 0;
      // si se achica (teclado) y estabas viendo lo último, seguir viendo lo último
      var stick = true, lastCh = list.clientHeight;
      list.addEventListener('scroll', function () {
        if (list.clientHeight !== lastCh) return;   // lo movió el cambio de tamaño, no la persona
        stick = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
      });
      if (window.ResizeObserver) new ResizeObserver(function () {
        if (stick) list.scrollTop = list.scrollHeight;
        lastCh = list.clientHeight;
      }).observe(list);
      function sendText(t) {
        var ok = self.conv === 'all' ? self.send({ t: 'chat', text: t }) : self.send({ t: 'dm', to: self.conv, text: t });
        if (!ok) toast('Sin conexión');
        return ok;
      }
      wrap.querySelector('form').onsubmit = function (e) {
        e.preventDefault();
        var t = inp.value.trim();
        if (!t) return;
        if (sendText(t)) inp.value = '';
      };
      wrap.querySelector('.quick').onclick = function (e) {
        if (e.target.tagName === 'BUTTON') sendText(e.target.textContent);
      };
      convs.onclick = function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        if (b.hasAttribute('data-bell')) {
          var pr = self.notifPrefs(); pr.chat = !pr.chat; store.set('notif', pr);
          toast(pr.chat ? '🔔 Te aviso de los mensajes del chat de todos' : '🔕 Sin avisos del chat de todos (los privados y las invitaciones sí)');
          self.nativeHello(); paintConvs();
          return;
        }
        var c = b.getAttribute('data-conv');
        if (!c) return;
        self.conv = c;
        if (c === 'all') self.unreadAll = 0; else self.unreadBy[c] = 0;
        self.chatViews.forEach(function (v) { v.reset(); });
        self.updateBadges();
      };
      this.chatViews.push(view);
      self.updateBadges();
      return view;
    },

    unmountChats: function () {
      this.chatViews = this.chatViews.filter(function (v) { return v.visible() && v.el.closest('.drawer'); });
    },

    openDrawer: function () {
      var self = this;
      if (this.drawer) return;
      var d = h('<div class="drawer"><div class="topbar"><h1><span class="title-txt">💬 Chat</span></h1>' +
        '<button class="iconbtn" id="drClose">Cerrar ✕</button></div></div>');
      document.body.appendChild(d);
      this.drawer = d;
      var v = this.mountChat(d);
      this.updateBadges();
      d.querySelector('#drClose').onclick = function () { self.closeDrawer(); };
      setTimeout(function () { v.el.querySelector('input').focus(); }, 100);
    },
    closeDrawer: function () {
      if (!this.drawer) return;
      var d = this.drawer;
      this.drawer = null;
      this.chatViews = this.chatViews.filter(function (v) { return !d.contains(v.el); });
      d.remove();
    },

    confirm: function (text, okLabel, cb) {
      var d = h('<div class="drawer" style="justify-content:center;align-items:center;padding:24px">' +
        '<div class="card" style="max-width:340px;width:100%;text-align:center">' +
        '<p style="font-size:17px;font-weight:800;margin:6px 0 18px">' + esc(text) + '</p>' +
        '<div style="display:flex;gap:10px"><button class="btn ghost block" data-a="no">Cancelar</button>' +
        '<button class="btn block" data-a="ok">' + esc(okLabel) + '</button></div></div></div>');
      document.body.appendChild(d);
      d.onclick = function (e) {
        var a = e.target.getAttribute && e.target.getAttribute('data-a');
        if (a || e.target === d) { d.remove(); if (a === 'ok') cb(); }
      };
    },

    // ------------------------------------------------------------- salas
    openRoom: function (id) {
      var self = this;
      var r = this.room(id);
      var def = r && this.games[r.game];
      if (!def) { toast('Juego desconocido'); this.send({ t: 'leave' }); return; }
      this.unmountChats();
      this.view = 'room';
      this.roomId = id;
      var el = $('#app');
      el.innerHTML =
        '<div class="room">' +
        '<div class="conn-banner" id="connBanner" style="display:none">Sin conexión… reconectando</div>' +
        '<div class="topbar"><button class="iconbtn" id="leaveBtn">←</button>' +
        '<h1><span class="dot conn-dot"></span><span class="title-txt">' + def.emoji + ' ' + esc(def.name) + '</span><small>' + esc(id) + '</small></h1>' +
        '<button class="iconbtn" id="callBtn" title="Invitar a los demás">📣</button>' +
        '<button class="iconbtn" id="chatBtn">💬<span class="badge chat-badge" style="display:none"></span></button></div>' +
        '<div class="stage" id="stage"></div></div>';
      $('#leaveBtn').onclick = function () {
        self.confirm('¿Salir de la sala?', 'Salir', function () { self.send({ t: 'leave' }); self.closeRoom(); });
      };
      $('#chatBtn').onclick = function () { self.openDrawer(); };
      $('#callBtn').onclick = function () { self.callAll('Te invito a jugar ' + def.name + ' ' + def.emoji); };
      this.updateConn(); this.updateBadges();
      var api = this.makeApi(id, $('#stage'));
      try { this.inst = def.create(api); } catch (e) { console.error(e); }
    },

    closeRoom: function (silent) {
      if (this.inst) { try { this.inst.alive = false; this.inst.destroy && this.inst.destroy(); } catch (e) { console.error(e); } }
      this.inst = null;
      this.roomId = null;
      this.closeDrawer();
      if (!silent) this.renderLobby();
    },

    makeApi: function (roomId, stage) {
      var self = this;
      function local(d) {
        var inst = self.inst;
        d = JSON.parse(JSON.stringify(d)); // igual que por red: copia, no referencia
        setTimeout(function () {
          if (inst && inst === self.inst && inst.onMsg) {
            try { inst.onMsg(self.me.id, d); } catch (e) { console.error(e); }
          }
        }, 0);
      }
      var api = {
        el: stage,
        roomId: roomId,
        get me() { return self.me.id; },
        room: function () { return self.room(roomId); },
        hostId: function () { var r = self.room(roomId); return r ? r.host : null; },
        isHost: function () { return api.hostId() === self.me.id; },
        name: function (id) { return self.userName(id); },
        online: function (id) { var u = self.user(id); return !!(u && u.online); },
        members: function () {
          var r = self.room(roomId);
          if (!r) return [];
          return r.members.map(function (id, i) {
            var u = self.user(id);
            return { id: id, name: u ? u.name : '¿?', online: !!(u && u.online), color: COLORS[i % COLORS.length] };
          });
        },
        toHost: function (d) {
          if (api.isHost()) local(d);
          else self.send({ t: 'g', to: api.hostId(), d: d });
        },
        toAll: function (d) { self.send({ t: 'g', d: d }); local(d); },
        to: function (id, d) { if (id === self.me.id) local(d); else self.send({ t: 'g', to: id, d: d }); },
        save: function (k, v) { sstore.set('r_' + roomId + '_' + k, v); },
        load: function (k) { return sstore.get('r_' + roomId + '_' + k, null); },
        toast: toast, vibrate: vibrate, esc: esc, h: h, colors: COLORS,
        waiting: function (opts) { self.renderWaiting(api, opts); }
      };
      return api;
    },

    /**
     * Pantalla de espera común. opts: {emoji,title,sub,min,max,options:[{key,label,choices:[[v,l]],value}],
     * onStart(values), extraHtml}
     */
    renderWaiting: function (api, opts) {
      var members = api.members();
      var host = api.isHost();
      var vals = opts.values || {};
      (opts.options || []).forEach(function (o) { if (vals[o.key] === undefined) vals[o.key] = o.value; });
      opts.values = vals;
      var html = '<div class="wait">' +
        '<div class="big-emoji">' + opts.emoji + '</div><h3>' + esc(opts.title) + '</h3>' +
        '<p class="sub">' + (opts.sub || '') + '</p><div class="plist">';
      members.forEach(function (p) {
        html += '<div class="pitem"><span class="sw" style="background:' + p.color + ';color:' + p.color + '"></span>' + esc(p.name) +
          (p.id === api.me ? ' (vos)' : '') + '<span class="tag">' + (p.id === api.hostId() ? '⭐ anfitrión' : (p.online ? '' : 'desconectado')) + '</span></div>';
      });
      html += '</div>';
      if (opts.extraHtml) html += opts.extraHtml;
      if (host) {
        if (opts.options && opts.options.length) {
          html += '<div class="opts">';
          opts.options.forEach(function (o) {
            if (o.type === 'select') {
              html += '<div class="opt"><span>' + esc(o.label) + '</span><select class="field" data-key="' + o.key + '" style="width:auto;padding:8px 12px;font-size:15px">';
              o.choices.forEach(function (c) {
                html += '<option value="' + esc(JSON.stringify(c[0])) + '"' + (vals[o.key] === c[0] ? ' selected' : '') + '>' + esc(c[1]) + '</option>';
              });
              html += '</select></div>';
              return;
            }
            html += '<div class="opt"><span>' + esc(o.label) + '</span><span class="seg" data-key="' + o.key + '">';
            o.choices.forEach(function (c) {
              html += '<button data-v="' + esc(JSON.stringify(c[0])) + '" class="' + (vals[o.key] === c[0] ? 'on' : '') + '">' + esc(c[1]) + '</button>';
            });
            html += '</span></div>';
          });
          html += '</div>';
        }
        var n = members.filter(function (p) { return p.online; }).length;
        var ok = n >= opts.min;
        html += '<button class="btn block" id="startBtn"' + (ok ? '' : ' disabled') + '>' +
          (ok ? '¡Empezar!' : 'Faltan jugadores (mín. ' + opts.min + ')') + '</button>';
        if (n > opts.max) html += '<p class="hint">Máximo ' + opts.max + ': juegan los primeros ' + opts.max + ' de la lista.</p>';
      } else {
        html += '<p class="hint">Esperando que <b>' + esc(api.name(api.hostId())) + '</b> empiece la partida…</p>';
      }
      html += '</div>';
      api.el.innerHTML = html;
      Array.prototype.forEach.call(api.el.querySelectorAll('select[data-key]'), function (s) {
        s.onchange = function () { vals[s.getAttribute('data-key')] = JSON.parse(s.value); };
      });
      api.el.onclick = function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        if (b.id === 'startBtn') { opts.onStart(vals); return; }
        var seg = b.parentNode;
        if (seg && seg.hasAttribute && seg.hasAttribute('data-key')) {
          vals[seg.getAttribute('data-key')] = JSON.parse(b.getAttribute('data-v'));
          var bs = seg.querySelectorAll('button');
          for (var i = 0; i < bs.length; i++) bs[i].className = bs[i] === b ? 'on' : '';
        }
      };
    }
  };

  window.App = App;
})();
