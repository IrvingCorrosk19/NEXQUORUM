# ASAMBLEAS Design System V3

## Direction
Executive Governance SaaS — dark navy surfaces, teal/cyan interaction, gold authority accents.

## Tokens
Source: `wwwroot/css/tokens.css`

- Surfaces: `--surface-base`, `--surface-primary`, `--surface-elevated`, `--surface-glass`
- Text: `--text-primary`, `--text-secondary`, `--text-muted`
- Accents: `--brand-teal-*`, `--brand-gold-*`, `--brand-cyan`
- Status: `--status-success|warning|danger|info` (+ bg)
- Spacing: `--space-1` … `--space-12`
- Radius: `--radius-sm|md|lg|xl`
- Elevation: `--shadow-sm|md|lg`, `--glow-teal`, `--glow-gold`
- Motion: `--motion-fast`, `--motion-med`, `--ease-out`

## Typography
- Display / brand: Source Serif 4
- Body / UI: DM Sans
- Metrics: DM Sans tabular nums

## Components
Buttons, fields, panels, badges, readiness, quorum meter, choice cards, toasts, dialogs, empty states, loaders, app shell, login shell, mobile action bar — in `components.css`, `assembly-room.css`, `loading.css`, `projector.css`.

## Navigation
Desktop app shell (`app-shell` / `app-nav` / `app-top` / `app-workspace`). Assembly uses specialized Command Center chrome.

## Accessibility
- Focus rings via `--shadow-focus`
- Status not color-only (badges + text)
- `prefers-reduced-motion` honored
- Skip links present
- Touch targets ≥ ~44px on mobile action bar

## Cache
Asset query `?v=px1` on CSS/JS entrypoints.
