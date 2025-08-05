import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle, Loader2, Database, Shield, TestTube } from 'lucide-react'
import { PostgreSQLConfig, PostgreSQLConnectionResult } from '../../../shared/ipc-types'

interface PostgreSQLConfigDialogProps {
  isOpen: boolean
  onClose: () => void
  onSave: (config: PostgreSQLConfig) => void
  onTest: (config: PostgreSQLConfig) => Promise<PostgreSQLConnectionResult>
  initialConfig?: PostgreSQLConfig
  title?: string
}

export const PostgreSQLConfigDialog: React.FC<PostgreSQLConfigDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  onTest,
  initialConfig,
  title = 'PostgreSQL Configuration'
}) => {
  const [config, setConfig] = useState<PostgreSQLConfig>(
    initialConfig || {
      host: 'localhost',
      port: 5432,
      database: '',
      username: '',
      password: '',
      ssl: false
    }
  )

  const [testResult, setTestResult] = useState<PostgreSQLConnectionResult | null>(null)
  const [isTestingConnection, setIsTestingConnection] = useState(false)

  const handleInputChange = (field: keyof PostgreSQLConfig, value: string | number | boolean) => {
    setConfig((prev) => ({ ...prev, [field]: value }))
    // Clear test result when config changes
    setTestResult(null)
  }

  const handleTestConnection = async () => {
    setIsTestingConnection(true)
    setTestResult(null)

    try {
      const result = await onTest(config)
      setTestResult(result)
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      })
    } finally {
      setIsTestingConnection(false)
    }
  }

  const handleSave = () => {
    if (testResult?.success) {
      onSave(config)
      onClose()
    }
  }

  const isFormValid = config.host && config.database && config.username && config.password

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Connection Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Connection Settings</CardTitle>
              <CardDescription>
                Configure your PostgreSQL database connection parameters
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="host">Host</Label>
                  <Input
                    id="host"
                    value={config.host}
                    onChange={(e) => handleInputChange('host', e.target.value)}
                    placeholder="localhost"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    type="number"
                    value={config.port}
                    onChange={(e) => handleInputChange('port', parseInt(e.target.value) || 5432)}
                    placeholder="5432"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="database">Database</Label>
                <Input
                  id="database"
                  value={config.database}
                  onChange={(e) => handleInputChange('database', e.target.value)}
                  placeholder="Database name"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={config.username}
                    onChange={(e) => handleInputChange('username', e.target.value)}
                    placeholder="Username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={config.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    placeholder="Password"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="ssl"
                  checked={config.ssl}
                  onCheckedChange={(checked) => handleInputChange('ssl', checked)}
                />
                <Label htmlFor="ssl" className="flex items-center gap-1">
                  <Shield className="h-4 w-4" />
                  Enable SSL
                </Label>
              </div>
            </CardContent>
          </Card>

          {/* Test Connection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Connection Test</CardTitle>
              <CardDescription>Test your connection settings before saving</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={handleTestConnection}
                disabled={!isFormValid || isTestingConnection}
                className="w-full"
                variant={testResult?.success ? 'default' : 'outline'}
              >
                {isTestingConnection ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing Connection...
                  </>
                ) : (
                  <>
                    <TestTube className="mr-2 h-4 w-4" />
                    Test Connection
                  </>
                )}
              </Button>

              {testResult && (
                <div
                  className={`p-4 rounded-md border ${
                    testResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {testResult.success ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-500" />
                    )}
                    <span
                      className={`font-medium ${
                        testResult.success ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                    </span>
                  </div>

                  {testResult.success && (
                    <div className="space-y-2 text-sm">
                      {testResult.version && (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">PostgreSQL</Badge>
                          <span className="text-gray-600">{testResult.version}</span>
                        </div>
                      )}
                      {testResult.postgisVersion && (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">PostGIS</Badge>
                          <span className="text-gray-600">{testResult.postgisVersion}</span>
                        </div>
                      )}
                      {!testResult.postgisVersion && (
                        <div className="text-amber-600">⚠️ PostGIS extension not detected</div>
                      )}
                    </div>
                  )}

                  <p
                    className={`text-sm mt-2 ${
                      testResult.success ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {testResult.message}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!testResult?.success}>
              Save Configuration
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default PostgreSQLConfigDialog
