# RiskPatch — System Overview

RiskPatch is a risk-based patch management and security compliance platform. It watches a fleet of Windows and Linux machines, figures out what's missing and what's misconfigured, attaches real vulnerability severity to each gap, and turns all of it into one risk score per machine that a compliance team can actually act on — instead of a spreadsheet nobody trusts.

This document walks through how it actually works, end to end.

## The problem it's solving

Most organizations without a dedicated security team handle patching the same way: someone checks periodically, updates get installed inconsistently, and compliance is a once-a-quarter manual review rather than something anyone watches continuously. Vulnerability data is out there publicly, but almost nobody connects it to their actual fleet — so a missing update is just a number, with no way to tell whether it's the one that matters or one that can wait another month. RiskPatch closes that loop automatically.

## How data gets in

Two collection paths run independently, one per OS family. On Windows, a scheduled task runs PowerShell against the Windows Update API (via `PSWindowsUpdate`) and posts whatever's missing to the backend. On Linux, a scheduled shell script does the equivalent check in simulate mode, so it never actually touches a package or holds a lock just to see what's outstanding.

Compliance data comes from Wazuh's SCA module, which runs CIS benchmark checks continuously on every endpoint. The tricky part turned out to be freshness, not collection — trusting each endpoint's own internal scan timer meant some machines' data was quietly stale relative to others at any given moment, which is a real problem for a system whose whole job is comparing machines against each other. The fix was a wrapper script that forces a fresh rescan across every enrolled asset on a fixed cycle before anything gets pulled into MongoDB, so the comparison is always apples to apples.

## Where the severity data comes from

Every missing patch gets checked against real vulnerability sources: Microsoft's Security Response Center for Windows KBs, a local snapshot of the Debian Security Tracker for Linux packages, and CIRCL for whether a public exploit exists. Separately, Wazuh's own vulnerability-detection module scans installed software directly, independent of whether an OS update happens to be pending — so a machine can't hide a serious vulnerability just because nothing's currently waiting to be patched. The risk engine takes whichever of the two sources is worse and uses that.

## The risk formula

This is the core of the system, and it's deliberately not a black box:

```
BaseRisk = (0.55 × CVSSFactor) + (0.45 × ComplianceFactor)
Score = clamp(round(BaseRisk × CriticalityMultiplier × ExposureMultiplier × 100), 0, 100)
```

`CVSSFactor` isn't just a raw CVSS score — it's `(CVSSValue × AgeFactor × ExploitBoost × VulnBoost) / 10`, clamped to 1. `AgeFactor` pushes the score up the longer a patch has sat unaddressed, from no boost under a week to 1.5× past ninety days. `ExploitBoost` adds 25% if a matched CVE has known public exploit code. `VulnBoost` adds a bit more if the machine is carrying several critical or high installed-software vulnerabilities on top of whatever's driving the base score. `ComplianceFactor` is just the proportion of CIS checks currently failing. The whole thing then gets scaled by how critical the asset is (0.5–1.0) and how exposed it is on the network (1.0 for internet-facing, down to 0.2 for isolated).

A concrete example: a domain controller with CVSS 8.0, a confirmed public exploit, 40% of its checks failing, high criticality, but sitting on an internal-only network, comes out to 33 — Medium. Move that exact same machine to internet-facing instead and nothing else changes, and it jumps to 75.5 — Critical. That's the whole point of the formula: severity alone doesn't tell you what to fix first, exposure and context do.

It's a weighted linear formula rather than something trained on data, on purpose. An analyst or an auditor can always ask "why did this score come out this way" and get a real answer traced through actual numbers, instead of a model's opinion.

## Who sees what

Five roles, and the boundaries are enforced by the backend on every request, not just hidden behind menu items in the frontend:

**Admin** sees and can do everything. **Compliance Officer** owns the remediation side — creating and assigning tickets, tracking resolution — but can't touch patch deployment at all. **Patch Operator** is the reverse: the only non-admin role that can actually push a patch, with zero visibility into compliance or tickets. That split is deliberate — the person applying a change shouldn't also be the person independently judging whether it satisfies compliance. **Analyst** gets broad read access across almost everything plus four dedicated reporting pages, but can't take any action anywhere. **Auditor** is the odd one out: read-only, but with access to the machine login audit log that nobody else gets, because their whole job is checking the system from outside the operational loop.

Each role also gets a genuinely different home dashboard — admin sees the whole fleet, compliance officer sees their ticket queue sorted by age, patch operator sees what's overdue and what they've recently deployed, analyst sees fleet health plus real usage stats instead of anything actionable.

## Compliance mapping

CIS benchmark results get mapped onto ISO/IEC 27001:2022 controls automatically, so one scan produces evidence usable for both frameworks. The mapping works by matching keywords in each check's title rather than a fixed table of check IDs, because CIS revises its identifiers periodically while what a check actually tests stays recognizable.

The part worth being upfront about: controls that describe a process rather than a technical setting — staff security training, for instance — get left unmapped on purpose instead of forced into a superficial match just to inflate a coverage number. The system reports partial, genuinely verifiable coverage, not a false claim of full alignment.

## Tickets and patching

A failing check becomes a ticket, either one at a time or in bulk — select a batch of failures and assign all of them to one person in a single action. Tickets can be advanced individually or together, and they close themselves automatically the moment a rescan shows the underlying check passing, whether or not anyone touched the ticket manually.

Patching works at three scales: one update on one machine, every missing update on one machine in a single click, or every missing update across an entire named group of machines at once. Linux goes over SSH with a lock check first. Windows can't be patched remotely because Server policy blocks it, so a locally-running agent picks up a pending instruction and executes it with the privileges it needs. Groups can also carry a recurring weekly maintenance window, so patching just happens on schedule without anyone triggering it — with a manual override always available for anything that can't wait.

## Asset groups actually mean something

Every registered machine has a network category: domain-joined, physical/standalone, or a dedicated security-testing box. Groups can be locked to one of these categories, and a machine can only belong to one category-locked group at a time — trying to add a domain-joined server into a security-testing group gets rejected outright instead of silently allowed, which is exactly the kind of thing that used to slip through before this was built.

## Staying on top of things without watching the dashboard

The notification system flags repeated failed logins against one account, a successful login from a location that account hasn't used before, and ticket lifecycle events — assigned, reassigned, resolved — delivered to whoever actually needs to know, not broadcast to everyone.

## The database, briefly

MongoDB, built around eleven collections. `Assets` and `AssetMeta` hold identity and risk metadata; `Agent` is the machine registry with deploy credentials and network category; `Patches` and `CVEMatches` track what's missing and what CVEs matched; `ComplianceChecks` holds live CIS results, `ComplianceHistory` permanently logs every state change; `RiskSnapshots` stores score history over time; `Users`, `Tickets`, and `AgentCommands` round out accounts, remediation, and the patch action log. Almost everything keys back to `Assets.hostname`.

## What's not solved yet

Worth stating plainly rather than glossing over. The system's been tested against a small lab, not a production-scale fleet, and testing has been manual rather than an automated regression suite. Credentials — SSH keys, Windows agent secrets — sit in MongoDB without field-level encryption at rest. The audit log has no tamper-evidence, so a direct database edit could alter it without a trace. Some network configuration is still tied to the specific lab it was built on rather than resolved through DNS. The risk formula's weights are reasoned from first principles, not tuned against real incident history, because a lab this size can't generate enough of that to tune against meaningfully. There's no automated rollback if a patch breaks something. And the ISO mapping, as covered above, is intentionally partial rather than a certification substitute.

None of these are hidden — they're the actual next things to build, and they're documented as such rather than pretended away.