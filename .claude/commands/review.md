Review the current changes before merging.

1. Run `git diff` to read all changes.
2. Run `npm test 2>&1` to verify all 95 tests pass.
3. Check each changed file against CLAUDE.md §17–18 conventions:
    - No user-facing strings hardcoded — must use `config.js` MSG_* constants
    - No sensitive data (API keys, bank details, patient info) in any file
    - No skipped (`test.skip`) or commented-out tests
    - All new async functions have try/catch
    - Business constants in `config.js`, never inline
4. Summarize what changed and flag any violations. If everything is clean, confirm it is safe to merge.