import { expect, it } from 'vitest'
import { defaults, validatePreferences } from '../src/shared.ts'

it('旧设置缺少字幕开关时继续默认显示', () => {
  const old: Record<string, unknown> = { ...defaults }
  delete old.showLiveCaption
  expect(validatePreferences(old)).toEqual(defaults)
  expect(() => validatePreferences({ ...defaults, showLiveCaption: 'yes' })).toThrow()
})
it('兼容旧配置但不会保留或执行已移除的 npm 下载设置', () => {
  expect(validatePreferences({ ...defaults, updateSource: 'mirror', mirrorUrl: 'https://example.invalid' })).toEqual(defaults)
  expect(defaults).not.toHaveProperty('updateSource')
  expect(defaults).not.toHaveProperty('mirrorUrl')
})
it('识别模型仅允许标识符，不能把音频目标替换成任意网址', () => {
  expect(() => validatePreferences({ ...defaults, model: 'https://example.invalid/upload' })).toThrow()
})
