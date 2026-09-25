// Lets Node import the app's JSON data files (node --import ./scripts/json-loader.mjs ...).
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
export async function load(url, ctx, next) {
  if (url.endsWith('.json')) return { format: 'json', source: (await import('node:fs')).readFileSync(new URL(url)), shortCircuit: true };
  return next(url, ctx);
}`));
globalThis.location = { search: '' };
