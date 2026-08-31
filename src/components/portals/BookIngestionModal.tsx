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
} from 'lucide-react';
import { Category, User, BookFormat } from '../../types/library';

interface BookIngestionModalProps {
  currentUser: User;
  categories: Category[];
  sourcePortalName: string;
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
    format?: BookFormat;
  };
  onClose: () => void;
  onSubmit: (submission: {
    title: string;
    author: string;
    suggestedCategoryId: string;
    format: BookFormat;
    sourceUrl?: string;
    sourcePortalName: string;
    summary: string;
    studentId: string;
    studentName: string;
    studentRegNumber: string;
    pagesEstimated?: number;
  }) => void;
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
  const [portal, setPortal] = useState(effectivePortalName);
  const [summary, setSummary] = useState(prefillData?.summary || '');
  const [pagesEstimated, setPagesEstimated] = useState<number>(prefillData?.pages || 250);
  const [fileName] = useState(() => {
    if (prefillData?.title) {
      return `${prefillData.title.replace(/\s+/g, '_').substring(0, 30)}.pdf`;
    }
    return 'book_document.pdf';
  });
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !author.trim() || !summary.trim()) {
      alert('يرجى ملء جميع الحقول الإلزامية (العنوان، المؤلف، ونبذة الكتاب).');
      return;
    }

    onSubmit({
      title: title.trim(),
      author: author.trim(),
      suggestedCategoryId,
      format,
      sourceUrl: url.trim(),
      sourcePortalName: portal.trim(),
      summary: summary.trim(),
      studentId: currentUser.id,
      studentName: currentUser.name,
      studentRegNumber: currentUser.registrationNumber,
      pagesEstimated: Number(pagesEstimated),
    });

    setIsSuccess(true);
    setTimeout(() => {
      onClose();
    }, 1800);
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
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSuccess ? (
          <div className="py-10 text-center space-y-3">
            <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="font-bold text-slate-100 text-lg">تم إرسال الكتاب للمراجعة بنجاح!</h4>
            <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
              سيقوم أمين المكتبة بفحص الفهرسة واعتماد الكتاب ليصبح متاحاً في المستودع الرقمي لجميع الحواسيب المدرسية.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Info notice / Auto-filled banner */}
            {prefillData?.title ? (
              <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-200 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <strong className="block text-emerald-300 font-semibold mb-0.5">تم ملء بيانات الكتاب وتوثيقه تلقائياً من البوابة بنجاح</strong>
                  تم استخراج وتعبئة العنوان والمؤلف والتوصيف والتصنيف وعدد الصفحات ورابط المصدر آلياً. يرجى مراجعة وتعديل أي معلومة عند الحاجة ثم الضغط على زر الإرسال للاعتماد المركزي.
                </div>
              </div>
            ) : (
              <div className="p-3 bg-sky-950/40 border border-sky-800/60 rounded-xl text-sky-200 flex items-start gap-2.5">
                <HelpCircle className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed text-[11px]">
                  أدخل أو راجع المعلومات الدقيقة للكتاب الذي وجدته في البوابة. سيتم حفظ بياناتك كطالب مساهم ومراجعة الكتاب واعتماده قبل نشره في المستودع المركزي.
                </p>
              </div>
            )}

            {/* Title & Author */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">عنوان الكتاب المكتشف *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: شرح كتاب النيل..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-medium mb-1">المؤلف / المحقق *</label>
                <input
                  type="text"
                  required
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="اسم المؤلف أو المحقق..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* Category & Format & Pages */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">التصنيف المقترح *</label>
                <select
                  value={suggestedCategoryId}
                  onChange={(e) => setSuggestedCategoryId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-sky-500"
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
                  onChange={(e) => setFormat(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-sky-500 font-mono"
                >
                  <option value="pdf">PDF Document</option>
                  <option value="epub">ePub Book</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">عدد الصفحات التقديري</label>
                <input
                  type="number"
                  min="1"
                  value={pagesEstimated}
                  onChange={(e) => setPagesEstimated(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                />
              </div>
            </div>

            {/* Portal Source & URL */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">المكتبة أو المصدر *</label>
                <input
                  type="text"
                  required
                  value={portal}
                  onChange={(e) => setPortal(e.target.value)}
                  placeholder="المكتبة الإباضية الشاملة..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-medium mb-1">رابط المصدر (اختياري)</label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://al-maktaba.org/book/..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-[11px]"
                />
              </div>
            </div>

            {/* Summary */}
            <div>
              <label className="block text-slate-300 font-medium mb-1">نبذة عن الكتاب وأهميته المنهجية *</label>
              <textarea
                rows={3}
                required
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="بيان موجز لموضوع الكتاب ومجال الاستفادة منه للطلبة والباحثين..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-sky-500 resize-none"
              />
            </div>

            {/* Simulated File Attachment */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-400" />
                <span className="font-mono text-slate-200">{fileName}</span>
                <span className="text-[10px] text-slate-500 font-mono">(9.4 MB)</span>
              </div>
              <span className="text-[11px] text-emerald-400 font-medium">جاهز للإرسال للخادم المركزي</span>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-semibold shadow-lg shadow-sky-600/30 flex items-center gap-1.5"
              >
                <Upload className="w-4 h-4" />
                <span>إرسال الكتاب للاعتماد المركزي</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
