# UX/IA Reengineering — Visual & Structural Audit (AS-IS)

Date: 2026-08-11  
Source: Live VPS `https://asambleas.164.68.99.83.nip.io` + code (`ph.html`, `ph-app.js`, `ia-nav.js`)  
Method: Browser login page capture + API PH inventory + static structure review

## Mental model failure (observed)

On `/ph.html?phId=…` a single screen simultaneously exposes:

1. Sidebar IA (Resumen / Propietarios / …) — correct direction  
2. Hero CTAs: **Mis PH** + **Listo para asamblea** + **Activar PH**  
3. Wizard rail Paso 1–8 (even when PH already has data)  
4. Horizontal tabs: Información / Asambleas / Unidades / Propietarios / Coeficientes / Importar / **Readiness**  
5. Module content (filters + table + optional giant detail below)

→ Triple navigation + onboarding chrome in operational context.

## PH inventory (API, PHAdmin)

| PH | Status | Onboarding step | Notes |
|----|--------|-----------------|-------|
| Nope | Draft | 1 | Empty draft |
| PH DEMO OCEAN TOWER | Active | 8 | Operational |
| PH Irving | Draft | 1 | Has units/owners/assemblies — wizard still shown |

## Screen inventory (priority)

| Route | Purpose | Primary action | Problems |
|-------|---------|----------------|----------|
| `/` | Login | Entrar | OK (single purpose) |
| `/ph.html` | PH list | Crear PH | OK-ish |
| `/ph.html?phId=` | PH admin | unclear | Wizard+tabs+CTAs collision; Readiness EN; owner detail below table |
| `/calendar.html` | Schedule | Nueva | Dense |
| `/communications.html` | SMTP | Guardar | Technical fields |
| `/convocation.html` | Send | Enviar | Improved recently |
| `/dashboard.html?assemblyId=` | Assembly workspace | State CTA | Secondary link density |
| `/checkin.html` | Accreditation | Check-in | EN residue in code paths |
| `/assembly.html` | Live room | — | Dedicated OK |
| `/owner.html` | Owner portal | — | Separated OK |

## Target IA (locked)

```
ASAMBLEAS
├── Propiedades → PH { Resumen | Propietarios | Unidades | Asambleas | Comunicaciones | Configuración }
├── Calendario
└── (Assembly workspace when assemblyId present — separate chrome)
```

Onboarding wizard: **only** empty Draft PH.  
Ops PH: **no** wizard rail, **no** duplicate tab strip (sidebar owns nav).

## P0 defects to fix this pass

1. Hide wizard + competing CTAs in ops mode  
2. Resumen-only hero (stats, próxima asamblea, atención)  
3. Owners: filter drawer, clean row actions, right drawer (kill `#owner-detail` below table)  
4. Rename Readiness → Preparación; hide as top-level tab in ops (fold into Resumen)  
5. Spanish labels; no GUID in UI  
6. Sticky save already present on PH form — keep; ensure owners edit uses drawer footer  

## Out of scope (no new features)

PDF/QR, new modules, pretty URLs, redesign of live Teams shell.
