## Dependency Auditor Findings

**Audit Date:** 2026-03-23
**Re-verified:** 2026-03-23 (second pass — static mode)

### Package Managers Detected: npm
### Direct Dependencies: 18 total (Backend: 9 prod + 10 dev, Frontend: 3 prod + 14 dev)
### Transitive Dependencies: 973 total (Backend: 549, Frontend: 424)
### Known CVEs: 4 moderate (Backend: 4, Frontend: 4 — same root cause)

---

### DEP-001: esbuild CSRF in Development Server — STILL OPEN
- **Severity:** P3
- **Category:** cve
- **Package:** esbuild@0.21.5 (bundled in vite)
- **File:** Source/Backend/package-lock.json, Source/Frontend/package-lock.json
- **Detail:** GHSA-67mh-4wv8-2f99 (CWE-346)
  - Title: "esbuild enables any website to send any requests to the development server and read the response"
  - CVSS Score: 5.3 (Moderate)
  - Affected versions: esbuild <=0.24.2
  - Installed version: 0.21.5 (via vite 5.4.21)
  - Attack requires user interaction (AC:H) in browser context
  - Primarily affects development workflows; minimal production risk
- **Fix:** Backend: `npm install vitest@latest --save-dev` (upgrades to 4.1.0+). Frontend: `npm install vite@latest vitest@latest --save-dev` (upgrades to vite 8.0.1+ / vitest 4.1.0+)
- **Cross-ref:** [CROSS-REF: red-teamer] — Verify esbuild dev server is not exposed in staging/production

---

### DEP-002: vitest Vulnerable Range (Inherited from vite/esbuild) — STILL OPEN
- **Severity:** P4
- **Category:** cve (inherited)
- **Package:** vitest@1.6.1
- **File:** Source/Backend/package.json, Source/Frontend/package.json
- **Detail:** npm audit reports vitest in vulnerable range `0.3.3 - 2.2.0-beta.2` due to transitive dependency on vite-node which pulls in the vulnerable vite/esbuild. The CVE is the same as DEP-001; vitest is an affected consumer, not the source.
- **Fix:** Same as DEP-001 — upgrade vitest to 4.1.0+

---

### DEP-003: Major Version Lag — vitest (2 major versions behind) — STILL OPEN
- **Severity:** P2
- **Category:** outdated
- **Package:** vitest@1.6.1
- **File:** Source/Backend/package.json, Source/Frontend/package.json
- **Current:** 1.6.1
- **Latest:** 4.1.0
- **Gap:** 2 major versions behind (v2, v3, v4 released)
- **Detail:** vitest 2.0, 3.0, and 4.0 contain breaking changes, performance improvements, and security patches. Upgrading also resolves DEP-001/DEP-002 CVEs.
- **Fix:** `npm install vitest@latest --save-dev` in both Backend and Frontend; update test configs for breaking changes
- **Risk:** Likely requires test suite updates; may reveal previously hidden test issues

---

### DEP-004: Major Version Lag — vite (2 major versions behind) — STILL OPEN
- **Severity:** P2
- **Category:** outdated
- **Package:** vite@5.4.21 (Frontend direct dep; Backend transitive via vitest)
- **File:** Source/Frontend/package.json
- **Current:** 5.4.21
- **Latest:** 8.0.1
- **Gap:** 2 major versions behind (v6, v7, v8)
- **Detail:** vite 6.0, 7.0, 8.0 contain build performance improvements, rollup upgrades, and breaking API changes. Missing esbuild updates that fix the CVE in DEP-001.
- **Fix:** `npm install vite@latest --save-dev` (requires careful testing of build output)

---

### DEP-005: Major Version Lag — React & ecosystem (1 major behind) — STILL OPEN
- **Severity:** P3
- **Category:** outdated
- **Package:** react@18.3.1, react-dom@18.3.1, react-router-dom@6.30.3
- **File:** Source/Frontend/package.json
- **Current:** React 18.3.1, react-router-dom 6.30.3
- **Latest:** React 19.2.4, react-router-dom 7.13.1
- **Gap:** 1 major version behind each
- **Detail:** React 19 includes compiler optimizations and new hooks. Router v7 has API changes. Not critical but missing recent stability improvements.
- **Fix:** `npm install react@latest react-dom@latest react-router-dom@latest --save`
- **Testing Required:** Full integration testing; router changes may affect route definitions

---

### DEP-006: OpenTelemetry Major Version Gap — STILL OPEN
- **Severity:** P3
- **Category:** outdated
- **Package:** @opentelemetry/* (4 packages)
- **File:** Source/Backend/package.json
- **Current / Latest:**
  - @opentelemetry/api: 1.7.0 -> 1.9.0 (minor, within semver range)
  - @opentelemetry/auto-instrumentations-node: 0.40.3 -> 0.71.0 (31 minor versions behind)
  - @opentelemetry/exporter-trace-otlp-http: 0.47.0 -> 0.213.0 (166 minor versions behind)
  - @opentelemetry/sdk-node: 0.47.0 -> 0.213.0 (166 minor versions behind)
- **Detail:** OTel packages follow 0.x versioning so every minor bump can be breaking. The gap is enormous (166 releases). May contain critical tracing stability and security fixes.
- **Fix:** Plan gradual upgrade:
  1. `npm install @opentelemetry/api@latest` (minor bump, safe)
  2. Then upgrade sdk-node, exporter, and auto-instrumentations together
  3. Test trace collection thoroughly
- **Testing Required:** Verify all traces reach backend; confirm span structure integrity
- **Cross-ref:** [CROSS-REF: performance-profiler] — OTel upgrades may improve tracing overhead

---

### DEP-007: Type Definition Drift — STILL OPEN
- **Severity:** P3
- **Category:** outdated
- **Package:** @types/node, @types/express, @types/react, @types/react-dom, @types/supertest, @types/uuid
- **File:** Source/Backend/package.json, Source/Frontend/package.json
- **Detail:**
  - @types/node: 20.19.37 -> 25.5.0 (5 major versions behind)
  - @types/express: 4.17.25 -> 5.0.6 (1 major behind, tracks Express 5)
  - @types/react: 18.3.28 -> 19.2.14 (1 major behind, tracks React 19)
  - @types/react-dom: 18.3.7 -> 19.2.3 (1 major behind)
  - @types/supertest: 6.0.3 -> 7.2.0 (1 major behind)
  - @types/uuid: 9.0.8 -> 10.0.0 (1 major behind)
- **Fix:** Update types alongside their corresponding runtime packages
- **Risk:** May require TypeScript code changes if API signatures changed

---

### DEP-008: Development Tooling Fragmentation — STILL OPEN
- **Severity:** P3
- **Category:** outdated
- **Package:** tailwindcss@3.4.19, autoprefixer@10.4.27, postcss@8.5.8, @vitejs/plugin-react@4.7.0, jsdom@24.1.3
- **File:** Source/Frontend/package.json
- **Current / Latest:**
  - tailwindcss: 3.4.19 -> 4.2.2 (1 major behind)
  - @vitejs/plugin-react: 4.7.0 -> 6.0.1 (2 major behind) **NEW**
  - jsdom: 24.1.3 -> 29.0.1 (5 major behind) **NEW**
- **Detail:** tailwindcss v4 has configuration changes and new utility classes. @vitejs/plugin-react v6 aligns with vite v8. jsdom 29 includes DOM spec compliance fixes.
- **Fix:** Upgrade alongside vite (DEP-004) since plugin-react versions are coupled to vite majors
- **Testing Required:** Full visual regression testing for tailwind; test suite validation for jsdom

---

### DEP-009: Dependency Tree Complexity — STILL OPEN
- **Severity:** P4
- **Category:** supply-chain
- **Package:** Both projects combined
- **File:** Source/Backend/package-lock.json, Source/Frontend/package-lock.json
- **Detail:**
  - Backend: 549 transitive dependencies (370 prod, 180 dev)
  - Frontend: 424 transitive dependencies (9 prod, 416 dev)
  - **Total supply chain surface:** 973 packages
  - No excessive bloat but each package is a potential vulnerability vector
- **Fix:** Periodically audit for unused dependencies: `npm ls --all`
- **Recommendation:** Consider pruning dev dependencies not used in production

---

### DEP-010: Backend Production Dependency — uuid & express Major Version Lag — NEW
- **Severity:** P3
- **Category:** outdated
- **Package:** uuid@9.0.1, express@4.22.1
- **File:** Source/Backend/package.json
- **Current / Latest:**
  - uuid: 9.0.1 -> 13.0.0 (4 major versions behind)
  - express: 4.22.1 -> 5.2.1 (1 major behind)
- **Detail:** uuid v10-v13 are breaking changes with new API patterns (v4 default export changes). Express 5 is a significant rewrite with breaking middleware and routing changes. These are production dependencies, not just dev tooling.
- **Fix:**
  - uuid: `npm install uuid@latest` — review import changes
  - express: `npm install express@5` — requires route handler and middleware audit
- **Risk:** Express 5 migration is a significant effort. uuid changes may require import adjustments.
- **Cross-ref:** [CROSS-REF: red-teamer] — Express 4 EOL status should be monitored for security patches

---

### License Compliance Summary

**Backend Direct Dependencies (9 production):**
| Package | License |
|---------|---------|
| @opentelemetry/api | Apache-2.0 |
| @opentelemetry/auto-instrumentations-node | Apache-2.0 |
| @opentelemetry/exporter-trace-otlp-http | Apache-2.0 |
| @opentelemetry/sdk-node | Apache-2.0 |
| better-sqlite3 | MIT |
| cors | MIT |
| express | MIT |
| prom-client | Apache-2.0 |
| uuid | MIT |

**Frontend Direct Dependencies (3 production + 14 dev):**
| Package | License |
|---------|---------|
| react | MIT |
| react-dom | MIT |
| react-router-dom | MIT |
| @testing-library/* | MIT |
| @vitejs/plugin-react | MIT |
| autoprefixer | MIT |
| jsdom | MIT |
| msw | MIT |
| postcss | MIT |
| tailwindcss | MIT |
| typescript | Apache-2.0 |
| vite | MIT |
| vitest | MIT |

**Verdict:** All licenses are permissive (MIT or Apache-2.0). No GPL/AGPL risk. No unknown or UNLICENSED dependencies.

---

### Abandoned Dependencies Check

**Status: None Detected**
- All direct dependencies are actively maintained
- No deprecated flags found in npm registry
- No archived GitHub repositories
- better-sqlite3: Active (compiled native dependency — watch for Node.js version compatibility)
- prom-client: Stable, low release frequency (expected for metrics library)

---

### Supply Chain Risks Summary

| Risk Type | Status | Notes |
|-----------|--------|-------|
| Postinstall scripts | Clean | No postinstall/preinstall/install hooks in either lock file |
| Very low download packages | Clean | All deps are well-known (>1M weekly downloads) |
| Single maintainer | Clean | All packages have multiple maintainers or GitHub Orgs |
| Recently transferred | Clean | No recent ownership changes detected |

---

## Re-Verification Summary

| Finding | Prior Status | Current Status | Notes |
|---------|-------------|----------------|-------|
| DEP-001 (esbuild CVE) | 4 moderate | STILL OPEN | Same CVE, same versions |
| DEP-002 (vitest inherited CVE) | Reported | STILL OPEN | Same inheritance chain |
| DEP-003 (vitest outdated) | 2 major behind | STILL OPEN | Still 1.6.1 vs 4.1.0 |
| DEP-004 (vite outdated) | 2 major behind | STILL OPEN | Still 5.4.21 vs 8.0.1 |
| DEP-005 (React outdated) | 1 major behind | STILL OPEN | Still 18.3.1 vs 19.2.4 |
| DEP-006 (OTel outdated) | Heavily behind | STILL OPEN | Still 0.47 vs 0.213 |
| DEP-007 (Type defs) | Drifted | STILL OPEN | Additional types now behind |
| DEP-008 (Dev tooling) | Behind | STILL OPEN | Added @vitejs/plugin-react, jsdom |
| DEP-009 (Tree size) | 975 pkgs | STILL OPEN | 973 pkgs (minor variance) |
| DEP-010 (uuid/express) | — | NEW | uuid 4 majors behind, express 1 behind |

---

## Recommendations (Priority Order)

1. **IMMEDIATE (Next sprint):**
   - [ ] Upgrade vitest to 4.1.0 in both Backend and Frontend — fixes esbuild CVE (DEP-001, DEP-002, DEP-003)
   - [ ] Verify esbuild dev server is not exposed externally

2. **SOON (Next 2 sprints):**
   - [ ] Upgrade vite to 8.0.1 in Frontend alongside @vitejs/plugin-react 6.0.1 (DEP-004, DEP-008)
   - [ ] Update @types/* packages for TypeScript correctness (DEP-007)
   - [ ] Test React 19 upgrade in feature branch (DEP-005)
   - [ ] Plan OpenTelemetry major version strategy with backend team (DEP-006)

3. **LATER (Quarterly review):**
   - [ ] Evaluate Express 5 migration (DEP-010) — significant effort
   - [ ] Update uuid to v13 (DEP-010)
   - [ ] Update tailwindcss to v4 if design system supports it (DEP-008)
   - [ ] Update jsdom to v29 for test DOM compliance (DEP-008)
   - [ ] Conduct supply chain audit for unused dependencies (DEP-009)

---

## JSON Summary

```json
{
  "audit_date": "2026-03-23",
  "reverification": true,
  "backend": {
    "direct_deps_prod": 9,
    "direct_deps_dev": 10,
    "transitive_deps": 549,
    "cves": {
      "critical": 0,
      "high": 0,
      "moderate": 4,
      "low": 0
    },
    "outdated_majors": 9
  },
  "frontend": {
    "direct_deps_prod": 3,
    "direct_deps_dev": 14,
    "transitive_deps": 424,
    "cves": {
      "critical": 0,
      "high": 0,
      "moderate": 4,
      "low": 0
    },
    "outdated_majors": 11
  },
  "total_findings": 10,
  "by_severity": {
    "P1": 0,
    "P2": 2,
    "P3": 6,
    "P4": 2
  },
  "license_issues": 0,
  "abandoned_packages": 0,
  "supply_chain_risks": 0,
  "findings_status": {
    "still_open": 9,
    "fixed": 0,
    "regressed": 0,
    "new": 1
  }
}
```
