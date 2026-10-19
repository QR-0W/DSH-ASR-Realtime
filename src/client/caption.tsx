import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import type { SessionState } from './session.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh-listener-caption': 'recording' | 'connecting' | 'finishing' | 'waiting' | 'draft' | 'autoSend'
  }
}
const namespace = 'dsh-listener-caption'
export const captionStyle = `
.listener-caption{position:fixed;inset:auto;box-sizing:border-box;width:min(360px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;padding:16px;margin:0;border:1px solid var(--dsw-alias-border-l2);border-radius:18px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 12px 40px color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);font:inherit;transform-origin:bottom right;animation:asr-caption-in .38s cubic-bezier(.16,1,.3,1) both;z-index:30}
.listener-caption-heading{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:var(--dsw-alias-brand-primary)}
.listener-caption-body{margin:12px 0;max-height:9em;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.7;user-select:text}
.listener-caption-hint{padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.listener-caption-wave{display:inline-flex;align-items:center;gap:3px;height:18px}
.listener-caption-wave i{display:block;width:3px;height:13px;border-radius:4px;background:currentColor;transform:scaleY(.35);animation:asr-wave 1.25s cubic-bezier(.45,0,.2,1) infinite}
.listener-caption-wave i:nth-child(2){animation-delay:-.82s}.listener-caption-wave i:nth-child(3){animation-delay:-.31s}.listener-caption-wave i:nth-child(4){animation-delay:-.59s}
.listener-caption[data-phase=finishing] .listener-caption-wave i{animation-duration:1.9s}
@keyframes asr-caption-in{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes asr-wave{0%,100%{transform:scaleY(.35);opacity:.5}36%{transform:scaleY(1);opacity:1}65%{transform:scaleY(.6);opacity:.8}}
@media(prefers-reduced-motion:reduce){.listener-caption,.listener-caption-wave i{animation:none}.listener-caption-wave i{transform:scaleY(.65);opacity:1}}
`
export function registerCaptionLocale(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(namespace, {
    en: {
      recording: 'Live transcription', connecting: 'Connecting microphone and ASR…', finishing: 'Saving your transcript…',
      waiting: 'Speak to see words here as they arrive…', draft: 'Click away to stop and keep the transcript in your draft.',
      autoSend: 'The stop button can send your draft. Clicking away only saves it.',
    },
    zh: {
      recording: '实时识别中', connecting: '正在连接麦克风和识别服务…', finishing: '正在保留识别文字…',
      waiting: '请开始说话，文字会实时显示在这里…', draft: '点击其他位置会停止识别，并保留文字到草稿。',
      autoSend: '主动停止可自动发送；点击其他位置只保留文字，不发送。',
    },
  }))
}
export function LiveCaption({ state, anchor, autoSend, locale }: {
  state: SessionState
  anchor: RefObject<HTMLButtonElement>
  autoSend: boolean
  locale: Context['locale']
}) {
  const panel = useRef<HTMLElement>(null)
  const body = useRef<HTMLParagraphElement>(null)
  const [position, setPosition] = useState({ right: 16, bottom: 96 })
  const active = ['requesting', 'recording', 'finishing'].includes(state.phase)
  useSyncExternalStore(listener => locale.subscribe(listener), () => locale.getSnapshot())
  useLayoutEffect(() => {
    if (!active || !panel.current || !anchor.current) return
    const node = panel.current
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect()
      if (!rect) return
      setPosition({ right: Math.max(16, Math.min(window.innerWidth - 32, window.innerWidth - rect.right)), bottom: Math.max(16, Math.min(window.innerHeight - 32, window.innerHeight - rect.top + 12)) })
    }
    place()
    if (typeof node.showPopover === 'function') {
      try { node.setAttribute('popover', 'manual'); node.showPopover() }
      catch { node.removeAttribute('popover') }
    }
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      if (typeof node.hidePopover === 'function') {
        try { node.hidePopover() } catch { /* Already closed or disconnected. */ }
      }
    }
  }, [active, anchor])
  useEffect(() => { if (body.current) body.current.scrollTop = body.current.scrollHeight }, [state.preview, state.phase])
  if (!active) return null
  const t = locale.bind(namespace)
  return <section ref={panel} className="listener-caption" data-asr-caption data-phase={state.phase} style={position} role="status" aria-live="polite" aria-atomic="true">
    <div className="listener-caption-heading"><span className="listener-caption-wave" aria-hidden="true"><i/><i/><i/><i/></span>{t(state.phase === 'finishing' ? 'finishing' : state.phase === 'requesting' ? 'connecting' : 'recording')}</div>
    <p ref={body} className="listener-caption-body">{state.preview || t('waiting')}</p>
    <div className="listener-caption-hint">{t(autoSend ? 'autoSend' : 'draft')}</div>
  </section>
}
