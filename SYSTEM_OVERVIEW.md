# RiskPatch — System Overview

A complete technical walkthrough of what RiskPatch does, how it's built, and why it's built that way. This is the deep-dive companion to the top-level README.

---

## Table of Contents

1. [What Problem This Solves](#what-problem-this-solves)
2. [Architecture](#architecture)
3. [Data Collection](#data-collection)
4. [CVE Enrichment](#cve-enrichment)
5. [The Risk Engine](#the-risk-engine)
6. [Role-Based Access Control](#role-based-access-control)
7. [Dashboard Pages, By Role](#dashboard-pages-by-role)
8. [ISO/IEC 27001:2022 Mapping](#isoiec-270012022-mapping)
9. [Remediation Ticketing](#remediation-ticketing)
10. [Patch Deployment](#patch-deployment)
11. [Asset Groups & Network Categories](#asset-groups--network-categories)
12. [Notifications](#notifications)
13. [Database Schema](#database-schema)
14. [Known Limitations](#known-limitations)

---

## What Problem This Solves

Patch installation is often automated at the individual machine level (Windows Update, `apt`), but tracking which assets are actually up to date, which have silently failed, and which are overdue across an entire fleet is a different problem — one most small and mid-size organizations still handle manually. Compliance checks (CIS benchmarks) typically run periodically rather than continuously. Vulnerability severity data (CVE/CVSS) exists publicly but is rarely connected to the specific assets it affects.

RiskPatch connects all three: what's missing, how compliant each machine is, and how severe the exposure actually is — into one number per asset, so a compliance officer or analyst can act on what matters most instead of triaging a flat list.

---

## Architecture

```
┌─────────────────────┐     ┌──────────────────────┐
│  Monitored Endpoints │     │   Patch Collector      │
│  (Windows / Linux)    │────►│   Scripts (per OS)     │
└──────────┬───────────┘     └──────────┬────────────┘
           │                            │
           ▼                            ▼
   ┌───────────────┐          ┌──────────────────┐
   │ Wazuh Manager  │          │  Backend Ingestion │
   │ (CIS SCA scan) │          │  API (Express)     │
   └───────┬────────┘          └─────────┬──────────┘
           │                             │
           ▼                             ▼
   ┌───────────────┐          ┌──────────────────┐
   │  OpenSearch    │◄─────────│   MongoDB          │
   │ (raw scan data)│  pulled  │ (application state) │
   └────────────────┘  every   └─────────┬──────────┘
                        cycle             │
                                          ▼
                              ┌───────────────────────┐
                              │  React Dashboard        │
                              │  (nginx-served, JWT auth)│
                              └───────────────────────┘
```

The backend never trusts each endpoint's own scan timer to keep data fresh — a wrapper script (`auto_rescan_all.sh`) forces a fresh rescan across every enrolled asset on a fixed interval before compliance data is pulled centrally. This was a real fix made during development after discovering that relying on independent per-endpoint timers left some assets stale relative to others at any given moment, which is exactly the kind of inconsistency a risk-ranking system can't tolerate.

---

## Data Collection

Two independent, OS-specific collection paths:

- **Windows** — a scheduled task runs a PowerShell script that queries the Windows Update API via the `PSWindowsUpdate` module for missing updates, and posts the result to the backend's ingestion endpoint.
- **Linux** — a scheduled shell script checks for missing updates via the package manager in simulate mode (so the check never installs anything or holds a package-manager lock), and posts the result the same way.

**Compliance data** comes from Wazuh's Security Configuration Assessment (SCA) module, running CIS benchmark checks continuously on every endpoint. The centrally-controlled rescan cycle described above pulls fresh results into MongoDB on a fixed schedule, rather than trusting each endpoint's independent timer.

---

## CVE Enrichment

Every missing patch and every piece of installed software is checked against real vulnerability data from two independent sources:

1. **Patch-derived CVEs** — missing Windows updates are matched via the Microsoft Security Response Center (MSRC) API; missing Linux packages are matched against a locally maintained Debian Security Tracker snapshot. A separate check against CIRCL's exploit-intelligence database determines whether a matched CVE has known public exploit code.
2. **Installed-software CVEs** — Wazuh's own vulnerability-detection module independently scans each endpoint's installed software and reports CVEs found there, regardless of whether an OS-level patch is currently pending.

The risk engine takes the **higher** of the two severity signals, so an asset can't return a falsely low score simply because no OS update happens to be outstanding while a serious vulnerability sits in already-installed software.

---

## The Risk Engine

The complete formula, exactly as implemented:

```
BaseRisk = (0.55 × CVSSFactor) + (0.45 × ComplianceFactor)
Score = clamp(round(BaseRisk × CriticalityMultiplier × ExposureMultiplier × 100), 0, 100)
```

Where:

| Term | Definition |
|---|---|
| `CVSSFactor` | `clamp((CVSSValue × AgeFactor × ExploitBoost × VulnBoost) / 10, 0, 1)` |
| `CVSSValue` | The highest CVSS score across either enrichment source |
| `AgeFactor` | Escalates the CVSS contribution the longer a patch has sat unaddressed — no boost under 7 days, up to 1.5× past 90 days |
| `ExploitBoost` | 1.25× if any matched CVE has known public exploit code, else 1.0× |
| `VulnBoost` | A capped multiplier that rises with the number of critical/high installed-software vulnerabilities found, independent of the exploit boost |
| `ComplianceFactor` | Proportion of the asset's CIS benchmark checks currently failing |
| `CriticalityMultiplier` | 0.5–1.0, based on the asset's assigned business criticality |
| `ExposureMultiplier` | 1.0 internet-facing / 0.8 DMZ / 0.5 internal / 0.2 isolated |

**Priority bands:** Critical ≥75, High ≥50, Medium ≥25, Low <25.

The formula is a deliberate weighted linear combination rather than a machine-learning model — fully explainable to an analyst or auditor asking "why did this asset score this way," which matters more for this use case than marginal predictive-accuracy gains a black-box model might offer.

**Worked example** (illustrative, not a live measurement): a domain controller with CVSS 8.0, no unusually aged patches, a confirmed public exploit, no additional installed-software vulnerability boost, 40% of CIS checks failing, criticality 0.9, and internal-only exposure:

```
CVSSFactor = clamp((8.0 × 1.0 × 1.25 × 1.0) / 10, 0, 1) = 1.0
ComplianceFactor = 0.40
BaseRisk = (0.55 × 1.0) + (0.45 × 0.40) = 0.73
Score = round(0.73 × 0.9 × 0.5 × 100) = 33 → Medium
```

The same asset with internet-facing exposure instead (`ExposureMultiplier = 1.0`) computes to **75.5 → Critical** — demonstrating that network exposure alone can move an asset between priority bands, independent of any change in patch or compliance posture.

---

## Role-Based Access Control

Five roles, enforced at the backend route level (not just hidden in the frontend):

| Feature | Admin | Compliance Officer | Patch Operator | Analyst | Auditor |
|---|---|---|---|---|---|
| Asset overview, network map | ✅ | ✅ | ✅ | ✅ | ❌ |
| Patch backlog (view) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Deploy patch / restart | ✅ | ❌ | ✅ | ❌ | ❌ |
| Compliance (CIS + ISO 27001) | ✅ | ✅ | ❌ | ✅ | ✅ |
| Vulnerabilities | ✅ | ✅ | ❌ | ✅ | ✅ |
| Tickets (view) | ✅ | ✅ | ❌ | ✅ | ✅ |
| Create / bulk-assign tickets | ✅ | ✅ | ❌ | ❌ | ❌ |
| Asset groups | ✅ | ✅ | ❌ | ✅ | ❌ |
| Machine audit log | ✅ | ❌ | ❌ | ❌ | ✅ |
| Analyst reporting pages | ✅ | ❌ | ❌ | ✅ | ❌ |
| Machine registration / user management | ✅ | ❌ | ❌ | ❌ | ❌ |

The **Patch Operator / Compliance Officer split** is the core separation-of-duties decision: the person applying a patch is never the same role independently judging whether the resulting state is compliant.

---

## Dashboard Pages, By Role

Each role gets a home view built around its actual job rather than a single fixed dashboard:

- **Admin** — full fleet overview, health gauge, risk trend chart, complete asset table
- **Compliance Officer** — "My Workload" (assigned tickets, oldest first), fleet-wide ticket-aging breakdown, worst-compliance assets ranked
- **Patch Operator** — total outstanding updates, overdue assets, recent patch actions and outcomes
- **Analyst** — reporting-focused: fleet health, activity feed, trend chart, plus real dashboard-usage stats

**Analyst-exclusive reporting pages** (all with period filtering and CSV export):
- **Login & Access Report** — authentication activity over a selected period
- **Resolution Velocity Report** — ticket resolution speed by asset and resolver, with average time-to-resolution
- **Patch Velocity Report** — patch deployment volume by asset and operator, plus a stale/never-collected asset alert
- **Compliance Trend Report** — per-asset improving/stable/degrading verdict over time, with sparklines

---

## ISO/IEC 27001:2022 Mapping

CIS benchmark results are mapped onto ISO/IEC 27001:2022 controls via a keyword-matching utility run against each check's title at collection time — not a fixed table tied to check identifiers, since CIS revises those identifiers over time while the substance of what a check tests tends to stay recognizable.

**Deliberately honest scope**: controls with no genuine technical fingerprint — such as staff security-awareness training or incident-reporting culture — are excluded from the mapping table entirely, rather than forced into a superficial keyword match that would inflate an apparent coverage number. The system states a coverage percentage rather than claiming full ISO 27001:2022 alignment.

---

## Remediation Ticketing

- Tickets can be created individually or in **bulk** — select multiple failing checks on one asset and create tickets for all of them, assigned to one person, in a single action.
- **Bulk status changes** let many tickets be advanced together when one underlying fix resolves the same failure across several machines.
- A ticket **closes itself automatically** once a rescan confirms the underlying check now passes — independent of whether anyone manually updates its status.
- Every genuine compliance state transition (fixed or newly failing) is recorded in a permanent **ComplianceHistory** log, regardless of whether a ticket was ever raised for it.

---

## Patch Deployment

Three levels of granularity:

1. **Single update** — one package/KB on one asset
2. **Whole-machine** — "Patch All Missing" deploys every outstanding update on one asset in one action
3. **Group-level** — deploy across every member of a named asset group in one action, machine by machine

**Mechanism differs by OS:** Linux deployment happens over SSH, checking no other package operation is already in progress before proceeding. Windows deployment writes a pending instruction that a locally-running polling agent picks up and executes with the privileges it needs — necessary because Windows Server policy blocks remote update installation through ordinary remote-management channels.

**Maintenance windows**: an asset group can be assigned a recurring weekly schedule (day + time). Outstanding updates across the group deploy automatically when the window arrives; the on-demand deployment above remains available at any time as a manual override.

---

## Asset Groups & Network Categories

Every registered machine carries a `networkCategory`: `domain` (domain-joined), `physical` (standalone/BYOD), or `security` (dedicated security-testing tool). Asset Groups can optionally be gated to one of these categories, and — critically — **a machine can only belong to one category-gated group at a time**. Attempting to add a machine already in a conflicting group is rejected with a clear error rather than silently allowed, which was a real bug found and fixed during development (a domain-joined machine could previously be added to a security-testing group with no validation at all).

---

## Notifications

A generic, role- and user-targeted notification system, with detection wired in for:

- **Brute-force login attempts** — repeated failed logins against one account within a short window, alerting admin
- **Logins from an unfamiliar location** — a successful login from an IP not previously associated with that account, alerting both the account and admin
- **Ticket lifecycle events** — assigned, reassigned, or resolved, delivered to the relevant person

The underlying infrastructure (a generic `Notification` model + reusable `createNotification()` helper) supports additional event types — new critical vulnerabilities, SLA breaches, asset going silent, and others are designed but not yet all wired in.

---

## Database Schema

MongoDB, eleven core collections:

| Collection | Purpose |
|---|---|
| `Assets` / `AssetMeta` | Asset identity, criticality, exposure level |
| `Agent` | Machine registry — OS, deploy method, credentials, network category |
| `Patches` | Missing update records per asset |
| `CVEMatches` | CVEs matched to missing patches |
| `ComplianceChecks` | Live CIS check results per asset |
| `ComplianceHistory` | Permanent log of every check state transition |
| `RiskSnapshots` | Historical risk scores per asset over time |
| `Users` | Accounts, bcrypt-hashed passwords, roles |
| `Tickets` | Remediation tracking |
| `AgentCommands` | Patch/restart action log, including who triggered it |

`Assets.hostname` is the central reference nearly every other collection keys off.

---

## Known Limitations

Stated plainly rather than glossed over:

- Tested against a small lab (a handful of VMs plus physical machines), not a production-scale fleet
- Testing was manual/black-box rather than an automated regression test framework
- Credentials (SSH keys, Windows agent secrets) are stored in MongoDB without field-level encryption at rest
- The audit log has no tamper-evidence mechanism protecting it from a direct database edit
- Several network-configuration values are still tied to the specific lab network rather than resolved via DNS or centralized config
- The risk engine's weights were set from reasoned first principles, not tuned against real incident history (which a lab environment can't generate at meaningful volume)
- No automated patch rollback — a health-check/pre-flight-snapshot approach is the planned, safer next step
- The ISO 27001:2022 mapping is keyword-based and partial by design, not a certification substitute

See the dissertation's Future Work chapter for the fuller roadmap this project scoped but didn't build, including SIEM-source abstraction (beyond Wazuh), cloud/CSPM coverage, staged patch rollout, and EPSS/KEV vulnerability intelligence.
