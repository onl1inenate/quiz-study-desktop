import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// NOTE:
// - For the browser dev server we keep base = '/'.
// - For the desktop app we pass VITE_BASE=./ so assets resolve under file://.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
});
