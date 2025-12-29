import type {
  LanguageModelV3CallOptions,
  SharedV3Warning
} from '@ai-sdk/provider'
import { parseProviderOptions } from '@ai-sdk/provider-utils'
import { convertToOllamaResponsesMessages, convertToOllamaChatMessages } from './message-converters'
import { prepareResponsesTools } from './tool-prep'
import { ollamaProviderOptionsSchema, type RequestBuilderArgs } from './types'

export type OllamaResponsesPrompt = Array<any>

export class OllamaRequestBuilder {
  async buildRequest({
    modelId,
    maxOutputTokens,
    temperature,
    stopSequences,
    topP,
    topK,
    presencePenalty,
    frequencyPenalty,
    seed,
    prompt,
    providerOptions,
    tools,
    toolChoice,
    responseFormat
  }: LanguageModelV3CallOptions & { modelId: string }) {
    const warnings = this.collectUnsupportedSettingsWarnings({
      topK,
      seed,
      presencePenalty,
      frequencyPenalty,
      stopSequences
    })

    const { warnings: messageWarnings } = convertToOllamaResponsesMessages({
      prompt,
      systemMessageMode: 'system'
    })
    warnings.push(...messageWarnings)

    const ollamaOptions = await this.parseProviderOptions(providerOptions)

    const baseArgs: RequestBuilderArgs = {
      model: modelId,
      messages: convertToOllamaChatMessages({ prompt, systemMessageMode: 'system' }),
      temperature,
      top_p: topP,
      max_output_tokens: maxOutputTokens,
      think: ollamaOptions?.think,
      options: ollamaOptions?.options,
      keep_alive: ollamaOptions?.keep_alive,
      ...(responseFormat?.type === 'json' && {
        format: responseFormat.schema != null ? responseFormat.schema : 'json'
      })
    }

    const { tools: mappedTools, toolChoice: mappedChoice, toolWarnings } = prepareResponsesTools({
      tools,
      toolChoice
    })

    warnings.push(...toolWarnings)

    return {
      args: { ...baseArgs, tools: mappedTools, tool_choice: mappedChoice },
      warnings
    }
  }

  private collectUnsupportedSettingsWarnings({
    topK,
    seed,
    presencePenalty,
    frequencyPenalty,
    stopSequences
  }: {
    topK?: number
    seed?: number
    presencePenalty?: number
    frequencyPenalty?: number
    stopSequences?: string[]
  }): SharedV3Warning[] {
    const warnings: SharedV3Warning[] = []
    const unsupported = [
      { value: topK, name: 'topK' },
      { value: seed, name: 'seed' },
      { value: presencePenalty, name: 'presencePenalty' },
      { value: frequencyPenalty, name: 'frequencyPenalty' },
      { value: stopSequences, name: 'stopSequences' }
    ]

    for (const { value, name } of unsupported) {
      if (value != null) {
        warnings.push({ type: 'unsupported', feature: `setting:${name}` })
      }
    }

    return warnings
  }

  private async parseProviderOptions(providerOptions?: LanguageModelV3CallOptions['providerOptions']) {
    if (!providerOptions) return null

    const parsed = await parseProviderOptions({
      provider: 'ollama',
      providerOptions,
      schema: ollamaProviderOptionsSchema
    })

    return parsed ?? null
  }
}
