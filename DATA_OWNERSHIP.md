# DATA_OWNERSHIP.md
# Mishkat Central Library System — Data Authority & Ownership Matrix

## 1. Core Ownership Principle

```text
+-------------------------------------------------------------------------------+
|                            CENTRAL SERVER AUTHORITY                           |
|                                                                               |
|  - Sole Owner of Master Database (PostgreSQL / Relational Store)              |
|  - Sole Authority for ID Generation and Timestamping                          |
|  - Sole Enforcer of Business Constraints and ACID Transactions                |
|  - Sole Validator of User Roles, Permissions, and JWT Authentication          |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
|                             CLIENT APPLICATION                                |
|                                                                               |
|  - Stateless Consumer & Renderer of Data                                      |
|  - In-Memory Ephemeral State during User Active Session                       |
|  - Dispatches Asynchronous REST Requests via apiClient                        |
|  - Contains ZERO persistent local database storage                            |
+-------------------------------------------------------------------------------+
```

---

## 2. Entity Authority & Modification Permissions

| Entity | Canonical Server Store | Read Authority | Write Authority | Delete Authority |
| :--- | :--- | :--- | :--- | :--- |
| **Catalog Books (Physical/Digital)** | `books`, `physical_copies` | Public / Students / Admin | Admin, Librarian | Admin only |
| **Categories** | `categories` | Public / Students / Admin | Admin, Librarian | Admin only (with reassignment check) |
| **Circulation Loans** | `loans` | Students (Self only), Admin (All) | Admin, Librarian | None (Historical audit retention) |
| **Loan Requests** | `loan_requests` | Students (Self only), Admin (All) | Students (Create), Admin (Approve/Reject/Handover) | Admin only |
| **User Profiles & Rosters** | `users` | Admin (All), Student (Self only) | Admin (CRUD), Student (Self profile/password) | Admin only (Soft delete) |
| **Reading Notes** | `student_notes` | Student (Author only), Admin (Audit) | Student (Author only) | Student (Author only), Admin |
| **Book Summaries** | `book_summaries` | Student (Author only), Admin (Audit) | Student (Author only) | Student (Author only), Admin |
| **Physical Bookmarks** | `physical_bookmarks` | Student (Author only), Admin (Audit) | Student (Author only) | Student (Author only) |
| **Reading Progress** | `reading_progress` | Student (Owner only), Admin (Analytics) | Student (Owner only) | Student (Owner only) |
| **Favorite Books** | `student_favorites` | Student (Owner only) | Student (Owner only) | Student (Owner only) |
| **Academic Portals** | `whitelisted_portals`| Public / Students / Admin | Admin | Admin |
| **Ingestion Submissions** | `pending_submissions`| Student (Self), Admin (All) | Student (Create), Admin (Review) | Admin only |
| **Notifications** | `notifications` | Recipient user or Role group | System / Admin / Automated events | Recipient user |
| **System Settings** | `system_settings` | Authenticated users | Admin only | None |
| **Audit Logs** | `audit_logs` | Admin only | Server background engine | Immutable (Retained for compliance) |

---

## 3. Concurrency, Conflict Resolution & Security Rules

1. **Optimistic Locking & Unique Constraints**:
   - Simultaneous physical book checkout is guarded by database row-level locking during the checkout transaction.
   - Reading progress and student favorites use atomic `ON CONFLICT (student_id, book_id) DO UPDATE` or unique index guarantees.
2. **Audit Logging**:
   - Every administrative modification (issuing loans, approving submissions, changing configurations, adding students) logs actor ID, action type, IP address, and timestamp to the central `audit_logs` table.
3. **Session Invalidation**:
   - If a user account is disabled or blocked on the server, subsequent API requests reject the JWT token with `403 USER_BLOCKED`, immediately logging out the client terminal.
