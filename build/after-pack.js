/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
'use strict'

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

function resolveExecutablePath(context) {
  const executableName =
    context.packager.platformSpecificBuildOptions.executableName ||
    context.packager.appInfo.productFilename

  return path.join(context.appOutDir, `${executableName}.exe`)
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return
  }

  const executablePath = resolveExecutablePath(context)
  if (!fs.existsSync(executablePath)) {
    throw new Error(`Windows executable not found for metadata patching: ${executablePath}`)
  }

  const rceditPath = path.join(
    context.packager.projectDir,
    'node_modules',
    'electron-winstaller',
    'vendor',
    'rcedit.exe'
  )
  if (!fs.existsSync(rceditPath)) {
    throw new Error(`rcedit executable not found: ${rceditPath}`)
  }

  const iconPath = path.join(context.packager.projectDir, 'build', 'icon.ico')
  const productName = context.packager.appInfo.productName || 'Arion'
  const executableBaseName = path.basename(executablePath)

  const result = spawnSync(
    rceditPath,
    [
      executablePath,
      '--set-icon',
      iconPath,
      '--set-version-string',
      'ProductName',
      productName,
      '--set-version-string',
      'FileDescription',
      productName,
      '--set-version-string',
      'InternalName',
      executableBaseName,
      '--set-version-string',
      'CompanyName',
      productName,
      '--set-version-string',
      'OriginalFilename',
      executableBaseName
    ],
    {
      stdio: 'inherit'
    }
  )

  if (result.status !== 0) {
    throw new Error(`rcedit failed for ${executablePath} with exit code ${result.status}`)
  }
}
