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
  Sun,
  Moon,
  Type,
  List,
  ArrowRight,
  Bookmark,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import ePub, { Book, Rendition } from 'epubjs';
import { DigitalBook, StudentNote } from '../../types/library';
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

interface TocItem {
  id?: string;
  href: string;
  label: string;
  subitems?: TocItem[];
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
  const isEpub = (book.format || 'pdf').toLowerCase() === 'epub';

  const [showNotes, setShowNotes] = useState(false);
  const [showToc, setShowToc] = useState(false);
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

  // EPUB State
  const [epubTheme, setEpubTheme] = useState<'dark' | 'light'>('dark');
  const [epubFontSize, setEpubFontSize] = useState<number>(18);
  const [epubToc, setEpubToc] = useState<TocItem[]>([]);
  const [epubCurrentChapter, setEpubCurrentChapter] = useState<string>('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const epubContainerRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<any>(null);
  const currentBlobUrlRef = useRef<string | null>(null);
  const epubBookRef = useRef<Book | null>(null);
  const epubRenditionRef = useRef<Rendition | null>(null);
  const pageCacheRef = useRef<Map<number, any>>(new Map());

  // Note creation form state
  const [newNoteContent, setNewNoteContent] = useState('');
  const [selectedQuote, setSelectedQuote] = useState('');

  // Load digital book file securely from canonical MISHKAT API
  const loadBook = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setErrorCode(null);
    pageCacheRef.current.clear();

    // Clean up previous blob URL
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
    setBlobUrl(null);

    // Clean up previous EPUB instance if any
    if (epubBookRef.current) {
      try {
        epubBookRef.current.destroy();
      } catch {}
      epubBookRef.current = null;
      epubRenditionRef.current = null;
    }

    try {
      let fileBlob: Blob | null = null;
      const cacheKey = `/mishkat-book-cache/${book.id}`;
      let cacheObj: Cache | null = null;

      // Check client-side CacheStorage for instant offline/multi-student cached load
      try {
        if (typeof window !== 'undefined' && 'caches' in window) {
          cacheObj = await caches.open('mishkat-books-cache-v1');
          const matched = await cacheObj.match(cacheKey);
          if (matched) {
            fileBlob = await matched.blob();
          }
        }
      } catch {}

      if (!fileBlob) {
        // Fetch via application/json Base64 envelope (100% immune to IDM and all browser download extensions)
        const res = await bookRepository.fetchBookContent(book.id);
        if (!res.success || !res.data?.base64) {
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

        // Fast native binary decoding from Base64 to Uint8Array
        const base64Str = res.data.base64;
        const binaryStr = atob(base64Str);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        const mime = isEpub ? 'application/epub+zip' : 'application/pdf';
        fileBlob = new Blob([bytes.buffer], { type: mime });

        // Asynchronously save to client CacheStorage for instant subsequent loads
        if (cacheObj && fileBlob) {
          try {
            const respToCache = new Response(fileBlob, {
              headers: { 'Content-Type': mime },
            });
            cacheObj.put(cacheKey, respToCache).catch(() => {});
          } catch {}
        }
      }

      const objectUrl = URL.createObjectURL(fileBlob);
      currentBlobUrlRef.current = objectUrl;
      setBlobUrl(objectUrl);

      if (!isEpub) {
        // PDF Loading with 100% LOCAL CMaps for instant Arabic glyph parsing without internet
        const arrayBuffer = await fileBlob.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
          cMapUrl: '/cmaps/',
          cMapPacked: true,
          enableXfa: false,
        });

        const loadedPdf = await loadingTask.promise;
        setPdfDoc(loadedPdf);
        setNumPages(loadedPdf.numPages);
        const startPage = Math.min(Math.max(1, initialPage || 1), loadedPdf.numPages);
        setCurrentPage(startPage);
        setIsLoading(false);
      } else {
        // EPUB Loading using epubjs
        const arrayBuffer = await fileBlob.arrayBuffer();
        const epubInstance = ePub(arrayBuffer);
        epubBookRef.current = epubInstance;

        // Load navigation & TOC
        epubInstance.loaded.navigation
          .then((nav) => {
            if (nav && nav.toc) {
              setEpubToc(nav.toc);
            }
          })
          .catch(() => {});

        setIsLoading(false);
      }
    } catch (err: any) {
      console.error('[BookReaderModal] Failed to load book document:', err);
      setError(err?.message || 'تعذر تحميل الكتاب من الخادم المركزي.');
      setErrorCode('DOCUMENT_LOAD_FAILED');
      setIsLoading(false);
    }
  }, [book.id, isEpub, initialPage]);

  useEffect(() => {
    loadBook();
    return () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
      }
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
      if (epubBookRef.current) {
        try {
          epubBookRef.current.destroy();
        } catch {}
      }
    };
  }, [loadBook]);

  // Mount EPUB Rendition once container is rendered
  useEffect(() => {
    if (isEpub && !isLoading && epubBookRef.current && epubContainerRef.current) {
      const container = epubContainerRef.current;
      container.innerHTML = '';

      try {
        const rendition = epubBookRef.current.renderTo(container, {
          width: '100%',
          height: '100%',
          flow: 'scrolled-doc',
          // Security: treat EPUB as untrusted content, containing arbitrary script execution (Section 13)
          allowScriptedContent: false,
        });

        epubRenditionRef.current = rendition;

        // Register themes
        rendition.themes.register('dark', {
          body: {
            background: '#090d16 !important',
            color: '#e2e8f0 !important',
            'font-family': 'system-ui, -apple-system, sans-serif !important',
            'line-height': '1.8 !important',
            padding: '20px !important',
          },
          p: { color: '#cbd5e1 !important' },
          h1: { color: '#f8fafc !important' },
          h2: { color: '#f8fafc !important' },
          h3: { color: '#f8fafc !important' },
        });

        rendition.themes.register('light', {
          body: {
            background: '#ffffff !important',
            color: '#1e293b !important',
            'font-family': 'system-ui, -apple-system, sans-serif !important',
            'line-height': '1.8 !important',
            padding: '20px !important',
          },
          p: { color: '#334155 !important' },
          h1: { color: '#0f172a !important' },
          h2: { color: '#0f172a !important' },
          h3: { color: '#0f172a !important' },
        });

        rendition.themes.select(epubTheme);
        rendition.themes.fontSize(`${epubFontSize}px`);

        rendition.display();

        rendition.on('relocated', (location: any) => {
          if (location && location.start) {
            const pct = location.start.percentage;
            if (pct !== undefined) {
              const estimatedPage = Math.max(1, Math.round(pct * (book.pagesCount || 100)));
              setCurrentPage(estimatedPage);
              onSaveProgress(estimatedPage, book.pagesCount || 100);
            }
          }
        });
      } catch (e) {
        console.error('[BookReaderModal] EPUB render error:', e);
      }
    }
  }, [isEpub, isLoading, epubTheme, epubFontSize, book.pagesCount, onSaveProgress]);

  // Update EPUB theme & font size on change
  useEffect(() => {
    if (epubRenditionRef.current) {
      epubRenditionRef.current.themes.select(epubTheme);
      epubRenditionRef.current.themes.fontSize(`${epubFontSize}px`);
    }
  }, [epubTheme, epubFontSize]);

  // Render current PDF page onto HTML5 Canvas
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {}
    }

    setIsRenderingPage(true);
    try {
      // Instant cache retrieval: avoid re-parsing cross-references
      let page = pageCacheRef.current.get(currentPage);
      if (!page) {
        page = await pdfDoc.getPage(currentPage);
        pageCacheRef.current.set(currentPage, page);
      }

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d', { alpha: false });
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

      // Background pre-fetching of adjacent pages (next and previous) for instant page flipping
      if (currentPage + 1 <= numPages && !pageCacheRef.current.has(currentPage + 1)) {
        pdfDoc.getPage(currentPage + 1).then((nextP: any) => {
          pageCacheRef.current.set(currentPage + 1, nextP);
        }).catch(() => {});
      }
      if (currentPage - 1 >= 1 && !pageCacheRef.current.has(currentPage - 1)) {
        pdfDoc.getPage(currentPage - 1).then((prevP: any) => {
          pageCacheRef.current.set(currentPage - 1, prevP);
        }).catch(() => {});
      }
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn('[BookReaderModal] Page render error:', err);
      }
      setIsRenderingPage(false);
    }
  }, [pdfDoc, currentPage, scale, numPages]);

  useEffect(() => {
    if (pdfDoc && !isEpub) {
      renderCurrentPage();
    }
  }, [pdfDoc, currentPage, scale, isEpub, renderCurrentPage]);

  // Save Progress
  useEffect(() => {
    if (!isEpub) {
      onSaveProgress(currentPage, numPages);
    }
  }, [currentPage, numPages, isEpub, onSaveProgress]);

  // Keyboard navigation & Esc key handler (Section 12 & 15 Requirement)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowRight') {
        // Arabic RTL: ArrowRight navigates to previous page
        if (!isEpub) {
          setCurrentPage((p) => Math.max(1, p - 1));
        } else if (epubRenditionRef.current) {
          epubRenditionRef.current.prev();
        }
      } else if (e.key === 'ArrowLeft') {
        // Arabic RTL: ArrowLeft navigates to next page
        if (!isEpub) {
          setCurrentPage((p) => Math.min(numPages, p + 1));
        } else if (epubRenditionRef.current) {
          epubRenditionRef.current.next();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [numPages, isFullscreen, onClose, isEpub]);

  // Note creation handler
  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim()) return;

    onAddNote({
      bookId: book.id,
      bookTitle: book.title,
      pageNumber: currentPage,
      chapter: epubCurrentChapter || undefined,
      quote: selectedQuote.trim() || undefined,
      content: newNoteContent.trim(),
    });

    setNewNoteContent('');
    setSelectedQuote('');
  };

  const bookNotes = notes.filter((n) => n.bookId === book.id);
  const progressPercent = numPages > 0 ? Math.round((currentPage / numPages) * 100) : 0;

  return (
    <div
      className={`fixed inset-0 z-[110] flex flex-col bg-slate-950 text-slate-100 ${
        isFullscreen ? '' : 'sm:p-3'
      }`}
    >
      {/* Top Header Bar */}
      <div className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-3 sm:px-5 shrink-0 shadow-sm relative z-40">
        {/* Book Info & Close Control */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 p-1.5 sm:px-3 sm:py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl transition-colors cursor-pointer text-xs font-semibold"
            title="الخروج من القارئ (Esc)"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">خروج (ESC)</span>
          </button>

          <div className="hidden sm:flex flex-col">
            <span className="font-bold text-xs sm:text-sm text-slate-200 truncate max-w-[200px] md:max-w-[320px]">
              {book.title}
            </span>
            <span className="text-[10px] text-slate-400 truncate max-w-[200px]">
              {book.author} ({isEpub ? 'ePub' : 'PDF'})
            </span>
          </div>
        </div>

        {/* Central & Format Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* PDF Zoom Controls */}
          {!isEpub ? (
            <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setScale((s) => Math.max(0.6, Number((s - 0.15).toFixed(2))))}
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
                title="إعادة ضبط الحجم"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          ) : (
            /* EPUB Typography & Theme Controls */
            <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setEpubFontSize((s) => Math.max(14, s - 2))}
                className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer text-[10px] font-bold"
                title="تصغير الخط"
              >
                A-
              </button>
              <span className="text-[10px] font-mono text-slate-300 w-7 text-center">
                {epubFontSize}
              </span>
              <button
                onClick={() => setEpubFontSize((s) => Math.min(30, s + 2))}
                className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer text-[10px] font-bold"
                title="تكبير الخط"
              >
                A+
              </button>
              <div className="h-3 w-px bg-slate-800 mx-0.5" />
              <button
                onClick={() => setEpubTheme(epubTheme === 'dark' ? 'light' : 'dark')}
                className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title={epubTheme === 'dark' ? 'الوضع المضيء' : 'الوضع الليلي'}
              >
                {epubTheme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-sky-400" />}
              </button>
            </div>
          )}

          {/* Page Navigation */}
          {!isEpub ? (
            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800 text-xs">
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
          ) : (
            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => epubRenditionRef.current?.prev()}
                className="p-1 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="الصفحة السابقة"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-mono text-slate-400">تصفح ePub</span>
              <button
                onClick={() => epubRenditionRef.current?.next()}
                className="p-1 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="الصفحة التالية"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Table of Contents Toggle (for EPUB) */}
          {isEpub && epubToc.length > 0 && (
            <button
              onClick={() => setShowToc(!showToc)}
              className={`p-1.5 rounded-xl text-xs flex items-center gap-1 transition-all cursor-pointer ${
                showToc ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
              title="فهرس فصول الكتاب"
            >
              <List className="w-4 h-4" />
              <span className="hidden md:inline">الفهرس</span>
            </button>
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

          {/* Fullscreen Reading Mode (Section 15 Requirement) */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer"
            title={isFullscreen ? 'الخروج من ملء الشاشة' : 'وضع ملء الشاشة للتركيز'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Reading Stage & Drawers */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Table of Contents Drawer (EPUB) */}
        {isEpub && showToc && (
          <div className="w-72 bg-slate-900 border-l border-slate-800 flex flex-col h-full z-30 shadow-2xl animate-in slide-in-from-right-5 duration-200">
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
              <h4 className="font-bold text-slate-100 text-xs sm:text-sm flex items-center gap-2">
                <List className="w-4 h-4 text-sky-400" />
                فهرس فصول الكتاب
              </h4>
              <button onClick={() => setShowToc(false)} className="text-slate-400 hover:text-slate-200 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1 text-xs">
              {epubToc.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    if (epubRenditionRef.current) {
                      epubRenditionRef.current.display(item.href);
                      setEpubCurrentChapter(item.label);
                    }
                  }}
                  className="w-full text-right p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors truncate block"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Research Notes Drawer (Section 14 Requirement: Notes Must Remain) */}
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
        <div className="flex-1 overflow-auto flex flex-col items-center justify-start p-2 sm:p-6 bg-slate-950 select-text">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-400 py-20">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
              <p className="font-medium text-sm">جاري تحميل وثيقة الكتاب من الخادم المركزي...</p>
            </div>
          ) : error ? (
            /* Pure In-Platform Error Recovery (Section 16: Zero External Fallback) */
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-rose-400 max-w-md text-center p-8 rounded-2xl bg-slate-900/90 border border-rose-500/20 my-auto shadow-2xl">
              <AlertCircle className="w-12 h-12 text-rose-400" />
              <div>
                <h4 className="font-bold text-base text-rose-300 mb-1">تعذر فتح الكتاب في القارئ المدمج</h4>
                <p className="text-xs text-rose-300/80 leading-relaxed">{error}</p>
                {errorCode && <span className="text-[10px] font-mono text-slate-400 mt-1 block">رمز الخطأ: {errorCode}</span>}
              </div>
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={loadBook}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all font-bold text-xs shadow-md cursor-pointer"
                >
                  إعادة المحاولة
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors text-xs font-semibold cursor-pointer"
                >
                  العودة للمكتبة
                </button>
              </div>
            </div>
          ) : isEpub ? (
            /* Real EPUB Reader Stage (Section 13) */
            <div className="w-full max-w-4xl h-full flex-1 bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col">
              <div
                ref={epubContainerRef}
                className="flex-1 w-full h-full overflow-y-auto"
                style={{ minHeight: '520px' }}
              />
            </div>
          ) : (
            /* Real PDF.js HTML5 Canvas Renderer (Section 12) */
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
