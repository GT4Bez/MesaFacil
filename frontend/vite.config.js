import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: ['mesafacil.shop'],
    // Necessário para o hot reload funcionar com volume montado no Docker
    watch: { usePolling: true },
  },
});
