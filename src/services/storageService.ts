import {
  User,
  LoanRecord,
  PendingBookSubmission,
  WhitelistedPortal,
  SystemConfig,
  StudentNote,
  StudentReadingProgress,
  LoanPurpose,
  PhysicalLoanRequest,
  AppNotification,
  UserRole,
  PhysicalBookmark,
  BookSummary,
  ShelfLocation,
} from '../types/library';
import {
  INITIAL_STUDENTS,
  INITIAL_ADMIN,
  INITIAL_LOANS,
  INITIAL_WHITELISTED_PORTALS,
  INITIAL_PENDING_SUBMISSIONS,
  INITIAL_SYSTEM_CONFIG,
  INITIAL_PHYSICAL_BOOKMARKS,
  INITIAL_BOOK_SUMMARIES,
  INITIAL_STUDENT_NOTES,
} from '../data/initialData';
import {
  sanitizeText,
  isSafeUrl,
  sanitizeObject,
} from '../utils/security';
import { apiClient } from './apiClient';

const STORAGE_KEYS = {
  STUDENTS: 'almanara_students_v1',
  ADMIN: 'almanara_admin_v1',
  LOANS: 'almanara_loans_v1',
  LOAN_REQUESTS: 'almanara_loan_requests_v1',
  NOTIFICATIONS: 'almanara_notifications_v1',
  PORTALS: 'almanara_portals_v1',
  SUBMISSIONS: 'almanara_submissions_v1',
  CONFIG: 'almanara_config_v1',
  STUDENT_NOTES: 'almanara_student_notes_v1',
  STUDENT_PROGRESS: 'almanara_student_progress_v1',
  STUDENT_FAVORITES: 'almanara_student_favorites_v1',
  STUDENT_SEARCH_HISTORY: 'almanara_student_search_history_v1',
  STUDENT_OPEN_BOOKS: 'almanara_student_open_books_v1',
  PHYSICAL_BOOKMARKS: 'almanara_physical_bookmarks_v1',
  BOOK_SUMMARIES: 'almanara_book_summaries_v1',
  CURRENT_USER: 'almanara_current_user_v1',
  SESSION_ACTIVE: 'almanara_session_active_v1',
};

const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif-init-1',
    recipientId: 'admin',
    recipientRole: 'admin',
    title: 'طلب استعارة جديد',
    message: 'قام الطالب أحمد البوسعيدي بتقديم طلب استعارة لكتاب "مقدمة ابن خلدون".',
    type: 'loan_request_submitted',
    targetTab: 'loans',
    isRead: false,
    createdAt: '2026-02-28 09:30',
  },
  {
    id: 'notif-init-2',
    recipientId: 'stu-001',
    recipientRole: 'student',
    title: 'مرحباً بك في نظام المشكاة',
    message: 'حسابك مفعل الآن لاستعارة الكتب الورقية والمطالعة الرقمية.',
    type: 'system',
    targetTab: 'student_portal',
    isRead: false,
    createdAt: '2026-02-28 08:00',
  },
];

const INITIAL_LOAN_REQUESTS: PhysicalLoanRequest[] = [
  {
    id: 'req-001',
    bookId: 'phys-001',
    bookTitle: 'مقدمة ابن خلدون (العبر وديوان المبتدأ والخبر)',
    bookAuthor: 'عبد الرحمن بن خلدون الحضرمي',
    bookLocation: {
      cabinet: 'خزانة التراث والتاريخ (أ)',
      shelf: 'الرف الثاني',
      section: 'التاريخ وعلم الاجتماع',
    },
    studentId: 'stu-001',
    studentName: 'أحمد بن سعيد البوسعيدي',
    studentRegNumber: 'STU-2026-001',
    studentGrade: 'الصف العاشر - أ',
    purpose: 'بحث أكاديمي وتكليف مدرسي',
    customReason: 'تحضير ورقة عمل في نشأة علم العمران البشري',
    requestedAt: '2026-02-28 09:30',
    status: 'pending',
  },
];

const INITIAL_STUDENT_PROGRESS: StudentReadingProgress[] = [
  {
    id: 'prog-001',
    studentId: 'stu-001',
    bookId: 'dig-001',
    lastPage: 12,
    totalPages: 150,
    percentage: 8,
    lastReadAt: '2026-02-28 10:15',
    isCompleted: false,
    isDismissed: false,
  },
  {
    id: 'prog-002',
    studentId: 'stu-001',
    bookId: 'dig-002',
    lastPage: 28,
    totalPages: 200,
    percentage: 14,
    lastReadAt: '2026-02-27 16:30',
    isCompleted: false,
    isDismissed: false,
  },
  {
    id: 'prog-003',
    studentId: 'stu-002',
    bookId: 'dig-003',
    lastPage: 5,
    totalPages: 220,
    percentage: 2,
    lastReadAt: '2026-02-28 11:00',
    isCompleted: false,
    isDismissed: false,
  },
];

// Purge legacy persistent library keys from client localStorage (Phase 1.7 Directive)
const LEGACY_KEYS_TO_PURGE = [
  'almanara_categories',
  'almanara_physical_books',
  'almanara_digital_books',
  'almanara_students',
  'almanara_admin',
  'almanara_loans',
  'almanara_loan_requests',
  'almanara_notifications',
  'almanara_portals',
  'almanara_submissions',
  'almanara_config',
  'almanara_notes',
  'almanara_progress',
  'almanara_favorites',
  'almanara_search_history',
  'almanara_open_books',
  'almanara_bookmarks',
  'almanara_summaries',
];

try {
  if (typeof window !== 'undefined' && window.localStorage) {
    LEGACY_KEYS_TO_PURGE.forEach((k) => localStorage.removeItem(k));
    // Also remove any bookmarks_*
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith('bookmarks_') || (k.startsWith('almanara_') && k !== 'almanara_theme')) {
        localStorage.removeItem(k);
      }
    });
  }
} catch (e) {
  // Ignore storage access errors
}

// In-Memory Storage Helper (No persistent library storage on client)
function loadFromStorage<T>(_key: string, fallback: T): T {
  return fallback;
}

function saveToStorage<T>(_key: string, _data: T): void {
  // No-op: Persistent storage is strictly centralized on the Node.js/PostgreSQL server
}

export class StorageService {
  private static instance: StorageService;

  private students: User[];
  private admin: User;
  private loans: LoanRecord[];
  private loanRequests: PhysicalLoanRequest[];
  private notifications: AppNotification[];
  private portals: WhitelistedPortal[];
  private submissions: PendingBookSubmission[];
  private config: SystemConfig;
  private notes: StudentNote[];
  private progress: StudentReadingProgress[];
  private physicalBookmarks: PhysicalBookmark[];
  private summaries: BookSummary[];
  private favorites: { [studentId: string]: string[] }; // studentId -> bookIds array
  private searchHistory: { [studentId: string]: string[] }; // studentId -> search query array
  private openBooks: { [studentId: string]: string[] }; // studentId -> bookIds array
  private currentUser: User;
  private authenticated: boolean;

  private constructor() {
    const loadedStudents = loadFromStorage(STORAGE_KEYS.STUDENTS, INITIAL_STUDENTS);
    this.students = (loadedStudents || []).map((s: User) => ({
      ...s,
      isBlocked: s.isBlocked ?? s.isBlockedFromBorrowing ?? false,
      isBlockedFromBorrowing: s.isBlockedFromBorrowing ?? s.isBlocked ?? false,
    }));
    saveToStorage(STORAGE_KEYS.STUDENTS, this.students);
    this.admin = loadFromStorage(STORAGE_KEYS.ADMIN, INITIAL_ADMIN);
    this.loans = loadFromStorage(STORAGE_KEYS.LOANS, INITIAL_LOANS);
    this.loanRequests = loadFromStorage(STORAGE_KEYS.LOAN_REQUESTS, INITIAL_LOAN_REQUESTS);
    this.notifications = loadFromStorage(STORAGE_KEYS.NOTIFICATIONS, INITIAL_NOTIFICATIONS);
    this.portals = loadFromStorage(STORAGE_KEYS.PORTALS, INITIAL_WHITELISTED_PORTALS);
    this.submissions = loadFromStorage(STORAGE_KEYS.SUBMISSIONS, INITIAL_PENDING_SUBMISSIONS);
    const storedConfig = loadFromStorage(STORAGE_KEYS.CONFIG, INITIAL_SYSTEM_CONFIG);
    if (
      !storedConfig ||
      storedConfig.schoolName === 'مدرسة المنارة الثانوية النموذجية' ||
      storedConfig.schoolName === 'ثانوية النور والبيان المركزية' ||
      !storedConfig.schoolName
    ) {
      this.config = {
        ...INITIAL_SYSTEM_CONFIG,
        ...(storedConfig || {}),
        schoolName: 'معهد المنهاج للدراسات الأكاديمية',
        libraryName: 'المكتبة المركزية',
      };
    } else {
      this.config = { ...INITIAL_SYSTEM_CONFIG, ...storedConfig };
    }
    this.notes = loadFromStorage(STORAGE_KEYS.STUDENT_NOTES, INITIAL_STUDENT_NOTES);
    this.physicalBookmarks = loadFromStorage(STORAGE_KEYS.PHYSICAL_BOOKMARKS, INITIAL_PHYSICAL_BOOKMARKS);
    this.summaries = loadFromStorage(STORAGE_KEYS.BOOK_SUMMARIES, INITIAL_BOOK_SUMMARIES);
    const rawProgress = loadFromStorage(STORAGE_KEYS.STUDENT_PROGRESS, INITIAL_STUDENT_PROGRESS);
    this.progress = (rawProgress || []).map((p: any) => ({
      ...p,
      studentId: p.studentId || 'stu-001',
      isDismissed: p.isDismissed ?? false,
    }));
    this.favorites = loadFromStorage(STORAGE_KEYS.STUDENT_FAVORITES, {
      'stu-001': ['dig-001', 'phys-001'],
      'stu-002': ['dig-003'],
    });
    this.searchHistory = loadFromStorage(STORAGE_KEYS.STUDENT_SEARCH_HISTORY, {
      'stu-001': ['مقدمة ابن خلدون', 'الفقه الإسلامي وأدلته', 'شرح كتاب النيل'],
      'stu-002': ['تاريخ عمان', 'كتاب العين للفراهيدي'],
    });
    this.openBooks = loadFromStorage(STORAGE_KEYS.STUDENT_OPEN_BOOKS, {
      'stu-001': ['dig-001', 'dig-002'],
      'stu-002': ['dig-003'],
    });
    this.currentUser = loadFromStorage(STORAGE_KEYS.CURRENT_USER, INITIAL_ADMIN);
    this.authenticated = loadFromStorage(STORAGE_KEYS.SESSION_ACTIVE, false);

    // Run periodic check for overdue loans on startup
    this.recalculateLoanStatuses();
    // Synchronize available copies strictly with total copies and active loans
    this.syncBookAvailability();
  }

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  /**
   * Recalculates and synchronizes availableCopies for every physical book
   * based on totalCopies minus non-returned active/overdue/extended loans.
   */
  public syncBookAvailability(): void {
    // Deprecated. Handled centrally.
  }

  /**
   * Syncs entire state with the Central PostgreSQL / Relational Server
   */
  public async syncWithServer(): Promise<boolean> {
    try {
      // [Book synchronization removed in Phase 1.7.3-B - Books are now managed exclusively via BookRepository]

      // [Category synchronization removed in Phase 1.7.3-A - Categories are now managed exclusively via CategoryRepository]

      // 3. Loans
      const loansRes = await apiClient.get('/loans');
      if (loansRes.success && Array.isArray(loansRes.data)) {
        this.loans = loansRes.data;
        saveToStorage(STORAGE_KEYS.LOANS, this.loans);
      }

      // 4. Loan Requests
      const reqsRes = await apiClient.get('/loan-requests');
      if (reqsRes.success && Array.isArray(reqsRes.data)) {
        this.loanRequests = reqsRes.data;
        saveToStorage(STORAGE_KEYS.LOAN_REQUESTS, this.loanRequests);
      }

      // 5. Portals
      const portalsRes = await apiClient.get('/portals');
      if (portalsRes.success && Array.isArray(portalsRes.data) && portalsRes.data.length > 0) {
        this.portals = portalsRes.data;
        saveToStorage(STORAGE_KEYS.PORTALS, this.portals);
      }

      // 6. Settings
      const setRes = await apiClient.get('/settings');
      if (setRes.success && setRes.data) {
        this.config = { ...INITIAL_SYSTEM_CONFIG, ...setRes.data };
        saveToStorage(STORAGE_KEYS.CONFIG, this.config);
      }

      // 7. Users (if admin)
      if (this.currentUser?.role === 'admin') {
        const usersRes = await apiClient.get('/users');
        if (usersRes.success && Array.isArray(usersRes.data) && usersRes.data.length > 0) {
          this.students = usersRes.data;
          saveToStorage(STORAGE_KEYS.STUDENTS, this.students);
        }
      }

      // 8. Summaries
      const sumRes = await apiClient.get('/summaries');
      if (sumRes.success && Array.isArray(sumRes.data)) {
        this.summaries = sumRes.data;
        saveToStorage(STORAGE_KEYS.BOOK_SUMMARIES, this.summaries);
      }

      // 9. Notes
      const notesRes = await apiClient.get('/notes');
      if (notesRes.success && Array.isArray(notesRes.data)) {
        this.notes = notesRes.data;
        saveToStorage(STORAGE_KEYS.STUDENT_NOTES, this.notes);
      }

      // 10. Bookmarks
      const bmRes = await apiClient.get('/bookmarks');
      if (bmRes.success && Array.isArray(bmRes.data)) {
        this.physicalBookmarks = bmRes.data;
        saveToStorage(STORAGE_KEYS.PHYSICAL_BOOKMARKS, this.physicalBookmarks);
      }

      this.syncBookAvailability();
      return true;
    } catch (err) {
      console.warn('[StorageService] Error during server sync:', err);
      return false;
    }
  }

  // --- Legacy Auth Methods (Deprecated in Phase 1.7.2 - Use AuthRepository / AuthContext) ---
  /** @deprecated Use AuthContext.isAuthenticated or AuthRepository instead. */
  public isAuthenticated(): boolean {
    return this.authenticated && !!this.currentUser;
  }

  /** @deprecated Use AuthContext.user or AuthRepository.getCurrentUser() instead. */
  public getCurrentUser(): User {
    return this.currentUser;
  }

  /** @deprecated Use AuthContext.setUser instead. */
  public setCurrentUser(user: User): void {
    this.currentUser = user;
    saveToStorage(STORAGE_KEYS.CURRENT_USER, user);
  }




  // --- Legacy Physical Books (Deprecated in Phase 1.7.3-B - Use BookRepository) ---
  
  // --- Circulation & Loans ---

  public recalculateLoanStatuses(): void {
    const now = new Date();
    let hasChanges = false;
    this.loans = this.loans.map(loan => {
      if (loan.status === 'active' && new Date(loan.dueDate) < now) {
        hasChanges = true;
        return { ...loan, status: 'overdue' };
      }
      return loan;
    });
    if (hasChanges) {
      saveToStorage(STORAGE_KEYS.LOANS, this.loans);
    }
  }

  public getLoans(): LoanRecord[] {
    this.recalculateLoanStatuses();
    return this.loans;
  }

  public checkStudentBorrowEligibility(studentId: string): {
    canBorrow: boolean;
    reason?: string;
    activeLoansCount: number;
    hasOverdue: boolean;
  } {
    const student = this.students.find(s => s.id === studentId);
    if (!student) return { canBorrow: false, reason: 'الطالب غير مسجل', activeLoansCount: 0, hasOverdue: false };

    const activeLoans = this.loans.filter(l => l.studentId === studentId && l.status !== 'returned');
    const hasOverdue = activeLoans.some(l => l.status === 'overdue');

    if (student.isBlockedFromBorrowing || (hasOverdue && this.config.autoBlockOverdueStudents)) {
      return {
        canBorrow: false,
        reason: student.blockReason || 'الطالب محظور من الاستعارة بسبب وجود كتب متأخرة لم يتم إرجاعها',
        activeLoansCount: activeLoans.length,
        hasOverdue: true,
      };
    }

    if (activeLoans.length >= this.config.maxActiveLoansPerStudent) {
      return {
        canBorrow: false,
        reason: `وصل الطالب للحد الأقصى المسموح به من الإعارات المتزامنة (${this.config.maxActiveLoansPerStudent} كتب)`,
        activeLoansCount: activeLoans.length,
        hasOverdue: false,
      };
    }

    return { canBorrow: true, activeLoansCount: activeLoans.length, hasOverdue: false };
  }

  public createLoan(params: {
    bookId: string;
    studentId: string;
    purpose: LoanPurpose;
    customDurationDays?: number;
    notes?: string;
    isOverrideExemption?: boolean;
    overrideReason?: string;
    bookTitle?: string;
  }): LoanRecord {
    const student = this.students.find(s => s.id === params.studentId);
    if (!student) throw new Error('الطالب غير موجود');

    const eligibility = this.checkStudentBorrowEligibility(student.id);
    if (!eligibility.canBorrow && !params.isOverrideExemption) {
      throw new Error(`تعذر إتمام الإعارة: ${eligibility.reason}`);
    }

    const durationDays = params.customDurationDays || (params.purpose === 'academic_research' ? this.config.academicResearchDurationDays : this.config.generalReadingDurationDays);
    const now = new Date();
    const dueDate = new Date();
    dueDate.setDate(now.getDate() + durationDays);

    const newLoan: LoanRecord = {
      id: `loan-${Date.now().toString(36)}`,
      bookId: params.bookId,
      bookTitle: params.bookTitle || 'عنوان غير متوفر',
      studentId: student.id,
      studentName: student.name,
      studentRegNumber: student.registrationNumber,
      purpose: params.purpose,
      issueDate: now.toISOString().split('T')[0],
      dueDate: dueDate.toISOString().split('T')[0],
      status: 'active',
      extensionCount: 0,
      maxExtensionsAllowed: this.config.maxExtensionsAllowed,
      notes: params.notes || '',
      isOverrideExemption: params.isOverrideExemption,
      overrideReason: params.overrideReason,
    };
    this.loans.unshift(newLoan);
    saveToStorage(STORAGE_KEYS.LOANS, this.loans);
    return newLoan;
  }

  public extendLoan(params: {
    loanId: string;
    extensionDays: number;
    notes?: string;
  }): LoanRecord {
    const index = this.loans.findIndex(l => l.id === params.loanId);
    if (index === -1) throw new Error('الإعارة غير موجودة');
    const loan = this.loans[index];
    if (loan.status === 'returned') throw new Error('تم إرجاع هذا الكتاب مسبقاً');
    
    const dueDate = new Date(loan.dueDate);
    dueDate.setDate(dueDate.getDate() + params.extensionDays);
    
    this.loans[index] = {
      ...loan,
      dueDate: dueDate.toISOString().split('T')[0],
      extensionCount: (loan.extensionCount || 0) + 1,
      notes: loan.notes ? `${loan.notes}\n---\n${params.notes}` : (params.notes || ''),
      status: loan.status === 'overdue' ? 'active' : loan.status
    };
    saveToStorage(STORAGE_KEYS.LOANS, this.loans);
    return this.loans[index];
  }

  public returnBook(params: {
    loanId: string;
    condition: string;
    notes?: string;
  }): LoanRecord {
    const index = this.loans.findIndex(l => l.id === params.loanId);
    if (index === -1) throw new Error('الإعارة غير موجودة');
    const loan = this.loans[index];
    if (loan.status === 'returned') throw new Error('تم إرجاع الكتاب مسبقاً');
    
    this.loans[index] = {
      ...loan,
      status: 'returned',
      returnDate: new Date().toISOString().split('T')[0],
      notes: loan.notes ? `${loan.notes}\n---\nحالة الإرجاع: ${params.condition}\n${params.notes || ''}` : `حالة الإرجاع: ${params.condition}\n${params.notes || ''}`
    };
    saveToStorage(STORAGE_KEYS.LOANS, this.loans);
    return this.loans[index];
  }

  
  public getLoanRequests(): PhysicalLoanRequest[] {
    return this.loanRequests;
  }

  public requestPhysicalLoan(params: {
    bookId: string;
    studentId: string;
    purpose: string;
    customReason?: string;
    requestedDurationDays?: number;
    bookTitle?: string;
    bookAuthor?: string;
    bookLocation?: any;
  }): PhysicalLoanRequest {
    const student = this.students.find(s => s.id === params.studentId);
    if (!student) throw new Error('الطالب غير موجود');

    const newRequest: PhysicalLoanRequest = {
      id: `req-${Date.now().toString(36)}`,
      bookId: params.bookId,
      bookTitle: params.bookTitle || "عنوان غير متوفر",
      bookAuthor: params.bookAuthor || "مؤلف غير متوفر",
      bookLocation: params.bookLocation || { cabinet: "غير متوفر", shelf: "غير متوفر", level: 1 },
      studentId: student.id,
      studentName: student.name,
      studentRegNumber: student.registrationNumber,
      studentGrade: student.grade || 'الصف العام',
      purpose: params.purpose,
      customReason: params.customReason,
      requestedDurationDays: params.requestedDurationDays,
      requestedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
      status: 'pending',
    };

    this.loanRequests.unshift(newRequest);
    saveToStorage(STORAGE_KEYS.LOAN_REQUESTS, this.loanRequests);
    return newRequest;
  }


  public approveLoanRequest(params: {
    requestId: string;
    durationDays: number;
    adminNotes?: string;
  }): PhysicalLoanRequest {
    const req = this.loanRequests.find((r) => r.id === params.requestId);
    if (!req) throw new Error('طلب الاستعارة غير موجود');
    if (req.status !== 'pending') throw new Error('تمت معالجة هذا الطلب مسبقاً');

    

    const now = new Date();
    const dueDate = new Date();
    dueDate.setDate(now.getDate() + params.durationDays);

    req.status = 'approved';
    req.approvedDurationDays = params.durationDays;
    req.approvedAt = now.toISOString().replace('T', ' ').substring(0, 16);
    req.dueDateCalculated = dueDate.toISOString().split('T')[0];
    req.adminNotes = params.adminNotes;

    saveToStorage(STORAGE_KEYS.LOAN_REQUESTS, this.loanRequests);

    // Notify the student
    this.addNotification({
      recipientId: req.studentId,
      recipientRole: 'student',
      title: 'تمت الموافقة على طلب استعارة الكتاب ✅',
      message: `وافق أمين المكتبة على استعارة "${req.bookTitle}" لمدة ${params.durationDays} يوماً. يرجى أخذ الكتاب من الرف (${req.bookLocation.cabinet} - ${req.bookLocation.shelf}) والتوجه لأمين المكتبة لتأكيد الاستلام والخروج.`,
      type: 'loan_request_approved',
      targetTab: 'student_portal',
      targetEntityId: req.id,
    });

    return req;
  }

  public rejectLoanRequest(requestId: string, reason: string): PhysicalLoanRequest {
    const req = this.loanRequests.find((r) => r.id === requestId);
    if (!req) throw new Error('طلب الاستعارة غير موجود');

    req.status = 'rejected';
    req.rejectionReason = reason;
    saveToStorage(STORAGE_KEYS.LOAN_REQUESTS, this.loanRequests);

    // Notify the student
    this.addNotification({
      recipientId: req.studentId,
      recipientRole: 'student',
      title: 'تم رفض طلب استعارة الكتاب',
      message: `نعتذر، تم رفض طلب استعارة "${req.bookTitle}". السبب: ${reason}`,
      type: 'loan_request_rejected',
      targetTab: 'student_portal',
      targetEntityId: req.id,
    });

    return req;
  }

  public confirmHandoverLoanRequest(requestId: string): {
    request: PhysicalLoanRequest;
    loanRecord: LoanRecord;
  } {
    const req = this.loanRequests.find((r) => r.id === requestId);
    if (!req) throw new Error('طلب الاستعارة غير موجود');
    if (req.status !== 'approved') throw new Error('يجب أن يكون الطلب موافقاً عليه أولاً لتأكيد الخروج');

    

    const durationDays =
      req.approvedDurationDays ||
      (req.purpose.includes('بحث')
        ? this.config.academicResearchDurationDays
        : this.config.generalReadingDurationDays);

    const now = new Date();
    const dueDate = new Date();
    dueDate.setDate(now.getDate() + durationDays);

    const newLoanRecord: LoanRecord = {
      id: `loan-${Date.now().toString(36)}`,
      bookId: req.bookId,
      bookTitle: req.bookTitle,
      studentId: req.studentId,
      studentName: req.studentName,
      studentRegNumber: req.studentRegNumber,
      purpose: req.purpose.includes('بحث') ? 'academic_research' : 'general_reading',
      issueDate: now.toISOString().split('T')[0],
      dueDate: dueDate.toISOString().split('T')[0],
      status: 'active',
      extensionCount: 0,
      maxExtensionsAllowed: this.config.maxExtensionsAllowed,
      notes: `تم الإصدار عبر طلب إعارة إلكتروني. الغرض: ${req.purpose}${req.customReason ? ` - ${req.customReason}` : ''}`,
    };

    this.loans.unshift(newLoanRecord);
    this.syncBookAvailability();

    req.status = 'handed_over';
    req.handedOverAt = now.toISOString().replace('T', ' ').substring(0, 16);
    req.loanRecordId = newLoanRecord.id;

    saveToStorage(STORAGE_KEYS.LOANS, this.loans);
    saveToStorage(STORAGE_KEYS.LOAN_REQUESTS, this.loanRequests);

    // Notify Student of confirmed physical checkout
    this.addNotification({
      recipientId: req.studentId,
      recipientRole: 'student',
      title: 'تم تأكيد استلام الكتاب وخروجه من المكتبة 📖',
      message: `تم تسجيل خروج كتاب "${req.bookTitle}" بنجاح. موعد الإرجاع المحدد: ${dueDate.toISOString().split('T')[0]}. حافظ على سلامة الكتاب ونظافته.`,
      type: 'loan_handed_over',
      targetTab: 'student_portal',
      targetEntityId: newLoanRecord.id,
    });

    return { request: req, loanRecord: newLoanRecord };
  }

  // --- Notifications System ---
  public getNotifications(recipientId: string, role?: UserRole): AppNotification[] {
    return this.notifications.filter((n) => {
      if (role === 'admin' && (n.recipientRole === 'admin' || n.recipientId === 'admin')) return true;
      return n.recipientId === recipientId || n.recipientId === 'all';
    });
  }

  public addNotification(
    notif: Omit<AppNotification, 'id' | 'createdAt' | 'isRead'>
  ): AppNotification {
    const newNotif: AppNotification = {
      ...notif,
      id: `notif-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      isRead: false,
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
    };
    this.notifications.unshift(newNotif);
    saveToStorage(STORAGE_KEYS.NOTIFICATIONS, this.notifications);
    return newNotif;
  }

  public markNotificationAsRead(id: string): void {
    const notif = this.notifications.find((n) => n.id === id);
    if (notif) {
      notif.isRead = true;
      saveToStorage(STORAGE_KEYS.NOTIFICATIONS, this.notifications);
    }
  }

  public markAllNotificationsAsRead(recipientId: string, role?: UserRole): void {
    this.notifications.forEach((n) => {
      if (role === 'admin' && (n.recipientRole === 'admin' || n.recipientId === 'admin')) {
        n.isRead = true;
      } else if (n.recipientId === recipientId || n.recipientId === 'all') {
        n.isRead = true;
      }
    });
    saveToStorage(STORAGE_KEYS.NOTIFICATIONS, this.notifications);
  }

  public clearNotifications(recipientId: string, role?: UserRole): void {
    this.notifications = this.notifications.filter((n) => {
      if (role === 'admin' && (n.recipientRole === 'admin' || n.recipientId === 'admin')) return false;
      return n.recipientId !== recipientId && n.recipientId !== 'all';
    });
    saveToStorage(STORAGE_KEYS.NOTIFICATIONS, this.notifications);
  }

  // --- Student Search History ---
  public getSearchHistory(studentId: string): string[] {
    return this.searchHistory[studentId] || [];
  }

  public addSearchHistory(studentId: string, query: string): void {
    const clean = query.trim();
    if (!clean) return;
    const history = this.searchHistory[studentId] || [];
    const filtered = history.filter((q) => q.toLowerCase() !== clean.toLowerCase());
    this.searchHistory[studentId] = [clean, ...filtered].slice(0, 15);
    saveToStorage(STORAGE_KEYS.STUDENT_SEARCH_HISTORY, this.searchHistory);
  }

  public removeSearchHistoryItem(studentId: string, query: string): void {
    const history = this.searchHistory[studentId] || [];
    this.searchHistory[studentId] = history.filter((q) => q !== query);
    saveToStorage(STORAGE_KEYS.STUDENT_SEARCH_HISTORY, this.searchHistory);
  }

  public clearSearchHistory(studentId: string): void {
    this.searchHistory[studentId] = [];
    saveToStorage(STORAGE_KEYS.STUDENT_SEARCH_HISTORY, this.searchHistory);
  }

  // --- Open Books In Progress for Student ---
  public getOpenBooks(studentId: string): string[] {
    return this.openBooks[studentId] || [];
  }

  public addOpenBook(studentId: string, bookId: string): void {
    const current = this.openBooks[studentId] || [];
    if (!current.includes(bookId)) {
      this.openBooks[studentId] = [bookId, ...current];
      saveToStorage(STORAGE_KEYS.STUDENT_OPEN_BOOKS, this.openBooks);
    }
  }

  public closeOpenBook(studentId: string, bookId: string): void {
    const current = this.openBooks[studentId] || [];
    this.openBooks[studentId] = current.filter((id) => id !== bookId);
    saveToStorage(STORAGE_KEYS.STUDENT_OPEN_BOOKS, this.openBooks);

    // Also remove or mark closed from progress map if needed
    const pIdx = this.progress.findIndex((p) => p.bookId === bookId);
    if (pIdx >= 0) {
      this.progress.splice(pIdx, 1);
      saveToStorage(STORAGE_KEYS.STUDENT_PROGRESS, this.progress);
    }
  }

  // --- Students & User Management ---
  public getStudents(): User[] {
    return this.students;
  }

  public addStudent(student: Omit<User, 'id' | 'role' | 'createdAt'>): User {
    const newStudent: User = {
      ...student,
      id: `stu-${Date.now().toString(36)}`,
      role: 'student',
      isBlocked: student.isBlocked ?? false,
      isBlockedFromBorrowing: student.isBlockedFromBorrowing ?? student.isBlocked ?? false,
      createdAt: new Date().toISOString().split('T')[0],
    };
    this.students.unshift(newStudent);
    saveToStorage(STORAGE_KEYS.STUDENTS, this.students);
    return newStudent;
  }

  public importStudentsCSV(csvData: string): { importedCount: number; students: User[] } {
    const lines = csvData.trim().split('\n');
    const newStudents: User[] = [];

    lines.forEach((line, index) => {
      const parts = line.split(/[,;\t]/).map(p => p.trim());
      if (parts.length >= 2) {
        // format: Name, RegNumber, Grade?, Phone?, Email?
        const name = parts[0];
        const reg = parts[1];
        const grade = parts[2] || 'الصف العام';
        const phone = parts[3] || '';
        const email = parts[4] || `${reg.toLowerCase()}@school.local`;

        if (name && reg && !this.students.some(s => s.registrationNumber.toUpperCase() === reg.toUpperCase())) {
          const student: User = {
            id: `stu-import-${Date.now().toString(36)}-${index}`,
            name,
            registrationNumber: reg,
            grade,
            phone,
            email,
            role: 'student',
            isBlockedFromBorrowing: false,
            createdAt: new Date().toISOString().split('T')[0],
          };
          newStudents.push(student);
        }
      }
    });

    if (newStudents.length > 0) {
      this.students = [...newStudents, ...this.students];
      saveToStorage(STORAGE_KEYS.STUDENTS, this.students);
    }

    return { importedCount: newStudents.length, students: newStudents };
  }

  public updateStudent(id: string, updates: Partial<User>): User | null {
    const index = this.students.findIndex(s => s.id === id);
    if (index === -1) return null;
    this.students[index] = { 
      ...this.students[index], 
      ...updates,
    };
    saveToStorage(STORAGE_KEYS.STUDENTS, this.students);
    return this.students[index];
  }

  private generateAutoPassword(name: string): string {
    const firstWord = name.trim().split(' ')[0] || 'student';
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `${firstWord}#${randomNum}!`;
  }

  // --- Whitelisted Portals ---
  public getPortals(): WhitelistedPortal[] {
    return this.portals;
  }

  public addPortal(portal: Omit<WhitelistedPortal, 'id'>): WhitelistedPortal {
    const newPortal: WhitelistedPortal = {
      ...portal,
      id: `portal-${Date.now().toString(36)}`,
    };
    this.portals.push(newPortal);
    saveToStorage(STORAGE_KEYS.PORTALS, this.portals);
    return newPortal;
  }

  public deletePortal(id: string): boolean {
    this.portals = this.portals.filter(p => p.id !== id);
    saveToStorage(STORAGE_KEYS.PORTALS, this.portals);
    return true;
  }

  public updatePortal(id: string, updates: Partial<WhitelistedPortal>): WhitelistedPortal | null {
    const index = this.portals.findIndex(p => p.id === id);
    if (index !== -1) {
      this.portals[index] = {
        ...this.portals[index],
        ...updates,
      };
      saveToStorage(STORAGE_KEYS.PORTALS, this.portals);
      return this.portals[index];
    }
    return null;
  }

  public togglePortalFeatured(id: string): boolean {
    const portal = this.portals.find(p => p.id === id);
    if (portal) {
      portal.isFeatured = !portal.isFeatured;
      saveToStorage(STORAGE_KEYS.PORTALS, this.portals);
      return true;
    }
    return false;
  }

  // --- Submissions (Ingestion Review Queue) ---
  public getSubmissions(): PendingBookSubmission[] {
    return this.submissions;
  }

  public submitBookForReview(
    submission: Omit<PendingBookSubmission, 'id' | 'submittedAt' | 'status'>
  ): PendingBookSubmission {
    const newSubmission: PendingBookSubmission = {
      ...submission,
      id: `sub-${Date.now().toString(36)}`,
      submittedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
      status: 'pending',
    };
    this.submissions.unshift(newSubmission);
    saveToStorage(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    return newSubmission;
  }

  public approveSubmission(submissionId: string, _approvedCategoryId?: string): PendingBookSubmission {
    const sub = this.submissions.find(s => s.id === submissionId);
    if (!sub) throw new Error('طلب الرفع غير موجود');
    if (sub.status !== 'pending') throw new Error('تم البت في هذا الطلب مسبقاً');

    sub.status = 'approved';
    sub.reviewedAt = new Date().toISOString().replace('T', ' ').substring(0, 16);
    sub.reviewedBy = this.admin.name;

    saveToStorage(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    return sub;
  }

  public rejectSubmission(submissionId: string, reason: string): PendingBookSubmission {
    const sub = this.submissions.find(s => s.id === submissionId);
    if (!sub) throw new Error('طلب الرفع غير موجود');

    sub.status = 'rejected';
    sub.adminFeedback = reason;
    sub.reviewedAt = new Date().toISOString().replace('T', ' ').substring(0, 16);
    sub.reviewedBy = this.admin.name;

    saveToStorage(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    return sub;
  }

  // --- Student Workspace (Notes, Favorites, Progress) ---
  public getStudentFavorites(studentId?: string): string[] {
    const target = studentId || this.currentUser?.id || 'stu-001';
    return this.favorites[target] || [];
  }

  public toggleFavorite(bookId: string, studentId?: string): boolean {
    const target = studentId || this.currentUser?.id || 'stu-001';
    if (!this.favorites[target]) {
      this.favorites[target] = [];
    }

    const userFavs = this.favorites[target];
    const exists = userFavs.includes(bookId);
    if (exists) {
      this.favorites[target] = userFavs.filter(id => id !== bookId);
    } else {
      this.favorites[target] = [...userFavs, bookId];
    }
    saveToStorage(STORAGE_KEYS.STUDENT_FAVORITES, this.favorites);
    return !exists;
  }

  public getStudentNotes(studentId?: string, bookId?: string): StudentNote[] {
    const targetStudentId = studentId || (this.currentUser?.role === 'student' ? this.currentUser.id : undefined);
    return this.notes.filter(n => {
      if (targetStudentId && n.studentId && n.studentId !== targetStudentId) return false;
      if (bookId && n.bookId !== bookId) return false;
      return true;
    });
  }

  public addStudentNote(note: Omit<StudentNote, 'id' | 'createdAt'>): StudentNote {
    const targetStudentId = note.studentId || (this.currentUser?.role === 'student' ? this.currentUser.id : 'stu-001');
    const newNote: StudentNote = {
      ...note,
      id: `note-${Date.now().toString(36)}`,
      studentId: targetStudentId,
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
    };
    this.notes.unshift(newNote);
    saveToStorage(STORAGE_KEYS.STUDENT_NOTES, this.notes);
    return newNote;
  }

  public deleteStudentNote(noteId: string): void {
    this.notes = this.notes.filter(n => n.id !== noteId);
    saveToStorage(STORAGE_KEYS.STUDENT_NOTES, this.notes);
  }

  public updateStudentNote(noteId: string, updates: Partial<StudentNote>): StudentNote | undefined {
    const index = this.notes.findIndex(n => n.id === noteId);
    if (index === -1) return undefined;
    this.notes[index] = { ...this.notes[index], ...updates };
    saveToStorage(STORAGE_KEYS.STUDENT_NOTES, this.notes);
    return this.notes[index];
  }

  // --- Physical Bookmarks (Reading Progress for Physical Books) ---
  public getPhysicalBookmarks(studentId?: string): PhysicalBookmark[] {
    const targetStudentId = studentId || (this.currentUser?.role === 'student' ? this.currentUser.id : undefined);
    return this.physicalBookmarks.filter(b => !targetStudentId || b.studentId === targetStudentId);
  }

  public getPhysicalBookmarkByBook(bookId: string, studentId?: string): PhysicalBookmark | undefined {
    const targetStudentId = studentId || (this.currentUser?.role === 'student' ? this.currentUser.id : 'stu-001');
    return this.physicalBookmarks.find(b => b.bookId === bookId && b.studentId === targetStudentId);
  }

  public savePhysicalBookmark(data: {
    bookId: string;
    bookTitle: string;
    bookAuthor?: string;
    location?: ShelfLocation;
    currentPage: number;
    totalPages: number;
    chapterOrTopic?: string;
    quickNote?: string;
    studentId?: string;
    isCompleted?: boolean;
  }): PhysicalBookmark {
    const targetStudentId = data.studentId || (this.currentUser?.role === 'student' ? this.currentUser.id : 'stu-001');
    const existingIndex = this.physicalBookmarks.findIndex(
      b => b.bookId === data.bookId && b.studentId === targetStudentId
    );

    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const bookmarkData: PhysicalBookmark = {
      id: existingIndex >= 0 ? this.physicalBookmarks[existingIndex].id : `pbm-${Date.now().toString(36)}`,
      studentId: targetStudentId,
      bookId: data.bookId,
      bookTitle: data.bookTitle,
      bookAuthor: data.bookAuthor,
      location: data.location,
      currentPage: data.currentPage,
      totalPages: data.totalPages,
      chapterOrTopic: data.chapterOrTopic || '',
      quickNote: data.quickNote || '',
      lastSessionDate: nowStr,
      isCompleted: data.isCompleted ?? (data.currentPage >= data.totalPages),
    };

    if (existingIndex >= 0) {
      this.physicalBookmarks[existingIndex] = bookmarkData;
    } else {
      this.physicalBookmarks.unshift(bookmarkData);
    }

    saveToStorage(STORAGE_KEYS.PHYSICAL_BOOKMARKS, this.physicalBookmarks);
    return bookmarkData;
  }

  public deletePhysicalBookmark(bookmarkId: string): void {
    this.physicalBookmarks = this.physicalBookmarks.filter(b => b.id !== bookmarkId);
    saveToStorage(STORAGE_KEYS.PHYSICAL_BOOKMARKS, this.physicalBookmarks);
  }

  // --- Book Summaries (Creative Multi-Format Summaries) ---
  public getBookSummaries(studentId?: string, bookId?: string): BookSummary[] {
    const targetStudentId = studentId || (this.currentUser?.role === 'student' ? this.currentUser.id : undefined);
    return this.summaries.filter(s => {
      if (targetStudentId && s.studentId !== targetStudentId) return false;
      if (bookId && s.bookId !== bookId) return false;
      return true;
    });
  }

  public getBookSummaryById(summaryId: string): BookSummary | undefined {
    return this.summaries.find(s => s.id === summaryId);
  }

  public saveBookSummary(summary: Omit<BookSummary, 'id' | 'createdAt'> & { id?: string }): BookSummary {
    const targetStudentId = summary.studentId || (this.currentUser?.role === 'student' ? this.currentUser.id : 'stu-001');
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);

    if (summary.id) {
      const index = this.summaries.findIndex(s => s.id === summary.id);
      if (index >= 0) {
        this.summaries[index] = {
          ...this.summaries[index],
          ...summary,
          updatedAt: nowStr,
        };
        saveToStorage(STORAGE_KEYS.BOOK_SUMMARIES, this.summaries);
        return this.summaries[index];
      }
    }

    const newSummary: BookSummary = {
      ...summary,
      id: `sum-${Date.now().toString(36)}`,
      studentId: targetStudentId,
      createdAt: nowStr,
      updatedAt: nowStr,
    };
    this.summaries.unshift(newSummary);
    saveToStorage(STORAGE_KEYS.BOOK_SUMMARIES, this.summaries);
    return newSummary;
  }

  public deleteBookSummary(summaryId: string): void {
    this.summaries = this.summaries.filter(s => s.id !== summaryId);
    saveToStorage(STORAGE_KEYS.BOOK_SUMMARIES, this.summaries);
  }

  public saveReadingProgress(progressData: StudentReadingProgress): void {
    const targetStudentId = progressData.studentId || (this.currentUser?.role === 'student' ? this.currentUser.id : 'stu-001');
    const fullData: StudentReadingProgress = {
      ...progressData,
      id: progressData.id || `prog-${Date.now().toString(36)}`,
      studentId: targetStudentId,
      isDismissed: progressData.isDismissed ?? false,
    };

    const index = this.progress.findIndex(p => p.bookId === fullData.bookId && p.studentId === targetStudentId);
    if (index >= 0) {
      this.progress[index] = fullData;
    } else {
      this.progress.unshift(fullData);
    }
    saveToStorage(STORAGE_KEYS.STUDENT_PROGRESS, this.progress);
  }

  public getReadingProgress(bookId: string, studentId?: string): StudentReadingProgress | undefined {
    const targetStudentId = studentId || (this.currentUser?.role === 'student' ? this.currentUser.id : 'stu-001');
    return this.progress.find(p => p.bookId === bookId && p.studentId === targetStudentId && !p.isDismissed);
  }

  public dismissReadingProgress(bookId: string, studentId?: string): void {
    const targetStudentId = studentId || (this.currentUser?.role === 'student' ? this.currentUser.id : 'stu-001');
    this.progress = this.progress.filter(p => !(p.bookId === bookId && p.studentId === targetStudentId));
    saveToStorage(STORAGE_KEYS.STUDENT_PROGRESS, this.progress);
    this.closeOpenBook(targetStudentId, bookId);
  }

  public clearCompletedReading(studentId?: string): void {
    const targetStudentId = studentId || (this.currentUser?.role === 'student' ? this.currentUser.id : 'stu-001');
    const completedBookIds = this.progress
      .filter(p => p.studentId === targetStudentId && (p.isCompleted || p.lastPage >= p.totalPages))
      .map(p => p.bookId);

    this.progress = this.progress.filter(
      p => !(p.studentId === targetStudentId && (p.isCompleted || p.lastPage >= p.totalPages))
    );
    saveToStorage(STORAGE_KEYS.STUDENT_PROGRESS, this.progress);

    completedBookIds.forEach(id => this.closeOpenBook(targetStudentId, id));
  }

  // --- System Configuration & Backup ---
  public getConfig(): SystemConfig {
    return this.config;
  }

  public updateConfig(updates: Partial<SystemConfig>): SystemConfig {
    this.config = { ...this.config, ...updates };
    saveToStorage(STORAGE_KEYS.CONFIG, this.config);
    return this.config;
  }

  // --- Extra Convenience Aliases for UI Components ---
  public getUsers(): User[] {
    return [this.admin, ...this.students];
  }

  public addUser(user: Omit<User, 'id'>): User {
    if (user.role === 'admin') {
      this.admin = { ...this.admin, ...user };
      saveToStorage(STORAGE_KEYS.ADMIN, this.admin);
      return this.admin;
    }
    return this.addStudent(user as any);
  }

  public bulkImportStudents(roster: { registrationNumber: string; name: string; grade?: string }[]): {
    importedCount: number;
    generatedCredentials: { name: string; regNumber: string; tempPass: string }[];
  } {
    const generated: { name: string; regNumber: string; tempPass: string }[] = [];
    const newStudents: User[] = [];

    roster.forEach((row, idx) => {
      if (!this.students.some(s => s.registrationNumber.toUpperCase() === row.registrationNumber.trim().toUpperCase())) {
        const student: User = {
          id: `stu-imp-${Date.now().toString(36)}-${idx}`,
          name: row.name.trim(),
          registrationNumber: row.registrationNumber.trim(),
          grade: row.grade?.trim() || 'الصف العام',
          role: 'student',
          isBlocked: false,
          isBlockedFromBorrowing: false,
          createdAt: new Date().toISOString().split('T')[0],
        };
        newStudents.push(student);
        generated.push({ name: student.name, regNumber: student.registrationNumber, tempPass: '123456' });
      }
    });

    if (newStudents.length > 0) {
      this.students = [...newStudents, ...this.students];
      saveToStorage(STORAGE_KEYS.STUDENTS, this.students);
    }

    return { importedCount: newStudents.length, generatedCredentials: generated };
  }

  public resetUserPassword(studentId: string, newPassword?: string): string {
    const student = this.students.find(s => s.id === studentId);
    if (!student) throw new Error('الطالب غير موجود');
    const pass = newPassword || '123456';
    return pass;
  }

  public canStudentBorrow(studentId: string) {
    return this.checkStudentBorrowEligibility(studentId);
  }

  public addSubmission(data: any) {
    return this.submitBookForReview(data);
  }

  
  public addWhitelistedPortal(portal: any) {
    return this.addPortal(portal);
  }

  public deleteWhitelistedPortal(id: string) {
    return this.deletePortal(id);
  }

  public updateWhitelistedPortal(id: string, updates: Partial<WhitelistedPortal>) {
    return this.updatePortal(id, updates);
  }

  public saveConfig(config: SystemConfig) {
    return this.updateConfig(config);
  }

  public getFavorites(studentId?: string): string[] {
    return this.getStudentFavorites(studentId);
  }

  public getReadingProgressMap(studentId?: string): Record<string, { currentPage: number; totalPages: number; lastReadAt?: string; percentage?: number; isCompleted?: boolean }> {
    const targetStudentId = studentId || (this.currentUser?.role === 'student' ? this.currentUser.id : 'stu-001');
    const map: Record<string, { currentPage: number; totalPages: number; lastReadAt?: string; percentage?: number; isCompleted?: boolean }> = {};
    
    this.progress
      .filter(p => p.studentId === targetStudentId && !p.isDismissed)
      .forEach(p => {
        map[p.bookId] = {
          currentPage: p.lastPage,
          totalPages: p.totalPages,
          lastReadAt: p.lastReadAt,
          percentage: p.percentage,
          isCompleted: p.isCompleted || p.lastPage >= p.totalPages,
        };
      });
    return map;
  }

  public saveReadingProgressByBook(bookId: string, currentPage: number, totalPages: number, studentId?: string) {
    const targetStudentId = studentId || (this.currentUser?.role === 'student' ? this.currentUser.id : 'stu-001');
    this.saveReadingProgress({
      studentId: targetStudentId,
      bookId,
      lastPage: currentPage,
      totalPages,
      percentage: Math.round((currentPage / (totalPages || 1)) * 100),
      lastReadAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
      isCompleted: currentPage >= totalPages,
      isDismissed: false,
    });
    this.addOpenBook(targetStudentId, bookId);
  }

  public exportDatabaseJSON(): string {
    const fullBackup = {
      exportedAt: new Date().toISOString(),
      config: this.config,
      students: this.students,
      loans: this.loans,
      portals: this.portals,
      submissions: this.submissions,
      notes: this.notes,
      progress: this.progress,
      favorites: this.favorites,
    };
    return JSON.stringify(fullBackup, null, 2);
  }

  public resetToDefaults(): void {
    localStorage.clear();
    this.students = INITIAL_STUDENTS;
    this.admin = INITIAL_ADMIN;
    this.loans = INITIAL_LOANS;
    this.loanRequests = INITIAL_LOAN_REQUESTS;
    this.notifications = INITIAL_NOTIFICATIONS;
    this.portals = INITIAL_WHITELISTED_PORTALS;
    this.submissions = INITIAL_PENDING_SUBMISSIONS;
    this.config = INITIAL_SYSTEM_CONFIG;
    this.notes = [];
    this.progress = INITIAL_STUDENT_PROGRESS;
    this.favorites = { 'stu-001': ['dig-001', 'phys-001'], 'stu-002': ['dig-003'] };
    this.searchHistory = {
      'stu-001': ['مقدمة ابن خلدون', 'الفقه الإسلامي وأدلته', 'شرح كتاب النيل'],
      'stu-002': ['تاريخ عمان', 'كتاب العين للفراهيدي'],
    };
    this.openBooks = {
      'stu-001': ['dig-001', 'dig-002'],
      'stu-002': ['dig-003'],
    };
    this.currentUser = INITIAL_ADMIN;
  }
}

export const storage = StorageService.getInstance();
