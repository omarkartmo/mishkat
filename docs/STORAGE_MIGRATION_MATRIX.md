# STORAGE_MIGRATION_MATRIX.md
# Mishkat Library Management System — StorageService Inventory & Migration Matrix (Phase 1.7.1)

## 1. Executive Summary

This matrix catalogs every public data-access method, property, and helper in `src/services/storageService.ts`, identifying its current consumers in the React application, its data source, the corresponding backend API endpoint, and the exact migration action required to transition the frontend to a pure REST API client architecture.

---

## 2. StorageService Method Inventory & Migration Mapping

| # | StorageService Operation | Current Caller(s) | Current Data Source | Existing API Endpoint | Required Migration Action | Migration Status |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `getPhysicalBooks()` | `App.tsx` (initial state & sync) | `BookRepository` -> Central API | `GET /api/v1/books?type=physical` | Migrated to `BookRepository.getPhysicalBooks()`. | **MIGRATED (Phase 1.7.3-B)** |
| **2** | `addPhysicalBook(book)` | `App.tsx` (`PhysicalLibraryView`) | `BookRepository` -> Central API | `POST /api/v1/books` | Migrated to `BookRepository.createPhysicalBook()`. | **MIGRATED (Phase 1.7.3-B)** |
| **3** | `updatePhysicalBook(id, updates)` | `App.tsx` (`PhysicalLibraryView`) | `BookRepository` -> Central API | `PUT /api/v1/books/:id` | Migrated to `BookRepository.updatePhysicalBook()`. | **MIGRATED (Phase 1.7.3-B)** |
| **4** | `deletePhysicalBook(id)` | `App.tsx` (`PhysicalLibraryView`) | `BookRepository` -> Central API | `DELETE /api/v1/books/:id` | Migrated to `BookRepository.deleteBook()`. Server checks active loans. | **MIGRATED (Phase 1.7.3-B)** |
| **5** | `getDigitalBooks()` | `App.tsx` (initial state & sync) | `BookRepository` -> Central API | `GET /api/v1/books?type=digital` | Migrated to `BookRepository.getDigitalBooks()`. | **MIGRATED (Phase 1.7.3-B)** |
| **6** | `addDigitalBook(book)` | `App.tsx` (`AddDigitalBookModal`, `BulkDigitalImportModal`, `ReviewQueueView`) | `BookRepository` -> Central API | `POST /api/v1/books` or `POST /api/v1/books/bulk` | Migrated to `BookRepository.createDigitalBook()` / `BookRepository.bulkImportDigitalBooks()`. | **MIGRATED (Phase 1.7.3-B)** |
| **7** | `incrementReadCount(bookId)` / `incrementDigitalReadCount(bookId)` | `App.tsx` (Digital Book Opening, Search result opening, Overview dashboard) | `BookRepository` -> Central API | `POST /api/v1/books/:id/increment-read` | Migrated to `BookRepository.incrementReadCount()`. | **MIGRATED (Phase 1.7.3-B)** |
| **8** | `getCategories()` (Category listing) | `App.tsx` (initial state & sync) | `CategoryRepository` -> Central API | `GET /api/v1/categories` | Migrated to `CategoryRepository.getCategories()`. | **MIGRATED (Phase 1.7.4 - Subtask 1)** |
| **9** | `addCategory(cat)` (Category creation) | `App.tsx` (`CategoryManagerView`) | `CategoryRepository` -> Central API | `POST /api/v1/categories` | Migrated to `CategoryRepository.createCategory()`. | **MIGRATED (Phase 1.7.4 - Subtask 1)** |
| **10** | `updateCategory(id, updates)` (Category update) | `App.tsx` (`CategoryManagerView`) | `CategoryRepository` -> Central API | `PUT /api/v1/categories/:id` | Migrated to `CategoryRepository.updateCategory()`. | **MIGRATED (Phase 1.7.4 - Subtask 1)** |
| **11** | `deleteCategory(id)` (Category deletion) | `CategoryRepository` | `CategoryRepository` -> Central API | `DELETE /api/v1/categories/:id` | Migrated to `CategoryRepository.deleteCategory()`. | **MIGRATED (Phase 1.7.4 - Subtask 1)** |
| **12** | `deleteCategoryWithReassign(catId, targetCatId)` (Category reassign) | `App.tsx` (`CategoryManagerView`) | `CategoryRepository` -> Central API | `POST /api/v1/categories/:id/reassign-delete` | Migrated to `CategoryRepository.reassignAndDeleteCategory()`. Server executes atomic reassignment. | **MIGRATED (Phase 1.7.4 - Subtask 1)** |
| **13** | `getLoans()` | `App.tsx` (initial state & sync) | `StorageService.loans` (In-memory) | `GET /api/v1/loans` | Migrated to `LoanRepository.getLoans()`. Filtered by student role automatically on server. | **MIGRATED (Phase 1.7 - Complete Loans)** |
| **14** | `checkStudentBorrowEligibility(studentId)` / `canStudentBorrow(studentId)` | `App.tsx` (`LoanManagerView`) | Computes from `StorageService.loans` and `StorageService.config` | Computed via `LoanRepository.checkEligibility()` | Migrated to `LoanRepository.checkEligibility(studentId, loans, users, config)`. | **MIGRATED (Phase 1.7 - Complete Loans)** |
| **15** | `createLoan(params)` | `App.tsx` (`LoanManagerView`) | `StorageService.loans`, `physicalBooks` | `POST /api/v1/loans` | Migrated to `apiClient.post('/loans', params)`. | **MIGRATED (Phase 1.7 - Loans)** |
| **16** | `extendLoan(loanId, days, notes)` | `App.tsx` (`LoanManagerView`) | `StorageService.loans` | `PUT /api/v1/loans/:id/extend` | Migrated to `apiClient.put('/loans/:id/extend', { additionalDays, notes })`. | **MIGRATED (Phase 1.7 - Loans)** |
| **17** | `returnLoan(loanId, notes)` / `returnBook(loanId, notes)` | `App.tsx` (`LoanManagerView`) | `StorageService.loans`, `physicalBooks` | `PUT /api/v1/loans/:id/return` | Migrated to `apiClient.put('/loans/:id/return', { notes })`. | **MIGRATED (Phase 1.7 - Loans)** |
| **18** | `getLoanRequests(studentId)` / `getPhysicalLoanRequests(studentId)` | `App.tsx` (initial state, `StudentPortalView`, `LoanManagerView`) | `StorageService.loanRequests` (In-memory) | `GET /api/v1/loan-requests` | Migrated to `LoanRequestRepository.getLoanRequests()`. Automatically filtered by role. | **MIGRATED (Phase 1.7 - Loan Requests)** |
| **19** | `requestPhysicalLoan(params)` | `App.tsx` (`StudentLoanRequestModal`, `PhysicalLibraryView`) | `StorageService.loanRequests` | `POST /api/v1/loan-requests` | Migrated to `LoanRequestRepository.createLoanRequest()`. | **MIGRATED (Phase 1.7 - Loan Requests)** |
| **20** | `approveLoanRequest(params)` | `App.tsx` (`LoanManagerView`) | `StorageService.loanRequests` | `POST /api/v1/loan-requests/:id/approve` | Migrated to `LoanRequestRepository.approveLoanRequest()`. | **MIGRATED (Phase 1.7 - Loan Requests)** |
| **21** | `rejectLoanRequest(requestId, reason)` | `App.tsx` (`LoanManagerView`) | `StorageService.loanRequests` | `POST /api/v1/loan-requests/:id/reject` | Migrated to `LoanRequestRepository.rejectLoanRequest()`. | **MIGRATED (Phase 1.7 - Loan Requests)** |
| **22** | `confirmHandoverLoanRequest(requestId)` | `App.tsx` (`LoanManagerView`) | `StorageService.loanRequests`, `loans`, `physicalBooks` | `POST /api/v1/loan-requests/:id/handover` | Migrated to `LoanRequestRepository.confirmHandover()`. Converts to active loan record. | **MIGRATED (Phase 1.7 - Loan Requests)** |
| **23** | `getNotifications(recipientId, role)` | `App.tsx` (initial state, `HeaderBar`) | `StorageService.notifications` (In-memory) | `GET /api/v1/notifications` | Migrated to `NotificationRepository.getNotifications()`. Automatically scoped to current user. | **MIGRATED (Phase 1.7 - Notifications)** |
| **24** | `addNotification(notif)` | Internal to `StorageService` loan actions | `StorageService.notifications` | Created server-side during loan events | Server automatically inserts notification during workflow actions. | **MIGRATED (Phase 1.7 - Notifications)** |
| **25** | `markNotificationAsRead(id)` | `App.tsx` (`HeaderBar`) | `StorageService.notifications` | `POST /api/v1/notifications/:id/read` | Migrated to `NotificationRepository.markAsRead()`. | **MIGRATED (Phase 1.7 - Notifications)** |
| **26** | `markAllNotificationsAsRead(recipientId, role)` | `App.tsx` (`HeaderBar`) | `StorageService.notifications` | `POST /api/v1/notifications/mark-all-read` | Migrated to `NotificationRepository.markAllAsRead()`. | **MIGRATED (Phase 1.7 - Notifications)** |
| **27** | `clearNotifications(recipientId, role)` | `App.tsx` (`HeaderBar`) | `StorageService.notifications` | `DELETE /api/v1/notifications/clear` | Migrated to `NotificationRepository.clearNotifications()`. | **MIGRATED (Phase 1.7 - Notifications)** |
| **28** | `getSearchHistory(studentId)` | `App.tsx` (Search history) | `StorageService.searchHistory` (In-memory map) | None (Transient UI session) | Keep in ephemeral React/Zustand session state or add server search history endpoint if required. | NOT MIGRATED |
| **29** | `addSearchHistory(studentId, query)` | `SearchResultsView.tsx` | `StorageService.searchHistory` | None (Transient UI session) | Keep in ephemeral React session state. | NOT MIGRATED |
| **30** | `removeSearchHistoryItem` / `clearSearchHistory` | `SearchResultsView.tsx` | `StorageService.searchHistory` | None (Transient UI session) | Keep in ephemeral React session state. | NOT MIGRATED |
| **31** | `getOpenBooks(studentId)` / `addOpenBook` / `closeOpenBook` | `App.tsx`, `StudentPortalView` | `StorageService.openBooks` (In-memory map) | None (Transient UI tabs) | Keep in ephemeral React state for active reading tabs. | NOT MIGRATED |
| **32** | `getStudents()` / `getUsers()` | `App.tsx` (initial state, `StudentManagerView`, `LoanManagerView`) | `StorageService.students` | `GET /api/v1/users` | Replace with `apiClient.get('/users')`. | NOT MIGRATED |
| **33** | `addStudent(student)` / `addUser(user)` | `App.tsx` (`StudentManagerView`) | `StorageService.students` | `POST /api/v1/users` | Replace with `apiClient.post('/users', user)`. | NOT MIGRATED |
| **34** | `importStudentsCSV(csv)` / `bulkImportStudents(roster)` | `App.tsx` (`StudentManagerView`) | `StorageService.students` | `POST /api/v1/users/roster-import` | Replace with `apiClient.post('/users/roster-import', { students: roster })`. | NOT MIGRATED |
| **35** | `updateStudent(id, updates)` | `App.tsx` (`StudentManagerView`) | `StorageService.students` | `PUT /api/v1/users/:id` | Replace with `apiClient.put('/users/:id', updates)`. | NOT MIGRATED |
| **36** | `resetUserPassword(studentId, newPassword)` | `App.tsx` (`StudentManagerView`) | `StorageService.students` | `POST /api/v1/users/:id/reset-password` | Replace with `apiClient.post('/users/:id/reset-password', { newPassword })`. | NOT MIGRATED |
| **37** | `getPortals()` | `App.tsx` (initial state, `WhitelistedPortalsView`) | `StorageService.portals` | `GET /api/v1/portals` | Replace with `apiClient.get('/portals')`. | NOT MIGRATED |
| **38** | `addPortal(portal)` / `addWhitelistedPortal(portal)` | `App.tsx` (`WhitelistedPortalsView`) | `StorageService.portals` | `POST /api/v1/portals` | Replace with `apiClient.post('/portals', portal)`. | NOT MIGRATED |
| **39** | `updatePortal(id, updates)` / `updateWhitelistedPortal(id, updates)` | `App.tsx` (`WhitelistedPortalsView`) | `StorageService.portals` | `PUT /api/v1/portals/:id` | Replace with `apiClient.put('/portals/:id', updates)`. | NOT MIGRATED |
| **40** | `deletePortal(id)` / `deleteWhitelistedPortal(id)` | `App.tsx` (`WhitelistedPortalsView`) | `StorageService.portals` | `DELETE /api/v1/portals/:id` | Replace with `apiClient.delete('/portals/:id')`. | NOT MIGRATED |
| **41** | `togglePortalFeatured(id)` | `App.tsx` (`WhitelistedPortalsView`) | `StorageService.portals` | `PUT /api/v1/portals/:id` | Replace with `apiClient.put('/portals/:id', { isFeatured: !current })`. | NOT MIGRATED |
| **42** | `getSubmissions()` | `App.tsx` (initial state, `ReviewQueueView`) | `StorageService.submissions` | `GET /api/v1/submissions` | Replace with `apiClient.get('/submissions')`. | NOT MIGRATED |
| **43** | `submitBookForReview(data)` / `addSubmission(data)` | `App.tsx` (`BookIngestionModal`) | `StorageService.submissions` | `POST /api/v1/submissions` | Replace with `apiClient.post('/submissions', data)`. | NOT MIGRATED |
| **44** | `approveSubmission(submissionId, categoryId)` | `App.tsx` (`ReviewQueueView`) | `StorageService.submissions`, `digitalBooks` | `POST /api/v1/submissions/:id/review` | Replace with `apiClient.post('/submissions/:id/review', { decision: 'approved', targetCategoryId })`. | NOT MIGRATED |
| **45** | `rejectSubmission(submissionId, reason)` | `App.tsx` (`ReviewQueueView`) | `StorageService.submissions` | `POST /api/v1/submissions/:id/review` | Replace with `apiClient.post('/submissions/:id/review', { decision: 'rejected', reason })`. | NOT MIGRATED |
| **46** | `getStudentFavorites(studentId)` / `getFavorites(studentId)` | `App.tsx` (initial state, `FavoritesView`, `DigitalLibraryView`, `PhysicalLibraryView`) | `StorageService.favorites` | `GET /api/v1/favorites` | Replace with `apiClient.get('/favorites')`. | NOT MIGRATED |
| **47** | `toggleFavorite(bookId, studentId)` | `App.tsx` (`FavoritesView`, Library views) | `StorageService.favorites` | `POST /api/v1/favorites/toggle` | Replace with `apiClient.post('/favorites/toggle', { bookId })`. | NOT MIGRATED |
| **48** | `getStudentNotes(studentId, bookId)` | `App.tsx` (initial state, `ReadingWorkspaceView`, `BookReaderModal`) | `StorageService.notes` | `GET /api/v1/notes` | Migrated to `NoteRepository.getNotes()`. Automatically scoped to current user. | **MIGRATED (Phase 1.7 - Notes)** |
| **49** | `addStudentNote(note)` | `App.tsx` (`NoteEditorModal`, `BookReaderModal`) | `StorageService.notes` | `POST /api/v1/notes` | Migrated to `NoteRepository.saveNote()`. | **MIGRATED (Phase 1.7 - Notes)** |
| **50** | `updateStudentNote(noteId, updates)` | `App.tsx` (`NoteEditorModal`) | `StorageService.notes` | `POST /api/v1/notes` | Migrated to `NoteRepository.saveNote()`. | **MIGRATED (Phase 1.7 - Notes)** |
| **51** | `deleteStudentNote(noteId)` | `App.tsx` (`ReadingWorkspaceView`, `BookReaderModal`) | `StorageService.notes` | `DELETE /api/v1/notes/:id` | Migrated to `NoteRepository.deleteNote()`. | **MIGRATED (Phase 1.7 - Notes)** |
| **52** | `getPhysicalBookmarks(studentId)` | `App.tsx` (initial state, `ReadingWorkspaceView`, `PhysicalBookmarkModal`) | `StorageService.physicalBookmarks` | `GET /api/v1/bookmarks` | Replace with `apiClient.get('/bookmarks')`. | NOT MIGRATED |
| **53** | `savePhysicalBookmark(data)` | `App.tsx` (`PhysicalBookmarkModal`, `BookReaderModal`) | `StorageService.physicalBookmarks` | `POST /api/v1/bookmarks` | Replace with `apiClient.post('/bookmarks', data)`. | NOT MIGRATED |
| **54** | `deletePhysicalBookmark(bookmarkId)` | `App.tsx` (`ReadingWorkspaceView`, `BookReaderModal`) | `StorageService.physicalBookmarks` | `DELETE /api/v1/bookmarks/:id` | Replace with `apiClient.delete('/bookmarks/:id')`. | NOT MIGRATED |
| **55** | `getBookSummaries(studentId, bookId)` | `App.tsx` (initial state, `ReadingWorkspaceView`, `BookSummaryModal`) | `StorageService.summaries` | `GET /api/v1/summaries` | Replace with `apiClient.get('/summaries')`. | NOT MIGRATED |
| **56** | `saveBookSummary(summary)` | `App.tsx` (`BookSummaryModal`) | `StorageService.summaries` | `POST /api/v1/summaries` | Replace with `apiClient.post('/summaries', summary)`. | NOT MIGRATED |
| **57** | `deleteBookSummary(summaryId)` | `App.tsx` (`ReadingWorkspaceView`) | `StorageService.summaries` | `DELETE /api/v1/summaries/:id` | Replace with `apiClient.delete('/summaries/:id')`. | NOT MIGRATED |
| **58** | `saveReadingProgress(progressData)` / `saveReadingProgressByBook(bookId, page, totalPages, studentId)` | `App.tsx` (`BookReaderModal`) | `StorageService.progress` | `POST /api/v1/reading-progress` | Replace with `apiClient.post('/reading-progress', { bookId, currentPage, totalPages })`. | NOT MIGRATED |
| **59** | `getReadingProgress(bookId, studentId)` / `getReadingProgressMap(studentId)` | `App.tsx` (initial state, `OverviewDashboard`, `StudentPortalView`) | `StorageService.progress` | `GET /api/v1/reading-progress` | Replace with `apiClient.get('/reading-progress')`. | NOT MIGRATED |
| **60** | `dismissReadingProgress(bookId, studentId)` | `App.tsx` (`OverviewDashboard`, `StudentPortalView`) | `StorageService.progress` | `POST /api/v1/reading-progress/dismiss` | Replace with `apiClient.post('/reading-progress/dismiss', { bookId })`. | NOT MIGRATED |
| **61** | `clearCompletedReading(studentId)` | `App.tsx` (`OverviewDashboard`, `StudentPortalView`) | `StorageService.progress` | `POST /api/v1/reading-progress/clear-completed` | Replace with `apiClient.post('/reading-progress/clear-completed')`. | NOT MIGRATED |
| **62** | `getConfig()` | `App.tsx` (initial state, `SystemSettingsView`, `LoanManagerView`) | `StorageService.config` | `GET /api/v1/settings` | Replace with `apiClient.get('/settings')`. | NOT MIGRATED |
| **63** | `updateConfig(updates)` / `saveConfig(config)` | `App.tsx` (`SystemSettingsView`) | `StorageService.config` | `PUT /api/v1/settings` | Centralized via `apiClient.put('/settings', config)`. | **MIGRATED (Phase 1.7.1)** |
| **64** | `isAuthenticated()` / `getCurrentUser()` / `setCurrentUser(user)` | `App.tsx`, `Sidebar.tsx`, `HeaderBar.tsx` | `StorageService.currentUser`, `authenticated` | `GET /api/v1/auth/me` | Use React `AuthContext` backed by `authRepository.getCurrentUser()` (`GET /api/v1/auth/me`). | **MIGRATED (Phase 1.7.2)** |
| **65** | `loginUser(regNumber, password)` | `App.tsx` (`LoginView`) | In-memory lookup / `POST /api/v1/auth/login` | `POST /api/v1/auth/login` | Centralized via `AuthRepository.login()` / `AuthContext.login()` calling `POST /api/v1/auth/login`. | **MIGRATED (Phase 1.7.2)** |
| **66** | `logout()` | `App.tsx` (`HeaderBar`) | Sets `currentUser` to guest | `POST /api/v1/auth/logout` | Centralized via `AuthRepository.logout()` / `AuthContext.logout()` calling `POST /api/v1/auth/logout` and purging JWT. | **MIGRATED (Phase 1.7.2)** |
| **67** | `exportDatabaseJSON()` | `App.tsx` (`SystemSettingsView`) | Serializes all in-memory arrays | `GET /api/v1/system/backup` (Admin only) | Query server backup endpoint to download database dump. | NOT MIGRATED |
| **68** | `resetToDefaults()` | `App.tsx` (`SystemSettingsView`) | Resets in-memory arrays to `INITIAL_*` constants | `POST /api/v1/system/reset-demo` | Call administrative server reset endpoint. | NOT MIGRATED |

---

## 3. Detailed Consumer File Breakdown

| File Path | Component / Layer | StorageService Method(s) Called via Props/State | Purpose & User Impact |
| :--- | :--- | :--- | :--- |
| `src/App.tsx` | Main Application Root Container | Holds single `StorageService` instance; executes `syncWithServer()`; binds 68 action handlers to UI views. | Primary hub distributing state and data mutations. |
| `src/components/auth/LoginView.tsx` | Authentication Screen | Receives `onLogin(regNumber, password)` -> calls `storage.loginUser()` | Authenticates students and administrators. |
| `src/components/common/HeaderBar.tsx` | Navigation & Notification Header | Receives `notifications`, `onMarkRead`, `onMarkAllRead`, `onClearAll`, `onLogout` | Manages notification dropdown and session termination. |
| `src/components/common/Sidebar.tsx` | Main Navigation Drawer | Reads `currentUser.role` for navigation item filtering | Controls UI menu visibility based on RBAC role. |
| `src/components/dashboard/OverviewDashboard.tsx` | Admin & Student Overview Dashboard | Receives `categories`, `physicalBooks`, `digitalBooks`, `loans`, `readingProgress`, `onOpenBook` | Displays library metrics, recent activity, and active reading. |
| `src/components/physical/PhysicalLibraryView.tsx` | Physical Book Catalog & Management | Receives `books`, `categories`, `onAddBook`, `onUpdateBook`, `onDeleteBook`, `onRequestLoan` | Manages physical book inventory, shelves, and checkout requests. |
| `src/components/physical/StudentLoanRequestModal.tsx` | Physical Book Loan Request Dialog | Receives `onSubmitLoanRequest` -> calls `storage.requestPhysicalLoan()` | Submits student physical book borrow requests. |
| `src/components/digital/DigitalLibraryView.tsx` | Digital Book Catalog & PDF/EPUB Viewer | Receives `digitalBooks`, `categories`, `onOpenReader`, `onToggleFavorite` | Browses digital collection and launches reader modal. |
| `src/components/digital/BulkDigitalImportModal.tsx` | Batch Digital Ingestion Modal | Receives `onImportBatch` -> calls `storage.addDigitalBook()` | Ingests batches of digital books from preset catalogs. |
| `src/components/circulation/LoanManagerView.tsx` | Circulation Desk Management | Receives `loans`, `loanRequests`, `onCheckStudentEligibility`, `onCreateLoan`, `onExtendLoan`, `onReturnLoan`, `onApproveRequest`, `onRejectRequest`, `onHandoverRequest` | Complete desk for loan issuance, renewals, returns, and requests. |
| `src/components/students/StudentManagerView.tsx` | Student Roster & Account Administration | Receives `students`, `onAddStudent`, `onBulkImportStudents`, `onResetPassword` | Manages student profiles, registration IDs, and password resets. |
| `src/components/admin/CategoryManagerView.tsx` | Category Taxonomy Management | Receives `categories`, `onAddCategory`, `onUpdateCategory`, `onDeleteCategoryWithReassign` | Maintains category hierarchy with book reassignment on deletion. |
| `src/components/admin/ReviewQueueView.tsx` | Book Submission Ingestion Queue | Receives `submissions`, `onApproveSubmission`, `onRejectSubmission` | Approves or rejects student/staff digital book submissions. |
| `src/components/admin/SystemSettingsView.tsx` | Library Rules & Config View | Receives `config`, `onSaveConfig`, `onExportBackup`, `onResetDatabase` | Edits loan policies, max borrow limits, fines, and system resets. |
| `src/components/portals/WhitelistedPortalsView.tsx` | Academic Educational Portal Explorer | Receives `portals`, `onAddPortal`, `onUpdatePortal`, `onDeletePortal`, `onToggleFeatured` | Manages whitelisted educational links and resources. |
| `src/components/portals/BookIngestionModal.tsx` | Book Proposal Submission Modal | Receives `onSubmit` -> calls `storage.addSubmission()` | Submits new book proposals for admin review. |
| `src/components/favorites/FavoritesView.tsx` | Saved Bookmarked Books View | Receives `favorites`, `physicalBooks`, `digitalBooks`, `onToggleFavorite` | Displays student starred/favorite catalog items. |
| `src/components/reader/BookReaderModal.tsx` | In-App PDF & EPUB Reading Engine | Reads/Writes bookmarks via `/api/v1/bookmarks` & calls `onSaveReadingProgress` | Provides book reader with page tracking, bookmarks, and notes. |
| `src/components/reading/ReadingWorkspaceView.tsx` | Student Personal Workspace View | Receives `notes`, `bookmarks`, `summaries`, `onDeleteNote`, `onDeleteBookmark`, `onDeleteSummary` | Displays student reading portfolio, bookmarks, and summaries. |
| `src/components/reading/NoteEditorModal.tsx` | Note Creation & Editing Dialog | Receives `onSave` -> calls `storage.addStudentNote()` | Writes personal study notes linked to books and chapters. |
| `src/components/reading/PhysicalBookmarkModal.tsx` | Physical Book Marker Dialog | Receives `onSave` -> calls `storage.savePhysicalBookmark()` | Tracks current page in physical paper books. |
| `src/components/reading/BookSummaryModal.tsx` | Book Summary & Analysis Dialog | Receives `onSave` -> calls `storage.saveBookSummary()` | Records comprehensive book analysis and reviews. |
| `src/components/search/SearchResultsView.tsx` | Universal Search & Filter Engine | Receives filtered books, `categories`, `onOpenBook`, `onToggleFavorite` | Performs faceted keyword, category, and type searching. |
| `src/components/student/StudentPortalView.tsx` | Student Personal Portal View | Receives active loans, requests, reading progress, and recommendations | Displays personal borrowed books, due dates, and reading status. |

---

## 4. API Gaps Analysis

A thorough audit of `server/routes/*.routes.ts` against all UI workflows and `StorageService` functions reveals the backend API coverage status:

| Feature / Operation | Current API Availability | Required Endpoint & Method | Status |
| :--- | :--- | :--- | :--- |
| **System Backup Export** | No administrative endpoint to export full database dump as JSON | `GET /api/v1/system/backup` (Admin only) | **API GAP** |
| **System Reset to Defaults** | Seed script exists on server start, but no runtime HTTP endpoint for admin reset | `POST /api/v1/system/reset-demo` (Admin only) | **API GAP** |
| **Batch Reclassify Books** | Must loop `PUT /api/v1/books/:id` individually | `POST /api/v1/books/batch-reclassify` (Optional optimization) | Minor Optimization |
| **Search Queries & Facets** | Handled via query params on `GET /api/v1/books?query=...` | Fully supported on server | Covered |
| **All Other Entities (Books, Users, Loans, Requests, Notes, Summaries, Progress, Portals, Submissions, Settings, Bookmarks)** | Fully implemented with authentication & RBAC middleware | `GET/POST/PUT/DELETE /api/v1/*` | Covered |

---

## 5. Synchronization Flow (`syncWithServer`)

```text
                                  +-----------------------------+
                                  |      App Initialization     |
                                  |          (App.tsx)          |
                                  +-----------------------------+
                                                 |
                                                 v
                                  +-----------------------------+
                                  |    storage.syncWithServer()  |
                                  +-----------------------------+
                                                 |
                       +-------------------------+-------------------------+
                       |                         |                         |
                       v                         v                         v
              GET /api/v1/books        GET /api/v1/categories       GET /api/v1/loans
                       |                         |                         |
                       v                         v                         v
           GET /api/v1/loan-requests   GET /api/v1/portals        GET /api/v1/settings
                       |                         |                         |
                       v                         v                         v
              GET /api/v1/users       GET /api/v1/submissions     GET /api/v1/summaries
                       |                         |                         |
                       v                         v                         v
              GET /api/v1/notes       GET /api/v1/bookmarks    GET /api/v1/reading-progress
                       |                         |                         |
                       +-------------------------+-------------------------+
                                                 |
                                                 v
                       +---------------------------------------------------+
                       |          Populate StorageService in-memory        |
                       |       collections (No localStorage writes)       |
                       +---------------------------------------------------+
                                                 |
                                                 v
                       +---------------------------------------------------+
                       |        App.tsx re-renders with fresh server       |
                       |               authoritative dataset               |
                       +---------------------------------------------------+
```

### Analysis of `syncWithServer()`:
1. **Invocation**: Executed once on `App.tsx` initial mount (`useEffect([], [])`).
2. **Endpoints Contacted**: 12 parallel GET endpoints under `/api/v1/*`.
3. **Data Updated**: Overwrites `StorageService` in-memory fields (`categories`, `physicalBooks`, `digitalBooks`, `loans`, `loanRequests`, `portals`, `config`, `students`, `summaries`, `notes`, `physicalBookmarks`, `progress`).
4. **Storage Persistence**: Does **NOT** write to `localStorage` or `sessionStorage` (strictly in-memory).
5. **Failure Fallback**: If the server is offline or unreachable, `syncWithServer()` catches errors, logs `[StorageService] Error during server sync`, and retains the initial fallback dataset in memory with an offline warning displayed to the user.
