import React from 'react'
import { Button } from '@/components/ui/button'
import { ArrowUp, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AttachButton } from './attach-button'

interface ChatInputButtonsProps {
  inputValue: string
  handleSubmit: (e?: React.FormEvent<HTMLFormElement>) => void // handleSubmit from useChat might not take an event if called directly
  // openFileDialog: () => void; // Deferred
  onStopStreaming?: () => void
  isStreaming: boolean
  // isProgressActive?: boolean; // Deferred
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

  // Common button styling for both light and dark themes using accent (purple) color
  const buttonStyle =
    'rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 border-0 shadow-none'

  return (
    <div className="absolute right-2 bottom-3 flex items-center gap-2">
      {/* Layer import attachment button */}
      <AttachButton 
        disabled={isStreaming}
      />

      {isStreaming ? (
        <Button
          type="button"
          size={isStoppingRequested ? 'sm' : 'icon'}
          onClick={onStopStreaming}
          disabled={isStoppingRequested}
          className={cn(buttonStyle, isStoppingRequested ? 'px-3 h-8 text-xs' : 'h-8 w-8')}
        >
          <Square className={cn(isStoppingRequested ? 'h-3 w-3 mr-1.5' : 'h-4 w-4')} />
          {isStoppingRequested ? 'Stopping...' : null}
        </Button>
      ) : (
        <Button
          type="button"
          onClick={() => handleSubmit()}
          size="icon"
          disabled={!canSubmit}
          className={cn(buttonStyle, 'h-8 w-8')}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
