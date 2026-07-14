/**
 * Plura embed loader — standalone bundle for the <script> tag use-case.
 *
 * Usage (data-* attributes):
 *   <script
 *     src="https://chat.plura.ai/embed.js"
 *     data-flow-id="YOUR_FLOW_ID"
 *     data-primary-color="#7c3aed"
 *     data-bot-name="My Bot"
 *     data-mode="bubble"
 *     data-position="bottom-right"
 *     data-panel-width="360"
 *     data-panel-height="540"
 *     data-avatar-url="https://example.com/bot.png"
 *     data-placeholder="Ask me anything…"
 *     data-show-branding="false"
 *     data-session-persist="true"
 *     data-session-ttl-ms="86400000"
 *     data-z-index="9999"
 *     data-auto-open="false"
 *     data-welcome-message="Hi! How can I help?"
 *   ></script>
 *
 * Usage (window.PluraConfig — also supports callbacks):
 *   <script>
 *     window.PluraConfig = {
 *       flowId: 'YOUR_FLOW_ID',
 *       primaryColor: '#7c3aed',
 *       onOpen: () => console.log('opened'),
 *       onFlowEnd: () => console.log('ended'),
 *     }
 *   </script>
 *   <script src="https://chat.plura.ai/embed.js"></script>
 *
 * data-* attributes always override window.PluraConfig values.
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { ChatWidget, type ChatWidgetProps } from '../src/ChatWidget'
import '../src/index.css'

// ─── PluraConfig global type ──────────────────────────────────────────────────

declare global {
  interface Window {
    PluraConfig?: Partial<ChatWidgetProps>
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function attr(el: HTMLScriptElement, name: string): string | undefined {
  const v = el.getAttribute(name)
  return v === null ? undefined : v
}

function boolAttr(el: HTMLScriptElement, name: string): boolean | undefined {
  const v = attr(el, name)
  if (v === undefined) return undefined
  return v !== 'false' && v !== '0'
}

function numAttr(el: HTMLScriptElement, name: string): number | undefined {
  const v = attr(el, name)
  if (v === undefined) return undefined
  const n = Number(v)
  return isNaN(n) ? undefined : n
}

// ─── Find this script tag ────────────────────────────────────────────────────

function currentScript(): HTMLScriptElement | null {
  // document.currentScript works during synchronous execution
  if (document.currentScript) return document.currentScript as HTMLScriptElement
  // fallback: last script with src ending in embed.js
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'))
  return scripts.findLast((s) => /embed\.js/.test(s.src)) ?? null
}

// ─── Build props from data-* + window.PluraConfig ────────────────────────────

function resolveProps(): ChatWidgetProps | null {
  const script = currentScript()
  const global = window.PluraConfig ?? {}

  // data-* takes precedence over window.PluraConfig
  const flowId =
    (script ? attr(script, 'data-flow-id') : undefined) ??
    global.flowId

  if (!flowId) {
    console.error('[Plura] Missing flow ID. Set data-flow-id on the <script> tag or window.PluraConfig.flowId.')
    return null
  }

  const props: ChatWidgetProps = {
    // spread global config first (gives us callbacks + any extra props)
    ...global,
    flowId,
  }

  if (!script) return props

  // Override with data-* values where present
  const mode = attr(script, 'data-mode') as ChatWidgetProps['mode']
  if (mode) props.mode = mode

  const primaryColor = attr(script, 'data-primary-color')
  if (primaryColor) props.primaryColor = primaryColor

  const avatarUrl = attr(script, 'data-avatar-url')
  if (avatarUrl) props.avatarUrl = avatarUrl

  const botName = attr(script, 'data-bot-name')
  if (botName) props.botName = botName

  const placeholder = attr(script, 'data-placeholder')
  if (placeholder) props.placeholder = placeholder

  const position = attr(script, 'data-position') as ChatWidgetProps['position']
  if (position) props.position = position

  const panelWidth = numAttr(script, 'data-panel-width')
  if (panelWidth !== undefined) props.panelWidth = panelWidth

  const panelHeight = numAttr(script, 'data-panel-height')
  if (panelHeight !== undefined) props.panelHeight = panelHeight

  const showBranding = boolAttr(script, 'data-show-branding')
  if (showBranding !== undefined) props.showBranding = showBranding

  const sessionPersist = boolAttr(script, 'data-session-persist')
  if (sessionPersist !== undefined) props.sessionPersist = sessionPersist

  const sessionTtlMs = numAttr(script, 'data-session-ttl-ms')
  if (sessionTtlMs !== undefined) props.sessionTtlMs = sessionTtlMs

  const zIndex = numAttr(script, 'data-z-index')
  if (zIndex !== undefined) props.zIndex = zIndex

  const autoOpen = boolAttr(script, 'data-auto-open')
  if (autoOpen !== undefined) props.autoOpen = autoOpen

  const welcomeMessage = attr(script, 'data-welcome-message')
  if (welcomeMessage) props.welcomeMessage = welcomeMessage

  return props
}

// ─── Mount ────────────────────────────────────────────────────────────────────

function mount() {
  const props = resolveProps()
  if (!props) return

  const container = document.createElement('div')
  container.id = 'plura-chat-root'
  document.body.appendChild(container)

  createRoot(container).render(React.createElement(ChatWidget, props))
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount)
} else {
  mount()
}
