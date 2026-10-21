// Empacota as rotas /api com esbuild e roda o teste de ponta a ponta (Bitrix24 e Receita simulados).
// Uso: npm run test:rotas
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const out = path.join(root, '.test-routes');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

function findRoutes(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return findRoutes(p);
    return d.name === 'route.js' ? [p] : [];
  });
}

for (const file of findRoutes(path.join(root, 'app', 'api'))) {
  const rel = path.relative(path.join(root, 'app', 'api'), path.dirname(file)).split(path.sep).join('_').replace(/[[\]]/g, '_');
  await build({
    entryPoints: [file],
    bundle: true,
    platform: 'node',
    format: 'esm',
    alias: { '@': root },
    external: ['node:*'],
    logLevel: 'error',
    outfile: path.join(out, `${rel}.mjs`),
  });
}

const r = spawnSync(process.execPath, [path.join(root, 'tests', 'e2e-routes.mjs'), out], { stdio: 'inherit' });
fs.rmSync(out, { recursive: true, force: true });
process.exit(r.status ?? 1);
