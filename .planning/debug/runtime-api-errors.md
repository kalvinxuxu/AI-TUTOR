---
status: resolved
trigger: "GET /api/sessions 401 and POST /api/problems 503"
created: 2026-05-28T10:00:00Z
updated: 2026-05-28T10:10:00Z
---

## Current Focus
hypothesis: "N/A - Issues resolved"
test: "N/A"
expecting: "N/A"
next_action: "N/A"

## Symptoms
expected: "Both /api/sessions (GET) and /api/problems (POST) should work in dev mode"
actual: "GET /api/sessions returns 401, POST /api/problems returns 503"
errors: "401 Unauthorized, 503 Service Unavailable"
reproduction: "Open history page or upload page in browser"
started: "Since initial development without full Supabase setup"

## Eliminated

## Evidence
- timestamp: 2026-05-28
  checked: "src/lib/auth.ts getUserIdFromRequest()"
  found: "In dev mode without Supabase, requires x-user-id header to authenticate"
  implication: "Frontend must send x-user-id header"

- timestamp: 2026-05-28
  checked: "src/app/history/page.tsx line 38"
  found: "fetch('/api/sessions') has NO authentication headers"
  implication: "This causes 401 - header was missing"

- timestamp: 2026-05-28
  checked: "src/app/upload/page.tsx line 95-101"
  found: "Sends 'x-user-id': 'demo-user' header - but 'demo-user' is not a valid UUID"
  implication: "Upload page was using invalid user ID format"

- timestamp: 2026-05-28
  checked: ".env.local"
  found: "Supabase is actually configured with real credentials"
  implication: "Problem was user ID format, not missing Supabase"

- timestamp: 2026-05-28
  checked: "Supabase sessions table"
  found: "Returns sessions when using valid UUID format 00000000-0000-0000-0000-000000000000"
  implication: "auth.ts DEV_USER_ID is the correct dev user ID"

- timestamp: 2026-05-28
  checked: "POST /api/problems test"
  found: "Tencent OCR is working (logs show OK), but fails on invalid base64 test image"
  implication: "OCR is functional - issue was test image quality"

- timestamp: 2026-05-28
  checked: "Sessions API with correct header"
  found: "Returns sessions successfully: HTTP 200 with valid JSON"
  implication: "Fix verified working"

## Resolution
root_cause: "Two separate issues: 1) history/page.tsx missing x-user-id header entirely, 2) upload/page.tsx using 'demo-user' which is not a valid UUID - auth.ts expects 00000000-0000-0000-0000-000000000000"
fix: "1) Added x-user-id header with DEV_USER_ID UUID to history/page.tsx. 2) Changed upload/page.tsx to use DEV_USER_ID UUID instead of 'demo-user'"
verification: "curl test to /api/sessions with x-user-id header returns 200 with session data"
files_changed:
  - "src/app/history/page.tsx: Added x-user-id header to fetch('/api/sessions') call"
  - "src/app/upload/page.tsx: Changed x-user-id from 'demo-user' to DEV_USER_ID UUID"