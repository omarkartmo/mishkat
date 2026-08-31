export type UserRole = 'admin' | 'student';

export type NavigationTab =
  | 'overview'
  | 'physical'
  | 'loans'
  | 'digital'
  | 'favorites'
  | 'reading_workspace'
  | 'portals'
  | 'reviews'
  | 'students'
  | 'categories'
  | 'student_portal'
  | 'search_results'
  | 'settings';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  registrationNumber: string; // e.g. STU-2026-001 or ADM-01
  grade?: string; // e.g. "الصف العاشر - أ"
  email?: string;
  phone?: string;
  avatarUrl?: string;
  password?: string; // Stored for admin lookup when student forgets
  plainPassword?: string; // For instant 1-click admin lookup
  isBlocked?: boolean;
  isBlockedFromBorrowing?: boolean;
  blockReason?: string;
  createdAt: string;
}

export interface StudentRosterRow {
  registrationNumber: string;
  name: string;
  grade?: string;
}

export type LoanPurpose = 'general_reading' | 'academic_research';
export type LoanStatus = 'active' | 'extended' | 'returned' | 'overdue';

export interface ShelfLocation {
  cabinet: string; // e.g. "خزانة أ"
  shelf: string;    // e.g. "رف 2"
  section?: string;  // e.g. "قسم التراث والعلوم الشرعية"
}

export interface PhysicalBook {
  id: string;
  title: string;
  author: string;
  publisher?: string;
  publishYear?: number;
  isbn?: string;
  categoryId: string;
  location: ShelfLocation;
  totalCopies: number;
  availableCopies: number;
  summary: string;
  coverImage?: string;
  pages?: number;
  language: string;
  tags: string[];
  addedAt: string;
}

export type BookFormat = 'pdf' | 'epub';

export interface DigitalBook {
  id: string;
  title: string;
  author: string;
  categoryId: string;
  format: BookFormat;
  fileSize: string;
  fileUrl?: string;
  pagesCount: number;
  summary: string;
  coverImage?: string;
  sourceOrigin?: string; // e.g., "المكتبة الإباضية الشاملة"
  uploadedBy?: string;   // Student ID or "admin"
  tags: string[];
  downloadCount: number;
  readCount: number;
  addedAt: string;
  tableOfContents?: { title: string; page: number }[];
  sampleContent?: string[]; // Page-by-page content for in-app reading
}

export interface Category {
  id: string;
  name: string;
  nameEn?: string;
  description: string;
  color: string;
  iconName: string;
  booksCount?: number;
}

export interface LoanRecord {
  id: string;
  bookId: string;
  bookTitle: string;
  studentId: string;
  studentName: string;
  studentRegNumber: string;
  purpose: LoanPurpose;
  issueDate: string;
  dueDate: string;
  returnDate?: string;
  status: LoanStatus;
  extensionCount: number;
  maxExtensionsAllowed: number;
  notes?: string;
  isOverrideExemption?: boolean; // When admin allows borrowing despite previous late
  overrideReason?: string;
}

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface PendingBookSubmission {
  id: string;
  title: string;
  author: string;
  suggestedCategoryId: string;
  format: BookFormat;
  sourceUrl?: string;
  sourcePortalName: string;
  summary: string;
  studentId: string;
  studentName: string;
  studentRegNumber: string;
  submittedAt: string;
  status: SubmissionStatus;
  adminFeedback?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  tempFileUrl?: string;
  pagesEstimated?: number;
}

export interface WhitelistedPortal {
  id: string;
  name: string;
  description: string;
  url: string;
  category: string;
  icon: string;
  isFeatured: boolean;
  notes?: string;
  allowedDomains: string[];
}

export type BookMedium = 'physical' | 'digital';

export interface PhysicalBookmark {
  id: string;
  studentId: string;
  bookId: string;
  bookTitle: string;
  bookAuthor?: string;
  location?: ShelfLocation;
  currentPage: number;
  totalPages: number;
  chapterOrTopic?: string;
  lastSessionDate: string;
  quickNote?: string;
  isCompleted?: boolean;
}

export type SummaryStructureType = 'structured' | 'cornell' | 'bullet_insights' | 'mindmap_bullets' | 'quote_analysis';

export interface BookSummary {
  id: string;
  studentId: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  bookMedium: BookMedium;
  title: string;
  structureType: SummaryStructureType;
  mainIdea: string;
  keyTakeaways: string[];
  chaptersSummaries?: {
    chapterTitle: string;
    pagesRange?: string;
    keyPoints: string[];
  }[];
  favoriteQuotes?: {
    quote: string;
    page?: number;
    reflection?: string;
  }[];
  actionableInsights?: string[];
  tags: string[];
  rating?: number; // 1 to 5 stars
  createdAt: string;
  updatedAt?: string;
}

export interface StudentNote {
  id: string;
  studentId?: string;
  bookId: string;
  bookTitle: string;
  bookMedium?: BookMedium;
  pageNumber: number;
  chapter?: string;
  quote?: string;
  content: string;
  colorTag?: 'amber' | 'emerald' | 'sky' | 'rose' | 'purple';
  category?: 'فائدة فقهية' | 'اقتباس مميز' | 'فكرة للبحث' | 'إشكال وتساؤل' | 'ملخص باب' | 'عام';
  createdAt: string;
  tags?: string[];
}

export interface ReadingProgress {
  currentPage: number;
  totalPages: number;
  lastReadAt?: string;
  percentage?: number;
  isCompleted?: boolean;
}

export interface StudentReadingProgress {
  id?: string;
  studentId?: string;
  bookId: string;
  lastPage: number;
  totalPages: number;
  percentage: number;
  lastReadAt: string;
  isCompleted: boolean;
  isDismissed?: boolean;
}

export interface SystemConfig {
  schoolName: string;
  libraryName: string;
  generalReadingDurationDays: number;
  academicResearchDurationDays: number;
  maxActiveLoansPerStudent?: number;
  maxExtensionsAllowed: number;
  extensionDurationDays?: number;
  autoBlockOverdue?: boolean;
  autoBlockOverdueStudents?: boolean;
  allowStudentIngestion?: boolean;
  serverPort?: number;
  serverHost?: string;
  predefinedLoanReasons?: string[];
}

export type LoanRequestStatus = 'pending' | 'approved' | 'handed_over' | 'rejected' | 'cancelled';

export interface PhysicalLoanRequest {
  id: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  bookLocation: ShelfLocation;
  studentId: string;
  studentName: string;
  studentRegNumber: string;
  studentGrade?: string;
  purpose: string; // e.g. 'بحث أكاديمي', 'مطالعة عامة', or custom text
  customReason?: string;
  requestedDurationDays?: number; // The duration requested by the student (subject to admin approval)
  requestedAt: string;
  status: LoanRequestStatus;
  approvedDurationDays?: number;
  approvedAt?: string;
  dueDateCalculated?: string;
  adminNotes?: string;
  rejectionReason?: string;
  handedOverAt?: string;
  loanRecordId?: string;
}

export type NotificationType =
  | 'loan_request_submitted'
  | 'loan_request_approved'
  | 'loan_request_rejected'
  | 'loan_handed_over'
  | 'loan_overdue'
  | 'book_submission_approved'
  | 'book_submission_rejected'
  | 'system';

export interface AppNotification {
  id: string;
  recipientId: string; // studentId or 'admin' or 'all'
  recipientRole?: UserRole;
  title: string;
  message: string;
  type: NotificationType;
  targetTab: NavigationTab;
  targetEntityId?: string; // e.g. loanRequestId, bookId, etc.
  isRead: boolean;
  createdAt: string;
}
