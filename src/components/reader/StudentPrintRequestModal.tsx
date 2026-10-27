import React, { useState } from 'react';
import { Printer, X, BookOpen, AlertCircle, CheckCircle2, FileText, Send, Sparkles } from 'lucide-react';
import { printRequestRepository } from '../../services/printRequestRepository';

interface StudentPrintRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: {
    id: string;
    title: string;
    pagesCount?: number;
  };
  initialPage?: number;
  onSubmitSuccess?: () => void;
}

export const StudentPrintRequestModal: React.FC<StudentPrintRequestModalProps> = ({
  isOpen,
  onClose,
  book,
  initialPage = 1,
  onSubmitSuccess,
}) => {
  const [pageFrom, setPageFrom] = useState<number>(initialPage);
  const [pageTo, setPageTo] = useState<number>(initialPage);
  const [purpose, setPurpose] = useState<string>('بحث صفي');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const totalPages = pageTo >= pageFrom ? pageTo - pageFrom + 1 : 0;
  const maxPagesAllowed = book.pagesCount || 9999;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (pageFrom < 1) {
      setError('رقم صفحة البداية يجب أن يكون 1 أو أكثر.');
      return;
    }
    if (pageTo < pageFrom) {
      setError('صفحة النهاية يجب أن تكون أكبر من أو تساوي صفحة البداية.');
      return;
    }
    if (totalPages > 100) {
      setError('الحد الأقصى لطلب الطباعة في المرة الواحدة هو 100 صفحة حفاظاً على الموارد.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await printRequestRepository.createPrintRequest({
        bookId: book.id,
        bookTitle: book.title,
        pageFrom,
        pageTo,
        purpose,
        notes,
      });

      if (res.success) {
        setSuccessMessage('تم إرسال طلب الطباعة بنجاح لأمين المكتبة! يمكنك متابعة جاهزيته في صفحة الإعارات.');
        if (onSubmitSuccess) onSubmitSuccess();
        setTimeout(() => {
          onClose();
        }, 2200);
      } else {
        setError(res.error?.message || 'تعذر إرسال طلب الطباعة. يرجى المحاولة لاحقاً.');
      }
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء إرسال طلب الطباعة.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" dir="rtl">
      <div className="bg-slate-900 border border-amber-500/30 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col relative text-slate-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-950/70 via-slate-900 to-slate-900 p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-white flex items-center gap-2">
                <span>طلب طباعة صفحات من الكتاب</span>
              </h3>
              <p className="text-xs text-amber-300/80">
                خدمة مخصصة لطلبة المعهد لطباعة أجزاء محددة للمراجعة والبحوث
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Book Info Snippet */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 flex items-start gap-3">
            <BookOpen className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-slate-400">الكتاب الرقمي المختار:</div>
              <div className="font-bold text-sm text-slate-100 truncate">{book.title}</div>
              {book.pagesCount && (
                <div className="text-[11px] text-slate-400 mt-0.5">
                  إجمالي صفحات الكتاب: <span className="font-mono text-amber-300">{book.pagesCount}</span> صفحة
                </div>
              )}
            </div>
          </div>

          {/* Success Notification */}
          {successMessage && (
            <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-2xl p-4 flex items-center gap-3 text-emerald-300 text-xs sm:text-sm animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Error Notification */}
          {error && (
            <div className="bg-rose-950/60 border border-rose-500/40 rounded-2xl p-3.5 flex items-center gap-2.5 text-rose-300 text-xs animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Page Range Inputs */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-300">
              نطاق الصفحات المطلوب طباعتها <span className="text-amber-400">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] text-slate-400 mb-1 block">من صفحة:</span>
                <input
                  type="number"
                  min={1}
                  max={maxPagesAllowed}
                  value={pageFrom}
                  onChange={(e) => setPageFrom(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2 text-center text-sm font-mono text-white outline-none transition-colors"
                  required
                />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 mb-1 block">إلى صفحة:</span>
                <input
                  type="number"
                  min={pageFrom}
                  max={maxPagesAllowed}
                  value={pageTo}
                  onChange={(e) => setPageTo(Math.max(pageFrom, parseInt(e.target.value, 10) || pageFrom))}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2 text-center text-sm font-mono text-white outline-none transition-colors"
                  required
                />
              </div>
            </div>

            {/* Total Pages Calculation Badge */}
            <div className="flex items-center justify-between text-xs bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 text-amber-200">
              <span>إجمالي عدد الصفحات المطلوبة:</span>
              <span className="font-bold font-mono text-amber-300 text-sm">
                {totalPages > 0 ? `${totalPages} صفحة` : 'غير صالح'}
              </span>
            </div>
          </div>

          {/* Purpose Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              الغرض من الطباعة <span className="text-amber-400">*</span>
            </label>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white outline-none transition-colors cursor-pointer"
            >
              <option value="بحث صفي">بحث صفي أو مذكرة دراسية</option>
              <option value="ملخص ومراجعة">ملخص ومراجعة للاختبارات</option>
              <option value="إعداد واجب">إعداد واجب أو تمرين تطبيقي</option>
              <option value="قراءة معمقة">قراءة بحثية معمقة</option>
              <option value="أخرى">أخرى</option>
            </select>
          </div>

          {/* Notes Textarea */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              ملاحظات أو تفاصيل إضافية لأمين المكتبة (اختياري)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: طباعة على وجهين، أو تركيز على المخططات والجداول..."
              className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none transition-colors resize-none placeholder:text-slate-500"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting || totalPages <= 0 || Boolean(successMessage)}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 disabled:opacity-40 transition-all flex items-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>جاري الإرسال...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>إرسال طلب الطباعة</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
