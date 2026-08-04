# RiskPatch — System Overview

RiskPatch is a risk-based patch management and security compliance platform for on-premise infrastructure. It collects patch and compliance data from Windows and Linux endpoints, enriches it with real vulnerability severity and exploit data, computes a per-asset risk score, and exposes the results through a five-role, permission-enforced dashboard covering everything from fleet-wide risk visibility to individual patch deployment.

This document describes the system in full: data collection, the risk engine, access control, every dashboard surface, compliance mapping, remediation workflow, patch orchestration, notifications, the data model, and the system's current limitations.

## Architecture

The system has four layers. Endpoint agents (Wazuh, plus custom patch collector scripts) run on every monitored machine. A Node.js/Express backend ingests that data, enriches it, computes risk, and exposes a REST API. MongoDB holds all application state. A React frontend, served through nginx, presents role-specific dashboards and talks to the backend exclusively through the API — the frontend never touches the database directly.

nginx serves the production frontend build on port 80 and reverse-proxies every `/api/` request to the backend on port 5000, so the system is reachable at a single address with no visible port and no direct path from the browser to the database.

## Data Collection

Two independent collection pipelines run per OS family, on a fixed schedule, with no manual intervention required.

**Windows** endpoints run a scheduled task that queries the Windows Update API through the `PSWindowsUpdate` PowerShell module and reports missing updates to the backend's ingestion endpoint.

**Linux** endpoints run a scheduled shell script that checks for missing packages through the system package manager in simulate mode — the check never installs anything or holds a package-manager lock, so it can run at any time without interfering with the machine.

**Compliance data** comes from Wazuh's Security Configuration Assessment (SCA) module, which runs CIS Benchmark checks continuously against each endpoint and reports pass/fail/not-applicable per control, with remediation guidance attached.

Rather than trusting each endpoint's own internal SCA scan timer, a centrally-controlled wrapper script forces a fresh rescan across every enrolled asset on a fixed cycle before results are pulled into MongoDB. This replaced an earlier design that relied on independent per-endpoint timers, which left some assets' compliance data stale relative to others at any given point — a real problem for a system whose core function is comparing assets against one another on a common timeline.

## Vulnerability Enrichment

Every missing patch and every piece of installed software is checked against real vulnerability data from two independent pipelines, and the risk engine takes the more severe of the two as its primary input.

**Patch-derived enrichment** matches missing Windows updates against the Microsoft Security Response Center API, and missing Linux packages against a locally maintained Debian Security Tracker snapshot. A separate check against CIRCL's exploit-intelligence database determines whether a matched CVE has known public exploit code.

**Installed-software enrichment** comes from Wazuh's own vulnerability-detection module, which independently scans each endpoint's installed software for known CVEs regardless of whether an operating-system patch happens to be pending. This closes a real gap: without it, an asset carrying a serious vulnerability in already-installed software could show a misleadingly low score simply because nothing was currently missing at the OS level.

## The Risk Engine

The risk score is a fully explainable, weighted formula rather than a trained model, so any score can be traced back to specific, auditable inputs:

```
BaseRisk = (0.55 × CVSSFactor) + (0.45 × ComplianceFactor)
Score = clamp(round(BaseRisk × CriticalityMultiplier × ExposureMultiplier × 100), 0, 100)
```

`CVSSFactor` is computed as `clamp((CVSSValue × AgeFactor × ExploitBoost × VulnBoost) / 10, 0, 1)`:

- **CVSSValue** — the highest CVSS score found across either enrichment source described above
- **AgeFactor** — escalates the contribution the longer a missing patch has gone unaddressed: no boost under seven days, rising in stages to 1.5× past ninety days
- **ExploitBoost** — a flat 1.25× multiplier when any matched CVE has confirmed public exploit code available
- **VulnBoost** — a capped multiplier that rises with the count of critical- and high-severity installed-software vulnerabilities found on the asset, independent of whatever is driving the base CVSS value

`ComplianceFactor` is the proportion of the asset's CIS Benchmark checks currently failing.

The result is then scaled by `CriticalityMultiplier` (0.5–1.0, based on the asset's assigned business importance) and `ExposureMultiplier` (1.0 internet-facing, 0.8 DMZ, 0.5 internal, 0.2 isolated). Scores map to four priority bands: Critical at 75 and above, High at 50 and above, Medium at 25 and above, Low below that.

**Example:** an asset with CVSS 8.0, no unusually aged patches, a confirmed exploit, no additional installed-software boost, 40% of checks failing, criticality 0.9, and internal-only exposure computes to a Medium score of 33. The identical asset with internet-facing exposure instead of internal computes to 75.5 — Critical — demonstrating that network exposure alone can move an asset between priority bands independent of any change in its patch or compliance posture.

## Role-Based Access Control

Five roles, enforced by backend middleware on every API request — not implied by which buttons the frontend happens to render.

**Admin** has unrestricted access to every page and action, including user management and system operations.

**Compliance Officer** owns the remediation workflow: creating and assigning tickets (individually or in bulk), advancing ticket status, and managing asset groups. No access to patch deployment.

**Patch Operator** is the only non-admin role able to trigger a patch or restart. Deliberately excluded from Compliance, Tickets, Vulnerabilities, Asset Groups, Network Map, and the Audit Log — a separation-of-duties boundary ensuring the person applying a change is never the same role independently judging whether it satisfies compliance.

**Analyst** has broad read access across nearly the entire system — Assets, Patch Backlog, Compliance, Vulnerabilities, Tickets, Network Map, Asset Groups — plus four dedicated reporting pages, described below. No write or deployment action anywhere.

**Auditor** is read-only, scoped specifically to audit evidence: Compliance, Compliance History, Vulnerabilities, Tickets, and — uniquely among non-admin roles — the machine login Audit Log. No access to Assets, Backlog, Network Map, or Groups, since those are operational rather than evidentiary.

Every role except Auditor also gets a distinct home dashboard built around its actual job:

- **Admin** — full fleet overview: total assets, high/critical risk counts, non-compliant count, overdue patches, a fleet health gauge, a recent-activity feed, a risk trend chart, and the complete sortable asset table
- **Compliance Officer** — "My Workload" (tickets assigned to them, oldest first), a fleet-wide ticket-aging breakdown (fresh / aging / stale / critical), and the worst-compliance assets ranked by failing checks
- **Patch Operator** — total outstanding updates, overdue-asset count, fully-patched count, and a log of recent patch actions with their outcomes
- **Analyst** — fleet health, activity feed, risk trend chart, and a real dashboard-usage summary computed from actual login records

## Dashboard Pages

The full page inventory, grouped by function in the sidebar:

**Patch Management** — Patch Backlog (all missing updates grouped by asset, SLA tracking against configurable thresholds per priority band, per-machine and per-group "Patch All Missing" actions, maintenance-window configuration, CSV export) and Patch Log (full history of every patch action, filterable, with "Performed By" attribution).

**Compliance & Risk** — Compliance (CIS Benchmark and ISO 27001:2022 views, toggleable, with PDF export scoped to a single asset or the whole fleet), Compliance History (a fleet-wide, filterable log of every check state transition), Vulnerabilities (installed-software CVEs from the Wazuh scanner, severity-filterable, with CSV export), and Tickets (full remediation ticket management: individual or bulk creation from selected failing checks, bulk assignment, bulk status changes, self-assignment, and automatic closure on rescan).

**Assets** — Assets (live table with online/offline status, OS, IP, risk level, missing-patch count, and CIS failure count per machine), Asset Groups (logical grouping gated by network category — domain-joined, physical/standalone, or security-testing — with real membership exclusivity enforcement), and Network Map (visual topology by exposure zone with live status and risk scores).

**Audit & Monitoring** — Audit Log (machine login activity, Admin and Auditor only), User Activity (dashboard usage and login statistics, Admin and Analyst), and Device Discovery (subnet sweep for unregistered machines, Admin only).

**Administration** — Machines (registration, enrollment script generation, deregistration), User Management, and System Operations (all Admin only).

**Analyst Reports** — four dedicated, period-filterable, CSV-exportable pages available to Analyst and Admin: Login & Access Report (authentication activity over a selected window), Resolution Velocity Report (ticket resolution speed and volume by asset and by resolver, with average time-to-resolution), Patch Velocity Report (patch deployment volume by asset and operator, with a stale/never-collected asset alert), and Compliance Trend Report (a per-asset improving/stable/degrading verdict over a selected period, with an inline sparkline).

**My Profile** — self-service password change and personal activity history, available to every role.

## ISO/IEC 27001:2022 Mapping

CIS Benchmark results are mapped onto ISO/IEC 27001:2022 controls through a keyword-matching utility run against each check's title at collection time, rather than a fixed table tied to check identifiers — CIS revises those identifiers periodically, while what a given check actually verifies tends to remain recognizable across revisions.

Controls describing an organizational process rather than a checkable technical state — staff security-awareness training, for example — are deliberately excluded from the mapping table rather than forced into a superficial keyword match that would inflate an apparent coverage figure. The system reports partial, technically verifiable coverage rather than claiming full standard alignment.

## Remediation Ticketing

Tickets can be created individually against a single failing check, or in bulk by selecting multiple failing checks on one asset and assigning all of them to one person in a single action. Bulk status changes let many tickets be advanced together — useful when a single underlying configuration fix resolves the same failing check across several machines at once. A ticket closes itself automatically the moment a rescan confirms the underlying check now passes, independent of whether anyone updates its status manually, and independent of whether a ticket was ever created for it in the first place: every genuine compliance state transition is recorded permanently in the Compliance History collection regardless of the ticketing workflow.

## Patch Deployment

Deployment operates at three levels of granularity: a single update on a single asset, every missing update on one asset in a single action ("Patch All Missing"), and every missing update across every member of a named asset group in a single action.

Linux deployment runs over an SSH session that checks no other package operation is already in progress before proceeding. Windows deployment cannot use remote installation, since Windows Server policy blocks remote COM-based update installation — instead, a locally-installed polling agent running with SYSTEM privileges picks up a pending instruction and executes it, reporting the result back once complete.

Asset groups can additionally be assigned a recurring weekly maintenance window (day and time). Outstanding updates across the group's members deploy automatically when the window arrives, checked on a five-minute polling interval; the on-demand actions above remain available at any time as a manual override for anything that cannot wait for the next scheduled window.

## Asset Groups and Network Categories

Every registered machine carries a network category — domain-joined, physical/standalone, or dedicated security-testing tool — set explicitly at registration time. Asset groups can be locked to one of these categories, and membership is genuinely exclusive: a machine can belong to at most one category-locked group at a time. Attempting to add a machine already in a conflicting group is rejected with a specific error identifying which group it's already in, rather than silently allowed.

## Notifications

A generic, role- and user-targeted notification system backs a persistent notification center in the dashboard. Currently wired event types include repeated failed login attempts against a single account within a short window (alerting Admin), a successful login from a location not previously associated with an account (alerting both that user and Admin), and ticket lifecycle events — assignment, reassignment, and resolution — delivered to the relevant person. The underlying infrastructure supports additional event types by design; further categories (new critical vulnerabilities, SLA breaches, an asset going silent, scheduled-job failures) are scoped but not yet all implemented.

## Authentication and Security

Sessions are JSON Web Tokens issued on login and validated by backend middleware on every protected request; passwords are stored using bcrypt hashing. Role is embedded in the token and checked by a second middleware layer against each route's allowed roles, so access control is enforced identically whether a request originates from the dashboard or a direct API call.

## Data Model

MongoDB, organized around eleven core collections. `Assets` and `AssetMeta` hold asset identity and risk metadata (criticality, exposure level, role). `Agent` is the machine registry — OS, deployment method, credentials, network category, enrollment status. `Patches` records missing updates per asset; `CVEMatches` records the CVEs matched to them. `ComplianceChecks` holds live CIS results per asset; `ComplianceHistory` is a permanent, append-only log of every check's pass/fail transitions. `RiskSnapshots` stores historical risk scores over time, feeding the trend reports. `Users` holds accounts, bcrypt-hashed passwords, and roles. `Tickets` handles remediation tracking. `AgentCommands` logs every patch/restart action, including who triggered it and its outcome. `Assets.hostname` is the reference nearly every other collection keys off.

## Tech Stack

Backend: Node.js, Express, Mongoose. Database: MongoDB. Frontend: React. Endpoint monitoring: Wazuh (agent, manager, and OpenSearch for SCA and vulnerability-detection data). Reverse proxy: nginx. Authentication: JWT and bcrypt. Vulnerability sources: Microsoft Security Response Center, the Debian Security Tracker, CIRCL, and Wazuh's vulnerability-detection module.

## Current Limitations

The system has been tested against a small lab environment rather than a production-scale fleet, and testing has been manual and role-boundary-driven rather than an automated regression suite. Credentials used for patch deployment — SSH key paths and Windows agent secrets — are stored in MongoDB without field-level encryption at rest. The audit log has no tamper-evidence mechanism, so a direct database edit could alter historical records without detection. Several pieces of network configuration across the collector scripts and frontend build remain tied to the specific network this system was built and tested against, rather than resolved through DNS or a centralized configuration file. The risk engine's formula weights were set from first-principles justification rather than tuned against real incident history, since a lab of this scale cannot generate that volume of genuine data. Patch deployment has no automated rollback capability if a patch causes a problem after installation. The ISO 27001:2022 mapping is keyword-based and intentionally partial, not a substitute for formal certification.

These are documented as the concrete next steps for this system, not omissions discovered after the fact.