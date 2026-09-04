import React, { useState } from 'react';
import {
  Library,
  Search,
  BookOpen,
  FileText,
  Download,
  Star,
  Plus,
  Filter,
  Eye,
  Globe2,
  Tag,
  X,
  Bookmark,
  FolderUp,
  Sparkles,
  Activity,
} from 'lucide-react';
import { DigitalBook, Category, UserRole } from '../../types/library';
import { BulkDigitalImportModal } from './BulkDigitalImportModal';
import { AddDigitalBookModal } from './AddDigitalBookModal';
import { IngestionObservabilityPanel } from '../admin/IngestionObservabilityPanel';

interface DigitalLibraryViewProps {
  books: DigitalBook[];
  categories: Category[];
  userRole: UserRole;
  adminUserId?: string;
  favorites: string[];
  onToggleFavorite: (bookId: string) => void;
  onOpenReader: (book: DigitalBook) => void;
  onAddDigitalBook: (book: Omit<DigitalBook, 'id' | 'addedAt' | 'downloadCount' | 'readCount'>) => void;
  onBulkAddDigitalBooks?: (books: Omit<DigitalBook, 'id' | 'addedAt' | 'downloadCount' | 'readCount'>[]) => void;
  onRefreshBooks?: () => void;
}

export const DigitalLibraryView: React.FC<DigitalLibraryViewProps> = ({
  books = [],
  categories = [],
  userRole,
  adminUserId = '',
  favorites = [],
  onToggleFavorite,
  onOpenReader,
  onAddDigitalBook,
  onBulkAddDigitalBooks,
  onRefreshBooks,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [formatFilter, setFormatFilter] = useState<'all' | 'pdf' | 'epub'>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [showObservability, setShowObservability] = useState(false);

  const filteredBooks = (books || []).filter((b) => {
    const matchesSearch =
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.author.toLowerCase().includes(search.toLowerCase()) ||
      (b.sourceOrigin && b.sourceOrigin.toLowerCase().includes(search.toLowerCase())) ||
      (b.tags && b.tags.some((t) => t.toLowerCase().includes(search.toLowerCase())));

    const matchesCategory = selectedCategory === 'all' || b.categoryId === selectedCategory;
    const matchesFormat = formatFilter === 'all' || b.format === formatFilter;

    return matchesSearch && matchesCategory && matchesFormat;
  });

  const getCategory = (catId: string) => (categories || []).find((c) => c.id === catId);

  const handleBulkImportSuccess = (_importedCount: number) => {
    if (onRefreshBooks) {
      onRefreshBooks();
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 break-words">
            <Library className="w-5 h-5 text-emerald-500 shrink-0" />
            <span className="break-words">المستودع الرقمي المركزي للكتب الإلكترونية</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed break-words">
            مستودع الكتب الإلكترونية (PDF / ePub) المخزنة محلياً على الخادم، متاحة للقراءة المباشرة وتدوين الملاحظات
          </p>
        </div>

        {userRole === 'admin' && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Bulk Importer Button */}
            <button
              onClick={() => setIsBulkModalOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-700/90 hover:bg-emerald-600 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-md shadow-emerald-700/20 transition-all cursor-pointer whitespace-nowrap"
            >
              <FolderUp className="w-4 h-4 shrink-0" />
              <span>استيراد مجلد كتب كامل (Bulk)</span>
            </button>

            {/* Single Book Add Button */}
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>إضافة كتاب رقمي</span>
            </button>

            {/* Ingestion Observability Toggle */}
            <button
              onClick={() => setShowObservability((p) => !p)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap border ${showObservability ? 'bg-sky-600 border-sky-500 text-white' : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
              title="مراقبة خط الاستيراد والطابور"
            >
              <Activity className="w-4 h-4 shrink-0" />
              <span>مراقبة الاستيراد</span>
            </button>
          </div>
        )}
      </div>

      {/* Ingestion Observability Panel (admin only) */}
      {userRole === 'admin' && showObservability && (
        <div className="bg-slate-900/80 border border-sky-900/50 rounded-2xl p-5 shadow-xl">
          <IngestionObservabilityPanel categories={categories} />
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3.5 shadow-sm">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="البحث بالعنوان، المؤلف، المصدر (مثل المكتبة الإباضية)، أو الكلمات المفتاحية..."
              className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 focus:border-emerald-500 rounded-xl pr-10 pl-10 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={formatFilter}
              onChange={(e) => setFormatFilter(e.target.value as any)}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-700 dark:text-slate-300 outline-none focus:border-emerald-500"
            >
              <option value="all">كل الصيغ الرقمية</option>
              <option value="pdf">مستندات PDF فقط</option>
              <option value="epub">كتب ePub فقط</option>
            </select>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-xl font-medium transition-all shrink-0 cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-emerald-600 text-white font-semibold'
                : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            جميع الأقسام ({books.length})
          </button>
          {categories.map((cat) => {
            const count = books.filter((b) => b.categoryId === cat.id).length;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl font-medium transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold'
                    : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                <span>{cat.name}</span>
                <span className="text-[10px] opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Digital Books Grid */}
      {filteredBooks.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-3xl">
          <Library className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">لا توجد كتب رقمية مطابقة للبحث</h3>
          <p className="text-xs text-slate-500 mt-1">
            يمكنك استيراد مجلد كامل أو كتب جديدة من "بوابة المكتبات المعتمدة" بضغطة زر
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {filteredBooks.map((book) => {
            const cat = getCategory(book.categoryId);
            const isFav = favorites.includes(book.id);

            return (
              <div
                key={book.id}
                className="bg-white dark:bg-slate-900/80 hover:bg-slate-50 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-2xl p-5 flex flex-col justify-between transition-all group shadow-sm hover:shadow-md"
              >
                <div className="space-y-3">
                  {/* Top Bar: Category & Format Badge */}
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[11px] px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1"
                      style={{
                        backgroundColor: `${cat?.color || '#059669'}15`,
                        color: cat?.color || '#059669',
                        border: `1px solid ${cat?.color || '#059669'}30`,
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat?.color }} />
                      {cat?.name || 'عام'}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-bold uppercase ${
                          book.format === 'pdf'
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-300 border border-rose-500/20'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20'
                        }`}
                      >
                        {book.format}
                      </span>
                      <button
                        onClick={() => onToggleFavorite(book.id)}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          isFav ? 'text-amber-500 bg-amber-400/10' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                        }`}
                        title="إضافة للمفضلة"
                      >
                        <Star className={`w-4 h-4 ${isFav ? 'fill-amber-400' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Title & Author */}
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base leading-snug group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition-colors">
                      {book.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">{book.author}</p>
                  </div>

                  {/* Summary */}
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                    {book.summary}
                  </p>

                  {/* Metadata Specs Box */}
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80 rounded-xl space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5 text-emerald-500" />
                        عدد الصفحات:
                      </span>
                      <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold">
                        {book.pages || book.pagesCount ? `${book.pages || book.pagesCount} صفحة` : 'غير متوفر'}
                      </span>
                    </div>
                    {book.sourceOrigin && (
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Globe2 className="w-3.5 h-3.5 text-sky-500" />
                          المصدر:
                        </span>
                        <span className="text-sky-600 dark:text-sky-300 font-medium truncate max-w-[150px]">
                          {book.sourceOrigin}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400 font-mono">
                    {book.fileSize ? book.fileSize : (book.fileSizeMb ? `${book.fileSizeMb} MB` : 'غير متوفر')}
                  </span>

                  <button
                    onClick={() => onOpenReader(book)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all cursor-pointer"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>فتح في القارئ المدمج</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Single Add Digital Book Modal — real two-step upload modal */}
      {isAddModalOpen && (
        <AddDigitalBookModal
          categories={categories}
          adminUserId={adminUserId}
          onClose={() => setIsAddModalOpen(false)}
          onSuccess={() => {
            setIsAddModalOpen(false);
            if (onRefreshBooks) onRefreshBooks();
          }}
        />
      )}

      {/* Bulk Digital Importer Modal */}
      {isBulkModalOpen && (
        <BulkDigitalImportModal
          categories={categories}
          isOpen={isBulkModalOpen}
          onClose={() => setIsBulkModalOpen(false)}
          onImportSuccess={handleBulkImportSuccess}
        />
      )}
    </div>
  );
};

