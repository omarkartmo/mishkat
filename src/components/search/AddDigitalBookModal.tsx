import React, { useState } from 'react';
import {
  Library,
  BookOpen,
  Plus,
  X,
  FileText,
} from 'lucide-react';
import { Category, DigitalBook } from '../../types/library';

interface AddDigitalBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onAddBook: (book: Omit<DigitalBook, 'id' | 'addedAt' | 'downloadCount' | 'readCount'>) => void;
}

export const AddDigitalBookModal: React.FC<AddDigitalBookModalProps> = ({
  isOpen,
  onClose,
  categories,
  onAddBook,
}) => {
  if (!isOpen) return null;

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [format, setFormat] = useState<'pdf' | 'epub'>('pdf');
  const [pagesCount, setPagesCount] = useState<number>(120);
  const [fileSize] = useState('4.5 MB');
  const [sourceOrigin, setSourceOrigin] = useState('');
  const [summary, setSummary] = useState('');
  const [tags, setTags] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !author) return;

    onAddBook({
      title,
      author,
      categoryId,
      format,
      fileSize,
      fileSizeMb: parseFloat(fileSize) || 4.2,
      pages: Number(pagesCount),
      pagesCount: Number(pagesCount),
      sourceOrigin,
      summary,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
            <Library className="w-5 h-5 text-emerald-500" />
            إضافة مرجع إلكتروني جديد للمستودع الرقمي
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">عنوان الكتاب *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="عنوان الكتاب الرقمي..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">المؤلف / المحقق *</label>
              <input
                type="text"
                required
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="اسم المؤلف..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">القسم / التصنيف *</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 cursor-pointer"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">صيغة الملف *</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 font-mono cursor-pointer"
              >
                <option value="pdf">PDF Document</option>
                <option value="epub">ePub Book</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">عدد الصفحات التقديري</label>
              <input
                type="number"
                min="1"
                value={pagesCount}
                onChange={(e) => setPagesCount(Number(e.target.value))}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">المصدر المرجعي</label>
              <input
                type="text"
                value={sourceOrigin}
                onChange={(e) => setSourceOrigin(e.target.value)}
                placeholder="مثال: المكتبة الإباضية الشاملة أو الألوكة"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">الكلمات الدلالية والوسوم</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="فقه, مخطوطات, تاريخ (مفصولة بفاصلة)"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">نبذة وموجز المحتوى العلمي</label>
            <textarea
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="وصف مختصر لمحتوى هذا المرجع الرقمي..."
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-600/30 cursor-pointer"
            >
              حفظ ونشر في المستودع
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
