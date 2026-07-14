import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import cssInjectedByJs from 'vite-plugin-css-injected-by-js'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  // ── Dev server ───────────────────────────────────────────────────────────
  if (mode === 'development') {
    return {
      plugins: [react(), tailwindcss()],
    }
  }

  // ── npm package build  (npm run build:lib) ───────────────────────────────
  if (mode === 'lib') {
    return {
      plugins: [
        react(),
        tailwindcss(),
        // Inject processed CSS as a <style> tag — consumers just import the JS
        cssInjectedByJs(),
      ],
      // Don't copy public/ into the lib output
      publicDir: false,
      build: {
        outDir: 'dist/lib',
        // Inline assets ≤ 100 KB as base64 data URLs (covers the avatar PNG)
        assetsInlineLimit: 1024 * 100,
        lib: {
          entry: resolve(__dirname, 'src/index.ts'),
          name: 'PluraChat',
          formats: ['es', 'cjs'],
          fileName: (fmt) => `plura-chat.${fmt === 'es' ? 'mjs' : 'cjs'}`,
        },
        rollupOptions: {
          // React is a peer dependency — don't bundle it
          external: ['react', 'react-dom', 'react/jsx-runtime'],
          output: {
            globals: {
              react: 'React',
              'react-dom': 'ReactDOM',
              'react/jsx-runtime': 'ReactJSXRuntime',
            },
          },
        },
      },
    }
  }

  // ── Embed bundle  (npm run build:embed) ──────────────────────────────────
  // Self-contained IIFE — bundles React + CSS + avatar. Drop one <script> tag.
  return {
    plugins: [
      react(),
      tailwindcss(),
      cssInjectedByJs(),
    ],
    build: {
      outDir: 'dist/embed',
      assetsInlineLimit: 1024 * 100,
      lib: {
        entry: resolve(__dirname, 'embed/loader.ts'),
        name: 'PluraEmbed',
        formats: ['iife'],
        fileName: () => 'embed.js',
      },
    },
  }
})
