# Repository Conventions

## Document Ownership
- Type: User input. Agents may propose additions but not change existing rules.
- Created by: User before run.

## Scope Discipline
- Derive tasks from SPEC.md boundaries and acceptance tests only.
- Each task touches 1–4 files maximum. Claim file ownership before starting.
- No scope expansion beyond the task's `files_owned` list. Ever.
- If you discover a gap not covered by any task, report it in RUNTIME.md rather than expanding your scope.

## Code Style
- TypeScript strict mode. No `any`, `@ts-ignore`, `@ts-expect-error`.
- ESM throughout (`"type": "module"` in package.json). No `require()`.
- Follow existing naming and module boundaries in this repository.
- No placeholder code, unfinished stubs, or disabled checks in any code path exercised by `run-full-game.js`.
- Functions under 50 lines. Files under 400 lines. Extract if larger.
- Immutable data patterns: return new objects, never mutate in place.

## Dependencies
- Add no new dependencies without explicit justification in your task handoff.
- Allowed list is in SPEC.md. Banned list is in SPEC.md.
- Lock exact versions in package.json.

## Testing Policy
- Run `cd game-server && npm run build` before every commit. Fix errors before pushing.
- Run `FAST_MODE=true node run-full-game.js --headless` if your task touches any game logic.
- Never delete or weaken existing passing tests.
- If acceptance criteria include a specific test command, run it and include the output in your handoff.

## Commit Expectations
- One commit per completed task.
- Message format: `type(scope): concise summary` — e.g. `feat(combat): implement stamina drain on heavy attacks`
- Include brief rationale in commit body when behavior is non-obvious.
- Never commit directly to `main`. Use `worker/task-{id}-{slug}` branches.
- Only merge to main when `npm run build` exits 0.

## Safety
- ANTHROPIC_API_KEY must always come from `process.env`. Never hardcode.
- No SQL, no eval, no dynamic require.
- Validate all values read from game-config.json against types.ts before use.

## Freshness
- Keep `DECISIONS.md` and `RUNTIME.md` aligned with what you build.
- Rewrite stale sections rather than appending contradictions.
- Update `state/build-health.json` after every reconciler sweep.
