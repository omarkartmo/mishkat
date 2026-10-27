import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Printer,
  Loader2,
  AlertCircle,
  FileText,
  User,
  CheckCircle2,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { DigitalPrintRequest } from '../../services/printRequestRepository';
import { bookRepository } from '../../services/bookRepository';

if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

interface DigitalPrintPreviewModalProps {
  isOpen: boolean;
  request: DigitalPrintRequest | null;
  onClose: () => void;
  onStatusUpdated: (id: string, status: any, adminNotes?: string) => Promise<void>;
}

interface RenderedPage {
  pageNum: number;
  dataUrl: string;
  width: number;
  height: number;
}

export const DigitalPrintPreviewModal: React.FC<DigitalPrintPreviewModalProps> = ({
  isOpen,
  request,
  onClose,
  onStatusUpdated,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderedPages, setRenderedPages] = useState<RenderedPage[]>([]);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const printIframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!isOpen || !request) {
      setRenderedPages([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const loadAndRenderPages = async () => {
      try {
        setIsLoading(true);
        setError(null);
        setRenderedPages([]);

        // 1. Fetch book content Base64
        const res = await bookRepository.fetchBookContent(request.book_id);
        if (!res.success || !res.data?.base64) {
          throw new Error(res.error?.message || 'تعذر تحميل ملف الكتاب لمعاينته.');
        }

        // 2. Decode Base64 to Uint8Array
        const binaryStr = atob(res.data.base64);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        // 3. Load PDF Document via PDF.js
        const loadingTask = pdfjsLib.getDocument({
          data: bytes,
          cMapUrl: '/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/standard_fonts/',
          enableXfa: false,
        });

        const pdfDoc = await loadingTask.promise;
        if (!isMounted) return;

        const startPage = Math.max(1, request.page_from);
        const endPage = Math.min(pdfDoc.numPages, request.page_to);
        const pages: RenderedPage[] = [];

        // High resolution scale for crisp print preview (1.8x)
        const renderScale = 1.8;

        for (let p = startPage; p <= endPage; p++) {
          if (!isMounted) return;
          const page = await pdfDoc.getPage(p);
          const viewport = page.getViewport({ scale: renderScale });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d', { alpha: false });
          if (!ctx) continue;
          ctx.direction = 'ltr';

          await page.render({
            canvasContext: ctx,
            viewport,
          }).promise;

          pages.push({
            pageNum: p,
            dataUrl: canvas.toDataURL('image/png'),
            width: viewport.width,
            height: viewport.height,
          });
        }

        if (isMounted) {
          setRenderedPages(pages);
          setIsLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('[DigitalPrintPreviewModal] Render error:', err);
          setError(err?.message || 'حدث خطأ أثناء إعداد معاينة الصفحات.');
          setIsLoading(false);
        }
      }
    };

    loadAndRenderPages();

    return () => {
      isMounted = false;
    };
  }, [isOpen, request]);

  if (!isOpen || !request) return null;

  const handlePrint = async () => {
    if (renderedPages.length === 0) return;
    setIsPrinting(true);

    try {
      // Build HTML document for isolated printing iframe (Pure original pages on A4 without any added header/footer)
      const pagesHtml = renderedPages
        .map(
          (p) => `
        <div class="page-container">
          <img src="${p.dataUrl}" alt="Page ${p.pageNum}" />
        </div>
      `
        )
        .join('');

      const printDoc = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="utf-8" />
          <title>طباعة صفحات - ${request.book_title}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 0;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            html, body {
              margin: 0;
              padding: 0;
              background: #fff;
              width: 100%;
              height: 100%;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .page-container {
              width: 210mm;
              height: 297mm;
              page-break-after: always;
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
              margin: 0 auto;
              padding: 0;
              background: #fff;
            }
            .page-container:last-child {
              page-break-after: avoid;
            }
            .page-container img {
              width: 100%;
              height: 100%;
              max-width: 210mm;
              max-height: 297mm;
              object-fit: contain;
              display: block;
            }
          </style>
        </head>
        <body>
          ${pagesHtml}
        </body>
        </html>
      `;

      let iframe = printIframeRef.current;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);
        printIframeRef.current = iframe;
      }

      const frameDoc = iframe.contentWindow?.document;
      if (frameDoc) {
        frameDoc.open();
        frameDoc.write(printDoc);
        frameDoc.close();

        setTimeout(() => {
          iframe?.contentWindow?.focus();
          iframe?.contentWindow?.print();
          setIsPrinting(false);

          // Update status to approved_printing if currently pending
          if (request.status === 'pending') {
            onStatusUpdated(request.id, 'approved_printing', 'تمت المعاينة والبدء في الطباعة');
          }
        }, 400);
      } else {
        setIsPrinting(false);
      }
    } catch (err) {
      console.error('[DigitalPrintPreviewModal] Print failed:', err);
      setIsPrinting(false);
      alert('تعذر فتح نافذة الطباعة.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-5xl h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                معاينة طلب طباعة كتاب رقمي
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-400 font-normal border border-sky-500/20">
                  {request.total_pages} {request.total_pages === 1 ? 'صفحة' : 'صفحات'}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                تأكد من الصفحات المطلوبة ثم اضغط طباعة لاختيار الطابعة وتنفيذ الأمر مباشرة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Metadata Card */}
        <div className="p-3.5 sm:px-6 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-400" />
              <span className="text-slate-400">الطالب:</span>
              <span className="text-slate-200 font-bold">{request.student_name}</span>
              {request.student_reg_number && (
                <span className="text-[11px] font-mono text-slate-400">({request.student_reg_number})</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              <span className="text-slate-400">الكتاب:</span>
              <span className="text-slate-200 font-bold max-w-[220px] truncate" title={request.book_title}>
                {request.book_title}
              </span>
            </div>

            <div className="flex items-center gap-2 bg-slate-900 px-3 py-1 rounded-xl border border-slate-800">
              <span className="text-slate-400">نطاق الصفحات:</span>
              <span className="font-mono font-bold text-sky-400">
                من {request.page_from} إلى {request.page_to}
              </span>
            </div>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.15))}
              className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="تصغير المعاينة"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono text-slate-300 w-10 text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(1.8, z + 0.15))}
              className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="تكبير المعاينة"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Preview Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-950 flex flex-col items-center gap-8">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-400 py-24">
              <Loader2 className="w-10 h-10 animate-spin text-sky-400" />
              <p className="font-medium text-sm">جاري جلب ملف الكتاب ومعالجة الصفحات المطلوبة للطباعة...</p>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-rose-400 max-w-md text-center p-8 rounded-2xl bg-slate-900/90 border border-rose-500/20 my-auto">
              <AlertCircle className="w-10 h-10 text-rose-400" />
              <p className="text-sm font-semibold">{error}</p>
            </div>
          ) : renderedPages.length === 0 ? (
            <div className="text-slate-500 text-sm py-20">لا توجد صفحات لمعاينتها</div>
          ) : (
            renderedPages.map((page, index) => (
              <div
                key={page.pageNum}
                className="flex flex-col items-center gap-2 group transition-all"
                style={{ width: `${Math.round(595 * zoomLevel)}px`, maxWidth: '100%' }}
              >
                {/* Page Badge */}
                <div className="w-full flex items-center justify-between text-xs text-slate-400 px-2">
                  <span className="font-mono">
                    ورقة رقم {index + 1} من {renderedPages.length}
                  </span>
                  <span className="bg-slate-800/80 px-2 py-0.5 rounded-md font-mono text-[11px] text-sky-300">
                    صفحة الكتاب: {page.pageNum}
                  </span>
                </div>

                {/* Page Sheet Container */}
                <div className="w-full bg-white rounded-lg shadow-2xl overflow-hidden border border-slate-300 transition-all hover:ring-2 hover:ring-sky-500/40">
                  <img
                    src={page.dataUrl}
                    alt={`Page ${page.pageNum}`}
                    className="w-full h-auto block select-none pointer-events-none"
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:px-6 border-t border-slate-800 bg-slate-900/95 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-400">
            {request.notes && (
              <span className="text-amber-300/90">
                ملاحظة الطالب: <span className="font-normal">{request.notes}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              إلغاء
            </button>

            {request.status === 'approved_printing' && (
              <button
                type="button"
                disabled={isUpdatingStatus}
                onClick={async () => {
                  setIsUpdatingStatus(true);
                  await onStatusUpdated(request.id, 'ready_for_pickup');
                  setIsUpdatingStatus(false);
                  onClose();
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>تعيين كـ "جاهز للاستلام"</span>
              </button>
            )}

            <button
              type="button"
              disabled={isLoading || renderedPages.length === 0 || isPrinting}
              onClick={handlePrint}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition-all shadow-lg hover:shadow-sky-500/20 cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              {isPrinting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جاري إرسال الأمر للطابعة...</span>
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4" />
                  <span>طباعة الصفحات الآن 🖨️</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
