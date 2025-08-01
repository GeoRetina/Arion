// @ts-nocheck
// TODO: Resolve TypeScript errors after full refactor, especially around contentEditable syncing

import React, { useRef, useState, useEffect, useCallback } from 'react'
import { X, AlertTriangle, Map as MapIcon } from 'lucide-react' // Added MapIcon
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { LLMProvider } from '@/stores/llm-store'
import ModelSelector, { ProviderOption } from './model-selector'
import { ChatInputButtons } from './chat-input-buttons'
import { PlusDropdown } from './plus-dropdown'
import { ScrollArea } from '@/components/ui/scroll-area' // Added ScrollArea import

interface ChatInputBoxProps {
  inputValue: string // Controlled input value from useChat
  onValueChange: (value: string) => void // New prop for direct value changes
  handleSubmit: (e?: React.FormEvent<HTMLFormElement>) => void // From useChat
  isStreaming: boolean
  activeBanner?: string | null // For displaying selected ROI name or similar
  onStopStreaming?: () => void
  // isProgressActive?: boolean; // For button state, deferred for now
  setStoppingRequested?: (isRequested: boolean) => void // From useChatLogic
  // maxAreaLimit?: number; // Deferred, no area checks for now
  // chatId?: string; // Not directly used by input box UI itself
  isStoppingRequestedRef?: React.RefObject<boolean> // Added prop for the ref

  // New props for LLM provider selection
  availableProviders: ProviderOption[]
  activeProvider: LLMProvider | null // LLMProvider can be null if none is active
  onSelectProvider: (providerId: NonNullable<LLMProvider>) => void

  // New props for map sidebar control
  isMapSidebarExpanded?: boolean
  onToggleMapSidebar?: () => void

  // New prop for database modal
  onOpenDatabase?: () => void
}

const ChatInputBox: React.FC<ChatInputBoxProps> = ({
  inputValue,
  onValueChange, // Use this instead
  handleSubmit,
  isStreaming,
  activeBanner,
  onStopStreaming,
  setStoppingRequested, // This function updates the ref in useChatLogic
  isStoppingRequestedRef, // This is the ref itself
  availableProviders,
  activeProvider,
  onSelectProvider,
  // New props for map sidebar control
  isMapSidebarExpanded = false,
  onToggleMapSidebar,
  onOpenDatabase
}) => {
  const editorRef = useRef<HTMLDivElement>(null)
  const [isSubmitting, setIsSubmitting] = useState(false) // Local submitting state if needed
  const [internalText, setInternalText] = useState(inputValue) // Local state for editor content
  const scrollAreaRef = useRef<HTMLDivElement>(null) // Ref for the ScrollArea's viewport

  // Sync internalText and editor when inputValue prop changes (e.g., after submit)
  useEffect(() => {
    // Always update internalText to reflect the prop.
    // This is because inputValue is the "source of truth" from the parent.
    setInternalText(inputValue)

    // Now, ensure the DOM (editorRef) matches this inputValue.
    if (editorRef.current) {
      if (inputValue === '') {
        // If inputValue is empty, ensure the editor's innerHTML is also empty
        // to clear any residual <br> tags, etc.
        if (editorRef.current.innerHTML !== '') {
          editorRef.current.innerHTML = ''
        }
      } else {
        // If inputValue is not empty, and the editor's current textContent
        // doesn't match, then update the editor's textContent.
        // This avoids unnecessary DOM manipulation if they already match,
        // which helps preserve caret position.
        if (editorRef.current.textContent !== inputValue) {
          editorRef.current.textContent = inputValue
        }
      }
    }
  }, [inputValue])

  const onActualInput = useCallback(
    (event: React.FormEvent<HTMLDivElement>) => {
      let currentText = ''
      const editorNode = event.currentTarget

      if (editorNode) {
        // Browsers insert <br> into an empty contentEditable or if you press Enter then delete.
        // Check for this or if textContent is just whitespace.
        if (
          editorNode.innerHTML === '<br>' ||
          editorNode.innerHTML === '<div><br></div>' || // Sometimes nested
          (editorNode.textContent !== null && editorNode.textContent.trim() === '')
        ) {
          currentText = ''
          // If we determine it's empty, and visually it's not (e.g. still has <br>)
          // ensure it becomes visually empty for next check.
          if (editorNode.innerHTML !== '' && editorNode.innerHTML !== '<br>') {
            // Avoid loop if already <br>
            // editorNode.innerHTML = ""; // This might be too aggressive here and fight with user typing
          }
        } else {
          currentText = editorNode.textContent || ''
        }
      }

      setInternalText(currentText)
      onValueChange(currentText)
      // updateCaretPosition(); // Called by selectionchange or mutation observer
    },
    [onValueChange]
  )

  const onInternalSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault()
    // Submit based on internalText to ensure it matches what user sees,
    // though inputValue should ideally be in sync.
    if (isSubmitting || isStreaming || !internalText.trim()) return
    try {
      setIsSubmitting(true)
      handleSubmit() // Call useChat's handleSubmit
      // After successful submit, inputValue will change via useChat, triggering useEffect to clear editor
    } finally {
      setIsSubmitting(false)
      editorRef.current?.focus()
    }
  }

  const handleCombinedKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onInternalSubmit()
    }
    // Allow default behavior for other keys, which will trigger mutation/selection observers
  }

  // Simplified banner closing, just clears the visual banner part
  // Actual logic for clearing selected ROI would be in useChatLogic or parent
  const handleCloseBanner = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // TODO: Implement a way to signal to parent to clear the activeBanner if needed
    // For now, this component doesn't own the activeBanner state directly.
    // This action might need to be lifted up.
  }

  const baseEditorMinHeight = 50 // px
  const bannerHeightReduction = activeBanner ? 30 : 0 // Approximate height of the banner section
  const editorMinHeight = `${baseEditorMinHeight - bannerHeightReduction}px`
  const editorTopPadding = 12 // Corresponds to py-3 (0.75rem)
  const maxInputHeight = 400 // Maximum height for the scrollable input area in pixels

  // Focus the editor when isStreaming becomes false (i.e., after a response)
  // and if the input is currently empty, to make it easy to type the next message.
  useEffect(() => {
    if (!isStreaming && editorRef.current && internalText.trim() === '') {
      editorRef.current.focus()
    }
  }, [isStreaming, internalText])

  return (
    <div
      className={`flex flex-col gap-4 bg-[var(--chat-input-background)] h-full rounded-2xl items-center border border-stone-300 dark:border-stone-600 w-full max-w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-3xl mx-auto relative ${
        isStreaming ? 'streaming-border' : ''
      }`}
      style={{
        minHeight: 'auto', // Allow shrinking based on content
        maxHeight: 'calc(100vh - 200px)' // Example: constrain overall component height
      }}
    >
      <form
        onSubmit={onInternalSubmit}
        className="relative w-full h-full flex flex-col"
        style={{
          minHeight: `${baseEditorMinHeight + 48}px` /* base + approx padding/button space */
        }}
      >
        {/* Banner for Active Selection (simplified) */}
        {activeBanner && (
          <div
            className="px-4 py-1 border-b border-stone-300 dark:border-stone-600 bg-muted/50 flex items-center gap-2 rounded-t-2xl shrink-0"
            style={{ height: `${bannerHeightReduction}px` }}
          >
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Context: {/* Changed from Active ROI */}
            </div>
            <span
              className={`inline-flex items-center text-emerald-600 dark:text-yellow-300 px-1.5 py-0.5 rounded-md text-xs font-medium shadow-sm relative`}
            >
              {/* Icon placeholder if needed */}
              {activeBanner}
              {/* Removed area limit display */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleCloseBanner}
                    className="ml-1 relative -top-1 inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    aria-label="Remove selection banner"
                  >
                    <X size={11} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Clear context</p>
                </TooltipContent>
              </Tooltip>
            </span>
          </div>
        )}

        <div className="relative flex-grow flex flex-col pb-12">
          {' '}
          {/* Make this a flex container */} {/* Wrapper for editor and placeholder */}{' '}
          {/* Make this a flex container */} {/* Wrapper for editor and placeholder */}
          {!internalText.trim() && ( // Consolidated placeholder condition
            <span
              className={`absolute left-4 pr-4 text-muted-foreground pointer-events-none leading-snug z-10`} // Add z-index
              style={{ top: `${editorTopPadding}px` }} // Match editor's top padding
            >
              Type a message...
            </span>
          )}
          {/* ContentEditable Div wrapped with ScrollArea */}
          <ScrollArea
            className="flex-grow w-full" // Ensure it takes available width and can grow
            style={{ maxHeight: `${maxInputHeight}px` }}
            ref={scrollAreaRef} // Add ref to ScrollArea if we need to access its viewport directly
          >
            <div
              ref={editorRef}
              contentEditable={true} // Always editable
              onInput={onActualInput}
              onKeyDown={handleCombinedKeyDown}
              role="textbox"
              aria-multiline="true"
              className={`relative w-full py-3 px-4 bg-transparent focus:outline-none leading-snug`} // Use py-3 for symmetrical padding, pb-12 on parent handles button bar space
              style={{
                caretColor: 'auto', // Use native caret
                minHeight: editorMinHeight // Keep minHeight for initial rendering
              }}
              suppressContentEditableWarning={true}
            />
          </ScrollArea>
        </div>

        {/* Provider Selector and ChatInputButtons */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2 pb-2 pt-1 bg-[var(--chat-input-background)] rounded-b-2xl mt-auto shrink-0">
          {' '}
          {/* Added mt-auto and shrink-0 */}
          <div className="flex items-center gap-2">
            {/* Plus dropdown moved to the left side */}
            <PlusDropdown 
              disabled={isStreaming}
              onOpenDatabase={onOpenDatabase}
            />
            
            <ModelSelector
              availableProviders={availableProviders}
              activeProvider={activeProvider}
              onSelectProvider={onSelectProvider}
            />

            {/* Map toggle button */}
            {onToggleMapSidebar && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="custom"
                    size="icon"
                    onClick={onToggleMapSidebar}
                    type="button"
                    className={`
                      h-8 w-8 flex items-center justify-center ml-1 border-[1px] rounded-md
                      border-stone-300 dark:border-stone-600 hover:border-stone-400 dark:hover:border-stone-500
                      ${isMapSidebarExpanded ? 'text-blue-500 bg-blue-500/20 hover:bg-blue-500/30' : ''}
                    `}
                  >
                    <MapIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isMapSidebarExpanded ? 'Hide Map' : 'Show Map'}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <ChatInputButtons
            inputValue={internalText} // Pass internalText to buttons for enabled/disabled state based on actual content
            handleSubmit={onInternalSubmit} // Pass the internal submit handler
            onStopStreaming={onStopStreaming}
            isStreaming={isStreaming}
            isStoppingRequested={isStreaming && isStoppingRequestedRef?.current} // Pass the ref's current value
          />
        </div>
      </form>
      {/* Mention menu and file dialog are deferred */}
    </div>
  )
}

export default ChatInputBox
