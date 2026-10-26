// 실제 브라우저(Chromium)로 dist/index.html 을 열어 모든 카드를 그려 보고,
// 글자가 넘치는 카드가 없는지 확인한 뒤 한눈에 보는 시트(preview/sheet-*.png)를 만듭니다.
// 필요: playwright (npm i -D playwright 또는 전역 설치)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('playwright 가 없어 화면 점검을 건너뜁니다. (npm i -D playwright)');
  process.exit(0);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(pathToFileURL(join(root, 'dist/index.html')).href);
await page.waitForFunction(() => document.querySelectorAll('.thumb').length > 0);

// 가장 좁은 휴대폰(320px)에서도 사용 순서 안내가 한 줄인지
for (const width of [320, 360]) {
  await page.setViewportSize({ width, height: 800 });
  const rows = await page.evaluate(() => new Set([...document.querySelectorAll('.steps li')].map((li) => Math.round(li.getBoundingClientRect().top))).size);
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth || [...document.querySelectorAll('.steps li')].some((li) => li.getBoundingClientRect().right > window.innerWidth));
  if (rows !== 1 || over) { console.error(`✗ ${width}px 화면: 사용 순서가 ${rows}줄이거나 가로로 넘칩니다`); process.exitCode = 1; }
}
await page.setViewportSize({ width: 400, height: 860 });

// 카드를 누르면 '2 이름과 편지 적기' 제목이 화면 위쪽에 보이는지
await page.click('.thumb:nth-child(4)');
await page.waitForTimeout(900);
const stepTop = await page.evaluate(() => document.getElementById('nameStep').getBoundingClientRect().top);
if (stepTop < 0 || stepTop > 60) { console.error(`✗ 카드를 눌렀을 때 2단계 제목 위치가 ${Math.round(stepTop)}px 입니다`); process.exitCode = 1; }
await page.screenshot({ path: join(root, 'preview/screen-after-pick.png') });
await page.evaluate(() => window.scrollTo(0, 0));

// 공유가 되는 휴대폰 흉내: '카카오톡으로 보내기'가 주 버튼이고, 누르면 PNG 파일 1개로 공유 창을 여는지
{
  const sp = await browser.newPage({ viewport: { width: 360, height: 760 }, deviceScaleFactor: 2 });
  await sp.addInitScript(() => {
    window.__shared = [];
    navigator.canShare = (d) => !!(d && d.files);
    navigator.share = (d) => { window.__shared.push(d.files.map((f) => [f.name, f.type, f.size])); return Promise.resolve(); };
  });
  await sp.goto(pathToFileURL(join(root, 'dist/index.html')).href);
  await sp.waitForFunction(() => document.querySelectorAll('.thumb').length > 0);
  await sp.waitForTimeout(400);
  const btns = await sp.evaluate(() => [...document.querySelectorAll('.actions button')].filter((b) => !b.hidden).map((b) => [b.textContent, b.className]));
  await sp.click('#share');
  await sp.waitForTimeout(400);
  const shared = await sp.evaluate(() => window.__shared);
  const okBtns = btns[0] && btns[0][0] === '카카오톡으로 보내기' && /btn-main/.test(btns[0][1]) && btns[1] && btns[1][0] === '사진 저장';
  const okShare = shared.length === 1 && shared[0].length === 1 && shared[0][0][1] === 'image/png' && shared[0][0][2] > 0;
  if (!okBtns || !okShare) { console.error('✗ 공유 모드 이상', JSON.stringify({ btns, shared })); process.exitCode = 1; }
  else console.log('✓ 공유 모드: 주 버튼 \'카카오톡으로 보내기\', PNG 1개 공유 확인');
  await sp.screenshot({ path: join(root, 'preview/screen-share-mode.png') });
  await sp.close();
}

// 휴대폰 첫 화면 캡처
mkdirSync(join(root, 'preview'), { recursive: true });
await page.screenshot({ path: join(root, 'preview/screen-phone.png'), fullPage: true });

const result = await page.evaluate(async () => {
  await window.LetterApp.ready();
  const D = window.APP_DATA;
  const cases = [];
  for (const [type, list] of [['speech', D.speeches], ['chant', D.chants]]) {
    for (const c of list) {
      cases.push({ type, id: c.id, name: '', message: '' });
      cases.push({ type, id: c.id, name: '김지훈', message: '다음 주에 같이 근행해요. 늘 응원할게요!' });
      const worst = '뷁'.repeat(window.CardRender.MESSAGE_MAX); // 가장 넓은 글자로 한도까지 채운 경우
      cases.push({ type, id: c.id, name: '김지훈김지훈김', message: worst, worst: true });
    }
  }
  const out = [];
  for (const k of cases) {
    const cv = document.createElement('canvas');
    const r = window.LetterApp.renderTo(cv, k.type, k.id, k.name, k.message);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    out.push({ ...k, ...r, png: !!blob, w: cv.width, h: cv.height, url: k.name && !k.worst ? cv.toDataURL('image/jpeg', 0.8) : null });
  }
  return out;
});

const problems = result.filter((r) => r.overflow || r.messageCut || !r.png || r.w !== 1080 || r.h !== 1350);
for (const r of result) {
  if (!r.name || r.worst) continue;
  console.log(`${r.id}  글자크기 ${r.fontSize}px  ${r.overflow ? '⚠ 넘침' : 'OK'}  PNG ${r.png ? 'OK' : '실패'}`);
}

// 이름+메시지 넣은 카드 시트 (스피치 / 근행 각각)
for (const type of ['speech', 'chant']) {
  const urls = result.filter((r) => r.type === type && r.url).map((r) => r.url);
  const html = `<body style="margin:0;background:#ddd;display:grid;grid-template-columns:repeat(5,432px);gap:8px;padding:8px">${urls.map((u) => `<img src="${u}" style="width:432px">`).join('')}</body>`;
  const p = await browser.newPage({ viewport: { width: 2208, height: 1100 } });
  await p.setContent(html);
  await p.waitForTimeout(300);
  await p.screenshot({ path: join(root, `preview/sheet-${type}.png`), fullPage: true });
  await p.close();
}
await browser.close();

writeFileSync(join(root, 'preview/report.json'), JSON.stringify(result.map(({ url, ...r }) => r), null, 2));
if (errors.length) console.error('페이지 오류:', errors);
if (problems.length || errors.length) {
  console.error(`✗ 문제 ${problems.length}건`, problems.map((p) => `${p.id}${p.name ? '(이름 있음)' : ''}`));
  process.exit(1);
}
console.log(`✓ 카드 ${result.length}개 조합 모두 1080×1350 PNG 생성, 글자 넘침 없음`);
