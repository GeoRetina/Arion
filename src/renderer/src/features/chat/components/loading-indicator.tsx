export const LoadingIndicator = () => {
  return (
    <div className="flex w-full justify-start pb-5">
      <div className="flex items-center space-x-2 px-4 py-3 rounded-2xl text-foreground">
        <div className="flex space-x-1">
          <div className="h-2 w-2 rounded-full bg-chart-1 animate-bounce [animation-delay:-0.3s]"></div>
          <div className="h-2 w-2 rounded-full bg-chart-1 animate-bounce [animation-delay:-0.15s]"></div>
          <div className="h-2 w-2 rounded-full bg-chart-1 animate-bounce"></div>
        </div>
      </div>
    </div>
  )
}
