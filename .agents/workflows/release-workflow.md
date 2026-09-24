---
description: crearte a release of the app after fixing all the errors and creating a update package
---

# RELEASE WORKFLOW

Use this workflow only when preparing a production release.

1. Confirm the repository is ready:

   * Run `git status`.
   * Working tree must be clean.
   * Confirm the exact commit to release.
   * Confirm there are no unfinished changes.

2. Confirm the version:

   * Update the application version where required.
   * Ensure the application version and release tag will match exactly.
   * Example: version `1.2.0` → tag `v1.2.0`.

3. Run full release verification:

   * Type check.
   * Tests.
   * Production build.
   * Installer build.
   * Update package build.
   * Test all critical functionality affected by the release.
   * Test important existing functionality that must not regress.

4. Test the real production artifact:

   * Install the generated installer.
   * Verify application startup.
   * Verify required runtime dependencies are present.
   * Verify production configuration.
   * Verify the main user workflows.

5. Test upgrade from the previous version:

   * Start from the previous production version.
   * Run the actual update process.
   * Verify download.
   * Verify SHA-256.
   * Verify backup.
   * Verify update application.
   * Restart the application.
   * Verify health/startup.
   * Verify existing data and critical functionality.

6. Database safety check:

   * Verify existing database opens.
   * Verify backup creation.
   * Verify restore.
   * Verify previous-version backup restore when applicable.
   * Verify migrations do not cause data loss.

7. Verify release artifacts:

   * Confirm installer exists.
   * Confirm update ZIP exists.
   * Confirm required files and runtime dependencies are included.
   * Confirm release manifest exists.
   * Confirm SHA-256 matches the actual update package.
   * Confirm filenames and versions are correct.

8. Only after all checks pass:

   * Create the release tag.
   * Push the tag.
   * Allow the GitHub Actions release workflow to build/publish the release.

9. Verify the published GitHub Release:

   * Correct tag.
   * Correct version.
   * Release is published.
   * Update ZIP exists.
   * Manifest exists.
   * Manifest SHA-256 matches the uploaded ZIP.

10. Verify the real update path:

    * Previous installed version
      → Update Access Service
      → GitHub release
      → temporary download URL
      → download
      → hash verification
      → backup
      → apply
      → restart
      → health check.

11. Final production verification:

    * Test the updated installed application again.
    * Confirm no regression in critical existing functionality.
    * Confirm database integrity.
    * Confirm update functionality.
    * Confirm support/error reporting when applicable.

12. Release decision:

    * If all required checks pass: mark the release VERIFIED.
    * If any critical check fails: DO NOT release or promote the release.
    * Investigate and fix the root cause before creating another release.

FINAL RULE:
A successful build or GitHub Actions run does NOT mean the release is successful.
A release is successful only after the actual installed production application and upgrade path have been verified.
Never create a new release merely to test an unverified fix.
