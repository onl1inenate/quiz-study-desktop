import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// NOTE:
// - For the browser dev server we keep base = '/'.
// - For the desktop app we pass VITE_BASE=./ so assets resolve under file://.
//   If the variable is not provided (e.g. someone runs a plain `npm run build`),
//   default to a relative path in production so packaged Electron builds don't
//   load assets from the wrong absolute location and render a blank screen.
const isProd = process.env.NODE_ENV === 'production';
const base = process.env.VITE_BASE || (isProd ? './' : '/');

export default defineConfig({
  base,
  plugins: [react()],
});
