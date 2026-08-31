import {
  Category,
  PhysicalBook,
  DigitalBook,
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
  INITIAL_CATEGORIES,
  INITIAL_PHYSICAL_BOOKS,
  INITIAL_DIGITAL_BOOKS,
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
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
} from '../utils/security';
import { apiClient } from './apiClient';

const STORAGE_KEYS = {
  CATEGORIES: 'almanara_categories_v1',
  PHYSICAL_BOOKS: 'almanara_physical_books_v1',
  DIGITAL_BOOKS: 'almanara_digital_books_v1',
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

// Helper for local storage with fallback
function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    console.warn(`Error reading ${key} from storage:`, e);
    return fallback;
  }
}

function saveToStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Error saving ${key} to storage:`, e);
  }
}

export class StorageService {
  private static instance: StorageService;

  private categories: Category[];
  private physicalBooks: PhysicalBook[];
  private digitalBooks: DigitalBook[];
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
    this.categories = loadFromStorage(STORAGE_KEYS.CATEGORIES, INITIAL_CATEGORIES);
    this.physicalBooks = loadFromStorage(STORAGE_KEYS.PHYSICAL_BOOKS, INITIAL_PHYSICAL_BOOKS);
    this.digitalBooks = loadFromStorage(STORAGE_KEYS.DIGITAL_BOOKS, INITIAL_DIGITAL_BOOKS);
    const loadedStudents = loadFromStorage(STORAGE_KEYS.STUDENTS, INITIAL_STUDENTS);
    this.students = (loadedStudents || []).map((s: User) => {
      const init = INITIAL_STUDENTS.find(
        (i) => i.id === s.id || (i.registrationNumber && s.registrationNumber && i.registrationNumber.toUpperCase() === s.registrationNumber.toUpperCase())
      );
      const pwd = s.plainPassword || s.password || init?.plainPassword || init?.password || 'ahmed#2026!pass';
      return {
        ...s,
        password: pwd,
        plainPassword: pwd,
        isBlocked: s.isBlocked ?? s.isBlockedFromBorrowing ?? false,
        isBlockedFromBorrowing: s.isBlockedFromBorrowing ?? s.isBlocked ?? false,
      };
    });
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
    const activeBorrowedCounts: Record<string, number> = {};
    this.loans.forEach((loan) => {
      if (loan.status !== 'returned') {
        activeBorrowedCounts[loan.bookId] = (activeBorrowedCounts[loan.bookId] || 0) + 1;
      }
    });

    let hasChanges = false;
    this.physicalBooks = this.physicalBooks.map((book) => {
      const borrowedCount = activeBorrowedCounts[book.id] || 0;
      const total = typeof book.totalCopies === 'number' && book.totalCopies > 0 ? book.totalCopies : 1;
      const computedAvailable = Math.max(0, total - borrowedCount);

      if (book.availableCopies !== computedAvailable || book.totalCopies !== total) {
        hasChanges = true;
        return {
          ...book,
          totalCopies: total,
          availableCopies: computedAvailable,
        };
      }
      return book;
    });

    if (hasChanges) {
      saveToStorage(STORAGE_KEYS.PHYSICAL_BOOKS, this.physicalBooks);
    }
  }

  /**
   * Syncs entire state with the Central PostgreSQL / Relational Server
   */
  public async syncWithServer(): Promise<boolean> {
    try {
      // 1. Books
      const booksRes = await apiClient.get('/books');
      if (booksRes.success && Array.isArray(booksRes.data)) {
        const pBooks: PhysicalBook[] = [];
        const dBooks: DigitalBook[] = [];
        booksRes.data.forEach((b: any) => {
          if (b.format || b.fileSize || b.tableOfContents) {
            dBooks.push(b);
          } else {
            pBooks.push(b);
          }
        });
        if (pBooks.length > 0) {
          this.physicalBooks = pBooks;
          saveToStorage(STORAGE_KEYS.PHYSICAL_BOOKS, this.physicalBooks);
        }
        if (dBooks.length > 0) {
          this.digitalBooks = dBooks;
          saveToStorage(STORAGE_KEYS.DIGITAL_BOOKS, this.digitalBooks);
        }
      }

      // 2. Categories
      const catRes = await apiClient.get('/categories');
      if (catRes.success && Array.isArray(catRes.data) && catRes.data.length > 0) {
        this.categories = catRes.data;
        saveToStorage(STORAGE_KEYS.CATEGORIES, this.categories);
      }

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

  // --- Auth & Current User Session Defense ---
  public isAuthenticated(): boolean {
    return this.authenticated && !!this.currentUser;
  }

  public getCurrentUser(): User {
    return this.currentUser;
  }

  public setCurrentUser(user: User): void {
    this.currentUser = user;
    saveToStorage(STORAGE_KEYS.CURRENT_USER, user);
  }

  public logout(): void {
    this.authenticated = false;
    saveToStorage(STORAGE_KEYS.SESSION_ACTIVE, false);
  }

  public loginUser(
    regNumber: string,
    password?: string
  ): {
    success: boolean;
    user?: User;
    error?: string;
    isLocked?: boolean;
    remainingSeconds?: number;
    attemptsLeft?: number;
  } {
    const cleanReg = sanitizeText(regNumber).trim().toUpperCase();
    if (!cleanReg) {
      return { success: false, error: 'يرجى إدخال رقم القيد / رمز الدخول' };
    }

    // 1. Check Brute-Force Rate Limiting Lockout
    const rateCheck = checkRateLimit(cleanReg);
    if (rateCheck.isLocked) {
      return {
        success: false,
        error: `تم حظر محاولات الدخول مؤقتاً لحماية الحساب. يرجى الانتظار لمدة ${rateCheck.remainingSeconds} ثانية.`,
        isLocked: true,
        remainingSeconds: rateCheck.remainingSeconds,
        attemptsLeft: 0,
      };
    }

    // 2. Admin Authentication check
    const isAdminIdentifier = 
      this.admin.registrationNumber.toUpperCase() === cleanReg ||
      cleanReg === 'ADMIN' ||
      cleanReg === 'ADM-001' ||
      (this.admin.email && this.admin.email.toUpperCase() === cleanReg);

    if (isAdminIdentifier) {
      const trimmedPass = (password || '').trim();
      const adminPass = this.admin.password || 'admin@central#2026';
      
      if (!trimmedPass || trimmedPass !== adminPass) {
        const failResult = recordFailedAttempt(cleanReg);
        if (failResult.isNowLocked) {
          return {
            success: false,
            error: `تم قفل الحساب لمدة ${failResult.remainingSeconds} ثانية لاستنفاد 5 محاولات خاطئة متتالية.`,
            isLocked: true,
            remainingSeconds: failResult.remainingSeconds,
            attemptsLeft: 0,
          };
        }
        return {
          success: false,
          error: `كلمة المرور غير صحيحة. متبقي لديك ${failResult.attemptsLeft} محاولات.`,
          attemptsLeft: failResult.attemptsLeft,
        };
      }

      // Successful Admin Authentication
      resetRateLimit(cleanReg);
      this.authenticated = true;
      this.setCurrentUser(this.admin);
      saveToStorage(STORAGE_KEYS.SESSION_ACTIVE, true);
      return { success: true, user: this.admin };
    }

    // 3. Student Authentication check
    const student = this.students.find(
      s => s.registrationNumber.toUpperCase() === cleanReg ||
      (s.email && s.email.toUpperCase() === cleanReg) ||
      (s.id && s.id.toUpperCase() === cleanReg)
    );
    if (!student) {
      const failResult = recordFailedAttempt(cleanReg);
      return {
        success: false,
        error: `رقم القيد أو المعرف «${regNumber}» غير مسجل بالنظام.`,
        attemptsLeft: failResult.attemptsLeft,
      };
    }

    // Fallback to INITIAL_STUDENTS password if student record is missing it
    const initialStudent = INITIAL_STUDENTS.find(s => s.id === student.id || (s.registrationNumber && student.registrationNumber && s.registrationNumber.toUpperCase() === student.registrationNumber.toUpperCase()));
    const actualPassword = (student.plainPassword || student.password || initialStudent?.plainPassword || initialStudent?.password || '').trim();
    
    // Check student password
    const trimmedStudentPass = (password || '').trim();
    if (actualPassword && trimmedStudentPass !== actualPassword) {
      const failResult = recordFailedAttempt(cleanReg);
      if (failResult.isNowLocked) {
        return {
          success: false,
          error: `تم حظر الدخول مؤقتاً لمدة ${failResult.remainingSeconds} ثانية بسبب المحاولات المتكررة.`,
          isLocked: true,
          remainingSeconds: failResult.remainingSeconds,
          attemptsLeft: 0,
        };
      }
      return {
        success: false,
        error: `كلمة المرور غير صحيحة. متبقي لديك ${failResult.attemptsLeft} محاولات (يمكنك مراجعة أمين المكتبة لاسترجاعها).`,
        attemptsLeft: failResult.attemptsLeft,
      };
    }

    // Successful Student Authentication
    resetRateLimit(cleanReg);
    this.authenticated = true;
    this.setCurrentUser(student);
    saveToStorage(STORAGE_KEYS.SESSION_ACTIVE, true);
    return { success: true, user: student };
  }

  // --- Physical Books ---
  public getPhysicalBooks(): PhysicalBook[] {
    this.syncBookAvailability();
    return this.physicalBooks;
  }

  public addPhysicalBook(book: Omit<PhysicalBook, 'id' | 'addedAt'>): PhysicalBook {
    const total = typeof book.totalCopies === 'number' && book.totalCopies > 0 ? book.totalCopies : 1;
    const newBook: PhysicalBook = {
      ...book,
      id: `phys-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`,
      addedAt: new Date().toISOString().split('T')[0],
      totalCopies: total,
      availableCopies: total,
    };
    this.physicalBooks.unshift(newBook);
    this.syncBookAvailability();
    saveToStorage(STORAGE_KEYS.PHYSICAL_BOOKS, this.physicalBooks);
    return newBook;
  }

  public updatePhysicalBook(id: string, updates: Partial<PhysicalBook>): PhysicalBook | null {
    const index = this.physicalBooks.findIndex(b => b.id === id);
    if (index === -1) return null;

    this.physicalBooks[index] = { ...this.physicalBooks[index], ...updates };
    this.syncBookAvailability();
    saveToStorage(STORAGE_KEYS.PHYSICAL_BOOKS, this.physicalBooks);
    return this.physicalBooks[index];
  }

  public deletePhysicalBook(id: string): boolean {
    const activeLoans = this.loans.filter(l => l.bookId === id && l.status !== 'returned');
    if (activeLoans.length > 0) {
      throw new Error(`لا يمكن حذف هذا الكتاب لوجود ${activeLoans.length} عملية إعارة نشطة مرتبطة به حالياً.`);
    }
    this.physicalBooks = this.physicalBooks.filter(b => b.id !== id);
    this.syncBookAvailability();
    saveToStorage(STORAGE_KEYS.PHYSICAL_BOOKS, this.physicalBooks);
    return true;
  }

  // --- Digital Books ---
  public getDigitalBooks(): DigitalBook[] {
    return this.digitalBooks;
  }

  public addDigitalBook(book: Omit<DigitalBook, 'id' | 'addedAt' | 'downloadCount' | 'readCount'>): DigitalBook {
    const newBook: DigitalBook = {
      ...book,
      id: `dig-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`,
      addedAt: new Date().toISOString().split('T')[0],
      downloadCount: 0,
      readCount: 0,
      sampleContent: book.sampleContent || [
        `بسم الله الرحمن الرحيم\nكتاب: ${book.title}\nالمؤلف: ${book.author}\n\nهذا الملف مخزن في المستودع المركزي للمكتبة المدرسية...\n\nنبذة: ${book.summary}`,
        `الفصل الأول: المبادئ العامة والمفاهيم الأساسية.\n\nتم استيراد هذا الكتاب من مصادر موثوقة وفهرسته بواسطة نظام المكتبة المدرسية...`,
        `الفصل الثاني: التطبيقات والنتائج البحثية.\n\nيمكن للطلبة إضافة ملاحظات بحثية واقتباسات مرتبطة بهذه الصفحة للرجوع إليها في أي وقت.`,
      ],
    };
    this.digitalBooks.unshift(newBook);
    saveToStorage(STORAGE_KEYS.DIGITAL_BOOKS, this.digitalBooks);
    return newBook;
  }

  public incrementReadCount(bookId: string): void {
    const book = this.digitalBooks.find(b => b.id === bookId);
    if (book) {
      book.readCount += 1;
      saveToStorage(STORAGE_KEYS.DIGITAL_BOOKS, this.digitalBooks);
    }
  }

  // --- Categories & Bulk Reclassification ---
  public getCategories(): Category[] {
    return this.categories.map(cat => ({
      ...cat,
      booksCount:
        this.physicalBooks.filter(b => b.categoryId === cat.id).length +
        this.digitalBooks.filter(b => b.categoryId === cat.id).length,
    }));
  }

  public addCategory(cat: Omit<Category, 'id'>): Category {
    const newCat: Category = {
      ...cat,
      id: `cat-${Date.now().toString(36)}`,
    };
    this.categories.push(newCat);
    saveToStorage(STORAGE_KEYS.CATEGORIES, this.categories);
    return newCat;
  }

  public updateCategory(id: string, updates: Partial<Category>): Category | null {
    const index = this.categories.findIndex(c => c.id === id);
    if (index === -1) return null;
    this.categories[index] = { ...this.categories[index], ...updates };
    saveToStorage(STORAGE_KEYS.CATEGORIES, this.categories);
    return this.categories[index];
  }

  // Safe deletion with bulk reassign
  public deleteCategoryWithReassign(categoryIdToDelete: string, targetCategoryId: string): { reclassifiedPhysical: number; reclassifiedDigital: number } {
    if (categoryIdToDelete === targetCategoryId) {
      throw new Error('لا يمكن إعادة تصنيف الكتب إلى نفس التصنيف المراد حذفه');
    }

    let pCount = 0;
    let dCount = 0;

    // Reassign physical books
    this.physicalBooks = this.physicalBooks.map(book => {
      if (book.categoryId === categoryIdToDelete) {
        pCount++;
        return { ...book, categoryId: targetCategoryId };
      }
      return book;
    });

    // Reassign digital books
    this.digitalBooks = this.digitalBooks.map(book => {
      if (book.categoryId === categoryIdToDelete) {
        dCount++;
        return { ...book, categoryId: targetCategoryId };
      }
      return book;
    });

    // Delete category
    this.categories = this.categories.filter(c => c.id !== categoryIdToDelete);

    saveToStorage(STORAGE_KEYS.PHYSICAL_BOOKS, this.physicalBooks);
    saveToStorage(STORAGE_KEYS.DIGITAL_BOOKS, this.digitalBooks);
    saveToStorage(STORAGE_KEYS.CATEGORIES, this.categories);

    return { reclassifiedPhysical: pCount, reclassifiedDigital: dCount };
  }

  public bulkReclassifyBooks(
    physicalBookIds: string[],
    digitalBookIds: string[],
    newCategoryId: string
  ): void {
    if (physicalBookIds.length > 0) {
      this.physicalBooks = this.physicalBooks.map(b =>
        physicalBookIds.includes(b.id) ? { ...b, categoryId: newCategoryId } : b
      );
      saveToStorage(STORAGE_KEYS.PHYSICAL_BOOKS, this.physicalBooks);
    }

    if (digitalBookIds.length > 0) {
      this.digitalBooks = this.digitalBooks.map(b =>
        digitalBookIds.includes(b.id) ? { ...b, categoryId: newCategoryId } : b
      );
      saveToStorage(STORAGE_KEYS.DIGITAL_BOOKS, this.digitalBooks);
    }
  }

  // --- Circulation & Loans ---
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
  }): LoanRecord {
    const book = this.physicalBooks.find(b => b.id === params.bookId);
    if (!book) throw new Error('الكتاب غير موجود');
    if (book.availableCopies <= 0) throw new Error('لا توجد نسخ متوفرة حالياً من هذا الكتاب للإعارة');

    const student = this.students.find(s => s.id === params.studentId);
    if (!student) throw new Error('الطالب غير موجود');

    // Check eligibility
    const eligibility = this.checkStudentBorrowEligibility(student.id);
    if (!eligibility.canBorrow && !params.isOverrideExemption) {
      throw new Error(`تعذر إتمام الإعارة: ${eligibility.reason}`);
    }

    const durationDays =
      params.customDurationDays ||
      (params.purpose === 'academic_research'
        ? this.config.academicResearchDurationDays
        : this.config.generalReadingDurationDays);

    const now = new Date();
    const dueDate = new Date();
    dueDate.setDate(now.getDate() + durationDays);

    const newLoan: LoanRecord = {
      id: `loan-${Date.now().toString(36)}`,
      bookId: book.id,
      bookTitle: book.title,
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
    this.syncBookAvailability();

    saveToStorage(STORAGE_KEYS.LOANS, this.loans);

    return newLoan;
  }

  public extendLoan(loanId: string, additionalDays: number = 7, notes?: string): LoanRecord {
    const loan = this.loans.find(l => l.id === loanId);
    if (!loan) throw new Error('سجل الإعارة غير موجود');
    if (loan.status === 'returned') throw new Error('تم إرجاع الكتاب مسبقاً');
    if (loan.extensionCount >= loan.maxExtensionsAllowed) {
      throw new Error(`وصل الكتاب للحد الأقصى المسموح به للتمديد (${loan.maxExtensionsAllowed} مرات)`);
    }

    const currentDue = new Date(loan.dueDate);
    const newDue = new Date(currentDue);
    newDue.setDate(newDue.getDate() + additionalDays);

    loan.dueDate = newDue.toISOString().split('T')[0];
    loan.extensionCount += 1;
    loan.status = 'extended';
    if (notes) loan.notes = (loan.notes ? loan.notes + ' | ' : '') + notes;

    saveToStorage(STORAGE_KEYS.LOANS, this.loans);
    this.recalculateLoanStatuses();
    return loan;
  }

  public returnBook(loanId: string, notes?: string): LoanRecord {
    const loan = this.loans.find(l => l.id === loanId);
    if (!loan) throw new Error('سجل الإعارة غير موجود');
    if (loan.status === 'returned') throw new Error('تم إرجاع هذا الكتاب مسبقاً');

    loan.status = 'returned';
    loan.returnDate = new Date().toISOString().split('T')[0];
    if (notes) loan.notes = (loan.notes ? loan.notes + ' | ' : '') + `تم الإرجاع: ${notes}`;

    saveToStorage(STORAGE_KEYS.LOANS, this.loans);
    this.recalculateLoanStatuses();
    this.syncBookAvailability();
    return loan;
  }

  public returnLoan(loanId: string, notes?: string): LoanRecord {
    return this.returnBook(loanId, notes);
  }

  public getLoanRequests(studentId?: string): PhysicalLoanRequest[] {
    return this.getPhysicalLoanRequests(studentId);
  }

  private recalculateLoanStatuses(): void {
    const today = new Date().toISOString().split('T')[0];
    let changed = false;

    this.loans.forEach(loan => {
      if (loan.status !== 'returned') {
        if (loan.dueDate < today) {
          if (loan.status !== 'overdue') {
            loan.status = 'overdue';
            changed = true;
          }
        }
      }
    });

    if (changed) {
      saveToStorage(STORAGE_KEYS.LOANS, this.loans);
    }
  }

  // --- Physical Book Loan Requests & Automated Handover Workflow ---
  public getPhysicalLoanRequests(studentId?: string): PhysicalLoanRequest[] {
    if (studentId) {
      return this.loanRequests.filter((r) => r.studentId === studentId);
    }
    return this.loanRequests;
  }

  public requestPhysicalLoan(params: {
    bookId: string;
    studentId: string;
    purpose: string;
    customReason?: string;
    requestedDurationDays?: number;
  }): PhysicalLoanRequest {
    const book = this.physicalBooks.find((b) => b.id === params.bookId);
    if (!book) throw new Error('الكتاب المطلوب غير موجود في المكتبة الورقية');
    if (book.availableCopies <= 0) {
      throw new Error('عذراً، جميع نسخ هذا الكتاب مستعارة حالياً ولا توجد نسخ على الرفوف');
    }

    const student = this.students.find((s) => s.id === params.studentId);
    if (!student) throw new Error('بيانات الطالب غير مسجلة');

    // Check if student has an existing active or pending request for the same book
    const existingReq = this.loanRequests.find(
      (r) =>
        r.studentId === student.id &&
        r.bookId === book.id &&
        (r.status === 'pending' || r.status === 'approved')
    );
    if (existingReq) {
      throw new Error('لديك طلب سابق سارٍ أو قيد المراجعة لهذا الكتاب بالفعل');
    }

    const newRequest: PhysicalLoanRequest = {
      id: `req-${Date.now().toString(36)}`,
      bookId: book.id,
      bookTitle: book.title,
      bookAuthor: book.author,
      bookLocation: book.location,
      studentId: student.id,
      studentName: student.name,
      studentRegNumber: student.registrationNumber,
      studentGrade: student.grade,
      purpose: params.purpose,
      customReason: params.customReason,
      requestedDurationDays: params.requestedDurationDays,
      requestedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
      status: 'pending',
    };

    this.loanRequests.unshift(newRequest);
    saveToStorage(STORAGE_KEYS.LOAN_REQUESTS, this.loanRequests);

    const durationNotice = params.requestedDurationDays
      ? ` (المدة المقترحة من الطالب: ${params.requestedDurationDays} يوماً)`
      : '';

    // Send notification to Admin
    this.addNotification({
      recipientId: 'admin',
      recipientRole: 'admin',
      title: 'طلب استعارة كتاب جديد',
      message: `قام الطالب ${student.name} (${student.grade || 'طالب'}) بتقديم طلب استعارة لكتاب "${book.title}"${durationNotice}.`,
      type: 'loan_request_submitted',
      targetTab: 'loans',
      targetEntityId: newRequest.id,
    });

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

    const book = this.physicalBooks.find((b) => b.id === req.bookId);
    if (!book || book.availableCopies <= 0) {
      throw new Error('لا توجد نسخ متوفرة على الرفوف حالياً للموافقة');
    }

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

    const book = this.physicalBooks.find((b) => b.id === req.bookId);
    if (!book) throw new Error('الكتاب غير موجود');
    if (book.availableCopies <= 0) throw new Error('لا توجد نسخ متوفرة من هذا الكتاب على الرفوف');

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
      bookId: book.id,
      bookTitle: book.title,
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
      message: `تم تسجيل خروج كتاب "${book.title}" بنجاح. موعد الإرجاع المحدد: ${dueDate.toISOString().split('T')[0]}. حافظ على سلامة الكتاب ونظافته.`,
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
    const pass = (student.plainPassword || student.password || this.generateAutoPassword(student.name)).trim();
    const newStudent: User = {
      ...student,
      id: `stu-${Date.now().toString(36)}`,
      role: 'student',
      password: pass,
      plainPassword: pass,
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
          const autoPassword = this.generateAutoPassword(name);
          const student: User = {
            id: `stu-import-${Date.now().toString(36)}-${index}`,
            name,
            registrationNumber: reg,
            grade,
            phone,
            email,
            password: autoPassword,
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

  public revealStudentPassword(studentId: string): string {
    const student = this.students.find(s => s.id === studentId);
    if (!student) throw new Error('الطالب غير موجود');
    return student.password || 'لا توجد كلمة مرور مسجلة';
  }

  public updateStudent(id: string, updates: Partial<User>): User | null {
    const index = this.students.findIndex(s => s.id === id);
    if (index === -1) return null;
    const pwd = updates.plainPassword || updates.password || this.students[index].plainPassword || this.students[index].password;
    this.students[index] = { 
      ...this.students[index], 
      ...updates,
      password: pwd,
      plainPassword: pwd,
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

  public approveSubmission(submissionId: string, approvedCategoryId?: string): DigitalBook {
    const sub = this.submissions.find(s => s.id === submissionId);
    if (!sub) throw new Error('طلب الرفع غير موجود');
    if (sub.status !== 'pending') throw new Error('تم البت في هذا الطلب مسبقاً');

    const catId = approvedCategoryId || sub.suggestedCategoryId;

    // Create central digital book
    const digitalBook = this.addDigitalBook({
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

    sub.status = 'approved';
    sub.reviewedAt = new Date().toISOString().replace('T', ' ').substring(0, 16);
    sub.reviewedBy = this.admin.name;

    saveToStorage(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    return digitalBook;
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
        const pass = this.generateAutoPassword(row.name);
        const student: User = {
          id: `stu-imp-${Date.now().toString(36)}-${idx}`,
          name: row.name.trim(),
          registrationNumber: row.registrationNumber.trim(),
          grade: row.grade?.trim() || 'الصف العام',
          role: 'student',
          password: pass,
          plainPassword: pass,
          isBlocked: false,
          isBlockedFromBorrowing: false,
          createdAt: new Date().toISOString().split('T')[0],
        };
        newStudents.push(student);
        generated.push({ name: student.name, regNumber: student.registrationNumber, tempPass: pass });
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
    const pass = newPassword || this.generateAutoPassword(student.name);
    student.password = pass;
    student.plainPassword = pass;
    saveToStorage(STORAGE_KEYS.STUDENTS, this.students);
    return pass;
  }

  public canStudentBorrow(studentId: string) {
    return this.checkStudentBorrowEligibility(studentId);
  }

  public addSubmission(data: any) {
    return this.submitBookForReview(data);
  }

  public incrementDigitalReadCount(bookId: string) {
    this.incrementReadCount(bookId);
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
      categories: this.categories,
      physicalBooks: this.physicalBooks,
      digitalBooks: this.digitalBooks,
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
    this.categories = INITIAL_CATEGORIES;
    this.physicalBooks = INITIAL_PHYSICAL_BOOKS;
    this.digitalBooks = INITIAL_DIGITAL_BOOKS;
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
