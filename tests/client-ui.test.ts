import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import { defaults } from '../src/shared.ts'

const mocks = vi.hoisted(() => ({
  snapshot: null as any, listeners: new Set<() => void>(), final: null as any,
  save: vi.fn(), start: vi.fn(), finish: vi.fn(), refresh: vi.fn(),
}))
vi.mock('../src/client/settings.ts', () => ({ settings: {
  getSnapshot: () => mocks.snapshot,
  subscribe: (fn: () => void) => { mocks.listeners.add(fn); return () => mocks.listeners.delete(fn) },
  refresh: mocks.refresh, save: mocks.save,
} }))
vi.mock('../src/client/session.ts', () => ({ VoiceSession: class {
  constructor(final: (text: string) => void) { mocks.final = final }
  getSnapshot = () => idle
  subscribe = () => () => {}
  active = () => false
  busy = () => false
  start = mocks.start
  finish = mocks.finish
  cancel = vi.fn()
} }))
const idle = { phase: 'idle', preview: '', message: '' }
let renderer: ReactTestRenderer | undefined
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); mocks.listeners.clear(); vi.clearAllMocks() })

async function components() {
  mocks.snapshot = { ...defaults, revision: 0, configured: true, writable: true }
  mocks.refresh.mockResolvedValue(mocks.snapshot)
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('document', { createElement: () => ({ remove: vi.fn() }), head: { append: vi.fn() }, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  const slots = new Map<string, any>()
  const { apply } = await import('../src/client/index.tsx')
  const localeSnapshot = { active: 'zh', locales: [], revision: 0 }
  const locale = { register: () => () => {}, getSnapshot: () => localeSnapshot, subscribe: () => () => {}, bind: () => (key: string) => key }
  apply({ locale, effect: (fn: any) => fn(), slots: { inject: (_name: string, fn: any) => fn(), register: (options: any, render: any) => slots.set(options.name, render) } } as any)
  return slots
}
const button = (label: string) => renderer!.root.findAllByType('button').find(node => node.children.join('') === label)!

it('未追加文字在关闭提示和切换会话后可恢复，并阻止下一次录音覆盖', async () => {
  const slots = await components()
  const props = { sessionId: 'pending-test', useInput: () => ({ draft: '', draftRev: 0, phase: 'plain', occurrences: [] }), inputActions: { insertText: () => false, submit: vi.fn() } }
  await act(async () => { renderer = create(createElement(slots.get('conversation.input.right'), props)) })
  act(() => mocks.final('不能丢失的文字', { finalized: true, interrupted: false }))
  act(() => button('关闭').props.onClick())
  expect(button('恢复识别文字')).toBeDefined()
  act(() => renderer!.root.findByProps({ 'aria-label': '开始语音输入' }).props.onClick())
  expect(mocks.start).not.toHaveBeenCalled()
  expect(renderer!.root.findAllByType('p').some(node => node.children.includes('不能丢失的文字'))).toBe(true)
  act(() => renderer!.unmount())
  await act(async () => { renderer = create(createElement(slots.get('conversation.input.right'), { ...props, sessionId: 'other-test' })) })
  expect(renderer!.root.findAllByType('button').some(node => node.children.includes('恢复识别文字'))).toBe(false)
  act(() => renderer!.unmount())
  await act(async () => { renderer = create(createElement(slots.get('conversation.input.right'), props)) })
  act(() => button('恢复识别文字').props.onClick())
  expect(renderer!.root.findAllByType('p').some(node => node.children.includes('不能丢失的文字'))).toBe(true)
  act(() => button('丢弃识别文字').props.onClick())
  act(() => renderer!.root.findByProps({ 'aria-label': '开始语音输入' }).props.onClick())
  expect(mocks.start).toHaveBeenCalledOnce()
})

it('脏表单保留基础版本号；保存时禁止继续编辑字段', async () => {
  const slots = await components()
  await act(async () => { renderer = create(createElement(slots.get('settings.plugins.tab'))) })
  act(() => renderer!.root.findByProps({ 'aria-label': '识别模型' }).props.onChange({ target: { value: 'my-model' } }))
  act(() => { mocks.snapshot = { ...mocks.snapshot, revision: 1, model: 'external-model' }; for (const fn of mocks.listeners) fn() })
  const saving = Promise.withResolvers<any>()
  mocks.save.mockReturnValue(saving.promise)
  act(() => button('保存').props.onClick())
  expect(mocks.save.mock.calls[0][1]).toBe(0)
  expect(renderer!.root.findByType('fieldset').props.disabled).toBe(true)
  await act(async () => { saving.resolve({ ...mocks.snapshot, model: 'my-model', revision: 2 }) })
  expect(renderer!.root.findByType('fieldset').props.disabled).toBe(false)
  expect(renderer!.root.findByProps({ 'aria-label': '识别模型' }).props.value).toBe('my-model')
})

it('设置页可单独关闭实时字幕并保存', async () => {
  const slots = await components()
  mocks.save.mockImplementation(async (form: any) => ({ ...form, configured: true, writable: true, revision: 1 }))
  await act(async () => { renderer = create(createElement(slots.get('settings.plugins.tab'))) })
  const toggle = () => renderer!.root.findByProps({ 'aria-label': '显示实时字幕' })
  expect(toggle().props.checked).toBe(true)
  act(() => toggle().props.onChange({ target: { checked: false } }))
  expect(toggle().props.checked).toBe(false)
  await act(async () => button('保存').props.onClick())
  expect(mocks.save.mock.calls[0][0].showLiveCaption).toBe(false)
  expect(toggle().props.checked).toBe(false)
})

it.each([
  { finalized: true, interrupted: true, sends: 0 },
  { finalized: false, interrupted: false, sends: 0 },
  { finalized: true, interrupted: false, sends: 1 },
])('只有完整且主动停止的转写可以自动发送: %o', async ({ sends, ...meta }) => {
  const slots = await components()
  mocks.snapshot = { ...mocks.snapshot, autoSend: true }
  const actions = { insertText: vi.fn(() => true), submit: vi.fn() }
  const props = { sessionId: `send-${meta.finalized}-${meta.interrupted}`, useInput: () => ({ draft: '', draftRev: 0, phase: 'plain', occurrences: [] }), inputActions: actions }
  await act(async () => { renderer = create(createElement(slots.get('conversation.input.right'), props)) })
  act(() => renderer!.root.findByProps({ 'aria-label': '开始语音输入' }).props.onClick())
  act(() => mocks.final('安全保留', meta))
  expect(actions.insertText).toHaveBeenCalledOnce()
  expect(actions.submit).toHaveBeenCalledTimes(sends)
})

it('原会话重挂载后仍能订阅旧实例迟到的最终文字，不写入其他会话', async () => {
  const slots = await components()
  const actions = { insertText: vi.fn(() => true), submit: vi.fn() }
  const props = { sessionId: 'late-original', useInput: () => ({ draft: '', draftRev: 0, phase: 'plain', occurrences: [] }), inputActions: actions }
  await act(async () => { renderer = create(createElement(slots.get('conversation.input.right'), props)) })
  const originalFinal = mocks.final
  act(() => renderer!.unmount())
  await act(async () => { renderer = create(createElement(slots.get('conversation.input.right'), { ...props, sessionId: 'late-other' })) })
  act(() => originalFinal('会话专属文字', { finalized: true, interrupted: true }))
  expect(actions.insertText).not.toHaveBeenCalled()
  expect(renderer!.root.findAllByType('button').some(node => node.children.includes('恢复识别文字'))).toBe(false)
  act(() => renderer!.unmount())
  await act(async () => { renderer = create(createElement(slots.get('conversation.input.right'), props)) })
  expect(button('恢复识别文字')).toBeDefined()
  act(() => button('恢复识别文字').props.onClick())
  act(() => button('丢弃识别文字').props.onClick())
  // Remount first, then deliver a later callback into the new subscription.
  const secondFinal = mocks.final
  act(() => renderer!.unmount())
  await act(async () => { renderer = create(createElement(slots.get('conversation.input.right'), props)) })
  act(() => secondFinal('更晚返回的文字', { finalized: false, interrupted: true }))
  expect(button('恢复识别文字')).toBeDefined()
  expect(actions.insertText).not.toHaveBeenCalled()
  act(() => button('恢复识别文字').props.onClick())
  act(() => button('丢弃识别文字').props.onClick())
})

it('失焦、隐藏和外部点击只中断保留，字幕内选择文字与原点击均不被吞掉', async () => {
  const slots = await components()
  class FakeElement { constructor(readonly caption = false) {} closest() { return this.caption ? this : null } }
  vi.stubGlobal('Element', FakeElement)
  const props = { sessionId: 'focus-boundaries', useInput: () => ({ draft: '', draftRev: 0, phase: 'plain', occurrences: [] }), inputActions: { insertText: vi.fn(), submit: vi.fn() } }
  await act(async () => { renderer = create(createElement(slots.get('conversation.input.right'), props)) })
  const docEvents = (document.addEventListener as any).mock.calls
  const outside = docEvents.find(([name]: any) => name === 'pointerdown')[1]
  const visibility = docEvents.find(([name]: any) => name === 'visibilitychange')[1]
  const blur = (window.addEventListener as any).mock.calls.find(([name]: any) => name === 'blur')[1]
  const preventDefault = vi.fn()
  outside({ target: new FakeElement(true), preventDefault })
  expect(mocks.finish).not.toHaveBeenCalled()
  outside({ target: new FakeElement(), preventDefault })
  blur()
  Object.defineProperty(document, 'hidden', { value: true })
  visibility()
  expect(mocks.finish.mock.calls).toEqual([[true], [true], [true]])
  expect(preventDefault).not.toHaveBeenCalled()
})

it('展示品牌版本与手动 Releases 链接，不提供更新检查入口', async () => {
  const slots = await components()
  await act(async () => { renderer = create(createElement(slots.get('settings.plugins.tab'))) })
  expect(renderer!.root.findByType('h2').children.join('')).toBe('DSH-ASR-Realtime')
  expect(renderer!.root.findAllByType('p').some(node => node.children.join('').includes('v0.5.0'))).toBe(true)
  const link = renderer!.root.findByProps({ href: 'https://github.com/QR-0W/DSH-ASR-Realtime/releases' })
  expect(link.children.join('')).toBe('GitHub Releases')
  expect(link.props.target).toBe('_blank')
  expect(link.props.rel).toContain('noopener')
  const labels = renderer!.root.findAllByType('button').map(node => node.children.join(''))
  expect(labels).not.toContain('检查更新')
  expect(labels).not.toContain('更新')
})
