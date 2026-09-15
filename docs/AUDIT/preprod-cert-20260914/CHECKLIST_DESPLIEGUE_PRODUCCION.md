# CHECKLIST DESPLIEGUE PRODUCCIÓN — ASAMBLEAS

**No ejecutar despliegue desde esta certificación.** Solo preparación.

## Pre-flight

- [ ] Backup DB producción (`pg_dump` / snapshot) con etiqueta de fecha
- [ ] Confirmar commit GO firmado (hoy: **NO-GO**)
- [ ] Diff revisado (sin secretos, sin basura local)
- [ ] Build Release limpio en CI o agente de release
- [ ] Migraciones listadas y revisadas (SQL) — ninguna nueva en esta corrida
- [ ] Variables de entorno Production vs Development verificadas
- [ ] Secretos: ConnectionStrings, LiveKit ApiKey/Secret, SMTP, DataProtection keys
- [ ] `App:PublicBaseUrl` apunta al dominio prod HTTPS
- [ ] SignalR / Redis (si aplica sticky sessions / backplane)
- [ ] LiveKit URL alcanzable desde app y clientes
- [ ] SMTP real (no sandbox) o feature flags explícitos
- [ ] HTTPS / certificados nginx vigentes
- [ ] Health checks `/health` o contenedor healthy
- [ ] Logs centralizados / retención
- [ ] Plan de smoke post-deploy asignado
- [ ] Plan de rollback leído por el operador

## Smoke post-deploy (cuando haya GO)

- [ ] Login presidente
- [ ] Login propietario
- [ ] Abrir PH y listar unidades/propietarios
- [ ] Entrar sala InProgress / Scheduled
- [ ] Quórum ≤ 100 y consistente API/UI
- [ ] Abrir votación y votar desde móvil
- [ ] SignalR sin F5 en inicio de asamblea
- [ ] Convocatoria envío (estado real del proveedor)
- [ ] Finalizar + descargar acta (si aplica)

## Rollback listo

Ver `PLAN_ROLLBACK_PRODUCCION.md`.
