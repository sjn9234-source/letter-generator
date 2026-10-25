/* 카드 그리기 — 미리보기·썸네일·저장 이미지가 모두 이 함수 하나를 씁니다. */
(function () {
  var W = 1080, H = 1350;
  var ILL_H = 640;               // 일러스트 높이
  var MARGIN = 100;              // 좌우 여백
  var MAX_W = W - MARGIN * 2;    // 글자 최대 폭
  var TOP = 572, BOTTOM = 1252;  // 글자 영역
  // 근행 카드는 설명이 길어 일러스트 위쪽을 잘라 씁니다. 그림의 주요 요소는 위에서 CROP px 아래에 두세요.
  var CROP = 200;
  var SERIF = '"Noto Serif KR","Noto Serif CJK KR","Nanum Myeongjo","AppleMyungjo",serif';
  var SANS = '"Pretendard","Noto Sans KR","Noto Sans CJK KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
  var SITE_NAME = '함께 부르는 행복';

  function font(weight, size, family) { return weight + ' ' + Math.round(size) + 'px ' + family; }

  // 한국어는 띄어쓰기 단위로 줄바꿈하고, 한 단어가 너무 길 때만 글자 단위로 나눕니다.
  function wrap(ctx, text, maxW) {
    var words = String(text).split(' ');
    var lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width <= maxW) { cur = test; continue; }
      if (cur) lines.push(cur);
      if (ctx.measureText(w).width <= maxW) { cur = w; continue; }
      cur = '';
      for (var j = 0; j < w.length; j++) {
        if (ctx.measureText(cur + w[j]).width > maxW && cur) { lines.push(cur); cur = ''; }
        cur += w[j];
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function formatDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return p[0] + '.\u00A0' + Number(p[1]) + '.\u00A0' + Number(p[2]) + '.'; // 날짜는 줄바꿈되지 않게
  }

  // 블록 = 줄 목록. 각 줄은 {text, font, color, h(줄 높이), x?, extra?}
  function textLines(ctx, text, f, color, lh, maxW) {
    ctx.font = f;
    return wrap(ctx, text, maxW).map(function (t) { return { text: t, font: f, color: color, h: lh }; });
  }

  function gap(h) { return { gap: true, h: h }; }

  function salutation(ctx, name, s, bg) {
    if (!name) return [];
    var size = Math.max(40, s * 0.66);
    return textLines(ctx, name + '님께', font(600, size, SANS), bg.accent, size * 1.4, MAX_W)
      .concat([gap(s * 0.55)]);
  }

  function messageBlock(ctx, message, bg) {
    if (!message) return [];
    var size = 36;
    var out = [gap(34), { rule: true, color: bg.accent, h: 24 }];
    return out.concat(textLines(ctx, message, font(400, size, SANS), bg.ink, size * 1.5, MAX_W).slice(0, 2));
  }

  function speechBlock(ctx, card, bg, name, message, s) {
    var out = salutation(ctx, name, s, bg);
    var qf = font(500, s, SERIF);
    var src = card.lines && card.lines.length ? card.lines : [card.quote];
    src.forEach(function (line) { out = out.concat(textLines(ctx, line, qf, bg.ink, s * 1.55, MAX_W)); });
    out.push(gap(s * 0.7));
    var small = Math.max(28, s * 0.42);
    out = out.concat(textLines(ctx, card.author, font(600, Math.max(30, s * 0.46), SANS), bg.sub, small * 1.6, MAX_W));
    out = out.concat(textLines(ctx, card.sourceLabel + '  ' + formatDate(card.sourceDate), font(400, small, SANS), bg.sub, small * 1.45, MAX_W));
    return out.concat(messageBlock(ctx, message, bg));
  }

  // 근행 카드: 독송음(크게) 아래 한자(작게) → 경문의 뜻 → 쉽게 말하면 → 출처
  function chantBlock(ctx, card, bg, name, message, s) {
    var out = salutation(ctx, name, Math.min(s, 64), bg);
    out = out.concat(textLines(ctx, '법화경 ' + card.chapter, font(600, 28, SANS), bg.accent, 28 * 1.7, MAX_W));

    var readings = card.reading.split(' · ');
    var hanja = card.hanja.split('·');
    var cols = readings.length === 1 ? 1 : 2;
    var colGap = 40;
    var colW = (MAX_W - colGap * (cols - 1)) / cols;
    var hs = Math.max(28, s * 0.42);
    var rf = font(700, s, SERIF), hf = font(500, hs, SERIF);
    ctx.font = rf;
    var tooWide = readings.some(function (t) { return ctx.measureText(t).width > colW; });
    var rows = Math.ceil(readings.length / cols);
    var readH = s * 1.22, hanjaH = hs * 1.5, rowGap = s * 0.3;
    out.push({
      cells: true, cols: cols, colW: colW, colGap: colGap, rf: rf, hf: hf,
      readH: readH, hanjaH: hanjaH, rowGap: rowGap, ink: bg.ink, accent: bg.accent,
      items: readings.map(function (r, i) { return { reading: r, hanja: hanja[i] || '' }; }),
      h: rows * (readH + hanjaH) + (rows - 1) * rowGap
    });
    out.push(gap(s * 0.45));

    var b = Math.max(30, Math.min(38, s * 0.5));
    [['경문의 뜻', card.meaning], ['쉽게 말하면', card.explanation]].forEach(function (sec) {
      out = out.concat(textLines(ctx, sec[0], font(700, 26, SANS), bg.accent, 26 * 1.6, MAX_W));
      out = out.concat(textLines(ctx, sec[1], font(400, b, SANS), bg.ink, b * 1.55, MAX_W));
      out.push(gap(18));
    });
    // 카드에는 출처의 첫 항목만, 전체 출처는 앱의 '카드 설명 보기'에 표시
    var shortSource = card.sourceLabel.split(/ \/ | · /)[0];
    out = out.concat(textLines(ctx, '출처 · ' + shortSource, font(400, 26, SANS), bg.sub, 26 * 1.5, MAX_W));
    out = out.concat(messageBlock(ctx, message, bg));
    out.tooWide = tooWide;
    return out;
  }

  function measure(block) { return block.reduce(function (sum, l) { return sum + l.h; }, 0); }

  var grainCanvas = null;
  function grain() {
    if (grainCanvas) return grainCanvas;
    var c = document.createElement('canvas');
    c.width = c.height = 180;
    var g = c.getContext('2d');
    var seed = 42;
    for (var i = 0; i < 2600; i++) {
      seed = (seed * 16807) % 2147483647;
      var x = seed % 180;
      seed = (seed * 16807) % 2147483647;
      var y = seed % 180;
      g.fillStyle = (i % 2) ? 'rgba(80,60,40,0.5)' : 'rgba(255,255,255,0.6)';
      g.fillRect(x, y, 1.4, 1.4);
    }
    grainCanvas = c;
    return c;
  }

  /**
   * opts: { type: 'speech'|'chant', card, bg, image, name, message }
   * ctx 는 1080×1350 좌표계로 맞춰 둔 상태여야 합니다 (썸네일은 미리 scale).
   * 반환값: { fontSize, overflow }
   */
  function renderCard(ctx, opts) {
    var bg = opts.bg, card = opts.card;
    var name = (opts.name || '').trim();
    var message = (opts.message || '').trim();

    ctx.save();
    ctx.fillStyle = bg.paper;
    ctx.fillRect(0, 0, W, H);
    var isChant = opts.type === 'chant';
    var cut = isChant ? CROP : 0;
    if (opts.image) {
      var sw = opts.image.naturalWidth || opts.image.width || W;
      var k = sw / W; // 그림 파일 크기가 달라도 같은 비율로 잘라 씁니다
      ctx.drawImage(opts.image, 0, cut * k, W * k, (ILL_H - cut) * k, 0, 0, W, ILL_H - cut);
    }
    var top = TOP - cut;

    // 글자 크기 자동 맞춤: 큰 글씨부터 줄여 가며 영역 안에 들어가는 첫 크기를 씁니다.
    var build = isChant ? chantBlock : speechBlock;
    var maxS = isChant ? 80 : 66;
    var minS = isChant ? 40 : 38;
    var s = maxS, block, total, overflow = false;
    for (; s >= minS; s -= 2) {
      block = build(ctx, card, bg, name, message, s);
      total = measure(block);
      if (total <= BOTTOM - top && !block.tooWide) break;
    }
    if (s < minS) { s = minS; block = build(ctx, card, bg, name, message, s); total = measure(block); overflow = true; }

    var y = top + Math.max(0, (BOTTOM - top - total) * 0.4);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    block.forEach(function (l) {
      if (l.gap) { y += l.h; return; }
      if (l.rule) {
        ctx.fillStyle = l.color;
        ctx.fillRect(MARGIN, y + 6, 44, 3);
        y += l.h;
        return;
      }
      if (l.cells) {
        l.items.forEach(function (it, i) {
          var x = MARGIN + (i % l.cols) * (l.colW + l.colGap);
          var cy = y + Math.floor(i / l.cols) * (l.readH + l.hanjaH + l.rowGap);
          ctx.font = l.rf; ctx.fillStyle = l.ink;
          ctx.fillText(it.reading, x, cy + l.readH * 0.8);
          ctx.font = l.hf; ctx.fillStyle = l.accent;
          ctx.fillText(it.hanja, x, cy + l.readH + l.hanjaH * 0.7);
        });
        y += l.h;
        return;
      }
      ctx.font = l.font; ctx.fillStyle = l.color;
      ctx.fillText(l.text, MARGIN, y + l.h * 0.74);
      y += l.h;
    });

    ctx.font = font(500, 26, SANS);
    ctx.fillStyle = bg.sub;
    ctx.fillText(SITE_NAME, MARGIN, H - 54);

    // 종이 질감
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = ctx.createPattern(grain(), 'repeat');
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    return { fontSize: s, overflow: overflow };
  }

  window.CardRender = { W: W, H: H, renderCard: renderCard };
})();
