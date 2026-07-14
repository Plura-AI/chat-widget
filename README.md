# @useplura/chat

Embeddable chat widget for [usePlura](https://plura.ai) flows. Drop it into any React app or paste one `<script>` tag — same component, three distribution formats.

---

## Install

```bash
npm install @useplura/chat
```

> **Peer dependencies:** React ≥ 18 and ReactDOM ≥ 18 must already be installed in your project.

---

## Quick start (React)

```tsx
import { ChatWidget } from '@useplura/chat'

export default function App() {
  return (
    <ChatWidget
      flowId="YOUR_FLOW_ID"
    />
  )
}
```

No CSS import needed — styles are injected automatically.

---

## Props

### Connection

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `flowId` | `string` | **required** | Your Plura flow ID |
| `record` | `object` | `{}` | Arbitrary lead data attached to the session (name, email, userId, etc.) |
| `sessionPersist` | `boolean` | `true` | Store session in `localStorage` so page refresh resumes the same chat |
| `sessionTtlMs` | `number` | `86400000` | How long (ms) a stored session stays valid. Default 24h |

### Appearance

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `mode` | `'bubble' \| 'inline'` | `'bubble'` | `bubble` = floating FAB + panel, `inline` = fills its container |
| `primaryColor` | `string` | `'#7c3aed'` | Brand color — drives user bubbles, send button, typing dots, and all accents |
| `avatarUrl` | `string` | bundled avatar | Custom bot avatar URL |
| `botName` | `string` | `'Plura'` | Bot display name shown before the server sends its own |
| `placeholder` | `string` | `'Type a message…'` | Input field placeholder |
| `position` | `'bottom-right' \| 'bottom-left'` | `'bottom-right'` | FAB position (bubble mode only) |
| `panelWidth` | `number` | `360` | Panel width in px (bubble mode) |
| `panelHeight` | `number` | `540` | Panel height in px (bubble mode) |
| `showBranding` | `boolean` | `true` | Show "Powered by Plura" footer |
| `zIndex` | `number` | `50` | CSS z-index of the bubble container |
| `autoOpen` | `boolean` | `false` | Open the panel immediately on mount (bubble mode) |
| `welcomeMessage` | `string` | — | Static first message shown instantly, before the WebSocket connects |

### Callbacks

| Prop | Type | Description |
|------|------|-------------|
| `onOpen` | `() => void` | Panel opened |
| `onClose` | `() => void` | Panel closed |
| `onMessage` | `(content: string) => void` | Fires for every inbound assistant message — useful for analytics |
| `onFlowEnd` | `() => void` | Flow ended |
| `onSessionStart` | `(sessionId: string) => void` | New session bootstrapped |
| `onSessionResume` | `(sessionId: string) => void` | Existing session resumed on reload |

---

## Examples

### Custom brand color + inline mode

```tsx
<ChatWidget
  flowId="YOUR_FLOW_ID"
  mode="inline"
  primaryColor="#0ea5e9"
  botName="Support"
  welcomeMessage="Hi there! How can I help you today?"
  showBranding={false}
/>
```

### Identify your user

```tsx
<ChatWidget
  flowId="YOUR_FLOW_ID"
  record={{
    userId: user.id,
    email: user.email,
    name: user.name,
    plan: 'pro',
  }}
/>
```

### Analytics hooks

```tsx
<ChatWidget
  flowId="YOUR_FLOW_ID"
  onOpen={() => analytics.track('chat_opened')}
  onMessage={(content) => analytics.track('assistant_message', { content })}
  onFlowEnd={() => setShowSurvey(true)}
  onSessionStart={(id) => console.log('new session', id)}
  onSessionResume={(id) => console.log('resumed', id)}
/>
```

### Left-side bubble + larger panel

```tsx
<ChatWidget
  flowId="YOUR_FLOW_ID"
  position="bottom-left"
  panelWidth={420}
  panelHeight={600}
/>
```

### No session persistence (fresh chat every page load)

```tsx
<ChatWidget
  flowId="YOUR_FLOW_ID"
  sessionPersist={false}
/>
```

---

## `<script>` embed (no React required)

No build step, no React needed on the host page. Served via CDN directly from npm.

### CDN URLs

**jsDelivr** (recommended):
```
https://cdn.jsdelivr.net/npm/@useplura/chat@latest/dist/embed/embed.js
```

**unpkg:**
```
https://unpkg.com/@useplura/chat@latest/dist/embed/embed.js
```

> Pin to a specific version in production (e.g. `@0.1.4`) so your clients' sites are never affected by future updates.

### Usage — `data-*` attributes

```html
<script
  src="https://cdn.jsdelivr.net/npm/@useplura/chat@latest/dist/embed/embed.js"
  data-flow-id="YOUR_FLOW_ID"
  data-primary-color="#7c3aed"
  data-bot-name="Support"
  data-mode="bubble"
  data-position="bottom-right"
  data-welcome-message="Hi! How can I help?"
  data-show-branding="false"
  data-session-persist="true"
  data-auto-open="false"
></script>
```

All props are available as `data-*` attributes. Boolean props accept `"true"` / `"false"`, numbers are plain strings.

### Usage — `window.PluraConfig` (supports callbacks)

```html
<script>
  window.PluraConfig = {
    flowId: 'YOUR_FLOW_ID',
    primaryColor: '#0ea5e9',
    botName: 'Support',
    welcomeMessage: 'Hi! How can I help?',
    onOpen: () => console.log('chat opened'),
    onFlowEnd: () => document.getElementById('survey').style.display = 'block',
    onMessage: (content) => console.log('assistant:', content),
  }
</script>
<script src="https://cdn.jsdelivr.net/npm/@useplura/chat@latest/dist/embed/embed.js"></script>
```

`data-*` attributes always override `window.PluraConfig` values. Use `window.PluraConfig` when you need callbacks, since functions can't be passed as HTML attributes.

---

## TypeScript

Full types are included. No `@types/` package needed.

```ts
import type { ChatWidgetProps } from '@useplura/chat'
```

---

## License

MIT © [Verification Technologies LLC](https://plura.ai)
