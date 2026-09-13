import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => (id.includes('node_modules/maplibre-gl') ? 'maplibre-gl' : undefined),
      },
    },
  },
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
