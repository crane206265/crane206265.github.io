import { spawnSync } from 'node:child_process';
import { copyFile, cp, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

// Build only the Sheets frontend. Keep original materials and credentials out
// of the files served by GitHub Pages. No Git or network operations run here.
const root = process.cwd();
const build = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/build-sheets.ts'], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);
const types = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], { stdio: 'inherit' });
if (types.status !== 0) process.exit(types.status ?? 1);
const vite = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--mode', 'sheets'], {
  stdio: 'inherit', env: { ...process.env, VITE_BASE_PATH: '/PLLingo/' }
});
if (vite.status !== 0) process.exit(vite.status ?? 1);

const dist = path.join(root, 'dist');
const html = await readFile(path.join(dist, 'index.html'), 'utf8');
if (!html.includes('/PLLingo/assets/') || html.includes('.tsx')) throw new Error('Unexpected Pages entry point');
const entries = await readdir(dist);
if (entries.some(name => !['index.html', 'assets', 'hosted-catalog.json'].includes(name))) {
  throw new Error('Unexpected build output; review files before publishing');
}
// Copy only this explicit allowlist; never walk the source/materials folders.
// Do not delete old assets: an already-open browser may still reference them.
await mkdir(path.join(root, 'assets'), { recursive: true });
await cp(path.join(dist, 'assets'), path.join(root, 'assets'), { recursive: true });
await copyFile(path.join(dist, 'hosted-catalog.json'), path.join(root, 'hosted-catalog.json'));
await copyFile(path.join(dist, 'index.html'), path.join(root, 'index.html'));
const size = (await stat(path.join(root, 'hosted-catalog.json'))).size;
console.log(`Prepared /PLLingo/index.html, assets/, hosted-catalog.json (${size} bytes).`);
console.log('Ready for GitHub Pages at https://crane206265.github.io/PLLingo/');
console.log('No commit, push, deployment, or AI request was made.');
