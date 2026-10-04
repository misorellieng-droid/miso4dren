import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// O dren mora no mesmo endereço do hub: miso4apps.com.br/dren/
// (a sessão de login é compartilhada e o app abre dentro da janela do PWA).
// O prefixo fica só aqui; o resto do código lê import.meta.env.BASE_URL.
export default defineConfig({
  base: '/dren/',
  plugins: [react()],
  server: {
    port: 5174,
  },
})
