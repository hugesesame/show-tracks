import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { version } from './package.json';

export default defineConfig({
  base: './',
  // The version lives in package.json only; the footer shows it.
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [viteSingleFile()],
  worker: {
    format: 'es',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
