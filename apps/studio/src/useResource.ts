import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from './api'

export interface Resource<T> {
  data: T | undefined
  status: 'IDLE' | 'LOADING' | 'READY' | 'ERROR'
  error: string
  reload: () => void
  /** Optimistic local override; the next reload replaces it. */
  set: (value: T) => void
}

/**
 * Aborting fetch hook shared by the new surfaces so loading, error, and reload behave
 * identically everywhere (E20). Pass `path: undefined` to hold the request.
 */
export function useResource<T>(path: string | undefined, deps: unknown[] = []): Resource<T> {
  const [data, setData] = useState<T>()
  const [status, setStatus] = useState<Resource<T>['status']>(path ? 'LOADING' : 'IDLE')
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)
  const active = useRef(true)

  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  useEffect(() => {
    if (!path) {
      setStatus('IDLE')
      return
    }
    const controller = new AbortController()
    setStatus('LOADING')
    setError('')
    apiFetch<T>(path, { signal: controller.signal })
      .then((value) => {
        if (controller.signal.aborted) return
        setData(value)
        setStatus('READY')
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return
        setError(caught instanceof Error ? caught.message : 'Request failed')
        setStatus('ERROR')
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps])

  const reload = useCallback(() => setNonce((value) => value + 1), [])
  const set = useCallback((value: T) => setData(value), [])

  return { data, status, error, reload, set }
}
