# BOOK_ARCHITECTURE.md
# Mishkat Library Management System — Physical & Digital Books API Architecture (Phase 1.7.3-B)

## 1. Architectural Overview & Data Ownership

In Phase 1.7.3-B, all **Physical Books** and **Digital Books** data ownership has been migrated from client-side ephemeral storage to the **Central Mishkat Server**.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                     Mishkat Client Applications                         │
│  (Student Portal / Admin Dashboard / Digital Reader / Library Catalog)  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                        (Pure HTTP/REST via JWT)
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       src/services/bookRepository.ts                    │
│            (Authoritative Client Data Access Layer for Books)           │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Central Mishkat Server                        │
│                   Express.js Router: /api/v1/books                      │
└──────────────────┬───────────────────────────────────┬──────────────────┘
                   │                                   │
                   ▼                                   ▼
        PostgreSQL / SQLite Database          Central File Storage
       - Table: books                        - Local / Cloud File Storage
       - Relations: categoryId, loans        - Managed Streaming & Downloads
```

### Core Principles Enforced
1. **Server Authority**: The Central Server is the single source of truth for all book metadata, available copies, read counts, and digital asset locations.
2. **React State is NOT a Database**: Client components maintain only view-level presentation state populated directly from `bookRepository`.
3. **No Raw Filesystem Exposure**: Digital files (PDF/EPUB) and cover images are accessed through managed endpoints (`/api/v1/books/:id/file` and `/api/v1/books/:id/cover`) rather than exposing raw server filesystem paths.
4. **Loan-Protected Deletion**: Books with active loans cannot be deleted (`400 Bad Request: ACTIVE_LOANS_EXIST`).

---

## 2. Book Repository Interface & Contract

The `BookRepository` (`src/services/bookRepository.ts`) implements the full lifecycle for physical and digital books:

| Method | HTTP Call | Description | Auth / RBAC |
| :--- | :--- | :--- | :--- |
| `getPhysicalBooks(params?)` | `GET /api/v1/books?type=physical` | Fetches filtered physical books catalog | Public / Authenticated |
| `getDigitalBooks(params?)` | `GET /api/v1/books?type=digital` | Fetches filtered digital books catalog | Public / Authenticated |
| `getBookById(id)` | `GET /api/v1/books/:id` | Fetches detailed book entity | Public / Authenticated |
| `createPhysicalBook(book)` | `POST /api/v1/books` | Creates a new cataloged physical book | Admin Only |
| `createDigitalBook(book)` | `POST /api/v1/books` | Creates a new central digital book | Admin / Approved Submissions |
| `updatePhysicalBook(id, updates)` | `PUT /api/v1/books/:id` | Updates physical book details & shelf | Admin Only |
| `updateDigitalBook(id, updates)` | `PUT /api/v1/books/:id` | Updates digital book details | Admin Only |
| `deleteBook(id)` | `DELETE /api/v1/books/:id` | Deletes book (guarded against active loans) | Admin Only |
| `bulkImportDigitalBooks(books)` | `POST /api/v1/books/bulk` | Batch imports staged digital books | Admin Only |
| `uploadDigitalFile(file)` | `POST /api/v1/books/upload` | Uploads PDF/EPUB to central storage | Admin / Authenticated |
| `incrementReadCount(bookId)` | `POST /api/v1/books/:id/increment-read` | Records reader engagement | Authenticated |
| `getBookFileUrl(bookId)` | `GET /api/v1/books/:id/file` | URL for streaming/downloading digital file | Authenticated |

---

## 3. Server Endpoints & Payload Contracts

### 3.1 Book Querying & Filtering
- **Route**: `GET /api/v1/books`
- **Query Parameters**:
  - `type`: `'physical'` | `'digital'` (optional)
  - `categoryId`: Filter by specific category
  - `search`: Search across title, author, isbn, shelf location
  - `limit`: Number of results (default 50)
  - `offset`: Pagination offset (default 0)
- **Response Format**:
```json
{
  "success": true,
  "data": [
    {
      "id": "book-1",
      "title": "العقد الفريد",
      "author": "ابن عبد ربه الأندلسي",
      "categoryId": "cat-arabic",
      "type": "physical",
      "totalCopies": 3,
      "availableCopies": 2,
      "location": { "cabinet": "A1", "shelf": "2" },
      "isbn": "978-9953-29-847-4"
    }
  ],
  "meta": {
    "total": 1,
    "limit": 50,
    "offset": 0
  }
}
```

### 3.2 Book Creation
- **Route**: `POST /api/v1/books`
- **Validation Rules**:
  - `title`: Required, non-empty string.
  - `author`: Required, non-empty string.
  - `categoryId`: Must correspond to an existing active category.
  - `type`: Must be `'physical'` or `'digital'`.
  - For physical books: `totalCopies` must be $\ge 1$.
- **Response**: `201 Created` with created book record.

### 3.3 Book Deletion Protection
- **Route**: `DELETE /api/v1/books/:id`
- **Business Guard**: If the book has active (unreturned/overdue) loans in the circulation desk, the server returns:
```json
{
  "success": false,
  "error": {
    "code": "ACTIVE_LOANS_EXIST",
    "message": "لا يمكن حذف هذا الكتاب لوجود إعارات نشطة مرتبطة به حالياً. يرجى استرجاع كافة النسخ المعارة أولاً."
  }
}
```

### 3.4 Read Count Increment
- **Route**: `POST /api/v1/books/:id/increment-read`
- **Behavior**: Atomic increment on central database record; safe for fire-and-forget reader events.

---

## 4. Digital File Ingestion & Storage Architecture

1. **File Upload Route**: `POST /api/v1/books/upload` (Multipart `multer` handler).
2. **Allowed Formats**: `.pdf`, `.epub`, `.mobi`, `.djvu`.
3. **Storage Destination**: Central server storage directory (`serverConfig.dirs.digital`).
4. **Streaming Route**: `GET /api/v1/books/:id/file` with `Content-Type: application/pdf` or `application/epub+zip` supporting HTTP Range requests for seamless PDF page streaming.

---

## 5. Migration Status Summary

| Area | Status | Notes |
| :--- | :--- | :--- |
| **Auth & Session** | **MIGRATED (1.7.2)** | Handled via `AuthContext` and `/api/v1/auth/*` |
| **Categories** | **MIGRATED (1.7.3-A)** | Handled via `CategoryRepository` and `/api/v1/categories/*` |
| **Physical Books** | **MIGRATED (1.7.3-B)** | Handled via `BookRepository` and `/api/v1/books/*` |
| **Digital Books** | **MIGRATED (1.7.3-B)** | Handled via `BookRepository` and `/api/v1/books/*` |
| **Loans & Circulation** | Pending Phase 1.7.4 | Retained in `StorageService` for interim |
| **Submissions & Reviews**| Pending Phase 1.7.5 | Retained in `StorageService` for interim |
| **Users & Students** | Pending Phase 1.7.6 | Retained in `StorageService` for interim |
| **Notes & Bookmarks** | Pending Phase 1.7.7 | Retained in `StorageService` for interim |
