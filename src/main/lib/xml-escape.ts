const XML_TEXT_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;'
}

const XML_ATTRIBUTE_ESCAPES: Record<string, string> = {
  ...XML_TEXT_ESCAPES,
  '"': '&quot;',
  "'": '&apos;'
}

export function escapeXmlText(value: string): string {
  return value.replace(/[&<>]/g, (character) => XML_TEXT_ESCAPES[character] || character)
}

export function escapeXmlAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (character) => XML_ATTRIBUTE_ESCAPES[character] || character)
}
