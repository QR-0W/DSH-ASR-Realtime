import { execFileSync } from 'node:child_process';
import { readFile, mkdir, lstat, realpath, symlink, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = dirname(dirname(fileURLToPath(import.meta.url)));
const root = process.env.DSH_RUNTIME_DIR ?? join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), '@deepseek-ai/dsh');
const runtime = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(project, 'package.json'), 'utf8'));
if (!manifest.engines.dsh.split('||').map(value => value.trim()).includes(runtime.version)) throw new Error('Unsupported DSH runtime for development links.');
for (const name of Object.keys(manifest.peerDependencies).filter(name => name.startsWith('@deepseek-ai/'))) {
  if (!/^@deepseek-ai\/[a-z0-9-]+$/.test(name)) throw new Error('Invalid SDK package name.');
  const target = join(root, 'node_modules', name);
  const metadata = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
  const expected = name.startsWith('@deepseek-ai/dsh-') ? runtime.version : manifest.peerDependencies[name].replace(/^[~^]/, '');
  if (metadata.version !== expected) throw new Error(`Host API version mismatch: ${name}.`);
  const destination = join(project, 'node_modules', name);
  let existing;
  try { existing = await lstat(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing && !existing.isSymbolicLink()) throw new Error(`An ordinary dependency directory blocks the runtime link: ${name}.`);
  if (!existing || await realpath(destination) !== await realpath(target)) {
    if (existing) {
      if (destination !== join(project, 'node_modules', name)) throw new Error('Unexpected SDK link destination.');
      await unlink(destination);
    }
    await mkdir(dirname(destination), { recursive: true });
    await symlink(target, destination, process.platform === 'win32' ? 'junction' : 'dir');
  }
  console.log(`Linked ${name}@${metadata.version}`);
}
