# PLAN DE ROLLBACK PRODUCCIÓN — ASAMBLEAS

## Criterios que activan rollback

- Fuga de datos entre PH / acceso no autorizado.
- Quórum > 100 % o duplicidad de unidades/votos.
- Imposibilidad de votar en móvil.
- SignalR crítico requiere recarga masiva.
- Acta o resultados inconsistentes con la sala.
- Caída sostenida de health / errores 5xx > umbral operativo.
- Migración con corrupción o pérdida de datos.

## Qué versión restaurar

1. Imagen/contenedor Docker del release **anterior** marcado como último estable (tag digest SHA previo en el host VPS).
2. Código: commit previo al release fallido (hoy baseline conocido: `75c6836` o el último GO).
3. **No** restaurar DB a ciegas si ya hubo asambleas reales post-corte: proteger datos nuevos.

## Cómo revertir la aplicación

1. Mantener backup pre-deploy.
2. Redeploy de la imagen/commit anterior con el mismo pipeline (`remote-deploy-update` / compose).
3. Verificar health + smoke login.
4. Comunicar a operadores el estado.

## Migraciones

- Si el release **no** añadió migraciones: rollback de app solamente.
- Si añadió migraciones: evaluar rollback de esquema solo con script explícito y aprobado; preferir forward-fix.
- Datos generados después del lanzamiento (votos, actas, asistencias) **no se borran** en rollback de app.

## Responsables (pendiente de asignación)

- [ ] Operador de despliegue
- [ ] Owner de producto (decisión GO/NO-GO)
- [ ] DBA / backup restore
- [ ] Comunicación a clientes PH
