import React, { useEffect, useMemo, useState } from 'react'
import { PlugZap } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { IntegrationHealthCheckResult } from '../../../../../shared/ipc-types'
import { IntegrationDialogFooter, IntegrationStatusBanner } from './integration-dialog-shared'
import { buildIntegrationErrorResult, runIntegrationHealthAction } from './integration-dialog-utils'
import type { Integration, IntegrationFieldDefinition } from '../types/connector'

interface IntegrationConfigDialogProps {
  isOpen: boolean
  integration: Integration | null
  fields: IntegrationFieldDefinition[]
  initialConfig?: Record<string, unknown> | null
  onClose: () => void
  onTest: (config: Record<string, unknown>) => Promise<IntegrationHealthCheckResult>
  onSaveAndConnect: (config: Record<string, unknown>) => Promise<IntegrationHealthCheckResult>
}

const hasValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

const normalizeNumber = (value: string): number | undefined => {
  if (value.trim().length === 0) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  return parsed
}

export const IntegrationConfigDialog: React.FC<IntegrationConfigDialogProps> = ({
  isOpen,
  integration,
  fields,
  initialConfig,
  onClose,
  onTest,
  onSaveAndConnect
}) => {
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [testResult, setTestResult] = useState<IntegrationHealthCheckResult | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      return
    }
    setConfig(initialConfig || {})
    setTestResult(null)
  }, [initialConfig, isOpen, integration?.id])

  const isFormValid = useMemo(
    () => fields.every((field) => !field.required || hasValue(config[field.key])),
    [fields, config]
  )

  const updateFieldValue = (field: IntegrationFieldDefinition, value: unknown): void => {
    setConfig((previous) => ({
      ...previous,
      [field.key]: value
    }))
    setTestResult(null)
  }

  const renderField = (field: IntegrationFieldDefinition): React.ReactNode => {
    const currentValue = config[field.key]

    if (field.type === 'boolean') {
      return (
        <div key={field.key} className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor={field.key} className="text-sm">
              {field.label}
            </Label>
            {field.description && (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
          </div>
          <Checkbox
            id={field.key}
            checked={currentValue === true}
            onCheckedChange={(checked) => updateFieldValue(field, checked === true)}
          />
        </div>
      )
    }

    if (field.type === 'textarea') {
      return (
        <div key={field.key} className="space-y-1.5">
          <Label htmlFor={field.key} className="text-xs text-muted-foreground">
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </Label>
          <Textarea
            id={field.key}
            value={typeof currentValue === 'string' ? currentValue : ''}
            onChange={(event) => updateFieldValue(field, event.target.value)}
            placeholder={field.placeholder}
            className="min-h-24 text-sm"
          />
          {field.description && (
            <p className="text-xs text-muted-foreground">{field.description}</p>
          )}
        </div>
      )
    }

    const inputType =
      field.type === 'number' ? 'number' : field.type === 'password' ? 'password' : 'text'

    return (
      <div key={field.key} className="space-y-1.5">
        <Label htmlFor={field.key} className="text-xs text-muted-foreground">
          {field.label}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
        <Input
          id={field.key}
          type={inputType}
          inputMode={field.type === 'number' ? 'numeric' : undefined}
          value={
            typeof currentValue === 'number'
              ? String(currentValue)
              : typeof currentValue === 'string'
                ? currentValue
                : ''
          }
          onChange={(event) => {
            if (field.type === 'number') {
              updateFieldValue(field, normalizeNumber(event.target.value))
            } else {
              updateFieldValue(field, event.target.value)
            }
          }}
          placeholder={field.placeholder}
          className="text-sm"
        />
        {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
      </div>
    )
  }

  const handleTest = async (): Promise<void> => {
    await runIntegrationHealthAction({
      action: () => onTest(config),
      setPending: setIsTesting,
      onStart: () => setTestResult(null),
      onResult: setTestResult,
      onError: (error) =>
        setTestResult(buildIntegrationErrorResult(error, 'Failed to test integration'))
    })
  }

  const handleSaveAndConnect = async (): Promise<void> => {
    await runIntegrationHealthAction({
      action: () => onSaveAndConnect(config),
      setPending: setIsSaving,
      onResult: setTestResult,
      onSuccess: () => onClose(),
      onError: (error) =>
        setTestResult(buildIntegrationErrorResult(error, 'Failed to save integration config'))
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlugZap className="h-5 w-5" />
            {integration?.name || 'Integration'} Configuration
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Fields */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Connection</Label>
            <div className="space-y-3">{fields.map((field) => renderField(field))}</div>
          </div>

          {/* Test result */}
          {testResult && (
            <>
              <div className="border-t border-border/40" />

              <IntegrationStatusBanner
                success={testResult.success}
                title={testResult.success ? 'Connection successful' : 'Connection failed'}
                message={testResult.message ?? null}
              />
            </>
          )}
        </div>

        <IntegrationDialogFooter
          disableSave={!isFormValid}
          disableTest={!isFormValid}
          isSaving={isSaving}
          isTesting={isTesting}
          onCancel={onClose}
          onSave={handleSaveAndConnect}
          onTest={handleTest}
        />
      </DialogContent>
    </Dialog>
  )
}

export default IntegrationConfigDialog
