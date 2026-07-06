import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  server: {
    port: 3002,
    allowedHosts: ['.trycloudflare.com'],
  },
  plugins: [tailwindcss(), tsconfigPaths(), react()],
  build: { chunkSizeWarningLimit: 1000 },
  css: { devSourcemap: true },
});
