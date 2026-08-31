import React, { useState } from 'react';
import {
  FolderTree,
  Plus,
  Edit2,
  Trash2,
  BookOpen,
  Library,
  AlertTriangle,
  ArrowRight,
  Check,
  X,
  Layers,
  ShieldAlert,
} from 'lucide-react';
import { Category, PhysicalBook, DigitalBook } from '../../types/library';

interface CategoryManagerViewProps {
  categories: Category[];
  physicalBooks: PhysicalBook[];
  digitalBooks: DigitalBook[];
  onAddCategory: (category: Omit<Category, 'id'>) => void;
  onUpdateCategory: (id: string, updates: Partial<Category>) => void;
  onDeleteCategoryWithReassign: (categoryId: string, targetCategoryId: string) => {
    reassignedPhysicalCount: number;
    reassignedDigitalCount: number;
  };
}

export const CategoryManagerView: React.FC<CategoryManagerViewProps> = ({
  categories = [],
  physicalBooks = [],
  digitalBooks = [],
  onAddCategory,
  onUpdateCategory,
  onDeleteCategoryWithReassign,
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [targetCategoryId, setTargetCategoryId] = useState<string>('');

  // Counts per category
  const getPhysicalCount = (catId: string) => (physicalBooks || []).filter((b) => b.categoryId === catId).length;
  const getDigitalCount = (catId: string) => (digitalBooks || []).filter((b) => b.categoryId === catId).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-indigo-400" />
            إدارة التصنيفات وإعادة الفهرسة الجماعية
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            تنظيم هيكل الأقسام العلمية، وتطبيق سياسة الأمان الإلزامية لإعادة تصنيف الكتب عند حذف أي قسم
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة قسم / تصنيف جديد</span>
        </button>
      </div>

      {/* Safety Policy Notice */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-start gap-3">
        <div className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl shrink-0 mt-0.5">
          <ShieldAlert className="w-4 h-4" />
        </div>
        <div className="text-xs text-slate-300 space-y-1">
          <div className="font-bold text-slate-100">سياسة سلامة البيانات وإعادة التوزيع التلقائي:</div>
          <p className="text-slate-400 leading-relaxed">
            عند حذف أي تصنيف يحتوي على كتب ورقية أو إلكترونية، يفرض النظام اختيار تصنيف بديل لنقل جميع الكتب المرتبطة إليه فوراً، منعاً لفقدان السجلات أو وجود كتب يتيمة بدون تصنيف.
          </p>
        </div>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {categories.map((cat) => {
          const physCount = getPhysicalCount(cat.id);
          const digCount = getDigitalCount(cat.id);
          const totalBooks = physCount + digCount;

          return (
            <div
              key={cat.id}
              className="bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 flex flex-col justify-between space-y-4 transition-all shadow-sm group"
            >
              <div className="space-y-3">
                {/* Color Dot & Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3.5 h-3.5 rounded-full shadow-md"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="text-[11px] font-mono text-slate-400">رمز: {cat.id}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingCategory(cat)}
                      className="p-1 text-slate-400 hover:text-indigo-400 rounded-lg hover:bg-slate-800 transition-colors"
                      title="تعديل بيانات القسم"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {categories.length > 1 && (
                      <button
                        onClick={() => {
                          setDeletingCategory(cat);
                          const remainingCats = categories.filter((c) => c.id !== cat.id);
                          setTargetCategoryId(remainingCats[0]?.id || '');
                        }}
                        className="p-1 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                        title="حذف التصنيف مع نقل الكتب"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Name & Description */}
                <div>
                  <h3 className="font-bold text-slate-100 text-base group-hover:text-indigo-300 transition-colors">
                    {cat.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{cat.description}</p>
                </div>
              </div>

              {/* Book Counts Stats */}
              <div className="pt-3 border-t border-slate-800 grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-slate-400 text-[11px]">
                    <BookOpen className="w-3.5 h-3.5 text-sky-400" />
                    ورقي:
                  </span>
                  <span className="font-mono font-bold text-slate-200">{physCount}</span>
                </div>

                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-slate-400 text-[11px]">
                    <Library className="w-3.5 h-3.5 text-emerald-400" />
                    رقمي:
                  </span>
                  <span className="font-mono font-bold text-slate-200">{digCount}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Modal */}
      {isAddModalOpen && (
        <AddCategoryModal
          onClose={() => setIsAddModalOpen(false)}
          onSave={(data) => {
            onAddCategory(data);
            setIsAddModalOpen(false);
          }}
        />
      )}

      {/* Edit Modal */}
      {editingCategory && (
        <EditCategoryModal
          category={editingCategory}
          onClose={() => setEditingCategory(null)}
          onSave={(updates) => {
            onUpdateCategory(editingCategory.id, updates);
            setEditingCategory(null);
          }}
        />
      )}

      {/* Safe Delete with Mandatory Reclassification Modal */}
      {deletingCategory && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                حذف التصنيف وإعادة التوجيه الإجباري
              </h3>
              <button onClick={() => setDeletingCategory(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-2">
              <p>
                أنت على وشك حذف تصنيف <strong className="text-rose-400">"{deletingCategory.name}"</strong>.
              </p>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <div>
                  عدد الكتب الورقية المرتبطة:{' '}
                  <strong className="text-slate-100 font-mono">
                    {getPhysicalCount(deletingCategory.id)}
                  </strong>
                </div>
                <div>
                  عدد الكتب الرقمية المرتبطة:{' '}
                  <strong className="text-slate-100 font-mono">
                    {getDigitalCount(deletingCategory.id)}
                  </strong>
                </div>
              </div>
            </div>

            <div className="space-y-1 text-xs">
              <label className="block text-slate-300 font-medium">
                اختر التصنيف البديل لنقل جميع هذه الكتب إليه فوراً: *
              </label>
              <select
                value={targetCategoryId}
                onChange={(e) => setTargetCategoryId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-100 font-medium outline-none focus:border-indigo-500"
              >
                {categories
                  .filter((c) => c.id !== deletingCategory.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({getPhysicalCount(c.id) + getDigitalCount(c.id)} كتب حالياً)
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setDeletingCategory(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs"
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  if (!targetCategoryId) {
                    alert('يرجى اختيار التصنيف البديل');
                    return;
                  }
                  const res = onDeleteCategoryWithReassign(deletingCategory.id, targetCategoryId);
                  alert(
                    `تم حذف التصنيف بنجاح ونقل ${res.reassignedPhysicalCount} كتاب ورقي و ${res.reassignedDigitalCount} كتاب رقمي إلى التصنيف الجديد.`
                  );
                  setDeletingCategory(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-rose-600/30"
              >
                تأكيد النقل والحذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Add Category Modal
interface AddCategoryModalProps {
  onClose: () => void;
  onSave: (data: any) => void;
}

const AddCategoryModal: React.FC<AddCategoryModalProps> = ({ onClose, onSave }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#6366f1');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    onSave({
      name,
      description,
      color,
      icon: 'FolderTree',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
        <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
          <Plus className="w-5 h-5 text-indigo-400" />
          إضافة تصنيف علمي جديد
        </h3>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">اسم القسم / التصنيف *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: العلوم والتكنولوجيا المعاصرة"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">وصف مختصر للقسم</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="بيان نطاق وتخصص المراجع التابعة لهذا القسم..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">اللون المميز للقسم</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-10 h-8 rounded-lg bg-transparent border-0 cursor-pointer"
              />
              <span className="font-mono text-slate-300">{color}</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-medium"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/30"
            >
              إضافة التصنيف
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Edit Category Modal
interface EditCategoryModalProps {
  category: Category;
  onClose: () => void;
  onSave: (updates: Partial<Category>) => void;
}

const EditCategoryModal: React.FC<EditCategoryModalProps> = ({ category, onClose, onSave }) => {
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description);
  const [color, setColor] = useState(category.color);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    onSave({
      name,
      description,
      color,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
        <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
          <Edit2 className="w-5 h-5 text-indigo-400" />
          تعديل بيانات التصنيف
        </h3>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">اسم القسم / التصنيف *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">وصف القسم</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">اللون المميز للقسم</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-10 h-8 rounded-lg bg-transparent border-0 cursor-pointer"
              />
              <span className="font-mono text-slate-300">{color}</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-medium"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/30"
            >
              حفظ التعديلات
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
