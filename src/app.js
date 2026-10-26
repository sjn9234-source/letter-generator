/* 화면 동작: 카드 고르기 → 이름 적기 → 사진 저장 */
(function () {
  var DATA = window.APP_DATA;
  var R = window.CardRender;
  var $ = function (id) { return document.getElementById(id); };

  var cards = { speech: DATA.speeches, chant: DATA.chants };
  var bgById = {};
  var images = {};
  DATA.backgrounds.forEach(function (b) { bgById[b.id] = b; });

  var state = {
    tab: 'speech',
    selected: { speech: DATA.speeches[0].id, chant: DATA.chants[0].id },
    bgOverride: null,  // 더 꾸미기에서 고른 배경 (없으면 카드 기본값)
    lastBlob: null,
    lastUrl: null
  };

  var inKakao = /KAKAOTALK/i.test(navigator.userAgent);
  var shareMode = false;

  function currentCard() {
    var list = cards[state.tab];
    for (var i = 0; i < list.length; i++) if (list[i].id === state.selected[state.tab]) return list[i];
    return list[0];
  }
  function bgFor(card) { return bgById[state.bgOverride || card.background] || DATA.backgrounds[0]; }

  function loadImages() {
    return Promise.all(DATA.backgrounds.map(function (b) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () { images[b.id] = img; resolve(); };
        img.onerror = function () { resolve(); }; // 그림이 없어도 카드는 만들어집니다
        img.src = b.src;
      });
    }));
  }

  function draw(canvas, type, card, scale, extra) {
    var ctx = canvas.getContext('2d');
    var bg = extra && extra.bg ? extra.bg : bgById[card.background];
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    return R.renderCard(ctx, {
      type: type, card: card, bg: bg, image: images[bg.id],
      name: extra ? extra.name : '', message: extra ? extra.message : ''
    });
  }

  // ---- 1. 썸네일 ----
  function renderGrid() {
    var grid = $('grid');
    grid.innerHTML = '';
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var scale = 0.26 * dpr;
    cards[state.tab].forEach(function (card) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'thumb';
      btn.setAttribute('aria-pressed', String(card.id === state.selected[state.tab]));
      btn.dataset.id = card.id;
      var c = document.createElement('canvas');
      c.width = Math.round(R.W * scale);
      c.height = Math.round(R.H * scale);
      c.setAttribute('aria-hidden', 'true');
      draw(c, state.tab, card, scale);
      var label = document.createElement('span');
      var t = document.createElement('b');
      t.textContent = card.title;
      var hint = document.createElement('small');
      hint.textContent = state.tab === 'speech' ? card.recommendFor : card.reading;
      label.appendChild(t);
      label.appendChild(hint);
      btn.appendChild(c);
      btn.appendChild(label);
      btn.addEventListener('click', function () {
        state.selected[state.tab] = card.id;
        grid.querySelectorAll('.thumb').forEach(function (t) {
          t.setAttribute('aria-pressed', String(t.dataset.id === card.id));
        });
        update();
        // 카드를 고르면 '2 이름과 편지 적기' 제목이 화면 맨 위에 오도록
        $('nameStep').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      grid.appendChild(btn);
    });
  }

  // ---- 2·3. 큰 미리보기 ----
  var pending = false;
  function update() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () {
      pending = false;
      var card = currentCard();
      draw($('preview'), state.tab, card, 1, {
        bg: bgFor(card), name: $('name').value, message: $('message').value
      });
      $('preview').setAttribute('aria-label', card.title + ' 카드 미리보기');
      renderAbout(card);
      renderBgChoices(card);
      clearResult();
      if (shareMode) prebuild();
    });
  }

  function renderAbout(card) {
    var rows = [];
    var esc = function (s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
    if (state.tab === 'speech') {
      rows.push(['추천', card.recommendFor]);
      rows.push(['말씀', '“' + card.quote + '” — ' + card.author]);
    } else {
      rows.push(['교학 이름', card.title + ' (' + card.chapter + ')']);
      rows.push(['독송', card.reading]);
      rows.push(['교학 요지', card.meaning]);
      rows.push(['쉬운 풀이 (담당자 작성)', card.explanation]);
    }
    rows.push(['출처', card.sourceLabel + (card.sourceDate ? ' · ' + card.sourceDate : '')]);
    var html = '<dl>' + rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl>';
    if (card.sourceUrl) html += '<p><a href="' + esc(card.sourceUrl) + '" target="_blank" rel="noopener">원문 확인하기</a></p>';
    $('aboutBody').innerHTML = html;
  }

  function renderBgChoices(card) {
    var box = $('bgs');
    if (!box.childElementCount) {
      DATA.backgrounds.forEach(function (b) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.id = b.id;
        btn.innerHTML = '<img alt="" src="' + b.src + '"><span></span>';
        btn.querySelector('span').textContent = b.name;
        btn.addEventListener('click', function () {
          var c = currentCard();
          state.bgOverride = (b.id === c.background) ? null : b.id;
          update();
        });
        box.appendChild(btn);
      });
    }
    var active = bgFor(card).id;
    box.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.id === active));
    });
  }

  // ---- 저장 / 공유 ----
  function fileName() {
    var d = new Date();
    var ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    return '함께부르는행복_' + currentCard().id + '_' + ymd + '.png';
  }

  function makeBlob() {
    return new Promise(function (resolve, reject) {
      var canvas = $('preview');
      if (!canvas.toBlob) return reject(new Error('no toBlob'));
      canvas.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error('empty')); }, 'image/png');
    });
  }

  function clearResult() {
    $('status').textContent = '';
    if (state.lastUrl) { URL.revokeObjectURL(state.lastUrl); state.lastUrl = null; }
    state.lastBlob = null;
  }

  function showStatus(text, withViewer) {
    var s = $('status');
    s.textContent = text;
    if (withViewer) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = '저장이 안 되었나요? 사진 크게 보기';
      b.addEventListener('click', openViewer);
      s.appendChild(document.createElement('br'));
      s.appendChild(b);
    }
  }

  function openViewer() {
    if (!state.lastUrl) return;
    $('viewerImg').src = state.lastUrl;
    $('viewer').hidden = false;
    $('viewerClose').focus();
  }

  function prepare() {
    clearResult();
    return makeBlob().then(function (blob) {
      state.lastBlob = blob;
      state.lastUrl = URL.createObjectURL(blob);
      return blob;
    });
  }

  function onSave() {
    var btn = $('save');
    btn.disabled = true;
    prepare().then(function () {
      if (inKakao) {
        openViewer();
        showStatus('사진을 길게 눌러 저장한 뒤, 카카오톡에서 사진을 첨부해 보내 주세요.', true);
        return;
      }
      var a = document.createElement('a');
      a.href = state.lastUrl;
      a.download = fileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      showStatus('사진 파일을 준비했습니다. 휴대폰의 ‘다운로드’ 또는 갤러리에서 찾아 카카오톡으로 보내 주세요.', true);
    }).catch(function () {
      showStatus('사진을 만들지 못했어요. 화면을 새로고침한 뒤 다시 눌러 주세요.', false);
    }).then(function () { btn.disabled = false; });
  }

  // 버튼을 누른 즉시 공유 창이 열리도록, 카드가 바뀔 때마다 사진 파일을 미리 만들어 둡니다.
  var readyBlob = null, readyToken = 0;
  function prebuild() {
    var token = ++readyToken;
    readyBlob = null;
    makeBlob().then(function (b) { if (token === readyToken) readyBlob = b; }).catch(function () {});
  }

  function shareBlob(blob) {
    var file = new File([blob], fileName(), { type: 'image/png' });
    showStatus('공유 창에서 ‘카카오톡’을 골라 받는 분을 선택해 주세요.', false);
    return navigator.share({ files: [file] }).then(function () {
      showStatus('보내셨다면 완료입니다. 다른 분께 보낼 카드도 이어서 만들 수 있어요.', false);
    }).catch(function (err) {
      if (err && err.name === 'AbortError') { $('status').textContent = ''; return; }
      state.lastBlob = blob;
      state.lastUrl = state.lastUrl || URL.createObjectURL(blob);
      showStatus('공유 창을 열지 못했어요. 사진을 크게 보고 길게 눌러 저장해 주세요.', true);
    });
  }

  function onShare() {
    if (readyBlob) { shareBlob(readyBlob); return; }
    prepare().then(shareBlob).catch(function () {
      showStatus('사진을 만들지 못했어요. 화면을 새로고침한 뒤 다시 눌러 주세요.', false);
    });
  }

  function canShareFiles() {
    try {
      var f = new File([new Blob(['x'], { type: 'image/png' })], 't.png', { type: 'image/png' });
      return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [f] }));
    } catch (e) { return false; }
  }

  // ---- 시작 ----
  function init() {
    $('ver').textContent = 'v' + DATA.version;
    $('message').maxLength = R.MESSAGE_MAX;      // 한도는 render.js 한 곳에서만 정합니다
    $('limitMax').textContent = R.MESSAGE_MAX;
    $('countMax').textContent = R.MESSAGE_MAX;
    if (inKakao) {
      $('kakaoNotice').hidden = false;
      $('openExternal').href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href);
    }
    if (canShareFiles()) {
      // 공유가 되는 휴대폰: '카카오톡으로 보내기'를 크게, '사진 저장'은 작게
      shareMode = true;
      var share = $('share'), save = $('save');
      share.hidden = false;
      share.className = 'btn-main';
      share.textContent = '카카오톡으로 보내기';
      save.className = 'btn-sub btn-small';
      save.textContent = '사진 저장';
      share.parentNode.insertBefore(share, save);
    }

    document.querySelectorAll('[role="tab"]').forEach(function (t) {
      t.addEventListener('click', function () {
        state.tab = t.dataset.tab;
        state.bgOverride = null;
        document.querySelectorAll('[role="tab"]').forEach(function (o) {
          o.setAttribute('aria-selected', String(o === t));
        });
        renderGrid();
        update();
      });
    });
    $('name').addEventListener('input', update);
    $('message').addEventListener('input', function () {
      var max = R.MESSAGE_MAX, el = $('message');
      var chars = Array.from(el.value);
      if (chars.length > max) { el.value = chars.slice(0, max).join(''); chars = Array.from(el.value); }
      $('count').textContent = chars.length;
      $('counter').classList.toggle('full', chars.length >= max);
      update();
    });
    $('save').addEventListener('click', onSave);
    $('share').addEventListener('click', onShare);
    $('viewerClose').addEventListener('click', function () { $('viewer').hidden = true; });

    loadImages().then(function () { renderGrid(); update(); });
  }

  // 자동 점검(scripts/check.mjs)에서 쓰는 통로. 화면 동작에는 영향이 없습니다.
  window.LetterApp = {
    ready: function () { return loadImages(); },
    renderTo: function (canvas, type, id, name, message) {
      var card = cards[type].filter(function (c) { return c.id === id; })[0];
      canvas.width = R.W; canvas.height = R.H;
      return draw(canvas, type, card, 1, { bg: bgById[card.background], name: name, message: message });
    }
  };

  init();
})();
