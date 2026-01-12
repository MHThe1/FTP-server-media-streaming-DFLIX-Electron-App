import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'
import { copyFileSync, existsSync } from 'fs'
import { join } from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: 'electron/main.js',
      },
      preload: {
        input: 'electron/preload.js',
      },
    }),
  ],
  server: {
    host: '0.0.0.0', // Allow access from all network interfaces
    port: 3000,
    // No proxy needed - frontend makes direct API calls
  },
  build: {
    outDir: 'dist',
    // Use relative paths for extension compatibility
    base: './',
    rollupOptions: {
      input: {
        main: join(__dirname, 'index.html'),
      },
    },
  },
})
