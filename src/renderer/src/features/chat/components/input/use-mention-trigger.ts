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
        y: rect.top - containerRect.top - 120 // Position above the caret with more space
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
    if (now - insertCooldownRef.current < 200) {
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

    // Get the full text content of the editor, not just the current text node
    const fullText = editorRef.current.textContent || ''
    
    // Calculate the global offset within the entire editor
    let globalOffset = offset
    let currentNode = textNode
    
    // Walk backwards through text nodes to calculate global offset
    while (currentNode.previousSibling) {
      currentNode = currentNode.previousSibling
      if (currentNode.nodeType === Node.TEXT_NODE) {
        globalOffset += (currentNode.textContent || '').length
      }
    }
    
    const beforeCaret = fullText.substring(0, globalOffset)
    
    // Look for @ symbol followed by optional search text
    const mentionMatch = beforeCaret.match(/@([^@\s]*)$/)
    
    if (mentionMatch) {
      const searchQuery = mentionMatch[1]
      const mentionStart = globalOffset - mentionMatch[0].length
      
      // Only trigger if this is a new mention or the search query changed
      // Also add a minimum delay between state changes
      if (mentionStartRef.current !== mentionStart || state.searchQuery !== searchQuery) {
        mentionStartRef.current = mentionStart
        const position = getCaretPosition()
        
        setState(prev => ({
          ...prev,
          isActive: true,
          searchQuery,
          position,
          selectedIndex: 0
        }))
        
        onTriggerChange?.(true, searchQuery)
      }
    } else {
      // No mention trigger found, close the menu
      // Add a small delay before closing to prevent flicker
      if (state.isActive) {
        setTimeout(() => {
          // Double-check we still want to close
          const currentSelection = window.getSelection()
          if (!currentSelection?.rangeCount) return
          
          const currentRange = currentSelection.getRangeAt(0)
          const currentTextNode = currentRange.startContainer
          
          if (currentTextNode.nodeType === Node.TEXT_NODE) {
            const currentText = currentTextNode.textContent || ''
            const currentOffset = currentRange.startOffset
            const currentBeforeCaret = currentText.substring(0, currentOffset)
            
            // Only close if we still don't have a mention
            if (!/@([^@\s]*)$/.test(currentBeforeCaret)) {
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
        }, 50)
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

    // Get current selection
    const selection = window.getSelection()
    if (!selection?.rangeCount) return

    const range = selection.getRangeAt(0)
    const startContainer = range.startContainer
    
    // If we're not in a text node, find the nearest text node
    let textNode = startContainer
    if (textNode.nodeType !== Node.TEXT_NODE) {
      // Create a text node if we're in an element
      if (textNode.nodeType === Node.ELEMENT_NODE) {
        const newTextNode = document.createTextNode('')
        textNode.appendChild(newTextNode)
        textNode = newTextNode
      } else {
        return
      }
    }

    const text = textNode.textContent || ''
    const caretPos = range.startOffset

    // Find the @ pattern before caret
    const beforeCaret = text.substring(0, caretPos)
    const mentionMatch = beforeCaret.match(/@([^@\s]*)$/)
    
    if (!mentionMatch) return

    const mentionStart = caretPos - mentionMatch[0].length
    const beforeMention = text.substring(0, mentionStart)
    const afterCaret = text.substring(caretPos)
    
    // Create the new text with mention and space
    const newText = beforeMention + mentionText + ' ' + afterCaret
    const newCaretPos = mentionStart + mentionText.length + 1

    // Update the text content
    textNode.textContent = newText

    // Set the new caret position
    try {
      const newRange = document.createRange()
      newRange.setStart(textNode, newCaretPos)
      newRange.collapse(true)
      selection.removeAllRanges()
      selection.addRange(newRange)
    } catch (error) {
      // Fallback: position at the end of the text
      const fallbackRange = document.createRange()
      fallbackRange.setStart(textNode, textNode.textContent.length)
      fallbackRange.collapse(true)
      selection.removeAllRanges()
      selection.addRange(fallbackRange)
    }

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