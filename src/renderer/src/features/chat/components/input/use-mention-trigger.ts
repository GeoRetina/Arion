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

    const selection = window.getSelection()
    if (!selection?.rangeCount) {
      // No selection, close mention menu
      if (state.isActive) {
        console.log('Mention closed - no selection')
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
        console.log('Mention closed - not in text node')
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
    console.log('Detection check:', { fullText, beforeCaret, globalOffset, isActive: state.isActive })
    
    // Look for @ symbol followed by optional search text
    const mentionMatch = beforeCaret.match(/@([^@\s]*)$/)
    
    if (mentionMatch) {
      const searchQuery = mentionMatch[1]
      const mentionStart = globalOffset - mentionMatch[0].length
      
      // Only trigger if this is a new mention or the search query changed
      if (mentionStartRef.current !== mentionStart || state.searchQuery !== searchQuery) {
        mentionStartRef.current = mentionStart
        const position = getCaretPosition()
        
        console.log('Mention triggered:', { searchQuery, position, beforeCaret })
        
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
      if (state.isActive) {
        console.log('Mention closed - no @ found in:', beforeCaret)
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
    if (!editorRef.current || mentionStartRef.current === -1) return

    const selection = window.getSelection()
    if (!selection?.rangeCount) return

    const range = selection.getRangeAt(0)
    const textNode = range.startContainer

    if (textNode.nodeType !== Node.TEXT_NODE) return

    const text = textNode.textContent || ''
    const offset = range.startOffset
    const beforeCaret = text.substring(0, offset)
    
    // Find the @ symbol and replace from there to the current caret position
    const mentionMatch = beforeCaret.match(/@([^@\s]*)$/)
    if (!mentionMatch) return

    const mentionStart = offset - mentionMatch[0].length
    const newText = text.substring(0, mentionStart) + mentionText + ' ' + text.substring(offset)
    
    // Update the text content
    textNode.textContent = newText
    
    // Set the caret position after the inserted mention
    const newCaretPosition = mentionStart + mentionText.length + 1
    range.setStart(textNode, newCaretPosition)
    range.setEnd(textNode, newCaretPosition)
    selection.removeAllRanges()
    selection.addRange(range)
    
    // Close the mention menu
    mentionStartRef.current = -1
    setState(prev => ({
      ...prev,
      isActive: false,
      searchQuery: '',
      selectedIndex: 0
    }))
    
    onTriggerChange?.(false, '')
    
    // Trigger input event to sync with parent
    if (editorRef.current) {
      const event = new Event('input', { bubbles: true })
      editorRef.current.dispatchEvent(event)
    }
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

  // Listen for both selection changes and input events to detect mention triggers
  useEffect(() => {
    const handleSelectionChange = () => {
      detectMentionTrigger()
    }

    const handleInput = () => {
      detectMentionTrigger()
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    
    if (editorRef.current) {
      editorRef.current.addEventListener('input', handleInput)
    }

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      if (editorRef.current) {
        editorRef.current.removeEventListener('input', handleInput)
      }
    }
  }, [detectMentionTrigger, editorRef])

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