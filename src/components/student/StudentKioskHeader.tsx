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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const queueLength = clientEventQueue.getQueueLength();

  const handleReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!problemDescription.trim()) return;

    setIsSubmitting(true);
    try {
      telemetryService.reportManualProblem(currentScreenName, problemDescription.trim());
      setSubmitSuccess(true);
      setTimeout(() => {
        setIsReportModalOpen(false);
        setProblemDescription('');
        setSubmitSuccess(false);
        setIsSubmitting(false);
      }, 1500);
    } catch {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <header className="h-10 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800/80 px-3 flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 select-none z-30">
        {/* Left: Controlled Browser Navigation Controls */}
        <div className="flex items-center gap-1">
          {/* Controls removed as requested */}
        </div>

        {/* Center: Educational Application Badge */}
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-purple-400" />
          <span className="font-semibold text-slate-800 dark:text-slate-200">MISHKAT Student</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-500 dark:text-slate-400 text-[11px] truncate max-w-[200px]">{currentScreenName}</span>
        </div>

        {/* Right: Server Status & Report Problem Button */}
        <div className="flex items-center gap-2.5">
          {/* Server Status Indicator Removed */}

          {/* Report Problem Button */}
          <button
            type="button"
            onClick={() => setIsReportModalOpen(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-rose-400 border border-slate-200 dark:border-slate-800 cursor-pointer transition-colors text-[11px]"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>إبلاغ عن مشكلة</span>
          </button>
        </div>
      </header>

      {/* Report Problem Modal */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-slate-100 font-bold text-sm">
                <HelpCircle className="w-4 h-4 text-purple-400" />
                <span>الإبلاغ عن مشكلة تقنية</span>
              </div>
              <button
                type="button"
                onClick={() => setIsReportModalOpen(false)}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {submitSuccess ? (
              <div className="py-6 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h4 className="text-sm font-bold text-slate-100">تم إرسال التقرير بنجاح</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  شكراً لك. تم إرسال المعلومات التشخيصية إلى مشرف المكتبة للتحقق منها.
                </p>
              </div>
            ) : (
              <form onSubmit={handleReportSubmit} className="space-y-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  سيتم إرسال وصف المشكلة ومعلومات الشاشة الحالية ({currentScreenName}) فقط دون أي بيانات خاصة.
                </div>

                <div>
                  <label className="block text-xs text-slate-700 dark:text-slate-300 font-medium mb-1">
                    ما المشكلة التي واجهتك؟ *
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={problemDescription}
                    onChange={(e) => setProblemDescription(e.target.value)}
                    placeholder="مثال: تعذر تحميل الصفحة رقم 5 في الكتاب أو بطء في عرض الفهرس..."
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-purple-500 resize-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsReportModalOpen(false)}
                    className="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 cursor-pointer"
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
