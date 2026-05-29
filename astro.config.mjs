// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://bds18b.github.io',
  base: '/john-portfolio',

  vite: {
    plugins: [tailwindcss()]
  }
});