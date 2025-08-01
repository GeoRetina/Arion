import { useCallback, useEffect, useRef, useState } from 'react'

interface MentionTriggerState {
  isActive: boolean
  searchQuery: string
  position: { x: number; y: number }
  selectedIndex: number
}

interface UseMentionTriggerOptions {
  editorRef: React.RefObject<HTMLDivElement>
  onTriggerChange?: (isActive: boolean, searchQuery: string) => void
}

export const useMentionTrigger = ({ 
  editorRef, 
  onTriggerChange 
}: UseMentionTriggerOptions) => {
  const [state, setState] = useState<MentionTriggerState>({
    isActive: false,
    searchQuery: '',
    position: { x: 0, y: 0 },
    selectedIndex: 0
  })

  const mentionStartRef = useRef<number>(-1)
  const insertCooldownRef = useRef<number>(0)

  const getCaretPosition = useCallback(() => {
    if (!editorRef.current) return { x: 0, y: 0 }

    const selection = window.getSelection()
    if (!selection?.rangeCount) return { x: 0, y: 0 }

    const range = selection.getRangeAt(0).cloneRange()
    range.collapse(true)

    // Create a temporary span at the caret position
    const tempSpan = document.createElement('span')
    tempSpan.style.position = 'absolute'
    tempSpan.textContent = '|'
    
    try {
      range.insertNode(tempSpan)
      
      const rect = tempSpan.getBoundingClientRect()
      
      // Clean up the temporary span
      tempSpan.remove()
      
      // Find the closest positioned ancestor (the chat input container)
      let positionedParent = editorRef.current.offsetParent as HTMLElement
      while (positionedParent) {
        const computedStyle = window.getComputedStyle(positionedParent)
        if (computedStyle.position !== 'static') break
        positionedParent = positionedParent.offsetParent as HTMLElement
      }
      
      const containerRect = positionedParent ? 
        positionedParent.getBoundingClientRect() : 
        editorRef.current.getBoundingClientRect()
      
      // Get line height for proper positioning
      const computedStyle = window.getComputedStyle(editorRef.current)
      const lineHeight = parseInt(computedStyle.lineHeight) || 20
      
      return {
        x: rect.left - containerRect.left,
        y: rect.top - containerRect.top
      }
    } catch (error) {
      // Fallback if range insertion fails
      return { x: 0, y: 0 }
    }
  }, [editorRef])

  const detectMentionTrigger = useCallback(() => {
    if (!editorRef.current) return

    // Check if we're in a cooldown period after inserting a mention
    const now = Date.now()
    if (now - insertCooldownRef.current < 500) { // Increased cooldown
      return
    }

    const selection = window.getSelection()
    if (!selection?.rangeCount) {
      // No selection, close mention menu
      if (state.isActive) {
        mentionStartRef.current = -1
        setState(prev => ({
          ...prev,
          isActive: false,
          searchQuery: '',
          selectedIndex: 0
        }))
        onTriggerChange?.(false, '')
      }
      return
    }

    const range = selection.getRangeAt(0)
    const textNode = range.startContainer
    const offset = range.startOffset

    // If we're not in a text node, close the menu
    if (textNode.nodeType !== Node.TEXT_NODE) {
      if (state.isActive) {
        mentionStartRef.current = -1
        setState(prev => ({
          ...prev,
          isActive: false,
          searchQuery: '',
          selectedIndex: 0
        }))
        onTriggerChange?.(false, '')
      }
      return
    }

    // Check if we're inside a non-editable mention span
    let parentNode = textNode.parentNode
    while (parentNode && parentNode !== editorRef.current) {
      if (parentNode.nodeType === Node.ELEMENT_NODE) {
        const element = parentNode as Element
        if (element.contentEditable === 'false' || element.hasAttribute('data-mention')) {
          // We're inside a mention span, don't trigger menu
          if (state.isActive) {
            mentionStartRef.current = -1
            setState(prev => ({
              ...prev,
              isActive: false,
              searchQuery: '',
              selectedIndex: 0
            }))
            onTriggerChange?.(false, '')
          }
          return
        }
      }
      parentNode = parentNode.parentNode
    }

    // Get just the current text node content for @ detection
    const textContent = textNode.textContent || ''
    const beforeCaret = textContent.substring(0, offset)
    
    // Look for @ symbol followed by optional search text at the end of current text node
    const mentionMatch = beforeCaret.match(/@([^@\s]*)$/)
    
    if (mentionMatch) {
      const searchQuery = mentionMatch[1]
      const mentionStart = offset - mentionMatch[0].length
      
      // Only trigger if this is a new mention or the search query changed
      if (mentionStartRef.current !== mentionStart || state.searchQuery !== searchQuery) {
        mentionStartRef.current = mentionStart
        const position = getCaretPosition()
        
        setState(prev => ({
          ...prev,
          isActive: true,
          searchQuery,
          position,
          selectedIndex: 0 // Only reset selectedIndex for new mentions or changed queries
        }))
        
        onTriggerChange?.(true, searchQuery)
      } else if (state.isActive) {
        // Same mention session, just update position if needed
        const position = getCaretPosition()
        setState(prev => ({
          ...prev,
          position
          // Don't reset selectedIndex here
        }))
      }
    } else {
      // No mention trigger found, close the menu
      if (state.isActive) {
        mentionStartRef.current = -1
        setState(prev => ({
          ...prev,
          isActive: false,
          searchQuery: '',
          selectedIndex: 0
        }))
        onTriggerChange?.(false, '')
      }
    }
  }, [editorRef, getCaretPosition, onTriggerChange, state.isActive, state.searchQuery])

  const insertMention = useCallback((mentionText: string) => {
    if (!editorRef.current) return

    // Close the mention menu immediately
    mentionStartRef.current = -1
    insertCooldownRef.current = Date.now()
    setState(prev => ({
      ...prev,
      isActive: false,
      searchQuery: '',
      selectedIndex: 0
    }))
    onTriggerChange?.(false, '')

    // Focus the editor first
    editorRef.current.focus()

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    if (!range.collapsed) {
      range.collapse(false)
    }

    // Focus and position at end
    editorRef.current.focus()
    selection.collapseToEnd()

    // Get current text content and find the command to replace
    const textContent = editorRef.current.textContent || ''
    const beforeCaret = textContent.substring(0, selection.getRangeAt(0).startOffset || textContent.length)
    const match = beforeCaret.match(/@([^@\s]*)$/)
    
    if (!match) return

    const commandLength = match[0].length

    // Select backward to cover the command
    for (let i = 0; i < commandLength; i++) {
      selection.modify("extend", "backward", "character")
    }

    // Create the mention span (non-editable)
    const mentionSpan = document.createElement("span")
    mentionSpan.contentEditable = "false"
    mentionSpan.className = "inline-block bg-blue-100 dark:bg-yellow-800/40 dark:text-yellow-300 px-1.5 py-0 rounded-md font-normal align-baseline"
    mentionSpan.textContent = mentionText

    // Create NBSP text node for boundary
    const spaceNode = document.createTextNode("\u00A0")

    // Insert the mention span and NBSP
    const currentRange = selection.getRangeAt(0)
    currentRange.deleteContents()
    currentRange.insertNode(mentionSpan)

    currentRange.setStartAfter(mentionSpan)
    currentRange.collapse(true)
    currentRange.insertNode(spaceNode)

    // Position caret after the NBSP
    selection.removeAllRanges()
    selection.addRange(currentRange)
    selection.collapseToEnd()

    // Ensure focus is maintained
    editorRef.current.focus()

    // Trigger input event to sync with parent
    const inputEvent = new Event('input', { bubbles: true })
    editorRef.current.dispatchEvent(inputEvent)
  }, [editorRef, onTriggerChange])

  const closeMention = useCallback(() => {
    mentionStartRef.current = -1
    setState(prev => ({
      ...prev,
      isActive: false,
      searchQuery: '',
      selectedIndex: 0
    }))
    onTriggerChange?.(false, '')
  }, [onTriggerChange])

  const setSelectedIndex = useCallback((index: number) => {
    setState(prev => ({ ...prev, selectedIndex: index }))
  }, [])

  // Listen for selection changes to detect mention triggers
  // Note: We don't listen to input events here to avoid conflicts
  useEffect(() => {
    const handleSelectionChange = () => {
      // Add a small delay to prevent rapid firing
      setTimeout(() => detectMentionTrigger(), 10)
    }

    document.addEventListener('selectionchange', handleSelectionChange)

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [detectMentionTrigger])

  return {
    isActive: state.isActive,
    searchQuery: state.searchQuery,
    position: state.position,
    selectedIndex: state.selectedIndex,
    insertMention,
    closeMention,
    setSelectedIndex,
    detectMentionTrigger
  }
}