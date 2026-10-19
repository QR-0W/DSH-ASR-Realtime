import { beforeEach, expect, it, vi } from 'vitest'
const audio = vi.hoisted(() => ({ starts: [] as (() => void)[], chunks: [] as ((chunk: ArrayBuffer) => void)[], interrupts: [] as (() => void)[], stops: 0, cancels: 0, flush: true }))
vi.mock('../src/client/audio.ts', () => ({ Recording: class {
  constructor(chunk: (data: ArrayBuffer) => void, interrupted: () => void) { audio.chunks.push(chunk); audio.interrupts.push(interrupted) }
  start() { return new Promise<void>(resolve => audio.starts.push(resolve)) }
  async stop() { audio.stops++; if (audio.flush) audio.chunks.at(-1)?.(new ArrayBuffer(2)) }
  async cancel() { audio.cancels++ }
} }))
vi.mock('../src/client/channel.ts', () => ({ HttpVoiceChannel: class { constructor() { return new Socket() } } }))
import { VoiceSession } from '../src/client/session.ts'
import { MAX_AUDIO_BYTES } from '../src/shared.ts'
class Socket {
  static instances: Socket[] = []
  readyState = 1; bufferedAmount = 0
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  sent: any[] = []
  constructor() { Socket.instances.push(this) }
  send(data: any) { this.sent.push(data) }
  close() { this.readyState = 3 }
  message(data: object) { this.onmessage?.({ data: JSON.stringify(data) }) }
}
beforeEach(() => {
  audio.starts = []; audio.chunks = []; audio.interrupts = []; audio.stops = 0; audio.cancels = 0; audio.flush = true; Socket.instances = []
})
it('服务正常返回空文本时安静结束，不触发草稿或提示回调', async () => {
  const final = vi.fn(), session = new VoiceSession(final)
  const start = session.start(); audio.starts[0](); await start
  const socket = Socket.instances[0]; socket.message({ type: 'ready' })
  await session.finish(); socket.message({ type: 'final', text: '  ' })
  expect(session.getSnapshot()).toEqual({ phase: 'idle', preview: '', message: '' })
  expect(final).not.toHaveBeenCalled(); expect(socket.readyState).toBe(3)
})
it('极短录音没有采到 PCM 时安静取消并释放麦克风', async () => {
  audio.flush = false
  const final = vi.fn(), session = new VoiceSession(final)
  const start = session.start(); audio.starts[0](); await start
  await session.finish()
  expect(session.getSnapshot().phase).toBe('idle'); expect(session.getSnapshot().message).toBe('')
  expect(audio.cancels).toBeGreaterThan(0); expect(final).not.toHaveBeenCalled()
})
it.each([401, 403, 500])('HTTP 通道错误保留 HTTP %s 提示并回退 partial 一次', async (status) => {
  const final = vi.fn(), session = new VoiceSession(final)
  const start = session.start(); audio.starts[0](); await start
  const socket = Socket.instances[0]
  socket.message({ type: 'partial', text: '未校正文本' })
  socket.message({ type: 'error', message: `Harness 语音接口 HTTP ${status}：请求失败` })
  expect(session.getSnapshot().phase).toBe('error')
  expect(session.getSnapshot().message).toContain(`HTTP ${status}`)
  expect(session.getSnapshot().message).toContain('可能尚未最终校正')
  expect(audio.cancels).toBeGreaterThan(0)
  expect(final).toHaveBeenCalledExactlyOnceWith('未校正文本', { finalized: false, interrupted: true })
})
it.each(['null', '1', '[]'])('结构无效的 JSON %s 会保留已有文本并释放资源', async raw => {
  const final = vi.fn(), session = new VoiceSession(final)
  const start = session.start(); audio.starts[0](); await start
  const socket = Socket.instances[0]
  socket.message({ type: 'partial', text: '不能丢失' })
  expect(() => socket.onmessage?.({ data: raw })).not.toThrow()
  expect(final).toHaveBeenCalledExactlyOnceWith('不能丢失', { finalized: false, interrupted: true })
  expect(session.getSnapshot().phase).toBe('error')
  expect(socket.readyState).toBe(3)
})
it('权限申请时停止会取消并关闭迟到授权', async () => {
  const final = vi.fn(), session = new VoiceSession(final)
  const start = session.start()
  await session.finish(true); audio.starts[0](); await start
  expect(session.getSnapshot().phase).toBe('idle'); expect(audio.cancels).toBeGreaterThan(0)
  expect(Socket.instances[0].readyState).toBe(3); expect(final).not.toHaveBeenCalled()
})
it('浏览器先暂存音频，连接就绪后上传，flush 尾音后再结束', async () => {
  const final = vi.fn(), session = new VoiceSession(final)
  const start = session.start(); audio.starts[0](); await start
  const socket = Socket.instances[0]
  const pcm = new ArrayBuffer(3200); audio.chunks[0](pcm)
  expect(socket.sent).toEqual([])
  socket.message({ type: 'ready' }); expect(socket.sent).toEqual([pcm])
  await session.finish()
  expect(socket.sent[1]).toBeInstanceOf(ArrayBuffer)
  expect(JSON.parse(socket.sent[2])).toEqual({ type: 'finish' })
  socket.message({ type: 'partial', text: '临时' }); expect(final).not.toHaveBeenCalled()
  const late = socket.onmessage
  socket.message({ type: 'final', text: '最终。' })
  late?.({ data: JSON.stringify({ type: 'final', text: '重复结果' }) })
  expect(final).toHaveBeenCalledExactlyOnceWith('最终。', { finalized: true, interrupted: false })
})
it('停止时连接尚未就绪，连接就绪后先发全部音频再发结束', async () => {
  const session = new VoiceSession(vi.fn())
  const start = session.start(); audio.starts[0](); await start
  audio.chunks[0](new ArrayBuffer(3200)); await session.finish()
  const socket = Socket.instances[0]; expect(socket.sent).toEqual([])
  socket.message({ type: 'ready' })
  expect(socket.sent).toHaveLength(3); expect(JSON.parse(socket.sent[2]).type).toBe('finish')
  session.cancel()
})
it('取消后丢弃迟到结果，连接中断停止麦克风', async () => {
  const final = vi.fn(), session = new VoiceSession(final)
  const start = session.start(); audio.starts[0](); await start
  const socket = Socket.instances[0], late = socket.onmessage
  socket.onclose?.()
  late?.({ data: JSON.stringify({ type: 'final', text: '不该出现' }) })
  expect(session.getSnapshot().phase).toBe('error'); expect(audio.cancels).toBeGreaterThan(0)
  expect(final).not.toHaveBeenCalled()
})
it('断连保留最近 partial 并标记为中断', async () => {
  const final = vi.fn(), session = new VoiceSession(final)
  const start = session.start(); audio.starts[0](); await start
  const socket = Socket.instances[0]
  socket.message({ type: 'partial', text: '最近文本' }); socket.onclose?.()
  expect(final).toHaveBeenCalledExactlyOnceWith('最近文本', { finalized: false, interrupted: true })
  expect(session.getSnapshot().message).toContain('可能尚未最终校正')
})
it('等待 final 超时后回退 partial，晚到 final 不会重复回调', async () => {
  vi.useFakeTimers()
  try {
    const final = vi.fn(), session = new VoiceSession(final)
    const start = session.start(); audio.starts[0](); await start
    const socket = Socket.instances[0]; socket.message({ type: 'ready' }); socket.message({ type: 'partial', text: '超时文本' })
    await session.finish()
    const late = socket.onmessage
    await vi.advanceTimersByTimeAsync(20000)
    late?.({ data: JSON.stringify({ type: 'final', text: '晚到 final' }) })
    expect(final).toHaveBeenCalledExactlyOnceWith('超时文本', { finalized: false, interrupted: true })
    expect(session.getSnapshot().message).toContain('可能尚未最终校正')
  } finally { vi.useRealTimers() }
})
it('多次停止只停麦一次，finishing 时可升级为 interrupted', async () => {
  const final = vi.fn(), session = new VoiceSession(final)
  const start = session.start(); audio.starts[0](); await start
  const socket = Socket.instances[0]; socket.message({ type: 'ready' }); audio.chunks[0](new ArrayBuffer(3200))
  const first = session.finish(), second = session.finish(true), third = session.finish()
  await Promise.all([first, second, third])
  expect(audio.stops).toBe(1)
  socket.message({ type: 'final', text: '最终文本' })
  expect(final).toHaveBeenCalledExactlyOnceWith('最终文本', { finalized: true, interrupted: true })
})
it('空 final 时保留非空 partial，并标记未最终校正', async () => {
  const final = vi.fn(), session = new VoiceSession(final)
  const start = session.start(); audio.starts[0](); await start
  const socket = Socket.instances[0]; socket.message({ type: 'ready' }); audio.chunks[0](new ArrayBuffer(3200))
  await session.finish(); socket.message({ type: 'partial', text: '保留这段' }); socket.message({ type: 'final', text: '' })
  expect(final).toHaveBeenCalledExactlyOnceWith('保留这段', { finalized: false, interrupted: false })
})
it('麦克风中断时回退 partial，回调异常不会再次触发失败回调', async () => {
  const final = vi.fn(() => { throw new Error('consumer failed') }), session = new VoiceSession(final)
  const start = session.start(); audio.starts[0](); await start
  Socket.instances[0].message({ type: 'partial', text: '麦克风中断文本' }); audio.interrupts[0]()
  expect(final).toHaveBeenCalledExactlyOnceWith('麦克风中断文本', { finalized: false, interrupted: true })
  expect(session.getSnapshot().phase).toBe('error')
})
it('到时长上限会正常收尾，不因最后一个音频块超限丢掉整次录音', async () => {
  const final = vi.fn(), session = new VoiceSession(final)
  const start = session.start(); audio.starts[0](); await start
  const socket = Socket.instances[0]; socket.message({ type: 'ready' })
  for (let i = 0; i < MAX_AUDIO_BYTES / 3200 + 1; i++) audio.chunks[0](new ArrayBuffer(3200))
  await Promise.resolve(); await Promise.resolve()
  expect(socket.sent.filter(v => v instanceof ArrayBuffer).reduce((size, v) => size + v.byteLength, 0)).toBe(MAX_AUDIO_BYTES)
  expect(JSON.parse(socket.sent.at(-1)).type).toBe('finish')
  socket.message({ type: 'final', text: '完整录音' }); expect(final).toHaveBeenCalledExactlyOnceWith('完整录音', { finalized: true, interrupted: false })
})
