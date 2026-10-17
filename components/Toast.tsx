type ToastProps = {
  message: string
}

export function Toast({ message }: ToastProps) {
  if (!message) return null

  return (
    <div className="fixed bottom-5.5 left-1/2 z-[80] max-w-[calc(100vw-32px)] -translate-x-1/2 animate-in-200 rounded-full bg-ink-260 px-4.5 py-3 text-center text-sm font-medium text-sand-980 shadow-toast">
      {message}
    </div>
  )
}
