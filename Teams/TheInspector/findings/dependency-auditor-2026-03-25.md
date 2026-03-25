# Dependency Auditor Findings -- 2026-03-25

## Mode: static
## Audit Scope: Image Upload Feature (multer integration)
## Package Managers Detected: npm (Backend, Frontend)

## Summary

**1 new dependency added** (multer + @types/multer) for image upload feature. The installed version `1.4.5-lts.1` is one patch behind the available `1.4.5-lts.2`, and the project is 1 full major version behind `multer@2.1.1`. No new CVEs introduced. MIME-type-only validation in upload middleware is a security configuration concern (see DEP-014). @types/multer is 1 major version behind. All 13 prior findings remain open; 2 new findings added.

## New Dependencies Added (Image Upload)

| Package | Version in package.json | Installed | Purpose | License |
|---------|--------------------------|-----------|---------|---------|
| `multer` | `^1.4.5-lts.1` | 1.4.5-lts.1 | Multipart/form-data file upload middleware | MIT |
| `@types/multer` | `^1.4.11` (devDep) | 1.4.11 | TypeScript types for multer | MIT |

**Frontend**: No new dependencies added for image upload. Image rendering uses native browser capabilities only.

## CVE Status

**npm audit output: 4 moderate vulnerabilities (unchanged from prior audit)**

All 4 vulnerabilities trace to the same root cause: esbuild CSRF (GHSA-67mh-4wv8-2f99) via the vite/vitest chain. **multer introduces zero new CVEs.**

| Package | CVE | Severity | New? |
|---------|-----|----------|------|
| esbuild <=0.24.2 | GHSA-67mh-4wv8-2f99 | Moderate | No (pre-existing) |
| vite 0.11.0-6.1.6 | inherited | Moderate | No (pre-existing) |
| vite-node <=2.2.0-beta.2 | inherited | Moderate | No (pre-existing) |
| vitest (affected range) | inherited | Moderate | No (pre-existing) |

Total transitive packages: **565** (up from ~549, delta of ~16 packages from multer's dependency tree).

## New Findings

### DEP-014: multer MIME-Type-Only Validation (No Magic-Byte Check)
- **Severity:** P3
- **Category:** security-configuration
- **Package:** multer@1.4.5-lts.1
- **File:** `Source/Backend/src/middleware/upload.ts`
- **Detail:** The `fileFilter` function in `upload.ts` validates uploaded files exclusively by checking `file.mimetype` against an allowlist (`['image/jpeg', 'image/png', 'image/gif', 'image/webp']`). The `mimetype` field in multer is taken directly from the `Content-Type` header sent by the client — it is fully attacker-controlled and is NOT derived from inspecting the file's actual bytes. An attacker can upload a malicious file (e.g., a PHP webshell, an HTML file, a polyglot) by simply setting `Content-Type: image/jpeg` in the request. The filename extension is also derived from `file.originalname`, which is equally attacker-controlled.
- **Fix:** Add magic-byte (file signature) validation after upload, using a library such as `file-type` or `magic-bytes.js` to verify actual file content. Example:
  ```ts
  import { fileTypeFromBuffer } from 'file-type';
  // Read first bytes of saved file and verify against ALLOWED_MIMES
  ```
  Alternatively, process all uploads through an image library (e.g., `sharp`) which will reject non-image data.
- **Cross-ref:** `[CROSS-REF: red-teamer]` — client-controlled MIME type is a known upload bypass vector. This may allow stored malicious files if the upload directory is served statically.

### DEP-015: multer 1 Major Version Behind Latest (P3)
- **Severity:** P3
- **Category:** outdated
- **Package:** multer@1.4.5-lts.1
- **File:** `Source/Backend/package.json`
- **Detail:** Project uses `multer@1.4.5-lts.1` (the LTS maintenance branch for Express 4). The latest full release is `multer@2.1.1`. The `1.x-lts` branch is being maintained under the `expressjs` organization but is a maintenance-only track. `multer@2.x` rewrites internals, drops older transitive dependencies (`mkdirp@0.5`, `concat-stream@1.x`), and targets Express 5. Since the project is also using `express@4.x` (itself 1 major behind), the `1.x-lts` choice is contextually appropriate, but should be revisited when upgrading Express.
- **Additional note:** The installed `1.4.5-lts.1` is one patch behind the available `1.4.5-lts.2` in the same semver range. Running `npm update multer` would install `1.4.5-lts.2`.
- **Fix:** `npm update multer` to get `1.4.5-lts.2` immediately. Plan `multer@2.x` upgrade alongside the Express 5 upgrade (see DEP-010).
- **Cross-ref:** `[CROSS-REF: red-teamer]` — track multer advisories; file upload libraries are high-value CVE targets.

## Version Pinning Assessment

| Package | Range | Strategy | Assessment |
|---------|-------|----------|------------|
| `multer` | `^1.4.5-lts.1` | Caret (minor+patch) | Acceptable for LTS track; will not auto-pick up v2 |
| `@types/multer` | `^1.4.11` | Caret | Version mismatch risk — @types/multer@2.x types correspond to multer@2.x API |

The caret range on `@types/multer@^1.4.11` will NOT automatically upgrade to `2.x` (npm respects major version boundaries), so there is no immediate risk of a types/runtime mismatch being silently introduced. However, `@types/multer` is already 1 major behind (`2.1.0` available). This is cosmetically inconsistent but not currently harmful since the runtime is also on v1.

## License Compliance

| Package | License | Compatible |
|---------|---------|------------|
| multer@1.4.5-lts.1 | MIT | Yes |
| @types/multer@1.4.11 | MIT | Yes |

No GPL/AGPL introduced. No license concerns.

## Deprecated / Unmaintained Dependency Warnings

**Multer transitive dependencies (carried over from multer@1.x):**

| Package | Version | Status | Notes |
|---------|---------|--------|-------|
| `mkdirp@0.5.6` | 0.5.6 | Outdated (latest 3.x) but not npm-deprecated | Older sync API; multer@2.x drops this |
| `concat-stream@1.6.2` | 1.6.2 | Legacy; no active development | Predates streams3; multer@2.x drops this |
| `object-assign@4.1.1` | 4.1.1 | Functionally obsolete (native `Object.assign` exists) | Common legacy dep, still works |
| `xtend@4.0.2` | 4.0.2 | Unmaintained; superseded by spread/Object.assign | Still works, no security risk |
| `append-field@1.0.0` | 1.0.0 | No recent activity | Multer internal; works correctly |

None of these are npm-deprecated (no `deprecated` field in their package.json). They are legacy but functional. They will be removed when upgrading to multer@2.x.

## Re-Verification of Prior Findings

| ID | Title | Status |
|----|-------|--------|
| DEP-001 | esbuild CSRF CVE (GHSA-67mh-4wv8-2f99) | STILL OPEN |
| DEP-002 | vitest inherited CVE | STILL OPEN |
| DEP-003 | vitest 2+ majors behind (1.6.1 → 4.1.1) | STILL OPEN |
| DEP-004 | vite 2+ majors behind | STILL OPEN |
| DEP-005 | React ecosystem 1 major behind | STILL OPEN |
| DEP-006 | OpenTelemetry major gap (0.47 → 0.213) | STILL OPEN |
| DEP-007 | Type definition drift | STILL OPEN |
| DEP-008 | Dev tooling fragmentation | STILL OPEN |
| DEP-009 | Dependency tree complexity (>500 transitive) | STILL OPEN — now 565 |
| DEP-010 | uuid 4 majors behind; express 1 major behind | STILL OPEN |
| DEP-011 | TypeScript 6.0 available | STILL OPEN |
| DEP-012 | @testing-library/react 2 majors behind | STILL OPEN |
| DEP-013 | supertest 1 major behind | STILL OPEN |

## Summary Counts

| Priority | Count | Findings |
|----------|-------|----------|
| P1 | 0 | None |
| P2 | 0 | None |
| P3 | 2 | DEP-014 (MIME validation), DEP-015 (multer 1 major behind) |
| P4 | 0 | None |
| **Total new** | **2** | |

**Cumulative open findings (all audits):** 15 (DEP-001 through DEP-015)

## Cross-References

- `[CROSS-REF: red-teamer]` DEP-014: MIME-type spoofing upload bypass — should be evaluated as an exploitable attack vector
- `[CROSS-REF: red-teamer]` DEP-015: multer CVE watch — file upload middleware is high-value target, track advisories

---

```json
{
  "audit_date": "2026-03-25",
  "mode": "static",
  "feature": "image-upload",
  "new_dependencies": 1,
  "new_cves": 0,
  "existing_cves": 4,
  "cves_critical": 0,
  "cves_high": 0,
  "cves_moderate": 4,
  "cves_low": 0,
  "new_findings": 2,
  "total_open_findings": 15,
  "p1": 0,
  "p2": 0,
  "p3": 2,
  "p4": 0,
  "license_issues": 0,
  "total_transitive_deps_backend": 565,
  "total_transitive_deps_frontend": 424
}
```
