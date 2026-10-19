import { expect, it, vi } from 'vitest'
import { defaults } from '../src/shared.ts'

it('保存队列保留每份表单的版本号，拒绝并发旧版本而不覆盖配置', async () => {
  vi.resetModules()
  const { settings } = await import('../src/client/settings.ts')
  let revision = 0
  const calls: any[] = []
  const fetcher = vi.fn(async (_url: string, options: any) => {
    if (options?.body) {
      const body = JSON.parse(options.body); calls.push(body)
      if (body.revision !== revision) return { ok: false, json: async () => ({ error: 'conflict' }) }
      revision++
    }
    return { ok: true, json: async () => ({ ...defaults, configured: true, writable: true, revision }) }
  })
  vi.stubGlobal('fetch', fetcher)
  try {
    await settings.refresh()
    const first = settings.save({ ...defaults, model: 'first-model' }, 0)
    const manual = settings.save({ ...defaults, model: 'another-model' }, 0)
    await first
    await expect(manual).rejects.toThrow('conflict')
    expect(calls[0]).toEqual({ preferences: { ...defaults, model: 'first-model' }, revision: 0 })
    expect(calls[0]).not.toHaveProperty('apiKey'); expect(calls[0]).not.toHaveProperty('updateDownload')
    expect(calls[1].revision).toBe(0)
    await settings.save({ ...defaults, model: 'another-model' }, 1)
    expect(calls[2].revision).toBe(1); expect(calls[2].preferences.model).toBe('another-model')
  } finally { vi.unstubAllGlobals() }
})

it('迟到的刷新不能覆盖已保存的新快照', async () => {
  vi.resetModules()
  const { settings } = await import('../src/client/settings.ts')
  const stale = Promise.withResolvers<any>()
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => options?.method === 'POST'
    ? { ok: true, json: async () => ({ ...defaults, model: 'saved-model', configured: true, writable: true, revision: 1 }) }
    : stale.promise))
  try {
    const refresh = settings.refresh()
    await settings.save({ ...defaults, model: 'saved-model' }, 0)
    stale.resolve({ ok: true, json: async () => ({ ...defaults, configured: true, writable: true, revision: 0 }) })
    await refresh
    expect(settings.getSnapshot()?.revision).toBe(1)
    expect(settings.getSnapshot()?.model).toBe('saved-model')
  } finally { vi.unstubAllGlobals() }
})
