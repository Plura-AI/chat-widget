# CLAUDE.md — Plura Embeddable Chat Widget

Context file for Claude Code. Read this before making changes — it captures what we're building, the exact backend protocol we must match, and the architecture decisions already made so we don't re-litigate them.

---

## What we're building

A single, hand-written chat widget component (no assistant-ui, no shadcn, no monorepo tooling) that connects to Plura's existing flow/agent backend over WebSocket. One codebase, three distribution outputs:

1. **`<script>` embed** — clients paste one line on their website, get a chat bubble.
2. **npm package** (`@plura/chat`) — developers `npm install` it into their own React app.
3. **iframe** — clients embed `chat.plura.ai/embed?flowId=...` directly in a page.

All three import the same core connection logic and the same UI component. Build once, ship three ways.

**Explicit non-goals right now:** no multi-tenant dashboard yet, no monorepo, no assistant-ui/shadcn, no theming system yet, no analytics yet. First priority is **one working chat, hardcoded to one flow, end to end.** Everything else comes after that works.

---

## Project structure (plain, no monorepo)

```
plura-chat/
├─ src/
│  ├─ core.ts          → connection logic ONLY: session bootstrap, websocket,
│  │                      reconnect, persistence, ping. No UI/React here.
│  ├─ ChatWidget.tsx    → the actual chat UI: message list, input, bubble/inline modes.
│  ├─ index.ts          → exports for npm consumers.
├─ embed/
│  └─ loader.ts         → tiny script that mounts ChatWidget into document.body
│                          for the <script> tag use-case (no host React needed).
├─ dist/                → build output — this is what gets published/hosted.
├─ package.json
└─ vite.config.ts       → Vite library mode: builds both the npm bundle and the
                           standalone embed bundle from the same source.
```

Tooling: **Vite + React + TypeScript**. No Next.js, no Turborepo, no CLI-scaffolded UI kits. Keep it to as few files as possible.

---

## The backend protocol (already exists — do not redesign, just implement against it)

### 1. Session bootstrap (REST)

```
POST https://hooks.plura.ai/webchat/session
Content-Type: application/json

{
  "record": { "token": "..." },   // arbitrary lead data bag; client can store anything here
  "flow_id": "3157c707-5361-4347-86a8-ab18bd5a2d8e"
}
```

Response:
```json
{
  "flow_id": "3157c707-5361-4347-86a8-ab18bd5a2d8e",
  "flow_port": 8088,
  "wss_test_url": "wss.plura.ai",
  "session": "webchat-session.3efb460f-da24-4057-a533-8bb2d57d10dd"
}
```

- `record` is a free-form object — lead attributes, tokens, anything the client wants attached to this session.
- `session` is the session id to use when opening the WebSocket.
- `wss_test_url` is the WS host to connect to (currently a "test" URL — expect this to become a stable production host later).

### 2. WebSocket connection

```
wss://<wss_test_url>/webchat/flow/<flow_id>/session/<session_id>/r/<bool>
```

Example:
```
wss://wss.plura.ai/webchat/flow/3157c707-5361-4347-86a8-ab18bd5a2d8e/session/webchat-session.8b0681b1-308b-40b7-8903-d6fea3f87f37/r/true
```

- The `/r/true` (or `false`) flag: our working interpretation is **resume vs. fresh** — `true` reconnects to an existing session, distinguishing a resumed connection from a brand-new one. **Not yet confirmed with backend — verify before relying on it further.**

### 3. Inbound frames (server → client)

```json
{"type":"session","id":"...","session_id":"webchat-session.35889b91-94a5-4595-a721-a0022a2f5121"}
{"type":"chatowner","id":"...","profilepic":"https://...","name":"Flow Tester"}
{"type":"message","id":"...","profilepic":"https://...","name":"Assistant","content":"Hey, I'm Plura..."}
{"type":"recv","id":"...","profilepic":"...","name":"Anonymous","content":"hey"}
```

- **`session`** — connection acknowledgment; carries the canonical `session_id`. Treat this as the source of truth — if it differs from what we sent, update our stored session id.
- **`chatowner`** — flow branding info (name + avatar) to show in the chat header.
- **`message`** — an assistant message. Field is `content` (not `message`).
- **`recv`** — server's acknowledgment that it received our sent user message. Correlate to our optimistic local message so we can mark it "sent" instead of "sending."

### 4. Outbound frames (client → server)

```json
{"type":"ping","ts":1784026361141}
{"message":"hey","type":"message"}
```

- **`ping`** — heartbeat, sent periodically (we send every ~30s) with a client timestamp.
- **`message`** — sending a user message. Note: outbound field is `message`, inbound assistant field is `content`. Don't confuse the two.

### 5. Flow-end signal

```json
{"type":"message","id":"d6661e25-f990-4eca-9444-dd823f46ca0f","name":"Assistant","profilepic":"...","content":"Flow has ended"}
```

- Currently detected by **string-matching `content === "Flow has ended"`** inside a normal `message` frame. This is fragile (breaks if the copy changes) — flagged as a candidate for a dedicated `{"type":"flow_end"}` frame from backend, but not yet implemented server-side. Until then, the client must check for this exact string.
- When detected: stop sending, clear any persisted session for this flow, and offer the user a way to start a new session (fresh call to `POST /webchat/session`).

---

## Key architecture decisions already made

**Session persistence fixes the "refresh = new session" problem.**
Every page load was doing a fresh bootstrap POST, which is why refreshing gave a different session id. Fix: persist `{sessionId, flowId, record}` (e.g. localStorage) after bootstrap. On next load, skip the bootstrap entirely and reconnect straight to the WS using the stored `sessionId` with `/r/true`. Only bootstrap fresh when: nothing is stored, the stored session is past a TTL (e.g. 24h), or the flow has ended.

**Reconnect/heartbeat.**
- Ping every ~30s to keep the connection alive.
- On unexpected disconnect, reconnect with exponential backoff (and jitter), reusing the same session id + `/r/true`.
- On flow-end, do NOT reconnect — session is dead, requires an explicit user-triggered restart.

**Message reconciliation.**
User messages are rendered optimistically (status: "sending") the moment the user hits send, then flipped to "sent" when a matching `recv` frame arrives. Current matching is by exact `content` text — acknowledged limitation (breaks on duplicate messages sent in a row). A `client_msg_id` echoed back in `recv` would fix this properly; not yet available from backend.

**No third-party UI library for the chat itself.**
Assistant-ui was tried and rejected — too much scaffolding (shadcn, CLI-generated files, multi-thread assumptions) for what we need, which is a single persistent chat window, not a ChatGPT-style multi-conversation app. We hand-write the UI: message list + input + typing indicator + bubble/inline layout modes. Kept deliberately small (~150 lines), no external chat dependency.

**No monorepo (for now).**
Turborepo/monorepo split was considered and dropped — premature until there's an actual second separate app (like a client dashboard) that needs independent deployment. One plain Vite project for now.

**Distribution model.**
One core (`core.ts` for connection logic + `ChatWidget.tsx` for UI), three thin wrappers around it:
- `embed/loader.ts` bundles everything (including React) standalone for the `<script>` tag, since host pages won't have React.
- `src/index.ts` exports the same components as a normal npm package for developers with their own React app.
- The iframe surface is the same `ChatWidget` rendered on a minimal standalone page that reads `flowId` from URL query params.

---

## Open questions / things to confirm with backend before hardening further

1. Does `/r/true` vs `/r/false` actually mean resume-vs-fresh, or something else? Confirm before depending on it more heavily.
2. Can `recv` be extended to echo back a client-generated `client_msg_id`, to replace text-matching for message ack correlation?
3. Can flow-end become a distinct frame type (`{"type":"flow_end"}`) instead of a magic string inside `message.content`?
4. Is `wss_test_url` going to become a stable, versioned production host, or does the hostname change per environment/region?
5. Can sessions be keyed server-side to a stable `record.token` (not just the browser's local storage), so an identified lead resumes their conversation across devices, not just on the same browser?

---

## Current build priority order

1. One working chat, hardcoded to a single test `flow_id` — no theming, no multi-tenant, no polish. Just prove session bootstrap → WS connect → send/receive → flow-end works.
2. Session persistence (localStorage) so refresh resumes instead of restarting.
3. Package it as the `<script>` embed loader, test on an actual external test page.
4. Package as npm (`@plura/chat`).
5. Add the iframe surface.
6. Only after all of the above work: theming/customization, multi-tenant config, analytics, rate limiting.