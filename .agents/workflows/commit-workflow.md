---
description: commit all the changes to github
---


description:# COMMIT WORKFLOW

Use this workflow whenever the current implementation is finished and ready to commit.

1. Check repository state:

   * Run `git status`.
   * Identify the current branch.
   * Do not touch or commit unrelated user changes.

2. Review the implementation:

   * Inspect the actual code changes.
   * Run `git diff`.
   * Confirm there are no debug statements, secrets, temporary files, accidental changes, or unrelated refactors.

3. Verify the change:

   * Run the relevant tests.
   * Run type checking.
   * Run lint if configured.
   * Run the relevant build.
   * For production-sensitive changes, run the relevant production-like test.

4. Check regressions:

   * Identify existing functionality that could be affected.
   * Test the affected existing functionality.
   * Never assume that fixing the new feature means the task is complete.

5. Stop if verification fails:

   * Do not commit broken code.
   * Investigate the root cause.
   * Fix it.
   * Re-run verification.

6. Stage only intended files:

   * Use `git add` only for files belonging to this change.
   * Run `git diff --cached`.
   * Review the staged diff before committing.

7. Create one clear commit:

   * Use a descriptive conventional commit message.
   * Example:
     `fix(import): repair PDF metadata extraction`
     `feat(reader): add page synchronization`
     `fix(backup): restore legacy backup compatibility`

8. Verify the commit:

   * Run `git status`.
   * Confirm the commit contains only the intended changes.
   * Record the commit hash.

9. Push only after the commit is verified:

   * Push the current branch normally.
   * Never force-push unless explicitly authorized.

FINAL RULE:
Never commit merely because the code compiles.
Commit only when the intended change has been implemented, tested, reviewed, and checked for regressions.
Never claim "working" or "fixed" without verification evidence.



