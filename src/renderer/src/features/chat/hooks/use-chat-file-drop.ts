import { useCallback, useEffect, useRef, useState, type DragEventHandler } from 'react'

interface UseChatFileDropOptions {
  disabled?: boolean
  isImporting?: boolean
  onFileDrop: (file: File) => void | Promise<void>
}

interface UseChatFileDropResult {
  isFileDragActive: boolean
  handleFileDragEnter: DragEventHandler<HTMLDivElement>
  handleFileDragOver: DragEventHandler<HTMLDivElement>
  handleFileDragLeave: DragEventHandler<HTMLDivElement>
  handleFileDrop: DragEventHandler<HTMLDivElement>
}

const dataTransferHasFiles = (dataTransfer: DataTransfer | null): boolean => {
  if (!dataTransfer) {
    return false
  }

  if (Array.from(dataTransfer.types).includes('Files')) {
    return true
  }

  return Array.from(dataTransfer.items ?? []).some((item) => item.kind === 'file')
}

export const useChatFileDrop = ({
  disabled = false,
  isImporting = false,
  onFileDrop
}: UseChatFileDropOptions): UseChatFileDropResult => {
  const [isFileDragActive, setIsFileDragActive] = useState(false)
  const fileDragDepthRef = useRef(0)

  const resetFileDragState = useCallback(() => {
    fileDragDepthRef.current = 0
    setIsFileDragActive(false)
  }, [])

  useEffect(() => {
    if (disabled || isImporting) {
      resetFileDragState()
    }
  }, [disabled, isImporting, resetFileDragState])

  const handleFileDragEnter = useCallback<DragEventHandler<HTMLDivElement>>(
    (event) => {
      if (disabled || isImporting || !dataTransferHasFiles(event.dataTransfer)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      fileDragDepthRef.current += 1
      setIsFileDragActive(true)
    },
    [disabled, isImporting]
  )

  const handleFileDragOver = useCallback<DragEventHandler<HTMLDivElement>>(
    (event) => {
      if (disabled || isImporting || !dataTransferHasFiles(event.dataTransfer)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'copy'

      if (!isFileDragActive) {
        setIsFileDragActive(true)
      }
    },
    [disabled, isFileDragActive, isImporting]
  )

  const handleFileDragLeave = useCallback<DragEventHandler<HTMLDivElement>>((event) => {
    if (!dataTransferHasFiles(event.dataTransfer)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    fileDragDepthRef.current = Math.max(fileDragDepthRef.current - 1, 0)

    if (fileDragDepthRef.current === 0) {
      setIsFileDragActive(false)
    }
  }, [])

  const handleFileDrop = useCallback<DragEventHandler<HTMLDivElement>>(
    (event) => {
      if (disabled || isImporting || !dataTransferHasFiles(event.dataTransfer)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const file = event.dataTransfer.files?.[0]
      resetFileDragState()

      if (!file) {
        return
      }

      void onFileDrop(file)
    },
    [disabled, isImporting, onFileDrop, resetFileDragState]
  )

  return {
    isFileDragActive,
    handleFileDragEnter,
    handleFileDragOver,
    handleFileDragLeave,
    handleFileDrop
  }
}
