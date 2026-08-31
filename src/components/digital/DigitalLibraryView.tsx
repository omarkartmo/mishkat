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
} from 'lucide-react';
import { DigitalBook, Category, UserRole } from '../../types/library';
import { BulkDigitalImportModal } from './BulkDigitalImportModal';

interface DigitalLibraryViewProps {
  books: DigitalBook[];
  categories: Category[];
  userRole: UserRole;
  favorites: string[];
  onToggleFavorite: (bookId: string) => void;
  onOpenReader: (book: DigitalBook) => void;
  onAddDigitalBook: (book: Omit<DigitalBook, 'id' | 'addedAt' | 'downloadCount' | 'readCount'>) => void;
  onBulkAddDigitalBooks?: (books: Omit<DigitalBook, 'id' | 'addedAt' | 'downloadCount' | 'readCount'>[]) => void;
}

export const DigitalLibraryView: React.FC<DigitalLibraryViewProps> = ({
  books = [],
  categories = [],
  userRole,
  favorites = [],
  onToggleFavorite,
  onOpenReader,
  onAddDigitalBook,
  onBulkAddDigitalBooks,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [formatFilter, setFormatFilter] = useState<'all' | 'pdf' | 'epub'>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

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

  const handleBulkImportSuccess = (importedList: Omit<DigitalBook, 'id' | 'addedAt' | 'downloadCount' | 'readCount'>[]) => {
    if (onBulkAddDigitalBooks) {
      onBulkAddDigitalBooks(importedList);
    } else {
      importedList.forEach((b) => onAddDigitalBook(b));
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
              <span>إضافة كتاب فردي</span>
            </button>
          </div>
        )}
      </div>

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
                      <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold">{book.pages || book.pagesCount || 120} صفحة</span>
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
                    {book.fileSize || `${book.fileSizeMb || 2.4} MB`}
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

      {/* Single Add Digital Book Modal */}
      {isAddModalOpen && (
        <AddDigitalBookModal
          categories={categories}
          onClose={() => setIsAddModalOpen(false)}
          onSave={(data) => {
            onAddDigitalBook(data);
            setIsAddModalOpen(false);
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

// Add Digital Book Modal Component
interface AddDigitalBookModalProps {
  categories: Category[];
  onClose: () => void;
  onSave: (data: any) => void;
}

const AddDigitalBookModal: React.FC<AddDigitalBookModalProps> = ({
  categories,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [format, setFormat] = useState<'pdf' | 'epub'>('pdf');
  const [fileSize, setFileSize] = useState('12.5 MB');
  const [pagesCount, setPagesCount] = useState(300);
  const [sourceOrigin, setSourceOrigin] = useState('المكتبة المركزية');
  const [summary, setSummary] = useState('');
  const [tags, setTags] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !author) {
      alert('يرجى كتابة عنوان الكتاب والمؤلف');
      return;
    }

    onSave({
      title,
      author,
      categoryId,
      format,
      fileSize,
      fileSizeMb: parseFloat(fileSize) || 4.2,
      pages: Number(pagesCount),
      pagesCount: Number(pagesCount),
      sourceOrigin,
      summary,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
            <Library className="w-5 h-5 text-emerald-500" />
            إضافة كتاب إلكتروني إلى الخادم المحلي
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">عنوان الكتاب *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="عنوان الكتاب الرقمي..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">المؤلف / المحقق *</label>
              <input
                type="text"
                required
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="اسم المؤلف..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">القسم / التصنيف *</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">صيغة الملف *</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 font-mono"
              >
                <option value="pdf">PDF Document</option>
                <option value="epub">ePub Book</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">عدد الصفحات التقديري</label>
              <input
                type="number"
                min="1"
                value={pagesCount}
                onChange={(e) => setPagesCount(Number(e.target.value))}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">المصدر المرجعي</label>
              <input
                type="text"
                value={sourceOrigin}
                onChange={(e) => setSourceOrigin(e.target.value)}
                placeholder="مثال: المكتبة الإباضية الشاملة"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">الكلمات الدلالية</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="فقه, مخطوطات, تاريخ"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">نبذة موجزة عن الكتاب</label>
            <textarea
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="وصف مختصر لمحتوى هذا المرجع الرقمي..."
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold shadow-lg shadow-emerald-600/30"
            >
              حفظ ونشر في المستودع
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
