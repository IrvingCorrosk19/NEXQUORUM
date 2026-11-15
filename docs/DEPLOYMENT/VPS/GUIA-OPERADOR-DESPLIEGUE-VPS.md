# ASAMBLEAS / NEXQUORUM — Guía de despliegue al VPS (para operador)

**Destinatario:** persona de confianza que actualizará el proyecto en el VPS.  
**Remitente:** dueño del servidor (rellena la sección de secretos antes de enviar).  
**Fecha de esta guía:** 2026-09-23  
**Commit mínimo esperado en GitHub:** `a5c9dfe` (o posterior en `master`)

---

## 0) Cómo enviar este archivo de forma segura

1. **No** pegues contraseñas en WhatsApp/correo/chat abiertos si puedes evitarlo.
2. Rellena solo la **Sección A (Secretos)** en una copia privada de este archivo.
3. Envíala por uno de estos canales (elige uno):
   - [Bitwarden Send](https://bitwarden.com/products/send/) o 1Password (enlace con caducidad)
   - Signal / Telegram (chat secreto) / iMessage
   - Correo cifrado (si lo usan)
4. Pide al operador que:
   - Guarde los secretos en `scripts/.env.vps` (local, **nunca** en Git)
   - Borre el mensaje/archivo con secretos cuando termine
5. Cuando termine el despliegue, el dueño puede **rotar** la contraseña SSH del VPS.

> La Sección B (procedimiento) se puede compartir sin secretos.  
> La Sección A **sí** contiene contraseñas: trátala como material confidencial.

---

## Sección A — Secretos (rellena el dueño; no subir a Git)

Copia esta tabla, rellena los valores reales y envíala cifrada.

| # | Qué es | Dónde se usa | Valor (rellenar) |
|---|--------|--------------|------------------|
| 1 | Host SSH | Acceso al VPS | `root@164.68.99.83` |
| 2 | Contraseña SSH del VPS (root) | PuTTY / `scripts/.env.vps` | `<<<RELLENA_AQUI>>>` |
| 3 | Host key SSH (huella) | Evita MITM en plink | `ssh-ed25519 SHA256:fXnxiWr5sqazM3xRId7HtcseAZ0XHcJ2BBIuPsLt2J0` |
| 4 | URL pública de la app | Verificación | `https://asambleas.164.68.99.83.nip.io` |
| 5 | URL LiveKit (WSS) | Video en sala | `wss://livekit-asambleas.164.68.99.83.nip.io` |
| 6 | Repo GitHub | Código fuente | `https://github.com/IrvingCorrosk19/NEXQUORUM.git` |
| 7 | Rama a desplegar | Normalmente `master` | `master` |
| 8 | Contraseña PostgreSQL (`POSTGRES_PASSWORD`) | Ya está en el VPS: `/opt/apps/asambleas/deploy/vps/.env` | *No hace falta si solo actualizas código; solo si reinstalas* |
| 9 | Contraseña demo (`DEMO_PASSWORD`) | Login demo en UI | *Solo si pide acceso demo; está en el `.env` del VPS* |
| 10 | LiveKit API secret | Video / egress | *Ya en `.env` del VPS; no tocar salvo rotación* |
| 11 | SMTP host (OTP por correo) | Envío real de códigos | `<<<RELLENA_AQUI_O_DEJAR_VACIO>>>` |
| 12 | SMTP usuario | OTP | `<<<RELLENA_AQUI>>>` |
| 13 | SMTP contraseña / app password | OTP | `<<<RELLENA_AQUI>>>` |
| 14 | SMTP correo remitente (`From`) | OTP | `<<<RELLENA_AQUI>>>` |
| 15 | SMTP puerto / TLS | OTP | `587` / `UseSsl=true` (STARTTLS) |
| 16 | Google OAuth ClientId / Secret | Login Google (opcional) | `<<<OPCIONAL>>>` |
| 17 | Microsoft OAuth ClientId / Secret | Login Microsoft (opcional) | `<<<OPCIONAL>>>` |

### Archivo local de secretos en la PC del operador (Windows)

Crear (si no existe) el archivo **gitignored**:

`NEXQUORUM/scripts/.env.vps`

```env
ASAMBLEAS_VPS_HOST=root@164.68.99.83
ASAMBLEAS_VPS_PASSWORD=<<<PEGAR_CONTRASEÑA_SSH>>>
ASAMBLEAS_VPS_HOSTKEY=ssh-ed25519 SHA256:fXnxiWr5sqazM3xRId7HtcseAZ0XHcJ2BBIuPsLt2J0
```

**Prohibido:** hacer `git add` de `.env.vps`, capturas con contraseñas, o pegar secretos en issues/PRs.

---

## Sección B — Contexto del proyecto (sin secretos)

### Qué es
Aplicación **ASAMBLEAS** (repo **NEXQUORUM**): asambleas de propiedad horizontal, convocatorias, sala en vivo (LiveKit), votaciones, login passwordless (OTP / OAuth).

### Dónde corre hoy
| Pieza | Ubicación |
|-------|-----------|
| Código en servidor | `/opt/apps/asambleas` |
| Compose + `.env` | `/opt/apps/asambleas/deploy/vps/` |
| Contenedores | `asambleas_web`, `asambleas_postgres`, `asambleas_redis`, `asambleas_livekit`, `asambleas_egress` |
| App interna | `http://127.0.0.1:5090` |
| HTTPS (nginx) | `https://asambleas.164.68.99.83.nip.io` |
| Health | `https://asambleas.164.68.99.83.nip.io/health/ready` |

### Importante sobre OTP (correo)
En Production **no** se usa correo Mock. Si no hay SMTP de la PH ni SMTP de plataforma, la UI **no** debe decir “código enviado”.  
Para que el OTP funcione de verdad hay que configurar SMTP en el `.env` del VPS (ver Sección D).

---

## Sección C — Requisitos en la PC del operador (Windows)

### Qué falta para desplegar *ahora* (actualización)

| Requisito | ¿Bloquea el deploy de código? | Notas |
|-----------|-------------------------------|--------|
| Contraseña SSH en `scripts/.env.vps` | **Sí** | Sin esto no hay `Publish-AsambleasVps` |
| PuTTY **o** OpenSSH | **Sí** (uno de los dos) | Preferido: PuTTY (`plink`/`pscp`). Alternativa: OpenSSH de Windows + `sshpass`/`plink` — el flujo documentado usa PuTTY |
| SMTP rellenado | **No** | El código sube igual; OTP no enviará correo hasta configurar SMTP en el `.env` del VPS |
| Stack ya en `/opt/apps/asambleas` | **Sí** (esta guía) | Esto **actualiza**; no es instalación desde cero |

Con **solo** contraseña en `scripts/.env.vps` + PuTTY instalado, basta para un despliegue de actualización.

1. **Git** instalado  
2. **PuTTY** (`plink.exe` + `pscp.exe`), normalmente en  
   `C:\Program Files\PuTTY\`  
3. Clonar o actualizar el repo:

```powershell
cd C:\Proyectos   # o la carpeta que uses
git clone https://github.com/IrvingCorrosk19/NEXQUORUM.git
cd NEXQUORUM
git checkout master
git pull origin master
```

4. Crear `scripts/.env.vps` con la contraseña SSH (Sección A).  
5. PowerShell: permitir cargar el helper:

```powershell
cd C:\Proyectos\NEXQUORUM   # ajusta la ruta
. .\scripts\vps-ssh.ps1
```

Prueba de acceso (no despliega aún):

```powershell
Invoke-AsambleasVps "docker ps --filter name=asambleas"
```

Debe listar contenedores `asambleas_*` en estado healthy/Up.

---

## Sección D — Desplegar una actualización de código (lo habitual)

El flujo oficial desde Windows:

```powershell
cd C:\Proyectos\NEXQUORUM
git pull origin master
. .\scripts\vps-ssh.ps1
Publish-AsambleasVps
```

Eso hace, en orden:

1. `git archive` del `HEAD` local → `asambleas-src.tgz`  
2. Sube el archivo a `/tmp/asambleas-src.tgz` en el VPS  
3. Ejecuta `/opt/apps/asambleas/deploy/vps/remote-deploy-update.sh` que:
   - Hace backup SQL en `deploy/vps/backups/`
   - Extrae el código en `/opt/apps/asambleas`
   - Rebuild de `asambleas_web`
   - `docker compose up -d`
   - Espera health en `:5090`
   - Recarga nginx

### Verificar éxito

```powershell
Invoke-AsambleasVps "curl -fsS http://127.0.0.1:5090/health/ready"
```

En el navegador: abrir  
`https://asambleas.164.68.99.83.nip.io/health/ready`  
y la página de login.

### Si falla el build
Pedir logs (sin pegar secretos):

```powershell
Invoke-AsambleasVps "cd /opt/apps/asambleas/deploy/vps; docker compose logs --tail=100 asambleas_web"
```

---

## Sección E — Configurar SMTP para OTP (solo si el dueño lo autoriza)

Editar **en el VPS** (no en Git):

`/opt/apps/asambleas/deploy/vps/.env`

Añadir (valores de la Sección A #11–15), por ejemplo:

```env
Communications__SystemEmail__Host=smtp.tudominio.com
Communications__SystemEmail__Port=587
Communications__SystemEmail__Username=usuario
Communications__SystemEmail__Password=***NO_PEGAR_EN_CHATS***
Communications__SystemEmail__FromAddress=noreply@tudominio.com
Communications__SystemEmail__FromDisplayName=ASAMBLEAS
Communications__SystemEmail__UseSsl=true
```

Luego recrear solo el contenedor web para cargar env:

```bash
cd /opt/apps/asambleas/deploy/vps
docker compose up -d --force-recreate asambleas_web
```

Probar: solicitar OTP con un correo de propietario real → debe llegar el correo → `deliveryConfirmed` verdadero.

**Alternativa:** configurar SMTP por PH en la UI de Comunicaciones (canal Email). Si ninguna de las dos existe, OTP fallará de forma honesta (mensaje de error, no falso éxito).

---

## Sección F — Comandos útiles (SSH / plink)

```powershell
# Estado de contenedores
Invoke-AsambleasVps "docker ps --filter name=asambleas"

# Health
Invoke-AsambleasVps "curl -fsS http://127.0.0.1:5090/health/ready"

# Últimas migraciones
Invoke-AsambleasVps "docker exec asambleas_postgres sh -c 'psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tAc \"SELECT \\\"MigrationId\\\" FROM __ef_migrations_history ORDER BY 1 DESC LIMIT 5;\"'"
```

Desde SSH interactivo (si el operador usa terminal remota):

```bash
cd /opt/apps/asambleas/deploy/vps
docker compose ps
docker compose logs -f --tail=50 asambleas_web
```

---

## Sección G — Qué NO hacer

| Acción | Por qué |
|--------|---------|
| Subir `.env` o `.env.vps` a GitHub | Expone secretos |
| `docker compose down -v` | Borra volúmenes (DB / grabaciones) |
| Cambiar `POSTGRES_PASSWORD` sin plan | Rompe la conexión de la app |
| Forzar push a `main`/`master` ajeno | Riesgo de historial |
| Desplegar sin backup | El script ya hace backup; no saltarlo a mano |
| Decir “OTP enviado” sin SMTP | Ya corregido en código; no reintroducir Mock en Production |

---

## Sección H — Checklist de entrega (operador → dueño)

Al terminar, el operador confirma por escrito:

- [ ] `git pull` + `Publish-AsambleasVps` terminó con `DEPLOY_OK` / health ready  
- [ ] URL pública abre login  
- [ ] Contenedores `asambleas_*` Up  
- [ ] (Si aplica) SMTP configurado y un OTP **llegó** al buzón de prueba  
- [ ] Archivo con contraseñas borrado del chat / papelera  
- [ ] `scripts/.env.vps` solo en su PC, no en el repo  

---

## Sección I — Contacto / escalado

Si el VPS no responde, health falla, o LiveKit no conecta: **parar** y avisar al dueño antes de reiniciar servicios ajenos del mismo servidor (hay otras apps en `/opt/apps/*`).

Rutas de documentación interna (en el repo):

- `docs/DEPLOYMENT/VPS/00-ARCHITECTURE.md`
- `docs/DEPLOYMENT/VPS/02-ASAMBLEAS-DEPLOYMENT.md`
- `deploy/vps/.env.example`
- `scripts/vps-ssh.ps1`

---

## Anexo — Plantilla mínima para el mensaje cifrado (solo secretos)

Puedes enviar **solo** esto por canal seguro (y la guía sin secretos por otro lado):

```text
ASAMBLEAS — secretos temporales (borrar tras usar)

SSH: root@164.68.99.83
SSH_PASSWORD: ...
HOSTKEY: ssh-ed25519 SHA256:fXnxiWr5sqazM3xRId7HtcseAZ0XHcJ2BBIuPsLt2J0

Repo: https://github.com/IrvingCorrosk19/NEXQUORUM.git
Branch: master
URL: https://asambleas.164.68.99.83.nip.io

SMTP (si aplica OTP):
  Host: ...
  Port: 587
  User: ...
  Pass: ...
  From: ...
```

Fin de la guía.
