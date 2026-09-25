# Quickstart: CLI/UX

```bash
translatronx sync --json          # §31 machine report (exit 3 when units failed)
translatronx check                # deterministic gate: exit 0 clean, 1 with issues
translatronx status               # v2 ledger stats + v3 provenance section (when registry exists)
translatronx doctor               # readiness: exit 0 ready, 1 blocked
translatronx explain <key> --lang ja-JP   # state/origin/skills/model/TM/validation/revision
translatronx resolve <key> --lang fr-FR   # semantic conflict resolution (or --keep N)
```

```ts
// Event-driven progress (v3 compiler feeds this; script-testable today):
import { ProgressRenderer } from './src/cli/renderer/progress.js';
import { adaptRuntimeEvent } from './src/core/events.js';
const renderer = new ProgressRenderer({ write: (line) => process.stdout.write(line + '\n'), tty: process.stdout.isTTY });
for await (const event of runtime.execute(plan, context)) renderer.handle(adaptRuntimeEvent(event));
renderer.summary(summaries, { tmReused, filesUpdated });
```

Checks: `npx vitest run tests/unit/cli-ux.test.ts` · `npx tsc --noEmit` · `npm run build`.
