// content/ + src/ + assets/ 를 합쳐 dist/index.html 한 파일을 만듭니다. (Node 내장 모듈만 사용)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));

const MIME = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

const pkg = json('package.json');
const backgrounds = json('content/backgrounds.json').map((b) => {
  const file = join(root, 'assets/backgrounds', b.file);
  if (!existsSync(file)) throw new Error(`배경 파일이 없습니다: assets/backgrounds/${b.file}`);
  const mime = MIME[extname(b.file).toLowerCase()];
  if (!mime) throw new Error(`지원하지 않는 그림 형식입니다: ${b.file} (svg, png, jpg, webp 가능)`);
  const src = `data:${mime};base64,${readFileSync(file).toString('base64')}`;
  return { ...b, src };
});

const data = {
  version: pkg.version,
  speeches: json('content/speeches.json'),
  chants: json('content/chants.json'),
  backgrounds,
};

// </script> 가 데이터 안에서 태그를 닫지 않도록 < 를 이스케이프
const dataJs = JSON.stringify(data).replace(/</g, '\\u003c');
const html = read('src/index.html')
  .replace('/*STYLES*/', () => read('src/styles.css'))
  .replace('/*DATA*/', () => dataJs)
  .replace('/*SCRIPTS*/', () => read('src/render.js') + '\n' + read('src/app.js'));

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`dist/index.html 생성 완료 (${kb} KB, v${pkg.version})`);
if (kb > 1500) console.warn('⚠ 파일이 1.5MB를 넘습니다. 배경 그림 용량을 줄여 주세요.');

const unchecked = [...data.speeches, ...data.chants].filter((c) => /검수 전/.test(c.status));
if (unchecked.length) console.warn(`⚠ 검수 전 카드 ${unchecked.length}장: ${unchecked.map((c) => c.id).join(', ')} — 대외 배포 전 확인이 필요합니다.`);
