---
trigger: always_on
---

# MISHKAT WORKSPACE RULES

Mishkat is a production desktop/server application used by institutions. Existing data, installation integrity, backward compatibility, offline operation, and upgrade safety are critical.

## 1. KNOWN-GOOD BASELINE

Always preserve the last known-good behavior.

When a feature worked in a previous release:

* Treat that release as the baseline.
* Inspect Git history before rewriting it.
* Compare the old and current implementation.
* Identify the introducing change when possible.

Do not assume the current implementation represents the intended behavior.

## 2. REGRESSION-FIRST DEVELOPMENT

A change is not successful if it fixes Feature A while breaking Feature B.

Before implementation, identify affected existing functionality.

After implementation, explicitly test:

* changed functionality
* directly dependent functionality
* important existing functionality

Never dismiss a regression as unrelated without evidence.

## 3. PRODUCTION PARITY

Mishkat must work from the actual installed production artifact.

Never use the developer machine as proof that a feature works in production.

For production-sensitive functionality verify:

* Installer contents
* bundled files
* runtime dependencies
* paths
* permissions
* Windows services
* ports
* environment variables
* Tauri runtime
* WebView/browser behavior
* external services

A feature that works only because a dependency exists elsewhere on the developer machine is considered broken.

## 4. INSTALLER IS PART OF THE PRODUCT

The installer is not merely a packaging step.

When a feature requires a file, binary, dependency, resource, model, font, executable, migration, or configuration:
verify that it is actually present in the installed application.

Test the installed artifact, not only the source tree.

## 5. DATABASE = PROTECTED ASSET

Never introduce destructive database behavior casually.

For every schema/data change ask:

* What happens to existing installations?
* What happens to old backups?
* What happens during upgrade?
* What happens after rollback?
* What happens when optional/new fields or tables are absent?

Existing backups must remain restorable whenever compatibility is intended.

Any migration must be explicit, deterministic, and safe.

## 6. BACKUP/RESTORE

Backup and restore are critical functionality.

Never make a newly introduced table mandatory for restoring an older valid backup unless backward compatibility is explicitly intended and implemented.

Test:

* backup creation
* restore on same version
* restore from previous version
* restore after upgrade
* restore after reset
* restore with real production-like data

Never claim restore works without actually restoring data.

## 7. SAMPLE DATA / RESET

Sample/demo data must have a deterministic source of truth.

Do not reconstruct sample data from the current database.

If a reset/sample-data feature exists, it must produce a known deterministic dataset independent of:

* previous user activity
* cache
* previous imports
* previous database state
* developer machine state

## 8. BOOK IMPORT / PDF PROCESSING

Book import must work with NEW, previously unseen files.

Never validate an import algorithm only against books previously examined during development.

Do not rely on:

* hardcoded known titles
* known author lists as the primary extraction mechanism
* cache
* previous database records
* developer-machine state

Test with unseen real files.

Separate and diagnose independently:

* file upload
* PDF parsing
* metadata extraction
* title extraction
* author extraction
* category selection
* database insertion

## 9. FRONTEND + BACKEND

Treat frontend and backend as one system.

For every API change verify:

* request contract
* response contract
* validation
* authentication/authorization
* error states
* frontend handling
* production endpoint configuration

Do not fix frontend symptoms while leaving backend failures hidden.

## 10. ERROR OBSERVABILITY

Critical errors must be observable.

Capture where appropriate:

* backend exceptions
* API failures
* database failures
* import failures
* frontend exceptions
* unhandled promise rejections
* WebView/console errors
* startup failures
* update failures

Errors that prevent the UI from loading must still have a diagnostic path.

## 11. SUPPORT REPORTING

Support must be tested from a real institution-like machine.

Never consider localhost testing sufficient for production support communication.

Verify:

Institution → Support API → Support Dashboard

and test when:

* network is unavailable
* network returns
* request fails
* application restarts
* queue contains pending reports

Reports must not be silently lost.

## 12. INTERNET POLICY / PROXY

Treat Windows networking and proxy configuration as OS-level functionality, not merely UI functionality.

Test the complete chain:

Policy → backend → configuration → Windows → user session → browser/WebView → actual website behavior

Do not claim proxy blocking works because a configuration value changed.

Verify the actual behavior from a real user session.

## 13. UPDATER

The updater is high-risk functionality.

Never release an updater change without testing:

Check → Download → Verify → Backup → Stage → Apply → Restart → Health Check → Rollback

The update must not destroy:

* database
* configuration
* user data
* existing functionality
* required runtime dependencies

A successful download does not mean a successful update.

## 14. RELEASE GATE

Before creating a production release:

* run automated tests
* run type/build checks
* build the actual installer/update artifact
* install it on a clean machine or clean environment
* test critical flows
* test upgrade from previous release
* verify database restore
* verify book import
* verify support reporting
* verify internet policy
* verify known-good reader functionality

Do not create a new release merely to "see whether it works."

## 15. CHANGE SCOPE

Do not combine unrelated fixes into a large refactor.

Prefer:
small change → focused verification → regression test → next change

Avoid touching working components unless required by the root cause.

## 16. WHEN A FAILURE APPEARS

Stop and determine whether the failure is caused by:

* code
* dependency
* packaging
* environment
* permissions
* configuration
* migration
* update process
* network
* operating system

Do not guess.

## 17. FINAL RESPONSE FROM THE AGENT

For every meaningful task, provide:

ROOT CAUSE
→ CHANGE MADE
→ FILES CHANGED
→ TESTS RUN
→ TEST RESULTS
→ REGRESSIONS CHECKED
→ REMAINING RISKS

Never hide failed tests.
Never report an unverified feature as working.
