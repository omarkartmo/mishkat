import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  BookOpen,
  Library,
  Bookmark,
  Star,
  FileText,
  MapPin,
  Filter,
  SlidersHorizontal,
  ArrowUpDown,
  Sparkles,
  CheckCircle2,
  ChevronLeft,
  X,
  ExternalLink,
  BookMarked,
  Info,
  Calendar,
  Layers,
  Tag,
  Building,
  GraduationCap,
  FolderUp,
  Plus,
  LayoutGrid,
  List,
  Eye,
  Trash2,
  AlertCircle,
  MinusCircle,
  PlusCircle,
  Edit2,
} from 'lucide-react';
import {
  PhysicalBook,
  DigitalBook,
  Category,
  User,
  SystemConfig,
  NavigationTab,
} from '../../types/library';
import { matchesArabicQuery } from '../../utils/searchUtils';
import { BulkDigitalImportModal } from '../digital/BulkDigitalImportModal';
import { AddDigitalBookModal } from '../digital/AddDigitalBookModal';
import { EditDigitalBookModal } from '../digital/EditDigitalBookModal';
import { BookFormModal } from '../physical/PhysicalLibraryView';

interface SearchResultsViewProps {
  initialQuery?: string;
  searchTrigger?: number;
  onQueryChange?: (query: string) => void;
  physicalBooks: PhysicalBook[];
  digitalBooks: DigitalBook[];
  categories: Category[];
  currentUser: User;
  systemConfig?: SystemConfig;
  favoriteBookIds?: string[];
  onToggleFavorite?: (bookId: string) => void;
  onOpenReader?: (book: DigitalBook) => void;
  onOpenPhysicalBookmark?: (book: PhysicalBook) => void;
  onRequestLoanSubmit?: (params: {
    bookId: string;
    studentId: string;
    purpose: string;
    customReason?: string;
    requestedDurationDays?: number;
  }) => void;
  onQuickLoan?: (bookId: string) => void;
  onNavigateTab?: (tab: NavigationTab) => void;
  onAddDigitalBook?: (book: Omit<DigitalBook, 'id' | 'addedAt' | 'downloadCount' | 'readCount'>) => void;
  onBulkAddDigitalBooks?: (books: Omit<DigitalBook, 'id' | 'addedAt' | 'downloadCount' | 'readCount'>[]) => void;
  onUpdateDigitalBook?: (id: string, updates: Partial<DigitalBook>) => void;
  onDeleteDigitalBook?: (id: string) => Promise<any> | void;
  onAddPhysicalBook?: (book: Omit<PhysicalBook, 'id' | 'addedAt' | 'availableCopies'>) => void;
  onUpdatePhysicalBook?: (id: string, updates: Partial<PhysicalBook>) => void;
  onDeletePhysicalBook?: (id: string, options?: { copiesCount?: number; reason?: string }) => Promise<any> | void;
}

const POPULAR_RESEARCH_TOPICS = [
  { id: 'fiqh', label: 'الفقه وأصوله', query: 'فقه' },
  { id: 'history', label: 'التاريخ والتراجم', query: 'تاريخ' },
  { id: 'language', label: 'اللغة والأدب والنحو', query: 'نحو' },
  { id: 'oman', label: 'التراث والحضارة العمانية', query: 'عمان' },
  { id: 'quran', label: 'علوم القرآن والتفسير', query: 'تفسير' },
  { id: 'hadith', label: 'الحديث الشريف وعلومه', query: 'حديث' },
  { id: 'aqeedah', label: 'العقيدة والفكر الإسلامي', query: 'عقيدة' },
  { id: 'astronomy', label: 'الفلك والعلوم الطبيعية', query: 'فلك' },
  { id: 'ethics', label: 'السلوك والتربية الأخلاقية', query: 'تربية' },
];

export const SearchResultsView: React.FC<SearchResultsViewProps> = ({
  initialQuery = '',
  searchTrigger = 0,
  onQueryChange,
  physicalBooks = [],
  digitalBooks = [],
  categories = [],
  currentUser,
  systemConfig,
  favoriteBookIds = [],
  onToggleFavorite,
  onOpenReader,
  onOpenPhysicalBookmark,
  onRequestLoanSubmit,
  onQuickLoan,
  onNavigateTab,
  onAddDigitalBook,
  onBulkAddDigitalBooks,
  onUpdateDigitalBook,
  onDeleteDigitalBook,
  onAddPhysicalBook,
  onUpdatePhysicalBook,
  onDeletePhysicalBook,
}) => {
  const [searchQuery, setSearchQuery] = useState(initialQuery);

  // Sync external search query and re-trigger when requested (e.g. from HeaderBar search)
  useEffect(() => {
    setSearchQuery(initialQuery);
  }, [initialQuery, searchTrigger]);

  const handleSearchQueryChange = (val: string) => {
    setSearchQuery(val);
    if (onQueryChange) {
      onQueryChange(val);
    }
  };
  const [selectedMedium, setSelectedMedium] = useState<'all' | 'physical' | 'digital'>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [formatFilter, setFormatFilter] = useState<'all' | 'pdf' | 'epub'>('all');
  const [onlyAvailable, setOnlyAvailable] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'relevance' | 'title' | 'author' | 'pages'>('relevance');
  const [viewLayout, setViewLayout] = useState<'detailed' | 'grid'>('detailed');

  // Modals for Physical & Digital Management
  const [isAddDigitalModalOpen, setIsAddDigitalModalOpen] = useState(false);
  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false);
  const [editingDigitalBook, setEditingDigitalBook] = useState<DigitalBook | null>(null);
  const [digitalBookToDelete, setDigitalBookToDelete] = useState<DigitalBook | null>(null);
  const [isDeletingDigital, setIsDeletingDigital] = useState(false);
  const [isAddPhysicalModalOpen, setIsAddPhysicalModalOpen] = useState(false);
  const [editingPhysicalBook, setEditingPhysicalBook] = useState<PhysicalBook | null>(null);
  const [physicalBookToDelete, setPhysicalBookToDelete] = useState<PhysicalBook | null>(null);
  const [deleteMode, setDeleteMode] = useState<'entire' | 'copies'>('copies');
  const [copiesToRemove, setCopiesToRemove] = useState(1);
  const [removalReason, setRemovalReason] = useState('نسخة مفقودة / ضائعة (لم يتم العثور عليها)');
  const [customRemovalReason, setCustomRemovalReason] = useState('');
  const [isDeletingPhysical, setIsDeletingPhysical] = useState(false);

  const handleOpenDeleteModal = (book: PhysicalBook) => {
    setPhysicalBookToDelete(book);
    setDeleteMode(book.totalCopies > 1 ? 'copies' : 'entire');
    setCopiesToRemove(1);
    setRemovalReason('نسخة مفقودة / ضائعة (لم يتم العثور عليها)');
    setCustomRemovalReason('');
  };

  // Search filter logic
  const trimmedQuery = searchQuery.trim();

  const filteredPhysical = useMemo(() => {
    return physicalBooks.filter((book) => {
      // Category filter
      if (selectedCategoryId !== 'all' && book.categoryId !== selectedCategoryId) {
        return false;
      }
      // Availability filter
      if (onlyAvailable && book.availableCopies <= 0) {
        return false;
      }
      // Query filter
      if (!trimmedQuery) return true;
      const catName = categories.find((c) => c.id === book.categoryId)?.name || '';
      return (
        matchesArabicQuery(book.title, trimmedQuery) ||
        matchesArabicQuery(book.author, trimmedQuery) ||
        matchesArabicQuery(book.publisher || '', trimmedQuery) ||
        matchesArabicQuery(book.summary || '', trimmedQuery) ||
        matchesArabicQuery(catName, trimmedQuery) ||
        (book.isbn && book.isbn.toLowerCase().includes(trimmedQuery.toLowerCase())) ||
        (book.tags && book.tags.some((t) => matchesArabicQuery(t, trimmedQuery)))
      );
    });
  }, [physicalBooks, selectedCategoryId, onlyAvailable, trimmedQuery, categories]);

  const filteredDigital = useMemo(() => {
    return digitalBooks.filter((book) => {
      // Category filter
      if (selectedCategoryId !== 'all' && book.categoryId !== selectedCategoryId) {
        return false;
      }
      // Format filter
      if (formatFilter !== 'all' && book.format !== formatFilter) {
        return false;
      }
      // Query filter
      if (!trimmedQuery) return true;
      const catName = categories.find((c) => c.id === book.categoryId)?.name || '';
      return (
        matchesArabicQuery(book.title, trimmedQuery) ||
        matchesArabicQuery(book.author, trimmedQuery) ||
        matchesArabicQuery(book.sourceOrigin || '', trimmedQuery) ||
        matchesArabicQuery(book.summary || '', trimmedQuery) ||
        matchesArabicQuery(catName, trimmedQuery) ||
        (book.tags && book.tags.some((t) => matchesArabicQuery(t, trimmedQuery)))
      );
    });
  }, [digitalBooks, selectedCategoryId, formatFilter, trimmedQuery, categories]);

  // Combined Results
  type ResultItem =
    | { type: 'physical'; data: PhysicalBook }
    | { type: 'digital'; data: DigitalBook };

  const combinedResults: ResultItem[] = useMemo(() => {
    const list: ResultItem[] = [];
    if (selectedMedium === 'all' || selectedMedium === 'physical') {
      filteredPhysical.forEach((b) => list.push({ type: 'physical', data: b }));
    }
    if (selectedMedium === 'all' || selectedMedium === 'digital') {
      filteredDigital.forEach((b) => list.push({ type: 'digital', data: b }));
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'title') {
        return a.data.title.localeCompare(b.data.title, 'ar');
      }
      if (sortBy === 'author') {
        return a.data.author.localeCompare(b.data.author, 'ar');
      }
      if (sortBy === 'pages') {
        const pagesA = a.type === 'physical' ? a.data.pages || 0 : a.data.pagesCount || 0;
        const pagesB = b.type === 'physical' ? b.data.pages || 0 : b.data.pagesCount || 0;
        return pagesB - pagesA;
      }
      return 0; // relevance preserves natural matching order
    });

    return list;
  }, [selectedMedium, filteredPhysical, filteredDigital, sortBy]);

  const totalResultsCount = combinedResults.length;

  const handleBulkImportSuccess = (
    importedList: Omit<DigitalBook, 'id' | 'addedAt' | 'downloadCount' | 'readCount'>[]
  ) => {
    if (onBulkAddDigitalBooks) {
      onBulkAddDigitalBooks(importedList);
    } else if (onAddDigitalBook) {
      importedList.forEach((b) => onAddDigitalBook(b));
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in-50 duration-200">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-indigo-700/50">
        <div className="absolute -left-10 -bottom-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-10 top-0 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md border border-white/20 shadow-inner text-amber-300">
                <Search className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight">
                  محرك البحث الشامل
                </h1>
                <p className="text-xs sm:text-sm text-indigo-200 mt-0.5 font-medium">
                  ابحث في جميع الكتب الورقية والرقمية، مع إمكانية الدخول الفوري والمطالعة عبر القارئ المدمج
                </p>
              </div>
            </div>

            {/* Quick Actions / Stats */}
            <div className="flex items-center gap-2 flex-wrap">
              {currentUser.role === 'admin' && (
                <>
                  {onAddPhysicalBook && (
                    <button
                      onClick={() => setIsAddPhysicalModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/90 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-700/20 transition-all cursor-pointer whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة الكتب الورقية</span>
                    </button>
                  )}

                  <button
                    onClick={() => setIsBulkImportModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-700/20 transition-all cursor-pointer whitespace-nowrap"
                  >
                    <FolderUp className="w-3.5 h-3.5" />
                    <span>استيراد مجلد كتب (Bulk)</span>
                  </button>

                  <button
                    onClick={() => setIsAddDigitalModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white border border-white/20 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة كتاب إلكتروني</span>
                  </button>
                </>
              )}

              {/* Quick stats pill */}
              <div className="flex items-center gap-2 bg-black/30 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/15 text-xs font-mono">
                <span className="text-amber-300 font-bold">{physicalBooks.length} ورقي</span>
                <span className="text-white/40">•</span>
                <span className="text-emerald-400 font-bold">{digitalBooks.length} رقمي</span>
              </div>
            </div>
          </div>

          {/* Search Input Bar */}
          <div className="relative pt-2">
            <Search className="w-5 h-5 text-slate-400 absolute right-4 top-1/2 translate-y-[-20%] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchQueryChange(e.target.value)}
              placeholder="اكتب عنوان الكتاب، اسم المؤلف، أو تصنيفاً معيناً (مثال: فقه المعاملات، تاريخ عمان، النحو)..."
              className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 rounded-2xl pr-12 pl-12 py-3.5 text-sm sm:text-base font-semibold shadow-xl border-2 border-transparent focus:border-indigo-400 outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => handleSearchQueryChange('')}
                className="absolute left-4 top-1/2 translate-y-[-20%] p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 rounded-full transition-colors cursor-pointer"
                title="مسح البحث"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Popular Subject Pills for 1-Click Research */}
          <div className="pt-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-indigo-200 font-bold flex items-center gap-1 shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>تصنيفات بحثية شائعة:</span>
              </span>
              {POPULAR_RESEARCH_TOPICS.map((topic) => (
                <button
                  key={topic.id}
                  onClick={() => {
                    const nextQuery = searchQuery === topic.query ? '' : topic.query;
                    handleSearchQueryChange(nextQuery);
                  }}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    searchQuery === topic.query
                      ? 'bg-amber-400 text-slate-950 font-bold shadow-md'
                      : 'bg-white/10 hover:bg-white/20 text-white/90 border border-white/15'
                  }`}
                >
                  {topic.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Control Bar: Filters, Medium Switcher & Sorting */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Medium Selector (All / Physical / Digital) */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl flex-wrap sm:flex-nowrap">
          <button
            onClick={() => setSelectedMedium('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedMedium === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            جميع المراجع ({filteredPhysical.length + filteredDigital.length})
          </button>
          <button
            onClick={() => setSelectedMedium('physical')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              selectedMedium === 'physical'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>كتب ورقية ({filteredPhysical.length})</span>
          </button>
          <button
            onClick={() => setSelectedMedium('digital')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              selectedMedium === 'digital'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            <Library className="w-3.5 h-3.5" />
            <span>كتب رقمية ({filteredDigital.length})</span>
          </button>
        </div>

        {/* Secondary Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Category Dropdown */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">التصنيف:</span>
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-semibold outline-none cursor-pointer"
            >
              <option value="all">كافة التصنيفات ({categories.length})</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Format filter for digital */}
          {selectedMedium !== 'physical' && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">الصيغة:</span>
              <select
                value={formatFilter}
                onChange={(e) => setFormatFilter(e.target.value as any)}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-semibold outline-none cursor-pointer"
              >
                <option value="all">الكل</option>
                <option value="pdf">PDF</option>
                <option value="epub">ePub</option>
              </select>
            </div>
          )}

          {/* Availability Toggle for Physical */}
          {selectedMedium !== 'digital' && (
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyAvailable}
                onChange={(e) => setOnlyAvailable(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
              />
              <span>المتوفر للإعارة فقط</span>
            </label>
          )}

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 text-xs">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-semibold outline-none cursor-pointer"
            >
              <option value="relevance">الأكثر مطابقة</option>
              <option value="title">أبجدياً (العنوان)</option>
              <option value="author">المؤلف</option>
              <option value="pages">حسب الحجم والصفحات</option>
            </select>
          </div>

          {/* Layout View Toggle (Detailed / Grid) */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5 border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setViewLayout('detailed')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewLayout === 'detailed'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
              title="عرض تفصيلي أفقي"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewLayout('grid')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewLayout === 'grid'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
              title="عرض شبكي (بطاقات)"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Results Header Status */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
        <div>
          {trimmedQuery ? (
            <span>
              نتائج البحث عن: <strong className="text-slate-900 dark:text-slate-100">"{trimmedQuery}"</strong> — تم العثور على{' '}
              <strong className="text-indigo-600 dark:text-indigo-400 font-mono font-bold text-sm">{totalResultsCount}</strong> مرجع
            </span>
          ) : (
            <span>
              عرض جميع المراجع المتوفرة في المكتبة — <strong className="text-indigo-600 dark:text-indigo-400 font-mono font-bold">{totalResultsCount}</strong> مرجع
            </span>
          )}
        </div>

        {trimmedQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
          >
            إعادة ضبط البحث
          </button>
        )}
      </div>

      {/* Results Rendering */}
      {totalResultsCount === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <BookOpen className="w-8 h-8" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              لم يتم العثور على مراجع تطابق بحثك
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              جرب تغيير كلمات البحث، أو اختيار تصنيف مختلف، أو تصفح "بوابة المكتبات المعتمدة" للبحث عن مراجع ومخطوطات وترشيحها للمكتبة.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategoryId('all');
                setSelectedMedium('all');
                setFormatFilter('all');
                setOnlyAvailable(false);
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer"
            >
              عرض جميع الكتب
            </button>
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('portals')}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                تصفح بوابة المكتبات المعتمدة
              </button>
            )}
          </div>
        </div>
      ) : viewLayout === 'detailed' ? (
        /* Detailed Horizontal Cards */
        <div className="space-y-4">
          {combinedResults.map((item) => {
            const isPhysical = item.type === 'physical';
            const book = item.data;
            const isFav = favoriteBookIds.includes(book.id);
            const category = categories.find((c) => c.id === book.categoryId)?.name || 'عام';

            if (isPhysical) {
              const pBook = book as PhysicalBook;
              const isAvailable = pBook.availableCopies > 0;

              return (
                <div
                  key={`p-${pBook.id}`}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/40 rounded-3xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-all space-y-4 group"
                >
                  {/* Top Bar: Badges, Title & Quick Favorite */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-2 flex-1 min-w-0">
                      {/* Status Badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-1 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-xs font-bold flex items-center gap-1.5 shadow-2xs">
                          <BookOpen className="w-3.5 h-3.5 text-amber-500" />
                          <span>كتاب ورقي بقاعة المطالعة</span>
                        </span>

                        <span className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold">
                          {category}
                        </span>

                        {isAvailable ? (
                          <span className="px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-xs font-mono font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            <span>متوفر: {pBook.availableCopies} من {pBook.totalCopies} نسخ</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 text-xs font-semibold">
                            جميع النسخ معارة حالياً
                          </span>
                        )}

                        {pBook.location && (
                          <span className="px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 text-xs font-mono font-semibold flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-amber-600" />
                            <span>خزانة: {pBook.location.cabinet} • رف: {pBook.location.shelf}</span>
                          </span>
                        )}
                      </div>

                      {/* Main Title */}
                      <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors leading-snug">
                        {pBook.title}
                      </h3>

                      {/* Author and Metadata Bar */}
                      <div className="flex items-center gap-4 flex-wrap text-xs text-slate-500 dark:text-slate-400">
                        <span>المؤلف: <strong className="text-slate-700 dark:text-slate-300">{pBook.author}</strong></span>
                        {pBook.publisher && (
                          <span>دار النشر: <strong className="text-slate-700 dark:text-slate-300">{pBook.publisher}</strong></span>
                        )}
                        {pBook.publishYear && (
                          <span>سنة الطبع: <strong className="font-mono text-slate-700 dark:text-slate-300">{pBook.publishYear}</strong></span>
                        )}
                        {pBook.pages && (
                          <span>عدد الصفحات: <strong className="font-mono text-slate-700 dark:text-slate-300">{pBook.pages} ص</strong></span>
                        )}
                        {pBook.isbn && (
                          <span className="font-mono text-[11px] text-slate-400">ISBN: {pBook.isbn}</span>
                        )}
                      </div>
                    </div>

                    {/* Quick Favorite Action */}
                    {onToggleFavorite && (
                      <button
                        type="button"
                        onClick={() => onToggleFavorite(pBook.id)}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer self-start ${
                          isFav
                            ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-amber-500 border-slate-200 dark:border-slate-700'
                        }`}
                        title={isFav ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
                      >
                        <Star className={`w-4 h-4 ${isFav ? 'fill-amber-500' : ''}`} />
                      </button>
                    )}
                  </div>

                  {/* Summary / Topics Description */}
                  {pBook.summary && (
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                      <div className="font-bold text-[11px] text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                        <Info className="w-3 h-3 text-amber-500" />
                        <span>موضوع الكتاب ومحتواه العلمي:</span>
                      </div>
                      <p className="line-clamp-3">{pBook.summary}</p>
                    </div>
                  )}

                  {/* Tags / Keywords */}
                  {pBook.tags && pBook.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        الوسوم والتصنيفات:
                      </span>
                      {pBook.tags.map((t, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSearchQuery(t)}
                          className="px-2 py-0.5 bg-slate-100 hover:bg-amber-100 dark:bg-slate-800 dark:hover:bg-amber-950/50 text-slate-600 dark:text-slate-300 hover:text-amber-700 dark:hover:text-amber-300 rounded-lg text-[11px] transition-colors cursor-pointer"
                        >
                          #{t}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Horizontal Action Footer */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 font-mono">
                      <span>الرمز:</span>
                      <strong className="text-slate-700 dark:text-slate-300">{pBook.id}</strong>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {currentUser.role === 'admin' && onUpdatePhysicalBook && (
                        <button
                          type="button"
                          onClick={() => setEditingPhysicalBook(pBook)}
                          className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-300 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                          title="تعديل بيانات الكتاب الورقي"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-indigo-500" />
                          <span>تعديل الكتاب</span>
                        </button>
                      )}
                      {currentUser.role === 'admin' && onDeletePhysicalBook && (
                        <button
                          type="button"
                          onClick={() => handleOpenDeleteModal(pBook)}
                          className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-xl transition-colors cursor-pointer"
                          title="حذف الكتاب أو استبعاد نسخ مفقودة"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      {/* Physical Bookmark */}
                      {onOpenPhysicalBookmark && (
                        <button
                          type="button"
                          onClick={() => onOpenPhysicalBookmark(pBook)}
                          className="px-3.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                        >
                          <Bookmark className="w-3.5 h-3.5 text-amber-500" />
                          <span>تثبيت فاصل قراءة</span>
                        </button>
                      )}

                      {/* Borrow Request / Quick Loan */}
                      {currentUser.role === 'admin' && onQuickLoan ? (
                        <button
                          type="button"
                          onClick={() => onQuickLoan(pBook.id)}
                          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>تسجيل إعارة فورية</span>
                        </button>
                      ) : currentUser.role === 'student' && onRequestLoanSubmit ? (
                        <button
                          type="button"
                          onClick={() =>
                            onRequestLoanSubmit({
                              bookId: pBook.id,
                              studentId: currentUser.id,
                              purpose: 'academic_research',
                              customReason: `طلب استعارة من خلال البحث الشامل: ${pBook.title}`,
                            })
                          }
                          disabled={!isAvailable}
                          className={`px-4 py-1.5 rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer ${
                            isAvailable
                              ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>{isAvailable ? 'طلب استعارة الكتاب' : 'غير متوفر للإعارة حالياً'}</span>
                        </button>
                      ) : null}

                      {/* Reading workspace link */}
                      {onNavigateTab && (
                        <button
                          type="button"
                          onClick={() => onNavigateTab('reading_workspace')}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                        >
                          تدوين ملخص وملاحظة
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            } else {
              // Digital Book Horizontal Card
              const dBook = book as DigitalBook;

              return (
                <div
                  key={`d-${dBook.id}`}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/40 rounded-3xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-all space-y-4 group"
                >
                  {/* Top Bar: Badges, Title & Quick Favorite */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-2 flex-1 min-w-0">
                      {/* Status Badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-xs font-bold flex items-center gap-1.5 shadow-2xs">
                          <Library className="w-3.5 h-3.5 text-emerald-500" />
                          <span>كتاب إلكتروني بالمستودع الرقمي</span>
                        </span>

                        <span className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold">
                          {category}
                        </span>

                        <span className="px-2.5 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 text-xs font-mono font-bold uppercase">
                          {dBook.format || 'PDF'}
                        </span>

                        {dBook.pagesCount && (
                          <span className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-mono font-semibold">
                            {dBook.pagesCount} صفحة
                          </span>
                        )}

                        {dBook.fileSize && (
                          <span className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs font-mono">
                            {dBook.fileSize}
                          </span>
                        )}
                      </div>

                      {/* Main Title */}
                      <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors leading-snug">
                        {dBook.title}
                      </h3>

                      {/* Author and Metadata Bar */}
                      <div className="flex items-center gap-4 flex-wrap text-xs text-slate-500 dark:text-slate-400">
                        <span>المؤلف: <strong className="text-slate-700 dark:text-slate-300">{dBook.author}</strong></span>
                        {dBook.sourceOrigin && (
                          <span>المصدر: <strong className="text-slate-700 dark:text-slate-300">{dBook.sourceOrigin}</strong></span>
                        )}
                        {dBook.readCount !== undefined && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            عدد مرات المطالعة: {dBook.readCount}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick Favorite Action */}
                    {onToggleFavorite && (
                      <button
                        type="button"
                        onClick={() => onToggleFavorite(dBook.id)}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer self-start ${
                          isFav
                            ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-amber-500 border-slate-200 dark:border-slate-700'
                        }`}
                        title={isFav ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
                      >
                        <Star className={`w-4 h-4 ${isFav ? 'fill-amber-500' : ''}`} />
                      </button>
                    )}
                  </div>

                  {/* Summary / Topics Description */}
                  {dBook.summary && (
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                      <div className="font-bold text-[11px] text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                        <Info className="w-3 h-3 text-emerald-500" />
                        <span>موضوع الكتاب ومحتواه العلمي:</span>
                      </div>
                      <p className="line-clamp-3">{dBook.summary}</p>
                    </div>
                  )}

                  {/* Tags / Keywords */}
                  {dBook.tags && dBook.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        الوسوم والتصنيفات:
                      </span>
                      {dBook.tags.map((t, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSearchQuery(t)}
                          className="px-2 py-0.5 bg-slate-100 hover:bg-emerald-100 dark:bg-slate-800 dark:hover:bg-emerald-950/50 text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-300 rounded-lg text-[11px] transition-colors cursor-pointer"
                        >
                          #{t}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Horizontal Action Footer */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 font-mono">
                      <span>الرمز:</span>
                      <strong className="text-slate-700 dark:text-slate-300">{dBook.id}</strong>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {currentUser.role === 'admin' && onUpdateDigitalBook && (
                        <button
                          type="button"
                          onClick={() => setEditingDigitalBook(dBook)}
                          className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-300 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                          title="تعديل بيانات الكتاب الرقمي"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-emerald-500" />
                          <span>تعديل الكتاب</span>
                        </button>
                      )}
                      {currentUser.role === 'admin' && onDeleteDigitalBook && (
                        <button
                          type="button"
                          onClick={() => setDigitalBookToDelete(dBook)}
                          className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-xl transition-colors cursor-pointer"
                          title="مسح الكتاب الرقمي من المستودع"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      {/* Direct Read in Reader (دخول فوري ومطالعة) */}
                      {onOpenReader && (
                        <button
                          type="button"
                          onClick={() => onOpenReader(dBook)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/25 flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <BookOpen className="w-4 h-4" />
                          <span>دخول فوري والمطالعة في القارئ المدمج 📖</span>
                        </button>
                      )}

                      {/* Reading workspace link */}
                      {onNavigateTab && (
                        <button
                          type="button"
                          onClick={() => onNavigateTab('reading_workspace')}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                        >
                          تدوين ملخص وملاحظة
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            }
          })}
        </div>
      ) : (
        /* Grid Cards View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {combinedResults.map((item) => {
            const isPhysical = item.type === 'physical';
            const book = item.data;
            const isFav = favoriteBookIds.includes(book.id);
            const category = categories.find((c) => c.id === book.categoryId)?.name || 'عام';

            if (isPhysical) {
              const pBook = book as PhysicalBook;
              const isAvailable = pBook.availableCopies > 0;

              return (
                <div
                  key={`grid-p-${pBook.id}`}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/40 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-[11px] font-bold flex items-center gap-1">
                        <BookOpen className="w-3 h-3 text-amber-500" />
                        <span>ورقي</span>
                      </span>
                      {onToggleFavorite && (
                        <button
                          onClick={() => onToggleFavorite(pBook.id)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            isFav ? 'text-amber-500 bg-amber-400/10' : 'text-slate-400 hover:text-amber-500'
                          }`}
                        >
                          <Star className={`w-4 h-4 ${isFav ? 'fill-amber-400' : ''}`} />
                        </button>
                      )}
                    </div>

                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-snug group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors line-clamp-2">
                        {pBook.title}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{pBook.author}</p>
                    </div>

                    <div className="p-2.5 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80 rounded-xl space-y-1 text-[11px] text-slate-500">
                      <div className="flex justify-between">
                        <span>القسم:</span>
                        <strong className="text-slate-700 dark:text-slate-300">{category}</strong>
                      </div>
                      {pBook.location && (
                        <div className="flex justify-between text-amber-700 dark:text-amber-400">
                          <span>الموقع:</span>
                          <span>خزانة {pBook.location.cabinet} - رف {pBook.location.shelf}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>الحالة:</span>
                        <span className={isAvailable ? 'text-emerald-600 font-bold' : 'text-rose-500'}>
                          {isAvailable ? `متوفر (${pBook.availableCopies})` : 'معار بالكامل'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    {currentUser.role === 'admin' && onUpdatePhysicalBook && (
                      <button
                        type="button"
                        onClick={() => setEditingPhysicalBook(pBook)}
                        className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors cursor-pointer"
                        title="تعديل بيانات الكتاب الورقي"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {currentUser.role === 'admin' && onDeletePhysicalBook && (
                      <button
                        type="button"
                        onClick={() => handleOpenDeleteModal(pBook)}
                        className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="حذف الكتاب أو استبعاد نسخ مفقودة"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {onOpenPhysicalBookmark && (
                      <button
                        onClick={() => onOpenPhysicalBookmark(pBook)}
                        className="flex-1 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded-xl text-xs font-bold border border-amber-500/30 flex items-center justify-center gap-1 cursor-pointer transition-all"
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                        <span>فاصل قراءة</span>
                      </button>
                    )}
                    {currentUser.role === 'admin' && onQuickLoan ? (
                      <button
                        onClick={() => onQuickLoan(pBook.id)}
                        className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-all shadow-xs"
                      >
                        <span>إعارة</span>
                      </button>
                    ) : currentUser.role === 'student' && onRequestLoanSubmit ? (
                      <button
                        onClick={() =>
                          onRequestLoanSubmit({
                            bookId: pBook.id,
                            studentId: currentUser.id,
                            purpose: 'academic_research',
                            customReason: `طلب استعارة: ${pBook.title}`,
                          })
                        }
                        disabled={!isAvailable}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                          isAvailable
                            ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <span>طلب إعارة</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            } else {
              const dBook = book as DigitalBook;

              return (
                <div
                  key={`grid-d-${dBook.id}`}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/40 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-bold flex items-center gap-1">
                          <Library className="w-3 h-3 text-emerald-500" />
                          <span>رقمي</span>
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-mono font-bold uppercase">
                          {dBook.format || 'PDF'}
                        </span>
                      </div>
                      {onToggleFavorite && (
                        <button
                          onClick={() => onToggleFavorite(dBook.id)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            isFav ? 'text-amber-500 bg-amber-400/10' : 'text-slate-400 hover:text-amber-500'
                          }`}
                        >
                          <Star className={`w-4 h-4 ${isFav ? 'fill-amber-400' : ''}`} />
                        </button>
                      )}
                    </div>

                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-snug group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-2">
                        {dBook.title}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{dBook.author}</p>
                    </div>

                    <div className="p-2.5 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80 rounded-xl space-y-1 text-[11px] text-slate-500">
                      <div className="flex justify-between">
                        <span>القسم:</span>
                        <strong className="text-slate-700 dark:text-slate-300">{category}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>الصفحات:</span>
                        <span>{dBook.pagesCount ? `${dBook.pagesCount} صفحة` : 'غير متوفر'}</span>
                      </div>
                      {dBook.sourceOrigin && (
                        <div className="flex justify-between truncate">
                          <span>المصدر:</span>
                          <span className="truncate max-w-[140px]">{dBook.sourceOrigin}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    {currentUser.role === 'admin' && onUpdateDigitalBook && (
                      <button
                        type="button"
                        onClick={() => setEditingDigitalBook(dBook)}
                        className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer"
                        title="تعديل بيانات الكتاب الرقمي"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-emerald-500" />
                      </button>
                    )}
                    {currentUser.role === 'admin' && onDeleteDigitalBook && (
                      <button
                        type="button"
                        onClick={() => setDigitalBookToDelete(dBook)}
                        className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-xl transition-colors cursor-pointer"
                        title="مسح الكتاب الرقمي"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {onOpenReader && (
                      <button
                        onClick={() => onOpenReader(dBook)}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/25 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <BookOpen className="w-4 h-4" />
                        <span>فتح ومطالعة 📖</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            }
          })}
        </div>
      )}

      {/* Admin Modals */}
      {isAddDigitalModalOpen && (
        <AddDigitalBookModal
          categories={categories}
          adminUserId={currentUser.id}
          onClose={() => setIsAddDigitalModalOpen(false)}
          onSuccess={() => {
            setIsAddDigitalModalOpen(false);
          }}
        />
      )}

      {isBulkImportModalOpen && (
        <BulkDigitalImportModal
          isOpen={isBulkImportModalOpen}
          onClose={() => setIsBulkImportModalOpen(false)}
          categories={categories}
          onSuccess={handleBulkImportSuccess}
        />
      )}

      {/* Delete Physical Book Confirmation Modal */}
      {physicalBookToDelete && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 text-right" dir="rtl">
            {/* Modal Header */}
            <div className="flex items-center gap-3 text-rose-500">
              <div className="p-3 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">إدارة الحذف واستبعاد النسخ</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">حذف الكتاب بالكامل أو استبعاد نسخ مفقودة لتطابق جرد الرف</p>
              </div>
            </div>

            {/* Book info summary box */}
            <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">عنوان الكتاب:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{physicalBookToDelete.title}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">المؤلف:</span>
                <span className="text-slate-700 dark:text-slate-300">{physicalBookToDelete.author}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">الموقع المكتبي:</span>
                <span className="font-mono text-indigo-600 dark:text-indigo-400">{physicalBookToDelete.location.cabinet} • {physicalBookToDelete.location.shelf}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400">حالة الجرد الحالي:</span>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-lg bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-mono font-bold">
                    {physicalBookToDelete.totalCopies} نسخة إجمالية
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-mono font-bold">
                    {physicalBookToDelete.availableCopies} متوفرة
                  </span>
                  {physicalBookToDelete.totalCopies > physicalBookToDelete.availableCopies && (
                    <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400 font-mono font-bold">
                      {physicalBookToDelete.totalCopies - physicalBookToDelete.availableCopies} معارة
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* If book has multiple copies, show selection between Copies Reduction vs Full Deletion */}
            {physicalBookToDelete.totalCopies > 1 && (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">اختر نوع العملية المطلوبة:</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDeleteMode('copies')}
                    className={`p-3 rounded-2xl border text-right transition-all cursor-pointer space-y-1 ${
                      deleteMode === 'copies'
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-800 dark:text-amber-300 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <MinusCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>استبعاد نسخ مفقودة/تالفة</span>
                    </div>
                    <p className="text-[11px] opacity-80 leading-relaxed">
                      تقليص عدد النسخ فقط ليعكس النظام ما هو موجود فعلياً بالرف
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeleteMode('entire')}
                    className={`p-3 rounded-2xl border text-right transition-all cursor-pointer space-y-1 ${
                      deleteMode === 'entire'
                        ? 'bg-rose-500/15 border-rose-500/50 text-rose-800 dark:text-rose-300 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span>حذف الكتاب بالكامل</span>
                    </div>
                    <p className="text-[11px] opacity-80 leading-relaxed">
                      إزالة سجل الكتاب نهائياً من المكتبة بجميع نسخه وبياناته
                    </p>
                  </button>
                </div>
              </div>
            )}

            {/* Mode A: Reduce Specific Copies */}
            {deleteMode === 'copies' && (
              <div className="space-y-4 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4">
                {physicalBookToDelete.availableCopies === 0 ? (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      جميع نسخ هذا الكتاب معارة حالياً ({physicalBookToDelete.totalCopies} نسخ). لا يمكن استبعاد أي نسخة حتى يتم إرجاعها إلى المكتبة أولاً.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        عدد النسخ المراد استبعادها من الفهرس:
                      </label>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl p-1">
                          <button
                            type="button"
                            onClick={() => setCopiesToRemove(Math.max(1, copiesToRemove - 1))}
                            disabled={copiesToRemove <= 1}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg disabled:opacity-30 cursor-pointer"
                          >
                            <MinusCircle className="w-4 h-4" />
                          </button>
                          <span className="w-12 text-center font-mono font-bold text-base text-amber-600 dark:text-amber-400">
                            {copiesToRemove}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCopiesToRemove(Math.min(physicalBookToDelete.availableCopies, copiesToRemove + 1))}
                            disabled={copiesToRemove >= physicalBookToDelete.availableCopies}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg disabled:opacity-30 cursor-pointer"
                          >
                            <PlusCircle className="w-4 h-4" />
                          </button>
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          (الحد الأقصى المتاح للاستبعاد: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{physicalBookToDelete.availableCopies}</strong> نسخة متوفرة)
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        سبب الاستبعاد (لتوثيق الجرد):
                      </label>
                      <select
                        value={removalReason}
                        onChange={(e) => setRemovalReason(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
                      >
                        <option value="نسخة مفقودة / ضائعة (لم يتم العثور عليها)">نسخة مفقودة / ضائعة (لم يتم العثور عليها بالرف)</option>
                        <option value="نسخة تالفة / ممزقة (استبعاد من الجرد)">نسخة تالفة / ممزقة (استبعاد من الجرد)</option>
                        <option value="نقل أو إهداء خارج المكتبة">نقل أو إهداء خارج المكتبة</option>
                        <option value="سبب آخر (مخصص)">سبب آخر (مخصص)...</option>
                      </select>

                      {removalReason === 'سبب آخر (مخصص)' && (
                        <input
                          type="text"
                          value={customRemovalReason}
                          onChange={(e) => setCustomRemovalReason(e.target.value)}
                          placeholder="اكتب سبب الاستبعاد باختصار..."
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 mt-2"
                        />
                      )}
                    </div>

                    <div className="p-3 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800/80 rounded-xl text-xs space-y-1">
                      <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                        <span>النسخ الإجمالية بعد الاستبعاد:</span>
                        <strong className="text-amber-600 dark:text-amber-400 font-mono">
                          {Math.max(0, physicalBookToDelete.totalCopies - copiesToRemove)} نسخة
                        </strong>
                      </div>
                      <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
                        <span>النسخ المتوفرة على الرف بعد التحديث:</span>
                        <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                          {Math.max(0, physicalBookToDelete.availableCopies - copiesToRemove)} نسخة
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Mode B: Delete Entire Book */}
            {deleteMode === 'entire' && (
              <div className="space-y-3">
                {physicalBookToDelete.availableCopies < physicalBookToDelete.totalCopies ? (
                  <div className="p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-2xl text-xs text-amber-800 dark:text-amber-300 space-y-1.5">
                    <div className="font-bold flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>تنبيه: توجد إعارات نشطة مرتبطة بهذا الكتاب</span>
                    </div>
                    <p className="leading-relaxed">
                      يوجد حالياً {physicalBookToDelete.totalCopies - physicalBookToDelete.availableCopies} نسخة قيد الاستعارة. لا يمكن حذف الكتاب بالكامل من النظام حتى يتم استرجاع كافة النسخ المعارة أولاً منعاً لتعارض السجلات.
                    </p>
                    {physicalBookToDelete.availableCopies > 0 && (
                      <p className="text-xs text-indigo-600 dark:text-indigo-400 underline cursor-pointer pt-1" onClick={() => setDeleteMode('copies')}>
                        💡 هل تريد فقط استبعاد النسخ المفقودة المتوفرة ({physicalBookToDelete.availableCopies} متوفرة)؟ اضغط هنا.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-xs text-rose-800 dark:text-rose-300 leading-relaxed">
                    هل أنت متأكد من رغبتك في حذف كتاب <strong className="text-slate-900 dark:text-white">«{physicalBookToDelete.title}»</strong> وجميع نسخه ({physicalBookToDelete.totalCopies} نسخ) نهائياً من الفهرس وقاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء.
                  </div>
                )}
              </div>
            )}

            {/* Modal Actions Footer */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setPhysicalBookToDelete(null)}
                disabled={isDeletingPhysical}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors"
              >
                إلغاء
              </button>

              {deleteMode === 'copies' ? (
                <button
                  type="button"
                  disabled={isDeletingPhysical || physicalBookToDelete.availableCopies === 0 || copiesToRemove < 1 || copiesToRemove > physicalBookToDelete.availableCopies}
                  onClick={async () => {
                    if (onDeletePhysicalBook && physicalBookToDelete) {
                      setIsDeletingPhysical(true);
                      const finalReason = removalReason === 'سبب آخر (مخصص)' && customRemovalReason.trim()
                        ? customRemovalReason.trim()
                        : removalReason;
                      try {
                        await onDeletePhysicalBook(physicalBookToDelete.id, {
                          copiesCount: copiesToRemove,
                          reason: finalReason,
                        });
                        setPhysicalBookToDelete(null);
                      } finally {
                        setIsDeletingPhysical(false);
                      }
                    }
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed text-slate-950 font-bold rounded-xl text-xs shadow-md shadow-amber-600/30 flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  {isDeletingPhysical ? (
                    <span>جارٍ الاستبعاد...</span>
                  ) : (
                    <>
                      <MinusCircle className="w-3.5 h-3.5" />
                      <span>تأكيد استبعاد {copiesToRemove} {copiesToRemove === 1 ? 'نسخة' : 'نسخ'}</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isDeletingPhysical || physicalBookToDelete.availableCopies < physicalBookToDelete.totalCopies}
                  onClick={async () => {
                    if (onDeletePhysicalBook && physicalBookToDelete) {
                      setIsDeletingPhysical(true);
                      try {
                        await onDeletePhysicalBook(physicalBookToDelete.id);
                        setPhysicalBookToDelete(null);
                      } finally {
                        setIsDeletingPhysical(false);
                      }
                    }
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/30 flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  {isDeletingPhysical ? (
                    <span>جارٍ الحذف...</span>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>تأكيد حذف الكتاب بالكامل</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Physical Book Modal */}
      {isAddPhysicalModalOpen && onAddPhysicalBook && (
        <BookFormModal
          categories={categories}
          onClose={() => setIsAddPhysicalModalOpen(false)}
          onSave={(data) => {
            onAddPhysicalBook(data);
            setIsAddPhysicalModalOpen(false);
          }}
        />
      )}

      {/* Edit Physical Book Modal */}
      {editingPhysicalBook && onUpdatePhysicalBook && (
        <BookFormModal
          initialBook={editingPhysicalBook}
          categories={categories}
          onClose={() => setEditingPhysicalBook(null)}
          onSave={(data) => {
            onUpdatePhysicalBook(editingPhysicalBook.id, data);
            setEditingPhysicalBook(null);
          }}
          onDelete={(book) => {
            setEditingPhysicalBook(null);
            handleOpenDeleteModal(book);
          }}
        />
      )}

      {/* Edit Digital Book Modal */}
      {editingDigitalBook && onUpdateDigitalBook && (
        <EditDigitalBookModal
          isOpen={Boolean(editingDigitalBook)}
          book={editingDigitalBook}
          categories={categories}
          onClose={() => setEditingDigitalBook(null)}
          onSave={async (id, updates) => {
            onUpdateDigitalBook(id, updates);
            setEditingDigitalBook(null);
          }}
          onDelete={onDeleteDigitalBook ? async (id) => {
            const b = editingDigitalBook;
            setEditingDigitalBook(null);
            setDigitalBookToDelete(b);
          } : undefined}
        />
      )}

      {/* Delete Digital Book Confirmation Modal */}
      {digitalBookToDelete && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-rose-600 dark:text-rose-400 text-sm flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                <span>تأكيد مسح الكتاب الرقمي</span>
              </h3>
              <button
                onClick={() => !isDeletingDigital && setDigitalBookToDelete(null)}
                disabled={isDeletingDigital}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">عنوان الكتاب:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100 truncate max-w-[240px]">{digitalBookToDelete.title}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">المؤلف:</span>
                <span className="text-slate-700 dark:text-slate-300">{digitalBookToDelete.author}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">الصيغة:</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold uppercase">{digitalBookToDelete.format}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              هل أنت متأكد من رغبتك في مسح هذا الكتاب الرقمي من المستودع المركزي؟ سيتم إزالة ملف الكتاب وجميع سجلات القراءة المرتبطة به.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDigitalBookToDelete(null)}
                disabled={isDeletingDigital}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isDeletingDigital}
                onClick={async () => {
                  if (onDeleteDigitalBook && digitalBookToDelete) {
                    setIsDeletingDigital(true);
                    try {
                      await onDeleteDigitalBook(digitalBookToDelete.id);
                      setDigitalBookToDelete(null);
                    } finally {
                      setIsDeletingDigital(false);
                    }
                  }
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
              >
                {isDeletingDigital ? (
                  <span>جارٍ المسح...</span>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>تأكيد مسح الكتاب</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
