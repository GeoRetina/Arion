import React, { useState } from 'react'
import Sidebar from './Sidebar'
import { Toaster } from '@/components/ui/sonner'

interface MainLayoutProps {
  children: React.ReactNode // To accept the main content, e.g., ChatInterface
}

export default function MainLayout({ children }: MainLayoutProps): React.JSX.Element {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true)

  const toggleSidebar = (): void => {
    setIsSidebarExpanded((prev) => !prev)
  }

  return (
    <div className="flex h-screen w-full bg-background text-foreground antialiased">
      {/* Sidebar with conditional width based on expanded state */}
      <aside
        className={`relative z-10 shadow-lg transition-all duration-300 ease-in-out flex-shrink-0 ${isSidebarExpanded ? 'w-52' : 'w-16'}`}
      >
        <Sidebar isExpanded={isSidebarExpanded} onToggle={toggleSidebar} />
      </aside>

      {/* Main content with gradient background */}
      <main className="flex-1 flex flex-col overflow-hidden bg-gradient-to-b from-card/50 to-background">
        {/* Children will be the ChatInterface, which should handle its own scrolling and height */}
        {children}
      </main>
      
      {/* Toast notifications */}
      <Toaster richColors position="bottom-right" />
    </div>
  )
}
