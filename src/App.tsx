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
import { useAuth } from './context/AuthContext';
import { categoryRepository } from './services/categoryRepository';
import { bookRepository } from './services/bookRepository';
import { apiClient } from './services/apiClient';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function App() {
  const { user: authUser, isAuthenticated, isLoading, login, logout, setUser: setAuthUser } = useAuth();
  const [storage] = useState(() => StorageService.getInstance());

  // Application State derived from Server Authenticated User
  const currentUser: User = authUser || storage.getCurrentUser();
  const [activeTab, setActiveTab] = useState<NavigationTab>(() =>
    currentUser?.role === 'student' ? 'student_portal' : 'overview'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [isCategoriesLoading, setIsCategoriesLoading] = useState(false);

  // Server-authoritative Books State (Phase 1.7.3-B)
  const [physicalBooks, setPhysicalBooks] = useState<PhysicalBook[]>([]);
  const [digitalBooks, setDigitalBooks] = useState<DigitalBook[]>([]);
  const [isBooksLoading, setIsBooksLoading] = useState(false);
  const [booksError, setBooksError] = useState<string | null>(null);

  const [loans, setLoans] = useState<LoanRecord[]>(() => storage.getLoans());
  const [submissions, setSubmissions] = useState<PendingBookSubmission[]>(() => storage.getSubmissions());
  const [users, setUsers] = useState<User[]>(() => storage.getUsers());
  const [portals, setPortals] = useState<WhitelistedPortal[]>(() => storage.getPortals());
  const [config, setConfig] = useState<SystemConfig>(() => storage.getConfig());
  const [loanRequests, setLoanRequests] = useState(() => storage.getLoanRequests());
  const [notifications, setNotifications] = useState(() =>
    currentUser ? storage.getNotifications(currentUser.id, currentUser.role) : []
  );
  const [readingProgress, setReadingProgress] = useState<Record<string, { currentPage: number; totalPages: number; lastReadAt?: string; percentage?: number; isCompleted?: boolean }>>(() =>
    currentUser ? storage.getReadingProgressMap(currentUser.id) : {}
  );
  const [studentNotes, setStudentNotes] = useState<StudentNote[]>(() => currentUser ? storage.getStudentNotes(currentUser.id) : []);
  const [physicalBookmarks, setPhysicalBookmarks] = useState<any[]>(() => currentUser ? storage.getPhysicalBookmarks(currentUser.id) : []);
  const [bookSummaries, setBookSummaries] = useState<any[]>(() => currentUser ? storage.getBookSummaries(currentUser.id) : []);
  const [favorites, setFavorites] = useState<string[]>(() => currentUser ? storage.getFavorites(currentUser.id) : []);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Load server-authoritative categories
  const loadCategories = async () => {
    setIsCategoriesLoading(true);
    try {
      const res = await categoryRepository.getCategories();
      if (res.success && res.data) {
        setCategories(res.data);
        setCategoryError(null);
      } else {
        setCategoryError(res.error?.message || 'تعذر استرجاع قائمة التصنيفات من الخادم المركزي.');
      }
    } catch (err: any) {
      setCategoryError(err?.message || 'تعذر الاتصال بالخادم المركزي لاسترجاع التصنيفات.');
    } finally {
      setIsCategoriesLoading(false);
    }
  };

  // Load server-authoritative books (Phase 1.7.3-B)
  const loadBooks = async () => {
    setIsBooksLoading(true);
    try {
      const [physRes, digRes] = await Promise.all([
        bookRepository.getPhysicalBooks(),
        bookRepository.getDigitalBooks(),
      ]);

      if (physRes.success && Array.isArray(physRes.data)) {
        setPhysicalBooks(physRes.data);
      }
      if (digRes.success && Array.isArray(digRes.data)) {
        setDigitalBooks(digRes.data);
      }

      if (!physRes.success || !digRes.success) {
        const errMsg = physRes.error?.message || digRes.error?.message || 'تعذر استرجاع فهرس الكتب من الخادم المركزي.';
        setBooksError(errMsg);
      } else {
        setBooksError(null);
      }
    } catch (err: any) {
      setBooksError(err?.message || 'تعذر الاتصال بالخادم المركزي لاسترجاع بيانات الكتب.');
    } finally {
      setIsBooksLoading(false);
    }
  };

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

  // Helper to refresh legacy client storage domains (Loans, Notes, Portals, etc.)
  const refreshLegacyStorageState = (targetUser?: User) => {
    setLoans(storage.getLoans());
    setSubmissions(storage.getSubmissions());
    setUsers(storage.getUsers());
    setPortals(storage.getPortals());
    setConfig(storage.getConfig());
    setLoanRequests(storage.getLoanRequests());
    const curr = targetUser || authUser || storage.getCurrentUser();
    if (curr) {
      setNotifications(storage.getNotifications(curr.id, curr.role));
      setReadingProgress(storage.getReadingProgressMap(curr.id));
      setStudentNotes(storage.getStudentNotes(curr.id));
      setPhysicalBookmarks(storage.getPhysicalBookmarks(curr.id));
      setBookSummaries(storage.getBookSummaries(curr.id));
      setFavorites(storage.getFavorites(curr.id));
    }
  };

  // Re-sync all state helper (Server-Authoritative Book/Category Catalog + Legacy Storage Domains)
  const refreshAllState = (targetUser?: User) => {
    loadCategories();
    loadBooks();
    refreshLegacyStorageState(targetUser);
  };

  // Synchronize with Central Server on mount
  useEffect(() => {
    loadCategories();
    loadBooks();
    storage.syncWithServer().then(() => {
      refreshLegacyStorageState();
    });
  }, []);

  // Update tab if authenticated user role changes
  useEffect(() => {
    if (authUser) {
      setActiveTab(authUser.role === 'student' ? 'student_portal' : 'overview');
      refreshLegacyStorageState(authUser);
    }
  }, [authUser?.id, authUser?.role]);

  // Login handler for First Window Gateway (Central Server API)
  const handleLogin = async (regNumber: string, password?: string) => {
    const res = await login(regNumber, password);
    if (res.success && res.user) {
      setActiveTab(res.user.role === 'student' ? 'student_portal' : 'overview');
      refreshAllState(res.user);
    }
    return res;
  };

  // Secure Logout handler (Central Server API)
  const handleLogout = async () => {
    await logout();
  };

  // Switch Active User / Role with strict RBAC enforcement
  const handleUserChange = (user: User) => {
    setAuthUser(user);
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

  // Circulation Actions (Phase 1.7 - Loans Migration)
  const handleCreateLoan = async (params: {
    bookId: string;
    studentId: string;
    purpose: LoanPurpose;
    customDurationDays?: number;
    notes?: string;
    isOverrideExemption?: boolean;
    overrideReason?: string;
  }) => {
    try {
      const res = await apiClient.post<LoanRecord>('/loans', params);
      if (res.success) {
        await storage.syncWithServer();
        refreshAllState();
      } else {
        alert(res.error?.message || 'تعذر تسجيل الإعارة في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تسجيل الإعارة.');
    }
  };

  const handleExtendLoan = async (loanId: string, additionalDays: number, notes?: string) => {
    try {
      const res = await apiClient.put(`/loans/${loanId}/extend`, { additionalDays, notes });
      if (res.success) {
        await storage.syncWithServer();
        refreshAllState();
      } else {
        alert(res.error?.message || 'تعذر تمديد الإعارة في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تمديد الإعارة.');
    }
  };

  const handleReturnBook = async (loanId: string, notes?: string) => {
    try {
      const res = await apiClient.put(`/loans/${loanId}/return`, { notes });
      if (res.success) {
        await storage.syncWithServer();
        refreshAllState();
      } else {
        alert(res.error?.message || 'تعذر تسجيل الإرجاع في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تسجيل الإرجاع.');
    }
  };

  // Book Ingestion Submission
  const handleSubmitIngestion = (submissionData: any) => {
    storage.addSubmission(submissionData);
    refreshAllState();
  };

  // Server-Authoritative Book Operations (Phase 1.7.3-B)
  const handleAddPhysicalBook = async (book: Omit<PhysicalBook, 'id' | 'addedAt' | 'availableCopies'>) => {
    try {
      const res = await bookRepository.createPhysicalBook(book);
      if (res.success) {
        await loadBooks();
      } else {
        alert(res.error?.message || 'فشل إضافة الكتاب الورقي في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء إضافة الكتاب.');
    }
  };

  const handleUpdatePhysicalBook = async (id: string, updates: Partial<PhysicalBook>) => {
    try {
      const res = await bookRepository.updatePhysicalBook(id, updates);
      if (res.success) {
        await loadBooks();
      } else {
        alert(res.error?.message || 'فشل تحديث بيانات الكتاب في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تحديث بيانات الكتاب.');
    }
  };

  const handleDeletePhysicalBook = async (id: string) => {
    try {
      const res = await bookRepository.deleteBook(id);
      if (res.success) {
        await loadBooks();
      } else {
        alert(res.error?.message || 'فشل حذف الكتاب من الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء حذف الكتاب.');
    }
  };

  const handleAddDigitalBook = async (book: Omit<DigitalBook, 'id' | 'addedAt' | 'downloadCount' | 'readCount'>) => {
    try {
      const res = await bookRepository.createDigitalBook(book);
      if (res.success) {
        await loadBooks();
      } else {
        alert(res.error?.message || 'فشل إضافة الكتاب الرقمي في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء إضافة الكتاب الرقمي.');
    }
  };

  // Bulk add digital books via BookRepository
  const handleBulkAddDigitalBooks = async (newBooks: Omit<DigitalBook, 'id' | 'addedAt' | 'downloadCount' | 'readCount'>[]) => {
    try {
      const res = await bookRepository.bulkImportDigitalBooks(newBooks);
      if (res.success) {
        await loadBooks();
      } else {
        alert(res.error?.message || 'فشل استيراد حزمة الكتب الرقمية.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء استيراد الكتب الرقمية.');
    }
  };

  const handleOpenDigitalReader = (book: DigitalBook) => {
    bookRepository.incrementReadCount(book.id).catch(() => {});
    setDigitalBooks((prev) =>
      prev.map((b) => (b.id === book.id ? { ...b, readCount: (b.readCount || 0) + 1 } : b))
    );
    setActiveReadingBook(book);
  };

  // Admin Approval Queue Actions
  const handleApproveSubmission = async (submissionId: string, categoryId?: string) => {
    const sub = submissions.find((s) => s.id === submissionId);
    if (sub) {
      const catId = categoryId || sub.suggestedCategoryId;
      await bookRepository.createDigitalBook({
        title: sub.title,
        author: sub.author,
        categoryId: catId,
        format: sub.format,
        fileSize: '8.5 MB',
        pagesCount: sub.pagesEstimated || 250,
        sourceOrigin: sub.sourcePortalName,
        summary: sub.summary,
        tags: ['مرفوع من الطالب', sub.sourcePortalName],
        uploadedBy: sub.studentId,
      });
    }
    storage.approveSubmission(submissionId, categoryId);
    await loadBooks();
    refreshAllState();
  };

  const handleRejectSubmission = (submissionId: string, reason: string) => {
    storage.rejectSubmission(submissionId, reason);
    refreshAllState();
  };

  // Category Server-Authoritative Operations (Phase 1.7.3-A)
  const handleAddCategory = async (cat: Omit<Category, 'id'>) => {
    const res = await categoryRepository.createCategory({
      name: cat.name,
      nameEn: cat.nameEn,
      description: cat.description,
      color: cat.color,
      iconName: cat.iconName || 'FolderTree',
    });
    if (res.success) {
      await loadCategories();
    } else {
      throw new Error(res.error?.message || 'فشل إضافة التصنيف في الخادم المركزي.');
    }
  };

  const handleUpdateCategory = async (id: string, updates: Partial<Category>) => {
    const res = await categoryRepository.updateCategory(id, {
      name: updates.name,
      nameEn: updates.nameEn,
      description: updates.description,
      color: updates.color,
      iconName: updates.iconName,
    });
    if (res.success) {
      await loadCategories();
    } else {
      throw new Error(res.error?.message || 'فشل تحديث التصنيف في الخادم المركزي.');
    }
  };

  const handleDeleteCategoryWithReassign = async (categoryId: string, targetCategoryId: string) => {
    const res = await categoryRepository.reassignAndDeleteCategory(categoryId, targetCategoryId);
    if (res.success) {
      await Promise.all([loadCategories(), loadBooks()]);
      return {
        success: true,
        reassignedPhysicalCount: physicalBooks.filter((b) => b.categoryId === categoryId).length,
        reassignedDigitalCount: digitalBooks.filter((b) => b.categoryId === categoryId).length,
      };
    } else {
      return {
        success: false,
        error: res.error?.message || 'فشل حذف التصنيف وإعادة توجيه الكتب في الخادم المركزي.',
        reassignedPhysicalCount: 0,
        reassignedDigitalCount: 0,
      };
    }
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

  // Central Server Settings Mutation (Phase 1.7 - Subtask 1)
  const handleSaveConfig = async (updated: SystemConfig) => {
    try {
      const res = await apiClient.put('/settings', updated);
      if (res.success) {
        const savedConfig = res.data?.config || updated;
        setConfig(savedConfig);
        storage.saveConfig(savedConfig);
      } else {
        alert(res.error?.message || 'فشل حفظ إعدادات النظام في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err?.message || 'حدث خطأ أثناء الاتصال بالخادم المركزي لحفظ الإعدادات.');
    }
  };

  // Counts for sidebar badges
  const overdueLoansCount = (loans || []).filter((l) => l.status === 'overdue').length;
  const pendingSubmissionsCount = (submissions || []).filter((s) => s.status === 'pending').length;
  const studentsList = (users || []).filter((u) => u.role === 'student');

  // If verifying session with Central Server, show clean loading state
  if (isLoading) {
    return (
      <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex items-center justify-center font-sans selection:bg-indigo-500 selection:text-white" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">جاري التحقق من الجلسة مع الخادم المركزي...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, render First Window Login Screen
  if (!isAuthenticated || !currentUser) {
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
          onOpenBookReader={handleOpenDigitalReader}
          onOpenPhysicalBookmark={(book) => {
            const bm = physicalBookmarks.find((b) => b.bookId === book.id);
            setActivePhysicalBookmarkModal({
              isOpen: true,
              book: book,
              bookmark: bm || null,
            });
          }}
        />

        {/* Global Error Banner for Central Server Catalog Sync */}
        {booksError && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 flex items-center justify-between gap-3 text-amber-400 text-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{booksError}</span>
            </div>
            <button
              onClick={() => loadBooks()}
              className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg font-medium flex items-center gap-1 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        )}

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
              onOpenBookReader={handleOpenDigitalReader}
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
              onAddBook={handleAddPhysicalBook}
              onUpdateBook={handleUpdatePhysicalBook}
              onDeleteBook={handleDeletePhysicalBook}
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
              onOpenReader={handleOpenDigitalReader}
              onAddDigitalBook={handleAddDigitalBook}
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
              error={categoryError}
              isLoading={isCategoriesLoading}
              onRefresh={loadCategories}
              onAddCategory={handleAddCategory}
              onUpdateCategory={handleUpdateCategory}
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
              onOpenReader={handleOpenDigitalReader}
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
              onOpenDigitalBook={handleOpenDigitalReader}
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
              onOpenReader={handleOpenDigitalReader}
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
              onOpenReader={handleOpenDigitalReader}
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
              onAddDigitalBook={handleAddDigitalBook}
              onBulkAddDigitalBooks={handleBulkAddDigitalBooks}
            />
          )}

          {activeTab === 'settings' && currentUser.role === 'admin' && (
            <SystemSettingsView
              config={config}
              onSaveConfig={handleSaveConfig}
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
