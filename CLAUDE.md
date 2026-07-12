# Wake2Win Development Rules

## General

Be concise.

Do not explain obvious code.

Think internally, output only useful results.

Avoid long reasoning unless explicitly requested.

Prefer implementation over discussion.

Never rewrite working code.

Modify only files required for the task.

Preserve existing architecture.

Always search before editing.

Never create duplicate utilities.

## Coding

Prefer minimal diffs.

Keep functions short.

Avoid unnecessary abstractions.

Reuse existing helpers.

Avoid duplicate logic.

Follow existing naming.

Prefer TypeScript strict types.

Never use "any" unless unavoidable.

Keep React components clean.

Prefer composition over duplication.

## Debugging

Never guess.

Always reproduce the bug first.

Find the root cause.

Explain the root cause in one paragraph.

Verify the fix.

Run build after significant changes.

## AI Features

Never degrade NEET quality.

Never use trivial biology questions.

Prefer NCERT wording.

Avoid repeated AI outputs.

Never silently swallow provider errors.

Retry transient failures.

## Android

Never modify Capacitor configuration unless required.

Do not break alarm scheduling.

Verify native changes compile.

Verify AndroidManifest registrations.

## Output Style

Keep responses under 200 words unless requested.

Show changed files only.

Show commands only when needed.

Do not repeat the prompt.

Do not explain every edit.

Focus on implementation.

## Before finishing

Run:

npm run build

Run typecheck.

Summarize:

- Root cause
- Files changed
- VerificationMode:

- Minimize reasoning tokens.
- Spend tokens writing production-quality code instead.
- Search before editing.
- Make the smallest safe changes.
- Never guess.
- Reproduce bugs first.
- Verify with build and tests.
- Do not explain unless I ask.