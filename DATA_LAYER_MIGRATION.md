# DATA_LAYER_MIGRATION.md
# Mishkat Library Management System — Final Client Data-Layer Migration (Phase 1.7)

## 1. Executive Summary & Objective

In accordance with the architectural directives of the Mishkat Library System:
- **Central Authority**: There is exactly ONE CENTRAL SERVER (running Node.js/Express + PostgreSQL with relational file database fallback).
- **Client Role**: Student and terminal workstations function purely as stateless or transient clients. **NO persistent library data is stored on client computers.**
- **Storage Service Migration**: All local-storage persistence mechanisms for books, categories, users, loans, requests, notes, summaries, reading progress, favorites, and notifications have been decommissioned from client storage engines (`localStorage`, `sessionStorage`, `IndexedDB`).
- **Single Source of Truth**: All operations execute against authoritative REST API endpoints under `/api/v1/*`, ensuring complete real-time data consistency across all network nodes.

---

## 2. Completed Migration Architecture

```text
+-------------------------------------------------------------------------+
|                         STUDENT / DESKTOP CLIENTS                       |
|   (React 18 + TypeScript + Tailwind CSS UI / In-App PDF & EPUB Reader)  |
+-------------------------------------------------------------------------+
       |                     |                      |               |
       | HTTP/REST           | JWT Auth             | HTTP Stream   | JSON/Form
       v                     v                      v               v
+-------------------------------------------------------------------------+
|                      MISHKAT CENTRAL NODE.JS API SERVER                 |
|            (/server/routes/* — Books, Loans, Auth, Notes, etc.)         |
+-------------------------------------------------------------------------+
       |                                                            |
       v                                                            v
+------------------------------------+           +------------------------------------+
|         PostgreSQL Database        |           |  Central Physical & Digital Vault  |
|  (ACID Transactions, Foreign Keys, |           |     (/LibraryData/books/digital/   |
|     Indexes, Full RBAC Control)    |           |      /LibraryData/covers/)         |
+------------------------------------+           +------------------------------------+
```

---

## 3. Entity Migration Mapping

| Entity | Client Data Storage | Central API Endpoint | Authoritative Server Store |
| :--- | :--- | :--- | :--- |
| **Catalog (Physical & Digital Books)** | React in-memory state | `GET /api/v1/books`<br>`POST /api/v1/books`<br>`PUT /api/v1/books/:id`<br>`DELETE /api/v1/books/:id` | `books`, `physical_copies` table |
| **Categories & Classifications** | React in-memory state | `GET /api/v1/categories`<br>`POST /api/v1/categories`<br>`PUT /api/v1/categories/:id`<br>`DELETE /api/v1/categories/:id` | `categories` table |
| **Circulation & Loans** | React in-memory state | `GET /api/v1/loans`<br>`POST /api/v1/loans`<br>`POST /api/v1/loans/:id/return`<br>`POST /api/v1/loans/:id/extend` | `loans` table (Atomic Transactions) |
| **Loan Requests (Physical)** | React in-memory state | `GET /api/v1/loan-requests`<br>`POST /api/v1/loan-requests`<br>`POST /api/v1/loan-requests/:id/approve`<br>`POST /api/v1/loan-requests/:id/reject`<br>`POST /api/v1/loan-requests/:id/handover` | `loan_requests` table |
| **Student Roster & Users** | React in-memory state | `GET /api/v1/users`<br>`POST /api/v1/users`<br>`PUT /api/v1/users/:id`<br>`DELETE /api/v1/users/:id`<br>`POST /api/v1/users/roster-import`<br>`POST /api/v1/users/:id/reset-password` | `users` table (Bcrypt hashed) |
| **User Authentication & Session** | Token-only memory/transient storage | `POST /api/v1/auth/login`<br>`GET /api/v1/auth/me`<br>`POST /api/v1/auth/logout` | JWT signed verification & DB lookup |
| **Reading Workspace Notes** | React in-memory state | `GET /api/v1/notes`<br>`POST /api/v1/notes`<br>`DELETE /api/v1/notes/:id` | `student_notes` table |
| **Book Summaries** | React in-memory state | `GET /api/v1/summaries`<br>`POST /api/v1/summaries`<br>`DELETE /api/v1/summaries/:id` | `book_summaries` table |
| **Physical Bookmarks** | React in-memory state | `GET /api/v1/bookmarks`<br>`POST /api/v1/bookmarks`<br>`DELETE /api/v1/bookmarks/:id` | `physical_bookmarks` table |
| **Digital Reading Progress** | React in-memory state | `GET /api/v1/reading-progress`<br>`POST /api/v1/reading-progress`<br>`POST /api/v1/reading-progress/dismiss`<br>`POST /api/v1/reading-progress/clear-completed` | `reading_progress` table |
| **Favorites / Starred Books** | React in-memory state | `GET /api/v1/favorites`<br>`POST /api/v1/favorites/toggle` | `student_favorites` table |
| **Academic Whitelisted Portals**| React in-memory state | `GET /api/v1/portals`<br>`POST /api/v1/portals`<br>`PUT /api/v1/portals/:id`<br>`DELETE /api/v1/portals/:id` | `whitelisted_portals` table |
| **Book Ingestion Submissions** | React in-memory state | `GET /api/v1/submissions`<br>`POST /api/v1/submissions`<br>`POST /api/v1/submissions/:id/review` | `pending_submissions` table |
| **Notifications** | React in-memory state | `GET /api/v1/notifications`<br>`POST /api/v1/notifications/:id/read`<br>`POST /api/v1/notifications/mark-all-read`<br>`DELETE /api/v1/notifications/clear` | `notifications` table |
| **System Configuration** | React in-memory state | `GET /api/v1/settings`<br>`PUT /api/v1/settings` | `system_settings` table |

---

## 4. Client Storage Purge Verification

1. **Local Storage Elimination**:
   - `localStorage.getItem('almanara_...')` and `localStorage.setItem('almanara_...')` for library collections have been purged.
   - Reader bookmarks previously written to `localStorage.getItem('bookmarks_${book.id}')` now synchronize strictly via `/api/v1/bookmarks`.
2. **Session Storage Isolation**:
   - The only browser-side stored value is the temporary JWT authentication token (`mishkat_jwt_token`) for HTTP header authorization.
3. **Graceful Network Handling**:
   - In case of central server unreachability, the client displays a clear network connection alert rather than falling back to an unmanaged local persistent database.

---

## 5. Verification & Test Plan

1. **Cross-Computer Consistency Test**:
   - Add a note or bookmark from Student Client A.
   - Log into Student Client B with the same credentials. Verify that the note and bookmark appear immediately without manual file transfers.
2. **Client Storage Purge Test**:
   - Clear client browser cache and storage (`localStorage.clear()`).
   - Log back in: all books, loans, bookmarks, and notes are intact and retrieved dynamically from the central PostgreSQL database.
3. **Central Server Concurrency Test**:
   - Perform simultaneous book loans or returns. ACID transactions prevent overselling or race conditions.
