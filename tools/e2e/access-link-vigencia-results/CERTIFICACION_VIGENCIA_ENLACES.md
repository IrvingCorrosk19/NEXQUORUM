# Certificación vigencia enlaces de convocatoria

- Base: https://localhost:7188
- Resultado: **CERTIFICADO**
- Fecha: 2026-09-09T23:35:11.182Z

| ID | Pass | Detalle |
|----|------|---------|
| T0_local_up | PASS | https://localhost:7188 |
| T0_login | PASS | president@ocean.demo |
| T0_ph | PASS | c6c486e9-4ea8-456c-a733-fa3701b0d0f9 |
| T16_setup_owners | PASS | omc2.196148@sandbox.test / cert.owner.b.1788995872698@sandbox.test distinct=true unitsA=101 unitsB=CERT-872633 |
| T16_eligible_ids | PASS | 3ba7fc5f-ab19-405b-b59e-27d6a5429411 (B deferred=true) |
| T0_create_scheduled | PASS | b95ae080-c79a-49ef-9f56-97763165fb4d |
| T16_recipients | PASS | A=5f45f99a-1362-4a9d-8d75-97b224a0745c B=n/a n=1 |
| T1_token_captured | PASS | WKX0bhUi8U… |
| T1_active_beyond_14d | PASS | Scheduled |
| T3_resend_http | PASS | 200 {"id":"77ddb404-ab91-4758-af1d-b37398321f11","convocationId":"fab5a9f6-656b-4798 |
| T3_resend_same_link | PASS | same=true |
| T4_regenerate | PASS | 200 {"id":"ad9de434-c076-4fda-824a-52468bb73eb6","convocationId":"fab5a9f6-656b-4798-bae2-69394a7a768d","status":"Sent","tot |
| T6_new_link | PASS | GCTJl5Pze0… |
| T5_old_invalid | PASS | REPLACED |
| T7_reuse_old_message | PASS | Este enlace fue reemplazado por uno más reciente. Utilice el último enlace recibido. |
| T6b_new_works | PASS | Scheduled |
| T8_reschedule | PASS | 200 {"assemblyId":"b95ae080-c79a-49ef-9f56-97763165fb4d","propertyHorizontalId":"8e795bf1-2775-4618-8b76 |
| T8_link_keeps_validity | PASS |  |
| T9_access_before | PASS | Scheduled |
| T10_access_during | PASS | Scheduled |
| T11_access_within_48h | PASS | Scheduled |
| T12_vote_blocked | PASS | 404 complete=400 |
| T13_force_expire_db | PASS | links=1 |
| T13_after_48h_expired | PASS | EXPIRED |
| T13_expired_message | PASS | El período de acceso a esta asamblea ha finalizado. |
| T14_create_asm | PASS | 81f7a6a2-4ac4-45ef-a1fa-120749e22e94 |
| T14_cancel_invalidates | PASS | cancel=200 reason=CANCELLED |
| T15_token_bound_to_assembly | PASS | cancelReason=CANCELLED |
| T16_two_owners_independent | PASS | asmA=ab56d2a5-05b4-4614-9c43-426619c2f1a7 asmB=2e72154c-0162-4366-9bd0-a2e95f623153 |
| T17_single_active | PASS | oldInv=true newOk=true regen=200 |
| T18_reminder_reuses | PASS | same=true |
| T_no_14d_unit_suite | PASS | AccessLinkExpiryCalculatorTests passed locally |