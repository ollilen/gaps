import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'es2022',
    // maplibre-gl alone is ~900 kB minified — split it into its own vendor chunk so it's
    // cached independently of app code (app changes won't bust this chunk's hash) and raise
    // the warning threshold to match, since that size is inherent to the library, not a
    // symptom of unsplit app code.
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
