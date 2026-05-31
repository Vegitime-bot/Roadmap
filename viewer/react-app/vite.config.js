import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_URL 환경변수로 서브경로 배포 지원
// 예: BASE_URL=/roadmap/ npm run build
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_URL || '/',
  server: {
    port: 5173,
    open: true,
  },
});
