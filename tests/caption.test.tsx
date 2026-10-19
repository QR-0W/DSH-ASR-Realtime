import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import { LiveCaption, captionStyle } from '../src/client/caption.tsx'
import type { Context } from '@deepseek-ai/cordis'

let renderer: ReactTestRenderer | undefined
const snapshot = { active: 'zh', locales: [], revision: 0 }
const locale = { subscribe: () => () => {}, getSnapshot: () => snapshot, bind: () => (key: string) => key } as unknown as Context['locale']
const anchor = { current: { getBoundingClientRect: () => ({ top: 600, right: 1200 }) } } as any
const recording = { phase: 'recording' as const, preview: '保留这段识别', message: '' }
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; vi.unstubAllGlobals() })

function mount(panel: object, state = recording) {
  const browser = { innerWidth: 1280, innerHeight: 800, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  vi.stubGlobal('window', browser)
  act(() => { renderer = create(createElement(LiveCaption, { state, anchor, autoSend: false, locale }), {
    createNodeMock: element => element.type === 'section' ? panel : { scrollTop: 0, scrollHeight: 40 },
  }) })
  return browser
}
it('显示可选择的字幕及状态动效，卸载清理定位监听和 popover', () => {
  const panel = { setAttribute: vi.fn(), removeAttribute: vi.fn(), showPopover: vi.fn(), hidePopover: vi.fn() }
  const browser = mount(panel)
  expect(panel.showPopover).toHaveBeenCalledOnce()
  expect(renderer!.root.findByType('section').props['data-asr-caption']).toBe(true)
  expect(renderer!.root.findByType('p').children).toEqual(['保留这段识别'])
  expect(captionStyle).toContain('cubic-bezier')
  expect(captionStyle).toContain('prefers-reduced-motion')
  expect(captionStyle).toContain('user-select:text')
  act(() => renderer!.unmount()); renderer = undefined
  expect(panel.hidePopover).toHaveBeenCalledOnce()
  expect(browser.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function))
  expect(browser.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function), true)
})
it('不支持 Popover API 时仍渲染普通浮层', () => {
  mount({})
  expect(renderer!.root.findByType('p').children).toEqual(['保留这段识别'])
})
it('浏览器拒绝显示 popover 时移除隐藏属性，不使麦克风组件崩溃', () => {
  const panel = { setAttribute: vi.fn(), removeAttribute: vi.fn(), showPopover: vi.fn(() => { throw new Error('not available') }) }
  mount(panel)
  expect(panel.removeAttribute).toHaveBeenCalledWith('popover')
  expect(renderer!.root.findByType('section').props.role).toBe('status')
})
it('空闲时不创建字幕浮层或注册全局定位监听', () => {
  const panel = { showPopover: vi.fn() }
  const browser = mount(panel, { phase: 'idle', preview: '', message: '' } as any)
  expect(renderer!.toJSON()).toBeNull()
  expect(browser.addEventListener).not.toHaveBeenCalled()
})
