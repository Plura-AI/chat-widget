/**
 * <plura-chat> Custom Element
 *
 * A framework-agnostic Web Component wrapper around ChatWidget.
 * Works in Angular, Vue, Svelte, plain HTML — anywhere custom elements run.
 *
 * Usage:
 *   import '@useplura/chat/element'
 *
 *   <plura-chat flow-id="YOUR_FLOW_ID" primary-color="#7c3aed"></plura-chat>
 *
 * Angular: add CUSTOM_ELEMENTS_SCHEMA to your module/component schemas.
 * Vue:     no extra config needed (custom elements pass through by default).
 * Svelte:  no extra config needed.
 */

import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ChatWidget, type ChatWidgetProps } from './ChatWidget'
// CSS as a raw string so we can inject into the shadow root (full isolation)
import styles from './index.css?inline'

// ─── Attribute → prop mapping ─────────────────────────────────────────────────

type AttrType = 'string' | 'boolean' | 'number'

const ATTR_MAP: Array<[attr: string, prop: keyof ChatWidgetProps, type: AttrType]> = [
  ['flow-id',          'flowId',          'string'],
  ['primary-color',    'primaryColor',    'string'],
  ['avatar-url',       'avatarUrl',       'string'],
  ['bot-name',         'botName',         'string'],
  ['placeholder',      'placeholder',     'string'],
  ['mode',             'mode',            'string'],
  ['position',         'position',        'string'],
  ['panel-width',      'panelWidth',      'number'],
  ['panel-height',     'panelHeight',     'number'],
  ['show-branding',    'showBranding',    'boolean'],
  ['session-persist',  'sessionPersist',  'boolean'],
  ['session-ttl-ms',   'sessionTtlMs',    'number'],
  ['z-index',          'zIndex',          'number'],
  ['auto-open',        'autoOpen',        'boolean'],
  ['welcome-message',  'welcomeMessage',  'string'],
]

// ─── Element class ────────────────────────────────────────────────────────────

class PluraChatElement extends HTMLElement {
  private _root: Root | null = null

  static get observedAttributes() {
    return ATTR_MAP.map(([attr]) => attr)
  }

  connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' })

    const styleEl = document.createElement('style')
    styleEl.textContent = styles
    shadow.appendChild(styleEl)

    // Transparent wrapper so fixed/absolute positioning escapes the shadow host
    const container = document.createElement('div')
    container.style.cssText = 'display:contents'
    shadow.appendChild(container)

    this._root = createRoot(container)
    this._render()
  }

  attributeChangedCallback() {
    this._render()
  }

  disconnectedCallback() {
    this._root?.unmount()
    this._root = null
  }

  private _buildProps(): ChatWidgetProps {
    const props: Record<string, unknown> = {}
    for (const [attr, prop, type] of ATTR_MAP) {
      const raw = this.getAttribute(attr)
      if (raw === null) continue
      if (type === 'boolean') props[prop] = raw !== 'false' && raw !== '0'
      else if (type === 'number') { const n = Number(raw); if (!isNaN(n)) props[prop] = n }
      else props[prop] = raw
    }
    return props as unknown as ChatWidgetProps
  }

  private _render() {
    if (!this._root) return
    this._root.render(React.createElement(ChatWidget, this._buildProps()))
  }
}

// ─── Register ─────────────────────────────────────────────────────────────────

if (typeof customElements !== 'undefined' && !customElements.get('plura-chat')) {
  customElements.define('plura-chat', PluraChatElement)
}
