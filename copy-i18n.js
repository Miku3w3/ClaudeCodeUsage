// Copy i18n JSON files from src/ to out/ after TypeScript compilation
const fs = require('fs');
const path = require('path');

const root = __dirname;
const srcDir = path.join(root, 'src', 'i18n');
const outDir = path.join(root, 'out', 'i18n');

fs.mkdirSync(outDir, { recursive: true });

const langs = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'es', 'ar', 'pt', 'de', 'fr', 'ru'];
for (const lang of langs) {
  const src = path.join(srcDir, lang + '.json');
  const dst = path.join(outDir, lang + '.json');
  fs.copyFileSync(src, dst);
  console.log('  Copied: ' + lang + '.json');
}
