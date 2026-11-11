import { useEffect } from 'react'

interface WakeLockSentinelLike {
  release: () => Promise<void>
  addEventListener?: (type: 'release', cb: () => void) => void
}

interface WakeLockNavigator {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
}

export function useWakeLock(enabled = true): void {
  useEffect(() => {
    const wakeLock = (navigator as Navigator & WakeLockNavigator).wakeLock
    if (!enabled || !wakeLock) return
    let sentinel: WakeLockSentinelLike | null = null
    let disposed = false

    const acquire = async () => {
      if (document.visibilityState !== 'visible' || sentinel) return
      try {
        const s = await wakeLock.request('screen')
        if (disposed) {
          void s.release().catch(() => undefined)
          return
        }
        sentinel = s
        s.addEventListener?.('release', () => {
          if (sentinel === s) sentinel = null
        })
      } catch {
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibility)
      void sentinel?.release().catch(() => undefined)
      sentinel = null
    }
  }, [enabled])
}
