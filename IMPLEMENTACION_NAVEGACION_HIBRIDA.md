# Implementación — Navegación híbrida (Alternativa C + A)

Fecha: 2026-09-06  
Base SHA: `6041908b05b1e04fe89a5fe09ef4b885af5a6069`  
Worktree: `C:\Proyectos\NEXQUORUM`  
Rama: `master`

## Objetivo

Eliminar recargas MPA completas entre pantallas críticas administrativas/propietario sin convertir toda la app en SPA ni alterar reglas de negocio.

## Arquitectura

### Soft shell (hybrid-router.js)

- Soft routes: `dashboard.html`, `ph.html`, `agenda.html`, `checkin.html`, `voting-studio.html`, `owner.html`.
- History API (push/replace), Atrás/Adelante, Ctrl/Cmd+clic y `target=_blank` respetados.
- Fallback hard si el montaje falla.
- Shell ID estable: `window.__ASAM_SHELL_ID__` / `data-asam-shell-id`.
- Intercambia solo `#main` + portales body (`dialog`) + estilos de página.
- No inserta HTML de módulos vía scripts re-ejecutados; usa `mount()` / `unmount()` de ES modules.

### Lifecycle

Contrato por módulo: `mount(ctx)`, `unmount()`, `canLeave()`, `dispose()` (+ helpers en `lifecycle.js`).

| Módulo | Notas |
|--------|--------|
| dashboard-app | softNavigate en acciones internas; shell boot |
| ph-app | conserva hash + lazy tabs internos |
| agenda-app | `canLeave` con confirmDialog si dirty |
| checkin-app | portales dialog; AbortController; SignalR stop en unmount |
| voting-studio-app | portales dialog; assemblyId desde URL en mount |
| owner-portal-app | soft para owners; operadores redirigen soft a dashboard |
| room-app | hard enter; `disposeForHybridLeave` al salir |

### Caché de sesión (no autorización)

`session-shell-cache.js`: `me` / memberships en memoria TTL 15s; invalidación en logout, PH switch, mismatch usuario. Backend sigue siendo autoridad.

### Caché HTTP estática (Alternativa A)

`Program.cs` `UseStaticFiles.OnPrepareResponse`:

- HTML: `no-cache`
- Assets con `?v=`: `public,max-age=31536000,immutable`
- Otros estáticos tipados: `public,max-age=86400`
- APIs autenticadas: sin caché pública (no tocadas)

### Duplicados corregidos

- `/api/auth/me`: single-flight + peek shell en soft hops
- memberships: peek en `ph-context`
- `/recordings`: `cachedGet` TTL 2s (1 GET observado en boot de sala)
- ph-switcher: bind one-shot

## Frontera de sala

- Entrar a sala = hard navigation (chrome distinto).
- Salir hacia soft page: `disposeForHybridLeave` luego hard assign (desmontaje controlado).
- Minimizar votación móvil no desmonta sala (comportamiento previo conservado).

## Rutas que siguen hard

- `assembly.html` / `lobby.html`
- Login, calendar, minutes, expediente, convocation, y resto fuera del cluster soft
- Deep link inicial siempre hard (primera carga del documento)

## Reversión

Quitar imports de `startHybridShell` / `hybrid-router` y volver a auto-boot por página restaura MPA puro. Políticas de caché estática son independientes y reversibles en `Program.cs`.