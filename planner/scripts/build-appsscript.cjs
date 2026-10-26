const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'apps-script-dist');
fs.mkdirSync(out, { recursive: true });
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace('<script src="config.js" defer></script>', '');
html = html.replace('<head>', '<head>\n  <base target="_top">');
html = html.replace('<link rel="stylesheet" href="../main_style.css">', () => '<style>\n' + fs.readFileSync(path.join(root, '../main_style.css'), 'utf8') + '\n</style>');
// HtmlService runs on a Google URL; keep the shared homepage navigation usable there.
html = html.replace(/href="\.\.\/(.*?)"/g, (_, suffix) => `href="https://crane206265.github.io/${suffix}"`);
html = html.replace('<link rel="stylesheet" href="planner.css">', () => '<style>\n' + fs.readFileSync(path.join(root, 'planner.css'), 'utf8') + '\n</style>');
for (const name of ['core.js', 'app.js']) {
  const source = fs.readFileSync(path.join(root, name), 'utf8').replace(/<\/script/gi, '<\\/script');
  // Keep deferred execution in the head without document.write or external assets.
  html = html.replace(`<script src="${name}" defer></script>`, '');
  html = html.replace('</body>', () => `<script>\n${source}\n</script>\n</body>`);
}
fs.writeFileSync(path.join(out, 'Index.html'), html);
for (const name of ['Code.gs', 'appsscript.json']) fs.copyFileSync(path.join(root, 'google-apps-script', name), path.join(out, name));
console.log('Prepared planner/apps-script-dist/{Index.html, Code.gs, appsscript.json}. No personal records or credentials are bundled.');
