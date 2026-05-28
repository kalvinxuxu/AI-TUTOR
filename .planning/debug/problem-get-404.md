---
status: verifying
trigger: "GET /api/problems/{id} returns 404 Not Found"
created: 2026-05-28T10:50:00.000Z
updated: 2026-05-28T10:57:00.000Z
---

## Current Focus

hypothesis: "Fixed by changing x-user-id header from 'demo-user' to '00000000-0000-0000-0000-000000000000'"
test: "Verify API returns problem data"
expecting: "Problem data is returned successfully"
next_action: "Confirm fix is complete"

## Symptoms

expected: After uploading a problem, the OCR confirm page should fetch the problem by ID and display it
actual: GET /api/problems/a1705148-622d-4b0b-a7cb-2055bc26d885 returns 404
errors: {"success":false,"error":"Problem not found"}
reproduction: Upload a problem, then navigate to confirm page
started: User reported OCR confirm page cannot load problem data

## Eliminated

- hypothesis: "Route file missing GET handler"
  evidence: "route.ts has GET handler at line 6-57"
  timestamp: 2026-05-28T10:52:00.000Z
- hypothesis: "getProblem method not implemented"
  evidence: "problem-service.ts has getProblem method at line 117-143"
  timestamp: 2026-05-28T10:52:00.000Z
- hypothesis: "Auth header missing"
  evidence: "Confirm page passes x-user-id header at line 43"
  timestamp: 2026-05-28T10:53:00.000Z
- hypothesis: "Wrong user ID in confirm page"
  evidence: "Confirm page uses 'demo-user' which differs from upload page's '00000000-0000-0000-0000-000000000000'"
  timestamp: 2026-05-28T10:53:00.000Z

## Evidence

- timestamp: 2026-05-28T10:53:00.000Z
  checked: "src/app/upload/page.tsx line 98"
  found: "Upload page uses hardcoded user ID '00000000-0000-0000-0000-000000000000'"
  implication: "Problem is created with this user ID"

- timestamp: 2026-05-28T10:54:00.000Z
  checked: "src/app/problems/[id]/confirm/page.tsx line 42"
  found: "Confirm page uses 'demo-user' as x-user-id header"
  implication: "Mismatch between creation and fetch user IDs"

- timestamp: 2026-05-28T10:54:00.000Z
  checked: "src/app/api/problems/[id]/route.ts line 32-36"
  found: "GET handler has ownership check: if (problem.userId !== userId) returns 404"
  implication: "Since 'demo-user' != '00000000-0000-0000-0000-000000000000', returns 404"

- timestamp: 2026-05-28T10:57:00.000Z
  checked: "API response with fixed header"
  found: '{"success":true,"data":{"problemId":"a1705148-622d-4b0b-a7cb-2055bc26d885",...}}'
  implication: "API correctly returns problem data with matching user ID"

## Resolution

root_cause: "Inconsistent x-user-id header values: upload page uses '00000000-0000-0000-0000-000000000000' but confirm page uses 'demo-user'. The ownership verification in the GET handler fails and returns 404."
fix: "Changed x-user-id header in confirm page from 'demo-user' to '00000000-0000-0000-0000-000000000000' to match upload page"
verification: "API returns correct problem data after fix"
files_changed:
- "src/app/problems/[id]/confirm/page.tsx: Changed x-user-id from 'demo-user' to '00000000-0000-0000-0000-000000000000'"