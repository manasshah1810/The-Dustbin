// Reports first-load transfer (gzip) and fails if it exceeds the budget.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
const BUDGET = 5 * 1024 * 1024;
const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map((m) => m[1]);
// the 3D chunk + font are fetched right after first paint: count everything in /assets
const all = readdirSync(join(dist, 'assets')).map((f) => 'assets/' + f);
const size = (f) => { const b = readFileSync(join(dist, f)); return { raw: b.length, gz: /\.(woff2|png|jpg|webp|mp3|ogg)$/.test(f) ? b.length : gzipSync(b).length }; };
let total = size('index.html').gz, rows = [['index.html', size('index.html')]];
for (const f of all) { const s = size(f); total += s.gz; rows.push([f, s]); }
for (const [n, s] of rows) console.log(`${(s.gz / 1024).toFixed(1).padStart(8)} KB gz  ${(s.raw / 1024).toFixed(1).padStart(8)} KB raw  ${n}`);
console.log(`\nTotal transfer before first voice note: ${(total / 1024).toFixed(0)} KB (budget ${BUDGET / 1024 / 1024} MB)`);
if (total > BUDGET) { console.error('OVER BUDGET'); process.exit(1); }
void refs;
