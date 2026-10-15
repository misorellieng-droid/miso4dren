import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { execSync } from "node:child_process";

// Identificação do build: hash do commit + hora. Mostrada no app (rótulo
// "build xxxxxxx") para saber exatamente qual versão está rodando.
const BUILD_TIME = new Date().toISOString();
const BUILD_ID = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return BUILD_TIME.replace(/D/g, "").slice(0, 12);
  }
})();

// O dren mora no mesmo endereço do hub: miso4apps.com.br/dren/
// (a sessão de login é compartilhada e o app abre dentro da janela do PWA).
// O prefixo fica só aqui; o resto do código lê import.meta.env.BASE_URL.
export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID), __BUILD_TIME__: JSON.stringify(BUILD_TIME) },
  base: '/dren/',
  plugins: [react()],
  server: {
    port: 5174,
  },
})
