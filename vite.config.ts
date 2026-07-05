import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    base: '/portfolio/', // keep this for GitHub pages
    server: {
      port: 5173,
            allowedHosts: [
        '1bef-2401-4900-8fc6-b580-c5b1-5b03-ff31-abb2.ngrok-free.app',
      ],
      proxy: {
        '/api': {
          target: env.VITE_API_URL, // reads from .env files
          changeOrigin: true,
        },
      },
    },
  };
});
