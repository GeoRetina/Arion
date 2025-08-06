import React, { memo, type ComponentProps, useState } from 'react'
import ReactMarkdown, { type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { Copy, Check } from 'lucide-react'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css' // You can choose a different style

// For the `code` component, we need a more specific props type
interface CodeProps extends React.HTMLAttributes<HTMLElement>, ExtraProps {
  inline?: boolean
  children?: React.ReactNode // Ensure children is ReactNode
  className?: string
}

// Define a type for our custom components, aligning with react-markdown's expected structure
import type { Components } from 'react-markdown'

type CustomComponents = Partial<Components> & {
  code?: React.ComponentType<CodeProps>
  pre?: React.ComponentType<ComponentProps<'pre'> & ExtraProps>
  // Add other specific overrides if necessary
}

// Utility function to copy text to clipboard
const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (error) {
    return false
  }
}

// Adjusted CopyButton for code blocks
const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const success = await copyToClipboard(text)
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded-md text-gray-400 hover:text-gray-200 hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 transition-colors"
      aria-label={copied ? 'Copied!' : 'Copy to clipboard'}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
    >
      {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
    </button>
  )
}

// Exportable copy message button component
export const CopyMessageButton = ({ content }: { content: string }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const success = await copyToClipboard(content)
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000) // Reset after 2 seconds
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

// Custom paragraph renderer for Markdown to prevent p > div issues
const MarkdownParagraphWrapper = (props: ComponentProps<'p'> & ExtraProps) => {
  const { node, children, ...rest } = props // Destructure node and children

  // Heuristic: if the paragraph node contains children that are typically block-level,
  // or if rehype-raw might have inserted a div, render a div instead of a p.
  // This helps prevent invalid HTML like <p><div>...</div></p>.
  const hasBlockChild = node?.children?.some(
    (childNode) =>
      childNode.type === 'element' &&
      (childNode.tagName === 'pre' || // Code blocks
        childNode.tagName === 'table' || // Tables
        childNode.tagName === 'div' || // Explicit divs from rehype-raw or plugins
        // Also consider images or custom components that might render as block
        (childNode.tagName === 'img' && node.children.length === 1) ||
        (childNode.tagName === 'component' && node.children.length === 1))
  )

  // These classes were identified from the error log as being applied to the inner <p>
  // and are also used by the original 'p' component in MarkdownBlock
  const paragraphClasses = 'mt-4 mb-4'

  if (hasBlockChild) {
    // If children are block-level, render a div with the same styling
    return (
      <div className={paragraphClasses} {...rest}>
        {children}
      </div>
    )
  }
  // Otherwise, render a standard p tag
  return (
    <p className={paragraphClasses} {...rest}>
      {children}
    </p>
  )
}

const MarkdownBlock = memo(
  ({ content, isAssistant }: { content: string; isAssistant: boolean }) => {
    const components: CustomComponents = {
      p: MarkdownParagraphWrapper, // Use the new wrapper here
      h1: (props) => {
        const { node, ...rest } = props
        return <h1 className="mt-6 mb-4 text-2xl font-bold" {...rest} />
      },
      h2: (props) => {
        const { node, ...rest } = props
        return <h2 className="mt-6 mb-4 text-xl font-bold" {...rest} />
      },
      h3: (props) => {
        const { node, ...rest } = props
        return <h3 className="mt-6 mb-4 text-lg font-bold" {...rest} />
      },
      h4: (props) => {
        const { node, ...rest } = props
        return <h4 className="mt-6 mb-4 font-bold" {...rest} />
      },
      h5: (props) => {
        const { node, ...rest } = props
        return <h5 className="mt-6 mb-4 font-bold" {...rest} />
      },
      h6: (props) => {
        const { node, ...rest } = props
        return <h6 className="mt-6 mb-4 font-bold" {...rest} />
      },
      ul: (props) => {
        const { node, ...rest } = props
        return <ul className="mt-4 mb-4" {...rest} />
      },
      ol: (props) => {
        const { node, ...rest } = props
        return <ol className="mt-4 mb-4" {...rest} />
      },
      li: (props) => {
        const { node, ...rest } = props
        return <li className="my-1" {...rest} />
      },
      blockquote: (props) => {
        const { node, ...rest } = props
        return <blockquote className="mt-4 mb-4" {...rest} />
      },
      table: (props) => {
        const { node, ...rest } = props
        // Minimalist table wrapper with subtle styling
        return (
          <div className="my-6 w-full overflow-x-auto rounded-md border-0">
            <table className="w-full border-separate border-spacing-0" {...rest} />
          </div>
        )
      },
      thead: (props) => {
        const { node, ...rest } = props
        return <thead {...rest} />
      },
      tbody: (props) => {
        const { node, ...rest } = props
        return <tbody {...rest} />
      },
      tr: (props) => {
        const { node, ...rest } = props
        return (
          <tr 
            className="group transition-colors duration-150 hover:bg-muted/20 border-b border-border/30 last:border-b-0" 
            {...rest} 
          />
        )
      },
      th: (props) => {
        const { node, ...rest } = props
        return (
          <th
            scope="col"
            className="px-6 py-3 text-left text-sm font-semibold tracking-wide text-muted-foreground/80 bg-muted/20 first:rounded-tl-md last:rounded-tr-md border-b border-border/40"
            {...rest}
          />
        )
      },
      td: (props) => {
        const { node, ...rest } = props
        return (
          <td 
            className="px-6 py-3 text-sm text-foreground/90 group-hover:text-foreground transition-colors duration-150" 
            {...rest} 
          />
        )
      },
      // MODIFIED 'pre' RENDERER
      pre: (props) => {
        const { node, children, ...restPre } = props // children here is the <code> element
        let language = 'code' // Default language name
        let codeContentForCopy = ''

        if (React.isValidElement(children)) {
          const codeElement = children as React.ReactElement<CodeProps>
          if (codeElement.props) {
            const codeProps = codeElement.props
            const classFromCode = codeProps.className || ''
            const match = /language-(\w+)/.exec(classFromCode)
            if (match && match[1]) {
              language = match[1]
            }

            const rawCodeChildren = codeProps.children
            if (typeof rawCodeChildren === 'string') {
              codeContentForCopy = rawCodeChildren
            } else if (Array.isArray(rawCodeChildren)) {
              codeContentForCopy = rawCodeChildren
                .map((c) => (typeof c === 'string' ? c : ''))
                .join('')
            }
          }
        }

        return (
          <div className="my-4 w-full min-w-80 rounded-lg overflow-hidden bg-gray-800 shadow-md text-sm border border-gray-700">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-700 border-b border-gray-600">
              <span className="font-mono text-xs text-sky-400 lowercase">{language}</span>
              <CopyButton text={codeContentForCopy} />
            </div>
            <pre
              className="!m-0 !p-0 !border-none !rounded-none !bg-transparent overflow-x-auto"
              {...restPre}
            >
              {children}
            </pre>
          </div>
        )
      },
      // MODIFIED 'code' RENDERER
      code: ({ node, inline, className, children: codeChildrenProp, ...restCode }: CodeProps) => {
        const rawCodeString = Array.isArray(codeChildrenProp)
          ? codeChildrenProp
              .map((child) =>
                typeof child === 'string' || typeof child === 'number' ? String(child) : ''
              )
              .join('')
          : String(codeChildrenProp || '')

        let renderAsInline = inline

        // New Heuristic: If react-markdown parsed it as a block (`inline` is false),
        // but the content is single-line and short, treat it as inline.
        if (!inline) {
          // Only apply heuristic if originally considered a block
          if (!rawCodeString.includes('\n') && rawCodeString.length < 80) {
            renderAsInline = true
          }
        }

        if (renderAsInline) {
          let highlightedInlineHtml = ''
          try {
            highlightedInlineHtml = hljs.highlightAuto(rawCodeString).value
          } catch (e) {
            highlightedInlineHtml = rawCodeString.replace(/</g, '&lt;').replace(/>/g, '&gt;')
          }

          // Specific and consistent classes for all inline code rendering
          const currentInlineCodeClasses = `
            not-prose
            px-1.5 py-0.5
            font-mono text-xs
            rounded-sm
            overflow-hidden 
            text-foreground/90 
          `
            .replace(/\s+/g, ' ')
            .trim()

          return (
            <code
              className={currentInlineCodeClasses}
              {...restCode}
              dangerouslySetInnerHTML={{ __html: highlightedInlineHtml }}
            />
          )
        }

        // Block code rendering (original logic for actual block code)
        const match = /language-(\w+)/.exec(className || '')
        const language = match ? match[1] : undefined
        let highlightedBlockHtml = ''
        const langClass = language ? `language-${language}` : 'language-plaintext'

        try {
          if (language && hljs.getLanguage(language)) {
            highlightedBlockHtml = hljs.highlight(rawCodeString, {
              language,
              ignoreIllegals: true
            }).value
          } else {
            const autoResult = hljs.highlightAuto(rawCodeString)
            highlightedBlockHtml = autoResult.value
          }
        } catch (e) {
          highlightedBlockHtml = rawCodeString.replace(/</g, '&lt;').replace(/>/g, '&gt;')
        }

        return (
          <code
            // className for block code includes the language, original className is important here
            className={`hljs ${langClass} block !bg-transparent text-current !p-4 whitespace-pre overflow-x-auto ${className || ''}`
              .replace(/language-plaintext\s?/g, '') // Avoid duplicate plaintext if auto-detected
              .replace(/\s+/g, ' ')
              .trim()}
            {...restCode}
            dangerouslySetInnerHTML={{ __html: highlightedBlockHtml }}
          />
        )
      },
      a: (props) => {
        const { node, ...rest } = props
        return <a className="text-primary underline-offset-4 hover:underline" {...rest} />
      },
      img: (props) => {
        const { node, ...rest } = props
        return <img className="my-4 rounded-md shadow-md" {...rest} />
      },
      hr: (props) => {
        const { node, ...rest } = props
        return <hr className="my-4" {...rest} />
      }
    }

    return (
      <div
        className={`
          prose prose-md dark:prose-invert max-w-none border-none
          leading-relaxed break-words whitespace-normal overflow-wrap-anywhere
          ${isAssistant ? 'text-foreground/90 dark:text-foreground' : 'text-foreground'}
        `}
      >
        <ReactMarkdown
          remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
          rehypePlugins={[rehypeRaw]}
          components={components}
        >
          {content}
        </ReactMarkdown>
      </div>
    )
  },
  (prevProps, nextProps) => {
    if (prevProps.content !== nextProps.content) return false
    return true
  }
)

MarkdownBlock.displayName = 'MarkdownBlock'

export const MemoizedMarkdown = memo(
  ({ content, isAssistant = false }: { content: string; id: string; isAssistant?: boolean }) => {
    return <MarkdownBlock content={content} isAssistant={isAssistant} />
  }
)

MemoizedMarkdown.displayName = 'Markdown'
