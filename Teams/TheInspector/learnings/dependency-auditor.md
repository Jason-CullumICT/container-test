# Dependency Auditor Learnings

## Audit History

### Re-verification Audit (2026-03-23, second pass)
- All 9 prior findings confirmed STILL OPEN — no fixes applied since first audit
- Added DEP-010 (uuid 4 majors behind, express 1 major behind) as NEW finding
- Added @vitejs/plugin-react (4.7.0 -> 6.0.1, 2 majors behind) and jsdom (24.1.3 -> 29.0.1, 5 majors behind) to DEP-008
- Transitive dep counts slightly adjusted: Backend 549, Frontend 424 (973 total)

### First Audit (2026-03-23)
- Initial baseline established

## Project Structure
- **Backend**: 9 prod deps + 10 dev deps, 549 total packages (package-lock.json)
- **Frontend**: 3 prod deps + 14 dev deps, 424 total packages (package-lock.json)
- Package manager: npm v10+ (lockfileVersion 3)
- No postinstall scripts detected in either lock file

## Known Vulnerabilities

### Active CVE: GHSA-67mh-4wv8-2f99 (esbuild CSRF)
- Affected: esbuild <=0.24.2
- Present in both Backend and Frontend via vite dependency
- Backend: esbuild 0.21.5 in `node_modules/vite/node_modules/esbuild`
- Frontend: esbuild 0.21.5 in `node_modules/esbuild`
- tsx bundles esbuild 0.27.4 (NOT vulnerable)
- Fix requires vitest 4.1.0+ or vite 8.0.1+
- npm audit reports 4 moderate vulns per project (esbuild, vite, vite-node, vitest) but all trace to same root cause

## Outdated Major Versions

**Backend outdated (>1 major behind)**:
- vitest: 1.6.1 -> 4.1.0 (2 major versions behind)
- @opentelemetry packages: 0.40-0.47 -> 0.71-0.213 (enormously behind)
- express: 4.22.1 -> 5.2.1 (1 major behind)
- uuid: 9.0.1 -> 13.0.0 (4 major versions behind)
- @types/node: 20.19 -> 25.5 (5 major drift)
- @types/express: 4.17 -> 5.0 (1 major behind, tracks Express 5)

**Frontend outdated (>1 major behind)**:
- vite: 5.4.21 -> 8.0.1 (2 major versions behind)
- vitest: 1.6.1 -> 4.1.0 (2 major versions behind)
- @vitejs/plugin-react: 4.7.0 -> 6.0.1 (2 major behind)
- jsdom: 24.1.3 -> 29.0.1 (5 major behind)
- react: 18.3.1 -> 19.2.4 (1 major behind)
- react-router-dom: 6.30.3 -> 7.13.1 (1 major behind)
- tailwindcss: 3.4.19 -> 4.2.2 (1 major behind)
- @types/react: 18.3 -> 19.2 (1 major behind)

## License Compliance
- **Backend production deps**: Apache-2.0 (5: @opentelemetry/* + prom-client), MIT (4: express, cors, uuid, better-sqlite3)
- **Frontend production deps**: MIT (3: react, react-dom, react-router-dom)
- **Frontend dev deps**: MIT (13), Apache-2.0 (1: typescript)
- No GPL/AGPL detected anywhere
- All licenses are permissive

## Supply Chain Risks
- No postinstall scripts in either lock file
- All direct dependencies are well-known, widely-used packages
- No single-maintainer risk packages detected
- No recent ownership transfers

## Watch List
- **better-sqlite3**: Compiled native dependency — check for Node.js version compatibility during updates
- **@opentelemetry/***: Enormously outdated (166 minor versions); plan coordinated upgrade strategy
- **vitest**: 2+ major versions behind — fixing this also resolves the only active CVE
- **uuid**: 4 major versions behind — API may have changed significantly
- **Express 5**: Major migration effort; monitor Express 4 EOL timeline for security patch cutoff

## Audit Methodology
- `npm audit --json` on both Backend and Frontend
- `npm outdated --json` for version drift
- Parsed lock files for postinstall/preinstall/install scripts
- Read license fields from installed `node_modules/*/package.json`
- Cross-referenced npm audit source IDs for CVE deduplication

## Third Audit: 2026-03-24

### Pipeline Feature Dependencies
No new dependencies added. Pipeline service uses existing uuid, better-sqlite3, express.

### New Findings
- DEP-011 (P3): TypeScript 6.0.2 available, both projects on 5.9.3
- DEP-012 (P3): @testing-library/react 14.3.1 vs 16.3.2 (2 majors behind)
- DEP-013 (P4): supertest 6.3.4 vs 7.2.2 (1 major behind)

### CVE Status
Same 4 moderate per project (esbuild CSRF). No new CVEs.

### All Prior Findings Still Open
DEP-001 through DEP-010 remain STILL OPEN.

## Fourth Audit: 2026-03-25

### Image Upload Feature Dependencies
- **New prod dep**: multer@1.4.5-lts.1 (MIT, no new CVEs)
- **New dev dep**: @types/multer@1.4.11 (MIT)
- Backend transitive deps now: **565** (up from ~549)
- Frontend: no changes

### New Findings
- DEP-014 (P3): multer fileFilter validates only `file.mimetype` (attacker-controlled header). No magic-byte/file-signature check. [CROSS-REF: red-teamer]
- DEP-015 (P3): multer 1 major behind (1.4.5-lts.1 vs 2.1.1). Note: 1.x-lts IS the maintained track for Express 4; patch `1.4.5-lts.2` available via `npm update`.

### CVE Status
Same 4 moderate per backend project (esbuild CSRF). No new CVEs. multer is clean.

### All Prior Findings Still Open
DEP-001 through DEP-013 remain STILL OPEN.

## Key Notes on multer
- `^1.4.5-lts.1` is the semver range used — picks up 1.x-lts patches only, will not auto-upgrade to v2
- `1.x-lts` branch is under `expressjs` org, actively maintained for Express 4
- Plan multer@2.x upgrade alongside Express 5 upgrade (DEP-010)
- multer@1.x carries legacy transitive deps: mkdirp@0.5, concat-stream@1.x, xtend, object-assign — all functional but old; all dropped in multer@2.x
- `@types/multer@2.x` corresponds to multer@2.x API — do NOT upgrade types without upgrading runtime

## Watch List Additions
- **multer**: File upload library — high-value CVE target. Track advisories for GHSA entries. Upgrade to 2.x with Express 5.
- **MIME validation pattern**: `file.mimetype` in multer is not authoritative — always pair with magic-byte validation for security-sensitive uploads
