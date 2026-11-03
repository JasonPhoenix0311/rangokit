// Une motor, práctica, interfaz y estilos en un solo dist/index.html, sin dependencias.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
// Se normaliza a LF para que el build sea igual en Windows y en Linux.
const read = async (path) => (await readFile(new URL(path, root), 'utf8')).replace(/\r\n/g, '\n');

// Módulos en orden de dependencia. Cada uno queda en su propio ámbito, como un módulo ES real,
// para que dos archivos puedan usar los mismos nombres internos.
const MODULES = [
  'src/engine.js',
  'src/practices/p01.js',
  'src/ui.js',
  'src/editor/catalog.js',
  'src/editor/calc.js',
  'src/editor/learn.js',
  'src/editor/project.js',
  'src/editor/arduino.js',
  'src/editor/rango.js',
  'src/editor/web.js',
  'src/editor/sim.js',
  'src/editor/dialog.js',
  'src/editor/ui.js',
];

const resolve = (from, spec) => new URL(spec, `file:///${from}`).pathname.slice(1);

function wrap(path, source) {
  const exported = [];
  const body = source
    .replace(/^import\s*\{([^}]*)\}\s*from\s*'([^']+)';\n/gm, (_, names, spec) => {
      const target = resolve(path, spec);
      if (MODULES.indexOf(target) === -1 || MODULES.indexOf(target) > MODULES.indexOf(path)) {
        throw new Error(`${path} importa ${target}, que no está antes en MODULES.`);
      }
      return `const {${names.replace(/\s+/g, ' ')}} = modules['${target}'];\n`;
    })
    .replace(/^export\s+(async\s+function|function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm, (_, keyword, name) => {
      exported.push(name);
      return `${keyword} ${name}`;
    });
  if (/^(import|export)\b/m.test(body)) throw new Error(`${path} usa una forma de import o export que el build no entiende.`);
  return `modules['${path}'] = (() => {\n${body}\nreturn { ${exported.join(', ')} };\n})();`;
}

const sources = await Promise.all(MODULES.map(read));
const script = ['const modules = {};', ...MODULES.map((path, i) => wrap(path, sources[i]))].join('\n');

const STYLES = (await Promise.all(['src/styles.css', 'src/editor.css'].map(read))).join('\n');

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
