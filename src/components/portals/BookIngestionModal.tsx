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
  Link,
  FileDown,
} from 'lucide-react';
import { Category, User, BookFormat, WhitelistedPortal } from '../../types/library';

interface BookIngestionModalProps {
  currentUser?: User;
  categories: Category[];
  portals?: WhitelistedPortal[];
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
    isbn?: string;
    language?: string;
    coverImage?: string;
    notes?: string;
  };
  onClose: () => void;
  onSubmit: (submission: {
    title: string;
    author: string;
    suggestedCategoryId: string;
    format: BookFormat;
    sourceUrl: string;
    sourcePortalName: string;
    sourcePortalId?: string;
    sourceRecordId?: string;
    sourceRecordUrl?: string;
    sourceMethod?: string;
    sourceRetrievedAt?: string;
    verificationStatus?: string;
    downloadUrl?: string;
    isbn?: string;
    language?: string;
    coverImage?: string;
    notes?: string;
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
  portals = [],
  sourcePortalName,
  sourceUrl,
  portalName,
  initialUrl,
  prefillData,
  onClose,
  onSubmit,
}) => {
  const effectivePortalName = portalName || sourcePortalName || prefillData?.sourcePortalName || (portals[0]?.name || 'المكتبة الإباضية الشاملة');
  const effectiveUrl = prefillData?.sourceRecordUrl || prefillData?.sourceUrl || initialUrl || sourceUrl || '';

  // Required Fields
  const [title, setTitle] = useState(prefillData?.title || '');
  const [author, setAuthor] = useState(prefillData?.author || '');
  const [portal, setPortal] = useState(effectivePortalName);
  const [sourceBookPageUrl, setSourceBookPageUrl] = useState(effectiveUrl);

  // Optional Fields (Section 5 Requirement)
  const [downloadUrl, setDownloadUrl] = useState(prefillData?.downloadUrl || '');
  const [isbn, setIsbn] = useState(prefillData?.isbn || '');
  const [language, setLanguage] = useState(prefillData?.language || 'العربية');
  const [coverImage, setCoverImage] = useState(prefillData?.coverImage || '');
  const [description, setDescription] = useState(prefillData?.summary || '');
  const [notes, setNotes] = useState(prefillData?.notes || '');
  const [format, setFormat] = useState<BookFormat>(prefillData?.format || 'pdf');
  const [pagesEstimated, setPagesEstimated] = useState<number>(prefillData?.pages || 200);

  const [suggestedCategoryId, setSuggestedCategoryId] = useState(() => {
    if (prefillData?.categorySuggestion) {
      const matched = categories.find(
        (c) => c.id === prefillData.categorySuggestion || c.name.includes(prefillData.categorySuggestion!)
      );
      if (matched) return matched.id;
    }
    return categories[0]?.id || '';
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Section 5 Validation Rules:
    // REQUIRED: title, author if known, source portal, source book/page URL.
    if (!title.trim()) {
      setErrorMessage('عنوان الكتاب أو المخطوطة إلزامي.');
      return;
    }

    if (!portal.trim()) {
      setErrorMessage('يرجى تحديد اسم البوابة أو الموقع المعتمد.');
      return;
    }

    if (!sourceBookPageUrl.trim()) {
      setErrorMessage('رابط صفحة الكتاب في الموقع المعتمد (sourceBookPageUrl) إلزامي للتوثيق وإثبات المصدر.');
      return;
    }

    // INVALID: downloadUrl only without trustworthy source provenance
    if (downloadUrl.trim() && !sourceBookPageUrl.trim()) {
      setErrorMessage('لا يمكن قبول رابط تحميل مباشر دون توثيق رابط صفحة الكتاب الأصلية في البوابة المعتمدة.');
      return;
    }

    if (!currentUser?.id) {
      setErrorMessage('تعذر تحديد حساب المستخدم الحالي. يرجى إعادة تسجيل الدخول.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const selectedPortalObj = portals.find((p) => p.name === portal.trim() || p.id === portal.trim());

    try {
      const result: any = await onSubmit({
        title: title.trim(),
        author: author.trim() || 'مؤلف غير محدد',
        suggestedCategoryId,
        format,
        sourceUrl: sourceBookPageUrl.trim(),
        sourcePortalName: portal.trim(),
        sourcePortalId: selectedPortalObj?.id || prefillData?.sourcePortalId,
        sourceRecordId: prefillData?.sourceRecordId,
        sourceRecordUrl: sourceBookPageUrl.trim(),
        sourceMethod: prefillData?.sourceMethod || 'USER_ASSISTED_CAPTURE',
        sourceRetrievedAt: prefillData?.sourceRetrievedAt || new Date().toISOString(),
        verificationStatus: prefillData?.verificationStatus || 'USER_SUGGESTED',
        downloadUrl: downloadUrl.trim() || undefined,
        isbn: isbn.trim() || undefined,
        language: language.trim() || 'العربية',
        coverImage: coverImage.trim() || undefined,
        notes: notes.trim() || undefined,
        summary: description.trim() || `اقتراح كتاب موثق من بوابة ${portal.trim()}`,
        studentId: currentUser.id,
        studentName: currentUser.name || 'طالب',
        studentRegNumber: currentUser.registrationNumber || 'STU-UNKNOWN',
        pagesEstimated: Number(pagesEstimated) || 200,
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[150] select-none animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base">
                اقتراح كتاب أو مرجع للمكتبة المركزية
              </h3>
              <p className="text-[11px] text-slate-400">
                توثيق الكتاب من بوابة رقمية معتمدة وإرساله لخط سير تدقيق واعتماد الإدارة
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSuccess ? (
          <div className="py-10 text-center space-y-3 animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="font-bold text-slate-100 text-lg">تم إرسال اقتراح الكتاب للاعتماد بنجاح!</h4>
            <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
              تم توثيق رابط المصدر الأصلي وتسجيل الاقتراح في طابور مراجعات أمين المكتبة. ستتلقى إشعاراً فور مراجعة الكتاب واعتماده في المستودع المركزي.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Error Banner */}
            {errorMessage && (
              <div className="p-3 bg-rose-950/50 border border-rose-800/60 rounded-xl text-rose-200 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <strong className="block text-rose-300 font-semibold mb-0.5">خطأ في التحقق</strong>
                  {errorMessage}
                </div>
              </div>
            )}

            {/* Explanatory Notice */}
            <div className="p-3 bg-sky-950/40 border border-sky-800/60 rounded-xl text-sky-200 flex items-start gap-2.5">
              <HelpCircle className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                <strong className="block text-sky-300 font-semibold mb-0.5">ضوابط اقتراح الكتب المعتمدة (Phase 15.4-G)</strong>
                رابط صفحة الكتاب في الموقع هو الحقل الأهم لتوثيق المصدر الأصلي (إلزامي). رابط التحميل المباشر اختياري، فإذا كان غير متوفر سيتولى أمين المكتبة الاستحواذ اليدوي عليه.
              </div>
            </div>

            {/* SECTION: REQUIRED FIELDS */}
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 pb-1 border-b border-slate-800/80">
                <span>الحقول الإلزامية *</span>
              </div>

              {/* Title & Author */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    عنوان الكتاب / المخطوطة *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isSubmitting}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="مثال: تحفة الأعيان بسيرة أهل عمان"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-sky-500 disabled:opacity-50 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    المؤلف أو المحقق <span className="text-slate-400 font-normal">(إن كان معروفاً)</span>
                  </label>
                  <input
                    type="text"
                    disabled={isSubmitting}
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="مثال: الشيخ عبد الله بن حميد السالمي"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-sky-500 disabled:opacity-50 text-xs"
                  />
                </div>
              </div>

              {/* Source Portal & Source Book/Page URL */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    البوابة أو الموقع المعتمد المصدر *
                  </label>
                  {portals.length > 0 ? (
                    <select
                      value={portal}
                      disabled={isSubmitting}
                      onChange={(e) => setPortal(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-sky-500 disabled:opacity-50 text-xs"
                    >
                      {portals.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                      {!portals.some((p) => p.name === portal) && portal && (
                        <option value={portal}>{portal}</option>
                      )}
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      disabled={isSubmitting}
                      value={portal}
                      onChange={(e) => setPortal(e.target.value)}
                      placeholder="اسم البوابة..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-sky-500 disabled:opacity-50 text-xs"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    رابط صفحة الكتاب في الموقع * <span className="text-amber-400 font-mono text-[10px]">(sourceBookPageUrl)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="url"
                      required
                      disabled={isSubmitting}
                      value={sourceBookPageUrl}
                      onChange={(e) => setSourceBookPageUrl(e.target.value)}
                      placeholder="https://portal.example/book/123"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-[11px] outline-none focus:border-sky-500 disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION: OPTIONAL FIELDS (Section 5 Requirement) */}
            <div className="p-3.5 bg-slate-950/40 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-slate-800/80">
                <span className="text-xs font-semibold text-slate-400">حقول تكميلية (اختيارية)</span>
                <span className="text-[10px] text-slate-500 font-mono">تسهل التدقيق والاستيراد السريع</span>
              </div>

              {/* Direct Download URL (Optional) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-medium text-[11px] flex items-center gap-1.5">
                    <FileDown className="w-3.5 h-3.5 text-emerald-400" />
                    <span>رابط تحميل الملف المباشر (PDF / EPUB)</span>
                  </label>
                  <span className="text-[10px] text-emerald-400 font-mono">اختياري</span>
                </div>
                <input
                  type="url"
                  disabled={isSubmitting}
                  value={downloadUrl}
                  onChange={(e) => setDownloadUrl(e.target.value)}
                  placeholder="https://portal.example/files/book.pdf (اتركه فارغاً إن لم يكن مباشراً)"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-[11px] outline-none focus:border-sky-500 disabled:opacity-50"
                />
              </div>

              {/* Category, Format & Language */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">التصنيف المقترح</label>
                  <select
                    value={suggestedCategoryId}
                    disabled={isSubmitting}
                    onChange={(e) => setSuggestedCategoryId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-sky-500 disabled:opacity-50 text-xs"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">صيغة الملف</label>
                  <select
                    value={format}
                    disabled={isSubmitting}
                    onChange={(e) => setFormat(e.target.value as BookFormat)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-sky-500 disabled:opacity-50 text-xs"
                  >
                    <option value="pdf">PDF</option>
                    <option value="epub">ePub</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">لغة الكتاب</label>
                  <input
                    type="text"
                    disabled={isSubmitting}
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    placeholder="العربية"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-sky-500 disabled:opacity-50 text-xs"
                  />
                </div>
              </div>

              {/* ISBN & Cover Image */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">الرقم المعياري الدولي (ISBN)</label>
                  <input
                    type="text"
                    disabled={isSubmitting}
                    value={isbn}
                    onChange={(e) => setIsbn(e.target.value)}
                    placeholder="978-..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono outline-none focus:border-sky-500 disabled:opacity-50 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">رابط صورة الغلاف</label>
                  <input
                    type="url"
                    disabled={isSubmitting}
                    value={coverImage}
                    onChange={(e) => setCoverImage(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-[11px] outline-none focus:border-sky-500 disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Description & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">نبذة أو وصف الكتاب</label>
                  <textarea
                    rows={2}
                    disabled={isSubmitting}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="موضوع الكتاب ومحتواه العام..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-sky-500 resize-none disabled:opacity-50 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">ملاحظات إضافية لأمين المكتبة</label>
                  <textarea
                    rows={2}
                    disabled={isSubmitting}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="أي توضيحات تخص الباب أو الطبعة أو التحقيق..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-sky-500 resize-none disabled:opacity-50 text-xs"
                  />
                </div>
              </div>
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
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800/50 text-white rounded-xl font-semibold shadow-lg shadow-emerald-600/30 flex items-center gap-2 cursor-pointer transition-all"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري الإرسال للخادم المركزي...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>إرسال الاقتراح للاعتماد</span>
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
