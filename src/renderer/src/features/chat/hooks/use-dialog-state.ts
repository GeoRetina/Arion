import { useState, useEffect } from 'react'

export const useErrorDialog = (sdkError: Error | null, stableChatIdForUseChat: string | null) => {
  const [isErrorDialogOpen, setIsErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (sdkError && stableChatIdForUseChat) {
      setErrorMessage(
        `An error occurred while communicating with the AI model: ${sdkError.message}\n\nPlease check your model configuration in the 'Models' page, especially the model name, and try again.`
      )
      setIsErrorDialogOpen(true)
    }
  }, [sdkError, stableChatIdForUseChat])

  return {
    isErrorDialogOpen,
    setIsErrorDialogOpen,
    errorMessage
  }
}

export const useDatabaseModal = () => {
  const [isDatabaseModalOpen, setIsDatabaseModalOpen] = useState(false)

  const handleOpenDatabase = () => {
    setIsDatabaseModalOpen(true)
  }

  return {
    isDatabaseModalOpen,
    setIsDatabaseModalOpen,
    handleOpenDatabase
  }
}