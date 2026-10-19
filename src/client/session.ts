import { MAX_AUDIO_BYTES, MAX_BUFFER_BYTES } from '../shared.ts'
import { Recording } from './audio.ts'
import { HttpVoiceChannel } from './channel.ts'

export interface SessionState { phase: 'idle' | 'requesting' | 'recording' | 'finishing' | 'error'; preview: string; message: string }
export interface TranscriptMeta { finalized: boolean; interrupted: boolean }
/** Serial microphone owner: asynchronous grants, worklet tail and cloud task are one lifetime. */
export class VoiceSession {
  private state: SessionState = { phase: 'idle', preview: '', message: '' }
  private listeners = new Set<() => void>()
  private generation = 0
  private capture?: Recording
  private socket?: HttpVoiceChannel
  private ready = false
  private queue: ArrayBuffer[] = []
  private queuedBytes = 0
  private totalBytes = 0
  private finishing = false
  private interrupted = false
  private finishSent = false
  private delivered = false
  private timer?: ReturnType<typeof setTimeout>
  private limit?: ReturnType<typeof setTimeout>
  constructor(private final: (text: string, meta: TranscriptMeta) => void) {}
  getSnapshot = (): SessionState => this.state
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  active = (): boolean => ['requesting', 'recording'].includes(this.state.phase)
  busy = (): boolean => this.active() || this.state.phase === 'finishing'
  private set(patch: Partial<SessionState>): void { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener() }
  async start(): Promise<void> {
    if (this.busy()) return
    const run = ++this.generation
    this.ready = false; this.finishing = false; this.interrupted = false; this.finishSent = false; this.delivered = false
    this.queue = []; this.queuedBytes = 0; this.totalBytes = 0
    this.set({ phase: 'requesting', preview: '', message: '正在请求麦克风…' })
    const fail = (message: string) => { if (this.generation === run) this.fail(message) }
    const capture = new Recording(chunk => { if (this.generation === run) this.audio(chunk) }, () => fail('麦克风中断，录音已停止'))
    this.capture = capture
    try {
      const socket = new HttpVoiceChannel()
      this.socket = socket
      this.timer = setTimeout(() => fail('连接或麦克风授权超时，已停止'), 15000)
      socket.onmessage = event => {
        if (this.generation !== run) return
        let message: any
        try { message = JSON.parse(event.data) } catch { fail('语音服务响应无效'); return }
        if (!message || typeof message !== 'object' || Array.isArray(message)) { fail('语音服务响应无效'); return }
        if (message.type === 'ready') {
          this.ready = true
          try {
            for (const chunk of this.queue) socket.send(chunk)
            this.queue = []; this.queuedBytes = 0
            this.flushFinish()
          } catch { fail('语音服务连接失败'); return }
        } else if (message.type === 'partial') {
          if (typeof message.text !== 'string') { fail('语音服务响应无效'); return }
          this.set({ preview: message.text })
        } else if (message.type === 'final') {
          if (!this.finishSent || typeof message.text !== 'string') { fail('语音服务响应无效'); return }
          const text = message.text.trim() ? message.text : this.state.preview
          this.complete(text, { finalized: !!message.text.trim(), interrupted: this.interrupted })
        } else if (message.type === 'error') fail(typeof message.message === 'string' ? message.message : '识别失败')
        else fail('语音服务响应无效')
      }
      socket.onclose = () => fail('连接中断，录音已停止')
      await capture.start()
      if (this.generation !== run) { await capture.cancel(); return }
      this.set({ phase: 'recording', message: '' })
      clearTimeout(this.timer)
      this.timer = setTimeout(() => { if (!this.ready) fail('百炼连接超时') }, 15000)
      this.limit = setTimeout(() => { void this.finish() }, 120000)
    } catch (error) { fail(error instanceof Error ? error.message : '无法开启麦克风') }
  }
  async finish(interrupted = false): Promise<void> {
    this.interrupted ||= interrupted
    if (this.state.phase === 'requesting') { this.cancel('麦克风尚未就绪，本次录音已取消'); return }
    if (this.state.phase !== 'recording') return
    const run = this.generation
    this.set({ phase: 'finishing', message: '正在识别…' })
    clearTimeout(this.limit)
    try {
      await this.capture?.stop()
      if (this.generation !== run) return
      this.finishing = true
      clearTimeout(this.timer)
      this.timer = setTimeout(() => this.fail('等待识别结果超时'), 20000)
      if (!this.totalBytes) { this.cancel(); return }
      this.flushFinish()
    } catch (error) { if (this.generation === run) this.fail(error instanceof Error ? error.message : '停止录音失败') }
  }
  cancel(message = ''): void {
    this.release()
    this.set({ phase: 'idle', preview: '', message })
  }
  private release(): void {
    ++this.generation
    clearTimeout(this.timer); clearTimeout(this.limit)
    void this.capture?.cancel()
    this.capture = undefined
    const socket = this.socket
    this.socket = undefined
    if (socket) {
      socket.onmessage = null; socket.onclose = null
      socket.close()
    }
    this.queue = []; this.queuedBytes = 0
  }
  private fail(message: string): void {
    if (this.delivered || !this.busy()) return
    const text = this.state.preview
    const hasText = !!text.trim()
    this.delivered = hasText
    this.release()
    if (hasText) this.deliver(text, { finalized: false, interrupted: true })
    this.set({ phase: 'error', preview: '', message: hasText ? `${message}；已保留部分识别文本，可能尚未最终校正` : message })
  }
  private complete(text: string, meta: TranscriptMeta): void {
    if (this.delivered) return
    this.delivered = !!text.trim()
    this.release()
    this.set({ phase: 'idle', preview: '', message: '' })
    if (text.trim()) this.deliver(text, meta)
  }
  private deliver(text: string, meta: TranscriptMeta): void {
    try { this.final(text, meta) } catch { /* A consumer error must not re-enter session failure handling. */ }
  }
  private audio(chunk: ArrayBuffer): void {
    const remaining = MAX_AUDIO_BYTES - this.totalBytes
    if (remaining <= 0) { if (this.state.phase === 'recording') void this.finish(); return }
    if (chunk.byteLength > remaining) chunk = chunk.slice(0, remaining)
    this.totalBytes += chunk.byteLength
    if (this.ready && this.socket?.readyState === 1) {
      if (this.socket.bufferedAmount > MAX_BUFFER_BYTES) { this.fail('上传网络过慢，已停止'); return }
      try { this.socket.send(chunk) } catch { this.fail('语音服务连接失败') }
    } else {
      this.queuedBytes += chunk.byteLength
      if (this.queuedBytes > MAX_BUFFER_BYTES) { this.fail('百炼连接过慢，已停止'); return }
      this.queue.push(chunk)
    }
    if (this.totalBytes === MAX_AUDIO_BYTES && this.state.phase === 'recording') void this.finish()
  }
  private flushFinish(): void {
    if (this.finishing && this.ready && !this.finishSent && this.socket?.readyState === 1) {
      try { this.socket.send(JSON.stringify({ type: 'finish' })); this.finishSent = true }
      catch { this.fail('语音服务连接失败') }
    }
  }
}
