---
status: resolved
trigger: "evaluation.test.ts and tutor-engine.test.ts fail with: Missing credentials: OPENAI_API_KEY"
created: 2026-05-28T11:18:00.000Z
updated: 2026-05-28T11:19:30.000Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: deepseek.ts creates OpenAI client at module scope, causing credential validation failure on import
test: Mock the deepseek module in test-setup.ts
expecting: Tests pass without requiring real API credentials
next_action: Verify fix and update debug file

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Tests should run without requiring real API credentials
actual: Error: "Missing credentials. Please pass an `apiKey`, `workloadIdentity`, `adminAPIKey`, or set the `OPENAI_API_KEY` or `OPENAI_ADMIN_KEY` environment variable."
errors:
  - "Missing credentials. Please pass an `apiKey`, `workloadIdentity`, `adminAPIKey`, or set the `OPENAI_API_KEY` or `OPENAI_ADMIN_KEY` environment variable."
reproduction:
  - Run `npm test` on evaluation.test.ts and tutor-engine.test.ts
  - Both tests fail at module import time
started: Unknown (likely when tests were first created)

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-05-28T11:18:30.000Z
  checked: src/lib/ai/deepseek.ts lines 14-18
  found: Client initialization happens at module scope: `const deepseek = new OpenAI({...})`
  implication: OpenAI client validates credentials on initialization, not just on API call

- timestamp: 2026-05-28T11:18:45.000Z
  checked: src/lib/domain/evaluation-service.ts line 18
  found: Imports `deepseekAdapter` from `@/lib/ai/deepseek`
  implication: Any module importing evaluation-service will trigger deepseek.ts initialization

- timestamp: 2026-05-28T11:19:00.000Z
  checked: src/lib/domain/tutor-engine.ts line 8
  found: Imports `generateResponse, generateInitialMessage, generateHint` from `@/lib/ai/deepseek`
  implication: Any module importing tutor-engine will trigger deepseek.ts initialization

- timestamp: 2026-05-28T11:19:20.000Z
  checked: vitest.config.ts
  found: setupFiles includes './src/test-setup.ts'
  implication: Test setup is loaded before tests, perfect place to mock deepseek

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: deepseek.ts creates OpenAI client at module scope (line 15). When tests import evaluation-service.ts or tutor-engine.ts, they transitively import deepseek.ts, triggering OpenAI client initialization which validates credentials immediately.

fix: Added vi.mock for @/lib/ai/deepseek in src/test-setup.ts. The mock provides fake implementations for all AI functions (generateResponse, generateInitialMessage, generateHint, evaluateStep) that tests can use without real API credentials.

verification: All 44 tests pass. Before fix: 2 failed test files. After fix: 4 passed test files.

files_changed:
  - src/test-setup.ts: Added mock for @/lib/ai/deepseek module