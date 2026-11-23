# ابعتلي — Realtime Messaging Web Client

A complete React + TypeScript frontend for the **Realtime Messaging System** REST API and Socket.IO server described in the supplied Frontend Integration Guide.

## Features

### Accounts and profiles
- Register and log in with the API's validation rules.
- Restore a session on page reload through `POST /auth/refresh`.
- Keep the short-lived access token in memory only. The refresh token remains in the browser-managed HttpOnly cookie.
- Rotate the access/refresh session proactively and retry REST requests once when the API returns `401 TOKEN_EXPIRED`.
- Update your display name and HTTPS avatar URL, and log out.

### Conversations and people
- Cursor-paginated conversation listing; the client fetches all pages during initial and reconnect synchronization.
- Create direct conversations and groups.
- Search users by username/display name and view public user profiles.
- Rename groups, add/remove members, and leave groups with role-aware controls.
- Show online presence, offline last-seen information, unread counts, and group membership.

### Messages and realtime behavior
- Load the latest message history and page backwards for older messages.
- Send text messages and replies through Socket.IO acknowledgements.
- Use a UUID `clientMessageId` for idempotent sends, with a local pending/failed state and bounded retries with exponential backoff.
- Receive live messages, deduplicate them, and recover sequence gaps with `afterSeq` history requests.
- Soft-delete messages using the Socket.IO event with the REST delete route as a fallback.
- Mark messages delivered/read and derive sent/delivered/read indicators from the conversation receipt watermarks.
- Send typing start/stop events with throttling and display incoming typing indicators.
- Maintain presence with the documented 25-second heartbeat and reconnect automatically.
- React to conversation creation/update/removal, presence updates, message deletion, receipt changes, and socket rate-limit events.

### Diagnostics
- Check `/health` and `/ready`, including the reported Postgres and Redis dependency checks.

## Requirements

- Node.js 20 or newer is recommended.
- The backend must be running and reachable from the browser.
- The backend must allow the frontend origin through CORS **with credentials enabled** because refresh uses an HttpOnly cookie.

## Run locally

1. Extract the ZIP and open a terminal in this folder.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` (or create `.env.local`) and confirm the URLs:

   ```env
   VITE_API_URL=http://localhost:3000/api/v1
   VITE_SOCKET_URL=http://localhost:3000
   ```

   `VITE_API_URL` includes `/api/v1`. `VITE_SOCKET_URL` is the Socket.IO origin and must not include `/api/v1`. When `VITE_SOCKET_URL` is omitted, the client derives it from the REST URL.

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open the Vite URL printed in the terminal (normally `http://localhost:5173`).

Build for production with:

```bash
npm run build
```

The static site is generated in `dist/`. Configure your production web server to serve `index.html` for application routes and set the two `VITE_*` values to your deployed backend URLs at build time.

## Backend integration notes

### CORS and cookies

The browser sends `credentials: 'include'` on API requests. Configure the backend CORS policy to allow the exact frontend origin and credentials; do not use `Access-Control-Allow-Origin: *` with credentials. For production deployments on different sites, the backend cookie's `SameSite=Lax` setting may not be sufficient; the API cookie policy and HTTPS deployment topology must be compatible with the frontend origin.

### Socket.IO

The client connects to the configured Socket.IO origin with:

- `transports: ['websocket']`
- `auth: { token: accessToken }`
- automatic reconnection enabled

It does not enable polling fallback, matching the server contract.

### API scope

The UI is built around the endpoints and event payloads in the supplied guide. The API currently documents text messages only; this frontend does not invent attachment upload, audio/video calling, message editing, reactions, blocking, or message-search endpoints that the backend does not expose.

### Group delivery/read receipts

The API's conversation receipt values are aggregate minimum watermarks across peers. The UI uses those values for message status. For direct conversations, live `message:status` events can advance the displayed peer watermark. For groups, the client waits for the server's refreshed aggregate conversation DTO rather than pretending one member's receipt represents every member.

### Message ordering and history

Server messages are displayed in ascending `seq` order. The newest-first REST page is sorted client-side; older pages are merged by message ID; live sequence gaps trigger `afterSeq` fetches. Opaque conversation cursors are passed back to the API as received and are not decoded or constructed by the client.

## Project structure

```text
src/
  components/      Auth, sidebar, chat, composer, profile and diagnostics UI
  context/         Authentication and realtime chat state
  lib/             REST client, token refresh, socket URL and message helpers
  types.ts         API and Socket.IO DTO types
  App.tsx
  main.tsx
  styles.css
```

## Notes

- Access tokens are never written to `localStorage` or `sessionStorage`.
- Refresh-token rotation is handled by the browser cookie and `POST /auth/refresh`.
- Browser-local optimistic messages are held in memory only; the backend's `clientMessageId` provides idempotency for retrying a send within the active page session.
- The app is intentionally focused on the capabilities documented by the supplied API contract. Backend behavior not represented in that contract is not assumed.
