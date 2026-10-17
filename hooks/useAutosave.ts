'use client'

import { useEffect, useRef, useState } from 'react'

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error'

type SaveFn<T> = (value: T, options: { keepalive: boolean }) => Promise<void>

const DEBOUNCE_MS = 700
const RETRY_MS = 4000

/**
 * Debounced, serialized saving of a whole document. Only the latest value is ever sent, one
 * request at a time (so an older save can't land after a newer one). Failed saves retry on
 * their own, and anything still unsaved is flushed when the component unmounts or the page is
 * hidden (e.g. the phone is locked mid-workout).
 */
export function useAutosave<T>(save: SaveFn<T>) {
  const [status, setStatus] = useState<SaveStatus>('saved')
  const saveRef = useRef(save)
  const unsaved = useRef<{ value: T } | undefined>(undefined)
  const inFlight = useRef<Promise<void> | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mounted = useRef(false)

  useEffect(() => {
    saveRef.current = save
  })

  // One stable function, so it can be used from timers, listeners and the unmount cleanup.
  const [run] = useState(() => {
    const runSave = async (): Promise<void> => {
      clearTimeout(timer.current)
      // A save is already running; it picks up `unsaved` when it finishes.
      if (inFlight.current || !unsaved.current) return

      const { value } = unsaved.current
      unsaved.current = undefined
      setStatus('saving')

      try {
        inFlight.current = saveRef.current(value, { keepalive: false })
        await inFlight.current
        inFlight.current = undefined

        if (unsaved.current) return runSave()
        setStatus('saved')
      } catch {
        inFlight.current = undefined
        unsaved.current ??= { value }
        setStatus('error')
        timer.current = setTimeout(runSave, RETRY_MS)
      }
    }
    return runSave
  })

  // Sends whatever is unsaved right away, with keepalive so it survives the page going away.
  const [flush] = useState(() => () => {
    clearTimeout(timer.current)
    const pending = unsaved.current
    if (!pending) return

    unsaved.current = undefined
    const send = () =>
      saveRef.current(pending.value, { keepalive: true }).then(
        () => {
          if (!unsaved.current) setStatus('saved')
        },
        () => {
          // Still on screen (the tab was only hidden): put it back so the normal retry picks it up.
          if (!mounted.current) return
          unsaved.current ??= pending
          setStatus('error')
          timer.current = setTimeout(run, RETRY_MS)
        },
      )
    if (inFlight.current) inFlight.current.then(send, send)
    else send()
  })

  useEffect(() => {
    mounted.current = true
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)

    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      mounted.current = false
      flush()
    }
  }, [flush])

  const schedule = (value: T) => {
    unsaved.current = { value }
    setStatus('pending')
    clearTimeout(timer.current)
    timer.current = setTimeout(run, DEBOUNCE_MS)
  }

  return { status, schedule, retry: run }
}
