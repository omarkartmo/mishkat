import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  BookOpen,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  MessageSquarePlus,
  RotateCcw,
  Download,
  Loader2,
  AlertCircle,
  Trash2,
  FileText,
  ExternalLink,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { DigitalBook, StudentNote } from '../../types/library';
import { apiClient } from '../../services/apiClient';
import { bookRepository } from '../../services/bookRepository';

// Configure PDF.js worker
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

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
  const [isRenderingPage, setIsRenderingPage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Document & Page state
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(initialPage || 1);
  const [numPages, setNumPages] = useState<number>(book.pagesCount || 1);
  const [scale, setScale] = useState<number>(1.2);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<any>(null);
  const currentBlobUrlRef = useRef<string | null>(null);

  // Load digital book file
  const loadBook = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setErrorCode(null);

    // Revoke previous blob URL if any
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
    setBlobUrl(null);

    // Verify supported format
    const format = (book.format || 'pdf').toLowerCase();
    if (format !== 'pdf' && format !== 'epub') {
      setError('صيغة هذا الكتاب غير مدعومة في القارئ المدمج.');
      setErrorCode('UNSUPPORTED_FORMAT');
      setIsLoading(false);
      return;
    }

    try {
      const res = await bookRepository.fetchBookFileBlob(book.id);
      if (!res.success || !res.data) {
        const status = res.error?.status;
        if (status === 401 || status === 403) {
          setError('ليس لديك صلاحية لقراءة هذا الكتاب.');
          setErrorCode('UNAUTHORIZED');
        } else if (status === 404) {
          setError('ملف الكتاب غير موجود على الخادم المركزي.');
          setErrorCode('FILE_NOT_FOUND');
        } else {
          setError(res.error?.message || 'تعذر تحميل الكتاب من الخادم المركزي.');
          setErrorCode('SERVER_ERROR');
        }
        setIsLoading(false);
        return;
      }

      const fileBlob = res.data;
      const objectUrl = URL.createObjectURL(fileBlob);
      currentBlobUrlRef.current = objectUrl;
      setBlobUrl(objectUrl);

      if (format === 'pdf') {
        const arrayBuffer = await fileBlob.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
          cMapUrl: 'https://unpkg.com/pdfjs-dist@4.10.38/cmaps/',
          cMapPacked: true,
        });

        const loadedPdf = await loadingTask.promise;
        setPdfDoc(loadedPdf);
        setNumPages(loadedPdf.numPages);
        const startPage = Math.min(Math.max(1, initialPage || 1), loadedPdf.numPages);
        setCurrentPage(startPage);
      } else {
        // EPUB or text mode
        setNumPages(book.pagesCount || 10);
      }

      setIsLoading(false);
    } catch (err: any) {
      console.error('[BookReaderModal] Failed to load book document:', err);
      setError('تعذر تحميل الكتاب من الخادم المركزي.');
      setErrorCode('DOCUMENT_LOAD_FAILED');
      setIsLoading(false);
    }
  }, [book.id, book.format, book.pagesCount, initialPage]);

  useEffect(() => {
    loadBook();
    return () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore cancel error
        }
      }
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
    };
  }, [loadBook]);

  // Render current PDF page onto HTML5 Canvas
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        // ignore cancellation
      }
    }

    setIsRenderingPage(true);
    try {
      const page = await pdfDoc.getPage(currentPage);
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;
      await renderTask.promise;
      setIsRenderingPage(false);
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn('[BookReaderModal] Page render error:', err);
      }
      setIsRenderingPage(false);
    }
  }, [pdfDoc, currentPage, scale]);

  useEffect(() => {
    if (pdfDoc && (book.format || 'pdf').toLowerCase() === 'pdf') {
      renderCurrentPage();
    }
  }, [pdfDoc, currentPage, scale, renderCurrentPage]);

  // Progress synchronization
  useEffect(() => {
    onSaveProgress(currentPage, numPages);
  }, [currentPage, numPages, onSaveProgress]);

  // Keyboard navigation & Esc key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        // In Arabic RTL: ArrowRight navigates to previous page
        setCurrentPage((p) => Math.max(1, p - 1));
      } else if (e.key === 'ArrowLeft') {
        // In Arabic RTL: ArrowLeft navigates to next page
        setCurrentPage((p) => Math.min(numPages, p + 1));
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
  }, [numPages, isFullscreen, onClose]);

  // Note creation
  const [newNoteContent, setNewNoteContent] = useState('');
  const [selectedQuote, setSelectedQuote] = useState('');

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
  const progressPercent = numPages > 0 ? Math.round((currentPage / numPages) * 100) : 0;
  const directTokenUrl = `${bookRepository.getBookFileUrl(book.id)}?token=${apiClient.getToken() || ''}`;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col bg-slate-950 text-slate-100 ${
        isFullscreen ? '' : 'sm:p-3'
      }`}
    >
      {/* Top Header Bar */}
      <div className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-3 sm:px-4 shrink-0 shadow-sm relative z-40">
        {/* Book Info & Close */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl transition-colors cursor-pointer"
            title="إغلاق القارئ (Esc)"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="hidden sm:flex flex-col">
            <span className="font-bold text-xs sm:text-sm text-slate-200 truncate max-w-[220px] md:max-w-[340px]">
              {book.title}
            </span>
            <span className="text-[10px] text-slate-400 truncate max-w-[220px]">
              {book.author}
            </span>
          </div>
        </div>

        {/* Center/Right Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setScale((s) => Math.max(0.7, Number((s - 0.15).toFixed(2))))}
              className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="تصغير"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono text-slate-300 w-9 text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => setScale((s) => Math.min(2.5, Number((s + 0.15).toFixed(2))))}
              className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="تكبير"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setScale(1.2)}
              className="p-1 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
              title="إعادة تعيين التكبير"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>

          {/* Page Pagination Controls */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1 text-slate-300 hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
              title="الصفحة السابقة"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1 font-mono text-xs text-slate-200">
              <input
                type="number"
                value={currentPage}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val >= 1 && val <= numPages) setCurrentPage(val);
                }}
                className="w-10 text-center bg-slate-900 border border-slate-700 rounded px-1 py-0.5 outline-none focus:border-indigo-500 text-xs"
                min={1}
                max={numPages}
              />
              <span className="text-slate-500">/</span>
              <span>{numPages}</span>
            </div>

            <button
              onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
              disabled={currentPage >= numPages}
              className="p-1 text-slate-300 hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
              title="الصفحة التالية"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Direct Stream / Download action for external viewers */}
          {blobUrl && (
            <a
              href={blobUrl}
              download={`${book.title}.${book.format || 'pdf'}`}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all flex items-center gap-1 text-xs"
              title="تحميل نسخة للقراءة بدون إنترنت"
            >
              <Download className="w-4 h-4" />
              <span className="hidden md:inline">تحميل</span>
            </a>
          )}

          {/* Notes Toggle */}
          <button
            onClick={() => setShowNotes(!showNotes)}
            className={`p-1.5 rounded-xl text-xs flex items-center gap-1 transition-all cursor-pointer ${
              showNotes ? 'bg-indigo-600 text-white shadow' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title="دفتر الملاحظات والاقتباسات"
          >
            <MessageSquarePlus className="w-4 h-4" />
            <span className="hidden sm:inline">ملاحظاتي ({bookNotes.length})</span>
          </button>

          {/* Fullscreen */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer"
            title={isFullscreen ? 'الخروج من ملء الشاشة' : 'وضع ملء الشاشة للتركيز'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Reading Stage & Sidebar */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Research Notes Drawer */}
        {showNotes && (
          <div className="w-80 md:w-88 bg-slate-900 border-l border-slate-800 flex flex-col h-full z-30 shadow-2xl animate-in slide-in-from-right-5 duration-200">
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
              <h4 className="font-bold text-slate-100 text-xs sm:text-sm flex items-center gap-2">
                <MessageSquarePlus className="w-4 h-4 text-indigo-400" />
                دفتر الملاحظات والاقتباسات
              </h4>
              <button onClick={() => setShowNotes(false)} className="text-slate-400 hover:text-slate-200 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Note creation form */}
            <form onSubmit={handleCreateNote} className="p-3 border-b border-slate-800 space-y-2 text-xs">
              <span className="text-slate-300 font-semibold block text-[11px]">
                تدوين ملاحظة في (صفحة {currentPage}):
              </span>
              <input
                type="text"
                value={selectedQuote}
                onChange={(e) => setSelectedQuote(e.target.value)}
                placeholder="اقتباس نصي من الصفحة (اختياري)..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500 text-xs"
              />
              <textarea
                rows={3}
                required
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                placeholder="اكتب تحليلك المنهجي، الشواهد، أو الفائدة..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200 placeholder-slate-500 resize-none outline-none focus:border-indigo-500 text-xs"
              />
              <button
                type="submit"
                className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-md cursor-pointer text-xs"
              >
                حفظ في مذكرة الطالب
              </button>
            </form>

            {/* Notes List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 text-xs">
              {bookNotes.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs leading-relaxed">
                  لا توجد ملاحظات مسجلة لهذا الكتاب بعد. دوّن أفكارك أثناء المطالعة للرجوع إليها في أبحاثك المدرسية.
                </div>
              ) : (
                bookNotes.map((note) => (
                  <div
                    key={note.id}
                    className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5 group hover:border-slate-700 transition-all"
                  >
                    <div className="flex items-center justify-between text-[11px] text-amber-400 font-medium">
                      <span>صفحة {note.pageNumber}</span>
                      <button
                        onClick={() => onDeleteNote(note.id)}
                        className="text-slate-500 hover:text-rose-400 transition-colors p-0.5 cursor-pointer"
                        title="حذف الملاحظة"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    {note.quote && (
                      <div className="text-[10px] text-slate-400 italic bg-slate-900 p-1.5 rounded border-r-2 border-amber-500">
                        "{note.quote}"
                      </div>
                    )}
                    <p className="text-slate-200 leading-relaxed text-xs">{note.content}</p>
                    <div className="text-[10px] text-slate-500 font-mono">{note.createdAt}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Central Presentation Canvas Area */}
        <div className="flex-1 overflow-auto flex flex-col items-center justify-start p-2 sm:p-6 bg-slate-950/80 select-text">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-400 py-20">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
              <p className="font-medium text-sm">جاري تحميل الكتاب...</p>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-rose-400 max-w-md text-center p-8 rounded-2xl bg-slate-900/60 border border-rose-500/20 my-auto">
              <AlertCircle className="w-12 h-12 text-rose-400" />
              <p className="font-bold text-sm text-rose-300">{error}</p>
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={loadBook}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors font-bold text-xs shadow cursor-pointer"
                >
                  إعادة المحاولة
                </button>
                {directTokenUrl && (
                  <a
                    href={directTokenUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 rounded-xl transition-colors text-xs flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>فتح مباشر</span>
                  </a>
                )}
              </div>
            </div>
          ) : (book.format || 'pdf').toLowerCase() === 'epub' ? (
            /* EPUB / Structured Chapter Presentation */
            <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-10 shadow-2xl space-y-6 text-slate-200">
              <div className="border-b border-slate-800 pb-4">
                <span className="text-xs px-2.5 py-1 bg-indigo-500/20 text-indigo-300 rounded-full font-mono">
                  صيغة EPUB الرقمية
                </span>
                <h2 className="text-xl sm:text-2xl font-bold text-white mt-2">{book.title}</h2>
                <p className="text-sm text-slate-400 mt-1">{book.author}</p>
              </div>

              {/* Table of contents & sample reading */}
              {book.tableOfContents && book.tableOfContents.length > 0 && (
                <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <h4 className="font-bold text-sm text-indigo-400 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    فهرس الموضوعات
                  </h4>
                  <div className="divide-y divide-slate-800 text-xs">
                    {book.tableOfContents.map((item, idx) => (
                      <div key={idx} className="py-2 flex items-center justify-between">
                        <span>{item.title}</span>
                        {item.page && <span className="text-slate-500 font-mono">ص {item.page}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="prose prose-invert max-w-none text-sm leading-loose bg-slate-950/40 p-6 rounded-xl border border-slate-800/80">
                <p>{book.summary || 'محتوى الكتاب متاح للقراءة الأكاديمية والبحث المنهجي المعتمد.'}</p>
              </div>

              <div className="flex justify-center pt-4">
                <a
                  href={blobUrl || directTokenUrl}
                  download={`${book.title}.epub`}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>تحميل ملف EPUB للقارئ الخارجي</span>
                </a>
              </div>
            </div>
          ) : (
            /* HTML5 Canvas Document Renderer (PDF.js) */
            <div className="relative flex flex-col items-center shadow-2xl rounded-lg overflow-hidden bg-white max-w-full my-auto">
              {isRenderingPage && (
                <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-[1px] flex items-center justify-center z-10">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                </div>
              )}
              <canvas ref={canvasRef} className="block max-w-full h-auto" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
