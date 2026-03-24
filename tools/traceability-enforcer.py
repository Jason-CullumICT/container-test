#!/usr/bin/env python3
"""
Traceability Enforcer
Checks that all FR-XXX requirements claimed in source/implementation files
have corresponding // Verifies: FR-XXX comments in test files.

Mode: Checks that any FR mentioned in a source file also appears in a test file.
This handles partial implementations where not all FRs are implemented yet.
"""

import os
import re
import sys
from pathlib import Path

WORKSPACE = Path(__file__).parent.parent
REQUIREMENTS_FILE = WORKSPACE / "Plans" / "dev-workflow-platform" / "requirements.md"
SOURCE_DIR = WORKSPACE / "Source"

def extract_requirements(requirements_file: Path) -> set:
    """Extract all FR-XXX IDs from requirements.md."""
    frs = set()
    if not requirements_file.exists():
        return frs
    content = requirements_file.read_text()
    matches = re.findall(r'\bFR-\d{3}\b', content)
    return set(matches)

def extract_frs_from_files(source_dir: Path, is_test: bool = False) -> dict:
    """
    Extract FR-XXX IDs from source files.
    For test files: look for // Verifies: FR-XXX comments.
    For implementation files: look for any // Verifies: FR-XXX comments (used in non-test files too).
    """
    found = {}
    extensions = {'.ts', '.tsx', '.js', '.jsx', '.py'}

    for path in source_dir.rglob('*'):
        if path.suffix not in extensions:
            continue
        if 'node_modules' in str(path):
            continue

        # Determine if this is a test file
        path_str = str(path)
        file_is_test = (
            'test' in path.stem.lower() or
            'spec' in path.stem.lower() or
            'tests/' in path_str or
            '__tests__' in path_str
        )

        if is_test and not file_is_test:
            continue
        if not is_test and file_is_test:
            continue

        try:
            content = path.read_text(encoding='utf-8')
        except Exception:
            continue

        # Match both // Verifies: FR-XXX and # Verifies: FR-XXX patterns
        matches = re.findall(r'(?://|#)\s*Verifies:\s*(FR-\d{3}(?:,\s*FR-\d{3})*)', content)
        for match in matches:
            fr_ids = re.findall(r'FR-\d{3}', match)
            for fr_id in fr_ids:
                if fr_id not in found:
                    found[fr_id] = []
                found[fr_id].append(str(path.relative_to(WORKSPACE)))

    return found

def extract_all_verifies(source_dir: Path) -> dict:
    """Extract all // Verifies: FR-XXX from all files."""
    found = {}
    extensions = {'.ts', '.tsx', '.js', '.jsx', '.py'}

    for path in source_dir.rglob('*'):
        if path.suffix not in extensions:
            continue
        if 'node_modules' in str(path):
            continue

        try:
            content = path.read_text(encoding='utf-8')
        except Exception:
            continue

        matches = re.findall(r'(?://|#)\s*Verifies:\s*(FR-\d{3}(?:,\s*FR-\d{3})*)', content)
        for match in matches:
            fr_ids = re.findall(r'FR-\d{3}', match)
            for fr_id in fr_ids:
                if fr_id not in found:
                    found[fr_id] = []
                found[fr_id].append(str(path.relative_to(WORKSPACE)))

    return found

def main():
    print("Traceability Enforcer")
    print("=" * 50)

    # Extract all requirements
    all_frs = extract_requirements(REQUIREMENTS_FILE)
    print(f"Total requirements in spec: {len(all_frs)}")

    # Extract all FRs that have // Verifies: comments anywhere
    all_verified = extract_all_verifies(SOURCE_DIR)
    print(f"FRs with traceability comments: {len(all_verified)}")
    print()

    # Check: any FR that appears in a IMPLEMENTATION file (non-test)
    # must also appear in a TEST file
    impl_verified = extract_frs_from_files(SOURCE_DIR, is_test=False)
    test_verified = extract_frs_from_files(SOURCE_DIR, is_test=True)

    print("Implemented FRs (found in source files):")
    for fr in sorted(impl_verified.keys()):
        files = impl_verified[fr]
        print(f"  • {fr} — {', '.join([f.split('/')[-1] for f in files[:3]])}")

    print()
    print("Tested FRs (found in test files):")
    for fr in sorted(test_verified.keys()):
        files = test_verified[fr]
        print(f"  ✓ {fr} — {', '.join([f.split('/')[-1] for f in files[:3]])}")

    print()

    # Find FRs that are implemented but not tested
    missing_tests = []
    for fr in sorted(impl_verified.keys()):
        if fr not in test_verified:
            missing_tests.append(fr)

    if missing_tests:
        print("FRs implemented but missing test coverage:")
        for fr in missing_tests:
            print(f"  ✗ {fr} — implemented in {impl_verified[fr][0]} but no test with '// Verifies: {fr}'")
        print()
        print(f"RESULT: FAIL — {len(missing_tests)} implemented FR(s) missing test coverage")
        sys.exit(1)
    else:
        print(f"RESULT: PASS — All {len(impl_verified)} implemented FRs have test coverage")
        print(f"       ({len(all_frs) - len(impl_verified)} FRs pending implementation by other agents)")
        sys.exit(0)

if __name__ == '__main__':
    main()
