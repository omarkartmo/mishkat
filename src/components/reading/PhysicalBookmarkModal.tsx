import React, { useState, useEffect, useRef } from 'react';
import {
  Bookmark,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  Edit3,
  Trash2,
  Clock,
  MapPin,
  FileText,
  Check,
  X,
  Plus,
  Search,
  Layers,
} from 'lucide-react';
import { PhysicalBookmark, PhysicalBook, ShelfLocation } from '../../types/library';
import { matchesArabicQuery } from '../../utils/searchUtils';

interface PhysicalBookmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  book?: PhysicalBook | null;
  existingBookmark?: PhysicalBookmark | null;
  physicalBooks?: PhysicalBook[];
  onSave: (data: {
    bookId: string;
    bookTitle: string;
    bookAuthor?: string;
    location?: ShelfLocation;
    currentPage: number;
    totalPages: number;
    chapterOrTopic?: string;
    quickNote?: string;
    isCompleted?: boolean;
  }) => void;
  onDelete?: (bookmarkId: string) => void;
}

export const PhysicalBookmarkModal: React.FC<PhysicalBookmarkModalProps> = ({
  isOpen,
  onClose,
  book,
  existingBookmark,
  physicalBooks = [],
  onSave,
  onDelete,
}) => {
  if (!isOpen) return null;

  const [selectedBookId, setSelectedBookId] = useState<string>(
    book?.id || existingBookmark?.bookId || ''
  );
  const [bookTitle, setBookTitle] = useState<string>(
    book?.title || existingBookmark?.bookTitle || ''
  );
  const [bookAuthor, setBookAuthor] = useState<string>(
    book?.author || existingBookmark?.bookAuthor || ''
  );
  const [bookLocation, setBookLocation] = useState<ShelfLocation | undefined>(
    book?.location || existingBookmark?.location
  );
  const [totalPages, setTotalPages] = useState<number>(
    book?.pages || existingBookmark?.totalPages || 300
  );
  const [currentPage, setCurrentPage] = useState<number>(
    existingBookmark?.currentPage || 1
  );
  const [chapterOrTopic, setChapterOrTopic] = useState<string>(
    existingBookmark?.chapterOrTopic || ''
  );
  const [quickNote, setQuickNote] = useState<string>(
    existingBookmark?.quickNote || ''
  );
  const [isCompleted, setIsCompleted] = useState<boolean>(
    existingBookmark?.isCompleted || (existingBookmark?.currentPage || 0) >= (existingBookmark?.totalPages || 300)
  );

  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync state when props change
  useEffect(() => {
    if (book) {
      setSelectedBookId(book.id);
      setBookTitle(book.title);
      setBookAuthor(book.author || '');
      setBookLocation(book.location);
      setTotalPages(book.pages || 300);
    } else if (existingBookmark) {
      setSelectedBookId(existingBookmark.bookId);
      setBookTitle(existingBookmark.bookTitle);
      setBookAuthor(existingBookmark.bookAuthor || '');
      setBookLocation(existingBookmark.location);
      setTotalPages(existingBookmark.totalPages || 300);
      setCurrentPage(existingBookmark.currentPage || 1);
      setChapterOrTopic(existingBookmark.chapterOrTopic || '');
      setQuickNote(existingBookmark.quickNote || '');
      setIsCompleted(existingBookmark.isCompleted || false);
    }
  }, [book, existingBookmark]);

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

  // Filter matching physical books with advanced Arabic normalization
  const filteredBooks = physicalBooks.filter((b) => {
    if (!bookTitle.trim()) return true;
    return (
      matchesArabicQuery(b.title, bookTitle) ||
      matchesArabicQuery(b.author, bookTitle) ||
      (b.isbn && b.isbn.toLowerCase().includes(bookTitle.toLowerCase().trim())) ||
      (b.tags && b.tags.some((t) => matchesArabicQuery(t, bookTitle)))
    );
  });

  const handleSelectBookSuggestion = (selected: PhysicalBook) => {
    setSelectedBookId(selected.id);
    setBookTitle(selected.title);
    setBookAuthor(selected.author || '');
    setBookLocation(selected.location);
    const pagesCount = selected.pages || 300;
    setTotalPages(pagesCount);
    if (currentPage > pagesCount) {
      setCurrentPage(1);
    }
    setShowSuggestions(false);
  };

  const percentage = Math.min(100, Math.round((currentPage / (totalPages || 1)) * 100));

  const handlePageChange = (val: number) => {
    const clamped = Math.max(1, Math.min(totalPages, val));
    setCurrentPage(clamped);
    if (clamped >= totalPages) {
      setIsCompleted(true);
    }
  };

  const handleQuickAddPages = (add: number) => {
    handlePageChange(currentPage + add);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookTitle.trim()) return;

    onSave({
      bookId: selectedBookId || `phys-manual-${Date.now()}`,
      bookTitle: bookTitle.trim(),
      bookAuthor: bookAuthor.trim(),
      location: bookLocation,
      currentPage,
      totalPages: Math.max(1, totalPages),
      chapterOrTopic: chapterOrTopic.trim(),
      quickNote: quickNote.trim(),
      isCompleted,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl animate-in zoom-in-95 space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Bookmark className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                فاصل القراءة لمطالعة الكتب الورقية
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                حفظ موضع ومتابعة صفحات القراءة الجارية في قاعة المكتبة
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Autocomplete Book Title Input with suggestions */}
          <div className="space-y-1.5 relative" ref={dropdownRef}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-amber-500" />
                <span>عنوان الكتاب الورقي:</span>
                <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] text-slate-400">اكتب اسم الكتاب لاقتراحه تلقائياً</span>
            </div>

            <div className="relative">
              <input
                type="text"
                required
                placeholder="مثال: مقدمة ابن خلدون، رياض الصالحين..."
                value={bookTitle}
                onChange={(e) => {
                  setBookTitle(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:border-amber-500 pl-9"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            </div>

            {/* Smart Suggestions Dropdown */}
            {showSuggestions && (
              <div className="absolute top-full right-0 left-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-50 max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in-50">
                <div className="p-2 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  <span>اقتراحات من فهرس الكتب ({filteredBooks.length})</span>
                  <span>اضغط للتعبئة التلقائية</span>
                </div>
                {filteredBooks.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-400">
                    لم يتم العثور على كتاب مطابق، يمكنك كتابة العنوان ومتابعة القراءة.
                  </div>
                ) : (
                  filteredBooks.slice(0, 8).map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => handleSelectBookSuggestion(b)}
                      className="w-full text-right p-3 hover:bg-amber-500/10 transition-colors flex items-start justify-between gap-2 cursor-pointer group"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 truncate">
                          {b.title}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
                          <span>المؤلف: {b.author}</span>
                          <span>•</span>
                          <span>{b.pages || 300} صفحة</span>
                          {b.location && (
                            <>
                              <span>•</span>
                              <span className="text-amber-600 dark:text-amber-400 font-mono">
                                📍 {b.location.cabinet} - {b.location.shelf}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 group-hover:bg-amber-500/20 text-slate-600 dark:text-slate-300 font-medium">
                        اختيار
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Selected Book Context Tags */}
            {(bookAuthor || bookLocation) && (
              <div className="flex items-center gap-2 flex-wrap pt-1 text-[11px]">
                {bookAuthor && (
                  <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md">
                    المؤلف: <strong className="text-slate-800 dark:text-slate-100">{bookAuthor}</strong>
                  </span>
                )}
                {bookLocation && (
                  <span className="bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-md flex items-center gap-1 font-mono">
                    <MapPin className="w-3 h-3" />
                    موقع الرف: {bookLocation.cabinet} - {bookLocation.shelf}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Page Tracking Controls */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                الصفحة التي وصلت إليها:
              </label>
              <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                {currentPage} من {totalPages} صفحة ({percentage}%)
              </span>
            </div>

            {/* Slider */}
            <input
              type="range"
              min={1}
              max={totalPages}
              value={currentPage}
              onChange={(e) => handlePageChange(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />

            {/* Number Input & Quick Jumps & Total Pages Input */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">رقم الصفحة:</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={currentPage}
                  onChange={(e) => handlePageChange(Number(e.target.value))}
                  className="w-20 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-center font-bold text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
                />
                <span className="text-xs text-slate-400">من إجمالي:</span>
                <input
                  type="number"
                  min={1}
                  value={totalPages}
                  onChange={(e) => setTotalPages(Math.max(1, Number(e.target.value)))}
                  className="w-20 px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-center text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-amber-500"
                  title="إجمالي صفحات الكتاب"
                />
              </div>

              {/* Quick Jump Buttons */}
              <div className="flex items-center gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => handleQuickAddPages(5)}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-mono text-[11px] cursor-pointer"
                >
                  +5
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAddPages(10)}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-mono text-[11px] cursor-pointer"
                >
                  +10
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAddPages(25)}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-mono text-[11px] cursor-pointer"
                >
                  +25
                </button>
              </div>
            </div>
          </div>

          {/* Chapter / Topic Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              اسم الباب / الفصل أو الموضوع الحالي (اختياري):
            </label>
            <input
              type="text"
              placeholder="مثال: الباب الثاني: في العمران البدوي والحضري"
              value={chapterOrTopic}
              onChange={(e) => setChapterOrTopic(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Quick Session Note */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              ملاحظة سريعة لتتذكر أين وقفت بالضبط:
            </label>
            <textarea
              rows={2}
              placeholder="مثال: وقفت عند المبحث الخاص بتأثير المناخ على طبائع الشعوب..."
              value={quickNote}
              onChange={(e) => setQuickNote(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          {/* Complete Toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={isCompleted}
              onChange={(e) => setIsCompleted(e.target.checked)}
              className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
            />
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              أكملت قراءة هذا الكتاب بالكامل (وضع علامة مكتمل)
            </span>
          </label>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            {existingBookmark && onDelete ? (
              <button
                type="button"
                onClick={() => {
                  onDelete(existingBookmark.id);
                  onClose();
                }}
                className="px-3 py-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>إزالة الفاصل</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-600/30 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>تثبيت فاصل القراءة</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
