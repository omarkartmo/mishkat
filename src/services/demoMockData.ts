import { Category, PhysicalBook, DigitalBook, LoanRecord, User, SystemConfig } from '../types/library';

export const mockCategories: Category[] = [
  {
    id: 'cat-1',
    name: 'علوم الحاسوب',
    description: 'كتب متعلقة بالبرمجة والتكنولوجيا',
    color: '#3b82f6',
    iconName: 'Computer',
    booksCount: 3
  },
  {
    id: 'cat-2',
    name: 'التاريخ الإسلامي',
    description: 'كتب وسير تاريخية',
    color: '#10b981',
    iconName: 'Book',
    booksCount: 4
  },
  {
    id: 'cat-3',
    name: 'الأدب العربي',
    description: 'روايات، شعر، ودراسات أدبية',
    color: '#8b5cf6',
    iconName: 'BookOpen',
    booksCount: 5
  },
  {
    id: 'cat-4',
    name: 'العلوم الشرعية',
    description: 'فقه، عقيدة، وتفسير',
    color: '#f59e0b',
    iconName: 'Library',
    booksCount: 3
  }
];

export const mockPhysicalBooks: PhysicalBook[] = [
  {
    id: 'pb-1', title: 'البداية والنهاية', author: 'ابن كثير', categoryId: 'cat-2',
    location: { cabinet: 'أ', shelf: '1' }, totalCopies: 5, availableCopies: 3,
    summary: 'موسوعة تاريخية ضخمة تسرد التاريخ من بداية الخلق حتى نهايته', language: 'Arabic', tags: ['تاريخ', 'موسوعة'], addedAt: new Date().toISOString()
  },
  {
    id: 'pb-2', title: 'مقدمة ابن خلدون', author: 'ابن خلدون', categoryId: 'cat-2',
    location: { cabinet: 'أ', shelf: '2' }, totalCopies: 2, availableCopies: 2,
    summary: 'يعتبر المؤسس لعلم الاجتماع، يتناول العمران البشري', language: 'Arabic', tags: ['تاريخ', 'علم اجتماع'], addedAt: new Date().toISOString()
  },
  {
    id: 'pb-3', title: 'الرحيق المختوم', author: 'صفي الرحمن المباركفوري', categoryId: 'cat-4',
    location: { cabinet: 'ب', shelf: '1' }, totalCopies: 10, availableCopies: 8,
    summary: 'بحث في السيرة النبوية على صاحبها أفضل الصلاة والسلام', language: 'Arabic', tags: ['سيرة نبوية'], addedAt: new Date().toISOString()
  },
  {
    id: 'pb-4', title: 'رياض الصالحين', author: 'النووي', categoryId: 'cat-4',
    location: { cabinet: 'ب', shelf: '1' }, totalCopies: 15, availableCopies: 12,
    summary: 'من كلام سيد المرسلين', language: 'Arabic', tags: ['حديث', 'فقه'], addedAt: new Date().toISOString()
  },
  {
    id: 'pb-5', title: 'البيان والتبيين', author: 'الجاحظ', categoryId: 'cat-3',
    location: { cabinet: 'ج', shelf: '3' }, totalCopies: 3, availableCopies: 1,
    summary: 'من أهم كتب الأدب العربي القديم', language: 'Arabic', tags: ['أدب', 'بلاغة'], addedAt: new Date().toISOString()
  },
  {
    id: 'pb-6', title: 'كليلة ودمنة', author: 'ابن المقفع', categoryId: 'cat-3',
    location: { cabinet: 'ج', shelf: '3' }, totalCopies: 6, availableCopies: 4,
    summary: 'مجموعة قصصية على لسان الحيوانات', language: 'Arabic', tags: ['قصص', 'أدب'], addedAt: new Date().toISOString()
  },
  {
    id: 'pb-7', title: 'تاريخ الطبري', author: 'ابن جرير الطبري', categoryId: 'cat-2',
    location: { cabinet: 'أ', shelf: '3' }, totalCopies: 4, availableCopies: 0,
    summary: 'تاريخ الأمم والملوك', language: 'Arabic', tags: ['تاريخ'], addedAt: new Date().toISOString()
  },
  {
    id: 'pb-8', title: 'العقد الفريد', author: 'ابن عبد ربه', categoryId: 'cat-3',
    location: { cabinet: 'ج', shelf: '1' }, totalCopies: 3, availableCopies: 2,
    summary: 'موسوعة أدبية وتاريخية', language: 'Arabic', tags: ['أدب', 'شعر'], addedAt: new Date().toISOString()
  },
  {
    id: 'pb-9', title: 'هياكل البيانات والخوارزميات', author: 'محمد علي', categoryId: 'cat-1',
    location: { cabinet: 'د', shelf: '1' }, totalCopies: 5, availableCopies: 5,
    summary: 'أساسيات الخوارزميات وهياكل البيانات بلغة جافا', language: 'Arabic', tags: ['برمجة', 'جافا'], addedAt: new Date().toISOString()
  },
  {
    id: 'pb-10', title: 'مبادئ الذكاء الاصطناعي', author: 'أحمد إبراهيم', categoryId: 'cat-1',
    location: { cabinet: 'د', shelf: '2' }, totalCopies: 8, availableCopies: 6,
    summary: 'شرح مفصل لمبادئ الذكاء الاصطناعي الحديث', language: 'Arabic', tags: ['ذكاء اصطناعي'], addedAt: new Date().toISOString()
  }
];

export const mockDigitalBooks: DigitalBook[] = [
  {
    id: 'db-1', title: 'تصميم واجهات المستخدم', author: 'ياسر محمد', categoryId: 'cat-1',
    format: 'pdf', fileSize: '12MB', pagesCount: 250, summary: 'دليل عملي لتصميم واجهات المستخدم الحديثة',
    tags: ['UI/UX', 'تصميم'], downloadCount: 540, readCount: 1200, addedAt: new Date().toISOString()
  },
  {
    id: 'db-2', title: 'ديوان المتنبي', author: 'أبو الطيب المتنبي', categoryId: 'cat-3',
    format: 'epub', fileSize: '2MB', pagesCount: 410, summary: 'قصائد وأشعار المتنبي كاملة ومحققة',
    tags: ['شعر', 'أدب'], downloadCount: 890, readCount: 3400, addedAt: new Date().toISOString()
  },
  {
    id: 'db-3', title: 'فن الحرب', author: 'صن تزو', categoryId: 'cat-2',
    format: 'pdf', fileSize: '5MB', pagesCount: 150, summary: 'كتاب استراتيجي قديم مترجم للعربية',
    tags: ['استراتيجية', 'تاريخ'], downloadCount: 430, readCount: 950, addedAt: new Date().toISOString()
  },
  {
    id: 'db-4', title: 'مدخل إلى لغة بايثون', author: 'خالد السعيد', categoryId: 'cat-1',
    format: 'pdf', fileSize: '8MB', pagesCount: 300, summary: 'تعلم البرمجة بلغة بايثون من الصفر',
    tags: ['بايثون', 'برمجة'], downloadCount: 1200, readCount: 4500, addedAt: new Date().toISOString()
  },
  {
    id: 'db-5', title: 'تفسير ابن كثير الميسر', author: 'جماعة من العلماء', categoryId: 'cat-4',
    format: 'epub', fileSize: '18MB', pagesCount: 1200, summary: 'تفسير القرآن العظيم لابن كثير بتنسيق رقمي',
    tags: ['تفسير', 'قرآن'], downloadCount: 3200, readCount: 8900, addedAt: new Date().toISOString()
  }
];

export const mockLoans: LoanRecord[] = [
  {
    id: 'loan-1',
    bookId: 'pb-1',
    bookTitle: 'البداية والنهاية',
    studentId: 'demo-student-id',
    studentName: 'طالب / باحث (نسخة تجريبية)',
    studentRegNumber: 'STU-2026-101',
    purpose: 'academic_research',
    issueDate: new Date().toISOString(),
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active',
    extensionCount: 0,
    maxExtensionsAllowed: 2
  },
  {
    id: 'loan-2',
    bookId: 'pb-7',
    bookTitle: 'تاريخ الطبري',
    studentId: 'demo-student-id',
    studentName: 'طالب / باحث (نسخة تجريبية)',
    studentRegNumber: 'STU-2026-101',
    purpose: 'general_reading',
    issueDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'overdue',
    extensionCount: 2,
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
  schoolName: 'معهد المنهاج للتربية والتعليم',
  libraryName: 'المكتبة المركزية',
  generalReadingDurationDays: 7,
  academicResearchDurationDays: 14,
  maxExtensionsAllowed: 2
};
