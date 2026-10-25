import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

// Emits sw.js with the exact list of built files, so the whole app works offline after the first visit.
function serviceWorker(): Plugin {
  return {
    name: 'zan-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const certs = readdirSync('public/certs').map((f) => 'certs/' + f);
      const icons = ['favicon.ico', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
      const precache = ['./', 'manifest.webmanifest', ...certs, ...icons, ...built.filter((f) => f !== 'index.html')];
      const hash = createHash('sha256');
      hash.update(precache.join('\n'));
      for (const f of certs) hash.update(readFileSync('public/' + f));
      const version = 'zan-' + hash.digest('hex').slice(0, 12);
      const source = readFileSync('src/sw.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [preact(), serviceWorker()],
  build: { target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 900 },
  server: { port: 5173 },
});
