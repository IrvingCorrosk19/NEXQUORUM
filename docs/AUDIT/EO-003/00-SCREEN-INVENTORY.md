# EO-003 Screen Inventory

**Date:** 2026-08-08  
**Rule:** FUNCTIONALITY FREEZE — inventory of existing assembly surfaces only.  
**App:** `http://localhost:5188` (Healthy)

## Routes that exist

| # | Screen | Route | Roles |
|---|--------|-------|-------|
| 1 | Login | `/` (`index.html`) | Anonymous |
| 2 | Dashboard / Preparation | `/dashboard.html?assemblyId=` | All authenticated |
| 3 | Check-in / Accreditation | `/checkin.html?assemblyId=` | Operator + Owner |
| 4 | Lobby + Device Preview | `/lobby.html?assemblyId=` | All participants |
| 5 | Assembly Room (Operator + Owner) | `/assembly.html?assemblyId=` | Role-aware CSS |
| 6 | Projector | `/projector.html?assemblyId=` | Operator (link) / public-safe intent |
| 7 | Minutes | `/minutes.html?assemblyId=` | Authorized |
| 8 | Evidence | `/evidence.html?assemblyId=` | Authorized |

**Not separate routes:** Vote Confirmation / Receipt / Results / Reconnect / Closing Summary — these are **states inside** `assembly.html` (or missing as dedicated screens).

---

## Per-screen detail

### 1. Login
- **Purpose:** Authenticate demo/real users  
- **Primary:** Entrar  
- **Secondary:** Demo user picker  
- **Problems:** Card feels form-template; demo list area often empty/low contrast; no brand atmosphere beyond soft gradient  
- **Responsive:** Usable but not mobile-optimized for thumb  
- **A11y:** Labels present; muted label contrast weak  
- **Priority:** P1  

### 2. Dashboard / Preparation
- **Purpose:** Readiness + contextual CTA into flow  
- **Primary:** INICIAR / CONTINUAR (by status)  
- **Secondary:** Check-in, Lobby, Minutes, Evidence, Projector  
- **Problems:** `LISTO PARA INICIAR` readiness summary visually competes with primary CTA (looks like a button); LiveKit blocker in English; CTA below fold on shorter viewports; header not “command” oriented  
- **Responsive:** Long scroll; secondary links crowded  
- **A11y:** Status badges color-heavy; READY text helps  
- **Priority:** **P0**  

### 3. Check-in / Accreditation
- **Purpose:** Search → select → accredit  
- **Primary:** ACREDITAR / Registrar mi asistencia  
- **Secondary:** Search, Lobby  
- **Problems:** Cards stacked full-width (slow on tablet); coefficient may still show “—” if old build; success→next person flow weak; not optimized for 768×1024 speed  
- **Responsive:** Mobile OK; tablet underused  
- **A11y:** Search labeled; cards lack clear focus ring hierarchy  
- **Priority:** **P0** (tablet operator path)  

### 4. Lobby + Device Preview
- **Purpose:** Confirm identity + devices before enter  
- **Primary:** ENTER ASSEMBLY  
- **Secondary:** Cam/mic toggles  
- **Problems:** Inline styles; LiveKit blocked messaging technical; staged join loading partial  
- **Priority:** P1  

### 5. Assembly Room — Operator Cockpit
- **Purpose:** Command center during live assembly  
- **Primary:** Start / Pause / End / Agenda / Motion / Vote / Speakers  
- **Problems:** Stage actions mix Owner + Operator + Logout in one row (cognitive load); End Assembly same visual weight as Pause; no adaptive priority for voting/speaker; participants strip weak; motion empty state still large; video stage “waiting” dominates without AV; `room-app.js` ~15KB DOM-coupled  
- **Responsive:** Sidebar stacks poorly; not mobile-first for operator  
- **A11y:** Skip link OK; live regions partial  
- **Priority:** **P0**  

### 6. Assembly Room — Owner
- **Purpose:** Watch / understand / speak / vote  
- **Problems:** Same shell as operator with CSS hide; voting not sticky on mobile; secondary panels still compete; not designed 390-first  
- **Priority:** **P0**  

### 7. Voting (in-room state)
- **Purpose:** Select → confirm → receipt  
- **Problems:** Confirm dialog exists but needs stronger ceremony; failure path may show raw errors; sticky voting missing on mobile  
- **Priority:** **P0**  

### 8. Projector
- **Purpose:** Public display  
- **Problems:** Not distance-readable enough; typography not projector scale  
- **Priority:** P1  

### 9. Minutes / Evidence
- **Purpose:** Post-assembly artifacts  
- **Problems:** Evidence/minutes often render as JSON/`<pre>` — admin dump, not premium  
- **Priority:** P1  

### 10. Reconnect
- **Purpose:** Connection lost/restored  
- **Problems:** Banner exists; overlay + “sincronizando” language needs polish; not fully validated visually  
- **Priority:** P1  

---

## Missing as dedicated screens (document only — do not invent modules)

Assembly Detail (separate), Closing Summary page, standalone Vote Confirmation page — currently in-room states or absent.
