import React, { useState } from 'react';
import {
  LifeBuoy,
  X,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Camera,
} from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { User } from '../../types/library';

interface GlobalReportIssueWidgetProps {
  currentUser?: User | null;
  activeTab?: string;
}

export const GlobalReportIssueWidget: React.FC<GlobalReportIssueWidgetProps> = ({
  currentUser,
  activeTab = 'general',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [problemDescription, setProblemDescription] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleImagePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            setScreenshot(event.target?.result as string);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('حجم الصورة كبير جداً، الحد الأقصى 2 ميجابايت.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        setScreenshot(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!problemDescription.trim()) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await apiClient.post<any>('/support/report-problem', {
        problemDescription: problemDescription.trim(),
        screen: activeTab || window.location.pathname,
        screenshot: screenshot || null,
        diagnosticInfo: {
          userAgent: navigator.userAgent,
          screenResolution: `${window.innerWidth}x${window.innerHeight}`,
          url: window.location.href,
          activeTab,
          userName: currentUser?.name || currentUser?.username || 'مستخدم',
          userRole: currentUser?.role || 'user',
        },
      });

      if (res.success) {
        setSubmitSuccess(true);
        setTimeout(() => {
          setIsOpen(false);
          setProblemDescription('');
          setScreenshot(null);
          setSubmitSuccess(false);
          setIsSubmitting(false);
        }, 1600);
      } else {
        setErrorMessage(res.error?.message || 'تعذر إرسال البلاغ.');
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'حدث خطأ أثناء محاولة الإرسال.');
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Discreet floating widget in bottom-left corner */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 z-40 bg-slate-900/85 hover:bg-slate-850 text-slate-300 hover:text-white border border-slate-700/60 hover:border-slate-500/80 rounded-full px-3 py-1.5 shadow-xl backdrop-blur-md text-xs flex items-center gap-1.5 transition-all duration-200 cursor-pointer group hover:scale-[1.03] select-none"
        title="الإبلاغ عن مشكلة فنية"
      >
        <LifeBuoy className="w-4 h-4 text-sky-400 group-hover:rotate-45 transition-transform duration-300" />
        <span className="text-[11px] font-medium hidden sm:inline">إبلاغ عن مشكل</span>
      </button>

      {/* Modal Dialog */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                  <LifeBuoy className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">الإبلاغ عن مشكلة أو خلل في المنصة</h3>
                  <p className="text-[11px] text-slate-400">سيصل البلاغ مباشرة لفريق الدعم الفني لمراجعته وحله فوراً</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} onPaste={handleImagePaste} className="p-5 space-y-4">
              {submitSuccess ? (
                <div className="py-8 flex flex-col items-center justify-center text-center gap-2 text-emerald-400">
                  <CheckCircle2 className="w-12 h-12 animate-in zoom-in-75 duration-200" />
                  <p className="text-sm font-bold">تم إرسال البلاغ بنجاح!</p>
                  <p className="text-xs text-slate-400">شكراً لك، تم توثيق الملاحظة وسيعمل الفريق على معالجتها.</p>
                </div>
              ) : (
                <>
                  <div className="text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 flex items-center justify-between">
                    <span>
                      الشاشة الحالية: <strong className="text-slate-200 font-mono">{activeTab}</strong>
                    </span>
                    <span>
                      المستخدم: <strong className="text-slate-200">{currentUser?.name || 'مستخدم'}</strong>
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      وصف المشكلة بالتفصيل <span className="text-rose-400">*</span>
                    </label>
                    <textarea
                      rows={4}
                      required
                      value={problemDescription}
                      onChange={(e) => setProblemDescription(e.target.value)}
                      placeholder="صف ما الذي حدث، والخطوات التي قمت بها، وما الذي كنت تتوقع ظهوره..."
                      className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 outline-none resize-none transition-all leading-relaxed"
                    />
                  </div>

                  {/* Screenshot attachment */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-slate-400" />
                        <span>لقطة شاشة (اختياري - يمكنك لصق Ctrl+V مباشرة)</span>
                      </label>
                      {screenshot && (
                        <button
                          type="button"
                          onClick={() => setScreenshot(null)}
                          className="text-[10px] text-rose-400 hover:underline cursor-pointer"
                        >
                          إزالة الصورة
                        </button>
                      )}
                    </div>

                    {screenshot ? (
                      <div className="relative border border-slate-700 rounded-xl overflow-hidden max-h-36 bg-slate-950 flex items-center justify-center">
                        <img src={screenshot} alt="Preview" className="max-h-36 object-contain" />
                      </div>
                    ) : (
                      <label className="flex items-center justify-center border border-dashed border-slate-800 hover:border-slate-700 bg-slate-950/40 rounded-xl p-3 text-xs text-slate-400 hover:text-slate-300 cursor-pointer transition-colors">
                        <span>انقر لاختيار صورة، أو الصق لقطة الشاشة هنا</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  {errorMessage && (
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !problemDescription.trim()}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition-all shadow-md cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>جاري الإرسال...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>إرسال البلاغ</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
};
