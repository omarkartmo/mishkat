import React, { useState } from 'react';
import {
  BookOpen,
  BookOpenCheck,
  X,
  MapPin,
  CheckCircle2,
  AlertCircle,
  User,
  ShieldCheck,
  Clock,
  Calendar,
} from 'lucide-react';
import { PhysicalBook, User as UserType } from '../../types/library';

interface StudentLoanRequestModalProps {
  book: PhysicalBook;
  currentUser: UserType;
  isOpen: boolean;
  onClose: () => void;
  availableReasons?: string[];
  onSubmitRequest: (params: {
    bookId: string;
    studentId: string;
    purpose: string;
    customReason?: string;
    requestedDurationDays?: number;
  }) => void;
}

const DEFAULT_REASONS = [
  'بحث أكاديمي وتكليف دراسي',
  'مطالعة ذاتية وثقافة عامة',
  'إعداد ورقة عمل / مشروع تخرج',
  'تحضير للاختبارات والأنشطة الصفية',
  'مراجعة واستخراج مراجع وشواهد',
  'أخرى (تحديد سبب مخصص)',
];

export const StudentLoanRequestModal: React.FC<StudentLoanRequestModalProps> = ({
  book,
  currentUser,
  isOpen,
  onClose,
  availableReasons,
  onSubmitRequest,
}) => {
  const reasonsList = availableReasons && availableReasons.length > 0 
    ? [...availableReasons, 'أخرى (تحديد سبب مخصص)']
    : DEFAULT_REASONS;

  const [selectedPurpose, setSelectedPurpose] = useState<string>(reasonsList[0]);
  const [customReason, setCustomReason] = useState('');
  const [requestedDurationDays, setRequestedDurationDays] = useState<number>(7);
  const [isSubmittedSuccess, setIsSubmittedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen || !book) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (selectedPurpose.includes('أخرى') && !customReason.trim()) {
      setErrorMsg('يرجى كتابة تفاصيل سبب الاستعارة ليتمكن أمين المكتبة من تقييم الطلب وتحديد المدة المناسبة.');
      return;
    }

    if (!requestedDurationDays || requestedDurationDays <= 0) {
      setErrorMsg('يرجى اختيار أو إدخال مدة إعارة صحيحة.');
      return;
    }

    try {
      onSubmitRequest({
        bookId: book.id,
        studentId: currentUser.id,
        purpose: selectedPurpose.includes('أخرى') ? 'سبب مخصص' : selectedPurpose,
        customReason: customReason.trim() || undefined,
        requestedDurationDays: Number(requestedDurationDays),
      });

      setIsSubmittedSuccess(true);
      setTimeout(() => {
        setIsSubmittedSuccess(false);
        onClose();
      }, 2000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء إرسال طلب الاستعارة');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-6 shadow-2xl animate-in zoom-in-95 relative overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                طلب استعارة كتاب ورقي
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                يقوم النظام بتعبئة بيانات الكتاب والطالب تلقائياً، والقرار النهائي للمدة لأمين المكتبة
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSubmittedSuccess ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
              تم إرسال طلب الاستعارة بنجاح!
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
              تلقى أمين المكتبة طلبك مع المدة المقترحة ({requestedDurationDays} أيام). سيصلك إشعار فوري بعد مراجعة الطلب والموافقة على المدة النهائية لاستلام الكتاب.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {errorMsg && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* 1. Auto-filled Book Details (Read-only / Auto-filled) */}
            <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  معلومات الكتاب (مملوءة تلقائياً):
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  متوفر: {book.availableCopies} من {book.totalCopies} نسخة
                </span>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">{book.title}</h4>
                <p className="text-slate-600 dark:text-slate-400 mt-0.5">المؤلف: {book.author}</p>
              </div>

              {/* Physical Shelf Location */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <MapPin className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                <span>
                  موقع الرف: <strong>{book.location?.cabinet || 'الخزانة العامة'}</strong> • <strong>{book.location?.shelf || 'الرف الأول'}</strong>
                </span>
              </div>
            </div>

            {/* 2. Auto-filled Student Details (Read-only) */}
            <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex items-center justify-between text-slate-700 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-indigo-500" />
                <span>
                  الطالب المستعير: <strong>{currentUser.name}</strong> ({currentUser.grade || 'طالب'})
                </span>
              </div>
              <span className="font-mono text-slate-500 text-[11px]">
                {currentUser.registrationNumber}
              </span>
            </div>

            {/* 3. Duration Selector (Student selects, Admin approves) */}
            <div className="space-y-2 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-800/50 rounded-2xl p-3.5">
              <div className="flex items-center justify-between">
                <label className="block text-slate-800 dark:text-slate-200 font-bold flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-500" />
                  <span>المدة التي تحتاجها للكتاب (أيام):</span>
                </label>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                  * القرار النهائي للمدة لأمين المكتبة
                </span>
              </div>

              {/* Quick duration presets */}
              <div className="grid grid-cols-4 gap-2">
                {[3, 7, 14, 21].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setRequestedDurationDays(days)}
                    className={`py-1.5 rounded-xl font-bold transition-all text-xs cursor-pointer ${
                      requestedDurationDays === days
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                    }`}
                  >
                    {days} {days === 3 ? 'أيام' : days === 7 ? 'أيام (أسبوع)' : days === 14 ? 'يوماً (أسبوعين)' : 'يوماً (3 أسابيع)'}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">أو حدد عدداً مخصصاً:</span>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={requestedDurationDays}
                  onChange={(e) => setRequestedDurationDays(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-24 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1 text-center text-slate-800 dark:text-slate-100 font-mono font-bold outline-none focus:border-indigo-500"
                />
                <span className="text-[11px] text-slate-500 dark:text-slate-400">يوم</span>
              </div>
            </div>

            {/* 4. Predefined Reasons Dropdown (Admin prepared list) */}
            <div className="space-y-1.5">
              <label className="block text-slate-700 dark:text-slate-300 font-bold">
                سبب / غرض الإعارة (اختر من القائمة المحددة مسبقاً):
              </label>
              <select
                value={selectedPurpose}
                onChange={(e) => setSelectedPurpose(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200 outline-none focus:border-sky-500 cursor-pointer font-medium"
              >
                {reasonsList.map((purpose, idx) => (
                  <option key={idx} value={purpose}>
                    {purpose}
                  </option>
                ))}
              </select>
            </div>

            {/* 5. Optional / Custom Reason Details */}
            <div className="space-y-1.5">
              <label className="block text-slate-700 dark:text-slate-300 font-bold">
                ملاحظة أو بيان توضيحي لسبب الاستعارة (اختياري):
              </label>
              <textarea
                rows={2}
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="اكتب ملاحظة توضيحية إضافية لأمين المكتبة (مثال: بحث لمادة العلوم، مشروع تخرج)..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200 outline-none focus:border-sky-500 resize-none text-xs"
              />
            </div>

            {/* Flow Info Card */}
            <div className="p-3 bg-sky-500/5 border border-sky-500/15 rounded-xl text-[11px] text-sky-700 dark:text-sky-300 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
              <span>
                <strong>كيف تكتمل الإعارة:</strong> ترسل طلبك بالمدة المقترحة ➔ يراجع أمين المكتبة الطلب ويحدد المدة المعتمدة ➔ يصلك إشعار فوري ➔ تأخذ الكتاب من الرف ويؤكد أمين المكتبة التسليم.
              </span>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold transition-colors cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="submit"
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
              >
                <BookOpenCheck className="w-4 h-4" />
                <span>إرسال طلب الاستعارة</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
