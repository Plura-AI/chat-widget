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
        // Inject processed CSS into document.head when the React package is imported
        cssInjectedByJs(),
      ],
      publicDir: false,
      build: {
        outDir: 'dist/lib',
        assetsInlineLimit: 1024 * 100,
        lib: {
          // Two entry points: the React export + the Web Component export
          entry: {
            index: resolve(__dirname, 'src/index.ts'),
            element: resolve(__dirname, 'src/element.ts'),
          },
          name: 'PluraChat',
          formats: ['es', 'cjs'],
          fileName: (fmt, name) => `${name}.${fmt === 'es' ? 'mjs' : 'cjs'}`,
        },
        rollupOptions: {
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
  // Self-contained IIFE — bundles React + CSS + avatar. Mounted in a Shadow
  // Root so no styles ever leak into the host page.
  return {
    plugins: [
      react(),
      tailwindcss(),
      // No cssInjectedByJs here: the loader injects CSS into the shadow root itself
    ],
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
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
