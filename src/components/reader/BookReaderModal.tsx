import React, { useState, useEffect } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  BookOpen,
  Search,
  Type,
  ZoomIn,
  ZoomOut,
  Sun,
  Moon,
  List,
  Plus,
  Minus,
  Maximize2,
  Minimize2,
  Bookmark,
  MessageSquarePlus,
  AlignJustify,
  Check,
  Volume2,
  Download,
  Loader2,
  AlertCircle,
  Trash2
} from 'lucide-react';
import { DigitalBook, StudentNote } from '../../types/library';
import { apiClient } from '../../services/apiClient';
import { bookRepository } from '../../services/bookRepository';

interface BookReaderModalProps {
  book: DigitalBook;
  initialPage: number;
  onClose: () => void;
  onSaveProgress: (page: number, totalPages: number) => void;
  notes: StudentNote[];
  onAddNote: (note: Omit<StudentNote, 'id' | 'createdAt' | 'studentId'>) => void;
  onDeleteNote: (noteId: string) => void;
}

export const BookReaderModal: React.FC<BookReaderModalProps> = ({
  book,
  initialPage,
  onClose,
  onSaveProgress,
  notes,
  onAddNote,
  onDeleteNote,
}) => {
  const [showNotes, setShowNotes] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const currentBlobUrlRef = React.useRef<string | null>(null);

  const fetchBookFile = async () => {
    setIsLoading(true);
    setError(null);

    // Clean up previous blob URL if any
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
    setBlobUrl(null);

    const res = await bookRepository.fetchBookFileBlob(book.id);
    if (res.success && res.data) {
      const url = URL.createObjectURL(res.data);
      currentBlobUrlRef.current = url;
      setBlobUrl(url);
    } else {
      setError(res.error?.message || 'تعذر تحميل الكتاب الرقمي من الخادم المركزي.');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchBookFile();
    return () => {
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
    };
  }, [book.id]);

  // Note creation form state
  const [newNoteContent, setNewNoteContent] = useState('');
  const [selectedQuote, setSelectedQuote] = useState('');

  const progressPercent = book.pagesCount ? Math.round((currentPage / book.pagesCount) * 100) : 0;

  // Auto-save progress
  useEffect(() => {
    onSaveProgress(currentPage, book.pagesCount || 1);
  }, [currentPage, book.pagesCount, onSaveProgress]);

  // Keyboard navigation & Esc key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        // In RTL: ArrowRight goes to previous page
        setCurrentPage((p) => Math.max(1, p - 1));
      } else if (e.key === 'ArrowLeft') {
        // In RTL: ArrowLeft goes to next page
        setCurrentPage((p) => Math.min(book.pagesCount || 1, p + 1));
      } else if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, book.pagesCount, isFullscreen, onClose]);

  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim()) return;

    onAddNote({
      bookId: book.id,
      bookTitle: book.title,
      pageNumber: currentPage,
      quote: selectedQuote.trim() || undefined,
      content: newNoteContent.trim(),
    });

    setNewNoteContent('');
    setSelectedQuote('');
  };

  const bookNotes = notes.filter((n) => n.bookId === book.id);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col bg-slate-950 text-slate-100 ${
        isFullscreen ? '' : 'sm:p-4'
      }`}
    >
      {/* Top Controls Bar */}
      <div className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 shadow-sm relative z-40">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl transition-colors"
            title="إغلاق القارئ (Esc)"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="hidden md:flex flex-col">
            <span className="font-bold text-sm text-slate-200">{book.title}</span>
            <span className="text-[10px] text-slate-500">{book.author}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Progress Indicator */}
          <div className="hidden lg:flex items-center gap-3 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 w-10 text-right">
              {progressPercent}%
            </span>
            <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex items-center gap-2 bg-slate-950 px-2 py-1 rounded-lg font-mono text-xs text-slate-300">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="p-1 hover:text-white disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span>
                <input
                  type="number"
                  value={currentPage}
                  onChange={(e) => setCurrentPage(Number(e.target.value) || 1)}
                  className="w-12 text-center bg-transparent outline-none border-b border-slate-700 focus:border-indigo-500"
                  min={1}
                  max={book.pagesCount || undefined}
                />
              </span>
              <span className="opacity-50">/</span>
              <span>{book.pagesCount || '?'}</span>
              <button
                onClick={() => setCurrentPage(Math.min(book.pagesCount || 1, currentPage + 1))}
                disabled={book.pagesCount ? currentPage === book.pagesCount : false}
                className="p-1 hover:text-white disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Research Notes Toggle */}
          <button
            onClick={() => {
              setShowNotes(!showNotes);
            }}
            className={`p-1.5 rounded-xl text-xs flex items-center gap-1 transition-all ${
              showNotes ? 'bg-indigo-600 text-white shadow' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title="دفتر الملاحظات والاقتباسات"
          >
            <MessageSquarePlus className="w-4 h-4" />
            <span className="hidden sm:inline">ملاحظاتي ({bookNotes.length})</span>
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all"
            title={isFullscreen ? 'الخروج من ملء الشاشة' : 'وضع ملء الشاشة للتركيز'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Reading Stage and Sidebars */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Research Notes & Quotes Drawer */}
        {showNotes && (
          <div className="w-84 bg-slate-900 border-l border-slate-800 flex flex-col h-full z-30 shadow-2xl animate-in slide-in-from-right-5 duration-200">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h4 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                <MessageSquarePlus className="w-4 h-4 text-indigo-400" />
                دفتر الملاحظات والاقتباسات
              </h4>
              <button onClick={() => setShowNotes(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Note form */}
            <form onSubmit={handleCreateNote} className="p-3 border-b border-slate-800 space-y-2.5 text-xs">
              <div className="text-slate-300 font-semibold flex items-center justify-between">
                <span>تدوين ملاحظة في (صفحة {currentPage}):</span>
              </div>
              <input
                type="text"
                value={selectedQuote}
                onChange={(e) => setSelectedQuote(e.target.value)}
                placeholder="اقتباس نصي من الصفحة (اختياري)..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500"
              />
              <textarea
                rows={3}
                required
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                placeholder="اكتب تحليلك المنهجي، الشواهد، أو الفائدة المستخلصة..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 placeholder-slate-500 resize-none outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-md cursor-pointer"
              >
                حفظ في مذكرة الطالب
              </button>
            </form>

            {/* Notes List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
              {bookNotes.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  لا توجد ملاحظات مسجلة لهذا الكتاب بعد. دون أفكارك أثناء المطالعة للرجوع إليها في مشاريعك وأبحاثك المدرسية.
                </div>
              ) : (
                bookNotes.map((note) => (
                  <div
                    key={note.id}
                    className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2 group hover:border-slate-700 transition-all"
                  >
                    <div className="flex items-center justify-between text-[11px] text-amber-400 font-medium">
                      <span>صفحة {note.pageNumber}</span>
                      <button
                         onClick={() => onDeleteNote(note.id)}
                        className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                        title="حذف الملاحظة"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {note.quote && (
                      <div className="text-[11px] text-slate-400 italic bg-slate-900 p-2 rounded-lg border-r-2 border-amber-500">
                        "{note.quote}"
                      </div>
                    )}
                    <p className="text-slate-200 leading-relaxed">{note.content}</p>
                    <div className="text-[10px] text-slate-500 font-mono">{note.createdAt}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Central Book Page Presentation Arena */}
        <div className="flex-1 overflow-auto flex items-center justify-center bg-slate-950/50">
          {isLoading ? (
            <div className="flex flex-col items-center gap-4 text-slate-400">
              <Loader2 className="w-12 h-12 animate-spin text-indigo-500" />
              <p>جاري تحميل المرجع الرقمي من الخادم المركزي...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-4 text-rose-400 max-w-md text-center bg-slate-900/50 p-8 rounded-2xl border border-rose-500/20">
              <AlertCircle className="w-12 h-12" />
              <p>{error}</p>
              <button onClick={fetchBookFile} className="mt-4 px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors font-bold shadow-lg">
                إعادة المحاولة
              </button>
            </div>
          ) : blobUrl ? (
             <iframe
              src={blobUrl}
              className="w-full h-full border-0 bg-white"
              title={`محتوى الكتاب: ${book.title}`}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};
