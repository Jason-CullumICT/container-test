# Dependency Auditor Findings -- 2026-03-24

## Mode: static

## Summary

No new dependencies added for pipeline orchestration feature. All 10 prior findings remain open. 3 new findings: TypeScript 6.0 available (1 major behind), @testing-library/react 2 majors behind, supertest 1 major behind. CVE status unchanged (4 moderate per project from esbuild CSRF). Supply chain clean.

## New Findings

### DEP-011: TypeScript 6.0 Major Version Available (P3)
- **Category:** Outdated
- **Package:** typescript@5.9.3 (both projects)
- **Description:** TypeScript 6.0.2 now available, 1 major behind.
- **Recommendation:** Test upgrade in feature branch.

### DEP-012: @testing-library/react 2 Major Versions Behind (P3)
- **Category:** Outdated
- **Package:** @testing-library/react@14.3.1 (Frontend)
- **Description:** Latest is 16.3.2, 2 major versions behind.
- **Recommendation:** Upgrade alongside React version bump.

### DEP-013: supertest 1 Major Version Behind (P4)
- **Category:** Outdated
- **Package:** supertest@6.3.4 (Backend dev)
- **Description:** Latest is 7.2.2, 1 major behind.
- **Recommendation:** npm install supertest@latest --save-dev.

## Re-Verification of Prior Findings

| ID | Title | Status |
|----|-------|--------|
| DEP-001 | esbuild CSRF CVE | STILL OPEN |
| DEP-002 | vitest inherited CVE | STILL OPEN |
| DEP-003 | vitest 2+ majors behind | STILL OPEN |
| DEP-004 | vite 2+ majors behind | STILL OPEN |
| DEP-005 | React ecosystem 1 major behind | STILL OPEN |
| DEP-006 | OpenTelemetry major gap | STILL OPEN |
| DEP-007 | Type definition drift | STILL OPEN |
| DEP-008 | Dev tooling fragmentation | STILL OPEN |
| DEP-009 | Dependency tree complexity | STILL OPEN |
| DEP-010 | uuid & express major lag | STILL OPEN |

## Cross-References
- [CROSS-REF: red-teamer] DEP-001: esbuild dev server CSRF
- [CROSS-REF: performance-profiler] DEP-006: OpenTelemetry upgrade may improve tracing
