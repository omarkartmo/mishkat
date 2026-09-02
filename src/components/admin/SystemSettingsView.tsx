import React, { useState } from 'react';
import {
  Settings,
  Clock,
  Shield,
  Server,
  Download,
  RotateCcw,
  Save,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  Globe,
  School,
  ListPlus,
  Plus,
  Trash2,
} from 'lucide-react';
import { SystemConfig } from '../../types/library';
import { settingsRepository } from '../../services/settingsRepository';

interface SystemSettingsViewProps {
  config: SystemConfig;
  onSaveConfig: (updated: SystemConfig) => void;
  onExportData: () => void;
  onResetData: () => void;
}

export const SystemSettingsView: React.FC<SystemSettingsViewProps> = ({
  config,
  onSaveConfig,
  onExportData,
  onResetData,
}) => {
  const [form, setForm] = useState<SystemConfig>({
    ...config,
    predefinedLoanReasons: config.predefinedLoanReasons || [
      'بحث أكاديمي وتكليف دراسي',
      'مطالعة ذاتية وثقافة عامة',
      'إعداد ورقة عمل / مشروع تخرج',
      'تحضير للاختبارات والأنشطة الصفية',
      'مراجعة واستخراج مراجع وشواهد',
    ],
  });
  const [newReasonInput, setNewReasonInput] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Backup & Restore State
  const [backups, setBackups] = useState<Array<{ fileName: string; type: 'manual' | 'pre_restore'; sizeFormatted: string; createdAt: string }>>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [restoringFile, setRestoringFile] = useState<string | null>(null);
  const [showBackupsList, setShowBackupsList] = useState(false);

  const fetchBackups = async () => {
    setLoadingBackups(true);
    try {
      const res = await settingsRepository.listBackups();
      if (res.success && res.data) {
        setBackups(res.data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingBackups(false);
    }
  };

  const handleRestore = async (fileName: string) => {
    const confirmed = window.confirm(
      `⚠️ تحذير شديد الأهمية:\n\nاسترجاع النسخة (${fileName}) سيستبدل بيانات قاعدة البيانات الحالية بالكامل.\nسيقوم الخادم تلقائياً بإنشاء نسخة أمان احتياطية قبل الاستبدال.\n\nهل أنت متأكد تماماً من رغبتك في الاستمرار؟`
    );
    if (!confirmed) return;

    setRestoringFile(fileName);
    try {
      const res = await settingsRepository.restoreBackup(fileName);
      if (res.success && res.data) {
        alert(`✨ ${res.data.message}\nتم حفظ نسخة أمان في: ${res.data.preRestoreBackup}`);
        await onResetData();
        fetchBackups();
      } else {
        alert(`❌ فشل استرجاع النسخة: ${res.error?.message || 'خطأ غير معروف'}`);
      }
    } catch (err: any) {
      alert(`❌ خطأ: ${err.message}`);
    } finally {
      setRestoringFile(null);
    }
  };

  const handleAddReason = () => {
    if (!newReasonInput.trim()) return;
    const current = form.predefinedLoanReasons || [];
    if (current.includes(newReasonInput.trim())) return;
    setForm({
      ...form,
      predefinedLoanReasons: [...current, newReasonInput.trim()],
    });
    setNewReasonInput('');
  };

  const handleRemoveReason = (indexToRemove: number) => {
    const current = form.predefinedLoanReasons || [];
    setForm({
      ...form,
      predefinedLoanReasons: current.filter((_, idx) => idx !== indexToRemove),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig(form);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-400" />
            إعدادات النظام وسياسات الإعارة المركزية
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            تخصيص فترات الاستعارة، مدد التمديد، قواعد الحظر التلقائي، وإدارة النسخ الاحتياطي
          </p>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold animate-in fade-in">
            <CheckCircle2 className="w-4 h-4" />
            <span>تم حفظ الإعدادات بنجاح</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Circulation Policies Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-5">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-3">
            <Clock className="w-4 h-4 text-sky-400" />
            سياسات ومدد إعارة الكتب الورقية
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
            {/* General Reading */}
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                المدة الافتراضية للمطالعة العامة (أيام) *
              </label>
              <input
                type="number"
                min="1"
                max="60"
                required
                value={form.generalReadingDurationDays}
                onChange={(e) =>
                  setForm({ ...form, generalReadingDurationDays: Number(e.target.value) })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-indigo-500 font-mono"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                تطبق تلقائياً عند اختيار غرض الإعارة "مطالعة عامة"
              </span>
            </div>

            {/* Academic Research */}
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                المدة الافتراضية للبحوث الأكاديمية (أيام) *
              </label>
              <input
                type="number"
                min="1"
                max="90"
                required
                value={form.academicResearchDurationDays}
                onChange={(e) =>
                  setForm({ ...form, academicResearchDurationDays: Number(e.target.value) })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-indigo-500 font-mono"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                تمنح مدة أطول للمشاريع البحثية المدرسية
              </span>
            </div>

            {/* Max Extensions */}
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                الحد الأقصى لمرات التمديد لكل إعارة *
              </label>
              <input
                type="number"
                min="0"
                max="5"
                required
                value={form.maxExtensionsAllowed}
                onChange={(e) =>
                  setForm({ ...form, maxExtensionsAllowed: Number(e.target.value) })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            {/* Extension Duration */}
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                مدة التمديد لكل طلب (أيام) *
              </label>
              <input
                type="number"
                min="1"
                max="30"
                required
                value={form.extensionDurationDays}
                onChange={(e) =>
                  setForm({ ...form, extensionDurationDays: Number(e.target.value) })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          {/* Auto block checkbox */}
          <div className="pt-3 border-t border-slate-800">
            <label className="flex items-start gap-3 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={form.autoBlockOverdue}
                onChange={(e) => setForm({ ...form, autoBlockOverdue: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-0 mt-0.5"
              />
              <div>
                <span className="font-semibold text-slate-200">
                  تفعيل الحظر التلقائي للطلبة المتأخرين عن موعد الاستحقاق
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  يمنع الطالب تلقائياً من استعارة أي كتاب جديد حتى يتم تسجيل إرجاع الكتب السابقة، مع إمكانية تجاوزه بقرار استثنائي من أمين المكتبة.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Predefined Loan Reasons Management Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <ListPlus className="w-4 h-4 text-indigo-400" />
                أسباب الاستعارة المسبقة في قائمة اختيار الطالب
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                قائمة الأسباب الجاهزة التي تظهر للطالب في القائمة المنسدلة عند طلب استعارة كتاب ورقي
              </p>
            </div>
            <span className="text-[11px] font-mono text-indigo-300 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20">
              {form.predefinedLoanReasons?.length || 0} أسباب مجهزة
            </span>
          </div>

          {/* Add reason input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newReasonInput}
              onChange={(e) => setNewReasonInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddReason();
                }
              }}
              placeholder="اكتب سبباً جديداً للاستعارة (مثال: مراجعة قبل الأولمبياد المدرسي)..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={handleAddReason}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة للقائمة</span>
            </button>
          </div>

          {/* List of current reasons */}
          <div className="space-y-2 pt-1">
            {(form.predefinedLoanReasons || []).map((reason, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800/80 rounded-xl text-slate-200"
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 font-mono text-[10px] flex items-center justify-center font-bold">
                    {idx + 1}
                  </span>
                  <span className="font-medium text-xs">{reason}</span>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveReason(idx)}
                  className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                  title="حذف هذا السبب من القائمة"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Institution & Network Hub Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-3">
            <Server className="w-4 h-4 text-emerald-400" />
            بيانات المؤسسة وشبكة الخادم المحلي (Localhost / LAN)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-1">اسم المؤسسة التعليمية</label>
              <input
                type="text"
                value={form.schoolName}
                onChange={(e) => setForm({ ...form, schoolName: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">اسم المكتبة المركزية</label>
              <input
                type="text"
                value={form.libraryName}
                onChange={(e) => setForm({ ...form, libraryName: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
              />
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1 font-mono text-[11px] text-slate-400">
            <div className="flex justify-between">
              <span>وضع الخادم:</span>
              <span className="text-emerald-400 font-bold">Localhost Central Server (Node/React Desktop)</span>
            </div>
            <div className="flex justify-between">
              <span>منفذ الخدمة الشبكي:</span>
              <span className="text-slate-200">Port 3000 (0.0.0.0)</span>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>حفظ إعدادات النظام</span>
          </button>
        </div>
      </form>

      {/* Database Maintenance & Backup Section */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-3">
          <HardDrive className="w-4 h-4 text-amber-400" />
          النسخ الاحتياطي وصيانة قاعدة البيانات المحلية
        </h3>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-slate-400">
            تصدير نسخة احتياطية كاملة من سجلات الكتب، الإعارات، التصنيفات، والمستخدمين كملف JSON آمن.
          </div>
          <button
            onClick={onExportData}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-semibold transition-all shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>تصدير نسخة احتياطية (JSON)</span>
          </button>
        </div>

        <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-slate-400">
            إعادة تعيين البيانات واستعادة البيانات النموذجية الأولية للمكتبة.
          </div>
          <button
            onClick={() => {
              if (
                window.confirm(
                  'هل أنت متأكد من رغبتك في إعادة تعيين البيانات واسترجاع النسخة النموذجية الأصلية؟'
                )
              ) {
                onResetData();
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white rounded-xl font-semibold transition-all shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>استعادة البيانات النموذجية</span>
          </button>
        </div>

        {/* Restore from Server Backup Section */}
        <div className="pt-3 border-t border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-slate-400">
              استرجاع قاعدة البيانات من نسخة احتياطية محفوظة على الخادم (مع إنشاء نسخة أمان تلقائية).
            </div>
            <button
              type="button"
              onClick={() => {
                const nextState = !showBackupsList;
                setShowBackupsList(nextState);
                if (nextState) fetchBackups();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/30 rounded-xl font-semibold transition-all shrink-0 cursor-pointer"
            >
              <HardDrive className="w-4 h-4" />
              <span>{showBackupsList ? 'إخفاء قائمة النسخ' : 'إدارة واسترجاع النسخ'}</span>
            </button>
          </div>

          {showBackupsList && (
            <div className="mt-4 bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-slate-300 font-bold text-xs pb-2 border-b border-slate-800">
                <span>ملفات النسخ الاحتياطية المتوفرة على الخادم المركزي</span>
                <button
                  type="button"
                  onClick={fetchBackups}
                  disabled={loadingBackups}
                  className="text-indigo-400 hover:text-indigo-300 text-xs flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className={`w-3 h-3 ${loadingBackups ? 'animate-spin' : ''}`} />
                  تحديث
                </button>
              </div>

              {loadingBackups ? (
                <div className="text-center py-4 text-slate-500">جاري تحميل قائمة النسخ...</div>
              ) : backups.length === 0 ? (
                <div className="text-center py-4 text-slate-500">لا توجد نسخ احتياطية محفوظة حالياً في الخادم.</div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {backups.map((b) => (
                    <div
                      key={b.fileName}
                      className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 hover:border-slate-700 transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-200 text-xs">{b.fileName}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            b.type === 'pre_restore' ? 'bg-indigo-950 text-indigo-300 border border-indigo-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          }`}>
                            {b.type === 'pre_restore' ? 'نسخة أمان تلقائية' : 'نسخة يدوية'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          الحجم: {b.sizeFormatted} • التاريخ: {new Date(b.createdAt).toLocaleString('ar-SA')}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRestore(b.fileName)}
                        disabled={restoringFile === b.fileName}
                        className="px-3 py-1.5 bg-rose-900/30 hover:bg-rose-700 text-rose-300 hover:text-white border border-rose-800/60 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {restoringFile === b.fileName ? 'جاري الاسترجاع...' : 'استرجاع هذه النسخة'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
