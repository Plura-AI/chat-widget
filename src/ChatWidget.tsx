import { useEffect, useRef, useState, useCallback } from 'react'
import { PluraCore, type ChatOwner, type AssistantMessage, type ConnectionStatus } from './core'
import defaultAvatarSrc from './assets/default-chat-avatar.png'

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageRole = 'user' | 'assistant'
type MessageStatus = 'sending' | 'sent'

interface Message {
  localId: string
  role: MessageRole
  content: string
  status: MessageStatus
  name?: string
}

export interface ChatWidgetProps {
  // ── Connection ──────────────────────────────────────────────────────────────
  flowId: string
  record?: Record<string, unknown>
  /** Persist session in localStorage so refresh resumes the same chat. Default true. */
  sessionPersist?: boolean
  /** How long (ms) a stored session stays valid. Default 24h. */
  sessionTtlMs?: number

  // ── Appearance ──────────────────────────────────────────────────────────────
  /** 'bubble' = floating FAB + panel (default), 'inline' = always-visible */
  mode?: 'bubble' | 'inline'
  /** Brand color used for user bubbles, send button, dots, etc. Default '#7c3aed'. */
  primaryColor?: string
  /** Custom bot avatar URL. Defaults to the bundled avatar. */
  avatarUrl?: string
  /** Bot display name shown before the chatowner frame arrives. Default 'Plura'. */
  botName?: string
  /** Input field placeholder. Default 'Type a message…'. */
  placeholder?: string
  /** FAB / panel position in bubble mode. Default 'bottom-right'. */
  position?: 'bottom-right' | 'bottom-left'
  /** Panel width in px (bubble mode). Default 360. */
  panelWidth?: number
  /** Panel height in px (bubble mode). Default 540. */
  panelHeight?: number
  /** Show "Powered by Plura" branding. Default true. */
  showBranding?: boolean
  /** CSS z-index for the bubble container. Default 50. */
  zIndex?: number
  /** Open the panel immediately on mount (bubble mode). Default false. */
  autoOpen?: boolean
  /** Static first message shown instantly, before the WS connects. */
  welcomeMessage?: string

  // ── Callbacks ───────────────────────────────────────────────────────────────
  onOpen?: () => void
  onClose?: () => void
  /** Fired for every inbound assistant message — useful for analytics. */
  onMessage?: (content: string) => void
  onFlowEnd?: () => void
  onSessionStart?: (sessionId: string) => void
  onSessionResume?: (sessionId: string) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let localIdCounter = 0
const nextId = () => `local-${++localIdCounter}`

const LOADING_STATUSES: ConnectionStatus[] = ['idle', 'bootstrapping', 'connecting']

const DEFAULT_AVATAR = defaultAvatarSrc
const DEFAULT_PRIMARY = '#7c3aed'

function buildCssVars(primary: string): React.CSSProperties {
  return {
    '--plura-primary': primary,
    '--plura-primary-dark': `color-mix(in srgb, ${primary} 78%, black)`,
    '--plura-primary-light': `color-mix(in srgb, ${primary} 12%, white)`,
    '--plura-primary-faint': `color-mix(in srgb, ${primary} 8%, white)`,
  } as React.CSSProperties
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5'
  return (
    <svg className={`${cls} animate-spin`} style={{ color: 'var(--plura-primary)' }} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

function TypingIndicator({ avatarUrl }: { avatarUrl: string }) {
  return (
    <div className="flex items-end gap-2" style={{ animation: 'plura-msg-in 0.2s ease-out' }}>
      <img src={avatarUrl} alt="typing" className="w-6 h-6 rounded-full object-cover shrink-0" />
      <div className="flex items-center gap-1 bg-white border border-gray-100 shadow-sm px-3.5 py-3 rounded-2xl rounded-bl-sm">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full block"
            style={{
              backgroundColor: 'var(--plura-primary)',
              animation: `plura-dot 1.1s ease-in-out ${i * 0.18}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChatWidget({
  flowId,
  record,
  sessionPersist = true,
  sessionTtlMs,
  mode = 'bubble',
  primaryColor = DEFAULT_PRIMARY,
  avatarUrl = DEFAULT_AVATAR,
  botName = 'Plura',
  placeholder = 'Type a message…',
  position = 'bottom-right',
  panelWidth = 360,
  panelHeight = 540,
  showBranding = true,
  zIndex = 50,
  autoOpen = false,
  welcomeMessage,
  onOpen,
  onClose,
  onMessage: onMessageProp,
  onFlowEnd: onFlowEndProp,
  onSessionStart,
  onSessionResume,
}: ChatWidgetProps) {
  const initialMessages = (): Message[] =>
    welcomeMessage
      ? [{ localId: nextId(), role: 'assistant', content: welcomeMessage, status: 'sent' }]
      : []

  const [open, setOpen] = useState(mode === 'inline' || autoOpen)
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const [owner, setOwner] = useState<ChatOwner | null>(null)
  const [ended, setEnded] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  const coreRef = useRef<PluraCore | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const startedRef = useRef(false)
  const openRef = useRef(open)
  const recordRef = useRef(record)

  // keep openRef in sync; fire open/close callbacks
  useEffect(() => {
    const prev = openRef.current
    openRef.current = open
    if (open && !prev) onOpen?.()
    if (!open && prev) onClose?.()
  }, [open, onOpen, onClose])

  // reset unread when opening
  useEffect(() => {
    if (open) setUnreadCount(0)
  }, [open])

  // scroll to bottom on messages / typing change
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isTyping])

  // ── create core once per flowId ──
  useEffect(() => {
    startedRef.current = false

    const core = new PluraCore({
      flowId,
      record: recordRef.current,
      sessionPersist,
      sessionTtlMs,
      onMessage: (msg: AssistantMessage) => {
        setIsTyping(false)
        setMessages((prev) => [
          ...prev,
          { localId: nextId(), role: 'assistant', content: msg.content, status: 'sent', name: msg.name },
        ])
        if (!openRef.current) setUnreadCount((c) => c + 1)
        onMessageProp?.(msg.content)
      },
      onRecv: (content: string) => {
        setMessages((prev) => {
          const idx = prev.findLastIndex(
            (m) => m.role === 'user' && m.status === 'sending' && m.content === content,
          )
          if (idx === -1) {
            return [...prev, { localId: nextId(), role: 'user', content, status: 'sent' }]
          }
          const updated = [...prev]
          updated[idx] = { ...updated[idx], status: 'sent' }
          return updated
        })
      },
      onChatOwner: (o: ChatOwner) => setOwner(o),
      onStatus: (s: ConnectionStatus) => setStatus(s),
      onFlowEnd: () => {
        setIsTyping(false)
        setEnded(true)
        onFlowEndProp?.()
      },
      onSessionStart,
      onSessionResume,
    })

    coreRef.current = core

    if (mode !== 'bubble') {
      startedRef.current = true
      core.start()
    }

    return () => {
      core.destroy()
      coreRef.current = null
      startedRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId, mode, sessionPersist, sessionTtlMs])

  // ── bubble: start on first open ──
  useEffect(() => {
    if (mode !== 'bubble' || !open || startedRef.current || !coreRef.current) return
    startedRef.current = true
    coreRef.current.start()
  }, [open, mode])

  // ── send ──
  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || status !== 'connected') return
    const ok = coreRef.current?.send(text)
    if (!ok) return
    setMessages((prev) => [
      ...prev,
      { localId: nextId(), role: 'user', content: text, status: 'sending' },
    ])
    setIsTyping(true)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [input, status])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
  }

  const handleRestart = () => {
    setMessages(welcomeMessage
      ? [{ localId: nextId(), role: 'assistant', content: welcomeMessage, status: 'sent' }]
      : [])
    setEnded(false)
    setIsTyping(false)
    setOwner(null)
    coreRef.current?.restart()
  }

  // ─── Derived states ───────────────────────────────────────────────────────────

  const isLoading = LOADING_STATUSES.includes(status)
  const isReconnecting = status === 'reconnecting'
  const isDisconnected = status === 'disconnected'
  const canSend = status === 'connected' && !ended
  const displayName = owner?.name ?? botName
  const cssVars = buildCssVars(primaryColor)

  // ─── Panel ────────────────────────────────────────────────────────────────────

  const panel = (
    <div
      className="flex flex-col bg-white rounded-2xl overflow-hidden w-full h-full border border-gray-200/80"
      style={{
        ...cssVars,
        boxShadow: '0 24px 48px -12px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)',
        animation: 'plura-slide-up 0.28s cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0 bg-white border-b border-gray-100">
        <div className="relative shrink-0">
          <img
            src={avatarUrl}
            alt={displayName}
            className="w-9 h-9 rounded-full object-cover ring-2 ring-white shadow-sm"
          />
          {status === 'connected' && (
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{displayName}</p>
          <p className={`text-xs mt-px ${
            status === 'connected' ? 'text-emerald-500' :
            status === 'ended' ? 'text-gray-400' :
            status === 'disconnected' ? 'text-red-400' :
            'text-amber-500'
          }`}>
            {status === 'connected' ? 'Online' :
             status === 'ended' ? 'Session ended' :
             status === 'disconnected' ? 'Disconnected' :
             status === 'reconnecting' ? 'Reconnecting…' :
             'Connecting…'}
          </p>
        </div>
        {mode === 'bubble' && (
          <button
            onClick={() => setOpen(false)}
            className="shrink-0 w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Reconnecting banner ── */}
      {isReconnecting && (
        <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-amber-50 border-b border-amber-100 shrink-0" style={{ animation: 'plura-fade-in 0.2s ease-out' }}>
          <Spinner size="sm" />
          <span className="text-xs text-amber-600 font-medium">Reconnecting…</span>
        </div>
      )}

      {/* ── Message area ── */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-4 py-4 relative"
        style={{ background: 'linear-gradient(to bottom, #fafafa, #ffffff)' }}
      >
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ animation: 'plura-fade-in 0.3s ease-out' }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--plura-faint)' }}>
              <Spinner />
            </div>
            <p className="text-xs text-gray-400 font-medium">Starting chat…</p>
          </div>
        )}

        {/* Disconnected state */}
        {isDisconnected && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center" style={{ animation: 'plura-fade-in 0.3s ease-out' }}>
            <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mb-1">
              <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">Connection lost</p>
            <p className="text-xs text-gray-400">Waiting to reconnect…</p>
          </div>
        )}

        {/* Messages */}
        {!isLoading && !isDisconnected && (
          <div className="space-y-2.5">
            {messages.length === 0 && status === 'connected' && (
              <div className="flex flex-col items-center justify-center pt-10 gap-2" style={{ animation: 'plura-fade-in 0.4s ease-out' }}>
                <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-sm">
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                </div>
                <p className="text-sm font-medium text-gray-700">{displayName}</p>
                <p className="text-xs text-gray-400">Say hello 👋</p>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.localId}
                className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                style={{ animation: 'plura-msg-in 0.22s ease-out' }}
              >
                {msg.role === 'assistant' && (
                  <img src={avatarUrl} alt="assistant" className="w-6 h-6 rounded-full object-cover shrink-0 shadow-sm" />
                )}

                <div
                  className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'text-white rounded-br-sm'
                      : 'bg-white border border-gray-100 shadow-sm text-gray-800 rounded-bl-sm'
                  }`}
                  style={msg.role === 'user' ? {
                    background: 'linear-gradient(135deg, var(--plura-primary), var(--plura-primary-dark))',
                  } : undefined}
                >
                  {msg.content}
                </div>

                {msg.role === 'user' && (
                  <span className="pb-0.5 shrink-0 select-none">
                    {msg.status === 'sending' ? (
                      <Spinner size="sm" />
                    ) : (
                      <svg className="w-3 h-3" style={{ color: 'var(--plura-primary)' }} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </span>
                )}
              </div>
            ))}

            {isTyping && <TypingIndicator avatarUrl={avatarUrl} />}

            {ended && (
              <div className="flex flex-col items-center gap-2 pt-3" style={{ animation: 'plura-fade-in 0.3s ease-out' }}>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="h-px w-12 bg-gray-200" />
                  <span>Conversation ended</span>
                  <span className="h-px w-12 bg-gray-200" />
                </div>
                <button
                  onClick={handleRestart}
                  className="mt-1 px-4 py-1.5 rounded-full text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ color: 'var(--plura-primary)', backgroundColor: 'var(--plura-primary-light)' }}
                >
                  Start a new chat
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Input ── */}
      <div className="shrink-0 px-3 py-3 bg-white border-t border-gray-100">
        <div
          className={`flex items-end gap-2 rounded-xl px-3 py-2 transition-colors ${
            canSend ? 'bg-gray-50 ring-1 ring-gray-200' : 'bg-gray-50 opacity-60'
          }`}
          style={canSend ? { '--tw-ring-color': 'var(--plura-primary)' } as React.CSSProperties : undefined}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            disabled={!canSend}
            placeholder={
              ended ? 'Session ended' :
              isLoading ? 'Connecting…' :
              isDisconnected || isReconnecting ? 'Reconnecting…' :
              placeholder
            }
            className="flex-1 resize-none text-sm text-gray-900 placeholder-gray-400 bg-transparent outline-none leading-relaxed disabled:cursor-not-allowed overflow-hidden"
            style={{ maxHeight: '128px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || !canSend}
            className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: input.trim() && canSend
                ? `linear-gradient(135deg, var(--plura-primary), var(--plura-primary-dark))`
                : '#e5e7eb',
            }}
            aria-label="Send"
          >
            <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
        {showBranding && (
          <p className="text-center text-[10px] text-gray-300 mt-2 select-none">Powered by Plura</p>
        )}
      </div>
    </div>
  )

  // ─── Bubble mode ──────────────────────────────────────────────────────────────

  if (mode === 'bubble') {
    const posClass = position === 'bottom-left'
      ? 'fixed bottom-5 left-5 flex flex-col items-start gap-3'
      : 'fixed bottom-5 right-5 flex flex-col items-end gap-3'

    return (
      <div className={posClass} style={{ zIndex, ...cssVars }}>
        {open && (
          <div style={{ width: panelWidth, height: panelHeight }}>
            {panel}
          </div>
        )}

        <button
          onClick={() => setOpen((v) => !v)}
          className="relative w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          style={{ background: `linear-gradient(135deg, var(--plura-primary), var(--plura-primary-dark))` }}
          aria-label={open ? 'Close chat' : 'Open chat'}
        >
          {!open && unreadCount > 0 && (
            <span
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white"
              style={{ animation: 'plura-slide-up 0.2s ease-out' }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
          {open ? (
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <img src={avatarUrl} alt="Chat" className="w-9 h-9 rounded-full object-cover" />
          )}
        </button>
      </div>
    )
  }

  // ─── Inline mode ─────────────────────────────────────────────────────────────

  return (
    <div className="w-full h-full" style={cssVars}>
      {panel}
    </div>
  )
}
