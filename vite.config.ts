import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import dts from 'vite-plugin-dts'
import autoImport from 'unplugin-auto-import/vite'

import { fileURLToPath, URL } from 'node:url'

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    autoImport({
      imports: ['vue'],
      dts: true,
      vueTemplate: true,
      viteOptimizeDeps: true,
    }),
    dts({
      insertTypesEntry: true,
      tsconfigPath: './tsconfig.app.json',
    }),
  ],
  resolve: {
    alias: {
      '@': resolve('./src'),
    },
  },
  build: {
    manifest: true,
    lib: {
      formats: ['es'],
      entry: {
        index: resolve('./src/index.ts'),
        api: resolve('./src/api/index.ts'),
        components: resolve('./src/components/index.ts'),
        services: resolve('./src/services/index.ts'),
        utils: resolve('./src/utils/index.ts'),
        tooling: resolve('./src/tooling/index.ts'),
      },
    },
    rolldownOptions: {
      external: ['vue', 'vue-toast-notification'],
      output: {
        chunkFileNames: 'assets/chunk-[hash].js',
        assetFileNames: 'assets/asset-[hash][extname]',
      },
    },
    minify: true,
    sourcemap: true,
    emptyOutDir: true,
    copyPublicDir: false,
  },
})
