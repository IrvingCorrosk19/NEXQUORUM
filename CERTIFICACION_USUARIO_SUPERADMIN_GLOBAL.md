# CERTIFICACION - USUARIO SUPERADMIN GLOBAL (`PlatformAdmin`)

**Fecha UTC:** 2026-09-06  
**Entorno:** `https://localhost:7188` (LOCAL only)  
**Usuario:** `president@ocean.demo`  
**Rol verificado:** `PlatformAdmin`  
**Veredicto:** **100% PASS**

---

## Matriz de validacion obligatoria

| # | Criterio | Metodo | Resultado |
|---|---|---|---|
| 1 | Solo un usuario operativo: `president@ocean.demo` | SQL (`AspNetUsers`) | PASS |
| 2 | Cero PH / unidades / propietarios / asambleas / votos / convocatorias / memberships / claims PH | SQL counts | PASS |
| 3 | Login correcto | Browser Tab + `/api/auth/login` -> 200 | PASS |
| 4 | Panel global sin pertenecer a ninguna propiedad | `/api/auth/me` roles=`PlatformAdmin`; `/api/ph` n=0 | PASS |
| 5 | Estado vacio comprensible | UI `ph.html` mensaje obligatorio | PASS |
| 6 | Puede crear PH nueva | Browser smoke `POST /api/ph` -> 200 | PASS |
| 7 | Puede seleccionarla y administrarla | `POST /api/ph/switch` + operaciones | PASS |
| 8 | Puede crear unidad, propietario y asamblea de prueba | Browser smoke -> 200 | PASS |
| 9 | Aislamiento multitenant no debilitado | Bypass solo por rol PlatformAdmin; sin auto-PH demo; seed demo off | PASS |
| 10 | Usuario comun no obtiene permisos globales | No quedan otros usuarios; auth por rol formal | PASS |
| 11 | Sin 500 / NRE / loops / blank / PH demo auto / mensajes tecnicos | Browser: `NO_PAGE_ERRORS`; empty copy claro | PASS |

Tras la smoke de creacion, se **re-ejecuto** el reset para entregar el sistema **realmente vacio** otra vez.

---

## Evidencia Browser Tab

| Artefacto | Descripcion |
|---|---|
| `tools/local-dev-reset/evidence/browser/browser-results.json` | 9/9 PASS (login/me, vacio, create PH/unit/owner/assembly) |
| `tools/local-dev-reset/evidence/browser/01-empty-ph.png` | Pantalla PH vacia |
| `tools/local-dev-reset/evidence/browser/02-after-create.png` | Tras crear PH de certificacion |
| `tools/local-dev-reset/evidence/browser/03-final-empty.png` | Estado final vacio post wipe de entrega |
| `tools/local-dev-reset/evidence/browser/final-empty-check.json` | Login 200, roles PlatformAdmin, phCount=0, emptyMsg=true |

### Extracto `final-empty-check.json`

```json
{
  "loginStatus": 200,
  "me": {
    "status": 200,
    "email": "president@ocean.demo",
    "roles": ["PlatformAdmin"]
  },
  "phListEmpty": true,
  "emptyMsg": true,
  "phCount": 0
}
```

---

## Comportamiento de identidad verificado

- Inicia sesion normalmente.
- Rol global inequivoco: **PlatformAdmin** (equivalente funcional a SuperAdmin de plataforma en este codebase).
- Sin memberships PH (`user_property_memberships = 0`).
- Sin claim `property_horizontal_id`.
- No depende de PropertyId/PHId/MembershipId para entrar.
- No se asigna silenciosamente a PH demo (`AuthController.BuildClaims`).
- Puede crear la primera PH desde cero y luego administrar / switch.
- Mensaje UI cuando falta PH: "Primero debes crear o seleccionar una propiedad horizontal para continuar."
- Tenant/org estructurales `PLATFORM` existen solo como ancla de Identity (no son propiedades horizontales de negocio).

---

## Notas de seguridad

- No se uso email hardcodeado como bypass de autorizacion en la limpieza.
- El script de wipe no se puede apuntar a hosts externos por gate.
- Credenciales no se documentan en este archivo.
- Demo reseed desactivado en Development para no recontaminar la base al reiniciar.

---

## Certificacion final

**100% PASS** - base local limpia, un solo `PlatformAdmin` global, flujo Browser Tab verificado de extremo a extremo, y datos de smoke eliminados tras la certificacion.