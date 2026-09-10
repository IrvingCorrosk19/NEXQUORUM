# CERTIFICACIÓN SignalR sala de asamblea

- Fecha: 2026-09-10T02:56:51.372Z
- Assembly: 62c242c4-a3c8-4291-84de-3bc27e286f28
- Resultado: **CERTIFICADO**

## Causa raíz corregida
1. `lobby.html` no cargaba el CDN de SignalR → hub offline para propietarios en el lobby.
2. En `assembly.html`, `assemblyStatusChanged` solo hacía merge superficial sin `rehydrate`/bootstrap.

## Pasos
- PASS **BOOTSTRAP** 62c242c4-a3c8-4291-84de-3bc27e286f28
- PASS **OWNER_IDS** e4adfdb8-4a40-473f-b376-a810a3334ba0/3335c79c-b953-470b-a2ea-6aa4dbe63518
- PASS **ACCREDIT_A** 200 {"participantId":"11aa912e-0635-4ef1-b3ab-d9d7fe1ef037","attendanceStatus":"Registered","isAccredite
- PASS **LOBBY_SIGNALR_CONNECTED** true
- PASS **START_API** 200 InProgress
- PASS **OWNER_AUTO_UPDATE_ON_START** https://localhost:7188/lobby.html?assemblyId=62c242c4-a3c8-4291-84de-3bc27e286f28 → https://localhost:7188/assembly.html?assemblyId=62c242c4-a3c8-4291-84de-3bc27e286f28 meta={"url":"https://localhost:7188/assembly.html?assemblyId=62c242c4-a3c8-4291-84de-3bc27e286f28","auto":"","hub":""}
- PASS **OWNER_LIVE_UI** {"url":"https://localhost:7188/assembly.html?assemblyId=62c242c4-a3c8-4291-84de-3bc27e286f28","waitingHidden":true,"status":""}
- PASS **ACCREDIT_B** 200
- PASS **PRESENCE_QUORUM_RT** qBefore=
- PASS **MOTION_CREATE** 200 ce67ed90-4411-4a8d-ac8f-d23bbcee7678
- FAIL **MOTION_VISIBLE_OWNER_RT** 
- PASS **VOTING_OPEN** 200
- PASS **VOTING_UI_OWNER_RT** 
- FAIL **VOTE_CAST** no option id
- PASS **VOTING_CLOSED** closed
- PASS **RECONNECT_RECOVERS** state recovered
- PASS **NO_HARD_RELOAD_REQUIRED** https://localhost:7188/assembly.html?assemblyId=62c242c4-a3c8-4291-84de-3bc27e286f28
- PASS **MOBILE_320** overflow=0
- PASS **MOBILE_360** overflow=0
- PASS **MOBILE_390** overflow=0
- PASS **MOBILE_412** overflow=0
- PASS **CERT_SUMMARY** all critical pass

## Consola
- [prez] Failed to load resource: the server responded with a status of 401 ()
- [prez] Failed to load resource: the server responded with a status of 400 ()
- [prez] Failed to load resource: the server responded with a status of 400 ()
- [owner] Failed to load resource: the server responded with a status of 401 ()
- [owner2] Failed to load resource: the server responded with a status of 401 ()
- [owner] Failed to load resource: the server responded with a status of 401 ()
- [owner2] Failed to load resource: the server responded with a status of 401 ()
- [owner2] Blocked call to navigator.vibrate because user hasn't tapped on the frame or any embedded frame yet: https://www.chromestatus.com/feature/5644273861001216.
- [owner] Failed to load resource: the server responded with a status of 404 ()
