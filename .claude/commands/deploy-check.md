Run the pre-deploy checklist and report ✅ or ❌ for each item.

1. **Tests** — run `npm test 2>&1` — all 95 must pass.
2. **Secrets scan** — run `git diff HEAD --name-only`, then spot-check changed files for any hardcoded API keys, bank
   account numbers, or patient data.
3. **Env vars** — confirm every variable listed in CLAUDE.md §5 is accounted for in `.env.example` (placeholder only, no
   real values).
4. **CLAUDE.md freshness** — confirm §4 infrastructure status, §15 pending items, and the test count badge still reflect
   reality.
5. **Render plan reminder** — free plan sleeps after 15 min of inactivity; upgrade to $7/month is required before
   running ads.
6. **Meta token reminder** — `WA_ACCESS_TOKEN` expires every 24 h; confirm it has been refreshed or a permanent token is
   in place.

If any item fails, block the deployment and describe what needs fixing.