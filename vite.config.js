import { defineConfig, splitVendorChunkPlugin } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), splitVendorChunkPlugin()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/pdf-lib')) return 'pdf';
          if (id.includes('node_modules/@supabase')) return 'supabase';
          if (id.includes('react-router-dom') || id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react';
          }
        }
      }
    }
  }
});
