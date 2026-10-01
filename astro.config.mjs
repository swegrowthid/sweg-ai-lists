// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';

// Browser calls from `astro dev` go to same-origin `/api/*` and this proxy
// forwards them to the real API, so no CORS preflight happens on localhost
// (the API allowlists only the production origin). Builds keep the absolute
// API base - the deployed origin is already allowlisted.
const apiBase = (
  loadEnv('development', process.cwd(), '').PUBLIC_SWEG_API_BASE || 'https://api.ai-sweg.my.id'
).replace(/\/+$/, '');

// https://astro.build/config
export default defineConfig({
  vite: {
    server: {
      proxy: {
        '/api': {
          target: apiBase,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '') || '/',
        },
      },
    },
  },
});
