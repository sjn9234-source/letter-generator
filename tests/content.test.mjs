// 카드 데이터 점검: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const load = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const speeches = load('content/speeches.json');
const chants = load('content/chants.json');
const backgrounds = load('content/backgrounds.json');
const bgIds = new Set(backgrounds.map((b) => b.id));

// 사용자 제공 근행요전 독송음 (spec.md 부록 5-1 대조표). 바꾸면 안 됩니다.
const READINGS = {
  G01: '쇼호짓소',
  G02: '뇨제소 · 뇨제쇼 · 뇨제타이',
  G03: '뇨제리키 · 뇨제사',
  G04: '뇨제인 · 뇨제엔 · 뇨제카 · 뇨제호',
  G05: '뇨제혼맛쿠쿄토',
  G06: '지가토쿠붓라이 · 쇼쿄쇼콧슈',
  G07: '이도슈조코 · 호벤겐네한',
  G08: '가조도후키 · 니슈켄쇼진',
  G09: '쇼우슈쿠도쿠 · 뉴와시치지키샤',
  G10: '마이지사제넨 · 이가료슈조 · 도쿠뉴무조도 · 소쿠조주붓신',
};
const HANJA = {
  G01: '諸法實相', G02: '如是相·如是性·如是體', G03: '如是力·如是作', G04: '如是因·如是緣·如是果·如是報',
  G05: '如是本末究竟等', G06: '自我得佛來·所經諸劫數', G07: '爲度衆生故·方便現涅槃', G08: '我淨土不毁·而衆見燒盡',
  G09: '諸有修功德·柔和質直者', G10: '每自作是念·以何令衆生·得入無上道·速成就佛身',
};

const filled = (v) => typeof v === 'string' && v.trim().length > 0;
const uniqueIds = (list) => new Set(list.map((c) => c.id)).size === list.length;

test('스피치: S01부터 차례로, 필수 항목이 모두 있음', () => {
  assert.ok(speeches.length >= 1);
  assert.ok(uniqueIds(speeches), 'ID가 중복되었습니다');
  speeches.forEach((c, i) => {
    assert.equal(c.id, `S${String(i + 1).padStart(2, '0')}`);
    for (const k of ['title', 'quote', 'author', 'sourceLabel', 'sourceUrl', 'background', 'status']) {
      assert.ok(filled(c[k]), `${c.id}: ${k} 비어 있음`);
    }
  });
});

test('스피치: 줄바꿈(lines)을 이어 붙이면 원문과 정확히 같음', () => {
  for (const c of speeches) {
    if (!c.lines) continue;
    assert.equal(c.lines.join(' '), c.quote, `${c.id}: lines 가 원문과 다릅니다. 띄어쓰기 자리에서만 나눠 주세요.`);
  }
});

test('근행: G01부터 차례로, 필수 항목이 모두 있음', () => {
  assert.ok(uniqueIds(chants), 'ID가 중복되었습니다');
  chants.forEach((c, i) => {
    assert.equal(c.id, `G${String(i + 1).padStart(2, '0')}`);
    for (const k of ['chapter', 'title', 'hanja', 'reading', 'meaning', 'explanation', 'sourceLabel', 'background', 'status']) {
      assert.ok(filled(c[k]), `${c.id}: ${k} 비어 있음`);
    }
  });
});

test('근행: 경문 구절 수와 독송음 구절 수가 같음', () => {
  for (const c of chants) {
    assert.equal(c.hanja.split('·').length, c.reading.split(' · ').length, `${c.id}: 한자와 독송음 구절 수가 다릅니다`);
  }
});

test('근행: 사용자 제공 독송음·한자 그대로 (로마자 없음)', () => {
  for (const c of chants) {
    if (READINGS[c.id]) assert.equal(c.reading, READINGS[c.id], `${c.id}: 독송음이 바뀌었습니다`);
    if (HANJA[c.id]) assert.equal(c.hanja, HANJA[c.id], `${c.id}: 한자가 바뀌었습니다`);
    assert.doesNotMatch(c.reading, /[A-Za-z]/, `${c.id}: 로마자가 들어 있습니다`);
  }
});

test('근행: 방편품 5장, 수량품 자아게 5장', () => {
  assert.equal(chants.filter((c) => c.chapter === '방편품').length, 5);
  assert.equal(chants.filter((c) => c.chapter === '수량품 자아게').length, 5);
});

test('근행: 쉬운 풀이는 인용부호 없이 (선생님 말씀으로 오해 방지)', () => {
  for (const c of chants) assert.doesNotMatch(c.explanation, /^["“]/, `${c.id}: 풀이가 따옴표로 시작합니다`);
});

test('배경: 카드가 가리키는 그림이 모두 존재', () => {
  for (const b of backgrounds) {
    assert.ok(existsSync(new URL(`../assets/backgrounds/${b.file}`, import.meta.url)), `${b.id}: ${b.file} 파일 없음`);
    for (const k of ['paper', 'ink', 'sub', 'accent']) assert.match(b[k], /^#[0-9A-Fa-f]{6}$/, `${b.id}: ${k} 색상 형식`);
  }
  for (const c of [...speeches, ...chants]) assert.ok(bgIds.has(c.background), `${c.id}: 없는 배경 ${c.background}`);
});
