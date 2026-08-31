import React, { useState } from 'react';
import {
  Star,
  BookOpen,
  Library,
  Trash2,
  BookPlus,
  BookOpenCheck,
  MapPin,
  Barcode,
  Search,
  Filter,
  ArrowRight,
  Sparkles,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  FileText,
} from 'lucide-react';
import {
  PhysicalBook,
  DigitalBook,
  Category,
  User as UserType,
  UserRole,
  SystemConfig,
} from '../../types/library';
import { StudentLoanRequestModal } from '../physical/StudentLoanRequestModal';

interface FavoritesViewProps {
  favoriteBookIds: string[];
  physicalBooks: PhysicalBook[];
  digitalBooks: DigitalBook[];
  categories: Category[];
  currentUser: UserType;
  systemConfig?: SystemConfig;
  onToggleFavorite: (bookId: string) => void;
  onOpenReader: (book: DigitalBook) => void;
  onRequestLoanSubmit?: (params: {
    bookId: string;
    studentId: string;
    purpose: string;
    customReason?: string;
    requestedDurationDays?: number;
  }) => void;
  onNavigate: (tab: any) => void;
}

export const FavoritesView: React.FC<FavoritesViewProps> = ({
  favoriteBookIds = [],
  physicalBooks = [],
  digitalBooks = [],
  categories = [],
  currentUser,
  systemConfig,
  onToggleFavorite,
  onOpenReader,
  onRequestLoanSubmit,
  onNavigate,
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'physical' | 'digital'>('all');
  const [requestingLoanBook, setRequestingLoanBook] = useState<PhysicalBook | null>(null);

  // Match favorite items
  const favoritePhysical = physicalBooks.filter((b) => favoriteBookIds.includes(b.id));
  const favoriteDigital = digitalBooks.filter((b) => favoriteBookIds.includes(b.id));

  const allFavorites = [
    ...favoritePhysical.map((b) => ({ ...b, itemType: 'physical' as const })),
    ...favoriteDigital.map((b) => ({ ...b, itemType: 'digital' as const })),
  ];

  const filteredFavorites = allFavorites.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.author.toLowerCase().includes(search.toLowerCase()) ||
      (item.summary && item.summary.toLowerCase().includes(search.toLowerCase()));

    const matchesType = typeFilter === 'all' || item.itemType === typeFilter;

    return matchesSearch && matchesType;
  });

  const getCategory = (catId: string) => categories.find((c) => c.id === catId);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
              <span>مساحتك الخاصة للكتب المحفوظة</span>
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            قائمة الكتب والمراجع المفضلة ({favoriteBookIds.length})
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            جميع الكتب الورقية والرقمية التي قمت بحفظها للرجوع إليها سريعاً دون الحاجة للبحث المتكرر
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              typeFilter === 'all'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            الكل ({allFavorites.length})
          </button>
          <button
            onClick={() => setTypeFilter('physical')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              typeFilter === 'physical'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            ورقية ({favoritePhysical.length})
          </button>
          <button
            onClick={() => setTypeFilter('digital')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              typeFilter === 'digital'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            رقمية ({favoriteDigital.length})
          </button>
        </div>
      </div>

      {/* Search inside favorites */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث سريع في قائمة الكتب المفضلة..."
          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl pr-10 pl-4 py-2.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-amber-500 transition-colors shadow-sm"
        />
      </div>

      {/* Empty State */}
      {filteredFavorites.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900/60 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 space-y-4 shadow-sm">
          <div className="w-16 h-16 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto">
            <Star className="w-8 h-8 fill-amber-400" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-base">
              لا توجد كتب مفضلة محفوظة حالياً
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              يمكنك إضافة أي كتاب ورقي أو رقمي للمفضلة بالضغط على أيقونة النجمة ⭐ في فهرس الكتب الورقية أو المستودع الرقمي.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => onNavigate('physical')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
            >
              <BookOpen className="w-4 h-4" />
              <span>تصفح المكتبة الورقية</span>
            </button>
            <button
              onClick={() => onNavigate('digital')}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <Library className="w-4 h-4" />
              <span>تصفح المستودع الرقمي</span>
            </button>
          </div>
        </div>
      ) : (
        /* Books Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredFavorites.map((item) => {
            const isPhysical = item.itemType === 'physical';
            const cat = getCategory(item.categoryId);
            const isAvailable = isPhysical ? (item as PhysicalBook).availableCopies > 0 : true;

            return (
              <div
                key={item.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/40 rounded-3xl p-5 flex flex-col justify-between transition-all group shadow-sm hover:shadow-md"
              >
                <div className="space-y-3">
                  {/* Top badges */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                          isPhysical
                            ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        }`}
                      >
                        {isPhysical ? 'كتاب ورقي' : 'كتاب رقمي'}
                      </span>

                      {cat && (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                          • {cat.name}
                        </span>
                      )}
                    </div>

                    {/* Remove favorite button */}
                    <button
                      onClick={() => onToggleFavorite(item.id)}
                      className="p-1.5 rounded-xl text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 transition-colors cursor-pointer"
                      title="إزالة من المفضلة"
                    >
                      <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                    </button>
                  </div>

                  {/* Title & Author */}
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-snug group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors line-clamp-2">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
                      المؤلف: {item.author}
                    </p>
                  </div>

                  {/* Summary */}
                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                    {item.summary}
                  </p>

                  {/* Specific Details */}
                  {isPhysical ? (
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-1 text-xs">
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 text-[11px]">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                          الموقع على الرف:
                        </span>
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                          {(item as PhysicalBook).location.cabinet} • {(item as PhysicalBook).location.shelf}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200 dark:border-slate-800">
                        <span className="text-slate-500">النسخ المتوفرة:</span>
                        <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                          {(item as PhysicalBook).availableCopies} من {(item as PhysicalBook).totalCopies}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5 text-emerald-500" />
                        عدد الصفحات: {(item as DigitalBook).pagesCount || 150} صفحة
                      </span>
                      <span className="font-mono font-bold uppercase text-emerald-600 dark:text-emerald-400">
                        {(item as DigitalBook).format}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions Footer */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  {isPhysical ? (
                    currentUser.role === 'admin' ? (
                      <button
                        onClick={() => onNavigate('physical')}
                        className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors"
                      >
                        عرض في الفهرس الورقي
                      </button>
                    ) : isAvailable ? (
                      <button
                        onClick={() => setRequestingLoanBook(item as PhysicalBook)}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                      >
                        <BookPlus className="w-3.5 h-3.5" />
                        <span>طلب استعارة</span>
                      </button>
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-500 text-xs font-semibold">
                        مستعار حالياً
                      </span>
                    )
                  ) : (
                    <button
                      onClick={() => onOpenReader(item as DigitalBook)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>قراءة ومطالعة المتن</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Student Loan Request Modal */}
      {requestingLoanBook && currentUser && (
        <StudentLoanRequestModal
          book={requestingLoanBook}
          currentUser={currentUser}
          isOpen={!!requestingLoanBook}
          availableReasons={systemConfig?.predefinedLoanReasons}
          onClose={() => setRequestingLoanBook(null)}
          onSubmitRequest={(params) => {
            if (onRequestLoanSubmit) {
              onRequestLoanSubmit(params);
            }
          }}
        />
      )}
    </div>
  );
};
