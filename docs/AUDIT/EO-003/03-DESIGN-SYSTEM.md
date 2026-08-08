# EO-003 Design System V2

**Source of truth:** `src/Asambleas.Web/wwwroot/css/tokens.css`  
**Date:** 2026-08-08  
**Status:** Adopted for Assembly module; legacy `--color-*` aliases retained.

## Intent

Single visual vocabulary for Assembly surfaces: semantic surfaces/text/status, assembly-specific accents, typography, spacing, elevation, motion, and z-index layers.

## Semantic surfaces

| Token | Value | Use |
|-------|-------|-----|
| `--surface-primary` | `#f4f7f8` | Page background |
| `--surface-secondary` | `#e6eef1` | Muted panels |
| `--surface-elevated` | `#ffffff` | Cards, sticky vote, elevated chrome |
| `--surface-inverse` | `#0a3d44` | Projector / dark stage |
| `--surface-inverse-soft` | `#0f5c66` | Inverse gradients |

Atmosphere helper: `--bg-atmosphere` (teal/gold radial + soft gradient).

## Text

| Token | Value |
|-------|-------|
| `--text-primary` | `#0f1c24` |
| `--text-secondary` | `#3d5360` |
| `--text-muted` | `#6a7f8c` |
| `--text-on-inverse` | `#f4f7f8` |
| `--text-on-brand` | `#ffffff` |

## Borders / focus

| Token | Value |
|-------|-------|
| `--border-default` | `#c5d4db` |
| `--border-strong` | `#8aa0ab` |
| `--border-focus` | `#1a7f8c` |
| `--shadow-focus` | `0 0 0 3px rgba(26, 127, 140, 0.35)` |

## Brand + assembly semantics

| Token | Value | Meaning |
|-------|-------|---------|
| `--brand-teal-900…100` | teal scale | Brand |
| `--brand-gold-700…300` | gold scale | Accent / speak |
| `--assembly-live` | `#1f7a4d` | Live session cue |
| `--assembly-quorum` | `#1a7f8c` | Quorum metric |
| `--assembly-voting` | `#c49a2e` | Open vote priority |
| `--assembly-stage` | `#0a3d44` | Stage/projector |
| `--choice-favor/against/abstain` | status/muted | Vote choices |

## Status

| Token | FG | BG |
|-------|----|----|
| success | `#1f7a4d` | `#d8f0e4` |
| warning | `#9a6b12` | `#f8e7b8` |
| danger | `#9b2c2c` | `#f6d6d6` |
| info | `#1a7f8c` | `#d7eef1` |

## Typography

- **Display:** `Source Serif 4` → `--font-display`
- **Body / metric:** `DM Sans` → `--font-body`, `--font-metric`
- Scale: `--text-display` … `--text-caption`, plus `--text-metric` / `--text-metric-lg` (clamp)

## Spacing, radius, controls

- Space scale `--space-1` (4px) … `--space-10` (64px)
- Radius `--radius-sm` … `--radius-xl`
- Shadows `--shadow-soft`, `--shadow-elevated`
- Controls `--control-height` / `--control-height-lg`
- Layout `--content-max`, `--sidebar-width`, `--header-height`

## Motion

| Token | Default |
|-------|---------|
| `--motion-fast` | 160ms |
| `--motion-med` | 280ms |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` |

`prefers-reduced-motion: reduce` sets motion tokens to `0ms`.

## Breakpoints (documentation tokens)

| Token | Value |
|-------|-------|
| `--bp-sm` | 390px |
| `--bp-md` | 768px |
| `--bp-lg` | 1024px |
| `--bp-xl` | 1366px |

## Z-index layers

`--z-sticky` (200) → `--z-drawer` (1100) → `--z-toast` (1200) → `--z-banner` (1300) → `--z-dialog` (1400) → `--z-reconnect` (1500).

**Note:** `--z-drawer` reserved; participant drawer **not implemented**.

## Legacy aliases

`--color-ink`, `--color-surface*`, `--color-teal-*`, `--color-gold-*`, `--color-success|warning|danger`, `--color-focus`, `--color-border*` map onto V2 tokens so existing class names keep working during migration.

## Adoption score

| Gate | Status |
|------|--------|
| V2 file present & documented | PASS |
| Room/components/projector consume V2 | PARTIAL / GOOD |
| Zero hardcoded color debt | FAIL (remaining) |
| Full component library docs | NOT EXECUTED |
