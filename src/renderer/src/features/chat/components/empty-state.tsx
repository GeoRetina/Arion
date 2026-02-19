import arionLogo from '@/assets/icon.png'

export const EmptyState = (): React.JSX.Element => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)] md:min-h-[calc(100vh-150px)]">
      <img src={arionLogo} alt="Arion Assistant" className="w-20 h-20 mb-4" />
      <p className="text-muted-foreground text-center max-w-sm mb-4">
        Your AI-powered geospatial analysis awaits.
      </p>
    </div>
  )
}
