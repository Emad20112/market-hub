# Agent Start Guide

Welcome. This repository has an approved target architecture for the material and milling domains. Do not restart the analysis or implement from assumptions.

## Read in this order before changing anything

1. [00_PROJECT_ARCHITECTURE_OVERVIEW.md](00_PROJECT_ARCHITECTURE_OVERVIEW.md)
2. [01_CURRENT_SYSTEM_ANALYSIS.md](01_CURRENT_SYSTEM_ANALYSIS.md)
3. [02_ARCHITECTURE_GAP_REPORT.md](02_ARCHITECTURE_GAP_REPORT.md)
4. [03_TARGET_CORE_ARCHITECTURE.md](03_TARGET_CORE_ARCHITECTURE.md)
5. [04_MATERIAL_LEDGER_DESIGN.md](04_MATERIAL_LEDGER_DESIGN.md)
6. [05_DOMAIN_MODELS.md](05_DOMAIN_MODELS.md)
7. [06_POSTING_ENGINE_SPECIFICATION.md](06_POSTING_ENGINE_SPECIFICATION.md)
8. [07_VALIDATION_POLICIES.md](07_VALIDATION_POLICIES.md)
9. [08_EVENT_AND_OUTBOX_DESIGN.md](08_EVENT_AND_OUTBOX_DESIGN.md)
10. [09_SECURITY_AUTHORIZATION_MODEL.md](09_SECURITY_AUTHORIZATION_MODEL.md)
11. [10_MIGRATION_ROADMAP.md](10_MIGRATION_ROADMAP.md)
12. [11_PHASE1_IMPLEMENTATION_PLAN.md](11_PHASE1_IMPLEMENTATION_PLAN.md)
13. [13_DECISION_LOG.md](13_DECISION_LOG.md)
14. [14_KNOWN_ISSUES_AND_RISKS.md](14_KNOWN_ISSUES_AND_RISKS.md)

## Non-negotiable rules

- Do not update `inventory` or a material balance directly from a screen.
- Do not store a mutable material balance in a business document.
- Do not update or delete a posted ledger transaction or entry.
- Correct postings only through approved reversal or adjustment.
- Do not drop legacy tables or delete business data.
- All Phase 1 migrations are add-only.
- Do not rewrite migrations that may have been deployed.
- Any architectural deviation requires review and an ADR before implementation.
- Keep sales, purchases, inventory, customer ledger, and accounting behaviour unchanged until their explicit integration phase.

## Working method

Read `AGENTS.md`, inspect the current migration chain and working tree, identify the current roadmap phase, then propose the smallest reviewed change. Run build and relevant tests after every implementation package. Do not silently expand scope.
