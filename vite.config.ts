import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// /api is proxied to FastAPI so the dev server needs no CORS setup (style guide §5).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { '/api': { target: env.VITE_PROXY_TARGET || 'http://localhost:8000', changeOrigin: true } },
    },
  };
});
