/* 카드 그리기 — 미리보기·썸네일·저장 이미지가 모두 이 함수 하나를 씁니다. */
(function () {
  var W = 1080, H = 1350;
  var ILL_H = 640;               // 일러스트 높이
  var MARGIN = 100;              // 좌우 여백
  var MAX_W = W - MARGIN * 2;    // 글자 최대 폭
  var TOP = 572, BOTTOM = 1252;  // 글자 영역
  // 근행 카드는 설명이 길어 일러스트 위쪽을 잘라 씁니다. 그림의 주요 요소는 위에서 CROP px 아래에 두세요.
  var CROP = 200;
  var MAX_CUT = 300;  // 그림을 가장 많이 자를 때 (그림 높이 340px, 카드의 약 25%)
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
    name = name.replace(/\s*(씨|님)$/, ''); // '지훈씨'라고 적어도 '지훈씨씨께'가 되지 않게
    if (!name) return [];
    var size = Math.max(40, s * 0.66);
    return textLines(ctx, name + '씨께', font(600, size, SANS), bg.accent, size * 1.4, MAX_W)
      .concat([gap(s * 0.55)]);
  }

  // 보내는 말: 줄바꿈은 글자 단위(최대 2줄). MESSAGE_MAX 글자까지는 잘림 없이 들어갑니다.
  var MESSAGE_MAX = 40;
  var BOX_PAD = 28;

  function charWrap(ctx, text, maxW) {
    var lines = [], cur = '';
    for (var i = 0; i < text.length; i++) {
      if (text[i] === '\n') { lines.push(cur); cur = ''; continue; }
      if (cur && ctx.measureText(cur + text[i]).width > maxW) { lines.push(cur); cur = text[i].trim() === '' ? '' : text[i]; }
      else cur += text[i];
    }
    lines.push(cur);
    return lines;
  }

  function messageBlock(ctx, message, bg) {
    if (!message) return [];
    var size = 36, lh = size * 1.5, label = 28;
    var f = font(500, size, SANS);
    ctx.font = f;
    var lines = charWrap(ctx, message, MAX_W - BOX_PAD * 2);
    var cut = lines.length > 2;
    lines = lines.slice(0, 2);
    return [gap(30), {
      msgBox: true, lines: lines, font: f, lh: lh, label: label, pad: BOX_PAD,
      ink: bg.ink, accent: bg.accent, cut: cut,
      h: BOX_PAD + label * 1.5 + lines.length * lh + BOX_PAD - 6
    }];
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function speechBlock(ctx, card, bg, name, message, s) {
    var out = salutation(ctx, name, s, bg);
    var qf = font(600, s, SERIF);
    var src = card.lines && card.lines.length ? card.lines : [card.quote];
    src.forEach(function (line) { out = out.concat(textLines(ctx, line, qf, bg.ink, s * 1.6, MAX_W)); });
    out.push(gap(s * 0.7));
    var small = Math.max(31, s * 0.44);
    out = out.concat(textLines(ctx, card.author, font(700, Math.max(33, s * 0.5), SANS), bg.sub, small * 1.6, MAX_W));
    out = out.concat(textLines(ctx, card.sourceLabel + '  ' + formatDate(card.sourceDate), font(500, small, SANS), bg.sub, small * 1.45, MAX_W));
    return out.concat(messageBlock(ctx, message, bg));
  }

  // 근행 카드: 독송음(크게) 아래 한자(작게) → 경문의 뜻 → 쉽게 말하면 → 출처
  function chantBlock(ctx, card, bg, name, message, s) {
    var out = salutation(ctx, name, Math.min(s, 64), bg);
    out = out.concat(textLines(ctx, '법화경 ' + card.chapter, font(700, 30, SANS), bg.accent, 30 * 1.7, MAX_W));

    var readings = card.reading.split(' · ');
    var hanja = card.hanja.split('·');
    var cols = readings.length === 1 ? 1 : 2;
    var colGap = 40;
    var colW = (MAX_W - colGap * (cols - 1)) / cols;
    var hs = Math.max(30, s * 0.42);
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

    var b = Math.max(32, Math.min(40, s * 0.5));
    // [제목, 본문, 본문 굵기, 본문 크기 가산] — 청년이 먼저 읽을 '쉽게 말하면'을 더 크고 진하게
    [['경문의 뜻', card.meaning, 400, 0], ['쉽게 말하면', card.explanation, 600, 2]].forEach(function (sec, i) {
      if (i > 0) out.push(gap(14));
      out = out.concat(textLines(ctx, sec[0], font(700, 30, SANS), bg.accent, 30 * 1.6, MAX_W));
      out = out.concat(textLines(ctx, sec[1], font(sec[2], b + sec[3], SANS), bg.ink, (b + sec[3]) * 1.55, MAX_W));
    });
    out.push(gap(20));
    // 카드에는 출처의 첫 항목만, 전체 출처는 앱의 '카드 설명 보기'에 표시
    var shortSource = card.sourceLabel.split(/ \/ | · /)[0];
    out = out.concat(textLines(ctx, '출처 · ' + shortSource, font(500, 30, SANS), bg.sub, 30 * 1.5, MAX_W));
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
    var build = isChant ? chantBlock : speechBlock;
    var maxS = isChant ? 80 : 66;
    var minS = isChant ? 40 : 38;
    // 이 크기 밑으로는 글자를 줄이기 전에 그림을 먼저 줄입니다 (카카오톡 화면 기준 약 18px).
    var readMin = isChant ? 56 : 54;

    // 1차: 그림을 단계적으로 줄여 가며(스피치 47%→40%→33%→25%, 근행 33%→29%→25%)
    //      readMin 이상 크기로 들어가는 첫 배치를 고릅니다. 짧은 글은 그림이 크게 남습니다.
    // 2차: 그래도 안 되면 그림을 가장 작게 두고 minS 까지 글자를 줄입니다.
    // (그림의 주요 요소는 위에서 MAX_CUT px 아래에 두어야 잘리지 않습니다.)
    var cuts = isChant ? [CROP, CROP + 50, MAX_CUT] : [0, 100, CROP, MAX_CUT];
    var cut, top, s, block, total, overflow = true;
    function tryFit(c, from, to) {
      for (var z = from; z >= to; z -= 2) {
        var bl = build(ctx, card, bg, name, message, z);
        var tt = measure(bl);
        if (tt <= BOTTOM - (TOP - c) && !bl.tooWide) { cut = c; top = TOP - c; s = z; block = bl; total = tt; return true; }
      }
      return false;
    }
    for (var ci = 0; ci < cuts.length && overflow; ci++) overflow = !tryFit(cuts[ci], maxS, readMin);
    if (overflow) overflow = !tryFit(MAX_CUT, readMin - 2, minS);
    if (overflow) { cut = MAX_CUT; top = TOP - cut; s = minS; block = build(ctx, card, bg, name, message, s); total = measure(block); }

    if (opts.image) {
      var sw = opts.image.naturalWidth || opts.image.width || W;
      var k = sw / W; // 그림 파일 크기가 달라도 같은 비율로 잘라 씁니다
      ctx.drawImage(opts.image, 0, cut * k, W * k, (ILL_H - cut) * k, 0, 0, W, ILL_H - cut);
    }

    var y = top + Math.max(0, (BOTTOM - top - total) * 0.4);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    block.forEach(function (l) {
      if (l.gap) { y += l.h; return; }
      if (l.msgBox) {
        ctx.save();
        roundRectPath(ctx, MARGIN, y, MAX_W, l.h, 20);
        ctx.globalAlpha = 0.17; ctx.fillStyle = l.accent; ctx.fill();
        ctx.restore();
        ctx.font = font(700, l.label, SANS); ctx.fillStyle = l.accent;
        ctx.fillText('보내는 말', MARGIN + l.pad, y + l.pad + l.label * 0.9);
        ctx.font = l.font; ctx.fillStyle = l.ink;
        l.lines.forEach(function (t, i) {
          ctx.fillText(t, MARGIN + l.pad, y + l.pad + l.label * 1.5 + i * l.lh + l.lh * 0.74);
        });
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

    var msgCut = block.some(function (l) { return l.msgBox && l.cut; });
    return { fontSize: s, overflow: overflow, messageCut: msgCut, illustrationPct: Math.round((ILL_H - cut) / H * 100) };
  }

  window.CardRender = { W: W, H: H, renderCard: renderCard, MESSAGE_MAX: MESSAGE_MAX };
})();
