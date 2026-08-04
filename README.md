# RiskPatch

**An Intelligent, Risk-Based Patch Management and Security Compliance Framework**

RiskPatch turns disconnected patch, compliance, and vulnerability data into a single, actionable risk score per asset — built entirely on free, open-source components for organizations that can't justify commercial security tooling licensing.

Built as a graduation project at Jamhuriya University of Science and Technology (JUST), Mogadishu, Somalia.

---

## The Problem

Most organizations without dedicated security tooling track patching manually — spreadsheets, periodic checklists, no continuous monitoring. Compliance checks run on a schedule instead of continuously. Vulnerability severity data exists publicly but is rarely connected to the specific assets it actually affects. The result: a missing patch is just a number, with no way to tell whether it's the one that matters or one that can wait.

RiskPatch closes that gap: it collects patch and compliance data automatically from Windows and Linux endpoints, enriches missing patches and installed software with real CVE/CVSS severity and exploit-availability data, computes a single risk score per asset, and puts the result in front of the right person through a role-scoped dashboard — built for decision-making, not just data display.

## Core Capabilities

- **Automated multi-OS data collection** — scheduled Windows and Linux patch collectors, plus Wazuh-based CIS compliance scanning, with a centrally-controlled rescan cycle to keep every asset's data consistently fresh
- **CVE-enriched risk scoring engine** — a weighted, fully-explainable formula combining CVSS severity, patch age, exploit availability, installed-software vulnerability volume, compliance failure rate, asset criticality, and network exposure into one score per asset
- **Five-role access-controlled dashboard** — Admin, Compliance Officer, Patch Operator, Analyst, and Auditor, each with a distinct home view and enforced backend-level permissions built on least-privilege and separation-of-duties principles
- **ISO/IEC 27001:2022 compliance mapping** — CIS benchmark results mapped onto ISO controls via keyword matching, so one scan produces evidence for two frameworks; controls with no genuine technical fingerprint are deliberately left unmapped rather than forced into a misleading match
- **Remediation ticketing** — individual or bulk ticket creation from failing checks, assignment, bulk status changes, and automatic closure once a rescan confirms the underlying issue is fixed
- **Patch deployment at three levels** — single update, whole-machine ("Patch All Missing"), and group-level deployment, plus recurring weekly maintenance windows with a manual override always available
- **Network-category-gated asset groups** — groups are restricted to matching machine categories (domain-joined, physical/standalone, or dedicated security-testing), with real exclusivity enforcement so a machine can't sit in two conflicting groups at once
- **Proactive notifications** — brute-force login detection, logins from an unfamiliar location, and ticket lifecycle events, delivered through a persistent notification center rather than requiring anyone to go looking
- **Four analyst reporting pages** — Login & Access, Resolution Velocity, Patch Velocity, and Compliance Trend, each with period filtering and CSV export

## Architecture

```
Monitored Endpoints (Windows / Linux)
        │
        ├── Wazuh Agent ──► Wazuh Manager ──► OpenSearch (CIS compliance + vulnerability scan data)
        │
        └── Patch Collector Scripts ──► Backend Ingestion API

Backend (Node.js + Express)
        ├── CVE/CVSS enrichment (MSRC, Debian Security Tracker, CIRCL)
        ├── Risk engine
        ├── ISO 27001:2022 mapping
        ├── Ticketing + patch deployment
        └── MongoDB (application state)

nginx ──► serves the React frontend, proxies /api to the backend

React Dashboard ──► role-scoped views (Admin, Compliance Officer, Patch Operator, Analyst, Auditor)
```

See [`SYSTEM_OVERVIEW.md`](./SYSTEM_OVERVIEW.md) for a full technical breakdown, including the complete risk-scoring formula, the database schema, and every page's role permissions.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express, Mongoose |
| Database | MongoDB |
| Frontend | React |
| Endpoint monitoring | Wazuh (agent + manager + OpenSearch) |
| Authentication | JWT + bcrypt |
| Reverse proxy | nginx |
| Vulnerability sources | MSRC, Debian Security Tracker, CIRCL, Wazuh vulnerability-detection module |

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB
- A Wazuh Manager instance (agent-based endpoint monitoring)
- nginx (for production deployment)

### Installation

```bash
git clone https://github.com/<your-username>/riskpatch.git
cd riskpatch/backend
npm install
cp .env.example .env   # fill in your MongoDB URI, JWT secret, and Wazuh API credentials
npm start
```

```bash
cd ../frontend
npm install
npm run build
```

Point nginx at the built frontend and proxy `/api` to the backend on its configured port. See [`SYSTEM_OVERVIEW.md`](./SYSTEM_OVERVIEW.md) for the full deployment walkthrough, including Wazuh agent enrollment and the endpoint collector scripts.

> **Note:** network addressing throughout the collector scripts and `.env` configuration is currently tied to the specific lab this project was built and tested against. Deploying to a different network requires updating these references — see the Future Work section in the dissertation for the planned fix (DNS-based/centralized configuration).

## Role Model

| Role | Scope |
|---|---|
| **Admin** | Full system access |
| **Compliance Officer** | Owns remediation: creates/assigns tickets, tracks resolution — no patch deployment access |
| **Patch Operator** | Owns patching: the only non-admin role that can deploy patches — no compliance/ticket visibility |
| **Analyst** | Broad read-only access across the fleet, plus the four reporting pages — no write actions anywhere |
| **Auditor** | Independent, read-only verification: compliance evidence and the machine audit log — no operational access |

This separation is enforced at the backend route level, not just hidden in the frontend navigation.

## Project Structure

```
riskpatch/
├── backend/
│   ├── routes/          # API route handlers
│   ├── models/          # Mongoose schemas
│   ├── middleware/       # auth, role-checking, activity logging
│   ├── collectors_*.js   # scheduled data collection scripts
│   └── maintenanceScheduler.js
├── frontend/
│   └── src/
│       ├── pages/        # one file per dashboard page
│       └── Layout.js      # role-filtered navigation
└── SYSTEM_OVERVIEW.md
```

## Documentation

- [`SYSTEM_OVERVIEW.md`](./SYSTEM_OVERVIEW.md) — full technical deep-dive: risk formula, database schema, every page and its permissions, the notification system, and known limitations
- Dissertation chapters (methodology, implementation, results) available on request

## Authors

Abdirizak Dahir Muhidin · Abdimalik Yusuf Mohamud · Husni Salad Mohamed · Mukhtar Yusuf Amin

Jamhuriya University of Science and Technology (JUST), Faculty of Computer & Information Technology

## License

*(Add your chosen license here — MIT is a common default for academic/portfolio projects if you want others to freely use and build on this.)*
