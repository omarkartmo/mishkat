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
  PhysicalLoanRequest,
  AppNotification,
  PhysicalBookmark,
  BookSummary,
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
import { loanRepository } from './services/loanRepository';
import { loanRequestRepository } from './services/loanRequestRepository';
import { notificationRepository } from './services/notificationRepository';
import { noteRepository } from './services/noteRepository';
import { bookmarkRepository } from './services/bookmarkRepository';
import { summaryRepository } from './services/summaryRepository';
import { favoriteRepository } from './services/favoriteRepository';
import { readingProgressRepository } from './services/readingProgressRepository';
import { submissionRepository } from './services/submissionRepository';
import { portalRepository } from './services/portalRepository';
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

  // Server-authoritative Loans State (Phase 1.7 - Complete Loans Migration)
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [isLoansLoading, setIsLoansLoading] = useState(false);
  const [loansError, setLoansError] = useState<string | null>(null);

  // Server-authoritative Loan Requests State (Phase 1.7 - Loan Requests Migration)
  const [loanRequests, setLoanRequests] = useState<PhysicalLoanRequest[]>([]);
  const [isLoanRequestsLoading, setIsLoanRequestsLoading] = useState(false);
  const [loanRequestsError, setLoanRequestsError] = useState<string | null>(null);

  // Server-authoritative Notifications State (Phase 1.7 - Notifications Migration)
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotificationsLoading, setIsNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  // Server-authoritative Student Notes State (Phase 1.7 - Notes Migration)
  const [studentNotes, setStudentNotes] = useState<StudentNote[]>([]);
  const [isNotesLoading, setIsNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  // Server-authoritative Physical Bookmarks State (Phase 1.7 - Bookmarks Migration)
  const [physicalBookmarks, setPhysicalBookmarks] = useState<PhysicalBookmark[]>([]);
  const [isBookmarksLoading, setIsBookmarksLoading] = useState(false);
  const [bookmarksError, setBookmarksError] = useState<string | null>(null);

  // Server-authoritative Book Summaries State (Phase 1.7 - Summaries Migration)
  const [bookSummaries, setBookSummaries] = useState<BookSummary[]>([]);
  const [isSummariesLoading, setIsSummariesLoading] = useState(false);
  const [summariesError, setSummariesError] = useState<string | null>(null);

  // Server-authoritative Favorites State (Phase 1.7 - Favorites Migration)
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isFavoritesLoading, setIsFavoritesLoading] = useState(false);
  const [favoritesError, setFavoritesError] = useState<string | null>(null);

  // Server-authoritative Reading Progress State (Phase 1.7 - Reading Progress Migration)
  const [readingProgress, setReadingProgress] = useState<Record<string, ReadingProgress>>({});
  const [isReadingProgressLoading, setIsReadingProgressLoading] = useState(false);
  const [readingProgressError, setReadingProgressError] = useState<string | null>(null);

  // Server-authoritative Submissions State (Phase 1.7 - Submissions Migration)
  const [submissions, setSubmissions] = useState<PendingBookSubmission[]>([]);
  const [isSubmissionsLoading, setIsSubmissionsLoading] = useState(false);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);

  // Server-authoritative Academic Portals State (Phase 6.1 - Portals Migration)
  const [portals, setPortals] = useState<WhitelistedPortal[]>([]);
  const [isPortalsLoading, setIsPortalsLoading] = useState(false);
  const [portalsError, setPortalsError] = useState<string | null>(null);

  const [users, setUsers] = useState<User[]>(() => storage.getUsers());
  const [config, setConfig] = useState<SystemConfig>(() => storage.getConfig());
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

  // Load server-authoritative loans (Phase 1.7 - Complete Loans Migration)
  const loadLoans = async () => {
    setIsLoansLoading(true);
    try {
      const res = await loanRepository.getLoans();
      if (res.success && Array.isArray(res.data)) {
        setLoans(res.data);
        setLoansError(null);
      } else {
        setLoansError(res.error?.message || 'تعذر استرجاع سجل الإعارات من الخادم المركزي.');
      }
    } catch (err: any) {
      setLoansError(err?.message || 'تعذر الاتصال بالخادم المركزي لاسترجاع بيانات الإعارات.');
    } finally {
      setIsLoansLoading(false);
    }
  };

  // Load server-authoritative loan requests (Phase 1.7 - Loan Requests Migration)
  const loadLoanRequests = async () => {
    setIsLoanRequestsLoading(true);
    try {
      const res = await loanRequestRepository.getLoanRequests();
      if (res.success && Array.isArray(res.data)) {
        setLoanRequests(res.data);
        setLoanRequestsError(null);
      } else {
        setLoanRequestsError(res.error?.message || 'تعذر استرجاع طلبات الإعارة من الخادم المركزي.');
      }
    } catch (err: any) {
      setLoanRequestsError(err?.message || 'تعذر الاتصال بالخادم المركزي لاسترجاع بيانات طلبات الإعارة.');
    } finally {
      setIsLoanRequestsLoading(false);
    }
  };

  // Load server-authoritative notifications (Phase 1.7 - Notifications Migration)
  const loadNotifications = async () => {
    setIsNotificationsLoading(true);
    try {
      const res = await notificationRepository.getNotifications();
      if (res.success && Array.isArray(res.data)) {
        setNotifications(res.data);
        setNotificationsError(null);
      } else {
        setNotificationsError(res.error?.message || 'تعذر استرجاع الإشعارات من الخادم المركزي.');
      }
    } catch (err: any) {
      setNotificationsError(err?.message || 'تعذر الاتصال بالخادم المركزي لاسترجاع بيانات الإشعارات.');
    } finally {
      setIsNotificationsLoading(false);
    }
  };

  // Load server-authoritative notes (Phase 1.7 - Notes Migration)
  const loadNotes = async () => {
    setIsNotesLoading(true);
    try {
      const res = await noteRepository.getNotes();
      if (res.success && Array.isArray(res.data)) {
        setStudentNotes(res.data);
        setNotesError(null);
      } else {
        setNotesError(res.error?.message || 'تعذر استرجاع الفوائد والتدوينات من الخادم المركزي.');
      }
    } catch (err: any) {
      setNotesError(err?.message || 'تعذر الاتصال بالخادم المركزي لاسترجاع بيانات التدوينات.');
    } finally {
      setIsNotesLoading(false);
    }
  };

  // Load server-authoritative bookmarks (Phase 1.7 - Bookmarks Migration)
  const loadBookmarks = async () => {
    setIsBookmarksLoading(true);
    try {
      const res = await bookmarkRepository.getBookmarks();
      if (res.success && Array.isArray(res.data)) {
        setPhysicalBookmarks(res.data);
        setBookmarksError(null);
      } else {
        setBookmarksError(res.error?.message || 'تعذر استرجاع فواصل القراءة من الخادم المركزي.');
      }
    } catch (err: any) {
      setBookmarksError(err?.message || 'تعذر الاتصال بالخادم المركزي لاسترجاع بيانات الفواصل.');
    } finally {
      setIsBookmarksLoading(false);
    }
  };

  // Load server-authoritative summaries (Phase 1.7 - Summaries Migration)
  const loadSummaries = async () => {
    setIsSummariesLoading(true);
    try {
      const res = await summaryRepository.getSummaries();
      if (res.success && Array.isArray(res.data)) {
        setBookSummaries(res.data);
        setSummariesError(null);
      } else {
        setSummariesError(res.error?.message || 'تعذر استرجاع ملخصات الكتب من الخادم المركزي.');
      }
    } catch (err: any) {
      setSummariesError(err?.message || 'تعذر الاتصال بالخادم المركزي لاسترجاع بيانات الملخصات.');
    } finally {
      setIsSummariesLoading(false);
    }
  };

  // Load server-authoritative favorites (Phase 1.7 - Favorites Migration)
  const loadFavorites = async () => {
    setIsFavoritesLoading(true);
    try {
      const res = await favoriteRepository.getFavorites();
      if (res.success && Array.isArray(res.data)) {
        setFavorites(res.data);
        setFavoritesError(null);
      } else {
        setFavoritesError(res.error?.message || 'تعذر استرجاع المفضلة من الخادم المركزي.');
      }
    } catch (err: any) {
      setFavoritesError(err?.message || 'تعذر الاتصال بالخادم المركزي لاسترجاع بيانات المفضلة.');
    } finally {
      setIsFavoritesLoading(false);
    }
  };

  // Load server-authoritative reading progress (Phase 1.7 - Reading Progress Migration)
  const loadReadingProgress = async () => {
    setIsReadingProgressLoading(true);
    try {
      const res = await readingProgressRepository.getReadingProgressMap();
      if (res.success && res.data) {
        setReadingProgress(res.data);
        setReadingProgressError(null);
      } else {
        setReadingProgressError(res.error?.message || 'تعذر استرجاع سجل متابعة القراءة من الخادم المركزي.');
      }
    } catch (err: any) {
      setReadingProgressError(err?.message || 'تعذر الاتصال بالخادم المركزي لاسترجاع بيانات متابعة القراءة.');
    } finally {
      setIsReadingProgressLoading(false);
    }
  };

  // Load server-authoritative submissions (Phase 1.7 - Submissions Migration)
  const loadSubmissions = async () => {
    setIsSubmissionsLoading(true);
    try {
      const res = await submissionRepository.getSubmissions();
      if (res.success && Array.isArray(res.data)) {
        setSubmissions(res.data);
        setSubmissionsError(null);
      } else {
        setSubmissionsError(res.error?.message || 'تعذر استرجاع قائمة الاقتراحات من الخادم المركزي.');
      }
    } catch (err: any) {
      setSubmissionsError(err?.message || 'تعذر الاتصال بالخادم المركزي لاسترجاع بيانات الاقتراحات.');
    } finally {
      setIsSubmissionsLoading(false);
    }
  };

  // Load server-authoritative portals (Phase 6.1 - Portals Migration)
  const loadPortals = async () => {
    setIsPortalsLoading(true);
    try {
      const res = await portalRepository.getPortals();
      if (res.success && Array.isArray(res.data)) {
        setPortals(res.data);
        setPortalsError(null);
      } else {
        setPortalsError(res.error?.message || 'تعذر استرجاع بوابات المعرفة من الخادم المركزي.');
      }
    } catch (err: any) {
      setPortalsError(err?.message || 'تعذر الاتصال بالخادم المركزي لاسترجاع بوابات المعرفة.');
    } finally {
      setIsPortalsLoading(false);
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

  // Helper to refresh legacy client storage domains (Config, Users)
  const refreshLegacyStorageState = (targetUser?: User) => {
    setUsers(storage.getUsers());
    setConfig(storage.getConfig());
  };

  // Re-sync all state helper (Server-Authoritative Catalog + Legacy Storage Domains)
  const refreshAllState = (targetUser?: User) => {
    loadCategories();
    loadBooks();
    loadLoans();
    loadLoanRequests();
    loadNotifications();
    loadNotes();
    loadBookmarks();
    loadSummaries();
    loadFavorites();
    loadReadingProgress();
    loadSubmissions();
    loadPortals();
    refreshLegacyStorageState(targetUser);
  };

  // Synchronize with Central Server on mount
  useEffect(() => {
    loadCategories();
    loadBooks();
    loadLoans();
    loadLoanRequests();
    loadNotifications();
    loadNotes();
    loadBookmarks();
    loadSummaries();
    loadFavorites();
    loadReadingProgress();
    loadSubmissions();
    loadPortals();
    storage.syncWithServer().then(() => {
      refreshLegacyStorageState();
    });
  }, []);

  // Update tab and reload server-authoritative data if authenticated user changes
  useEffect(() => {
    if (authUser) {
      setActiveTab(authUser.role === 'student' ? 'student_portal' : 'overview');
      loadLoans();
      loadLoanRequests();
      loadNotifications();
      loadNotes();
      loadBookmarks();
      loadSummaries();
      loadFavorites();
      loadReadingProgress();
      loadSubmissions();
      loadPortals();
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
    loadNotifications();
    loadNotes();
    loadBookmarks();
    loadSummaries();
    loadFavorites();
    loadReadingProgress();
    loadSubmissions();
    loadPortals();
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

  // Student loan request (Phase 1.7 - Loan Requests Migration)
  const handleRequestLoanSubmit = async (params: {
    bookId: string;
    studentId: string;
    purpose: string;
    customReason?: string;
    requestedDurationDays?: number;
  }) => {
    try {
      const res = await loanRequestRepository.createLoanRequest({
        bookId: params.bookId,
        purpose: params.purpose,
        customReason: params.customReason,
        requestedDurationDays: params.requestedDurationDays,
      });
      if (res.success) {
        await loadLoanRequests();
      } else {
        alert(res.error?.message || 'تعذر إرسال طلب الاستعارة إلى الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء إرسال طلب الاستعارة.');
    }
  };

  // Admin loan request processing (Phase 1.7 - Loan Requests Migration)
  const handleApproveLoanRequest = async (requestId: string, durationDays: number) => {
    try {
      const res = await loanRequestRepository.approveLoanRequest(requestId, {
        approvedDurationDays: durationDays,
      });
      if (res.success) {
        await loadLoanRequests();
      } else {
        alert(res.error?.message || 'تعذر اعتماد طلب الاستعارة في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء الموافقة على الطلب.');
    }
  };

  const handleRejectLoanRequest = async (requestId: string, reason: string) => {
    try {
      const res = await loanRequestRepository.rejectLoanRequest(requestId, {
        rejectionReason: reason,
      });
      if (res.success) {
        await loadLoanRequests();
      } else {
        alert(res.error?.message || 'تعذر رفض طلب الاستعارة في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء رفض الطلب.');
    }
  };

  const handleConfirmHandoverLoanRequest = async (requestId: string) => {
    try {
      const res = await loanRequestRepository.confirmHandover(requestId);
      if (res.success) {
        await Promise.all([loadLoanRequests(), loadLoans(), loadBooks()]);
      } else {
        alert(res.error?.message || 'تعذر تأكيد تسليم الكتاب وتحديث السجلات في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تأكيد تسليم الكتاب.');
    }
  };

  // Notification actions (Phase 1.7 - Notifications Migration)
  const handleMarkNotificationRead = async (id: string) => {
    try {
      const res = await notificationRepository.markAsRead(id);
      if (res.success) {
        await loadNotifications();
      } else {
        alert(res.error?.message || 'تعذر تحديث حالة الإشعار في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تحديث حالة الإشعار.');
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      const res = await notificationRepository.markAllAsRead();
      if (res.success) {
        await loadNotifications();
      } else {
        alert(res.error?.message || 'تعذر تحديث حالة جميع الإشعارات في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تحديث حالة الإشعارات.');
    }
  };

  const handleClearNotifications = async () => {
    try {
      const res = await notificationRepository.clearNotifications();
      if (res.success) {
        await loadNotifications();
      } else {
        alert(res.error?.message || 'تعذر حذف الإشعارات في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء حذف الإشعارات.');
    }
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
      const res = await loanRepository.createLoan(params);
      if (res.success) {
        await Promise.all([loadLoans(), loadBooks()]);
      } else {
        alert(res.error?.message || 'تعذر تسجيل الإعارة في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تسجيل الإعارة.');
    }
  };

  const handleExtendLoan = async (loanId: string, additionalDays: number, notes?: string) => {
    try {
      const res = await loanRepository.extendLoan(loanId, { additionalDays, notes });
      if (res.success) {
        await loadLoans();
      } else {
        alert(res.error?.message || 'تعذر تمديد الإعارة في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تمديد الإعارة.');
    }
  };

  const handleReturnBook = async (loanId: string, notes?: string) => {
    try {
      const res = await loanRepository.returnLoan(loanId, { notes });
      if (res.success) {
        await Promise.all([loadLoans(), loadBooks()]);
      } else {
        alert(res.error?.message || 'تعذر تسجيل الإرجاع في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تسجيل الإرجاع.');
    }
  };

  // Book Ingestion Submission (Phase 1.7 - Submissions Migration)
  const handleSubmitIngestion = async (submissionData: any) => {
    try {
      const res = await submissionRepository.createSubmission(submissionData);
      if (res.success) {
        await loadSubmissions();
      } else {
        alert(res.error?.message || 'تعذر إرسال اقتراح الكتاب إلى الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء إرسال اقتراح الكتاب.');
    }
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

  // Admin Approval Queue Actions (Phase 1.7 - Submissions Migration)
  const handleApproveSubmission = async (submissionId: string, categoryId?: string) => {
    try {
      const res = await submissionRepository.approveSubmission(submissionId, { categoryId });
      if (res.success) {
        await Promise.all([loadSubmissions(), loadBooks(), loadNotifications()]);
      } else {
        alert(res.error?.message || 'تعذر اعتماد الاقتراح في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء اعتماد الاقتراح.');
    }
  };

  const handleRejectSubmission = async (submissionId: string, reason: string) => {
    try {
      const res = await submissionRepository.rejectSubmission(submissionId, reason);
      if (res.success) {
        await Promise.all([loadSubmissions(), loadNotifications()]);
      } else {
        alert(res.error?.message || 'تعذر رفض الاقتراح في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء رفض الاقتراح.');
    }
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

  // Reader Progress Save (Phase 1.7 - Reading Progress Migration)
  const handleSaveReaderProgress = async (page: number, totalPages: number) => {
    if (!activeReadingBook) return;
    try {
      const res = await readingProgressRepository.saveReadingProgress({
        bookId: activeReadingBook.id,
        currentPage: page,
        totalPages,
      });
      if (res.success) {
        await loadReadingProgress();
      }
    } catch (err) {
      console.error('Error saving reading progress:', err);
    }
  };

  // Reading Notes (Phase 1.7 - Notes Migration)
  const handleAddNote = async (note: Omit<StudentNote, 'id' | 'createdAt'>) => {
    try {
      const res = await noteRepository.saveNote({ ...note, studentId: currentUser.id });
      if (res.success) {
        await loadNotes();
      } else {
        alert(res.error?.message || 'تعذر حفظ الفائدة في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء حفظ الفائدة.');
    }
  };

  const handleUpdateNote = async (noteId: string, updates: Partial<StudentNote>) => {
    const existingNote = studentNotes.find((n) => n.id === noteId);
    if (!existingNote) return;
    try {
      const res = await noteRepository.saveNote({
        ...existingNote,
        ...updates,
        id: noteId,
        studentId: existingNote.studentId || currentUser.id,
      });
      if (res.success) {
        await loadNotes();
      } else {
        alert(res.error?.message || 'تعذر تحديث الفائدة في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تحديث الفائدة.');
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      const res = await noteRepository.deleteNote(noteId);
      if (res.success) {
        await loadNotes();
      } else {
        alert(res.error?.message || 'تعذر حذف الفائدة من الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء حذف الفائدة.');
    }
  };

  // Physical Bookmarks Handlers (Phase 1.7 - Bookmarks Migration)
  const handleSavePhysicalBookmark = async (data: any) => {
    try {
      const res = await bookmarkRepository.saveBookmark({ ...data, studentId: currentUser.id });
      if (res.success) {
        await loadBookmarks();
      } else {
        alert(res.error?.message || 'تعذر حفظ فاصل القراءة في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء حفظ فاصل القراءة.');
    }
  };

  const handleDeletePhysicalBookmark = async (bookmarkId: string) => {
    try {
      const res = await bookmarkRepository.deleteBookmark(bookmarkId);
      if (res.success) {
        await loadBookmarks();
      } else {
        alert(res.error?.message || 'تعذر حذف فاصل القراءة من الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء حذف فاصل القراءة.');
    }
  };

  // Book Summaries Handlers (Phase 1.7 - Summaries Migration)
  const handleSaveBookSummary = async (summaryData: any) => {
    try {
      const res = await summaryRepository.saveSummary({ ...summaryData, studentId: currentUser.id });
      if (res.success) {
        await loadSummaries();
      } else {
        alert(res.error?.message || 'تعذر حفظ ملخص الكتاب في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء حفظ ملخص الكتاب.');
    }
  };

  const handleDeleteBookSummary = async (summaryId: string) => {
    try {
      const res = await summaryRepository.deleteSummary(summaryId);
      if (res.success) {
        await loadSummaries();
      } else {
        alert(res.error?.message || 'تعذر حذف ملخص الكتاب من الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء حذف ملخص الكتاب.');
    }
  };

  // Favorite toggle (Phase 1.7 - Favorites Migration)
  const handleToggleFavorite = async (bookId: string) => {
    try {
      const res = await favoriteRepository.toggleFavorite(bookId);
      if (res.success) {
        await loadFavorites();
      } else {
        alert(res.error?.message || 'تعذر تحديث المفضلة في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تحديث المفضلة.');
    }
  };

  // Reading progress dismiss & clear completed (Phase 1.7 - Reading Progress Migration)
  const handleDismissReadingProgress = async (bookId: string) => {
    try {
      const res = await readingProgressRepository.dismissReadingProgress(bookId);
      if (res.success) {
        await loadReadingProgress();
      } else {
        alert(res.error?.message || 'تعذر إخفاء تقدم القراءة في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء إخفاء تقدم القراءة.');
    }
  };

  const handleClearCompletedProgress = async () => {
    try {
      const res = await readingProgressRepository.clearCompletedReading();
      if (res.success) {
        await loadReadingProgress();
      } else {
        alert(res.error?.message || 'تعذر تنظيف سجلات القراءة المكتملة في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تنظيف سجلات القراءة.');
    }
  };

  // Portal Handlers (Phase 6.1 - Portals Migration)
  const handleAddPortal = async (portal: Omit<WhitelistedPortal, 'id'>) => {
    try {
      const res = await portalRepository.createPortal(portal);
      if (res.success) {
        await loadPortals();
      } else {
        alert(res.error?.message || 'تعذر إضافة بوابة المعرفة في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء إضافة البوابة.');
    }
  };

  const handleUpdatePortal = async (id: string, updates: Partial<WhitelistedPortal>) => {
    try {
      const res = await portalRepository.updatePortal(id, updates);
      if (res.success) {
        await loadPortals();
      } else {
        alert(res.error?.message || 'تعذر تحديث بوابة المعرفة في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تحديث البوابة.');
    }
  };

  const handleDeletePortal = async (id: string) => {
    try {
      const res = await portalRepository.deletePortal(id);
      if (res.success) {
        await loadPortals();
      } else {
        alert(res.error?.message || 'تعذر حذف بوابة المعرفة من الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء حذف البوابة.');
    }
  };

  const handleTogglePortalFeatured = async (id: string) => {
    const portal = portals.find((p) => p.id === id);
    if (!portal) return;
    try {
      const res = await portalRepository.togglePortalFeatured(portal);
      if (res.success) {
        await loadPortals();
      } else {
        alert(res.error?.message || 'تعذر تحديث حالة التمييز للبوابة في الخادم المركزي.');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تحديث حالة التمييز للبوابة.');
    }
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
              onCheckStudentEligibility={(studentId) =>
                loanRepository.checkEligibility(studentId, loans, users, config)
              }
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
              onAddPortal={handleAddPortal}
              onDeletePortal={handleDeletePortal}
              onUpdatePortal={handleUpdatePortal}
              onToggleFeatured={handleTogglePortalFeatured}
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
