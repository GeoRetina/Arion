import { Button } from '@/components/ui/button'
import {
  PlusCircle,
  PanelLeftOpen,
  PanelRightOpen,
  Brain,
  History as HistoryIcon,
  Settings as SettingsIcon,
  Server,
  Link2,
  Database,
  Bot
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
      } catch {
        setAppVersion('Error')
      }
    }
    fetchVersion()
  }, [])

  const getButtonClasses = (pathPrefix: string): string => {
    const isActive = currentPath.startsWith(pathPrefix)
    return cn(
      `w-full justify-start rounded-md transition-all duration-200 ${
        isExpanded ? 'pl-3 pr-2 py-2.5' : 'p-2'
      }`,
      isExpanded ? 'text-base' : 'text-[0px]',
      isActive
        ? 'font-semibold bg-primary/15 text-primary hover:bg-primary/20'
        : 'text-foreground/80 font-medium hover:bg-muted hover:text-foreground'
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
      <Icon className="h-5 w-5 shrink-0 transition-colors duration-200" />
      {isExpanded && <span className="ml-3 transition-all duration-200">{title}</span>}
    </Button>
  )

  const NavGroup = ({ title, children }: { title?: string; children: React.ReactNode }) => (
    <div className="px-3 py-2">
      {title && isExpanded && (
        <div className="mb-2 px-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground/80">
          {title}
        </div>
      )}
      <div className="space-y-2">{children}</div>
    </div>
  )

  return (
    <div className="flex flex-col h-full bg-background text-card-foreground border-r border-border/40">
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
          className="h-7 w-7 rounded-md hover:bg-muted!"
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
      <div className="px-3 pb-3 border-b border-border/20">
        <Button
          variant="custom"
          className={cn(
            'w-full flex items-center rounded-lg border border-border/60 bg-muted/50 hover:bg-muted hover:border-border transition-all duration-200',
            isExpanded ? 'justify-start px-3 py-2.5' : 'justify-center p-2.5'
          )}
          title="New Chat"
          onClick={() => navigate('/chat/new')}
        >
          <PlusCircle className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
          {isExpanded && (
            <span className="ml-2.5 text-sm font-medium text-foreground/90">New Chat</span>
          )}
        </Button>
      </div>

      {/* Main Navigation */}
      <div className="overflow-y-auto grow">
        <NavGroup title="Workspace">
          <NavButton path="/history" title="History" icon={HistoryIcon} />
          <NavButton path="/knowledge-base" title="Knowledge Base" icon={Database} />
        </NavGroup>

        <NavGroup title="System">
          <NavButton path="/models" title="Models" icon={Brain} />
          <NavButton path="/agents" title="Agents" icon={Bot} />
          <NavButton path="/mcp-servers" title="MCP Servers" icon={Server} />
          <NavButton path="/integrations" title="Connectors" icon={Link2} />
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
