import { readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

// Endast färdigbundlade ES-moduler. Privata vars och byggmetadata är
// aldrig moduler; workerd får avvisa saknade/ej bundlade importer.
export async function builtWorkerModules(main, rootPath) {
  const root = await realpath(rootPath);
  const entry = path.resolve(main);
  const relative = path.relative(root, entry);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !/\.(?:m?js)$/u.test(entry)) {
    throw new Error('Worker-entrypoint måste vara en byggd ES-modul inom serverkatalogen.');
  }
  const files = [];
  async function visit(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (item.name.startsWith('.')) continue;
      const target = path.join(directory, item.name);
      if (item.isSymbolicLink()) throw new Error('Symlänkar tillåts inte i byggda Worker-moduler.');
      if (item.isDirectory()) await visit(target);
      else if (item.isFile() && /\.(?:m?js)$/u.test(item.name)) files.push(target);
    }
  }
  await visit(root);
  if (!files.includes(entry) || await realpath(entry) !== entry) throw new Error('Byggets Worker-entrypoint saknas eller har en oväntad sökväg.');
  files.sort();
  files.splice(files.indexOf(entry), 1);
  files.unshift(entry);
  const modules = await Promise.all(files.map(async file => ({ type: 'ESModule', path: file, contents: await readFile(file, 'utf8') })));
  return { modules, modulesRoot: root };
}
