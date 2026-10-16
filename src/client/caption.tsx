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
.listener-caption{position:fixed;inset:auto;box-sizing:border-box;width:min(340px,calc(100vw - 32px));padding:12px 14px;margin:0;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 8px 28px color-mix(in srgb,var(--dsw-alias-bg-base) 45%,transparent);font:inherit}
.listener-caption-heading{font-size:12px;font-weight:600;color:var(--dsw-alias-brand-primary)}
.listener-caption-body{margin:8px 0;max-height:6em;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.6}
.listener-caption-hint{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
`

export function registerCaptionLocale(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(namespace, {
    en: {
      recording: 'Live transcription', connecting: 'Connecting microphone and ASR…', finishing: 'Finalizing transcription…',
      waiting: 'Speak to see words here as they arrive…', draft: 'Final text is added to your draft when recording stops.',
      autoSend: 'Final text and the current draft are sent when recording stops.',
    },
    zh: {
      recording: '实时识别中', connecting: '正在连接麦克风和识别服务…', finishing: '正在确认最终文字…',
      waiting: '请开始说话，文字会实时显示在这里…', draft: '停止录音后写入草稿，不会自动发送。',
      autoSend: '已开启自动发送，停止录音后连同原草稿一起发送。',
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
    if (!active) return
    panel.current!.setAttribute('popover', 'manual')
    const place = () => {
      const rect = anchor.current!.getBoundingClientRect()
      setPosition({ right: Math.max(16, window.innerWidth - rect.right), bottom: window.innerHeight - rect.top + 10 })
    }
    place()
    panel.current!.showPopover()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [active, anchor])
  useEffect(() => {
    if (body.current) body.current.scrollTop = body.current.scrollHeight
  }, [state.preview, state.phase])
  if (!active) return null
  const t = locale.bind(namespace)
  return <section ref={panel} className="listener-caption" style={position} role="status" aria-live="polite" aria-atomic="true">
    <div className="listener-caption-heading">{t(state.phase === 'finishing' ? 'finishing' : state.phase === 'requesting' ? 'connecting' : 'recording')}</div>
    <p ref={body} className="listener-caption-body">{state.preview || t('waiting')}</p>
    <div className="listener-caption-hint">{t(autoSend ? 'autoSend' : 'draft')}</div>
  </section>
}
