import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs'

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin(),
      // Custom plugin to copy migration files
      {
        name: 'copy-migrations',
        writeBundle() {
          const srcDir = resolve('src/main/database/migrations')
          const outDir = resolve('out/database/migrations')

          // Create output directory
          mkdirSync(outDir, { recursive: true })

          // Copy all .sql files if source directory exists
          if (existsSync(srcDir)) {
            const files = readdirSync(srcDir).filter((file: string) => file.endsWith('.sql'))
            files.forEach((file: string) => {
              copyFileSync(resolve(srcDir, file), resolve(outDir, file))
              console.log(`Copied migration file: ${file} to ${outDir}`)
            })
          } else {
            console.warn(`Migration source directory not found: ${srcDir}`)
          }
        }
      }
    ]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
