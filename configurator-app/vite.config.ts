import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  server: {
    port: 3002,
    // Listen on the LAN too so phones on the same wifi can open the dev
    // configurator directly (http://<mac-ip>:3002/...).
    host: true,
    allowedHosts: ['.trycloudflare.com'],
  },
  plugins: [tailwindcss(), tsconfigPaths(), react()],
  build: { chunkSizeWarningLimit: 1000 },
  css: { devSourcemap: true },
});
