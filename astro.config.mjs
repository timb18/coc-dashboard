import { defineConfig } from 'astro/config';

// Set SITE and BASE via GitHub Actions Variables (Settings → Variables → Actions)
// SITE example: https://timb18.github.io
// BASE example: /coc-dashboard
export default defineConfig({
  output: 'static',
  site: process.env.SITE || 'https://timb18.github.io',
  base: process.env.BASE || '/coc-dashboard',
  compressHTML: true,
});
