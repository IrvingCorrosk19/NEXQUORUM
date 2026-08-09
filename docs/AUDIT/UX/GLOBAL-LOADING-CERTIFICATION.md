# Global Loading Certification

**Date:** 2026-08-09  
**Status:** IMPLEMENTED (pilot)

## Assets

- `/css/loading.css` — brand orbit / quorum-forming motion
- `/js/modules/loading.js` — global loader, button loading, credential-URL scrub helper

## Behaviors

| Surface | Behavior |
|---------|----------|
| Global loader | Full-viewport ASAMBLEAS brand + orbit nodes + indeterminate bar |
| Login button | Disabled + loading state; duplicate submit blocked |
| Skeletons | Existing dashboard/list skeletons retained |
| Reduced motion | Animations suppressed via `prefers-reduced-motion` |
| Accessibility | `role=status`, `aria-live`, `aria-busy` |

## Notes

Realtime SignalR updates do not trigger the global loader.  
Vote/video join states can call `showGlobalLoader` / `setButtonLoading` as flows are wired.
