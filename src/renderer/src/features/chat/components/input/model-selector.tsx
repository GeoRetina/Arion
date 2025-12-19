import React from 'react'
import { Check, ChevronUp } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Arrow as PopoverArrow } from '@radix-ui/react-popover'
import { Button } from '@/components/ui/button'
import { LLMProvider } from '@/stores/llm-store'
import { PROVIDER_LOGOS } from '@/constants/llm-providers'

export interface ProviderOption {
  id: NonNullable<LLMProvider>
  name: string
  isConfigured: boolean
  isActive: boolean
}

interface ModelSelectorProps {
  availableProviders: ProviderOption[]
  activeProvider: LLMProvider | null
  onSelectProvider: (providerId: NonNullable<LLMProvider>) => void
}

const ModelSelector: React.FC<ModelSelectorProps> = ({
  availableProviders,
  activeProvider,
  onSelectProvider
}) => {
  // Get the filtered providers that are configured
  const configuredProviders = availableProviders.filter((p) => p.isConfigured)
  const hasConfiguredProviders = configuredProviders.length > 0

  // Get the active provider name
  const activeProviderFullName = activeProvider
    ? availableProviders.find((p) => p.id === activeProvider)?.name
    : null

  let displayActiveModelName = activeProviderFullName
  if (activeProviderFullName) {
    const match = activeProviderFullName.match(/\(([^)]+)\)$/)
    if (match && match[1]) {
      displayActiveModelName = match[1]
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`group h-8 px-2.5 rounded-md bg-secondary/50 hover:bg-secondary/70 flex items-center gap-2 transition-colors 
            border-[1px] border-stone-300 dark:border-stone-600 hover:border-stone-400 dark:hover:border-stone-500
            max-w-42
            ${activeProvider ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          {activeProvider ? (
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-4 h-4 rounded-sm flex items-center justify-center flex-shrink-0">
                <img
                  src={PROVIDER_LOGOS[activeProvider]}
                  alt=""
                  className="w-full h-full object-contain"
                />
              </div>
              <span className="font-medium text-xs truncate">{displayActiveModelName}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-sm flex items-center justify-center opacity-70">
                <img src={PROVIDER_LOGOS.openai} alt="" className="w-full h-full object-contain" />
              </div>
              <span className="text-xs">Select Model</span>
            </div>
          )}
          <ChevronUp className="h-3 w-3 text-foreground/50 ml-1 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-64 min-h-32 overflow-hidden rounded-lg border border-border bg-popover p-0 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        side="top"
        align="start"
        sideOffset={8}
      >
        <PopoverArrow className="fill-popover stroke-border" width={10} height={5} />
        <div className="flex flex-col">
          {/* Header */}
          <div className="border-b border-border/40 bg-muted/40 px-2.5 py-1.5">
            <h4 className="text-xs font-medium text-foreground">Available Models</h4>
          </div>

          {/* Provider list */}
          {hasConfiguredProviders ? (
            <div className="py-1 max-h-72 overflow-y-auto scrollbar-thin">
              {configuredProviders.map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => !provider.isActive && onSelectProvider(provider.id)}
                  disabled={provider.isActive}
                  className={`w-full text-left px-2.5 py-1.5 flex items-center gap-2.5 transition-colors ${
                    provider.isActive
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'hover:bg-secondary/30 text-foreground'
                  }`}
                >
                  <div className="flex-shrink-0 w-4 h-4 rounded-sm overflow-hidden flex items-center justify-center shadow-sm bg-background/80">
                    <img
                      src={PROVIDER_LOGOS[provider.id]}
                      alt=""
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <span className="flex-grow truncate text-xs">{provider.name}</span>
                  {provider.isActive && (
                    <Check size={14} className="flex-shrink-0 ml-auto" strokeWidth={2.5} />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="py-4 px-3 flex flex-col items-center justify-center">
              <div className="text-xs text-center text-muted-foreground">
                No configured models available
              </div>
              <div className="mt-1.5 text-[10px] text-center text-muted-foreground/70">
                Configure models in Settings
              </div>
            </div>
          )}

          {/* Footer hint */}
          {hasConfiguredProviders && (
            <div className="border-t border-border/20 py-1.5 px-2.5 bg-muted/20">
              <div className="text-[10px] text-center text-muted-foreground/60">
                Select a model to use
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default ModelSelector
