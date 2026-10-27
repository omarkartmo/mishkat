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
  Printer,
  Copy,
  Check,
  Crop,
  Sparkles,
  Quote,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import ePub, { Book, Rendition } from 'epubjs';
import { DigitalBook, StudentNote } from '../../types/library';
import { bookRepository } from '../../services/bookRepository';
import { apiClient } from '../../services/apiClient';
import { telemetryService } from '../../services/telemetry/telemetryService';
import { StudentPrintRequestModal } from './StudentPrintRequestModal';

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
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRenderingPage, setIsRenderingPage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Document & Page state
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(initialPage || 1);
  const [numPages, setNumPages] = useState<number>(book.pagesCount || 1);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const [scale, setScale] = useState<number>(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 1.0 : 1.2));
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  // EPUB State
  const [epubTheme, setEpubTheme] = useState<'dark' | 'light'>('dark');
  const [epubFontSize, setEpubFontSize] = useState<number>(18);
  const [epubToc, setEpubToc] = useState<TocItem[]>([]);
  const [epubCurrentChapter, setEpubCurrentChapter] = useState<string>('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const epubContainerRef = useRef<HTMLDivElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const viewerContainerRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<any>(null);
  const currentBlobUrlRef = useRef<string | null>(null);
  const epubBookRef = useRef<Book | null>(null);
  const epubRenditionRef = useRef<Rendition | null>(null);
  const pageCacheRef = useRef<Map<number, any>>(new Map());

  // Prevent reloading document on page turns by locking initialPage to ref
  const initialPageRef = useRef<number>(initialPage || 1);
  const isRenderingRef = useRef<boolean>(false);
  const pendingPageRef = useRef<number | null>(null);

  // Offscreen pre-rendered canvas cache for instantaneous (0ms) page flipping
  const renderedCanvasCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const [showRenderSpinner, setShowRenderSpinner] = useState(false);

  // Touch navigation and pinch zoom refs for mobile / tablet
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchDistanceRef = useRef<number | null>(null);

  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const numPagesRef = useRef(numPages);
  numPagesRef.current = numPages;
  const lastWheelTransitionRef = useRef<number>(0);
  const accumulatedWheelDeltaRef = useRef<number>(0);

  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [selectedTextPopup, setSelectedTextPopup] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // Scanned page detection & visual OCR snipping quote states
  const [isScannedPage, setIsScannedPage] = useState<boolean>(false);
  const [isOcrSelectionMode, setIsOcrSelectionMode] = useState<boolean>(false);
  const [isDraggingSelection, setIsDraggingSelection] = useState<boolean>(false);
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const [isOcrProcessing, setIsOcrProcessing] = useState<boolean>(false);
  const [ocrResultPopup, setOcrResultPopup] = useState<{ text: string; x: number; y: number; engine?: string } | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const selectionOverlayRef = useRef<HTMLDivElement | null>(null);

  // Touchpad pinch-to-zoom, Ctrl+Wheel zoom, and Continuous Vertical Scroll Down/Up between pages
  useEffect(() => {
    const modalEl = modalRef.current;
    if (!modalEl) return;

    const handleWheel = (e: WheelEvent) => {
      // Touchpad pinch-to-zoom on Windows Precision Touchpads / macOS and mouse Ctrl+Wheel
      // trigger a WheelEvent with ctrlKey === true.
      if (e.ctrlKey) {
        // Prevent default browser-wide window zoom
        e.preventDefault();
        e.stopPropagation();

        if (isEpub) {
          // In EPUB mode, touchpad pinch smoothly scales the reading font size
          const fontDelta = e.deltaY < 0 ? 1 : -1;
          setEpubFontSize((prev) => Math.min(32, Math.max(12, prev + fontDelta)));
        } else {
          // In PDF mode, touchpad pinch smoothly scales canvas zoom in sync with manual buttons
          const zoomDelta = e.deltaY < 0 ? 0.08 : -0.08;
          setScale((prev) => Math.min(2.5, Math.max(0.6, Number((prev + zoomDelta).toFixed(2)))));
        }
        return;
      }

      // Smooth continuous vertical scroll down / up between pages for PDF mode (zero freezing)
      if (!isEpub && viewerContainerRef.current) {
        const container = viewerContainerRef.current;
        const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 12;
        const isAtTop = container.scrollTop <= 12;
        const now = Date.now();

        if (e.deltaY > 0 && isAtBottom) {
          // Reached bottom of current page, continue scrolling down directly into next page
          if (now - lastWheelTransitionRef.current > 160) {
            accumulatedWheelDeltaRef.current += e.deltaY;
            if (accumulatedWheelDeltaRef.current >= 30) {
              if (currentPageRef.current < numPagesRef.current) {
                e.preventDefault();
                lastWheelTransitionRef.current = now;
                accumulatedWheelDeltaRef.current = 0;
                setCurrentPage((p) => Math.min(numPagesRef.current, p + 1));
                container.scrollTop = 0;
              }
            }
          }
        } else if (e.deltaY < 0 && isAtTop) {
          // Reached top of current page, continue scrolling up directly into previous page
          if (now - lastWheelTransitionRef.current > 160) {
            accumulatedWheelDeltaRef.current += e.deltaY;
            if (accumulatedWheelDeltaRef.current <= -30) {
              if (currentPageRef.current > 1) {
                e.preventDefault();
                lastWheelTransitionRef.current = now;
                accumulatedWheelDeltaRef.current = 0;
                setCurrentPage((p) => Math.max(1, p - 1));
                requestAnimationFrame(() => {
                  if (viewerContainerRef.current) {
                    viewerContainerRef.current.scrollTop = viewerContainerRef.current.scrollHeight;
                  }
                });
              }
            }
          }
        } else {
          accumulatedWheelDeltaRef.current = 0;
        }
      }
    };

    modalEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      modalEl.removeEventListener('wheel', handleWheel);
    };
  }, [isEpub]);

  // Prevent mobile screen from sleeping while reading
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch {}
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    initialPageRef.current = initialPage || 1;
    renderedCanvasCacheRef.current.clear();
  }, [book.id]);

  useEffect(() => {
    renderedCanvasCacheRef.current.clear();
  }, [scale]);

  // Debounce spinner so that rapid / pre-rendered flips (<400ms) NEVER show any loading indicator
  useEffect(() => {
    let timer: any = null;
    if (isRenderingPage) {
      timer = setTimeout(() => setShowRenderSpinner(true), 400);
    } else {
      setShowRenderSpinner(false);
    }
    return () => clearTimeout(timer);
  }, [isRenderingPage]);

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
            // If online, perform a fast HEAD verification to ensure file hasn't been deleted on server
            if (typeof navigator !== 'undefined' && navigator.onLine !== false) {
              try {
                const headRes = await fetch(`/api/v1/books/${book.id}/file`, {
                  method: 'HEAD',
                  headers: apiClient.getAuthHeaders(),
                });
                if (headRes.status === 404) {
                  // File was removed from server disk! Purge stale cache and report error.
                  await cacheObj.delete(cacheKey);
                  setError('ملف الكتاب غير موجود على الخادم المركزي (تم حذفه من مساحة التخزين).');
                  setErrorCode('FILE_NOT_FOUND');
                  setIsLoading(false);
                  return;
                } else if (headRes.ok) {
                  fileBlob = await matched.blob();
                } else {
                  fileBlob = await matched.blob();
                }
              } catch {
                // If HEAD fails due to transient connection, keep offline cache
                fileBlob = await matched.blob();
              }
            } else {
              fileBlob = await matched.blob();
            }
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
            if (cacheObj) {
              cacheObj.delete(cacheKey).catch(() => {});
            }
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
          standardFontDataUrl: '/standard_fonts/',
          enableXfa: false,
        });

        const loadedPdf = await loadingTask.promise;
        setPdfDoc(loadedPdf);
        setNumPages(loadedPdf.numPages);
        const startPage = Math.min(Math.max(1, initialPageRef.current || 1), loadedPdf.numPages);
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
      telemetryService.reportReaderError(isEpub ? 'epub' : 'pdf', book.title, err);
    }
  }, [book.id, book.title, isEpub]);

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

        // Enable quoting selected text in EPUB mode
        rendition.on('selected', (cfiRange: string) => {
          try {
            rendition.getRange(cfiRange).then((range: Range) => {
              const text = range?.toString()?.trim();
              if (text && text.length >= 2) {
                setSelectedQuote(text);
                setShowNotes(true);
              }
            });
          } catch {}
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

  // Asynchronous background pre-rendering of adjacent pages onto offscreen canvases
  const prefetchRenderPage = useCallback(async (targetPage: number) => {
    if (!pdfDoc || targetPage < 1 || targetPage > numPages) return;
    const cacheKey = `${targetPage}_${scale}`;
    if (renderedCanvasCacheRef.current.has(cacheKey)) return;

    try {
      let page = pageCacheRef.current.get(targetPage);
      if (!page) {
        page = await pdfDoc.getPage(targetPage);
        pageCacheRef.current.set(targetPage, page);
      }

      const viewport = page.getViewport({ scale });
      const offscreen = document.createElement('canvas');
      offscreen.width = viewport.width;
      offscreen.height = viewport.height;
      const offCtx = offscreen.getContext('2d', { alpha: false });
      if (!offCtx) return;
      // Force Left-to-Right context direction to prevent Arabic glyph inversion / overlapping
      offCtx.direction = 'ltr';

      await page.render({
        canvasContext: offCtx,
        viewport: viewport,
      }).promise;

      // LRU cache eviction: keep up to 12 rendered pages in memory to protect mobile RAM
      if (renderedCanvasCacheRef.current.size >= 12) {
        const oldestKey = renderedCanvasCacheRef.current.keys().next().value;
        if (oldestKey) renderedCanvasCacheRef.current.delete(oldestKey);
      }
      renderedCanvasCacheRef.current.set(cacheKey, offscreen);
    } catch {
      // Non-critical background task
    }
  }, [pdfDoc, scale, numPages]);

  // Render current PDF page onto HTML5 Canvas with pre-render cache & concurrency queue
  const executeRenderPage = useCallback(async (targetPage: number) => {
    if (!pdfDoc || !canvasRef.current) return;

    const cacheKey = `${targetPage}_${scale}`;

    // Helper to render text layer for selection and detect scanned pages
    const updateTextLayer = async (page: any, viewport: any) => {
      if (!textLayerRef.current) return;
      try {
        const textLayerDiv = textLayerRef.current;
        textLayerDiv.innerHTML = '';
        textLayerDiv.style.width = `${viewport.width}px`;
        textLayerDiv.style.height = `${viewport.height}px`;
        textLayerDiv.style.setProperty('--scale-factor', String(viewport.scale));
        const textContent = await page.getTextContent();
        const hasText = Boolean(textContent && textContent.items && textContent.items.length > 0);
        setIsScannedPage(!hasText);

        if (hasText) {
          const textLayer = new pdfjsLib.TextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: viewport,
          });
          await textLayer.render();
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn('[BookReaderModal] TextLayer render error:', err);
        }
      }
    };

    // 1. Instant Cache Hit: Blit pre-rendered canvas in 1-2ms without any blink!
    if (renderedCanvasCacheRef.current.has(cacheKey)) {
      const cached = renderedCanvasCacheRef.current.get(cacheKey)!;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d', { alpha: false });
      if (context) {
        if (canvas.width !== cached.width || canvas.height !== cached.height) {
          canvas.width = cached.width;
          canvas.height = cached.height;
        }
        context.drawImage(cached, 0, 0);
      }

      // Update text layer for selection
      let page = pageCacheRef.current.get(targetPage);
      if (!page) {
        page = await pdfDoc.getPage(targetPage);
        pageCacheRef.current.set(targetPage, page);
      }
      const viewport = page.getViewport({ scale });
      updateTextLayer(page, viewport);

      // Pre-fetch adjacent pages in background while user reads
      if (targetPage + 1 <= numPages) prefetchRenderPage(targetPage + 1);
      if (targetPage + 2 <= numPages) prefetchRenderPage(targetPage + 2);
      if (targetPage - 1 >= 1) prefetchRenderPage(targetPage - 1);
      return;
    }

    // 2. Concurrency Lock & Pending Queue
    if (isRenderingRef.current) {
      pendingPageRef.current = targetPage;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
      }
      return;
    }

    isRenderingRef.current = true;
    setIsRenderingPage(true);

    try {
      let page = pageCacheRef.current.get(targetPage);
      if (!page) {
        page = await pdfDoc.getPage(targetPage);
        pageCacheRef.current.set(targetPage, page);
      }

      const viewport = page.getViewport({ scale });

      // DOUBLE-BUFFERING: Render entirely to an offscreen canvas first to prevent white flash / blink!
      const offscreen = document.createElement('canvas');
      offscreen.width = viewport.width;
      offscreen.height = viewport.height;
      const offCtx = offscreen.getContext('2d', { alpha: false });
      if (!offCtx) return;
      offCtx.direction = 'ltr';

      const renderContext = {
        canvasContext: offCtx,
        viewport: viewport,
      };

      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;
      await renderTask.promise;

      // Only now blit onto visible canvas in 0ms! No blank white canvas ever appears!
      const canvas = canvasRef.current;
      if (canvas) {
        const context = canvas.getContext('2d', { alpha: false });
        if (context) {
          if (canvas.width !== offscreen.width || canvas.height !== offscreen.height) {
            canvas.width = offscreen.width;
            canvas.height = offscreen.height;
          }
          context.drawImage(offscreen, 0, 0);
        }
      }

      // Render TextLayer for text selection and quotes
      await updateTextLayer(page, viewport);

      // Save rendered canvas copy to cache for instant backward/forward re-visitation
      try {
        if (renderedCanvasCacheRef.current.size >= 12) {
          const oldestKey = renderedCanvasCacheRef.current.keys().next().value;
          if (oldestKey) renderedCanvasCacheRef.current.delete(oldestKey);
        }
        renderedCanvasCacheRef.current.set(cacheKey, offscreen);
      } catch {}

      // Pre-fetch adjacent pages in background
      if (targetPage + 1 <= numPages) prefetchRenderPage(targetPage + 1);
      if (targetPage + 2 <= numPages) prefetchRenderPage(targetPage + 2);
      if (targetPage - 1 >= 1) prefetchRenderPage(targetPage - 1);
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn('[BookReaderModal] Page render error:', err);
      }
    } finally {
      renderTaskRef.current = null;
      isRenderingRef.current = false;
      setIsRenderingPage(false);

      if (pendingPageRef.current !== null) {
        const nextTarget = pendingPageRef.current;
        pendingPageRef.current = null;
        executeRenderPage(nextTarget);
      }
    }
  }, [pdfDoc, scale, numPages, prefetchRenderPage]);

  // Global mouseup & selection handler for text quote popup in reader
  useEffect(() => {
    const handleMouseUp = () => {
      setTimeout(() => {
        const selection = window.getSelection();
        const text = selection?.toString()?.trim();
        if (text && text.length >= 2) {
          const range = selection?.getRangeAt(0);
          if (range) {
            const rect = range.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              setSelectedTextPopup({
                text,
                x: rect.left + rect.width / 2,
                y: Math.max(20, rect.top - 12),
              });
              return;
            }
          }
        }
        setSelectedTextPopup(null);
      }, 30);
    };

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || !selection.toString().trim()) {
        setSelectedTextPopup(null);
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  const handleQuoteSelectedText = () => {
    if (!selectedTextPopup?.text) return;
    setSelectedQuote(selectedTextPopup.text);
    setShowNotes(true);
    setSelectedTextPopup(null);
    setTimeout(() => {
      noteTextareaRef.current?.focus();
    }, 150);
  };

  const handleCopySelectedText = () => {
    if (!selectedTextPopup?.text) return;
    navigator.clipboard.writeText(selectedTextPopup.text);
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
      setSelectedTextPopup(null);
    }, 1200);
  };

  // Reset popups on page change
  useEffect(() => {
    setOcrResultPopup(null);
    setSelectionBox(null);
    setSelectedTextPopup(null);
  }, [currentPage]);

  // Apply OCR or native quote to note creation form
  const handleApplyOcrQuote = (textToQuote: string) => {
    if (!textToQuote || !textToQuote.trim()) return;
    setSelectedQuote(textToQuote.trim());
    setShowNotes(true);
    setOcrResultPopup(null);
    setSelectionBox(null);
    setIsOcrSelectionMode(false);
    setSelectedTextPopup(null);
    setTimeout(() => {
      noteTextareaRef.current?.focus();
    }, 150);
  };

  // Drag selection handlers for visual OCR quote tool
  const handleOcrMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const overlay = selectionOverlayRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDraggingSelection(true);
    setSelectionBox({
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
    });
    setOcrResultPopup(null);
    setOcrError(null);
  };

  const handleOcrMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingSelection || !selectionBox) return;
    const overlay = selectionOverlayRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    setSelectionBox((prev) => (prev ? { ...prev, currentX: x, currentY: y } : null));
  };

  const handleOcrMouseUp = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingSelection || !selectionBox) {
      setIsDraggingSelection(false);
      return;
    }
    setIsDraggingSelection(false);

    const w = Math.abs(selectionBox.currentX - selectionBox.startX);
    const h = Math.abs(selectionBox.currentY - selectionBox.startY);

    // Minimum selection size threshold (to prevent accidental tiny clicks)
    if (w < 15 || h < 15) {
      setSelectionBox(null);
      return;
    }

    const canvas = canvasRef.current;
    const overlay = selectionOverlayRef.current;
    if (!canvas || !overlay) {
      setSelectionBox(null);
      return;
    }

    const overlayRect = overlay.getBoundingClientRect();
    const minX = Math.min(selectionBox.startX, selectionBox.currentX);
    const minY = Math.min(selectionBox.startY, selectionBox.currentY);

    // Map screen/overlay coords to actual canvas pixel resolution
    const scaleX = canvas.width / overlayRect.width;
    const scaleY = canvas.height / overlayRect.height;

    const cropX = Math.max(0, Math.round(minX * scaleX));
    const cropY = Math.max(0, Math.round(minY * scaleY));
    const cropW = Math.min(canvas.width - cropX, Math.round(w * scaleX));
    const cropH = Math.min(canvas.height - cropY, Math.round(h * scaleY));

    if (cropW < 10 || cropH < 10) {
      setSelectionBox(null);
      return;
    }

    // Crop snippet onto an offscreen canvas
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const ctx = cropCanvas.getContext('2d');
    if (!ctx) {
      setSelectionBox(null);
      return;
    }

    ctx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    const imageBase64 = cropCanvas.toDataURL('image/png');

    const popupX = overlayRect.left + minX + w / 2;
    const popupY = overlayRect.top + minY;

    setIsOcrProcessing(true);
    setOcrResultPopup({
      text: '',
      x: popupX,
      y: popupY,
    });

    try {
      const res = await bookRepository.ocrSnippet(imageBase64, 'image/png');
      if (res.success && res.data?.text && res.data.text.trim()) {
        setOcrResultPopup({
          text: res.data.text.trim(),
          x: popupX,
          y: popupY,
          engine: res.data.engine,
        });
      } else {
        setOcrError(res.error?.message || 'تعذر التعرف على نص واضح في الفقرة المحددة.');
      }
    } catch (err: any) {
      setOcrError(err?.message || 'حدث خطأ أثناء الاتصال بمحرك التعرف على النصوص.');
    } finally {
      setIsOcrProcessing(false);
    }
  };

  // Full-page OCR recognition
  const handleOcrWholePage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsOcrProcessing(true);
    setOcrError(null);
    setOcrResultPopup({
      text: '',
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });

    try {
      const imageBase64 = canvas.toDataURL('image/jpeg', 0.9);
      const res = await bookRepository.ocrSnippet(imageBase64, 'image/jpeg');
      if (res.success && res.data?.text && res.data.text.trim()) {
        setOcrResultPopup({
          text: res.data.text.trim(),
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
          engine: res.data.engine,
        });
      } else {
        setOcrError(res.error?.message || 'تعذر استخراج نصوص الصفحة. يمكنك كتابة الاقتباس يدوياً في الملاحظات.');
      }
    } catch (err: any) {
      setOcrError(err?.message || 'حدث خطأ أثناء فحص نصوص الصفحة.');
    } finally {
      setIsOcrProcessing(false);
    }
  };

  // Touch navigation handlers for phones (RTL horizontal swipe & 2-finger pinch zoom)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
      touchDistanceRef.current = null;
    } else if (e.touches.length === 2) {
      touchDistanceRef.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartXRef.current = null;
      touchStartYRef.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchDistanceRef.current !== null) {
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const diff = currentDist - touchDistanceRef.current;
      if (Math.abs(diff) > 15) {
        const zoomDelta = diff > 0 ? 0.05 : -0.05;
        setScale((prev) => Math.min(2.5, Math.max(0.6, Number((prev + zoomDelta).toFixed(2)))));
        touchDistanceRef.current = currentDist;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      touchDistanceRef.current = null;
    }
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;

    // Only trigger swipe page turn if not zoomed in (scale <= 1.05)
    // so that when zoomed in, the student can pan across the text freely!
    if (scale <= 1.05 && Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX < 0) {
        // Swiped Left -> Next page in RTL
        if (!isEpub) {
          setCurrentPage((p) => Math.min(numPages, p + 1));
        } else if (epubRenditionRef.current) {
          epubRenditionRef.current.next();
        }
      } else {
        // Swiped Right -> Previous page in RTL
        if (!isEpub) {
          setCurrentPage((p) => Math.max(1, p - 1));
        } else if (epubRenditionRef.current) {
          epubRenditionRef.current.prev();
        }
      }
    }
  };

  useEffect(() => {
    if (pdfDoc && !isEpub) {
      executeRenderPage(currentPage);
    }
  }, [pdfDoc, currentPage, scale, isEpub, executeRenderPage]);

  // Save Progress (debounced to avoid server thrashing during rapid clicks)
  useEffect(() => {
    if (!isEpub && numPages > 0) {
      const timer = setTimeout(() => {
        onSaveProgress(currentPage, numPages);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentPage, numPages, isEpub, onSaveProgress]);

  // Keyboard navigation & Esc key handler (Section 12 & 15 Requirement)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (ocrResultPopup) {
          setOcrResultPopup(null);
          setSelectionBox(null);
          return;
        }
        if (isOcrSelectionMode) {
          setIsOcrSelectionMode(false);
          setSelectionBox(null);
          return;
        }
        if (selectedTextPopup) {
          setSelectedTextPopup(null);
          return;
        }
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      } else if ((e.key === 's' || e.key === 'S' || e.key === 'س') && !isEpub) {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || (target as any).isContentEditable)) {
          return;
        }
        e.preventDefault();
        setIsOcrSelectionMode((prev) => !prev);
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
      } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        // Continuous Scroll Down: if at bottom of page, advance to next page
        if (!isEpub) {
          const container = viewerContainerRef.current;
          const isAtBottom = !container || container.scrollTop + container.clientHeight >= container.scrollHeight - 15;
          if (isAtBottom) {
            e.preventDefault();
            setCurrentPage((p) => Math.min(numPages, p + 1));
            if (container) container.scrollTop = 0;
          }
        }
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        // Continuous Scroll Up: if at top of page, advance to previous page
        if (!isEpub) {
          const container = viewerContainerRef.current;
          const isAtTop = !container || container.scrollTop <= 15;
          if (isAtTop) {
            e.preventDefault();
            setCurrentPage((p) => Math.max(1, p - 1));
            if (container) {
              setTimeout(() => {
                if (viewerContainerRef.current) {
                  viewerContainerRef.current.scrollTop = viewerContainerRef.current.scrollHeight;
                }
              }, 20);
            }
          }
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
      ref={modalRef}
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
                onClick={() => setScale(isMobile ? 1.0 : 1.2)}
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

          {/* Visual Snippet / Area Selection Quote Tool (for Scanned & Digital Books) */}
          {!isEpub && (
            <button
              onClick={() => {
                setIsOcrSelectionMode(!isOcrSelectionMode);
                setSelectedTextPopup(null);
                setOcrResultPopup(null);
              }}
              className={`p-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                isOcrSelectionMode
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-lg ring-2 ring-amber-400/50'
                  : isScannedPage
                  ? 'bg-indigo-600/90 text-white hover:bg-indigo-600 ring-1 ring-indigo-400/40 shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
              title={
                isOcrSelectionMode
                  ? 'إلغاء وضع التحديد (Esc أو مفتاح S)'
                  : 'اقتباس فقرة بالتحديد (OCR) - اسحب بالمؤشر على أي فقرة أو سطر (اختصار: S)'
              }
            >
              <Crop className={`w-4 h-4 ${isOcrSelectionMode ? 'text-slate-950' : 'text-amber-400'}`} />
              <span className="hidden md:inline">
                {isOcrSelectionMode ? 'التحديد نشط (اسحب)' : 'اقتباس بالتحديد (OCR)'}
              </span>
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

          {/* Student Print Request Toggle */}
          <button
            onClick={() => setShowPrintModal(true)}
            className="p-1.5 rounded-xl text-xs flex items-center gap-1 transition-all cursor-pointer bg-slate-800 text-amber-300 hover:bg-slate-700 hover:text-amber-200 border border-amber-500/20 shadow-sm"
            title="طلب طباعة صفحات من هذا الكتاب"
          >
            <Printer className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">طلب طباعة</span>
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
            <form onSubmit={handleCreateNote} className="p-3 border-b border-slate-800 space-y-2.5 text-xs">
              <span className="text-slate-300 font-semibold block text-[11px]">
                تدوين ملاحظة في (صفحة {currentPage}):
              </span>

              {/* Quote Card (if a quote was selected/extracted) */}
              {selectedQuote ? (
                <div className="bg-amber-500/10 border-r-2 border-amber-500 p-2.5 rounded-xl space-y-1.5 shadow-sm">
                  <div className="flex items-center justify-between text-[11px] text-amber-400 font-bold">
                    <span className="flex items-center gap-1">
                      <Quote className="w-3.5 h-3.5" />
                      النص المقتبس من الكتاب:
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedQuote('')}
                      className="text-slate-400 hover:text-rose-400 text-[10px] cursor-pointer"
                      title="إزالة الاقتباس"
                    >
                      إلغاء
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={selectedQuote}
                    onChange={(e) => setSelectedQuote(e.target.value)}
                    className="w-full bg-slate-950/70 border border-amber-500/30 rounded-lg p-1.5 text-slate-200 text-xs italic leading-relaxed outline-none focus:border-amber-400 resize-none font-serif"
                    dir="auto"
                  />
                </div>
              ) : (
                <input
                  type="text"
                  value={selectedQuote}
                  onChange={(e) => setSelectedQuote(e.target.value)}
                  placeholder="اقتباس نصي من الصفحة (اختياري)..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500 text-xs"
                />
              )}

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold block text-[11px]">
                  الفائدة المستخلصة، التحليل، أو الملاحظة الشخصية:
                </label>
                <textarea
                  ref={noteTextareaRef}
                  rows={3}
                  required
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  placeholder="اكتب فائدتك المكتسبة، تحليلك للشاهد، أو تعليقك على هذا الاقتباس..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 placeholder-slate-500 resize-none outline-none focus:border-indigo-500 text-xs leading-relaxed"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-md cursor-pointer text-xs flex items-center justify-center gap-1.5"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                حفظ الفائدة في مذكرة الطالب
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
        <div
          ref={viewerContainerRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="flex-1 overflow-auto flex flex-col items-center justify-start p-2 sm:p-6 bg-slate-950 select-text relative touch-pan-y"
        >
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
            <div
              dir="ltr"
              className="relative flex flex-col items-center shadow-2xl rounded-lg overflow-hidden bg-white my-auto shrink-0 transition-all duration-150 select-text"
              style={{
                direction: 'ltr',
                textAlign: 'left',
                width: isMobile ? `${Math.round((window.innerWidth - 20) * scale)}px` : undefined,
                maxWidth: isMobile ? 'none' : undefined,
                position: 'relative',
              }}
            >
              {showRenderSpinner && (
                <div className="absolute top-3 right-3 bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700/60 flex items-center gap-2 z-20 shadow-xl text-slate-300 text-xs animate-in fade-in duration-150">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  <span className="text-[11px] font-medium">جاري معالجة الصفحة...</span>
                </div>
              )}

              {/* Scanned Book Smart Assistance Badge */}
              {isScannedPage && (
                <div className="absolute top-3 left-3 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-amber-500/40 flex items-center gap-2 z-20 shadow-xl text-slate-200 text-xs animate-in fade-in duration-200">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[11px] font-medium">كتاب مصوّر</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsOcrSelectionMode(true);
                      setOcrResultPopup(null);
                    }}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer transition-colors ${
                      isOcrSelectionMode
                        ? 'bg-amber-500 text-slate-950 font-black'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                  >
                    {isOcrSelectionMode ? 'التحديد نشط' : 'تحديد فقرة للاقتباس'}
                  </button>
                  <button
                    type="button"
                    onClick={handleOcrWholePage}
                    disabled={isOcrProcessing}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg text-[10px] font-semibold cursor-pointer transition-colors disabled:opacity-50"
                  >
                    اقتباس كل الصفحة
                  </button>
                </div>
              )}

              <canvas
                ref={canvasRef}
                dir="ltr"
                className="block h-auto pointer-events-none"
                style={{
                  direction: 'ltr',
                  textAlign: 'left',
                  width: isMobile ? '100%' : undefined,
                  maxWidth: isMobile ? 'none' : '100%',
                }}
              />
              {/* Selectable Text Layer overlay for highlighting & quoting */}
              <div
                ref={textLayerRef}
                className="textLayer absolute inset-0 select-text cursor-text z-10"
                style={{
                  direction: 'ltr',
                  textAlign: 'left',
                }}
              />

              {/* Interactive Snipping / Area Selection Layer for OCR Quotes */}
              {(isOcrSelectionMode || isScannedPage) && (
                <div
                  ref={selectionOverlayRef}
                  onMouseDown={handleOcrMouseDown}
                  onMouseMove={handleOcrMouseMove}
                  onMouseUp={handleOcrMouseUp}
                  className={`absolute inset-0 z-30 select-none ${
                    isOcrSelectionMode ? 'cursor-crosshair bg-indigo-500/5' : 'cursor-text'
                  }`}
                  style={{ pointerEvents: isOcrSelectionMode ? 'auto' : 'none' }}
                >
                  {selectionBox && (
                    <div
                      className="absolute border-2 border-dashed border-indigo-400 bg-indigo-500/25 rounded-lg shadow-2xl pointer-events-none"
                      style={{
                        left: `${Math.min(selectionBox.startX, selectionBox.currentX)}px`,
                        top: `${Math.min(selectionBox.startY, selectionBox.currentY)}px`,
                        width: `${Math.abs(selectionBox.currentX - selectionBox.startX)}px`,
                        height: `${Math.abs(selectionBox.currentY - selectionBox.startY)}px`,
                      }}
                    >
                      <div className="absolute -top-6 right-0 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                        تحديد للاقتباس
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Scoped CSS for TextLayer high-accuracy selection & highlight */}
      <style>{`
        .textLayer {
          position: absolute;
          text-align: initial;
          inset: 0;
          overflow: clip;
          opacity: 1;
          line-height: 1;
          -webkit-text-size-adjust: none;
          text-size-adjust: none;
          transform-origin: 0 0;
          caret-color: transparent;
          z-index: 10;
          pointer-events: auto;
        }
        .textLayer :is(span, br) {
          color: transparent;
          position: absolute;
          white-space: pre;
          cursor: text;
          transform-origin: 0% 0%;
        }
        .textLayer ::selection {
          background: rgba(99, 102, 241, 0.4) !important;
        }
        .textLayer ::-moz-selection {
          background: rgba(99, 102, 241, 0.4) !important;
        }
      `}</style>

      {/* Floating Visual OCR Snippet Recognition Popup */}
      {ocrResultPopup && (
        <div
          style={{
            position: 'fixed',
            left: `${Math.min(window.innerWidth - 180, Math.max(180, ocrResultPopup.x))}px`,
            top: `${Math.min(window.innerHeight - 200, Math.max(70, ocrResultPopup.y))}px`,
            transform: 'translate(-50%, -100%)',
            zIndex: 110,
          }}
          className="bg-slate-900/95 border border-indigo-500/60 shadow-2xl rounded-2xl p-3.5 flex flex-col gap-2.5 backdrop-blur-md w-80 sm:w-96 animate-in fade-in zoom-in-95 duration-150"
        >
          {isOcrProcessing ? (
            <div className="py-4 flex flex-col items-center justify-center gap-2 text-indigo-300">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
              <span className="text-xs font-semibold">جاري التعرف على نص الفقرة واستخراجه (OCR)...</span>
              <span className="text-[10px] text-slate-400">فحص الكلمات والرموز بدقة...</span>
            </div>
          ) : ocrError ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span className="font-bold text-xs text-rose-400 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  تنبيه التعرف البصري
                </span>
                <button
                  type="button"
                  onClick={() => { setOcrResultPopup(null); setOcrError(null); setSelectionBox(null); }}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{ocrError}</p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setOcrResultPopup(null);
                    setOcrError(null);
                    setShowNotes(true);
                    setTimeout(() => noteTextareaRef.current?.focus(), 150);
                  }}
                  className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold text-center cursor-pointer transition-colors"
                >
                  تدوين الاقتباس يدوياً
                </button>
                <button
                  type="button"
                  onClick={() => { setOcrResultPopup(null); setOcrError(null); }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-xs text-indigo-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  النص المستخرج من الفقرة {ocrResultPopup.engine === 'gemini' ? '(ذكاء اصطناعي)' : '(محرك محلي)'}:
                </span>
                <button
                  type="button"
                  onClick={() => { setOcrResultPopup(null); setSelectionBox(null); }}
                  className="text-slate-400 hover:text-white cursor-pointer p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <textarea
                value={ocrResultPopup.text}
                onChange={(e) => setOcrResultPopup({ ...ocrResultPopup, text: e.target.value })}
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 resize-none outline-none focus:border-indigo-500 leading-relaxed font-serif"
                dir="auto"
                placeholder="النص المستخرج..."
              />

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleApplyOcrQuote(ocrResultPopup.text)}
                  className="flex-1 py-1.5 px-3 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
                >
                  <MessageSquarePlus className="w-3.5 h-3.5" />
                  <span>اقتباس وإضافة فائدة</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(ocrResultPopup.text);
                    setIsCopied(true);
                    setTimeout(() => setIsCopied(false), 1500);
                  }}
                  className="py-1.5 px-3 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer flex items-center gap-1"
                >
                  {isCopied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">تم النسخ</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-slate-400" />
                      <span>نسخ</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Selection Quote Tooltip */}
      {selectedTextPopup && (
        <div
          style={{
            position: 'fixed',
            left: `${selectedTextPopup.x}px`,
            top: `${selectedTextPopup.y}px`,
            transform: 'translate(-50%, -100%)',
            zIndex: 100,
          }}
          className="bg-slate-900/95 border border-indigo-500/50 shadow-2xl rounded-2xl px-2.5 py-1.5 flex items-center gap-2 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
        >
          <button
            type="button"
            onClick={handleQuoteSelectedText}
            className="px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition-all shadow-md cursor-pointer select-none"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            <span>اقتباس في الملاحظات</span>
          </button>
          <button
            type="button"
            onClick={handleCopySelectedText}
            className="px-2 py-1 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer flex items-center gap-1 select-none"
          >
            {isCopied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">تم النسخ</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-slate-400" />
                <span>نسخ</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Student Digital Book Print Request Modal */}
      <StudentPrintRequestModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        book={{
          id: book.id,
          title: book.title,
          pagesCount: numPages,
        }}
        initialPage={currentPage}
      />
    </div>
  );
};
