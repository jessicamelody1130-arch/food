(function () {
  'use strict';

  var KEY = 'lunchWheel_v1';
  var MAX_OPTIONS = 12, MAX_NAME = 10, MAX_HISTORY = 20;
  var RECENT_MS = 3 * 24 * 60 * 60 * 1000;
  var RECENT_FACTOR = 0.3;
  var TWO_PI = Math.PI * 2;
  var COLORS = ['#FFB347', '#FF8F7A', '#FFD66B', '#F6A9B8',
    '#9AD9A6', '#8FCBEA', '#CDB4F0', '#FFC38B'];

  var DEFAULTS = [
    { name: '便當', weight: 3 },
    { name: '拉麵', weight: 3 },
    { name: '麥當勞', weight: 2 },
    { name: '水餃', weight: 3 },
    { name: '咖哩飯', weight: 2 },
    { name: '沙拉', weight: 1 }
  ];

  function $(id) { return document.getElementById(id); }

  var canvas = $('wheel');
  var ctx = canvas.getContext('2d');
  var state = {
    options: [],
    history: [],
    soundOn: true,
    recentOn: false
  };

  var rotation = 0;
  var spinning = false;
  var audioCtx = null;
  var toastTimer = null;

  function mod(a, n) { return ((a % n) + n) % n; }

  function uid() {
    return Date.now().toString(36) +
      Math.random().toString(36).slice(2, 7);
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function fmtTime(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function makeDefaults() {
    return DEFAULTS.map(function (d) {
      return {
        id: uid(),
        name: d.name,
        weight: d.weight,
        excluded: false
      };
    });
  }

  function load() {
    var raw = null;

    try {
      raw = localStorage.getItem(KEY);
    } catch (e) {}

    if (raw) {
      try {
        var d = JSON.parse(raw);

        if (Array.isArray(d.options)) {
          state.options = d.options
            .filter(function (o) {
              return o && typeof o.name === 'string';
            })
            .slice(0, MAX_OPTIONS)
            .map(function (o) {
              return {
                id: o.id || uid(),
                name: o.name.slice(0, MAX_NAME),
                weight: Math.min(5, Math.max(1,
                  parseInt(o.weight, 10) || 3)),
                excluded: !!o.excluded
              };
            });
        }

        if (Array.isArray(d.history)) {
          state.history = d.history
            .filter(function (h) {
              return h &&
                typeof h.name === 'string' &&
                typeof h.ts === 'number';
            })
            .slice(0, MAX_HISTORY);
        }

        state.soundOn = d.soundOn !== false;
        state.recentOn = !!d.recentOn;
        return;
      } catch (e) {}
    }

    state.options = makeDefaults();
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function recentSet() {
    var s = {};

    if (!state.recentOn) return s;

    var now = Date.now();

    state.history.forEach(function (h) {
      if (now - h.ts <= RECENT_MS) s[h.name] = true;
    });

    return s;
  }

  function getLayout() {
    var rec = recentSet();

    var act = state.options.filter(function (o) {
      return !o.excluded && o.name.trim() !== '';
    });

    var w = act.map(function (o) {
      return o.weight * (rec[o.name] ? RECENT_FACTOR : 1);
    });

    var total = w.reduce(function (a, b) {
      return a + b;
    }, 0);

    var acc = 0, starts = [], spans = [];

    w.forEach(function (x) {
      var sp = total ? x / total * TWO_PI : 0;
      starts.push(acc);
      spans.push(sp);
      acc += sp;
    });

    return {
      act: act, w: w, total: total,
      starts: starts, spans: spans, rec: rec
    };
  }

  function indexAtPointer(rot, L) {
    var theta = mod(-Math.PI / 2 - rot, TWO_PI);

    for (var i = 0; i < L.act.length; i++) {
      if (theta < L.starts[i] + L.spans[i]) return i;
    }

    return L.act.length - 1;
  }

  function drawWheel() {
    var L = getLayout();
    var W = canvas.width, H = canvas.height;
    var cx = W / 2, cy = 430, R = 360;

    ctx.clearRect(0, 0, W, H);

    ctx.beginPath();
    ctx.arc(cx, cy, R + 24, 0, TWO_PI);
    ctx.fillStyle = '#F29E4C';
    ctx.fill();

    for (var k = 0; k < 24; k++) {
      var a = k / 24 * TWO_PI;
      ctx.beginPath();
      ctx.arc(
        cx + Math.cos(a) * (R + 12),
        cy + Math.sin(a) * (R + 12),
        5, 0, TWO_PI
      );
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fill();
    }

    if (L.act.length === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TWO_PI);
      ctx.fillStyle = '#FFE8C2';
      ctx.fill();

      ctx.fillStyle = '#A58468';
      ctx.font = 'bold 36px "PingFang TC","Microsoft JhengHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('請先新增選項', cx, cy - 90);
    } else {
      L.act.forEach(function (o, i) {
        var a0 = rotation + L.starts[i];
        var a1 = a0 + L.spans[i];
        var ci = i % COLORS.length;

        if (i === L.act.length - 1 &&
            L.act.length > 1 && ci === 0) ci = 2;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, a0, a1);
        ctx.closePath();
        ctx.fillStyle = COLORS[ci];
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#fff';
        ctx.stroke();

        var mid = (a0 + a1) / 2;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(mid);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#5A3825';

        var fs = Math.min(40,
          Math.max(18, L.spans[i] * R * 0.5));
        var maxW = R - 120;

        ctx.font = 'bold ' + fs +
          'px "PingFang TC","Microsoft JhengHei",sans-serif';

        while (ctx.measureText(o.name).width > maxW && fs > 14) {
          fs -= 2;
          ctx.font = 'bold ' + fs +
            'px "PingFang TC","Microsoft JhengHei",sans-serif';
        }

        ctx.fillText(o.name, R - 28, 0);
        ctx.restore();
      });
    }

    ctx.beginPath();
    ctx.arc(cx, cy, 54, 0, TWO_PI);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#F29E4C';
    ctx.stroke();

    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🍽️', cx, cy + 3);

    ctx.beginPath();
    ctx.moveTo(cx - 36, 22);
    ctx.lineTo(cx + 36, 22);
    ctx.lineTo(cx, 108);
    ctx.closePath();
    ctx.fillStyle = '#E8553D';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#fff';
    ctx.lineJoin = 'round';
    ctx.stroke();

    updateHint(L);
  }

  function updateHint(L) {
    var h = $('hint');

    if (spinning) {
      h.className = 'hint';
      h.textContent = '轉轉轉…';
      return;
    }

    if (L.act.length < 2) {
      h.className = 'hint warn';
      h.textContent = '至少需要 2 個可用選項才能開始轉喔！';
    } else {
      h.className = 'hint';
      h.textContent = '目前轉盤上有 ' + L.act.length +
        ' 個選項（點轉盤也可以開始）';
    }
  }

  function getAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }

    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    return audioCtx;
  }

  function beep(freq, dur, vol, type, delay) {
    var ac = getAudio();
    if (!ac) return;

    try {
      var t0 = ac.currentTime + (delay || 0);
      var o = ac.createOscillator();
      var g = ac.createGain();

      o.type = type || 'triangle';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

      o.connect(g);
      g.connect(ac.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch (e) {}
  }

  function tick() {
    if (state.soundOn) {
      beep(650 + Math.random() * 120, 0.06, 0.08, 'triangle');
    }
  }

  function winSound() {
    if (!state.soundOn) return;
    beep(523, 0.18, 0.12, 'sine', 0);
    beep(659, 0.18, 0.12, 'sine', 0.15);
    beep(784, 0.35, 0.12, 'sine', 0.30);
  }

  function renderSoundBtn() {
    $('soundBtn').textContent = state.soundOn
      ? '🔊 音效：開' : '🔇 音效：關';
  }

  function setLocked(v) {
    spinning = v;
    $('lockZone').disabled = v;
    $('spinBtn').disabled = v;
    $('spinBtn').textContent = v ? '轉動中…' : '開始轉！';
    $('clearBtn').disabled = v;
  }

  function spin() {
    if (spinning) return;

    var L = getLayout();

    if (L.act.length < 2) {
      toast('至少需要 2 個可用選項喔！');
      return;
    }

    getAudio();

    var r = Math.random() * L.total;
    var acc = 0, win = L.act.length - 1;

    for (var i = 0; i < L.w.length; i++) {
      acc += L.w[i];
      if (r < acc) {
        win = i;
        break;
      }
    }

    var theta = L.starts[win] +
      L.spans[win] * (0.12 + Math.random() * 0.76);
    var needed = mod(-Math.PI / 2 - theta, TWO_PI);
    var delta = mod(needed - mod(rotation, TWO_PI)) +
      TWO_PI * (5 + Math.floor(Math.random() * 3));

    var from = rotation, to = rotation + delta;
    var dur = 4800 + Math.random() * 600;
    var t0 = null;
    var lastIdx = indexAtPointer(from, L);

    setLocked(true);

    function frame(now) {
      if (t0 === null) t0 = now;

      var t = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - t, 4);

      rotation = from + (to - from) * e;
      drawWheel();

      var idx = indexAtPointer(rotation, L);
      if (idx !== lastIdx) {
        tick();
        lastIdx = idx;
      }

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        finish(L.act[win]);
      }
    }

    requestAnimationFrame(frame);
  }

  function finish(winner) {
    rotation = mod(rotation, TWO_PI);
    state.history.unshift({ name: winner.name, ts: Date.now() });
    state.history = state.history.slice(0, MAX_HISTORY);

    save();
    setLocked(false);
    renderHistory();
    renderStats();
    renderList();
    showResult(winner.name);
  }

  function showResult(name) {
    $('resultName').textContent = name;
    $('overlay').classList.add('show');
    winSound();
    confetti();
  }

  function closeResult() {
    $('overlay').classList.remove('show');
    drawWheel();
  }

  function confetti() {
    var box = $('confetti');
    var emojis = ['🍜', '🍙', '🍱', '🎉', '✨', '🥟', '🍛', '🥗'];

    for (var i = 0; i < 36; i++) {
      var s = document.createElement('span');
      s.textContent = emojis[i % emojis.length];
      s.style.left = (Math.random() * 100) + 'vw';
      s.style.fontSize = (18 + Math.random() * 18) + 'px';
      s.style.animationDuration = (2 + Math.random() * 1.8) + 's';
      s.style.animationDelay = (Math.random() * 0.6) + 's';

      box.appendChild(s);

      (function (el) {
        setTimeout(function () { el.remove(); }, 4800);
      })(s);
    }
  }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove('show');
    }, 2200);
  }

  function renderList() {
    var wrap = $('optList');
    wrap.innerHTML = '';

    var L = getLayout();
    $('optCount').textContent = state.options.length + ' / ' + MAX_OPTIONS;
    $('recentChk').checked = state.recentOn;

    if (state.options.length === 0) {
      var p = document.createElement('p');
      p.className = 'empty';
      p.textContent = '還沒有選項，從上面新增一個吧！';
      wrap.appendChild(p);
      return;
    }

    state.options.forEach(function (o) {
      var row = document.createElement('div');
      row.className = 'opt-row' + (o.excluded ? ' excluded' : '');

      var lastValid = o.name;
      var name = document.createElement('input');
      name.type = 'text';
      name.className = 'name';
      name.maxLength = MAX_NAME;
      name.value = o.name;

      name.addEventListener('input', function () {
        o.name = name.value.slice(0, MAX_NAME);
        save();
        drawWheel();
      });

      name.addEventListener('change', function () {
        var v = name.value.trim();

        if (v === '') {
          name.value = lastValid;
          o.name = lastValid;
          toast('名稱不能是空白喔！');
        } else {
          o.name = v;
          lastValid = v;
        }

        save();
        drawWheel();
      });

      var ctrl = document.createElement('div');
      ctrl.className = 'ctrl';

      var wl = document.createElement('label');
      wl.appendChild(document.createTextNode('權重 '));

      var sel = document.createElement('select');

      for (var n = 1; n <= 5; n++) {
        var op = document.createElement('option');
        op.value = n;
        op.textContent = n;
        if (n === o.weight) op.selected = true;
        sel.appendChild(op);
      }

      sel.addEventListener('change', function () {
        o.weight = parseInt(sel.value, 10);
        save();
        renderList();
        drawWheel();
      });

      wl.appendChild(sel);
      ctrl.appendChild(wl);

      var pct = document.createElement('span');
      pct.className = 'pct';
      var idx = L.act.indexOf(o);

      pct.textContent = idx >= 0
        ? Math.round(L.w[idx] / L.total * 100) + '%'
        : '—';

      ctrl.appendChild(pct);

      if (state.recentOn && L.rec[o.name] && !o.excluded) {
        var tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = '最近吃過';
        ctrl.appendChild(tag);
      }

      var sp = document.createElement('span');
      sp.className = 'spacer';
      ctrl.appendChild(sp);

      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.setAttribute('aria-pressed', o.excluded ? 'true' : 'false');
      chip.textContent = o.excluded
        ? '🙅 今天不想吃' : '今天不想吃';

      chip.addEventListener('click', function () {
        o.excluded = !o.excluded;
        save();
        renderList();
        drawWheel();
      });

      ctrl.appendChild(chip);

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'del';
      del.title = '刪除';
      del.textContent = '🗑️';

      del.addEventListener('click', function () {
        state.options = state.options.filter(function (x) {
          return x !== o;
        });
        save();
        renderList();
        drawWheel();
      });

      ctrl.appendChild(del);
      row.appendChild(name);
      row.appendChild(ctrl);
      wrap.appendChild(row);
    });
  }

  function addOption(e) {
    e.preventDefault();

    var input = $('newName');
    var v = input.value.trim();

    if (v === '') {
      toast('請先輸入名稱喔！');
      return;
    }

    if (state.options.length >= MAX_OPTIONS) {
      toast('最多只能 ' + MAX_OPTIONS + ' 個選項喔！');
      return;
    }

    if (state.options.some(function (o) {
      return o.name === v;
    })) {
      toast('已經有「' + v + '」了！');
      return;
    }

    state.options.push({
      id: uid(),
      name: v.slice(0, MAX_NAME),
      weight: 3,
      excluded: false
    });

    input.value = '';
    save();
    renderList();
    drawWheel();
    input.focus();
  }

  function renderHistory() {
    var ul = $('histList');
    ul.innerHTML = '';

    if (state.history.length === 0) {
      var li = document.createElement('li');
      li.innerHTML = '<p class="empty" style="width:100%">還沒有紀錄，快轉一次看看！</p>';
      ul.appendChild(li);
      return;
    }

    state.history.forEach(function (h) {
      var li = document.createElement('li');
      var a = document.createElement('span');
      a.textContent = '🍴 ' + h.name;

      var b = document.createElement('span');
      b.className = 'time';
      b.textContent = fmtTime(h.ts);

      li.appendChild(a);
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  function renderStats() {
    var box = $('stats');
    box.innerHTML = '';

    if (state.history.length === 0) {
      var p = document.createElement('p');
      p.className = 'empty';
      p.textContent = '轉過之後，這裡會出現統計圖';
      box.appendChild(p);
      return;
    }

    var counts = {};

    state.history.forEach(function (h) {
      counts[h.name] = (counts[h.name] || 0) + 1;
    });

    var arr = Object.keys(counts).map(function (k) {
      return { name: k, n: counts[k] };
    });

    arr.sort(function (a, b) { return b.n - a.n; });

    var max = arr[0].n;

    arr.forEach(function (it, i) {
      var row = document.createElement('div');
      row.className = 'bar-row';

      var lb = document.createElement('span');
      lb.className = 'label';
      lb.textContent = it.name;

      var track = document.createElement('div');
      track.className = 'bar-track';

      var fill = document.createElement('div');
      fill.className = 'bar-fill';
      fill.style.width = (it.n / max * 100) + '%';
      fill.style.background = COLORS[i % COLORS.length];

      track.appendChild(fill);

      var cnt = document.createElement('span');
      cnt.className = 'cnt';
      cnt.textContent = it.n;

      row.appendChild(lb);
      row.appendChild(track);
      row.appendChild(cnt);
      box.appendChild(row);
    });
  }

  function bind() {
    $('spinBtn').addEventListener('click', spin);
    canvas.addEventListener('click', spin);
    $('addForm').addEventListener('submit', addOption);

    $('recentChk').addEventListener('change', function (e) {
      state.recentOn = e.target.checked;
      save();
      renderList();
      drawWheel();
    });

    $('soundBtn').addEventListener('click', function () {
      state.soundOn = !state.soundOn;
      save();
      renderSoundBtn();
      if (state.soundOn) tick();
    });

    $('resetBtn').addEventListener('click', function () {
      if (confirm('要恢復成預設的 6 個範例選項嗎？（目前的選項會被取代，歷史紀錄不受影響）')) {
        state.options = makeDefaults();
        save();
        renderList();
        drawWheel();
      }
    });

    $('clearBtn').addEventListener('click', function () {
      if (state.history.length === 0) {
        toast('目前沒有紀錄可以清除');
        return;
      }

      if (confirm('確定要清除全部歷史紀錄嗎？')) {
        state.history = [];
        save();
        renderHistory();
        renderStats();
        renderList();
        drawWheel();
      }
    });

    $('okBtn').addEventListener('click', closeResult);

    $('againBtn').addEventListener('click', function () {
      closeResult();
      spin();
    });

    $('overlay').addEventListener('click', function (e) {
      if (e.target === this) closeResult();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' &&
          $('overlay').classList.contains('show')) {
        closeResult();
      }
    });
  }

  load();
  bind();
  renderSoundBtn();
  renderList();
  renderHistory();
  renderStats();
  drawWheel();
})();
