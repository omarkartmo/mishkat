import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Home,
  RefreshCw,
  HelpCircle,
  ShieldCheck,
  Send,
  X,
  CheckCircle2,
  Camera,
  Image as ImageIcon,
  Trash2,
} from 'lucide-react';
import { telemetryService } from '../../services/telemetry/telemetryService';
import { clientEventQueue } from '../../services/telemetry/clientEventQueue';

interface StudentKioskHeaderProps {
  currentScreenName: string;
  onNavigateHome: () => void;
  onRefresh?: () => void;
  onBack?: () => void;
  onForward?: () => void;
}

export const StudentKioskHeader: React.FC<StudentKioskHeaderProps> = ({
  currentScreenName,
  onNavigateHome,
  onRefresh,
  onBack,
  onForward,
}) => {
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [problemDescription, setProblemDescription] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isCompressingImage, setIsCompressingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const queueLength = clientEventQueue.getQueueLength();

  const processImageFile = (file: File | Blob) => {
    if (!file || !file.type.startsWith('image/')) return;
    setIsCompressingImage(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_DIM = 1280;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.7);
          setScreenshot(compressed);
        }
        setIsCompressingImage(false);
      };
      img.onerror = () => setIsCompressingImage(false);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => setIsCompressingImage(false);
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          processImageFile(file);
          break;
        }
      }
    }
  };

  const handleReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!problemDescription.trim()) return;

    setIsSubmitting(true);
    try {
      telemetryService.reportManualProblem(currentScreenName, problemDescription.trim(), {
        screenshot: screenshot || undefined,
      });
      setSubmitSuccess(true);
      setTimeout(() => {
        setIsReportModalOpen(false);
        setProblemDescription('');
        setScreenshot(null);
        setSubmitSuccess(false);
        setIsSubmitting(false);
      }, 1500);
    } catch {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <header className="h-10 bg-slate-950 border-b border-slate-800/80 px-3 flex items-center justify-between text-xs text-slate-300 select-none z-30">
        {/* Left: Controlled Browser Navigation Controls */}
        <div className="flex items-center gap-1">
          {/* Controls removed as requested */}
        </div>

        {/* Center: Educational Application Badge */}
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-purple-400" />
          <span className="font-semibold text-slate-200">MISHKAT Student</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400 text-[11px] truncate max-w-[200px]">{currentScreenName}</span>
        </div>

        {/* Right: Server Status & Report Problem Button */}
        <div className="flex items-center gap-2.5">
          {/* Server Status Indicator Removed */}

          {/* Report Problem Button */}
          <button
            type="button"
            onClick={() => setIsReportModalOpen(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-800 cursor-pointer transition-colors text-[11px]"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>إبلاغ عن مشكلة</span>
          </button>
        </div>
      </header>

      {/* Report Problem Modal */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-slate-100 font-bold text-sm">
                <HelpCircle className="w-4 h-4 text-purple-400" />
                <span>الإبلاغ عن مشكلة تقنية</span>
              </div>
              <button
                type="button"
                onClick={() => setIsReportModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {submitSuccess ? (
              <div className="py-6 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h4 className="text-sm font-bold text-slate-100">تم إرسال التقرير بنجاح</h4>
                <p className="text-xs text-slate-400">
                  شكراً لك. تم إرسال المعلومات التشخيصية إلى مشرف المكتبة للتحقق منها.
                </p>
              </div>
            ) : (
              <form onSubmit={handleReportSubmit} onPaste={handlePaste} className="space-y-3">
                <div className="text-xs text-slate-400">
                  سيتم إرسال وصف المشكلة ومعلومات الشاشة الحالية ({currentScreenName}) فقط دون أي بيانات خاصة.
                </div>

                <div>
                  <label className="block text-xs text-slate-300 font-medium mb-1">
                    ما المشكلة التي واجهتك؟ *
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={problemDescription}
                    onChange={(e) => setProblemDescription(e.target.value)}
                    placeholder="مثال: تعذر تحميل الصفحة رقم 5 في الكتاب أو بطء في عرض الفهرس..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-purple-500 resize-none"
                  />
                </div>

                {/* Screenshot Attachment */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-purple-400" />
                      <span>إرفاق لقطة شاشة / صورة (اختياري)</span>
                    </label>
                    <span className="text-[10px] text-slate-500">أو الصق بالضغط على Ctrl+V</span>
                  </div>

                  {screenshot ? (
                    <div className="relative border border-purple-500/40 rounded-xl p-2 bg-purple-950/20 flex items-center gap-3">
                      <img
                        src={screenshot}
                        alt="Screenshot Preview"
                        className="w-16 h-12 object-cover rounded-lg border border-slate-700 bg-slate-900"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-slate-200 font-medium truncate flex items-center gap-1">
                          <ImageIcon className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span>تم إرفاق لقطة الشاشة بنجاح</span>
                        </div>
                        <div className="text-[10px] text-slate-400">ستُعرض لمشرف المكتبة والدعم الفني للمساعدة</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setScreenshot(null)}
                        className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                        title="حذف الصورة"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="file"
                        id="student-screenshot-file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) processImageFile(file);
                        }}
                      />
                      <label
                        htmlFor="student-screenshot-file"
                        className="border border-dashed border-slate-700 hover:border-purple-500/60 rounded-xl p-2.5 flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-purple-300 hover:bg-slate-950 cursor-pointer transition-all"
                      >
                        {isCompressingImage ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
                            <span>جاري معالجة الصورة...</span>
                          </>
                        ) : (
                          <>
                            <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
                            <span>انقر لاختيار صورة، أو الصق من الحافظة (Ctrl+V)</span>
                          </>
                        )}
                      </label>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsReportModalOpen(false)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !problemDescription.trim()}
                    className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-lg shadow-purple-600/20"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>إرسال التقرير</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
};
