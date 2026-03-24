# Chaos Tester Learnings — TheATeam

## Run 2026-03-23

### Role
Adversarial invariant testing for the Development Workflow Platform.

### Test File
`Source/Backend/tests/chaos-invariants.test.ts` — 280 tests, 9 invariant groups.

### What Was Tested

| Group | Invariant | Tests | Result |
|-------|-----------|-------|--------|
| 1 | Cycle priority queue (bugs before FRs) | 7 | All PASS |
| 2 | Single active cycle constraint | 5 | All PASS |
| 3 | Ticket state machine (no skips, no reversals) | 20+ | All PASS |
| 4 | Voting workflow (FR stays in voting per DD-1) | 8 | All PASS |
| 5 | Duplicate detection edge cases | 12 | All PASS (see finding below) |
| 6 | Cycle status transitions (DD-4) | 9 | All PASS |
| 7 | Deny status guard (DD-5) | 8 | All PASS |
| 8 | Cycle completion guard | 7 | All PASS |
| 9 | FR status machine via PATCH (all invalid transitions) | 22 | All PASS |

### Key Findings

#### FINDING 1: Duplicate detection boundary is stricter than intuition suggests
- The spec says "Jaccard similarity > 0.8 triggers duplicate_warning"
- A 6-word title with 1 word changed scores 5/7 ≈ 0.714 — BELOW the threshold
- This means two obviously related titles like "Add dark mode to the dashboard" vs "Add dark mode to the settings" do NOT trigger the warning
- This is correct per spec but may surprise users
- A title needs ~9+ words with 1 changed to exceed 0.8 (e.g., 8 shared / 9 union = 0.888)
- **Recommendation**: Document this boundary behavior for users or consider lowering threshold to 0.6

#### FINDING 2: All invariants hold — no bugs found
- Priority queue: triaged bugs correctly selected over critical FRs
- Reported/resolved bugs correctly excluded from the work queue
- Single active cycle enforced across all phases (spec_changes through smoke_test)
- Ticket state machine correctly rejects all backward transitions and skips
- Voting correctly leaves FR in `voting` regardless of majority outcome (DD-1)
- Deny endpoint correctly rejects approved/in_development/completed/denied FRs (DD-5)
- Cycle completion correctly requires ALL tickets to be `done`
- Exactly one Feature and one Learning record created per cycle completion
- Deployment failure correctly creates exactly one bug with severity `high`

#### FINDING 3: Race condition test (concurrent cycle creation)
- Tested concurrent double-POST to `/api/cycles` via `Promise.all`
- Exactly one succeeds (201) and one fails (409) due to SQLite synchronous execution model
- better-sqlite3 is synchronous, so the second concurrent request serializes after the first
- This is safe in the current single-process architecture

### Testing Patterns Established
- Use `// Verifies: FR-XXX` in every `it()` block — required by traceability enforcer
- Parameterized loop tests for state machine transitions: generates dozens of tests concisely
- Injectable randomness (`{ random: () => 0.01 }`) for deterministic voting outcomes
- Direct DB manipulation (`db.prepare(...).run(...)`) to set up adversarial starting states
- `seedTriagedBug` and `seedApprovedFR` helpers for quick test data setup

### Verification Gates
```bash
cd Source/Backend && npm test              # 280 tests, 0 failures
python3 tools/traceability-enforcer.py    # PASS — all 30 FRs covered
```

---

## Run 3 (2026-03-23)

### Role
Adversarial invariant testing — targeted verification of Run 3 fixes (DD-9, DD-10, DD-12).

### Test File
`Source/Backend/tests/chaos-invariants.test.ts` — 94 tests, 9 invariant groups (unchanged from run 2 test count per chaos file; total suite is 295 tests).

### Run 3 Fixes Verified

| Fix | Design Decision | Status |
|-----|----------------|--------|
| PATCH to `complete` blocked | DD-9 | VERIFIED — guard at cycleService.ts:243 fires before linear transition check |
| MAX-based ID generation | DD-10 | VERIFIED — all 6 services use `ORDER BY id DESC LIMIT 1` |
| Input length validation for bugs/learnings | DD-12 (M-04) | VERIFIED — title/description/content limits enforced |

### Key Findings

#### FINDING 1: `voting → approved` via PATCH still bypasses vote-check (INFO — carry-forward)
- `STATUS_TRANSITIONS['voting']` includes `'approved'`, allowing PATCH to bypass the majority-vote check in `approveFeatureRequest`.
- This matches the contract (`voting → approved | denied` via PATCH) but undermines DD-1's intent.
- Dispatch plan left as INFO. Recommend removing `'approved'` from PATCH transitions in a future run.

#### FINDING 2: Bug status transitions are unconstrained (INFO — carry-forward)
- Any valid bug status can transition to any other. Spec doesn't mandate a state machine for bugs, so this is permissive but not incorrect.

#### FINDING 3: All 9 invariant groups hold — zero regressions
- Run 3 fixes did not break any existing invariants.
- 295 tests pass, 0 failures.
- Traceability: 32/32 FRs covered.

### New Patterns Learned
- DD-9 guard placement matters: the `if (newStatus === 'complete')` check must execute BEFORE the linear transition check, otherwise `smoke_test → complete` would pass the linear check and bypass the completion endpoint.
- MAX-based ID generation with zero-padded 4-digit numbers ensures string `ORDER BY DESC` produces correct numeric ordering (works up to 9999 IDs).

### Verification Gates
```bash
cd Source/Backend && npm test              # 295 tests, 0 failures
python3 tools/traceability-enforcer.py    # PASS — all 32 FRs covered
```
