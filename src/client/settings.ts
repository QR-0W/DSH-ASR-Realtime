import { BASE, type SettingsView, type Preferences } from '../shared.ts'
let snapshot: SettingsView | null = null
const listeners = new Set<() => void>()
let writes = Promise.resolve<unknown>(undefined)
function write(body: Record<string, unknown>, revision?: number): Promise<SettingsView> {
  const next = writes.then(() => request({ method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, revision: revision ?? snapshot?.revision ?? 0 }),
  }))
  writes = next.catch(() => undefined)
  return next
}
function publish(value: SettingsView): void {
  if (snapshot && value.revision < snapshot.revision) return
  snapshot = value; for (const fn of listeners) fn()
}
async function request(options?: RequestInit): Promise<SettingsView> {
  const response = await fetch(`${BASE}/config`, { credentials: 'same-origin', ...options })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? '无法读取语音设置')
  publish(result)
  return result
}
export const settings = {
  getSnapshot: () => snapshot,
  subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
  refresh: () => request(),
  reset: () => write({ reset: true }),
  save: (preferences: Preferences, revision: number, apiKey?: string) => write({ preferences, ...(apiKey ? { apiKey } : {}) }, revision),
}
