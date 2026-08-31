# DATA_OWNERSHIP_CURRENT.md
# Mishkat Library Management System — Current Storage Architecture & Data Ownership Inventory (Phase 1.7.1)

## 1. Executive Overview

This document presents the **exact current state** of data ownership, storage mechanisms, and persistence layers in the Mishkat codebase prior to executing the Phase 1.8 API-first refactoring.

---

## 2. Current vs. Target Data Ownership Matrix

| Data Entity | Current Client Source | Current Server Source | Current Persistence Layer | Target Authoritative Source |
| :--- | :--- | :--- | :--- | :--- |
| **Physical Books** | `StorageService.physicalBooks` (In-Memory array in `App.tsx` state) | `books` + `physical_copies` table (PostgreSQL) | Server: PostgreSQL Database<br>Client: In-memory transient state (seeded by `INITIAL_PHYSICAL_BOOKS` & sync) | PostgreSQL Database (`books` + `physical_copies`) |
| **Digital Books** | `StorageService.digitalBooks` (In-Memory array in `App.tsx` state) | `books` table (PostgreSQL) | Server: PostgreSQL Database<br>Client: In-memory transient state (seeded by `INITIAL_DIGITAL_BOOKS` & sync) | PostgreSQL Database (`books`) |
| **Digital Files (PDF/EPUB)** | Object URLs / `/api/v1/books/:id/file` | Local Central Vault (`LibraryData/books/digital/`) | Central File Storage / Streaming API (HTTP Range 206) | Central Storage (Protected Stream API) |
| **Book Covers** | `/api/v1/books/files/covers/*` / Base64 Data URLs | Local Central Vault (`LibraryData/books/covers/`) | Central File Storage / Static Express Serve | Central Storage (`/api/v1/books/files/covers/*`) |
| **Categories** | `StorageService.categories` (In-Memory array in `App.tsx` state) | `categories` table (PostgreSQL) | Server: PostgreSQL Database<br>Client: In-memory transient state (seeded by `INITIAL_CATEGORIES` & sync) | PostgreSQL Database (`categories`) |
| **Students & Rosters** | `StorageService.students` (In-Memory array in `App.tsx` state) | `users` table (PostgreSQL, `role = 'student'`) | Server: PostgreSQL Database<br>Client: In-memory transient state (seeded by `INITIAL_STUDENTS` & sync) | PostgreSQL Database (`users`) |
| **Administrators & Staff** | `StorageService.admin` (In-Memory object in `App.tsx` state) | `users` table (PostgreSQL, `role = 'admin' / 'librarian'`) | Server: PostgreSQL Database<br>Client: In-memory transient state (seeded by `INITIAL_ADMIN` & sync) | PostgreSQL Database (`users`) |
| **Circulation Loans** | `StorageService.loans` (In-Memory array in `App.tsx` state) | `loans` table (PostgreSQL) | Server: PostgreSQL Database<br>Client: In-memory transient state (seeded by `INITIAL_LOANS` & sync) | PostgreSQL Database (`loans`) |
| **Physical Loan Requests** | `StorageService.loanRequests` (In-Memory array in `App.tsx` state) | `loan_requests` table (PostgreSQL) | Server: PostgreSQL Database<br>Client: In-memory transient state (seeded by `INITIAL_LOAN_REQUESTS` & sync) | PostgreSQL Database (`loan_requests`) |
| **Student Notes** | `StorageService.notes` (In-Memory array in `App.tsx` state) | `student_notes` table (PostgreSQL) | Server: PostgreSQL Database<br>Client: In-memory transient state (seeded by `INITIAL_STUDENT_NOTES` & sync) | PostgreSQL Database (`student_notes`) |
| **Physical Bookmarks** | `StorageService.physicalBookmarks` / In-Memory array in `App.tsx` | `physical_bookmarks` table (PostgreSQL) | Server: PostgreSQL Database<br>Client: In-memory transient state (seeded by `INITIAL_PHYSICAL_BOOKMARKS` & sync) | PostgreSQL Database (`physical_bookmarks`) |
| **Reader Page Bookmarks** | `BookReaderModal` component state & API `/api/v1/bookmarks` | `physical_bookmarks` table (PostgreSQL) | Server: PostgreSQL Database<br>Client: In-memory React state | PostgreSQL Database (`physical_bookmarks`) |
| **Book Summaries** | `StorageService.summaries` (In-Memory array in `App.tsx` state) | `book_summaries` table (PostgreSQL) | Server: PostgreSQL Database<br>Client: In-memory transient state (seeded by `INITIAL_BOOK_SUMMARIES` & sync) | PostgreSQL Database (`book_summaries`) |
| **Reading Progress** | `StorageService.progress` (In-Memory array in `App.tsx` state) | `reading_progress` table (PostgreSQL) | Server: PostgreSQL Database<br>Client: In-memory transient state (seeded by `INITIAL_STUDENT_PROGRESS` & sync) | PostgreSQL Database (`reading_progress`) |
| **Favorite Books** | `StorageService.favorites` (In-Memory dictionary in `App.tsx` state) | `student_favorites` table (PostgreSQL) | Server: PostgreSQL Database<br>Client: In-memory transient state | PostgreSQL Database (`student_favorites`) |
| **Notifications** | `StorageService.notifications` (In-Memory array in `App.tsx` state) | `notifications` table (PostgreSQL) | Server: PostgreSQL Database<br>Client: In-memory transient state (seeded by `INITIAL_NOTIFICATIONS` & sync) | PostgreSQL Database (`notifications`) |
| **Academic Portals** | `StorageService.portals` (In-Memory array in `App.tsx` state) | `whitelisted_portals` table (PostgreSQL) | Server: PostgreSQL Database<br>Client: In-memory transient state (seeded by `INITIAL_WHITELISTED_PORTALS` & sync) | PostgreSQL Database (`whitelisted_portals`) |
| **Book Ingestion Submissions** | `StorageService.submissions` (In-Memory array in `App.tsx` state) | `pending_submissions` table (PostgreSQL) | Server: PostgreSQL Database<br>Client: In-memory transient state (seeded by `INITIAL_PENDING_SUBMISSIONS` & sync) | PostgreSQL Database (`pending_submissions`) |
| **System Settings & Rules** | `StorageService.config` (In-Memory object in `App.tsx` state) | `system_settings` table (PostgreSQL) | Server: PostgreSQL Database<br>Client: In-memory transient state (seeded by `INITIAL_SYSTEM_CONFIG` & sync) | PostgreSQL Database (`system_settings`) |
| **Search History** | `StorageService.searchHistory` (In-Memory dictionary in `storageService.ts`) | None (Not stored on server) | Client in-memory state during session | Ephemeral UI Session (or Server Audit) |
| **Active Open Books** | `StorageService.openBooks` (In-Memory dictionary in `storageService.ts`) | None (Not stored on server) | Client in-memory state during session | Ephemeral UI Session |
| **Authentication Token** | `apiClient.token` (`localStorage` / `sessionStorage`) | JWT signed with server secret | Browser storage (`mishkat_jwt_token`) for HTTP Authorization header | Transient Session Storage / Memory Token |
| **UI Theme Preference** | `ThemeContext` (`localStorage.getItem('almanara_theme')`) | None | Browser storage (`almanara_theme`) | Browser Local Storage (Allowed UI Preference) |

---

## 3. Storage Layer Analysis

### 3.1 Client-Side Persistence Audit
- **`localStorage`**:
  - `almanara_theme`: Stores `'light' | 'dark'` UI theme mode. (*Category A — Allowed*).
  - `mishkat_jwt_token`: Stores the signed JWT bearer token string. (*Category B — Authentication credential*).
  - All legacy keys (`almanara_categories`, `almanara_physical_books`, `almanara_students`, `almanara_loans`, etc.) have been purged from disk upon `storageService.ts` initialization.
- **`sessionStorage`**:
  - `mishkat_jwt_token`: Alternative ephemeral storage for session-scoped authentication. (*Category B — Allowed*).
- **`IndexedDB` / `WebSQL` / `SQLite Client`**:
  - None present or configured in the client workspace.

### 3.2 Server-Side Persistence Audit
- **PostgreSQL 15+ Engine**:
  - Single authoritative database with connection pooling (`pg.Pool`), transaction safety (`db.transaction()`), schema migrations (`server/db/migrator.ts`), and seed script (`server/db/seed.ts`).
  - Strict isolation: If PostgreSQL is unreachable, requests return `503 DATABASE_UNAVAILABLE` rather than falling back to unauthoritative JSON files.
- **Central Storage Vault**:
  - Physical directory paths: `LibraryData/books/digital/` and `LibraryData/books/covers/`.
  - Secure file streaming with Range request support (HTTP 206 Partial Content) and path traversal mitigations.
