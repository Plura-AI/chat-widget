const BOOTSTRAP_URL = 'https://hooks.plura.ai/webchat/session'
const SESSION_KEY_PREFIX = 'plura_session_'
const DEFAULT_SESSION_TTL_MS = 48 * 60 * 60 * 1000
const PING_INTERVAL_MS = 30_000
const MAX_RECONNECT_DELAY_MS = 30_000

export type ConnectionStatus =
  | 'idle'
  | 'bootstrapping'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'ended'

export interface ChatOwner {
  id: string
  name: string
  profilepic: string
}

export interface AssistantMessage {
  id: string
  name: string
  profilepic: string
  content: string
}

export interface PluraCoreOptions {
  flowId: string
  record?: Record<string, unknown>
  /** Store session in localStorage and resume on reload. Default true. */
  sessionPersist?: boolean
  /** How long (ms) a stored session stays valid. Default 24h. */
  sessionTtlMs?: number
  onMessage: (msg: AssistantMessage) => void
  onRecv: (content: string) => void
  onChatOwner: (owner: ChatOwner) => void
  onStatus: (status: ConnectionStatus) => void
  onFlowEnd: () => void
  onSessionStart?: (sessionId: string) => void
  onSessionResume?: (sessionId: string) => void
}

interface StoredSession {
  sessionId: string
  flowId: string
  record: Record<string, unknown>
  wssUrl: string
  ts: number
}

export class PluraCore {
  private opts: PluraCoreOptions
  private ws: WebSocket | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private ended = false
  private destroyed = false
  private sessionId: string | null = null
  private wssUrl: string | null = null
  private abortController: AbortController | null = null

  private get persist() { return this.opts.sessionPersist ?? true }
  private get ttl() { return this.opts.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS }

  constructor(opts: PluraCoreOptions) {
    this.opts = opts
  }

  async start() {
    const stored = this.loadSession()
    if (stored) {
      this.sessionId = stored.sessionId
      this.wssUrl = stored.wssUrl
      this.opts.onSessionResume?.(stored.sessionId)
      this.connect(true)
    } else {
      await this.bootstrap()
    }
  }

  private async bootstrap() {
    this.opts.onStatus('bootstrapping')
    this.abortController = new AbortController()
    try {
      const res = await fetch(BOOTSTRAP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record: this.opts.record ?? {},
          flow_id: this.opts.flowId,
        }),
        signal: this.abortController.signal,
      })
      if (this.destroyed) return
      const data = await res.json()
      if (this.destroyed) return
      this.sessionId = data.session
      this.wssUrl = data.wss_test_url
      this.saveSession({
        sessionId: data.session,
        flowId: this.opts.flowId,
        record: this.opts.record ?? {},
        wssUrl: data.wss_test_url,
        ts: Date.now(),
      })
      this.opts.onSessionStart?.(data.session)
      this.connect(false)
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      console.error('[PluraCore] bootstrap failed', err)
      this.opts.onStatus('disconnected')
    }
  }

  private connect(resume: boolean) {
    this.opts.onStatus('connecting')
    const url = `wss://${this.wssUrl}/webchat/flow/${this.opts.flowId}/session/${this.sessionId}/r/${resume}`
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.opts.onStatus('connected')
      this.startPing()
    }

    this.ws.onmessage = (e) => {
      try {
        const frame = JSON.parse(e.data as string) as Record<string, unknown>
        this.handleFrame(frame)
      } catch {
        // ignore malformed frames
      }
    }

    this.ws.onclose = () => {
      this.stopPing()
      if (!this.ended) this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      this.ws?.close()
    }
  }

  private handleFrame(frame: Record<string, unknown>) {
    switch (frame.type) {
      case 'session': {
        const incoming = frame.session_id as string | undefined
        if (incoming && incoming !== this.sessionId) {
          this.sessionId = incoming
          this.patchStoredSession(incoming)
        }
        break
      }
      case 'chatowner': {
        this.opts.onChatOwner({
          id: frame.id as string,
          name: frame.name as string,
          profilepic: frame.profilepic as string,
        })
        break
      }
      case 'message': {
        const content = frame.content as string
        if (content === 'Flow has ended') {
          this.ended = true
          this.clearSession()
          this.ws?.close()
          this.opts.onStatus('ended')
          this.opts.onFlowEnd()
        } else {
          this.opts.onMessage({
            id: frame.id as string,
            name: frame.name as string,
            profilepic: frame.profilepic as string,
            content,
          })
        }
        break
      }
      case 'recv': {
        this.opts.onRecv(frame.content as string)
        break
      }
    }
  }

  send(text: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'message', message: text }))
      return true
    }
    return false
  }

  restart() {
    this.ended = false
    this.destroyed = false
    this.reconnectAttempts = 0
    this.clearSession()
    this.bootstrap()
  }

  destroy() {
    this.destroyed = true
    this.ended = true
    this.abortController?.abort()
    this.stopPing()
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }

  // --- ping ---

  private startPing() {
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }))
      }
    }, PING_INTERVAL_MS)
  }

  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
  }

  // --- reconnect ---

  private scheduleReconnect() {
    this.opts.onStatus('reconnecting')
    const jitter = Math.random() * 500
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts + jitter, MAX_RECONNECT_DELAY_MS)
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => this.connect(true), delay)
  }

  // --- session persistence ---

  private storageKey() {
    return `${SESSION_KEY_PREFIX}${this.opts.flowId}`
  }

  private loadSession(): StoredSession | null {
    if (!this.persist) return null
    try {
      const raw = localStorage.getItem(this.storageKey())
      if (!raw) return null
      const s: StoredSession = JSON.parse(raw)
      if (Date.now() - s.ts > this.ttl) {
        localStorage.removeItem(this.storageKey())
        return null
      }
      return s
    } catch {
      return null
    }
  }

  private saveSession(s: StoredSession) {
    if (!this.persist) return
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(s))
    } catch {
      // storage quota or unavailable
    }
  }

  private patchStoredSession(newSessionId: string) {
    const s = this.loadSession()
    if (s) this.saveSession({ ...s, sessionId: newSessionId })
  }

  private clearSession() {
    try {
      localStorage.removeItem(this.storageKey())
    } catch {
      // ignore
    }
  }
}
