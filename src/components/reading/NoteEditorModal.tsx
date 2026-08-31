import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  BookOpen,
  Library,
  Plus,
  Trash2,
  Edit3,
  Tag,
  Check,
  X,
  Sparkles,
  Quote,
  HelpCircle,
  FolderOpen,
  Search,
} from 'lucide-react';
import { StudentNote, BookMedium, PhysicalBook, DigitalBook } from '../../types/library';
import { matchesArabicQuery } from '../../utils/searchUtils';

interface NoteEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  noteToEdit?: StudentNote | null;
  initialBook?: {
    id: string;
    title: string;
    author?: string;
    medium?: BookMedium;
    page?: number;
  } | null;
  physicalBooks?: PhysicalBook[];
  digitalBooks?: DigitalBook[];
  onSave: (note: Omit<StudentNote, 'id' | 'createdAt'> & { id?: string }) => void;
}

const CATEGORIES = [
  'فائدة فقهية',
  'اقتباس مميز',
  'فكرة للبحث',
  'إشكال وتساؤل',
  'ملخص باب',
  'عام',
] as const;

const COLOR_TAGS = [
  { id: 'amber', label: 'كهرماني', bg: 'bg-amber-500', border: 'border-amber-500' },
  { id: 'emerald', label: 'زمردي', bg: 'bg-emerald-500', border: 'border-emerald-500' },
  { id: 'sky', label: 'سماوي', bg: 'bg-sky-500', border: 'border-sky-500' },
  { id: 'purple', label: 'بنفسجي', bg: 'bg-purple-500', border: 'border-purple-500' },
  { id: 'rose', label: 'وردي', bg: 'bg-rose-500', border: 'border-rose-500' },
] as const;

export const NoteEditorModal: React.FC<NoteEditorModalProps> = ({
  isOpen,
  onClose,
  noteToEdit,
  initialBook,
  physicalBooks = [],
  digitalBooks = [],
  onSave,
}) => {
  if (!isOpen) return null;

  const [bookMedium, setBookMedium] = useState<BookMedium>(
    noteToEdit?.bookMedium || initialBook?.medium || 'physical'
  );
  const [selectedBookId, setSelectedBookId] = useState<string>(
    noteToEdit?.bookId || initialBook?.id || ''
  );
  const [bookTitle, setBookTitle] = useState<string>(
    noteToEdit?.bookTitle || initialBook?.title || ''
  );
  const [pageNumber, setPageNumber] = useState<number>(
    noteToEdit?.pageNumber || initialBook?.page || 1
  );
  const [chapter, setChapter] = useState<string>(noteToEdit?.chapter || '');
  const [quote, setQuote] = useState<string>(noteToEdit?.quote || '');
  const [content, setContent] = useState<string>(noteToEdit?.content || '');
  const [category, setCategory] = useState<any>(
    noteToEdit?.category || 'فكرة للبحث'
  );
  const [colorTag, setColorTag] = useState<any>(
    noteToEdit?.colorTag || 'amber'
  );
  const [tagsInput, setTagsInput] = useState<string>(
    noteToEdit?.tags ? noteToEdit.tags.join('، ') : ''
  );

  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Click outside listener for dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentPool = bookMedium === 'physical' ? physicalBooks : digitalBooks;
  const filteredBooks = currentPool.filter((b) => {
    if (!bookTitle.trim()) return true;
    return (
      matchesArabicQuery(b.title, bookTitle) ||
      matchesArabicQuery(b.author, bookTitle) ||
      (b.isbn && b.isbn.toLowerCase().includes(bookTitle.toLowerCase().trim())) ||
      (b.tags && b.tags.some((t) => matchesArabicQuery(t, bookTitle)))
    );
  });

  const handleSelectBook = (bId: string) => {
    setSelectedBookId(bId);
    if (bookMedium === 'physical') {
      const b = physicalBooks.find((p) => p.id === bId);
      if (b) setBookTitle(b.title);
    } else {
      const b = digitalBooks.find((d) => d.id === bId);
      if (b) setBookTitle(b.title);
    }
    setShowSuggestions(false);
  };

  const handleSelectBookItem = (b: PhysicalBook | DigitalBook) => {
    setSelectedBookId(b.id);
    setBookTitle(b.title);
    setShowSuggestions(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookTitle.trim() || !content.trim()) {
      alert('يرجى تحديد الكتاب وكتابة نص الملاحظة.');
      return;
    }

    const tags = tagsInput
      .split(/[,،]/)
      .map((t) => t.trim())
      .filter(Boolean);

    onSave({
      id: noteToEdit?.id,
      studentId: noteToEdit?.studentId || 'stu-001',
      bookId: selectedBookId || `book-${Date.now()}`,
      bookTitle,
      bookMedium,
      pageNumber: Number(pageNumber) || 1,
      chapter: chapter.trim() || undefined,
      quote: quote.trim() || undefined,
      content: content.trim(),
      category,
      colorTag,
      tags,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl animate-in zoom-in-95 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                {noteToEdit ? 'تعديل الفائدة / الملاحظة' : 'تدوين فائدة أو إشكال علمي'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ربط الملاحظة برقم الصفحة واسم الباب للرجوع السريع
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Book source selection */}
          <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">نوع المرجع:</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBookMedium('physical')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                    bookMedium === 'physical'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <BookOpen className="w-3 h-3" />
                  <span>ورقي</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBookMedium('digital')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                    bookMedium === 'digital'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Library className="w-3 h-3" />
                  <span>إلكتروني</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-2 relative" ref={dropdownRef}>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="ابحث بالعنوان أو اكتبه..."
                    value={bookTitle}
                    onChange={(e) => {
                      setBookTitle(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 font-semibold pl-7"
                  />
                  <Search className="w-3 h-3 text-slate-400 absolute left-2 top-2 pointer-events-none" />
                </div>

                {showSuggestions && (
                  <div className="absolute top-full right-0 left-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredBooks.length === 0 ? (
                      <div className="p-2.5 text-center text-xs text-slate-400">
                        لم يُعثر على كتاب مطابق
                      </div>
                    ) : (
                      filteredBooks.slice(0, 6).map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => handleSelectBookItem(b)}
                          className="w-full text-right p-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center justify-between"
                        >
                          <span className="truncate">{b.title}</span>
                          <span className="text-[10px] text-slate-400 font-normal shrink-0">{b.author}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div>
                <input
                  type="number"
                  required
                  min={1}
                  placeholder="رقم الصفحة"
                  value={pageNumber}
                  onChange={(e) => setPageNumber(Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-center font-bold text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {/* Quick dropdown helper */}
            <select
              value={selectedBookId}
              onChange={(e) => handleSelectBook(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] text-slate-600 dark:text-slate-400"
            >
              <option value="">-- أو اختر من قائمة كتب المكتبة --</option>
              {bookMedium === 'physical'
                ? physicalBooks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))
                : digitalBooks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
            </select>
          </div>

          {/* Chapter / Topic */}
          <div>
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
              اسم الباب / المبحث (اختياري):
            </label>
            <input
              type="text"
              placeholder="مثال: باب الطهارة، فصل في صلاة المسافر"
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Category & Color Tag */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                تصنيف الفائدة:
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                تمييز لوني للبطاقة:
              </label>
              <div className="flex items-center gap-2 pt-0.5">
                {COLOR_TAGS.map((col) => (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => setColorTag(col.id as any)}
                    className={`w-6 h-6 rounded-full ${col.bg} transition-all ${
                      colorTag === col.id ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : 'opacity-60 hover:opacity-100'
                    }`}
                    title={col.label}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Quote (Optional) */}
          <div>
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1 mb-1">
              <Quote className="w-3.5 h-3.5 text-amber-500" />
              <span>نص الاقتباس الحرفي من الصفحة (اختياري):</span>
            </label>
            <input
              type="text"
              placeholder="اكتب العبارة أو الشاهد كما ورد في الكتاب..."
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 italic"
            />
          </div>

          {/* Note content */}
          <div>
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
              نص الفائدة، التحليل، أو التساؤل:
            </label>
            <textarea
              required
              rows={3}
              placeholder="اكتب ما استنبطته أو ما ترغب بمراجعته مع أستاذ المادة..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 leading-relaxed resize-none"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
              كلمات مفتاحية (مفصولة بفواصل):
            </label>
            <input
              type="text"
              placeholder="مثال: فقه مقارن، شرط النية، مراجعة الاختبار"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/30 flex items-center gap-1.5 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>حفظ الفائدة</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
