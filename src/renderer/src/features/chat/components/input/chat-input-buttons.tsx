import React from 'react'
import { Button } from '@/components/ui/button'
import { ArrowUp, Square } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface ChatInputButtonsProps {
  inputValue: string
  handleSubmit: (e?: React.FormEvent<HTMLFormElement>) => void // handleSubmit from useChat might not take an event if called directly
  onStopStreaming?: () => void
  isStreaming: boolean
  isStoppingRequested?: boolean
}

export const ChatInputButtons: React.FC<ChatInputButtonsProps> = ({
  inputValue,
  handleSubmit,
  onStopStreaming,
  isStreaming,
  isStoppingRequested
}) => {
  const canSubmit = !!inputValue.trim() && !isStreaming

  // Common button styling - purple color for send button
  const buttonStyle =
    'rounded-lg bg-violet-500 text-white hover:bg-violet-600 border-0 shadow-none'

  return (
    <div className="absolute right-2 bottom-3 flex items-center gap-2">
      {isStreaming ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="custom"
              size={isStoppingRequested ? 'sm' : 'icon'}
              onClick={onStopStreaming}
              disabled={isStoppingRequested}
              className={cn(buttonStyle, isStoppingRequested ? 'px-3 h-8 text-xs' : 'h-8 w-8')}
            >
              <Square className={cn(isStoppingRequested ? 'h-3 w-3 mr-1.5' : 'h-4 w-4')} />
              {isStoppingRequested ? 'Stopping...' : null}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isStoppingRequested ? 'Stopping response...' : 'Stop streaming'}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="custom"
              onClick={() => handleSubmit()}
              size="icon"
              disabled={!canSubmit}
              className={cn(buttonStyle, 'h-8 w-8')}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{!inputValue.trim() ? 'Enter message to send' : 'Send message (Enter)'}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
