import type { ReactElement } from 'react'
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface IntegrationStatusBannerProps {
  success: boolean
  title: string
  message?: string | null
  secondaryMessage?: string | null
}

interface IntegrationDialogFooterProps {
  disableTest?: boolean
  disableSave?: boolean
  isTesting: boolean
  isSaving: boolean
  onCancel: () => void
  onSave: () => void
  onTest: () => void
  saveLabel?: string
  savingLabel?: string
  testLabel?: string
  testingLabel?: string
}

export function IntegrationStatusBanner({
  success,
  title,
  message,
  secondaryMessage
}: IntegrationStatusBannerProps): ReactElement {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-md px-3 py-2.5 text-sm ${
        success
          ? 'bg-green-500/10 text-green-700 dark:text-green-400'
          : 'bg-red-500/10 text-red-700 dark:text-red-400'
      }`}
    >
      {success ? (
        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <div className="min-w-0">
        <span className="font-medium">{title}</span>
        {message && <p className="mt-0.5 text-xs opacity-80">{message}</p>}
        {secondaryMessage && <p className="mt-0.5 text-xs opacity-60">{secondaryMessage}</p>}
      </div>
    </div>
  )
}

export function IntegrationDialogFooter({
  disableTest = false,
  disableSave = false,
  isTesting,
  isSaving,
  onCancel,
  onSave,
  onTest,
  saveLabel = 'Save & Connect',
  savingLabel = 'Saving...',
  testLabel = 'Test',
  testingLabel = 'Testing...'
}: IntegrationDialogFooterProps): ReactElement {
  return (
    <div className="flex items-center justify-between pt-2">
      <Button
        variant="outline"
        size="sm"
        onClick={onTest}
        disabled={disableTest || isTesting || isSaving}
      >
        {isTesting ? (
          <>
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            {testingLabel}
          </>
        ) : (
          testLabel
        )}
      </Button>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSave} disabled={disableSave || isSaving || isTesting}>
          {isSaving ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              {savingLabel}
            </>
          ) : (
            saveLabel
          )}
        </Button>
      </div>
    </div>
  )
}
