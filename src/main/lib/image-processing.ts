import fs from 'fs'
import path from 'path'
import os from 'os'
import mime from 'mime-types'
import { fromFile as geoTiffFromFile } from 'geotiff'
// @ts-ignore
import { encode as encodePng } from 'fast-png'

/**
 * Converts a local image file (including TIFFs with normalization) to a data URI.
 * @param imagePath The absolute path to the image file.
 * @returns A promise that resolves to the data URI string (e.g., 'data:image/png;base64,...').
 * @throws An error if the file is not found, not a supported image type, or if conversion fails.
 */
export async function convertImageFileToDataUri(imagePath: string): Promise<string> {
  let resolvedImagePath = imagePath

  // Expand tilde to home directory if present
  if (resolvedImagePath.startsWith('~/')) {
    resolvedImagePath = path.join(os.homedir(), resolvedImagePath.substring(2))
  }

  if (!path.isAbsolute(resolvedImagePath)) {
    throw new Error(
      `Path is not absolute: ${resolvedImagePath}. Tilde expansion might have failed or path was relative.`
    )
  }

  if (!fs.existsSync(resolvedImagePath)) {
    throw new Error(`File not found at path: ${resolvedImagePath}`)
  }

  const mimeType = mime.lookup(resolvedImagePath)
  if (!mimeType || !mimeType.startsWith('image/')) {
    throw new Error(
      `Invalid or unsupported image type at path: ${resolvedImagePath}. MIME type: ${mimeType}`
    )
  }

  if (mimeType === 'image/tiff') {
    const tiff = await geoTiffFromFile(resolvedImagePath)
    const image = await tiff.getImage() // Get the first image from the TIFF
    const width = image.getWidth()
    const height = image.getHeight()
    const samplesPerPixel = image.getSamplesPerPixel()

    const rawRasterData = (await image.readRasters({
      interleave: false
    })) as (Uint16Array | Int16Array | Uint8Array | Float32Array | Float64Array)[]

    if (!rawRasterData || rawRasterData.length === 0) {
      throw new Error('Could not read raster data from TIFF.')
    }

    const numBandsToProcess = Math.min(rawRasterData.length, 3)
    const scaledBands: Uint8Array[] = []

    for (let i = 0; i < numBandsToProcess; i++) {
      const bandData = rawRasterData[i]

      const isProcessableNumericType =
        bandData instanceof Uint16Array ||
        bandData instanceof Int16Array ||
        bandData instanceof Float32Array ||
        bandData instanceof Float64Array ||
        bandData instanceof Uint8Array

      if (!isProcessableNumericType) {
        const blackBand = new Uint8Array(width * height)
        blackBand.fill(0)
        scaledBands.push(blackBand)
        continue
      }

      // At this point, bandData is one of the allowed TypedArray instances
      let minVal: number, maxVal: number
      if (bandData instanceof Uint16Array) {
        minVal = 65535
        maxVal = 0
      } else if (bandData instanceof Int16Array) {
        minVal = 32767
        maxVal = -32768
      } else if (bandData instanceof Uint8Array) {
        minVal = 255
        maxVal = 0
      } else {
        // Float32Array or Float64Array
        minVal = Number.POSITIVE_INFINITY
        maxVal = Number.NEGATIVE_INFINITY
      }

      for (let j = 0; j < bandData.length; j++) {
        if (bandData[j] < minVal) minVal = bandData[j]
        if (bandData[j] > maxVal) maxVal = bandData[j]
      }
      // }) - Min: ${minVal}, Max: ${maxVal}`)

      const bandData8bit = new Uint8Array(bandData.length)
      if (maxVal === minVal) {
        bandData8bit.fill(0)
      } else {
        for (let j = 0; j < bandData.length; j++) {
          bandData8bit[j] = Math.max(
            0,
            Math.min(255, Math.round(((bandData[j] - minVal) / (maxVal - minVal)) * 255))
          )
        }
      }
      scaledBands.push(bandData8bit)
    }

    const numOutputChannels = 3 // RGB
    const finalPixelData = new Uint8Array(width * height * numOutputChannels)

    if (numBandsToProcess === 1) {
      const grayBand = scaledBands[0]
      for (let i = 0; i < width * height; i++) {
        finalPixelData[i * numOutputChannels + 0] = grayBand[i]
        finalPixelData[i * numOutputChannels + 1] = grayBand[i]
        finalPixelData[i * numOutputChannels + 2] = grayBand[i]
      }
    } else if (numBandsToProcess === 2) {
      const rBand = scaledBands[0]
      const gBand = scaledBands[1]
      for (let i = 0; i < width * height; i++) {
        finalPixelData[i * numOutputChannels + 0] = rBand[i]
        finalPixelData[i * numOutputChannels + 1] = gBand[i]
        finalPixelData[i * numOutputChannels + 2] = 0
      }
    } else {
      // 3 bands (RGB)
      const rBand = scaledBands[0]
      const gBand = scaledBands[1]
      const bBand = scaledBands[2]
      for (let i = 0; i < width * height; i++) {
        finalPixelData[i * numOutputChannels + 0] = rBand[i]
        finalPixelData[i * numOutputChannels + 1] = gBand[i]
        finalPixelData[i * numOutputChannels + 2] = bBand[i]
      }
    }

    const pngBuffer = encodePng({
      data: finalPixelData,
      width,
      height,
      channels: numOutputChannels
    })
    return `data:image/png;base64,${Buffer.from(pngBuffer).toString('base64')}`
  } else if (mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/gif') {
    const imageBuffer = fs.readFileSync(resolvedImagePath)
    return `data:${mimeType};base64,${imageBuffer.toString('base64')}`
  } else {
    throw new Error(
      `Unsupported local image type for data URI conversion: ${mimeType} at ${resolvedImagePath}. Please use PNG, JPEG, GIF, or TIFF.`
    )
  }
}
