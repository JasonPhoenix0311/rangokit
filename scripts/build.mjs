// Une motor, práctica, interfaz y estilos en un solo dist/index.html, sin dependencias.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
// Se normaliza a LF para que el build sea igual en Windows y en Linux.
const read = async (path) => (await readFile(new URL(path, root), 'utf8')).replace(/\r\n/g, '\n');

const stripModules = (source) => source
  .replace(/^import[\s\S]*?from\s+'[^']+';\n/gm, '')
  .replace(/^export /gm, '');

const script = (await Promise.all(['src/engine.js', 'src/practices/p01.js', 'src/ui.js'].map(read)))
  .map(stripModules)
  .join('\n');

const STYLES = await read('src/styles.css');

// La AGPL pide ofrecer el código a quien usa el programa por red. El enlace sale de package.json.
const pkg = JSON.parse(await read('package.json'));
const repo = (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? '')
  .replace(/^git\+/, '').replace(/\.git$/, '');
if (!repo) console.warn('Aviso: package.json no tiene "repository"; la página saldrá sin enlace al código fuente.');
const source = repo ? ` <a href="${repo}">Consulta el código fuente</a>.` : '';

const html = (await read('src/index.template.html'))
  .replace('/*__STYLES__*/', () => '\n' + STYLES)
  .replace('<!--__SOURCE__-->', () => source)
  .replace('/*__SCRIPT__*/', () => `\n(() => {\n${script}\n})();\n`);

await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/index.html', root), html);
console.log(`dist/index.html: ${(html.length / 1024).toFixed(1)} KB`);
