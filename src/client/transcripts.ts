export interface TranscriptRecord {
  text: string
  finalized: boolean
  interrupted: boolean
}

const records = new Map<string, TranscriptRecord>()
const subscribers = new Map<string, Set<() => void>>()

export function getTranscript(sessionId: string): TranscriptRecord | undefined {
  return records.get(sessionId)
}

export function subscribeTranscript(sessionId: string, listener: () => void): () => void {
  let listeners = subscribers.get(sessionId)
  if (!listeners) subscribers.set(sessionId, listeners = new Set())
  listeners.add(listener)
  return () => {
    listeners!.delete(listener)
    if (!listeners!.size) subscribers.delete(sessionId)
  }
}

export function setTranscript(sessionId: string, record: TranscriptRecord): void {
  if (!record.text.trim()) return
  records.set(sessionId, { ...record })
  for (const listener of subscribers.get(sessionId) ?? []) listener()
}

export function clearTranscript(sessionId: string): void {
  if (!records.delete(sessionId)) return
  for (const listener of subscribers.get(sessionId) ?? []) listener()
}
