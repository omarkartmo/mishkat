import React, { useState, useEffect } from 'react';
import { StorageService } from './services/storageService';
import {
  NavigationTab,
  User,
  PhysicalBook,
  DigitalBook,
  Category,
  LoanRecord,
  PendingBookSubmission,
  SystemConfig,
  WhitelistedPortal,
  StudentNote,
  ReadingProgress,
  LoanPurpose,
} from './types/library';

// Components
import { HeaderBar } from './components/common/HeaderBar';
import { Sidebar } from './components/common/Sidebar';
import { OverviewDashboard } from './components/dashboard/OverviewDashboard';
import { PhysicalLibraryView } from './components/physical/PhysicalLibraryView';
import { LoanManagerView } from './components/circulation/LoanManagerView';
import { DigitalLibraryView } from './components/digital/DigitalLibraryView';
import { BookReaderModal } from './components/reader/BookReaderModal';
import { WhitelistedPortalsView } from './components/portals/WhitelistedPortalsView';
import { ReviewQueueView } from './components/admin/ReviewQueueView';
import { StudentManagerView } from './components/students/StudentManagerView';
import { CategoryManagerView } from './components/admin/CategoryManagerView';
import { StudentPortalView } from './components/student/StudentPortalView';
import { SystemSettingsView } from './components/admin/SystemSettingsView';
import { FavoritesView } from './components/favorites/FavoritesView';
import { ReadingWorkspaceView } from './components/reading/ReadingWorkspaceView';
import { PhysicalBookmarkModal } from './components/reading/PhysicalBookmarkModal';
import { SearchResultsView } from './components/search/SearchResultsView';
import { LoginView } from './components/auth/LoginView';

export default function App() {
  const [storage] = useState(() => StorageService.getInstance());

  // Authentication State (First Window Gateway)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => storage.isAuthenticated());

  // Application State
  const [currentUser, setCurrentUser] = useState<User>(() => storage.getCurrentUser());
  const [activeTab, setActiveTab] = useState<NavigationTab>(() =>
    currentUser.role === 'student' ? 'student_portal' : 'overview'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [categories, setCategories] = useState<Category[]>(() => storage.getCategories());
  const [physicalBooks, setPhysicalBooks] = useState<PhysicalBook[]>(() => storage.getPhysicalBooks());
  const [digitalBooks, setDigitalBooks] = useState<DigitalBook[]>(() => storage.getDigitalBooks());
  const [loans, setLoans] = useState<LoanRecord[]>(() => storage.getLoans());
  const [submissions, setSubmissions] = useState<PendingBookSubmission[]>(() => storage.getSubmissions());
  const [users, setUsers] = useState<User[]>(() => storage.getUsers());
  const [portals, setPortals] = useState<WhitelistedPortal[]>(() => storage.getPortals());
  const [config, setConfig] = useState<SystemConfig>(() => storage.getConfig());
  const [loanRequests, setLoanRequests] = useState(() => storage.getLoanRequests());
  const [notifications, setNotifications] = useState(() =>
    storage.getNotifications(currentUser.id, currentUser.role)
  );
  const [readingProgress, setReadingProgress] = useState<Record<string, { currentPage: number; totalPages: number; lastReadAt?: string; percentage?: number; isCompleted?: boolean }>>(() =>
    storage.getReadingProgressMap(currentUser.id)
  );
  const [studentNotes, setStudentNotes] = useState<StudentNote[]>(() => storage.getStudentNotes(currentUser.id));
  const [physicalBookmarks, setPhysicalBookmarks] = useState<any[]>(() => storage.getPhysicalBookmarks(currentUser.id));
  const [bookSummaries, setBookSummaries] = useState<any[]>(() => storage.getBookSummaries(currentUser.id));
  const [favorites, setFavorites] = useState<string[]>(() => storage.getFavorites(currentUser.id));
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Quick physical bookmark modal triggered from student portal or physical library
  const [activePhysicalBookmarkModal, setActivePhysicalBookmarkModal] = useState<{
    isOpen: boolean;
    book?: PhysicalBook | null;
    bookmark?: any | null;
  }>({ isOpen: false });

  // In-App Reader State
  const [activeReadingBook, setActiveReadingBook] = useState<DigitalBook | null>(null);

  // Quick Loan Modal Trigger from other views
  const [isNewLoanModalOpen, setIsNewLoanModalOpen] = useState(false);
  const [preSelectedBookId, setPreSelectedBookId] = useState<string | undefined>(undefined);

  // Re-sync all state helper
  const refreshAllState = () => {
    setCategories(storage.getCategories());
    setPhysicalBooks(storage.getPhysicalBooks());
    setDigitalBooks(storage.getDigitalBooks());
    setLoans(storage.getLoans());
    setSubmissions(storage.getSubmissions());
    setUsers(storage.getUsers());
    setPortals(storage.getPortals());
    setConfig(storage.getConfig());
    setLoanRequests(storage.getLoanRequests());
    const curr = storage.getCurrentUser();
    setCurrentUser(curr);
    setNotifications(storage.getNotifications(curr.id, curr.role));
    setReadingProgress(storage.getReadingProgressMap(curr.id));
    setStudentNotes(storage.getStudentNotes(curr.id));
    setPhysicalBookmarks(storage.getPhysicalBookmarks(curr.id));
    setBookSummaries(storage.getBookSummaries(curr.id));
    setFavorites(storage.getFavorites(curr.id));
  };

  // Synchronize with Central Server on mount
  useEffect(() => {
    storage.syncWithServer().then(() => {
      refreshAllState();
    });
  }, []);

  // Login handler for First Window Gateway
  const handleLogin = (regNumber: string, password?: string) => {
    const res = storage.loginUser(regNumber, password);
    if (res.success && res.user) {
      setIsAuthenticated(true);
      setCurrentUser(res.user);
      setActiveTab(res.user.role === 'student' ? 'student_portal' : 'overview');
      refreshAllState();
    }
    return res;
  };

  // Secure Logout handler
  const handleLogout = () => {
    storage.logout();
    setIsAuthenticated(false);
  };

  // Switch Active User / Role with strict RBAC enforcement
  const handleUserChange = (user: User) => {
    storage.setCurrentUser(user);
    setCurrentUser(user);
    const adminOnlyTabs: NavigationTab[] = ['overview', 'loans', 'reviews', 'students', 'categories', 'settings'];
    if (user.role === 'student' && adminOnlyTabs.includes(activeTab)) {
      setActiveTab('student_portal');
    } else if (user.role === 'admin' && activeTab === 'student_portal') {
      setActiveTab('overview');
    }
    setNotifications(storage.getNotifications(user.id, user.role));
    setReadingProgress(storage.getReadingProgressMap(user.id));
    setStudentNotes(storage.getStudentNotes(user.id));
    setPhysicalBookmarks(storage.getPhysicalBookmarks(user.id));
    setBookSummaries(storage.getBookSummaries(user.id));
    setFavorites(storage.getFavorites(user.id));
  };

  const handleNavigateToTab = (tab: NavigationTab) => {
    setIsMobileMenuOpen(false);
    if (currentUser.role === 'student') {
      const adminTabs: NavigationTab[] = ['overview', 'loans', 'reviews', 'students', 'categories', 'settings'];
      if (adminTabs.includes(tab)) {
        setActiveTab('student_portal');
        return;
      }
    } else if (currentUser.role === 'admin') {
      if (tab === 'student_portal') {
        setActiveTab('overview');
        return;
      }
    }
    setActiveTab(tab);
  };

  // Quick Loan action from Physical Library
  const handleQuickLoanFromBook = (bookId: string) => {
    setPreSelectedBookId(bookId);
    setIsNewLoanModalOpen(true);
    setActiveTab('loans');
  };

  // Student loan request
  const handleRequestLoanSubmit = (params: {
    bookId: string;
    studentId: string;
    purpose: string;
    customReason?: string;
    requestedDurationDays?: number;
  }) => {
    try {
      storage.requestPhysicalLoan(params);
      refreshAllState();
    } catch (err: any) {
      alert(err.message || 'تعذر إرسال طلب الاستعارة');
    }
  };

  // Admin loan request processing
  const handleApproveLoanRequest = (requestId: string, durationDays: number) => {
    try {
      storage.approveLoanRequest({ requestId, durationDays });
      refreshAllState();
    } catch (err: any) {
      alert(err.message || 'تعذر الموافقة على الطلب');
    }
  };

  const handleRejectLoanRequest = (requestId: string, reason: string) => {
    try {
      storage.rejectLoanRequest(requestId, reason);
      refreshAllState();
    } catch (err: any) {
      alert(err.message || 'تعذر رفض الطلب');
    }
  };

  const handleConfirmHandoverLoanRequest = (requestId: string) => {
    try {
      storage.confirmHandoverLoanRequest(requestId);
      refreshAllState();
    } catch (err: any) {
      alert(err.message || 'تعذر تأكيد تسليم الكتاب وتحديث المخزون');
    }
  };

  // Notification actions
  const handleMarkNotificationRead = (id: string) => {
    storage.markNotificationAsRead(id);
    setNotifications(storage.getNotifications(currentUser.id, currentUser.role));
  };

  const handleMarkAllNotificationsRead = () => {
    storage.markAllNotificationsAsRead(currentUser.id, currentUser.role);
    setNotifications(storage.getNotifications(currentUser.id, currentUser.role));
  };

  const handleClearNotifications = () => {
    storage.clearNotifications(currentUser.id, currentUser.role);
    setNotifications(storage.getNotifications(currentUser.id, currentUser.role));
  };

  // Circulation Actions
  const handleCreateLoan = (params: {
    bookId: string;
    studentId: string;
    purpose: LoanPurpose;
    customDurationDays?: number;
    notes?: string;
    isOverrideExemption?: boolean;
    overrideReason?: string;
  }) => {
    try {
      storage.createLoan(params);
      refreshAllState();
    } catch (err: any) {
      alert(err.message || 'تعذر تسجيل الإعارة');
    }
  };

  const handleExtendLoan = (loanId: string, additionalDays: number, notes?: string) => {
    try {
      storage.extendLoan(loanId, additionalDays, notes);
      refreshAllState();
    } catch (err: any) {
      alert(err.message || 'تعذر تمديد الإعارة');
    }
  };

  const handleReturnBook = (loanId: string, notes?: string) => {
    try {
      storage.returnLoan(loanId, notes);
      refreshAllState();
    } catch (err: any) {
      alert(err.message || 'تعذر تسجيل الإرجاع');
    }
  };

  // Book Ingestion Submission
  const handleSubmitIngestion = (submissionData: any) => {
    storage.addSubmission(submissionData);
    refreshAllState();
  };

  // Bulk add digital books
  const handleBulkAddDigitalBooks = (newBooks: Omit<DigitalBook, 'id' | 'addedAt' | 'downloadCount' | 'readCount'>[]) => {
    newBooks.forEach((b) => {
      storage.addDigitalBook(b);
    });
    refreshAllState();
  };

  // Admin Approval Queue Actions
  const handleApproveSubmission = (submissionId: string, categoryId?: string) => {
    storage.approveSubmission(submissionId, categoryId);
    refreshAllState();
  };

  const handleRejectSubmission = (submissionId: string, reason: string) => {
    storage.rejectSubmission(submissionId, reason);
    refreshAllState();
  };

  // Category Safe Delete with Reassign
  const handleDeleteCategoryWithReassign = (categoryId: string, targetCategoryId: string) => {
    const res = storage.deleteCategoryWithReassign(categoryId, targetCategoryId);
    refreshAllState();
    return res;
  };

  // Reader Progress Save
  const handleSaveReaderProgress = (page: number, totalPages: number) => {
    if (!activeReadingBook) return;
    storage.saveReadingProgressByBook(activeReadingBook.id, page, totalPages, currentUser.id);
    setReadingProgress(storage.getReadingProgressMap(currentUser.id));
  };

  // Reading Notes
  const handleAddNote = (note: Omit<StudentNote, 'id' | 'createdAt'>) => {
    storage.addStudentNote({ ...note, studentId: currentUser.id });
    setStudentNotes(storage.getStudentNotes(currentUser.id));
  };

  const handleUpdateNote = (noteId: string, updates: Partial<StudentNote>) => {
    storage.updateStudentNote(noteId, updates);
    setStudentNotes(storage.getStudentNotes(currentUser.id));
  };

  const handleDeleteNote = (noteId: string) => {
    storage.deleteStudentNote(noteId);
    setStudentNotes(storage.getStudentNotes(currentUser.id));
  };

  // Physical Bookmarks Handlers
  const handleSavePhysicalBookmark = (data: any) => {
    storage.savePhysicalBookmark({ ...data, studentId: currentUser.id });
    setPhysicalBookmarks(storage.getPhysicalBookmarks(currentUser.id));
  };

  const handleDeletePhysicalBookmark = (bookmarkId: string) => {
    storage.deletePhysicalBookmark(bookmarkId);
    setPhysicalBookmarks(storage.getPhysicalBookmarks(currentUser.id));
  };

  // Book Summaries Handlers
  const handleSaveBookSummary = (summaryData: any) => {
    storage.saveBookSummary({ ...summaryData, studentId: currentUser.id });
    setBookSummaries(storage.getBookSummaries(currentUser.id));
  };

  const handleDeleteBookSummary = (summaryId: string) => {
    storage.deleteBookSummary(summaryId);
    setBookSummaries(storage.getBookSummaries(currentUser.id));
  };

  // Favorite toggle
  const handleToggleFavorite = (bookId: string) => {
    storage.toggleFavorite(bookId, currentUser.id);
    setFavorites(storage.getFavorites(currentUser.id));
  };

  // Reading progress dismiss & clear completed
  const handleDismissReadingProgress = (bookId: string) => {
    storage.dismissReadingProgress(bookId, currentUser.id);
    setReadingProgress(storage.getReadingProgressMap(currentUser.id));
  };

  const handleClearCompletedProgress = () => {
    storage.clearCompletedReading(currentUser.id);
    setReadingProgress(storage.getReadingProgressMap(currentUser.id));
  };

  // Export JSON Database
  const handleExportData = () => {
    const dataStr = storage.exportDatabaseJSON();
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `almanara_library_backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Reset to seed data
  const handleResetData = () => {
    storage.resetToDefaults();
    refreshAllState();
  };

  // Counts for sidebar badges
  const overdueLoansCount = (loans || []).filter((l) => l.status === 'overdue').length;
  const pendingSubmissionsCount = (submissions || []).filter((s) => s.status === 'pending').length;
  const studentsList = (users || []).filter((u) => u.role === 'student');

  // If not authenticated, render First Window Login Screen
  if (!isAuthenticated) {
    return <LoginView config={config} onLogin={handleLogin} users={users} />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased font-sans select-none transition-colors relative">
      {/* Mobile & Tablet Sidebar Overlay Backdrop */}
      {isMobileMenuOpen && (
        <div
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden animate-in fade-in duration-200"
          aria-hidden="true"
        />
      )}

      {/* Navigation Sidebar: Desktop Static + Mobile/Tablet Slide-over Drawer */}
      <div
        className={`fixed inset-y-0 right-0 z-50 lg:static lg:z-auto transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        <Sidebar
          activeTab={activeTab}
          onSelectTab={handleNavigateToTab}
          userRole={currentUser.role}
          overdueLoansCount={overdueLoansCount}
          pendingReviewsCount={pendingSubmissionsCount}
          favoritesCount={favorites.length}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />
      </div>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-slate-950 transition-all duration-300 min-w-0">
        {/* Desktop Header Bar with Role Switcher, Notification Dropdown & Theme Toggle */}
        <HeaderBar
          currentUser={currentUser}
          allUsers={users}
          onUserChange={handleUserChange}
          onLogout={handleLogout}
          config={config}
          libraryName={config?.libraryName}
          schoolName={config?.schoolName}
          activeTab={activeTab}
          overdueCount={overdueLoansCount}
          pendingCount={pendingSubmissionsCount}
          notifications={notifications}
          onMarkNotificationRead={handleMarkNotificationRead}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
          onClearNotifications={handleClearNotifications}
          onNavigateToTab={handleNavigateToTab}
          searchQuery={searchQuery}
          onQuickSearch={(query) => setSearchQuery(query)}
          onNavigateToSearchResults={(query) => {
            setSearchQuery(query);
            setActiveTab('search_results');
          }}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={() => setIsMobileMenuOpen((prev) => !prev)}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          physicalBooks={physicalBooks}
          digitalBooks={digitalBooks}
          categories={categories}
          onOpenBookReader={(book) => {
            storage.incrementDigitalReadCount(book.id);
            setActiveReadingBook(book);
          }}
          onOpenPhysicalBookmark={(book) => {
            const bm = physicalBookmarks.find((b) => b.bookId === book.id);
            setActivePhysicalBookmarkModal({
              isOpen: true,
              book: book,
              bookmark: bm || null,
            });
          }}
        />

        {/* Dynamic Screen View Container */}
        <main className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950/95 scroll-smooth">
          {activeTab === 'overview' && currentUser.role === 'admin' && (
            <OverviewDashboard
              currentUser={currentUser}
              physicalBooks={physicalBooks}
              digitalBooks={digitalBooks}
              loans={loans}
              categories={categories}
              users={users}
              submissions={submissions}
              physicalBookmarks={physicalBookmarks}
              readingProgress={readingProgress}
              onNavigate={handleNavigateToTab}
              onQuickLoan={() => {
                setPreSelectedBookId(undefined);
                setIsNewLoanModalOpen(true);
                setActiveTab('loans');
              }}
              onOpenBookReader={(book) => {
                storage.incrementDigitalReadCount(book.id);
                setActiveReadingBook(book);
              }}
              onOpenPhysicalBookmark={(bookmark, loan) => {
                const book = physicalBooks.find((p) => p.id === (loan?.bookId || bookmark?.bookId));
                setActivePhysicalBookmarkModal({
                  isOpen: true,
                  book: book || null,
                  bookmark: bookmark || null,
                });
              }}
              onOpenNewPhysicalBookmark={() => {
                setActivePhysicalBookmarkModal({
                  isOpen: true,
                  book: null,
                  bookmark: null,
                });
              }}
            />
          )}

          {activeTab === 'physical' && (
            <PhysicalLibraryView
              books={physicalBooks}
              categories={categories}
              userRole={currentUser.role}
              currentUser={currentUser}
              favoriteBookIds={favorites}
              systemConfig={config}
              onToggleFavorite={handleToggleFavorite}
              onRequestLoanSubmit={handleRequestLoanSubmit}
              onOpenPhysicalBookmark={(book) => {
                const bm = physicalBookmarks.find((b) => b.bookId === book.id);
                setActivePhysicalBookmarkModal({
                  isOpen: true,
                  book: book,
                  bookmark: bm || null,
                });
              }}
              onAddBook={(newBook) => {
                storage.addPhysicalBook(newBook);
                refreshAllState();
              }}
              onUpdateBook={(id, updates) => {
                storage.updatePhysicalBook(id, updates);
                refreshAllState();
              }}
              onDeleteBook={(id) => {
                storage.deletePhysicalBook(id);
                refreshAllState();
              }}
              onIssueLoanForBook={(book) => {
                handleQuickLoanFromBook(book.id);
              }}
              onQuickLoan={handleQuickLoanFromBook}
            />
          )}

          {activeTab === 'loans' && currentUser.role === 'admin' && (
            <LoanManagerView
              loans={loans}
              loanRequests={loanRequests}
              physicalBooks={physicalBooks}
              students={studentsList}
              config={config}
              currentUser={currentUser}
              onApproveLoanRequest={handleApproveLoanRequest}
              onRejectLoanRequest={handleRejectLoanRequest}
              onConfirmHandoverLoanRequest={handleConfirmHandoverLoanRequest}
              onCreateLoan={handleCreateLoan}
              onExtendLoan={handleExtendLoan}
              onReturnBook={handleReturnBook}
              onCheckStudentEligibility={(studentId) => storage.canStudentBorrow(studentId)}
              isNewLoanModalOpen={isNewLoanModalOpen}
              setIsNewLoanModalOpen={setIsNewLoanModalOpen}
              preSelectedBookId={preSelectedBookId}
            />
          )}

          {activeTab === 'digital' && (
            <DigitalLibraryView
              books={digitalBooks}
              categories={categories}
              userRole={currentUser.role}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              onOpenReader={(book) => {
                storage.incrementDigitalReadCount(book.id);
                setActiveReadingBook(book);
              }}
              onAddDigitalBook={(newBook) => {
                storage.addDigitalBook(newBook);
                refreshAllState();
              }}
              onBulkAddDigitalBooks={handleBulkAddDigitalBooks}
            />
          )}

          {activeTab === 'portals' && (
            <WhitelistedPortalsView
              portals={portals}
              currentUser={currentUser}
              categories={categories}
              onSubmitIngestion={handleSubmitIngestion}
              onAddPortal={(portal) => {
                storage.addWhitelistedPortal(portal);
                refreshAllState();
              }}
              onDeletePortal={(id) => {
                storage.deleteWhitelistedPortal(id);
                refreshAllState();
              }}
              onUpdatePortal={(id, updates) => {
                storage.updateWhitelistedPortal(id, updates);
                refreshAllState();
              }}
              onToggleFeatured={(id) => {
                storage.togglePortalFeatured(id);
                refreshAllState();
              }}
            />
          )}

          {activeTab === 'reviews' && currentUser.role === 'admin' && (
            <ReviewQueueView
              submissions={submissions}
              categories={categories}
              onApprove={handleApproveSubmission}
              onReject={handleRejectSubmission}
            />
          )}

          {activeTab === 'students' && currentUser.role === 'admin' && (
            <StudentManagerView
              students={studentsList}
              onAddStudent={(newStudent) => {
                storage.addUser(newStudent);
                refreshAllState();
              }}
              onBulkImportStudents={(roster) => {
                const res = storage.bulkImportStudents(roster);
                refreshAllState();
                return res;
              }}
              onResetStudentPassword={(studentId, newPass) => {
                const pass = storage.resetUserPassword(studentId, newPass);
                refreshAllState();
                return pass;
              }}
            />
          )}

          {activeTab === 'categories' && currentUser.role === 'admin' && (
            <CategoryManagerView
              categories={categories}
              physicalBooks={physicalBooks}
              digitalBooks={digitalBooks}
              onAddCategory={(cat) => {
                storage.addCategory(cat);
                refreshAllState();
              }}
              onUpdateCategory={(id, updates) => {
                storage.updateCategory(id, updates);
                refreshAllState();
              }}
              onDeleteCategoryWithReassign={handleDeleteCategoryWithReassign}
            />
          )}

          {activeTab === 'student_portal' && currentUser.role === 'student' && (
            <StudentPortalView
              currentUser={currentUser}
              loans={loans}
              digitalBooks={digitalBooks}
              readingProgress={readingProgress}
              notes={studentNotes}
              submissions={submissions}
              physicalBookmarks={physicalBookmarks}
              onOpenReader={(book) => {
                storage.incrementDigitalReadCount(book.id);
                setActiveReadingBook(book);
              }}
              onNavigate={handleNavigateToTab}
              onDismissProgress={handleDismissReadingProgress}
              onClearCompletedProgress={handleClearCompletedProgress}
              onOpenPhysicalBookmark={(bookmark, loan) => {
                const book = physicalBooks.find((p) => p.id === (loan?.bookId || bookmark?.bookId));
                setActivePhysicalBookmarkModal({
                  isOpen: true,
                  book: book || null,
                  bookmark: bookmark || null,
                });
              }}
            />
          )}

          {activeTab === 'reading_workspace' && (
            <ReadingWorkspaceView
              currentUser={currentUser}
              summaries={bookSummaries}
              notes={studentNotes}
              physicalBooks={physicalBooks}
              digitalBooks={digitalBooks}
              onSaveSummary={handleSaveBookSummary}
              onDeleteSummary={handleDeleteBookSummary}
              onSaveNote={(noteData) => {
                if (noteData.id) {
                  handleUpdateNote(noteData.id, noteData);
                } else {
                  handleAddNote(noteData);
                }
              }}
              onDeleteNote={handleDeleteNote}
              onOpenDigitalBook={(book) => {
                storage.incrementDigitalReadCount(book.id);
                setActiveReadingBook(book);
              }}
              onNavigateTab={handleNavigateToTab}
            />
          )}

          {activeTab === 'favorites' && (
            <FavoritesView
              favoriteBookIds={favorites}
              physicalBooks={physicalBooks}
              digitalBooks={digitalBooks}
              categories={categories}
              currentUser={currentUser}
              systemConfig={config}
              onToggleFavorite={handleToggleFavorite}
              onOpenReader={(book) => {
                storage.incrementDigitalReadCount(book.id);
                setActiveReadingBook(book);
              }}
              onRequestLoanSubmit={handleRequestLoanSubmit}
              onNavigate={handleNavigateToTab}
            />
          )}

          {activeTab === 'search_results' && (
            <SearchResultsView
              initialQuery={searchQuery}
              physicalBooks={physicalBooks}
              digitalBooks={digitalBooks}
              categories={categories}
              currentUser={currentUser}
              favoriteBookIds={favorites}
              onToggleFavorite={handleToggleFavorite}
              onOpenReader={(book) => {
                storage.incrementDigitalReadCount(book.id);
                setActiveReadingBook(book);
              }}
              onOpenPhysicalBookmark={(book) => {
                const bm = physicalBookmarks.find((b) => b.bookId === book.id);
                setActivePhysicalBookmarkModal({
                  isOpen: true,
                  book: book,
                  bookmark: bm || null,
                });
              }}
              onRequestLoanSubmit={handleRequestLoanSubmit}
              onQuickLoan={handleQuickLoanFromBook}
              onNavigateTab={handleNavigateToTab}
              onAddDigitalBook={(newBook) => {
                storage.addDigitalBook(newBook);
                refreshAllState();
              }}
              onBulkAddDigitalBooks={handleBulkAddDigitalBooks}
            />
          )}

          {activeTab === 'settings' && currentUser.role === 'admin' && (
            <SystemSettingsView
              config={config}
              onSaveConfig={(updated) => {
                storage.saveConfig(updated);
                refreshAllState();
              }}
              onExportData={handleExportData}
              onResetData={handleResetData}
            />
          )}
        </main>
      </div>

      {/* Modern In-App Book Reader Modal */}
      {activeReadingBook && (
        <BookReaderModal
          book={activeReadingBook}
          initialPage={readingProgress[activeReadingBook.id]?.currentPage || 1}
          onClose={() => setActiveReadingBook(null)}
          onSaveProgress={handleSaveReaderProgress}
          notes={studentNotes}
          onAddNote={handleAddNote}
          onDeleteNote={handleDeleteNote}
        />
      )}

      {/* Global Physical Bookmark Modal */}
      {activePhysicalBookmarkModal.isOpen && (
        <PhysicalBookmarkModal
          isOpen={activePhysicalBookmarkModal.isOpen}
          onClose={() => setActivePhysicalBookmarkModal({ isOpen: false, book: null, bookmark: null })}
          book={activePhysicalBookmarkModal.book}
          existingBookmark={activePhysicalBookmarkModal.bookmark}
          physicalBooks={physicalBooks}
          onSave={handleSavePhysicalBookmark}
          onDelete={handleDeletePhysicalBookmark}
        />
      )}
    </div>
  );
}
