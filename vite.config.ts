import { defineConfig } from 'vite';

// Relative base so the build works at github.io/knights-and-dragons/ and anywhere else.
export default defineConfig({
  base: './',
  define: {
    __BUILD__: JSON.stringify(process.env.GITHUB_RUN_NUMBER ?? 'dev'),
  },
});
