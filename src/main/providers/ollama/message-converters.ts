import {
  UnsupportedFunctionalityError,
  type LanguageModelV2CallWarning,
  type LanguageModelV2Prompt
} from '@ai-sdk/provider'
import type { OllamaResponsesPrompt } from './request-builder'

export function convertToOllamaResponsesMessages({
  prompt,
  systemMessageMode
}: {
  prompt: LanguageModelV2Prompt
  systemMessageMode: 'system' | 'developer' | 'remove'
}): {
  messages: OllamaResponsesPrompt
  warnings: Array<LanguageModelV2CallWarning>
} {
  const messages: OllamaResponsesPrompt = []
  const warnings: Array<LanguageModelV2CallWarning> = []

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system':
        if (systemMessageMode === 'system') {
          messages.push({ role: 'system', content })
        } else if (systemMessageMode === 'developer') {
          messages.push({ role: 'developer', content })
        } else {
          warnings.push({
            type: 'other',
            message: 'system messages are removed for this model'
          })
        }
        break
      case 'user':
        messages.push({
          role: 'user',
          content: content.map((part, index) => {
            switch (part.type) {
              case 'text':
                return { type: 'input_text', text: part.text }
              case 'file': {
                if (part.mediaType.startsWith('image/')) {
                  const mediaType = part.mediaType === 'image/*' ? 'image/jpeg' : part.mediaType
                  const data =
                    part.data instanceof URL
                      ? part.data.toString()
                      : `data:${mediaType};base64,${part.data}`
                  return { type: 'input_image', image_url: data }
                }
                if (part.mediaType === 'application/pdf') {
                  if (part.data instanceof URL) {
                    throw new UnsupportedFunctionalityError({
                      functionality: 'PDF file parts with URLs'
                    })
                  }
                  return {
                    type: 'input_file',
                    filename: part.filename ?? `part-${index}.pdf`,
                    file_data: `data:application/pdf;base64,${part.data}`
                  }
                }
                throw new UnsupportedFunctionalityError({
                  functionality: `file part media type ${part.mediaType || 'unknown'}`
                })
              }
              default:
                throw new UnsupportedFunctionalityError({
                  functionality: `user content type ${(part as any)?.type ?? 'unknown'}`
                })
            }
          })
        })
        break
      case 'assistant': {
        const assistantContent: any[] = []
        for (const part of content) {
          switch (part.type) {
            case 'text':
              assistantContent.push({ type: 'output_text', text: part.text })
              break
            case 'tool-call':
              messages.push({
                type: 'function_call',
                call_id: part.toolCallId,
                name: part.toolName,
                arguments: JSON.stringify(part.input)
              })
              break
            case 'reasoning':
              assistantContent.push({ type: 'output_text', text: part.text })
              break
            default: {
              const unknown = part as { type?: string }
              throw new Error(`Unsupported assistant part: ${unknown.type ?? 'unknown'}`)
            }
          }
        }
        if (assistantContent.length > 0) {
          messages.push({ role: 'assistant', content: assistantContent })
        }
        break
      }
      case 'tool':
        for (const part of content) {
          const output = part.output
          let contentValue = ''
          switch (output.type) {
            case 'text':
            case 'error-text':
              contentValue = output.value
              break
            case 'content':
            case 'json':
            case 'error-json':
              contentValue = JSON.stringify(output.value)
              break
            default: {
              const unknown = output as { type?: string }
              throw new UnsupportedFunctionalityError({
                functionality: `tool output type ${unknown.type ?? 'unknown'}`
              })
            }
          }
          messages.push({
            type: 'function_call_output',
            call_id: part.toolCallId,
            output: contentValue
          })
        }
        break
      default:
        throw new Error(`Unsupported role: ${role}`)
    }
  }

  return { messages, warnings }
}

export function convertToOllamaChatMessages({
  prompt,
  systemMessageMode = 'system'
}: {
  prompt: LanguageModelV2Prompt
  systemMessageMode?: 'system' | 'developer' | 'remove'
}): any {
  const messages: any[] = []

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system':
        if (systemMessageMode === 'system') {
          messages.push({ role: 'system', content })
        } else if (systemMessageMode === 'developer') {
          messages.push({ role: 'developer', content })
        }
        break
      case 'user': {
        if (content.length === 1 && content[0].type === 'text') {
          messages.push({ role: 'user', content: content[0].text })
          break
        }
        const userText = content.filter((part) => part.type === 'text').map((part) => part.text).join('')
        const images = content
          .filter((part) => part.type === 'file' && part.mediaType.startsWith('image/'))
          .map((part) => (part as any).data)
        messages.push({
          role: 'user',
          content: userText.length > 0 ? userText : [],
          images: images.length > 0 ? images : undefined
        })
        break
      }
      case 'assistant': {
        let text = ''
        let thinking = ''
        const toolCalls: Array<{
          id: string
          type: 'function'
          function: { name: string; arguments: object }
        }> = []

        for (const part of content) {
          switch (part.type) {
            case 'text':
              text += part.text
              break
            case 'tool-call':
              toolCalls.push({
                id: part.toolCallId,
                type: 'function',
                function: { name: part.toolName, arguments: part.input as object }
              })
              break
            case 'reasoning':
              thinking += part.text
              break
          }
        }

        messages.push({
          role: 'assistant',
          content: text,
          ...(thinking && { thinking }),
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined
        })
        break
      }
      case 'tool':
        for (const toolResponse of content) {
          const output = toolResponse.output
          let contentValue = ''
          switch (output.type) {
            case 'text':
            case 'error-text':
              contentValue = output.value
              break
            case 'content':
            case 'json':
            case 'error-json':
              contentValue = JSON.stringify(output.value)
              break
            default: {
              const unknown = output as { type?: string }
              throw new UnsupportedFunctionalityError({
                functionality: `tool output type ${unknown.type ?? 'unknown'}`
              })
            }
          }
          messages.push({
            role: 'tool',
            tool_call_id: toolResponse.toolCallId,
            content: contentValue
          })
        }
        break
      default:
        throw new Error(`Unsupported role: ${role}`)
    }
  }

  return messages
}
