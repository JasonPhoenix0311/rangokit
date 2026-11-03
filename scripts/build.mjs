// Une motor, práctica, interfaz y estilos en un solo dist/index.html, sin dependencias.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const stripModules = (source) => source
  .replace(/^import[\s\S]*?from\s+'[^']+';\n/gm, '')
  .replace(/^export /gm, '');

const script = (await Promise.all(['src/engine.js', 'src/practices/p01.js', 'src/ui.js'].map(read)))
  .map(stripModules)
  .join('\n');

const STYLES = await read('src/styles.css');

const html = (await read('src/index.template.html'))
  .replace('/*__STYLES__*/', () => '\n' + STYLES)
  .replace('/*__SCRIPT__*/', () => `\n(() => {\n${script}\n})();\n`);

await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/index.html', root), html);
console.log(`dist/index.html: ${(html.length / 1024).toFixed(1)} KB`);
