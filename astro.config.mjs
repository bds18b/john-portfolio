// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// Where the site is published. scripts/deploy.mjs sets SITE_URL for each
// deploy; the fallback is the preview address until retentionfirst.co is live.
const site = process.env.SITE_URL ?? 'https://retentionfirst.bradenseidl.com';

export default defineConfig({
  site,

  vite: {
    plugins: [tailwindcss()]
  }
});