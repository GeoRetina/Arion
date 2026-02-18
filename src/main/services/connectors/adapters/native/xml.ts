const XML_ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'"
}

const decodeXmlEntities = (value: string): string => {
  return value.replace(/&(amp|lt|gt|quot|#39);/g, (match) => XML_ENTITY_MAP[match] || match)
}

export const parseWmsLayerNames = (capabilitiesXml: string): string[] => {
  const names: string[] = []
  const layerNamePattern = /<Layer\b[\s\S]*?<Name>([^<]+)<\/Name>/gi
  let match: RegExpExecArray | null = layerNamePattern.exec(capabilitiesXml)

  while (match) {
    const name = decodeXmlEntities(match[1].trim())
    if (name.length > 0 && !names.includes(name)) {
      names.push(name)
    }
    match = layerNamePattern.exec(capabilitiesXml)
  }

  return names
}

export const parseWmtsLayerNames = (capabilitiesXml: string): string[] => {
  const names: string[] = []
  const layerBlockPattern = /<(?:wmts:)?Layer\b[\s\S]*?<\/(?:wmts:)?Layer>/gi
  let blockMatch: RegExpExecArray | null = layerBlockPattern.exec(capabilitiesXml)

  while (blockMatch) {
    const nameMatch = blockMatch[0].match(/<(?:ows:)?Identifier>([^<]+)<\/(?:ows:)?Identifier>/i)
    if (nameMatch?.[1]) {
      const name = decodeXmlEntities(nameMatch[1].trim())
      if (name.length > 0 && !names.includes(name)) {
        names.push(name)
      }
    }
    blockMatch = layerBlockPattern.exec(capabilitiesXml)
  }

  return names
}

export const parseS3ObjectList = (
  responseBody: string
): Array<{ key: string; size?: number; lastModified?: string }> => {
  const objects: Array<{ key: string; size?: number; lastModified?: string }> = []
  const contentsPattern = /<Contents>([\s\S]*?)<\/Contents>/gi
  let contentsMatch: RegExpExecArray | null = contentsPattern.exec(responseBody)

  while (contentsMatch) {
    const block = contentsMatch[1]
    const key = decodeXmlEntities((block.match(/<Key>([^<]+)<\/Key>/i)?.[1] || '').trim())
    const sizeRaw = (block.match(/<Size>([^<]+)<\/Size>/i)?.[1] || '').trim()
    const lastModified = (block.match(/<LastModified>([^<]+)<\/LastModified>/i)?.[1] || '').trim()

    if (key.length > 0) {
      const size = Number.isFinite(Number(sizeRaw)) ? Number(sizeRaw) : undefined
      objects.push({
        key,
        size,
        lastModified: lastModified || undefined
      })
    }

    contentsMatch = contentsPattern.exec(responseBody)
  }

  return objects
}
