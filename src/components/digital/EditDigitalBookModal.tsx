import React, { useState } from 'react';
import { X, BookOpen, Trash2, FileText, Globe2, Tag, Check, AlertCircle } from 'lucide-react';
import { DigitalBook, Category } from '../../types/library';

export interface EditDigitalBookModalProps {
  book: DigitalBook;
  categories: Category[];
  isOpen?: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<DigitalBook>) => Promise<boolean | void> | void;
  onDelete?: (id: string) => Promise<boolean | void> | void;
}

export const EditDigitalBookModal: React.FC<EditDigitalBookModalProps> = ({
  book,
  categories,
  isOpen = true,
  onClose,
  onSave,
  onDelete,
}) => {
  if (isOpen !== undefined && !isOpen) return null;

  const [title, setTitle] = useState(book.title || '');
  const [author, setAuthor] = useState(book.author || '');
  const [categoryId, setCategoryId] = useState(book.categoryId || categories[0]?.id || 'cat-general');
  const [pagesCount, setPagesCount] = useState<number>(book.pagesCount || 0);
  const [sourceOrigin, setSourceOrigin] = useState(book.sourceOrigin || '');
  const [summary, setSummary] = useState(book.summary || '');
  const [tags, setTags] = useState((book.tags || []).join(', '));
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('يرجى إدخال عنوان الكتاب.');
      return;
    }

    setIsSaving(true);
    try {
      await onSave(book.id, {
        title: title.trim(),
        author: author.trim() || 'مؤلف غير محدد',
        categoryId,
        pagesCount: Number(pagesCount) || 0,
        sourceOrigin: sourceOrigin.trim() || undefined,
        summary: summary.trim(),
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      onClose();
    } catch (err: any) {
      alert(`حدث خطأ أثناء حفظ التعديلات: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(book.id);
      onClose();
    } catch (err: any) {
      alert(`حدث خطأ أثناء حذف الكتاب: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-gradient-to-r dark:from-slate-900 dark:via-emerald-950/30 dark:to-slate-900 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 font-amiri">
                <span>تعديل بيانات الكتاب الرقمي</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-mono border border-emerald-500/30 uppercase">
                  {book.format || 'PDF'}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-md">
                تحديث وتصحيح تفاصيل الكتاب والوصف وعدد الصفحات في المستودع المركزي
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer btn-press"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body / Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 text-xs">
          {/* Title & Author */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1.5">عنوان الكتاب *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="عنوان الكتاب..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1.5">المؤلف / المحقق</label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="اسم المؤلف أو المحقق..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 outline-none transition-all"
              />
            </div>
          </div>

          {/* Category & Real Page Count */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1.5">التصنيف الموضوعي *</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 outline-none transition-all cursor-pointer"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1.5 flex items-center justify-between">
                <span>عدد الصفحات الفعلي</span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-normal">مطابق لملف الـ PDF</span>
              </label>
              <div className="relative">
                <FileText className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  min={1}
                  value={pagesCount || ''}
                  onChange={(e) => setPagesCount(parseInt(e.target.value, 10) || 0)}
                  placeholder="مثال: 210"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-emerald-500 rounded-xl pr-9 pl-3.5 py-2.5 text-slate-900 dark:text-slate-100 font-mono outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Source Origin & Tags */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1.5">المصدر / جهة الإصدار</label>
              <div className="relative">
                <Globe2 className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={sourceOrigin}
                  onChange={(e) => setSourceOrigin(e.target.value)}
                  placeholder="مثال: وزارة التربية والتعليم، مجمع الملك سلمان..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-emerald-500 rounded-xl pr-9 pl-3.5 py-2.5 text-slate-900 dark:text-slate-100 outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1.5">الكلمات الدلالية والوسوم</label>
              <div className="relative">
                <Tag className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="تاريخ، فقه، تربية (مفصولة بفواصل)..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-emerald-500 rounded-xl pr-9 pl-3.5 py-2.5 text-slate-900 dark:text-slate-100 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Summary / Description */}
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1.5 flex items-center justify-between">
              <span>نبذة وموضوع الكتاب ومحتواه العلمي</span>
              <span className="text-[10px] text-slate-400 font-normal">صياغة واضحة ورصينة لموضوع الكتاب</span>
            </label>
            <textarea
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="وصف ملخص وشامل لموضوع الكتاب ومحتواه المنهجي..."
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-emerald-500 rounded-xl p-3.5 text-slate-900 dark:text-slate-100 leading-relaxed outline-none transition-all resize-none font-sans"
            />
          </div>

          {/* Delete Confirmation Banner (If requested) */}
          {showDeleteConfirm && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3 text-rose-700 dark:text-rose-300 animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span className="text-xs font-semibold">هل أنت متأكد من مسح هذا الكتاب الرقمي نهائياً من المستودع؟</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium cursor-pointer btn-press"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md cursor-pointer disabled:opacity-50 btn-press"
                >
                  {isDeleting ? 'جاري المسح...' : 'نعم، امسح الكتاب'}
                </button>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
            {onDelete ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 rounded-xl text-xs font-semibold transition-all cursor-pointer btn-press"
                title="مسح هذا الكتاب الرقمي نهائياً"
              >
                <Trash2 className="w-4 h-4" />
                <span>مسح الكتاب الرقمي</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-medium cursor-pointer transition-colors btn-press"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/30 cursor-pointer transition-all btn-press"
              >
                <Check className="w-4 h-4" />
                <span>{isSaving ? 'جاري الحفظ...' : 'حفظ التعديلات'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
