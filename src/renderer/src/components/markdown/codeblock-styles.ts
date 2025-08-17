// Codeblock component styles for markdown rendering
export const codeblockStyles = {
  // Container for the entire code block
  container: "my-4 w-full min-w-80 rounded-lg overflow-hidden shadow-sm border border-border/50" + " " + "bg-[var(--codeblock-background)]",
  
  // Header bar with language label and copy button
  header: "flex items-center justify-between px-4 py-3 border-b border-border/50" + " " + "bg-[var(--codeblock-header-background)]",
  
  // Language label styling
  languageLabel: "font-mono text-xs text-primary lowercase font-medium tracking-wide",
  
  // Pre element (contains the code)
  pre: "!m-0 !p-0 !border-none !rounded-none !bg-transparent overflow-x-auto enhanced-scrollbar",
  
  // Code element for block code
  code: "hljs block !bg-transparent text-current !p-4 whitespace-pre overflow-x-auto leading-relaxed text-sm",
  
  // Inline code styling
  inline: {
    base: "not-prose px-1.5 py-0.5 font-mono text-xs rounded-sm overflow-hidden text-foreground/90 bg-muted/30",
  }
}