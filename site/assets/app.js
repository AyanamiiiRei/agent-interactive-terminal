/**
 * Demo playback engine.
 *
 * The page ships a recorded replay, not a live shell: every beat is a scripted
 * tool call plus the screen it left behind. The interactive gates (password,
 * typing, hand-back, read-only, seal) are real state transitions inside the
 * replay, which is what makes the shared-lease story legible.
 */
(function () {
  'use strict';

  var data = window.AIT;
  var scenarios = data.scenarios;
  var replAnswers = data.replAnswers;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var state = {
    si: 0,
    bi: -1,
    playing: false,
    speed: 1,
    lang: (document.documentElement.lang || 'zh').indexOf('en') === 0 ? 'en' : 'zh',
    access: 'collaborate',
    lease: 'agent',
    phase: 'idle',
    pending: 0,
    screen: [],
    typed: '',
    gate: null,
    timer: null,
  };

  var el = {};
  ['chat', 'term', 'termLines', 'pill', 'pillText', 'pendingChip', 'gate', 'gateText', 'gateSkip',
    'btnPlay', 'icoPlay', 'icoPause', 'btnStep', 'btnRestart', 'speedBtn', 'caption', 'beatNum',
    'progress', 'scenarios', 'lockBtn', 'sealBtn', 'takeoverBtn', 'handbackBtn', 'light', 'langBtn']
    .forEach(function (id) { el[id] = document.getElementById(id); });

  /* ------------------------------------------------------------------ *
   * text helpers
   * ------------------------------------------------------------------ */

  function pick(obj) {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    return obj[state.lang] != null ? obj[state.lang] : obj.zh;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** Turn `{g}text{/}` into spans. Input must already be HTML-escaped. */
  function markup(s) {
    var out = '';
    var re = /\{(\/?)([a-z]*)\}/g;
    var last = 0;
    var cls = '';
    var m;
    while ((m = re.exec(s)) !== null) {
      if (m.index > last) {
        var chunk = s.slice(last, m.index);
        out += cls ? '<span class="' + cls + '">' + chunk + '</span>' : chunk;
      }
      cls = m[1] === '/' ? '' : m[2];
      last = re.lastIndex;
    }
    if (last < s.length) {
      var tail = s.slice(last);
      out += cls ? '<span class="' + cls + '">' + tail + '</span>' : tail;
    }
    return out;
  }

  function joinLines(lines) { return (lines || []).join('\n'); }

  /* ------------------------------------------------------------------ *
   * rendering
   * ------------------------------------------------------------------ */

  function renderScenarios() {
    el.scenarios.innerHTML = scenarios.map(function (s, i) {
      return '<button class="scen' + (i === state.si ? ' on' : '') + '" type="button" data-si="' + i +
        '" role="tab" aria-selected="' + (i === state.si) + '">' + esc(pick(s.label)) + '</button>';
    }).join('');
  }

  function badgeFor(outcome) {
    if (outcome === 'matched' || outcome === 'settled') return 'ok';
    if (outcome === 'timeout' || outcome === 'quiet') return 'warn';
    if (outcome === 'exited') return 'info';
    return 'warn';
  }

  function cardHtml(beat) {
    if (!beat.tool && beat.who !== 'system') return '';
    if (beat.who === 'system') {
      return '<div class="msg"><div class="note you">' + markup(pick(beat.note)) + '</div></div>';
    }
    var text = beat.tool || '';
    var args = beat.args || {};
    var keys = Object.keys(args);
    var argHtml = keys.map(function (k) {
      var v = args[k];
      var val = typeof v === 'string' ? '"' + v + '"' : JSON.stringify(v);
      return '<span class="k">' + esc(k) + '</span><span class="paren">:</span> <span class="v">' + esc(val) + '</span>';
    }).join('<span class="paren">, </span>');

    var body = joinLines(beat.result).replace(/\\n/g, '\n');
    var badges = [];
    var m = /\[wait: ([a-z_]+)\]/.exec(body);
    if (m) badges.push('<span class="badge ' + badgeFor(m[1]) + '">' + m[1] + '</span>');
    var p = /\[phase: ([a-z_]+)\]/.exec(body);
    if (p) badges.push('<span class="badge info">' + p[1] + '</span>');
    var q = /\[queued: ([^\]]+)\]/.exec(body);
    if (q) badges.push('<span class="badge warn">queued</span>');
    var c = /\[closed: ([^\]]+)\]/.exec(body);
    if (c) badges.push('<span class="badge ok">closed</span>');
    var s = /\[session: ([^\]]+)\]/.exec(body);
    if (s) badges.push('<span class="badge info">' + s[1] + '</span>');
    if (beat.error) badges.push('<span class="badge bad">error</span>');

    return '<div class="msg">' +
      '<div class="call"><span class="tname">' + esc(text) + '</span><span class="paren">(</span>' + argHtml + '<span class="paren">)</span></div>' +
      '<pre class="res' + (beat.error ? ' err' : '') + '">' + markup(esc(body)) + '</pre>' +
      (badges.length ? '<div class="badges">' + badges.join('') + '</div>' : '') +
      '</div>';
  }

  function renderChat() {
    var beats = scenarios[state.si].beats;
    var html = '';
    for (var i = 0; i <= state.bi && i < beats.length; i++) html += cardHtml(beats[i]);
    el.chat.innerHTML = html;
    el.chat.scrollTop = el.chat.scrollHeight;
  }

  function renderTerm() {
    var html = state.screen.map(function (line, i) {
      var content = markup(esc(line));
      if (i === state.screen.length - 1) {
        if (state.gate && state.gate.kind === 'input' && state.typed) {
          content += '<span class="echo">' + esc(state.typed) + '</span>';
        }
        content += '<span class="cur"></span>';
      }
      return '<div class="ln">' + content + '</div>';
    }).join('');
    el.termLines.innerHTML = html || '<div class="ln"><span class="cur"></span></div>';
    el.term.scrollTop = el.term.scrollHeight;
  }

  function pillState() {
    if (state.access === 'sealed') return ['pill sealed', { zh: '已封禁', en: 'Sealed' }];
    if (state.access === 'observe') return ['pill observe', { zh: '只读', en: 'Read-only' }];
    if (state.phase === 'exited') return ['pill exited', { zh: '会话已关闭', en: 'Closed' }];
    if (state.lease === 'human') return ['pill human', { zh: '你在输入', en: 'You have the keyboard' }];
    return ['pill', { zh: 'Agent 可操作', en: 'Agent can act' }];
  }

  function renderChrome() {
    var p = pillState();
    el.pill.className = p[0];
    el.pillText.textContent = pick(p[1]);
    el.light.classList.toggle('run', !!state.running);
    el.pendingChip.hidden = !state.pending;
    el.pendingChip.textContent = state.pending
      ? (state.lang === 'zh' ? '待执行 ' + state.pending + ' ×' : 'queued ' + state.pending + ' ×')
      : '';
    el.handbackBtn.hidden = state.lease !== 'human';
    var panel = el.term.closest('.panel');
    if (panel) panel.classList.toggle('sealed', state.access === 'sealed');
    el.lockBtn.classList.toggle('on', state.access === 'observe');
    el.sealBtn.classList.toggle('on', state.access === 'sealed');
    el.sealBtn.classList.toggle('danger', state.access === 'sealed');
  }

  function renderCaption(beat) {
    el.caption.innerHTML = beat && beat.cap ? markup(esc(pick(beat.cap))) : '';
  }

  function renderProgress() {
    var beats = scenarios[state.si].beats;
    var total = beats.length;
    var done = Math.max(0, state.bi + 1);
    el.beatNum.textContent = done + ' / ' + total;
    el.progress.querySelector('i').style.width = Math.round((done / total) * 100) + '%';
    el.btnPlay.querySelector('#icoPlay').hidden = state.playing;
    el.btnPlay.querySelector('#icoPause').hidden = !state.playing;
  }

  /* ------------------------------------------------------------------ *
   * playback
   * ------------------------------------------------------------------ */

  function stopTimer() {
    if (state.timer) { clearTimeout(state.timer); state.timer = null; }
  }

  /** A command typed at the prompt rewrites the prompt line instead of adding one. */
  function mergePrompt(list) {
    if (!list.length || !state.screen.length) return list;
    var plain = state.screen[state.screen.length - 1].replace(/\{[^}]*\}/g, '');
    if (plain.length && list[0].indexOf(plain) === 0) {
      state.screen[state.screen.length - 1] = list[0];
      return list.slice(1);
    }
    return list;
  }

  function reveal(lines, done) {
    var list = mergePrompt(lines.slice());
    if (reduce) {
      list.forEach(function (l) { state.screen.push(l); });
      renderTerm();
      done();
      return;
    }
    var i = 0;
    (function next() {
      if (i >= list.length) { done(); return; }
      state.screen.push(list[i++]);
      renderTerm();
      state.timer = setTimeout(next, 130 / state.speed);
    })();
  }

  function applyChrome(chrome) {
    if (!chrome) return;
    if (chrome.access) state.access = chrome.access;
    if (chrome.lease) state.lease = chrome.lease;
    if (chrome.phase) state.phase = chrome.phase;
    state.pending = chrome.pending || 0;
    state.running = !!chrome.running;
  }

  function afterScreen(beat) {
    if (beat.gate) { openGate(beat.gate); return; }
    schedule(beat.hold || 1500);
  }

  function schedule(delay) {
    stopTimer();
    if (!state.playing) return;
    state.timer = setTimeout(step, Math.max(220, delay / state.speed));
  }

  function step() {
    stopTimer();
    var beats = scenarios[state.si].beats;
    if (state.bi >= beats.length - 1) { finish(); return; }
    state.bi += 1;
    var beat = beats[state.bi];
    state.typed = '';
    applyChrome(beat.chrome);
    renderChat();
    renderChrome();
    renderCaption(beat);
    renderProgress();
    if (beat.append) {
      reveal(beat.append, function () { afterScreen(beat); });
    } else {
      if (beat.screen) state.screen = beat.screen.slice();
      renderTerm();
      afterScreen(beat);
    }
  }

  function finish() {
    state.playing = false;
    stopTimer();
    renderProgress();
    el.caption.innerHTML = '<b>' + (state.lang === 'zh' ? '回放结束。' : 'End of the replay.') + '</b> ' +
      (state.lang === 'zh' ? '想试真的？在本地 npm run demo。' : 'Want the real thing? Run npm run demo locally.');
  }

  function restart(play) {
    stopTimer();
    closeGate();
    state.bi = -1;
    state.screen = [];
    state.typed = '';
    state.access = 'collaborate';
    state.lease = 'agent';
    state.phase = 'idle';
    state.pending = 0;
    state.running = false;
    el.chat.innerHTML = '';
    renderTerm();
    renderChrome();
    renderProgress();
    renderCaption(null);
    state.playing = play !== false;
    renderProgress();
    if (state.playing) schedule(300);
  }

  function select(i) {
    if (i === state.si) { restart(true); return; }
    state.si = i;
    renderScenarios();
    restart(true);
  }

  /* ------------------------------------------------------------------ *
   * gates
   * ------------------------------------------------------------------ */

  function pulse(node, on) {
    if (node) node.classList.toggle('pulse', on);
  }

  function openGate(spec) {
    state.gate = spec;
    el.gate.hidden = false;
    el.gateText.textContent = pick(spec);
    el.gate.classList.toggle('typing', spec.kind === 'input' || spec.kind === 'password');
    pulse(el.lockBtn, spec.kind === 'access' && spec.value === 'observe');
    pulse(el.sealBtn, spec.kind === 'access' && spec.value === 'sealed');
    pulse(el.handbackBtn, spec.kind === 'handback');
    pulse(el.takeoverBtn, spec.kind === 'takeover');
    el.term.classList.remove('typing');
    if (spec.kind === 'password' || spec.kind === 'input') {
      el.term.classList.add('typing');
      focusProxy();
    }
    renderTerm();
  }

  function closeGate() {
    state.gate = null;
    el.gate.hidden = true;
    pulse(el.lockBtn, false);
    pulse(el.sealBtn, false);
    pulse(el.handbackBtn, false);
    pulse(el.takeoverBtn, false);
    el.term.classList.remove('typing');
    state.typed = '';
  }

  function resolveGate() {
    if (!state.gate) return;
    closeGate();
    step();
  }

  function submitTyped() {
    var spec = state.gate;
    if (!spec) return;
    var text = state.typed;
    if (spec.kind === 'password') {
      state.lease = 'agent';
      closeGate();
      renderChrome();
      step();
      return;
    }
    if (spec.kind === 'input') {
      var lines = state.screen.slice();
      var last = lines.length - 1;
      lines[last] = lines[last] + text;
      var answer = replAnswers[text.trim()];
      lines.push(answer != null ? answer : '{d}[回放] 这一行不会被真正执行，但它在同一个 PTY 里{/}');
      lines.push('>>> ');
      state.screen = lines;
      state.lease = 'human';
      closeGate();
      renderTerm();
      renderChrome();
      step();
    }
  }

  /* ------------------------------------------------------------------ *
   * typed input proxy
   * ------------------------------------------------------------------ */

  var proxy;

  function ensureProxy() {
    if (proxy) return proxy;
    proxy = document.createElement('input');
    proxy.type = 'text';
    proxy.autocomplete = 'off';
    proxy.spellcheck = false;
    proxy.setAttribute('aria-label', 'terminal input');
    proxy.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;border:0;padding:0;background:transparent;color:transparent;';
    el.term.appendChild(proxy);
    proxy.addEventListener('input', function () {
      if (!state.gate) { proxy.value = ''; return; }
      state.typed = proxy.value;
      if (state.gate.kind === 'password') {
        el.gateText.textContent = pick(state.gate) + '（已输入 ' + state.typed.length + ' 个字符，不回显）';
      }
      renderTerm();
    });
    proxy.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitTyped(); }
    });
    return proxy;
  }

  function focusProxy() {
    var p = ensureProxy();
    p.value = '';
    p.type = state.gate && state.gate.kind === 'password' ? 'password' : 'text';
    setTimeout(function () { p.focus({ preventScroll: true }); }, 30);
  }

  /* ------------------------------------------------------------------ *
   * wiring
   * ------------------------------------------------------------------ */

  function applyLang() {
    document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
    el.langBtn.textContent = state.lang === 'zh' ? 'EN' : '中';
    document.querySelectorAll('[data-zh]').forEach(function (node) {
      var v = node.getAttribute('data-' + state.lang);
      if (v != null) node.textContent = v;
    });
    document.querySelectorAll('[data-tip-zh]').forEach(function (node) {
      node.title = node.getAttribute('data-tip-' + state.lang) || '';
    });
    renderScenarios();
    renderChat();
    renderChrome();
    if (state.gate) el.gateText.textContent = pick(state.gate);
    var beats = scenarios[state.si].beats;
    renderCaption(state.bi >= 0 ? beats[state.bi] : null);
  }

  function bind() {
    el.scenarios.addEventListener('click', function (e) {
      var b = e.target.closest('.scen');
      if (b) select(Number(b.dataset.si));
    });

    el.btnPlay.addEventListener('click', function () {
      state.playing = !state.playing;
      if (state.playing) {
        if (state.gate) { resolveGate(); return; }
        if (state.bi >= scenarios[state.si].beats.length - 1) restart(true);
        else schedule(500);
      } else stopTimer();
      renderProgress();
    });

    el.btnStep.addEventListener('click', function () {
      state.playing = false;
      renderProgress();
      if (state.gate) { resolveGate(); return; }
      step();
    });

    el.btnRestart.addEventListener('click', function () { restart(true); });

    el.speedBtn.addEventListener('click', function () {
      state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 4 : 1;
      el.speedBtn.textContent = state.speed + '×';
    });

    el.langBtn.addEventListener('click', function () {
      state.lang = state.lang === 'zh' ? 'en' : 'zh';
      applyLang();
    });

    el.gateSkip.addEventListener('click', function () {
      var spec = state.gate;
      if (!spec) return;
      if (spec.kind === 'password') { state.lease = 'agent'; closeGate(); renderChrome(); step(); return; }
      if (spec.kind === 'input') { state.typed = ''; closeGate(); step(); return; }
      if (spec.kind === 'access') { state.access = spec.value; renderChrome(); resolveGate(); return; }
      if (spec.kind === 'handback') { state.lease = 'agent'; state.pending = 0; renderChrome(); resolveGate(); return; }
      resolveGate();
    });

    function setAccess(value) {
      state.access = value;
      renderChrome();
      if (state.gate && state.gate.kind === 'access' && state.gate.value === value) resolveGate();
    }

    el.lockBtn.addEventListener('click', function () {
      setAccess(state.access === 'observe' ? 'collaborate' : 'observe');
    });
    el.sealBtn.addEventListener('click', function () {
      setAccess(state.access === 'sealed' ? 'collaborate' : 'sealed');
    });
    el.takeoverBtn.addEventListener('click', function () {
      state.lease = 'human';
      renderChrome();
      el.term.focus({ preventScroll: true });
    });
    el.handbackBtn.addEventListener('click', function () {
      state.lease = 'agent';
      state.pending = 0;
      renderChrome();
      if (state.gate && state.gate.kind === 'handback') resolveGate();
    });

    el.term.addEventListener('click', function () {
      if (!state.gate) return;
      if (state.gate.kind === 'password' || state.gate.kind === 'input') focusProxy();
    });

    document.addEventListener('keydown', function (e) {
      if (!state.gate) return;
      if (state.gate.kind !== 'password' && state.gate.kind !== 'input') return;
      if (document.activeElement === proxy) return;
      if (e.key === 'Enter') { e.preventDefault(); submitTyped(); }
    });
  }

  /* ------------------------------------------------------------------ *
   * boot
   * ------------------------------------------------------------------ */

  function boot() {
    bind();
    renderScenarios();
    applyLang();
    state.playing = false;
    renderProgress();
    el.caption.textContent = state.lang === 'zh'
      ? '滚动到这块面板就开始回放。'
      : 'Scroll to this panel and the replay starts.';

    var started = false;
    var stage = document.getElementById('demo');
    function start() {
      if (started || state.bi >= 0) return;
      started = true;
      state.playing = true;
      renderProgress();
      schedule(400);
    }
    if ('IntersectionObserver' in window && stage) {
      var io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting && entries[i].intersectionRatio >= 0.2) { io.disconnect(); start(); return; }
        }
      }, { threshold: [0.2] });
      io.observe(stage);
    } else start();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
