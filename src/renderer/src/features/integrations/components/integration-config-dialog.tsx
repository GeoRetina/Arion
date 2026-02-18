import React, { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle, Loader2, PlugZap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { IntegrationHealthCheckResult } from '../../../../../shared/ipc-types'
import type { Integration, IntegrationFieldDefinition } from '../types/integration'

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
        <div key={field.key} className="flex items-start gap-2 pt-2">
          <Checkbox
            id={field.key}
            checked={currentValue === true}
            onCheckedChange={(checked) => updateFieldValue(field, checked === true)}
          />
          <div className="space-y-1">
            <Label htmlFor={field.key}>{field.label}</Label>
            {field.description && (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
          </div>
        </div>
      )
    }

    if (field.type === 'textarea') {
      return (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          <Textarea
            id={field.key}
            value={typeof currentValue === 'string' ? currentValue : ''}
            onChange={(event) => updateFieldValue(field, event.target.value)}
            placeholder={field.placeholder}
            className="min-h-28"
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
      <div key={field.key} className="space-y-2">
        <Label htmlFor={field.key}>
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
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
        />
        {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
      </div>
    )
  }

  const handleTest = async (): Promise<void> => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const result = await onTest(config)
      setTestResult(result)
    } catch (error) {
      setTestResult({
        success: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to test integration',
        checkedAt: new Date().toISOString()
      })
    } finally {
      setIsTesting(false)
    }
  }

  const handleSaveAndConnect = async (): Promise<void> => {
    setIsSaving(true)
    try {
      const result = await onSaveAndConnect(config)
      setTestResult(result)
      if (result.success) {
        onClose()
      }
    } catch (error) {
      setTestResult({
        success: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to save integration config',
        checkedAt: new Date().toISOString()
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlugZap className="h-5 w-5" />
            {integration?.name || 'Integration'} Configuration
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Connection Settings</CardTitle>
              <CardDescription>
                Configure the connection settings and verify connectivity before saving.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {fields.map((field) => renderField(field))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Connection Test</CardTitle>
              <CardDescription>
                Run a live connectivity check with the current settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={handleTest} disabled={!isFormValid || isTesting} className="w-full">
                {isTesting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  'Test Connection'
                )}
              </Button>

              {testResult && (
                <div
                  className={`p-4 rounded-md border ${
                    testResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {testResult.success ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-600" />
                    )}
                    <span
                      className={`font-medium ${
                        testResult.success ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      {testResult.success ? 'Connection successful' : 'Connection failed'}
                    </span>
                  </div>
                  <p
                    className={`text-sm mt-2 ${testResult.success ? 'text-green-700' : 'text-red-700'}`}
                  >
                    {testResult.message}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSaveAndConnect} disabled={!isFormValid || isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save and Connect'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default IntegrationConfigDialog
