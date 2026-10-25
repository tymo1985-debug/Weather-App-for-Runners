import { cp, mkdir, rm } from 'node:fs/promises';

const output = new URL('../www/', import.meta.url);
const root = new URL('../', import.meta.url);
const entries = [
  'assets',
  'css',
  'icons',
  'js',
  'vendor',
  'index.html',
  'manifest.webmanifest',
  'sw.js',
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const entry of entries) {
  await cp(new URL(entry, root), new URL(entry, output), { recursive: true });
}
