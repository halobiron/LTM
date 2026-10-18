# Syltalky Frontend

React + Vite web app for Syltalky.

---

## Stack

| Library | Purpose |
|---|---|
| React 18 | UI |
| Vite 5 | Build tool + dev server |
| React Router v6 | Client-side routing |
| Zustand | Global auth + user state |
| LiveKit Components React | WebRTC video/audio grid |
| Tiptap + Yjs | Collaborative rich-text notes (CRDT) |
| react-markdown + KaTeX | Markdown + math rendering (meeting summaries) |
| react-easy-crop | Avatar crop UI |

---

## Setup

```bash
npm install
npm run dev        # dev server at http://localhost:5173
npm run build      # production build → dist/
npm run preview    # serve dist/ locally
```

The backend is expected at `http://localhost:8001` by default. Override with:

```bash
VITE_API_URL=https://api.syltalky.pro.vn npm run build
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8001` | Backend base URL |
| `VITE_GOOGLE_CLIENT_ID` | — | Google OAuth client ID (optional) |

---

## Routing

| Path | Screen | Auth |
|---|---|---|
| `/` | LandingPage | Public |
| `/login` | LoginScreen | Guest only |
| `/register` | RegisterScreen | Guest only |
| `/forgot-password` | ForgotPasswordScreen | Guest only |
| `/check-inbox` | CheckInboxScreen | Public |
| `/reset-password` | ResetPasswordScreen | Public |
| `/verify-email` | EmailVerifiedScreen | Public |
| `/complete-profile` | CompleteProfileScreen | Public |
| `/home` | HomeScreen | Private |
| `/library` | LibraryScreen | Private |
| `/library/:meetingId` | MeetingDetailScreen | Private |
| `/meeting/:roomCode` | DeviceCheckScreen | Private |
| `/meeting/:roomCode/room` | MeetingRoomScreen | Private |

Private routes redirect to `/login` if no access token is found in Zustand. The meeting room screens are full-screen takeovers — they render outside `AppLayout`.

JWT access tokens are refreshed automatically every 25 minutes (5 minutes before expiry) by a background `TokenRefresher` component in the router tree.

---

## Screens

### Landing
- **LandingPage** — animated hero, bento feature grid, team section, scroll-reveal. Links to `/login` and `/register`.

### Auth flow
- **LoginScreen** — email + password, "Forgot password?" link, Google sign-in button.
- **RegisterScreen** — email, display name, gender toggle, password + confirm.
- **ForgotPasswordScreen** — sends reset email.
- **CheckInboxScreen** — static "check your email" message (used for both verify + reset).
- **ResetPasswordScreen** — token from email link + new password form.
- **EmailVerifiedScreen** — confirmation + redirect to login.
- **CompleteProfileScreen** — display name + gender after Google OAuth (new users only).

### Main app (inside AppLayout)
- **AppLayout** — wraps the main app. Renders `Sidebar` + `<Outlet>`.
- **Sidebar** — logo, "New Meeting" CTA, "Join with code" CTA, nav (Home, Library), user row (Settings modal + logout).
- **HomeScreen** — live meeting cards (with Rejoin / End) and ended meeting cards in a grid. Empty state for new users.
- **LibraryScreen** — all past meetings sorted by date, search, AI badge on summarised meetings.
- **MeetingDetailScreen** — tabs: LLM summary (rendered as Markdown) and full transcript.

### Settings modal (launched from Sidebar)
- **OverviewPanel** — display name edit, avatar upload + crop + remove.
- **AppearancePanel** — theme toggle (dark / light), language selector (VI / EN).
- **DevicesPanel** — camera preview, camera / mic / speaker selectors, mic level meter.
- **SubtitlesPanel** — font size, font family, live preview.
- **VoicePanel** — mode toggle (Design | Clone).
  - Design tab: tag builder for gender, age, pitch, style, accent (OmniVoice tags).
  - Clone tab: upload or record a reference clip, `AudioTrimmer` waveform review, inline profile rename, demo synthesis, profile list with delete.

### Meeting room (full-screen takeover)
- **DeviceCheckScreen** — camera preview, mic level, device selectors. Validates the room code with the backend on mount; redirects to `/home` if the room is already ended.
- **MeetingRoomScreen**:
  - Top bar: room code + copy · meeting timer · participant count badge.
  - Center: dynamic video grid (1–16 tiles, auto-pagination, screen-share presentation mode).
  - Bottom control bar: Mic · Cam · Screen Share · Raise Hand · Captions · TTS · Chat · Leave / End.
  - Right panel (slide-in): Chat · Captions · TTS · Participants · Polls · Notes · AI Chat.
  - Captions overlay: speaker name + live Vietnamese text per video tile.
  - TTS panel: text input + message history with replay, auto-plays incoming audio.
  - Collaborative notes: Tiptap editor synced via Yjs over WebSocket.
  - Host controls: kick, promote to co-host, waiting room (approve, deny, approve all).
  - Room-ended / kicked overlays with redirect back to `/home`.

---

## State management

Zustand store (`src/store/index.js`) holds:

- `accessToken` / `refreshToken` — persisted in `localStorage`.
- `user` — current user profile (id, email, display_name, gender, avatar_url).
- `setTokens`, `setUser`, `logout` — mutations.

All API calls read `accessToken` from the store and attach it as `Authorization: Bearer <token>`.

---

## API client

`src/api/client.js` exports a thin `apiFetch` wrapper that:
- Prepends `VITE_API_URL`.
- Attaches the bearer token.
- Throws on non-2xx responses with the backend error detail.

Domain-specific modules (`src/api/meetings.js`) wrap individual endpoints.

---

## Project structure

```
Syltalky_FE/
├── src/
│   ├── main.jsx                    ← React root, mounts <Router />
│   ├── App.jsx                     ← Theme provider wrapper
│   ├── router.jsx                  ← All routes + TokenRefresher + page transitions
│   ├── store/index.js              ← Zustand store (auth + user)
│   ├── styles/
│   │   ├── globals.css             ← CSS reset + custom properties
│   │   └── theme.js                ← Design tokens (colours, radii, shadows)
│   ├── api/
│   │   ├── client.js               ← apiFetch wrapper with auto token refresh
│   │   └── meetings.js             ← meetings API
│   ├── components/
│   │   ├── Sidebar.jsx             ← App sidebar
│   │   ├── UserAvatar.jsx          ← Shared avatar with fallback initials
│   │   ├── AudioTrimmer.jsx        ← Waveform trim UI for voice clone
│   │   └── AvatarCropper.jsx       ← react-easy-crop wrapper
│   ├── hooks/
│   │   └── useBreakpoint.js        ← Responsive breakpoint hook
│   ├── layouts/
│   │   └── AppLayout.jsx           ← Main app shell
│   └── screens/
│       ├── LandingPage.jsx
│       ├── HomeScreen.jsx
│       ├── LibraryScreen.jsx
│       ├── MeetingDetailScreen.jsx
│       ├── NotFoundScreen.jsx
│       ├── auth/                   ← Login, Register, ForgotPassword, …
│       ├── meeting/
│       │   ├── DeviceCheckScreen.jsx
│       │   ├── MeetingRoomScreen.jsx
│       │   └── useMeetingExtras.js ← Hook for pins, polls, notes, co-hosts
│       └── settings/               ← SettingsModal + panels
├── public/
│   └── favicon.ico
├── index.html
├── vite.config.js
└── package.json
```
