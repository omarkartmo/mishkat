import React, { useState, useMemo } from 'react';
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

interface SearchResultsViewProps {
  initialQuery?: string;
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
}) => {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedMedium, setSelectedMedium] = useState<'all' | 'physical' | 'digital'>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [onlyAvailable, setOnlyAvailable] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'relevance' | 'title' | 'author' | 'pages'>('relevance');
  const [viewMode, setViewMode] = useState<'horizontal' | 'grid'>('horizontal');

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
  }, [digitalBooks, selectedCategoryId, trimmedQuery, categories]);

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
                  محرك البحث الموضوعي والاستكشاف الشامل
                </h1>
                <p className="text-xs sm:text-sm text-indigo-200 mt-0.5 font-medium">
                  ابحث عن موضوع معين أو كلمة مفتاحية للاطلاع على كافة المراجع الورقية والرقمية المتوفرة في المكتبة
                </p>
              </div>
            </div>

            {/* Quick stats pill */}
            <div className="flex items-center gap-2 bg-black/20 backdrop-blur-md px-3.5 py-1.5 rounded-2xl border border-white/10 text-xs font-mono">
              <span className="text-amber-300 font-bold">{physicalBooks.length} ورقي</span>
              <span className="text-white/40">•</span>
              <span className="text-emerald-400 font-bold">{digitalBooks.length} رقمي</span>
            </div>
          </div>

          {/* Search Input Bar */}
          <div className="relative pt-2">
            <Search className="w-5 h-5 text-slate-400 absolute right-4 top-1/2 translate-y-[-20%] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="اكتب اسم الموضوع، عنوان الكتاب، اسم المؤلف، أو وسماً معيناً (مثال: فقه المعاملات، تاريخ عمان، النحو)..."
              className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 rounded-2xl pr-12 pl-12 py-3.5 text-sm sm:text-base font-semibold shadow-xl border-2 border-transparent focus:border-indigo-400 outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
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
                <span>مواضيع بحثية شائعة:</span>
              </span>
              {POPULAR_RESEARCH_TOPICS.map((topic) => (
                <button
                  key={topic.id}
                  onClick={() => setSearchQuery(topic.query)}
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
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
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

      {/* Results List: Horizontal Cards Layout (العرض الأفقي التفصيلي) */}
      {totalResultsCount === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center space-y-4">
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

          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategoryId('all');
                setSelectedMedium('all');
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
      ) : (
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
                        الوسوم والمواضيع:
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
                              customReason: `طلب استعارة من خلال البحث الموضوعي: ${pBook.title}`,
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
                        الوسوم والمواضيع:
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
                      {/* Direct Read in Reader */}
                      {onOpenReader && (
                        <button
                          type="button"
                          onClick={() => onOpenReader(dBook)}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>فتح وقراءة الآن 📖</span>
                        </button>
                      )}

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
            }
          })}
        </div>
      )}
    </div>
  );
};
