/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // MapLibre finds its worker next to itself via import.meta.url; pre-bundling would move it.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  test: { environment: 'node', globals: true },
})
