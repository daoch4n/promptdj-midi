import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { defineConfig as defineVitestConfig } from 'vitest/config';

// https://vitejs.dev/config/
const baseConfig = ({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './', // Set base path for GitHub Pages deployment
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
};

const vitestConfig = defineVitestConfig({
  test: {
    environment: 'jsdom',
    globals: true, // Optional: to use Vitest globals like describe, it, expect
  },
});

export default defineConfig(({ mode }) => {
  const base = baseConfig({ mode });
  return {
    ...base,
    // @ts-ignore
    test: vitestConfig.test,
  };
});
