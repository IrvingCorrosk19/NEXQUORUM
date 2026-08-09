# Server baseline (evidence)

Captured during ASAMBLEAS pilot deploy. No secrets.

| Item | Value |
|------|--------|
| OS | Ubuntu 24.04.3 LTS |
| CPU | 6 vCPU |
| RAM | 11 Gi (approx 5 Gi used at baseline) |
| Disk | 193G total / ~38G avail (~81% used) |
| Public IP | 164.68.99.83 |
| Existing apps | Multiple `/opt/apps/*` Docker stacks + Nginx sites (untouched) |
| Host PostgreSQL | Not used; ASAMBLEAS uses dedicated container |
| Host .NET | Not required; app runs in container |
| Docker | Present and used |
| Firewall | UFW; opened 8092/tcp, 7880/tcp (legacy), 7881/tcp, 7882-7892/udp for ASAMBLEAS |

## Non-interference

No global Nginx overwrite. Dedicated `sites-available/asambleas.conf`. No DROP of unrelated databases. No reboot of VPS.
