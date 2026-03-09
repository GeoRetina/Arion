import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs'

type CopyTarget = {
  sourceDir: string
  outputDir: string
  extension: string
  label: string
}

function copyBuildAssets(targets: CopyTarget[]): void {
  targets.forEach(({ sourceDir, outputDir, extension, label }) => {
    mkdirSync(outputDir, { recursive: true })

    if (!existsSync(sourceDir)) {
      console.warn(`${label} source directory not found: ${sourceDir}`)
      return
    }

    const files = readdirSync(sourceDir).filter((file: string) => file.endsWith(extension))
    files.forEach((file: string) => {
      copyFileSync(resolve(sourceDir, file), resolve(outputDir, file))
      console.log(`Copied ${label} file: ${file} to ${outputDir}`)
    })
  })
}

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin(),
      // Copy runtime assets that the main process loads from disk.
      {
        name: 'copy-main-assets',
        writeBundle() {
          copyBuildAssets([
            {
              sourceDir: resolve('src/main/database/migrations'),
              outputDir: resolve('out/database/migrations'),
              extension: '.sql',
              label: 'migration'
            },
            {
              sourceDir: resolve('src/main/prompts'),
              outputDir: resolve('out/main/prompts'),
              extension: '.xml',
              label: 'prompt'
            }
          ])
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
