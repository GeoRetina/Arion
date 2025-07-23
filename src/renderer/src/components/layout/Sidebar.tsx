import { Button } from '@/components/ui/button'
import {
  PlusCircle,
  PanelLeftOpen,
  PanelRightOpen,
  Brain,
  History as HistoryIcon,
  Settings as SettingsIcon,
  Server,
  PlugZap,
  Link2,
  Database
} from 'lucide-react'
import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface SidebarProps {
  isExpanded: boolean
  onToggle: () => void
}

export default function Sidebar({ isExpanded, onToggle }: SidebarProps): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const currentPath = location.pathname
  const [appVersion, setAppVersion] = useState<string>('loading...')

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const version = await window.ctg.getAppVersion()
        setAppVersion(version ? `v${version}` : 'N/A')
      } catch (error) {
        console.error('Failed to fetch app version for sidebar:', error)
        setAppVersion('Error')
      }
    }
    fetchVersion()
  }, [])

  const getButtonClasses = (pathPrefix: string): string => {
    const isActive = currentPath.startsWith(pathPrefix)
    return cn(
      `w-full justify-start rounded-md transition-all duration-200 ${
        isExpanded ? 'pl-3 pr-2 py-2' : 'p-2'
      }`,
      isExpanded ? 'text-sm' : 'text-[0px]',
      isActive
        ? 'font-semibold bg-secondary text-accent hover:!bg-primary/20 hover:!text-primary dark:bg-[var(--chart-5)]/10 dark:text-yellow-500 dark:hover:!bg-[var(--chart-5)]/10 dark:hover:!text-yellow-500'
        : 'text-foreground font-normal hover:!bg-[var(--primary)]/10 dark:hover:!bg-white/5'
    )
  }

  const NavButton = ({
    path,
    title,
    icon: Icon
  }: {
    path: string
    title: string
    icon: React.ElementType
  }) => (
    <Button
      variant="ghost"
      className={getButtonClasses(path)}
      title={title}
      onClick={() => navigate(path)}
    >
      <Icon className="h-5 w-5 flex-shrink-0 transition-colors duration-200" />
      {isExpanded && <span className="ml-3 transition-all duration-200">{title}</span>}
    </Button>
  )

  const NavGroup = ({ title, children }: { title?: string; children: React.ReactNode }) => (
    <div className="px-3 py-2">
      {title && isExpanded && (
        <div className="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
          {title}
        </div>
      )}
      <div className="space-y-1">{children}</div>
    </div>
  )

  return (
    <div className="flex flex-col h-full bg-background text-card-foreground border-r border-border/50 shadow-xl">
      {/* Logo and Toggle section */}
      <div className="p-3 flex items-center justify-between">
        {isExpanded ? (
          <div className="w-7"></div>
        ) : (
          <div className="w-7 h-7 rounded-md flex items-center justify-center">
            {/* <span className="font-bold text-primary">A</span> */}
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="h-7 w-7 rounded-md hover:!bg-muted"
          title={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {isExpanded ? (
            <PanelRightOpen className="h-4 w-4" />
          ) : (
            <PanelLeftOpen className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Primary action */}
      <div className="p-3 border-b border-border/20">
        <Button
          variant="ghost"
          className={cn(
            'w-full flex items-center rounded-md',
            isExpanded ? 'justify-start px-3 py-2 text-sm' : 'justify-center p-2'
          )}
          title="New Chat"
          onClick={() => navigate('/chat/new')}
        >
          <span className="flex items-center justify-center rounded-md bg-purple-600 hover:bg-purple-700 flex-shrink-0 p-1.5">
            <PlusCircle className="h-4 w-4 text-white" />
          </span>
          {isExpanded && <span className="ml-2">New Chat</span>}
        </Button>
      </div>

      {/* Main Navigation */}
      <div className="overflow-y-auto flex-grow">
        <NavGroup title="Workspace">
          <NavButton path="/history" title="History" icon={HistoryIcon} />
          <NavButton path="/knowledge-base" title="Knowledge Base" icon={Database} />
        </NavGroup>

        <NavGroup title="Tools">
          <NavButton path="/models" title="Models" icon={Brain} />
          <NavButton path="/mcp-servers" title="MCP Servers" icon={Server} />
          <NavButton path="/plugins" title="Plugins" icon={PlugZap} />
        </NavGroup>

        <NavGroup title="System">
          <NavButton path="/integrations" title="Integrations" icon={Link2} />
        </NavGroup>
      </div>

      {/* Footer / Settings */}
      <div className="p-3 mt-auto border-t border-border/30">
        <NavButton path="/settings" title="Settings" icon={SettingsIcon} />
        {isExpanded && (
          <div className="mt-2 px-2 py-1 text-xs text-muted-foreground/70 flex items-center justify-between">
            <span>{appVersion}</span>
          </div>
        )}
      </div>
    </div>
  )
}
