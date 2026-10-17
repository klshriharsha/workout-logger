'use client'

import { useEffect, useRef, useState } from 'react'

const TOAST_DURATION_MS = 2600

export function useToast() {
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const flash = (message: string) => {
    setToast(message)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), TOAST_DURATION_MS)
  }

  return { toast, flash }
}
