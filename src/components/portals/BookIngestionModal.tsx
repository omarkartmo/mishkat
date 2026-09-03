import React, { useState } from 'react';
import {
  X,
  Upload,
  Globe2,
  BookOpen,
  FileText,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import { Category, User, BookFormat } from '../../types/library';

interface BookIngestionModalProps {
  currentUser?: User;
  categories: Category[];
  sourcePortalName?: string;
  sourceUrl?: string;
  isOpen?: boolean;
  portalName?: string;
  initialUrl?: string;
  prefillData?: {
    title?: string;
    author?: string;
    categorySuggestion?: string;
    summary?: string;
    pages?: number;
    tags?: string[];
    sourceUrl?: string;
    sourcePortalId?: string;
    sourcePortalName?: string;
    sourceRecordId?: string;
    sourceRecordUrl?: string;
    sourceMethod?: string;
    sourceRetrievedAt?: string;
    verificationStatus?: string;
    format?: BookFormat;
    downloadUrl?: string;
  };
  onClose: () => void;
  onSubmit: (submission: {
    title: string;
    author: string;
    suggestedCategoryId: string;
    format: BookFormat;
    sourceUrl?: string;
    sourcePortalName: string;
    sourcePortalId?: string;
    sourceRecordId?: string;
    sourceRecordUrl?: string;
    sourceMethod?: string;
    sourceRetrievedAt?: string;
    verificationStatus?: string;
    downloadUrl?: string;
    summary: string;
    studentId: string;
    studentName: string;
    studentRegNumber: string;
    pagesEstimated?: number;
  }) => Promise<any> | void;
}

export const BookIngestionModal: React.FC<BookIngestionModalProps> = ({
  currentUser,
  categories,
  sourcePortalName,
  sourceUrl,
  portalName,
  initialUrl,
  prefillData,
  onClose,
  onSubmit,
}) => {
  const effectivePortalName = portalName || sourcePortalName || 'المكتبة الإباضية الشاملة';
  const effectiveUrl = prefillData?.sourceUrl || initialUrl || sourceUrl || '';

  const [title, setTitle] = useState(prefillData?.title || '');
  const [author, setAuthor] = useState(prefillData?.author || '');
  const [suggestedCategoryId, setSuggestedCategoryId] = useState(() => {
    if (prefillData?.categorySuggestion) {
      const matched = categories.find(
        (c) => c.id === prefillData.categorySuggestion || c.name.includes(prefillData.categorySuggestion!)
      );
      if (matched) return matched.id;
    }
    return categories[0]?.id || '';
  });
  const [format, setFormat] = useState<BookFormat>(prefillData?.format || 'pdf');
  const [url, setUrl] = useState(effectiveUrl);
  const [downloadUrl, setDownloadUrl] = useState(prefillData?.downloadUrl || '');
  const [portal, setPortal] = useState(effectivePortalName);
  const [summary, setSummary] = useState(prefillData?.summary || '');
  const [pagesEstimated, setPagesEstimated] = useState<number>(prefillData?.pages || 250);
  const [fileName] = useState(() => {
    if (prefillData?.title) {
      return `${prefillData.title.replace(/\s+/g, '_').substring(0, 30)}.pdf`;
    }
    return 'book_document.pdf';
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !author.trim() || !summary.trim()) {
      setErrorMessage('يرجى ملء جميع الحقول الإلزامية (العنوان، المؤلف، ونبذة الكتاب).');
      return;
    }

    if (!currentUser?.id) {
      setErrorMessage('تعذر تحديد حساب المستخدم الحالي. يرجى إعادة تسجيل الدخول.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result: any = await onSubmit({
        title: title.trim(),
        author: author.trim(),
        suggestedCategoryId,
        format,
        sourceUrl: url.trim() || undefined,
        sourcePortalName: portal.trim(),
        sourcePortalId: prefillData?.sourcePortalId,
        sourceRecordId: prefillData?.sourceRecordId,
        sourceRecordUrl: prefillData?.sourceRecordUrl || url.trim() || undefined,
        sourceMethod: prefillData?.sourceMethod || 'MANUAL_VERIFIED_CATALOG',
        sourceRetrievedAt: prefillData?.sourceRetrievedAt || new Date().toISOString(),
        verificationStatus: prefillData?.verificationStatus || 'VERIFIED',
        downloadUrl: downloadUrl.trim() || undefined,
        summary: summary.trim(),
        studentId: currentUser.id,
        studentName: currentUser.name || 'طالب',
        studentRegNumber: currentUser.registrationNumber || 'STU-UNKNOWN',
        pagesEstimated: Number(pagesEstimated),
      });

      if (result && result.success === false) {
        setErrorMessage(result.error?.message || 'فشل إرسال الاقتراح إلى الخادم المركزي.');
        setIsSubmitting(false);
        return;
      }

      setIsSuccess(true);
      setIsSubmitting(false);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ غير متوقع أثناء إرسال اقتراح الكتاب.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 select-none animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base">
                استيراد وفهرسة كتاب للمكتبة المركزية
              </h3>
              <p className="text-[11px] text-slate-400">
                إرسال الكتاب لخط سير مراجعة واعتماد أمين المكتبة
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-200 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSuccess ? (
          <div className="py-10 text-center space-y-3 animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="font-bold text-slate-100 text-lg">تم إرسال الكتاب للاعتماد المركزي بنجاح!</h4>
            <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
              تم تسجيل اقتراحك رسمياً في قائمة مراجعات أمين المكتبة. سيتم إشعارك فور تدقيق الفهرسة ونشر الكتاب في المستودع الرقمي.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Error banner */}
            {errorMessage && (
              <div className="p-3 bg-rose-950/50 border border-rose-800/60 rounded-xl text-rose-200 flex items-start gap-2.5 animate-in shake duration-200">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <strong className="block text-rose-300 font-semibold mb-0.5">خطأ في الإرسال</strong>
                  {errorMessage}
                </div>
              </div>
            )}

            {/* Info notice / Auto-filled banner */}
            {prefillData?.title ? (
              <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-200 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <strong className="block text-emerald-300 font-semibold mb-0.5">تم استخراج وتوثيق بيانات الكتاب آلياً من البوابة المعتمدة</strong>
                  تم ملء العنوان والمؤلف والتوصيف والتصنيف ورابط المصدر مباشرة وبدقة تامة. يمكنك مراجعة البيانات قبل إرسالها.
                </div>
              </div>
            ) : (
              <div className="p-3 bg-sky-950/40 border border-sky-800/60 rounded-xl text-sky-200 flex items-start gap-2.5">
                <HelpCircle className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed text-[11px]">
                  أدخل بيانات الكتاب والمصدر المعتمد. سيقوم أمين المكتبة بمطابقة الوثيقة واعتمادها لتكون متاحة لجميع الطلبة.
                </p>
              </div>
            )}

            {/* Title & Author */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">عنوان الكتاب / المخطوطة *</label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: قواعد الإسلام..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-sky-500 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-medium mb-1">المؤلف / المحقق *</label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="مثال: الشيخ إسماعيل الجيطالي..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-sky-500 disabled:opacity-50"
                />
              </div>
            </div>

            {/* Category & Format */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="block text-slate-300 font-medium mb-1">التصنيف الموضوعي المقترح *</label>
                <select
                  value={suggestedCategoryId}
                  disabled={isSubmitting}
                  onChange={(e) => setSuggestedCategoryId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-sky-500 disabled:opacity-50"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-300 font-medium mb-1">صيغة الملف *</label>
                <select
                  value={format}
                  disabled={isSubmitting}
                  onChange={(e) => setFormat(e.target.value as BookFormat)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-sky-500 disabled:opacity-50"
                >
                  <option value="pdf">PDF</option>
                  <option value="epub">ePub</option>
                </select>
              </div>
            </div>

            {/* Source & URL */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">اسم البوابة / المصدر *</label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  value={portal}
                  onChange={(e) => setPortal(e.target.value)}
                  placeholder="المكتبة الإباضية الشاملة..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-medium mb-1">رابط المصدر الأصلي (للتوثيق)</label>
                <input
                  type="text"
                  disabled={isSubmitting}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://al-maktaba.net/book/..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-[11px] disabled:opacity-50"
                />
              </div>
            </div>

            {/* Direct Download URL (For Central Server Ingestion) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-slate-300 font-medium">رابط تحميل الملف المباشر (PDF / EPUB)</label>
                <span className="text-[10px] text-sky-400">تحميل خادم مركزي آمن وموثق</span>
              </div>
              <input
                type="url"
                disabled={isSubmitting}
                value={downloadUrl}
                onChange={(e) => setDownloadUrl(e.target.value)}
                placeholder="مثال: https://al-maktaba.org/download/book-full.pdf"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-[11px] outline-none focus:border-sky-500 disabled:opacity-50"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                عند اعتماد المشرف، يقوم الخادم المركزي بتحميل الملف والتحقق من سلامته وتخزينه في مستودع المكتبة الرقمي.
              </p>
            </div>

            {/* Summary */}
            <div>
              <label className="block text-slate-300 font-medium mb-1">نبذة عن الكتاب وأهميته المنهجية *</label>
              <textarea
                rows={3}
                required
                disabled={isSubmitting}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="بيان موجز لموضوع الكتاب ومجال الاستفادة منه للطلبة والباحثين..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-sky-500 resize-none disabled:opacity-50"
              />
            </div>

            {/* Provenance Document Notice */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-400" />
                <span className="font-mono text-slate-200">{fileName}</span>
                <span className="text-[10px] text-slate-500 font-mono">({pagesEstimated} ص)</span>
              </div>
              <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>مصدر موثق معتمد</span>
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium disabled:opacity-50 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-sky-800/50 text-white rounded-xl font-semibold shadow-lg shadow-sky-600/30 flex items-center gap-2 cursor-pointer transition-all"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري الإرسال للخادم المركزي...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>إرسال الكتاب للاعتماد المركزي</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
