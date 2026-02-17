import { useState } from 'react'
import { Streamdown } from 'streamdown'
import { Copy, Check } from 'lucide-react'

// Utility function to copy text to clipboard
const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// Exportable copy message button component
export const CopyMessageButton = ({ content }: { content: string }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const success = await copyToClipboard(content)
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center justify-center p-1.5 rounded-md opacity-0 group-hover:opacity-50 hover:opacity-90 transition-opacity focus:outline-none"
      aria-label={copied ? 'Message copied!' : 'Copy message'}
      title={copied ? 'Message copied!' : 'Copy message'}
    >
      {copied ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <Copy className="h-4 w-4 text-muted-foreground hover:text-foreground" />
      )}
    </button>
  )
}

interface MarkdownRendererProps {
  content: string
  variant?: 'default' | 'reasoning'
}

// Streamdown handles memoization internally
export const MarkdownRenderer = ({ content, variant = 'default' }: MarkdownRendererProps) => {
  const textSizeClass =
    variant === 'reasoning'
      ? 'text-xs [&_p]:text-xs [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-sm'
      : ''

  return (
    <div
      className={`
        max-w-none leading-relaxed wrap-break-word
        text-foreground
        ${textSizeClass}
      `}
    >
      <Streamdown shikiTheme={['github-light', 'github-dark']}>{content}</Streamdown>
    </div>
  )
}
