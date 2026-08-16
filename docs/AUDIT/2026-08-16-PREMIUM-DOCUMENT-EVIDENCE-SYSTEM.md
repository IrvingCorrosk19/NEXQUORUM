# ASAMBLEAS — Premium Document & Evidence System

**Date:** 2026-08-16  
**Scope:** Expediente documental (PDF/TXT) + `expediente.html`  
**Local base:** `https://localhost:7188`  
**Status:** LOCAL DOCUMENT SYSTEM CERTIFIED (pending production smoke after deploy)

---

## 1. Root causes (observed)

| Issue | Cause |
| --- | --- |
| `Verificaci??n` / `qu??rum` in PDF | `SimplePdf` used Helvetica + ASCII; codepoints >126 replaced with `?` |
| `VerificaciÃ³n` in TXT | UTF-8 bytes without BOM; some Windows tools mis-decoded as Latin-1 |
| Technical dump UX | Generators printed enums (`Owner`, `CheckedIn`), `accredited=True`, ISO timestamps, quorum snapshot spam |
| Acta looked like plain text | Single-page ASCII PDF dump, no cover/header/footer/pagination |

## 2. Integrity architecture (unchanged semantics)

| Artifact | What is hashed | Notes |
| --- | --- | --- |
| `AssemblyMinutesDocumentDto.ContentHash` | SHA-256 of **verified JSON facts** (attendance, quorum, agenda, closed voting, decisions) | Built in `AssemblyEvidenceService.BuildMinutesDocumentAsync` — **not** PDF bytes |
| Sealed minutes | Same JSON hash persisted on complete | Visual redesign does **not** rewrite sealed JSON |
| `Manifest.json` | SHA-256 of **each exported file byte array** | Expected to change when PDF/TXT presentation changes; package integrity of the ZIP export |

**Decision:** Premium PDFs are the human layer. Hash of facts remains the evidence seal. Manifest remains per-file checksum of the generated package.

## 3. Document Design System

Centralized under `src/Asambleas.Application/Documents/`:

- `DocumentDesign.cs` — A4 chrome, tokens, header/footer/page numbers, watermark
- `DocumentLabels.cs` — enum → Spanish presentation (no domain mutation)
- `DocumentDates.cs` — America/Panama human dates
- `PremiumPdfDocuments.cs` — QuestPDF builders (Acta, Asistencia, Quórum, Votaciones, Decisiones, Integridad)
- `PremiumTextDocuments.cs` — UTF-8 BOM TXT (human + technical audit)

Backend presentation-only wiring:

- `EvidencePackageExportService.cs` — ZIP + single-document API
- `RecordingController.cs` — `GET .../expediente/documents/{key}?format=pdf|txt&preview=`

Removed: `SimplePdf.cs` (root cause of `??`).

## 4. Before / after

| Document | Before | After |
| --- | --- | --- |
| Acta | ASCII PDF dump | Cover + sections 1–9, watermark when not final, integrity block |
| Asistencia | `accredited=True` TSV | PDF/TXT tables, roles/status humanized, coef `14.00 %` |
| Quórum | Snapshot log spam | Summary cards + compressed evolution + technical TXT appendix |
| Votaciones | `(sin sesión…)` | Professional “No sometida a votación” / closed results |
| Decisiones | `(sin decisiones…)` | Elegant empty state + per-decision cards |
| Audit | Single technical dump | Nivel 1 integridad + Nivel 2 auditoría técnica |
| UI | Single ZIP button | Official docs + evidence cards, preview modal |

## 5. Encoding

- TXT: UTF-8 **with BOM**
- PDF: QuestPDF/Skia Unicode fonts (no Helvetica ASCII sanitize)
- Verified strings: `Verificación de quórum`, `José Núñez`, `María Gómez`, `orden del día`

## 6. Data parity

Generators only format DTOs from `AssemblyEvidenceService` / minutes. No quorum/voting/coef calculation changes.

## 7. Multi-tenant

PH name and assembly title taken from package DTO (`PropertyHorizontalName`, `Title`). No hardcoded “PH OCEAN TOWER” in templates.

## 8. Expediente UI

- `expediente.html` + `css/expediente.css` + `expediente-app.js?v=doc1`
- Categories: Documentos oficiales / Evidencia / Grabaciones
- Preview via blob URL iframe (not fragile remote iframe)

## 9. Local evidence

- Generator tool: `tools/GenPremiumDocs` → `artifacts/doc-qa/`
- Renders: `docs/AUDIT/premium-doc-renders/*.png`
- Live ZIP from `https://localhost:7188` assembly `44444444-…-444401` (644 KB, PDF magic `%PDF-`, TXT BOM)
- Integration tests: `RecordingExpedienteTests` + `EvidenceMinutesTests` — **4 passed**
- Unit (quorum-related filter): **6 passed**
- Solution build: **0 errors**

## 10. Files touched (presentation layer)

**Backend (document generation only):**

- `src/Asambleas.Application/Asambleas.Application.csproj` (QuestPDF)
- `src/Asambleas.Application/Documents/*`
- `src/Asambleas.Application/Evidence/EvidencePackageExportService.cs`
- deleted `SimplePdf.cs`
- `src/Asambleas.Web/Controllers/RecordingController.cs`

**Frontend:**

- `expediente.html`, `css/expediente.css`, `js/modules/expediente-app.js`

**Tests / tools / docs:**

- `tests/.../RecordingExpedienteTests.cs`
- `tools/GenPremiumDocs/*`
- this audit + renders

## 11. Future (out of scope)

- PH logo embedding when brand assets exist
- Optional embedded font pack if a Linux host lacks Skia fallbacks (QuestPDF embeds by default; verify on VPS)

## 12. Production gate

**Deploy:** `90cd285` via `git archive` → VPS rebuild `asambleas_web` (`DEPLOY_DONE`, health 200).

**Production smoke (`https://asambleas.164.68.99.83.nip.io`):**

| Check | Result |
| --- | --- |
| Login president@ocean.demo | 200 |
| Acta PDF | 200 · `%PDF-` · 4 pages · watermark lifecycle OK |
| Asistencia TXT | UTF-8 BOM · no `accredited=True` / `CheckedIn` · human labels |
| Quórum PDF | 200 |
| expediente.html | Documentos oficiales + `expediente.css` |
| Linux fonts / UTF-8 | No `??` / `Ã³` in extracted PDF text |

Render: `docs/AUDIT/premium-doc-renders/vps-acta-p1.png`

**FINAL:** PREMIUM DOCUMENT SYSTEM — PRODUCTION CERTIFIED

