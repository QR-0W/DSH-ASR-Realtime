import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { defaults, validatePreferences, workspaceFromHost, VERSION, type SettingsView, type Preferences } from '../shared.ts'
import { settings } from './settings.ts'
import { HotkeyCapture, HotkeyGesture, matches, releasesBinding } from './hotkey.ts'
import { appendTranscript } from './draft.ts'
import { VoiceSession } from './session.ts'
import { getTranscript, setTranscript, clearTranscript, subscribeTranscript } from './transcripts.ts'
import { captionStyle, LiveCaption, registerCaptionLocale } from './caption.tsx'

export const inject = ['slots', 'locale']
const sessions = new Set<VoiceSession>()
let owner: VoiceSession | undefined
const style = `
.listener-button{border:0;border-radius:var(--sys-shape-corner-small,8px);padding:7px;display:inline-flex;align-items:center;gap:5px;color:var(--dsw-alias-label-secondary);background:transparent;cursor:pointer;font:inherit;transition:transform .28s cubic-bezier(.2,1.5,.4,1)}
.listener-button:hover{background:var(--dsw-alias-bg-layer-2)}.listener-button:active{transform:scale(.92)}.listener-button:disabled{opacity:.5;cursor:default}
@media(prefers-reduced-motion:reduce){.listener-button{transition:none}.listener-button:active{transform:none}}
.listener-button[data-recording=true]{color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-bg-layer-2)}.listener-button:focus-visible,.listener-settings input:focus-visible,.listener-settings select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.listener-control{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.listener-settings{max-width:480px;padding:12px;color:inherit;font:inherit;font-size:13px}.listener-settings h2{margin:0 0 6px;font-size:16px}.listener-settings p{line-height:1.5;opacity:.8;margin:8px 0}.listener-settings a{color:var(--dsw-alias-brand-primary);text-underline-offset:2px}
.listener-field{display:grid;grid-template-columns:135px 1fr;gap:12px;align-items:center;margin:16px 0}.listener-field input:not([type=checkbox]),.listener-field select{box-sizing:border-box;width:100%;padding:9px 10px;color:inherit;background:var(--dsw-alias-bg-layer-2,#8881);border:1px solid #8885;border-radius:7px;font:inherit}.listener-field input[type=checkbox]{width:18px;height:18px;accent-color:#16a34a}
.listener-actions{display:flex;gap:10px;margin-top:20px}.listener-action{padding:8px 14px;border:1px solid #8885;border-radius:7px;background:transparent;color:inherit;cursor:pointer;font:inherit}.listener-primary{background:#15803d;color:white;border-color:#15803d}.listener-action:disabled{opacity:.5;cursor:default}
.listener-dialog{padding:0;border:1px solid #8885;border-radius:12px;max-width:min(680px,calc(100vw - 32px));max-height:85vh;color:inherit;background:var(--dsw-alias-bg-layer-1,Canvas);overflow:auto}.listener-dialog::backdrop{background:#0006}.listener-dialog-close{display:flex;justify-content:flex-end;padding:12px 16px 0}
.listener-settings .listener-field{grid-template-columns:105px 1fr;gap:8px;margin:10px 0}.listener-settings .listener-field input:not([type=checkbox]),.listener-settings .listener-field select{padding:6px 8px;font-size:13px}.listener-settings .listener-action{padding:5px 10px;font-size:13px}.listener-settings .listener-actions{margin-top:12px}.listener-popup{width:min(380px,calc(100vw - 48px));padding:16px;font-size:13px}.listener-popup h2{font-size:16px;margin:0 0 10px}.listener-popup p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5}.listener-popup-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
.listener-shortcut{display:flex;align-items:center;gap:8px}.listener-shortcut input{min-width:0;flex:1}.listener-shortcut button{flex:none}.listener-settings .listener-hint{font-size:12px;margin:5px 0 0}
@media(max-width:500px){.listener-field{grid-template-columns:1fr;gap:6px}.listener-settings{padding:12px}}
`
function Mic() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0014 0v-2M12 19v3M8 22h8"/></svg>
}

function VoiceButton({ sessionId, useInput, inputActions, locale }: PropsRuntime<'conversation.input.right'> & { locale: Context['locale'] }) {
  const input = useInput((value: InputState) => value)
  const config = useSyncExternalStore(settings.subscribe, settings.getSnapshot)
  const latest = useRef({ input, config, inputActions, sessionId })
  latest.current = { input, config, inputActions, sessionId }
  const start = useRef({ revision: 0, autoSend: false })
  const [notice, setNotice] = useState('')
  const transcript = useSyncExternalStore(
    listener => subscribeTranscript(sessionId, listener),
    () => getTranscript(sessionId),
    () => getTranscript(sessionId),
  )
  const pending = transcript?.text ?? ''
  const [showSettings, setShowSettings] = useState(false)
  const controlRef = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const mounted = useRef(false)
  const [session] = useState(() => new VoiceSession((text, meta) => {
    setTranscript(sessionId, { text, finalized: meta.finalized, interrupted: meta.interrupted })
    if (owner === session) owner = undefined
    if (!mounted.current || latest.current.sessionId !== sessionId) return
    const { input, inputActions } = latest.current
    try {
      const result = appendTranscript(inputActions, input, text, start.current.autoSend && meta.finalized && !meta.interrupted, start.current.revision)
      if (result === 'blocked') setNotice('输入框暂不可编辑，识别文字已保留')
      else {
        clearTranscript(sessionId)
        if (result === 'empty') setNotice('')
        else if (result === 'edited') setNotice('草稿已编辑，语音已追加，请手动发送')
        else setNotice(result === 'sent' ? '已提交发送' : '语音已追加')
      }
    } catch {
      setNotice('识别文字已保留，请手动追加或复制')
    }
  }))
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  useEffect(() => { if (state.phase === 'error') setNotice(state.message) }, [state.phase, state.message])
  const operations = useRef({ begin: () => {}, finish: () => {} })
  operations.current = {
    begin: () => {
      const { config, input } = latest.current
      if (!config?.configured || input.phase !== 'plain' || (owner && owner !== session && owner.busy()) || session.busy()) return
      if (pending) { setNotice('请先追加、复制或丢弃上次识别文字'); return }
      start.current = { revision: input.draftRev, autoSend: config.autoSend }
      setNotice(''); owner = session
      void session.start()
    },
    finish: () => { void session.finish() },
  }
  useEffect(() => {
    mounted.current = true
    sessions.add(session)
    const gesture = new HotkeyGesture({ start: () => operations.current.begin(), finish: () => operations.current.finish(), active: session.active }, () => latest.current.config?.mode ?? 'hold')
    let pressedCode = ''
    const down = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !document.hasFocus() || document.hidden || !button.current?.getClientRects().length) return
      // Shortcut capture in Settings must never start a recording.
      if ((event.target as HTMLElement)?.closest?.('[data-listener-settings], [role="dialog"]')) return
      if (!latest.current.config?.configured || !matches(event, latest.current.config.hotkey, true)) return
      if (owner && owner !== session && owner.busy()) return
      event.preventDefault()
      if (event.repeat) return
      pressedCode = latest.current.config.hotkey
      gesture.down()
    }
    const up = (event: KeyboardEvent) => {
      if (!pressedCode || !releasesBinding(event.code, pressedCode)) return
      event.preventDefault(); pressedCode = ''; gesture.up()
    }
    const interrupt = () => {
      gesture.reset(); pressedCode = ''
      void session.finish(true)
    }
    const visibility = () => { if (document.hidden) interrupt() }
    const outsidePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (controlRef.current?.contains(target as Node) || (target instanceof Element && target.closest('[data-asr-caption]'))) return
      interrupt()
    }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    window.addEventListener('blur', interrupt); document.addEventListener('visibilitychange', visibility)
    document.addEventListener('pointerdown', outsidePointerDown, true)
    return () => {
      mounted.current = false
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up)
      window.removeEventListener('blur', interrupt); document.removeEventListener('visibilitychange', visibility)
      document.removeEventListener('pointerdown', outsidePointerDown, true)
      void session.finish(true); sessions.delete(session)
    }
  }, [sessionId, session])
  const label = state.phase === 'recording' ? '停止录音' : state.phase === 'requesting' ? '取消麦克风请求' : state.phase === 'finishing' ? '正在识别' : '开始语音输入'
  return <div ref={controlRef} className="listener-control">
    <button ref={button} type="button" className="listener-button" aria-label={label} aria-pressed={session.active()} data-recording={state.phase === 'recording'}
      title={config?.configured ? `${label}（${config.hotkey}）${state.preview ? `：${state.preview}` : ''}；右键打开语音输入设置` : '点击配置语音输入'}
      disabled={state.phase === 'finishing' || input.phase !== 'plain'}
      onContextMenu={event => { event.preventDefault(); if (!session.busy()) setShowSettings(true) }}
      onClick={() => { if (!config?.configured) setShowSettings(true); else if (session.active()) operations.current.finish(); else operations.current.begin() }}><Mic /></button>
    {config?.showLiveCaption && <LiveCaption state={state} anchor={button} autoSend={start.current.autoSend} locale={locale}/>}
    {showSettings && <SettingsDialog onClose={() => setShowSettings(false)}/>}
    {pending && !notice && <button type="button" className="listener-action" onClick={() => setNotice('上次识别文字尚未处理')}>恢复识别文字</button>}
    {(notice && !['语音已追加', '已提交发送'].includes(notice)) && <MessageDialog message={notice} onClose={() => setNotice('')} onSettings={() => { setNotice(''); setShowSettings(true) }}>
    {pending && <><p>{pending}</p><button className="listener-action" type="button" onClick={() => {
      const result = appendTranscript(inputActions, latest.current.input, pending, false, 0)
      if (result !== 'blocked') { clearTranscript(sessionId); setNotice('语音已追加') }
    }}>追加识别文字</button><button className="listener-action" type="button" onClick={() => { void (navigator.clipboard?.writeText(pending) ?? Promise.reject()).then(() => { clearTranscript(sessionId); setNotice('已复制识别文字') }).catch(() => setNotice('无法复制，请使用追加按钮')) }}>复制</button><button className="listener-action" type="button" onClick={() => { clearTranscript(sessionId); setNotice('') }}>丢弃识别文字</button></>}
    </MessageDialog>}
  </div>
}

function MessageDialog({ message, onClose, onSettings, children }: { message: string; onClose: () => void; onSettings: () => void; children?: import('react').ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className="listener-dialog listener-popup" aria-label="语音输入提示" onCancel={onClose} onClose={onClose}>
    <h2>语音输入</h2><p role="alert">{message}</p>{children}<div className="listener-popup-actions"><button className="listener-action" onClick={onSettings}>检查设置</button><button className="listener-action" onClick={onClose}>关闭</button></div>
  </dialog>
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className="listener-dialog" aria-label="语音输入设置" onCancel={onClose} onClose={onClose}>
    <div className="listener-dialog-close"><button type="button" className="listener-action" onClick={onClose}>关闭</button></div>
    <VoiceSettings/>
  </dialog>
}

function VoiceSettings() {
  const saved = useSyncExternalStore(settings.subscribe, settings.getSnapshot)
  const [form, setForm] = useState<Preferences>(defaults)
  const [key, setKey] = useState('')
  const [capture, setCapture] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const dirty = useRef(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => { void settings.refresh().catch(error => setError(error.message)) }, [])
  useEffect(() => { if (saved && !dirty.current) { setRevision(saved.revision); setForm({ ...saved }) } }, [saved])
  useEffect(() => {
    if (!capture) return
    const recorder = new HotkeyCapture()
    const choose = (binding: string) => {
      try { validatePreferences({ ...defaults, hotkey: binding }) }
      catch { setMessage('请选择字母、数字、空格、F1–F12 或修饰键组合'); return }
      dirty.current = true; setForm(p => ({ ...p, hotkey: binding })); setCapture(false); setMessage('快捷键已选择，点击保存生效')
    }
    const keydown = (event: KeyboardEvent) => {
      event.preventDefault(); event.stopImmediatePropagation()
      if (event.repeat || event.isComposing) return
      const binding = recorder.down(event)
      if (event.getModifierState('AltGraph')) { setMessage('AltGr 用于字符输入，请选择其他快捷键'); return }
      if (binding) choose(binding)
    }
    const keyup = (event: KeyboardEvent) => {
      event.preventDefault(); event.stopImmediatePropagation()
      const binding = recorder.up(event)
      if (binding) choose(binding)
    }
    const blur = () => setCapture(false)
    window.addEventListener('keydown', keydown, true); window.addEventListener('keyup', keyup, true); window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', keydown, true); window.removeEventListener('keyup', keyup, true); window.removeEventListener('blur', blur) }
  }, [capture])
  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    dirty.current = true
    setForm(p => ({ ...p, [key]: value }))
  }
  const applySavedSettings = (value: SettingsView) => {
    dirty.current = false
    setForm(value); setRevision(value.revision); setKey('')
  }
  const saveConfiguration = () => {
    setBusy(true); setSaving(true); setCapture(false); setMessage('')
    void settings.save(form, revision, key.trim() || undefined).then(value => {
      applySavedSettings(value); setMessage('设置已保存')
    }).catch(error => setError(error.message)).finally(() => { setBusy(false); setSaving(false) })
  }
  const resetConfiguration = () => {
    setBusy(true); setCapture(false); setMessage('')
    void settings.reset().then(value => {
      applySavedSettings(value)
      setMessage('已清除保存的配置')
    }).catch(error => setError(error.message)).finally(() => setBusy(false))
  }
  return <section className="listener-settings" data-listener-settings>
    <h2>DSH-ASR-Realtime</h2><p>轻量化云端实时语音识别</p>
    <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    <label className="listener-field"><span>API Key</span><input type="password" autoComplete="off" value={key} placeholder={saved?.configured ? '已配置；留空保留原密钥' : '输入百炼 API Key'} onChange={e => { dirty.current = true; setKey(e.target.value) }}/></label>
    <label className="listener-field"><span>地域</span><select value={form.region} onChange={e => update('region', e.target.value as Preferences['region'])}><option value="beijing">北京</option><option value="singapore">新加坡</option></select></label>
    <label className="listener-field"><span>Workspace ID</span><div><input aria-label="Workspace ID" aria-describedby="listener-workspace-hint" value={form.workspaceId} placeholder="空间 ID，或粘贴完整 API Host" onChange={e => {
      const value = e.target.value.trim(), workspace = workspaceFromHost(value)
      if (workspace) { dirty.current = true; setForm(p => ({ ...p, ...workspace })); setMessage('已从 API Host 提取空间 ID 和地域，点击保存生效') }
      else update('workspaceId', value)
    }}/><p id="listener-workspace-hint" className="listener-hint">地域和 Workspace ID 必须与百炼密钥一致。</p></div></label>
    <label className="listener-field"><span>识别模型</span><div><input aria-label="识别模型" aria-describedby="listener-model-hint" value={form.model} onChange={e => update('model', e.target.value.trim())}/><p id="listener-model-hint" className="listener-hint">模型需支持 DashScope 流式识别协议，音频不写入磁盘。</p></div></label>
    <div className="listener-field"><span>快捷键</span><div className="listener-shortcut"><input aria-label="快捷键" value={form.hotkey} readOnly/><button type="button" className="listener-action" onClick={() => setCapture(!capture)}>{capture ? '请按快捷键' : '录入快捷键'}</button></div></div>
    <label className="listener-field"><span>录音模式</span><select value={form.mode} onChange={e => update('mode', e.target.value as Preferences['mode'])}><option value="hold">长按：按下开始，松开停止</option><option value="toggle">点按：再次按下停止</option></select></label>
    <label className="listener-field"><span>自动发送</span><input type="checkbox" checked={form.autoSend} onChange={e => update('autoSend', e.target.checked)}/></label>
    <label className="listener-field"><span>显示实时字幕</span><input aria-label="显示实时字幕" type="checkbox" checked={form.showLiveCaption} onChange={e => update('showLiveCaption', e.target.checked)}/></label>
    <p className="listener-hint">关闭后只隐藏悬浮字幕，不影响录音、识别或草稿。</p>
    <div className="listener-actions">
      <button className="listener-action listener-primary" type="button" disabled={busy || !saved?.writable} onClick={saveConfiguration}>{saving ? '保存中…' : '保存'}</button>
      <button type="button" className="listener-action" disabled={busy || !saved?.writable} onClick={resetConfiguration}>清除已保存配置</button>
      <button type="button" className="listener-action" disabled={busy} onClick={() => { setBusy(true); setCapture(false); void settings.refresh().then(() => { const value = settings.getSnapshot(); if (value) applySavedSettings(value) }).catch(error => setError(error.message)).finally(() => setBusy(false)) }}>刷新</button>
    </div>
    <p role="status">{saved && !saved.writable ? '当前 Harness 配置只读。' : message}</p>
    <p className="listener-hint">v{VERSION} · <a href="https://github.com/QR-0W/DSH-ASR-Realtime/releases" target="_blank" rel="noopener noreferrer">GitHub Releases</a></p>
    </fieldset>
    {error && <MessageDialog message={error} onClose={() => setError('')} onSettings={() => setError('')}/>}
  </section>
}

/** Same slot registration approach as the MIT Harness experimental voice UI. */
export function apply(ctx: Context): void {
  registerCaptionLocale(ctx)
  ctx.effect(() => {
    const sheet = document.createElement('style'); sheet.textContent = style + captionStyle; document.head.append(sheet)
    return () => sheet.remove()
  })
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({ name: 'conversation.input.right', id: 'dsh-listener', order: 90 }, props => <VoiceButton key={props.sessionId} {...props} locale={ctx.locale}/>))
  // Bundle configuration is keyed by package name, as in dshmarket. Keep this
  // optional: a host without the plugin page can still use the mic's dialog.
  const bundleSlots = ctx.slots as unknown as {
    inject(name: string, register: () => unknown): void
    register(options: { name: string; key: string }, render: (props: { view: 'summary' | 'page' }) => import('react').ReactNode): unknown
  }
  bundleSlots.inject('plugins.bundle.config', () => bundleSlots.register({
    name: 'plugins.bundle.config', key: 'dsh-asr-realtime',
  }, ({ view }) => view === 'summary' ? null : <VoiceSettings/>))
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({ name: 'settings.plugins.tab', id: 'dsh-listener', order: 65, label: () => 'DSH-ASR-Realtime' }, VoiceSettings))
  ctx.effect(() => () => { for (const session of sessions) void session.finish(true); sessions.clear(); owner = undefined })
  void settings.refresh().catch(() => undefined)
}
