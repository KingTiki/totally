// Preserve upstream notices for dependencies whose code may be bundled into the
// production build, including build-time dependencies such as Svelte/SvelteKit.
import { copyFile, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const output = 'build/licenses';
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const inventory = [];
for (const [path, pkg] of Object.entries(lock.packages)) {
  if (!path) continue;
  let files;
  try {
    files = await readdir(path);
  } catch (error) {
    // Optional platform-specific packages need not be installed on this host.
    if (error.code === 'ENOENT' && pkg.optional) continue;
    throw error;
  }
  const notices = files.filter((name) =>
    /^(licen[cs]e|copying|notice|copyright)([._-]|$)/i.test(name)
  );
  const target = join(output, path);
  await mkdir(target, { recursive: true });
  for (const name of notices) await cp(join(path, name), join(target, name), { recursive: true });
  // Preserve package-level attribution and license references as well.
  await copyFile(join(path, 'package.json'), join(target, 'package.json'));
  inventory.push({ path, version: pkg.version, license: pkg.license, notices });
}
await writeFile(join(output, 'index.json'), JSON.stringify(inventory, null, 2) + '\n');
console.log(
  `Collected license metadata and notices for ${inventory.length} dependencies in ${output}.`
);
