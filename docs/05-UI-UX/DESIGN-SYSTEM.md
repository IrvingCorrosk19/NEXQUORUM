# Design System — ASAMBLEAS Assembly Room

**EO:** EO-001  
**Stack:** Static HTML + CSS + ES modules (no React/Vue/Angular/Blazor)

## Principles

1. **Brand first** — `ASAMBLEAS` is the hero signal on login and room header.
2. **One job per section** — stage, participants, agenda, motion, vote, speakers.
3. **Trust / governance look** — deep teal + slate + gold accent; avoid purple-on-white, cream+terracotta, and dark-mode-by-default.
4. **Atmosphere** — soft teal/gold radial washes over a cool surface gradient (`tokens.css`).
5. **Accessibility** — visible focus rings, skip links, labeled controls, `aria-live` for quorum/connection, dialog-ready patterns, keyboard-operable actions.
6. **Motion with purpose** — fade-rise on composition load; connection status transitions; respect `prefers-reduced-motion`.

## Typography

| Role | Family |
|------|--------|
| Display / brand | Source Serif 4 |
| Body / UI | DM Sans |

Loaded via Google Fonts on `index.html` and `assembly.html`.

## Color tokens (`wwwroot/css/tokens.css`)

| Token | Role |
|-------|------|
| `--color-teal-900/700/500` | Primary actions, brand, live states |
| `--color-gold-500/300` | Accent CTA (request to speak) |
| `--color-ink` / `--color-slate` | Text hierarchy |
| `--color-surface*` | Panels and strips |
| `--color-success/warning/danger` | Quorum / connection / destructive |

## Layout

- **Login** — single centered composition: brand, one lede, form, demo user picker.
- **Assembly room** — header (brand · PH · live quorum), main stage + participant strip + actions, sidebar (agenda / motion / vote / speakers).

## Files

- `css/tokens.css` — design tokens
- `css/base.css` — reset, typography, a11y helpers
- `css/components.css` — buttons, fields, badges, skeletons, login
- `css/assembly-room.css` — room grid and stage

## Realtime

SignalR events use names from `Asambleas.Contracts.Realtime.RealtimeEventNames` (camelCase on the wire via hub `SendAsync`).
