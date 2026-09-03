# MISHKAT — EXTERNAL PORTAL DISCOVERY, SOURCE VERIFICATION & PROVENANCE ARCHITECTURE

## Phase 15.4-D Technical Reference & Capability Matrix

---

## 1. Non-Negotiable Core Invariant

> **MISHKAT MUST NEVER INVENT, FABRICATE, GUESS, OR SILENTLY SUBSTITUTE EXTERNAL BOOK RECORDS.**
> When MISHKAT says: *"This book exists on Portal X"*, that statement MUST be backed by an actual, verifiable record returned by Portal X.

The AI model may assist with:
* Interpreting user natural-language queries (e.g. query keyword extraction)
* Normalizing queries (e.g. stripping diacritics)
* Ranking and summarization of verified records

**AI MUST NEVER BECOME THE SOURCE OF TRUTH** for book existence, titles, authors, ISBNs, source URLs, digital file existence, or portal membership.

---

## 2. External Portal Lifecycle

```text
DRAFT
  └── DISCOVERING (Priority 1-4 Protocol Probe)
        └── ANALYZING (SSRF & Redirect Security Check)
              └── TESTING (12-Point Technical Test Suite)
                    ├── VERIFIED (All Critical Tests Pass)
                    ├── UNSUPPORTED (No API/OAI-PMH Detected)
                    ├── BLOCKED (Automated Requests Restricted)
                    └── FAILED / NEEDS_REVIEW (Connectivity or Schema Error)
```

An Admin **cannot** activate an external portal as `VERIFIED` without a successful pass of the automated 12-test technical onboarding suite.

---

## 3. Prioritized Discovery Process

When an Admin adds a portal URL, `DiscoveryEngine` executes prioritized probing:

1. **Priority 1 — Official API**:
   Probes `/api/v1/search`, `/api/records`, `/api/books` requiring `application/json`.
2. **Priority 2 — OAI-PMH**:
   Probes `/oai`, `/oai-pmh`, `/oai/request` with `?verb=Identify` and `?verb=ListMetadataFormats`. Parses Dublin Core XML (`oai_dc`).
3. **Priority 3 — Official Search Endpoint**:
   Probes documented search templates (e.g. `/search?q={query}`).
4. **Priority 4 — Public Structured Metadata**:
   Extracts embedded JSON-LD and Schema.org Book metadata.
5. **Priority 5 — None / Unsupported**:
   If no official API or OAI-PMH is detected, the portal is marked `UNSUPPORTED`. MISHKAT **never invents** an API endpoint.

---

## 4. Supported Integration Methods

| Integration Method | Description | Primary Protocol | Example Portals |
| :--- | :--- | :--- | :--- |
| `OAI_PMH` | Standard repository interoperability | HTTP GET / XML (oai_dc) | Academic Institutional Repositories, DSpace |
| `OFFICIAL_API` | Documented REST or JSON catalog API | JSON over HTTPS | Modern Digital Libraries, Open Library |
| `OFFICIAL_SEARCH_ENDPOINT` | Verified structured search endpoint | Structured Query | Standard Searchable Repositories |
| `MANUAL_VERIFIED_CATALOG` | Curated offline/pre-verified catalog | Structured In-Memory / DB | المكتبة الشاملة الإباضية، الشاملة الحديثة |
| `NONE` | No verifiable machine integration | None | Generic Web Portals (Unsupported) |

---

## 5. Immutable Provenance Model

Every external search result and suggested book record carries immutable provenance:

```typescript
export interface ImmutableProvenance {
  sourcePortalId: string;        // e.g. "portal-ibadi"
  sourcePortalName: string;      // e.g. "المكتبة الشاملة الإباضية"
  sourceBaseUrl: string;         // e.g. "https://al-maktaba.org"
  sourceRecordUrl: string;       // e.g. "https://al-maktaba.net/book/ibadi-01"
  sourceRecordId: string;        // Canonical source identifier
  sourceRetrievedAt: string;     // ISO-8601 Timestamp
  sourceMethod: IntegrationMethod; // OFFICIAL_API, OAI_PMH, MANUAL_VERIFIED_CATALOG
  verificationStatus: VerificationStatus; // VERIFIED, NOT_FOUND, BLOCKED, etc.
}
```

---

## 6. Real 404, Soft 404 & Redirect Security

### Real 404 Detection
* HTTP 404 and 410 statuses immediately return `status: 'NOT_FOUND'`.

### Soft 404 Detection
* Portals returning HTTP 200 with error page content ("لم يتم العثور على", "صفحة غير موجودة", "404 Not Found", "غير متوفر") are intercepted and classified as `status: 'NOT_FOUND'` with `isSoft404: true`.

### Redirect Security
* Follows redirects up to a maximum of 5 hops.
* Every hop is checked against approved domains.
* If a redirect attempts to jump to an external or unapproved domain, the request is aborted with `status: 'BLOCKED'`.

### Content Matching
* Confirms that the retrieved source body contains the expected title tokens and author metadata before marking `contentMatched: true`.

---

## 7. Portal Capability Matrix (Configured Portals)

| Portal ID | Portal Name | Discovery Method | Search Method | Record Verification | Capabilities | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `portal-ibadi` | المكتبة الشاملة الإباضية | `MANUAL_VERIFIED_CATALOG` | Source-Bound Catalog Filter | Source Record Match + Chapter Preview | Full Text, Search, Chapters | `VERIFIED` |
| `portal-shamela` | المكتبة الشاملة الحديثة | `MANUAL_VERIFIED_CATALOG` | Source-Bound Catalog Filter | Source Record Match + Chapter Preview | Full Text, Search, Chapters | `VERIFIED` |
| `portal-arabic-academy` | مجمع الملك سلمان اللغوي | `MANUAL_VERIFIED_CATALOG` | Source-Bound Catalog Filter | Source Record Match + Chapter Preview | Search, Metadata | `VERIFIED` |
| `portal-school-research` | المستودع المدرسي للأبحاث | `MANUAL_VERIFIED_CATALOG` | Local In-Memory Catalog | Local Verification | Search, Record Lookup | `VERIFIED` |
| `generic-unverified` | أي بوابة خارجية غير مفحوصة | `DISCOVERY_ENGINE` | Probing required | 12-Test Suite Required | Pending Discovery | `UNSUPPORTED` / `DRAFT` |

---

## 8. The 12-Point Technical Onboarding Test Suite

When an Admin adds or tests an external portal, MISHKAT executes:

1. **Test 1 — Connectivity**: Validates HTTPS connectivity and latency.
2. **Test 2 — Discovery**: Verifies that an approved integration method exists.
3. **Test 3 — Search Execution**: Executes a real query against the portal adapter.
4. **Test 4 — Result Structure**: Validates title, author, and schema integrity.
5. **Test 5 — Stable Record Identifier**: Verifies persistent record identifiers.
6. **Test 6 — Canonical URL**: Confirms verifiable original source URLs.
7. **Test 7 — Positive Verification**: Confirms a known existing record as `VERIFIED`.
8. **Test 8 — Negative Verification**: Queries a nonexistent string; confirms 0 results and zero hallucinations.
9. **Test 9 — Broken URL Handling**: Probes an invalid URL; confirms `NOT_FOUND` (never `VERIFIED`).
10. **Test 10 — Soft 404 Detection**: Confirms detection of fake HTTP 200 error pages.
11. **Test 11 — Cross-Source Isolation**: Proves that Portal B records can never appear in Portal A results.
12. **Test 12 — AI Isolation**: Verifies architectural barrier blocking AI-synthesized records.

---

## 9. How to Add a New Portal Adapter

1. Create a class extending `ExternalPortalAdapter` in `server/services/portals/adapters/`:
   ```typescript
   export class CustomPortalAdapter extends ExternalPortalAdapter {
     async discover(): Promise<PortalDiscoveryResult> { ... }
     async healthCheck(): Promise<PortalHealthResult> { ... }
     async search(query: string, options?: PortalSearchOptions): Promise<VerifiedPortalRecord[]> { ... }
     async getRecord(identifier: string): Promise<VerifiedPortalRecord | null> { ... }
     async verifyRecord(record: { recordUrl: string; ... }): Promise<VerificationResult> { ... }
   }
   ```
2. Register the adapter in `PortalManager.getAdapter(portalId)`.
3. Add allowed domains to the portal's whitelist configuration.
4. Run `npm test` and execute the 12 onboarding tests via Admin UI or API.
