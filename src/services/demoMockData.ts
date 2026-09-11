import { Category, PhysicalBook, DigitalBook, LoanRecord, User, SystemConfig } from '../types/library';

export const mockCategories: Category[] = [
  {
    id: 'cat-1',
    name: 'علوم الحاسوب',
    description: 'كتب متعلقة بالبرمجة والتكنولوجيا',
    color: '#3b82f6',
    iconName: 'Computer',
    booksCount: 15
  },
  {
    id: 'cat-2',
    name: 'التاريخ الإسلامي',
    description: 'كتب وسير تاريخية',
    color: '#10b981',
    iconName: 'Book',
    booksCount: 30
  }
];

export const mockPhysicalBooks: PhysicalBook[] = [
  {
    id: 'pb-1',
    title: 'مقدمة في الذكاء الاصطناعي',
    author: 'أحمد محمد',
    categoryId: 'cat-1',
    location: { cabinet: 'أ', shelf: '1' },
    totalCopies: 5,
    availableCopies: 3,
    summary: 'كتاب شامل عن أساسيات الذكاء الاصطناعي',
    language: 'Arabic',
    tags: ['AI', 'Tech'],
    addedAt: new Date().toISOString()
  },
  {
    id: 'pb-2',
    title: 'تاريخ الأندلس',
    author: 'طارق علي',
    categoryId: 'cat-2',
    location: { cabinet: 'ب', shelf: '2' },
    totalCopies: 2,
    availableCopies: 2,
    summary: 'دراسة في تاريخ وحضارة الأندلس',
    language: 'Arabic',
    tags: ['تاريخ', 'الأندلس'],
    addedAt: new Date().toISOString()
  }
];

export const mockDigitalBooks: DigitalBook[] = [
  {
    id: 'db-1',
    title: 'البرمجة بلغة جافا',
    author: 'سعيد عبدالله',
    categoryId: 'cat-1',
    format: 'pdf',
    fileSize: '5MB',
    pagesCount: 300,
    summary: 'مرجع كامل في لغة جافا',
    tags: ['Java', 'Programming'],
    downloadCount: 120,
    readCount: 450,
    addedAt: new Date().toISOString()
  }
];

export const mockLoans: LoanRecord[] = [
  {
    id: 'loan-1',
    bookId: 'pb-1',
    bookTitle: 'مقدمة في الذكاء الاصطناعي',
    studentId: 'demo-student-id',
    studentName: 'طالب / باحث (نسخة تجريبية)',
    studentRegNumber: 'STU-2026-101',
    purpose: 'academic_research',
    issueDate: new Date().toISOString(),
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active',
    extensionCount: 0,
    maxExtensionsAllowed: 2
  }
];

export const mockUsers: User[] = [
  {
    id: 'demo-student-id',
    name: 'طالب / باحث (نسخة تجريبية)',
    role: 'student',
    registrationNumber: 'STU-2026-101',
    createdAt: new Date().toISOString()
  },
  {
    id: 'demo-admin-id',
    name: 'مدير النظام (نسخة تجريبية)',
    role: 'admin',
    registrationNumber: 'ADM-001',
    createdAt: new Date().toISOString()
  }
];

export const mockSettings: SystemConfig = {
  schoolName: 'مدرسة المشكاة',
  libraryName: 'المكتبة المركزية',
  generalReadingDurationDays: 7,
  academicResearchDurationDays: 14,
  maxExtensionsAllowed: 2
};
