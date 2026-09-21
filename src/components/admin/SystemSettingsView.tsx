import React, { useState, useEffect } from 'react';
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
  Lock,
  FileText,
  Info,
  Cloud,
  CloudOff,
  UploadCloud,
  RefreshCw,
  ExternalLink,
  Check,
  AlertCircle,
  Database,
  Key,
} from 'lucide-react';
import { SystemConfig } from '../../types/library';
import { settingsRepository } from '../../services/settingsRepository';
import { AdminSecuritySettings } from './AdminSecuritySettings';

interface SystemSettingsViewProps {
  config: SystemConfig;
  onSaveConfig: (updated: SystemConfig) => void;
  onExportData: () => void;
  onResetData: () => void;
  onCreateBackup?: () => void;
  onExportInstitutionalData?: () => void;
  onRefreshData?: () => Promise<void> | void;
}

export const SystemSettingsView: React.FC<SystemSettingsViewProps> = ({
  config,
  onSaveConfig,
  onExportData,
  onResetData,
  onCreateBackup,
  onExportInstitutionalData,
  onRefreshData,
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
  const [backups, setBackups] = useState<Array<{ fileName: string; type: 'manual' | 'pre_restore'; isEncrypted?: boolean; sizeFormatted: string; createdAt: string }>>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [restoringFile, setRestoringFile] = useState<string | null>(null);
  const [showBackupsList, setShowBackupsList] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [exportingData, setExportingData] = useState(false);

  // Google Drive & Automatic Backup Status State
  const [backupStatus, setBackupStatus] = useState<{
    local: {
      status: 'successful' | 'failed' | 'idle';
      lastBackupTime: string | null;
      lastBackupFile: string | null;
      error: string | null;
      count: number;
      maxRetention: number;
    };
    cloud: {
      status: 'successful' | 'waiting' | 'failed' | 'not_connected';
      connected: boolean;
      lastUploadTime: string | null;
      error: string | null;
      count: number | null;
      maxRetention: number;
      pendingFile: string | null;
    };
  } | null>(null);

  const [driveBackups, setDriveBackups] = useState<Array<{ id: string; name: string; sizeFormatted: string; createdAt: string }>>([]);
  const [loadingDriveBackups, setLoadingDriveBackups] = useState(false);
  const [activeBackupTab, setActiveBackupTab] = useState<'local' | 'cloud'>('local');
  const [showDriveConnectModal, setShowDriveConnectModal] = useState(false);
  const [driveClientId, setDriveClientId] = useState('');
  const [driveClientSecret, setDriveClientSecret] = useState('');
  const [driveConfigured, setDriveConfigured] = useState(false);
  const [driveAuthUrl, setDriveAuthUrl] = useState<string | null>(null);
  const [savingDriveConfig, setSavingDriveConfig] = useState(false);
  const [authCodeInput, setAuthCodeInput] = useState('');
  const [connectingDrive, setConnectingDrive] = useState(false);
  const [retryingUpload, setRetryingUpload] = useState(false);

  const fetchBackupStatus = async () => {
    try {
      const res = await settingsRepository.getBackupStatus();
      if (res.success && res.data) {
        setBackupStatus(res.data);
      }
    } catch {
      // ignore
    }
  };

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

  const fetchDriveBackups = async () => {
    setLoadingDriveBackups(true);
    try {
      const res = await settingsRepository.listDriveBackups();
      if (res.success && res.data) {
        setDriveBackups(res.data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingDriveBackups(false);
    }
  };

  useEffect(() => {
    fetchBackupStatus();

    // Listen for automatic OAuth completion from the popup callback
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'MISHKAT_DRIVE_CONNECTED') {
        alert('✨ تم ربط حساب Google Drive بنجاح ومزامنة مجلد MISHKAT Backups.');
        setShowDriveConnectModal(false);
        setAuthCodeInput('');
        fetchBackupStatus();
        fetchDriveBackups();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleCreateUnifiedBackup = async () => {
    if (onCreateBackup) {
      onCreateBackup();
      return;
    }
    setCreatingBackup(true);
    try {
      const res = await settingsRepository.createBackup();
      if (res.success && res.data) {
        alert(`✨ ${res.data.message}\nاسم الملف: ${res.data.fileName}\nعدد الجداول: ${res.data.tablesCount}`);
        fetchBackups();
        fetchBackupStatus();
        if (backupStatus?.cloud.connected) {
          fetchDriveBackups();
        }
      } else {
        alert(`❌ فشل إنشاء النسخة: ${res.error?.message || 'خطأ غير معروف'}`);
      }
    } catch (err: any) {
      alert(`❌ خطأ: ${err.message}`);
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleConnectDrive = async () => {
    setShowDriveConnectModal(true);
    setAuthCodeInput('');
    try {
      const urlRes = await settingsRepository.getGoogleDriveAuthUrl();
      if (urlRes.success && urlRes.data?.url) {
        setDriveAuthUrl(urlRes.data.url);
      }
    } catch {
      // ignore
    }
  };

  const handleLaunchGoogleSignIn = async () => {
    setConnectingDrive(true);
    try {
      let url = driveAuthUrl;
      if (!url) {
        const urlRes = await settingsRepository.getGoogleDriveAuthUrl();
        if (urlRes.success && urlRes.data?.url) {
          url = urlRes.data.url;
          setDriveAuthUrl(url);
        }
      }
      if (url) {
        window.open(url, '_blank', 'width=600,height=700');
      } else {
        alert('❌ تعذر توليد رابط تسجيل الدخول من Google.');
      }
    } catch (err: any) {
      alert(`❌ خطأ: ${err.message}`);
    } finally {
      setConnectingDrive(false);
    }
  };

  const handleConfirmDriveCode = async () => {
    if (!authCodeInput.trim()) return;
    setConnectingDrive(true);
    try {
      const res = await settingsRepository.connectGoogleDrive(authCodeInput.trim());
      if (res.success) {
        alert('✨ تم ربط حساب Google Drive بنجاح وتأكيد مجلد MISHKAT Backups.');
        setShowDriveConnectModal(false);
        setAuthCodeInput('');
        fetchBackupStatus();
        fetchDriveBackups();
      } else {
        alert(`❌ فشل ربط Google Drive: ${res.error?.message || 'رمز غير صالح'}`);
      }
    } catch (err: any) {
      alert(`❌ خطأ: ${err.message}`);
    } finally {
      setConnectingDrive(false);
    }
  };

  const handleDisconnectDrive = async () => {
    if (!window.confirm('هل أنت متأكد من رغبتك في إلغاء ربط Google Drive؟')) return;
    try {
      const res = await settingsRepository.disconnectGoogleDrive();
      if (res.success) {
        alert('✨ تم إلغاء ربط Google Drive.');
        fetchBackupStatus();
        setDriveBackups([]);
      }
    } catch (err: any) {
      alert(`❌ خطأ: ${err.message}`);
    }
  };

  const handleRetryUpload = async () => {
    setRetryingUpload(true);
    try {
      const res = await settingsRepository.retryDriveUpload();
      if (res.success && res.data?.uploaded) {
        alert('✨ تم رفع النسخة المعلقة بنجاح إلى Google Drive.');
        fetchBackupStatus();
        fetchDriveBackups();
      } else {
        alert(`ℹ️ ${res.data?.message || 'لم يكتمل الرفع بعد.'}`);
      }
    } catch (err: any) {
      alert(`❌ خطأ: ${err.message}`);
    } finally {
      setRetryingUpload(false);
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
        if (onRefreshData) {
          await onRefreshData();
        }
        fetchBackups();
        fetchBackupStatus();
      } else {
        alert(`❌ فشل استرجاع النسخة: ${res.error?.message || 'خطأ غير معروف'}`);
      }
    } catch (err: any) {
      alert(`❌ خطأ: ${err.message}`);
    } finally {
      setRestoringFile(null);
    }
  };

  const handleRestoreDrive = async (fileId: string, name: string) => {
    const confirmed = window.confirm(
      `⚠️ تحذير شديد الأهمية:\n\nاسترجاع النسخة السحابية (${name}) من Google Drive سيستبدل بيانات قاعدة البيانات الحالية بالكامل.\nسيقوم النظام تلقائياً بإنشاء نسخة أمان احتياطية قبل الاستبدال.\n\nهل أنت متأكد تماماً من رغبتك في الاستمرار؟`
    );
    if (!confirmed) return;

    setRestoringFile(fileId);
    try {
      const res = await settingsRepository.restoreDriveBackup(fileId);
      if (res.success && res.data) {
        alert(`✨ ${res.data.message}\nتم حفظ نسخة أمان في: ${res.data.preRestoreBackup}`);
        if (onRefreshData) {
          await onRefreshData();
        }
        fetchBackups();
        fetchBackupStatus();
      } else {
        alert(`❌ فشل استرجاع النسخة السحابية: ${res.error?.message || 'خطأ غير معروف'}`);
      }
    } catch (err: any) {
      alert(`❌ خطأ: ${err.message}`);
    } finally {
      setRestoringFile(null);
    }
  };

  const handleExportInstitutionalDataAction = async () => {
    if (onExportInstitutionalData) {
      onExportInstitutionalData();
      return;
    }
    setExportingData(true);
    try {
      const res = await settingsRepository.exportInstitutionalData();
      if (res.success && res.data) {
        const dataStr = JSON.stringify(res.data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `mishkat_institutional_export_${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        alert('✨ تم تصدير وتنزيل بيانات المؤسسة بنجاح بصيغة JSON مفتوحة خالية من كلمات المرور.');
      } else {
        alert(`❌ فشل تصدير البيانات: ${res.error?.message || 'خطأ غير معروف'}`);
      }
    } catch (err: any) {
      alert(`❌ خطأ: ${err.message}`);
    } finally {
      setExportingData(false);
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

        {/* Digital Book Storage & Root URL Configuration Card (Section 19 Requirement) */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-sky-400" />
                مسار وجذر ملفات الكتب الرقمية (Digital Books Root Path / Base URL)
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                المسار المعتمد على الخادم لتخزين ملفات الكتب الرقمية (PDF / ePub)، وفحص المجلدات، والاستيراد الجماعي التلقائي
              </p>
            </div>
            <span className="text-[10px] font-mono text-sky-300 bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-500/20">
              إعداد مستمر وموثوق
            </span>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              المسار أو الرابط الأساسي للملفات الرقمية (Root URL / Local Folder Path) *
            </label>
            <input
              type="text"
              required
              value={form.digitalBookRootUrl || ''}
              onChange={(e) => setForm({ ...form, digitalBookRootUrl: e.target.value })}
              placeholder="LibraryData/books/digital"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono outline-none focus:border-indigo-500 text-xs"
            />
            <span className="text-[11px] text-slate-500 mt-1 block leading-relaxed">
              يُستخدم هذا المسار مباشرة في عمليات الاستكشاف الجماعي (Bulk Scan)، الفرز التلقائي قبل الاستيراد، وحل مسارات الكتب الرقمية. يتم حفظ القيمة واسترجاعها تلقائياً عند إعادة تشغيل الخادم.
            </span>
          </div>

          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1 font-mono text-[11px] text-slate-400">
            <div className="flex justify-between">
              <span>القيمة المحفوظة حالياً:</span>
              <span className="text-emerald-400 font-bold">{config.digitalBookRootUrl || 'LibraryData/books/digital'}</span>
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

      <AdminSecuritySettings />

      {/* Database Maintenance & Backup Section */}
      <div className="space-y-4">
        {/* Notice on Digital Files / Media Storage */}
        <div className="bg-slate-900/60 border border-indigo-500/20 rounded-2xl p-4 flex items-start gap-3 text-xs text-slate-300">
          <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-indigo-300">تنبيه تقني هام بخصوص ملفات الكتب الرقمية والأغلفة:</span>
            <p className="text-slate-400 leading-relaxed">
              عمليات النسخ الاحتياطي وتصدير البيانات تغطي قاعدة البيانات المركزية بكامل سجلاتها وبياناتها الوصفية وعلاقات الإعارة والقراءة. أما الملفات الرقمية الأصلية (<code className="text-indigo-300 font-mono">PDF</code> و <code className="text-indigo-300 font-mono">EPUB</code>) والأغلفة فمحفوظة محلياً في المجلد <code className="text-amber-300 font-mono">LibraryData/books/</code> على خادم مشكاة. للحفظ الشامل الكامل للمؤسسة، يُنصح بنسخ مجلد <code className="text-slate-200 font-mono">LibraryData</code> دورياً إلى وحدة تخزين خارجية.
            </p>
          </div>
        </div>

        {/* Card 1: Unified Backup & Google Drive Status */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-5 text-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <span>منظومة النسخ الاحتياطي التلقائي (محلي وسحابي)</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">
                نسخ احتياطي يومي موثوق لقاعدة البيانات مع الاحتفاظ التلقائي بآخر 7 نسخ محلياً وعلى Google Drive الخاص بالمؤسسة
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchBackupStatus}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all cursor-pointer"
                title="تحديث حالة النسخ"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Backup Status Overview Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Local Backup Panel */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-300 flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-emerald-400" />
                  النسخ الاحتياطي المحلي (Local Backup)
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  backupStatus?.local.status === 'successful'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : backupStatus?.local.status === 'failed'
                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}>
                  {backupStatus?.local.status === 'successful' ? '✓ ناجح' : backupStatus?.local.status === 'failed' ? '✗ خطأ' : 'جاهز'}
                </span>
              </div>
              <div className="space-y-1 text-slate-400 text-[11px] pt-1">
                <div className="flex justify-between">
                  <span>آخر نسخة ناجحة:</span>
                  <span className="font-mono text-slate-200">
                    {backupStatus?.local.lastBackupTime
                      ? new Date(backupStatus.local.lastBackupTime).toLocaleString('ar-SA')
                      : 'لا توجد بعد'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>النسخ المحفوظة محلياً:</span>
                  <span className="font-mono text-slate-200">
                    {backupStatus?.local.count ?? 0} / 7
                  </span>
                </div>
              </div>
            </div>

            {/* Cloud Backup Panel */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-300 flex items-center gap-1.5">
                  <Cloud className="w-4 h-4 text-sky-400" />
                  النسخ الاحتياطي السحابي (Google Drive)
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  backupStatus?.cloud.connected && backupStatus?.cloud.status === 'successful'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : backupStatus?.cloud.status === 'waiting'
                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}>
                  {backupStatus?.cloud.connected
                    ? backupStatus.cloud.status === 'waiting'
                      ? '⚠ بانتظار الرفع'
                      : '✓ متصل بـ Drive'
                    : 'غير متصل'}
                </span>
              </div>
              <div className="space-y-1 text-slate-400 text-[11px] pt-1">
                <div className="flex justify-between">
                  <span>آخر رفع سحابي:</span>
                  <span className="font-mono text-slate-200">
                    {backupStatus?.cloud.lastUploadTime
                      ? new Date(backupStatus.cloud.lastUploadTime).toLocaleString('ar-SA')
                      : 'لا يوجد بعد'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>النسخ على Google Drive:</span>
                  <span className="font-mono text-slate-200">
                    {backupStatus?.cloud.count !== null ? `${backupStatus?.cloud.count} / 7` : 'غير معروف'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* Create Unified Backup */}
              <button
                type="button"
                onClick={handleCreateUnifiedBackup}
                disabled={creatingBackup}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-semibold shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <Database className={`w-4 h-4 ${creatingBackup ? 'animate-spin' : ''}`} />
                <span>{creatingBackup ? 'جاري إنشاء النسخة...' : 'إنشاء نسخة احتياطية الآن'}</span>
              </button>

              {/* Retry pending upload button if waiting */}
              {backupStatus?.cloud.status === 'waiting' && (
                <button
                  type="button"
                  onClick={handleRetryUpload}
                  disabled={retryingUpload}
                  className="flex items-center gap-2 px-3 py-2 bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white border border-amber-600/40 rounded-xl font-semibold transition-all cursor-pointer"
                >
                  <UploadCloud className={`w-4 h-4 ${retryingUpload ? 'animate-spin' : ''}`} />
                  <span>{retryingUpload ? 'جاري إعادة المحاولة...' : 'إعادة رفع النسخة المعلقة الآن'}</span>
                </button>
              )}
            </div>

            {/* Google Drive Connect / Disconnect */}
            <div>
              {backupStatus?.cloud.connected ? (
                <button
                  type="button"
                  onClick={handleDisconnectDrive}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-300 border border-slate-700 rounded-xl transition-all cursor-pointer"
                >
                  <CloudOff className="w-3.5 h-3.5" />
                  <span>فصل Google Drive</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConnectDrive}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-semibold shadow-lg shadow-sky-600/20 transition-all cursor-pointer"
                >
                  <Cloud className="w-4 h-4" />
                  <span>ربط Google Drive المؤسسة</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Modal for Google Drive OAuth Connection (Simple Institutional 1-Click Experience) */}
        {showDriveConnectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-sky-400" />
                  <span>ربط حساب Google Drive للمؤسسة</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setShowDriveConnectModal(false)}
                  className="text-slate-400 hover:text-slate-200 cursor-pointer text-base"
                >
                  ✕
                </button>
              </div>

              <div className="text-center space-y-2.5 py-2">
                <div className="w-14 h-14 rounded-2xl bg-sky-500/10 text-sky-400 flex items-center justify-center mx-auto border border-sky-500/20 shadow-inner">
                  <Cloud className="w-7 h-7" />
                </div>
                <h5 className="font-bold text-slate-100 text-sm">النسخ الاحتياطي السحابي التلقائي الآمن</h5>
                <p className="text-slate-300 text-xs leading-relaxed">
                  سيتم إنشاء مجلد آمن باسم <strong className="text-sky-300">MISHKAT Backups</strong> في Google Drive التابع للمؤسسة، وحفظ آخر <strong>7 نسخ احتياطية</strong> تلقائياً لمنع فقدان بيانات المكتبة تماماً.
                </p>
              </div>

              {/* 1-Click Connect Button */}
              <div className="space-y-3 pt-1">
                <button
                  type="button"
                  onClick={handleLaunchGoogleSignIn}
                  disabled={connectingDrive}
                  className="w-full py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-lg shadow-sky-600/20 cursor-pointer flex items-center justify-center gap-2.5 text-xs"
                >
                  {connectingDrive ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Globe className="w-4 h-4" />
                  )}
                  <span>{connectingDrive ? 'جاري فتح نافذة Google...' : 'تسجيل الدخول باستخدام Google للمؤسسة'}</span>
                </button>

                <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                  💡 ستفتح نافذة Google الرسمية؛ اختر حساب المؤسسة واضغط "السماح"، وسيتم الربط وإغلاق النافذة آلياً خلال ثوانٍ.
                </p>
              </div>

              {/* Collapsible Manual Code Fallback */}
              <div className="pt-2 border-t border-slate-800/80">
                <details className="text-slate-500 text-[11px] group">
                  <summary className="cursor-pointer hover:text-slate-400 transition-colors list-none flex items-center justify-between">
                    <span>خيارات الربط اليدوي البديل (إذا تعذر الفتح التلقائي)</span>
                    <span className="text-[10px] group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <div className="space-y-2 pt-2.5">
                    <p className="text-slate-400 text-[11px]">
                      إذا قمت بتسجيل الدخول من متصفح آخر، الصق رمز التفويض (Authorization Code) هنا:
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={authCodeInput}
                        onChange={(e) => setAuthCodeInput(e.target.value)}
                        placeholder="4/0AWtgk..."
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-100 font-mono outline-none focus:border-sky-500 text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleConfirmDriveCode}
                        disabled={connectingDrive || !authCodeInput.trim()}
                        className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl font-semibold transition-all cursor-pointer shrink-0"
                      >
                        تأكيد
                      </button>
                    </div>
                  </div>
                </details>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setShowDriveConnectModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all cursor-pointer"
                >
                  إغلاق النافذة
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Card 2: Restore from Local or Google Drive */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-400" />
                <span>استرجاع قاعدة البيانات المركزية (Database Restore)</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                استعادة النظام من النسخ المحلية أو مباشرة من Google Drive عند تعطل أو استبدال جهاز الكمبيوتر
              </p>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/60 text-amber-300 border border-amber-800/60">
              معاملة ذرية ACID Transaction
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-slate-400 leading-relaxed">
              يقوم النظام تلقائياً بإنشاء نسخة أمان احتياطية قبل الاسترجاع، وفحص سلامة الملف ومطابقة الجداول قبل لمس أي بيانات، مع إمكانية التراجع الكامل التلقائي في حال أي خطأ.
            </div>
            <button
              type="button"
              onClick={() => {
                const nextState = !showBackupsList;
                setShowBackupsList(nextState);
                if (nextState) {
                  fetchBackups();
                  if (backupStatus?.cloud.connected) fetchDriveBackups();
                }
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/30 rounded-xl font-semibold transition-all shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{showBackupsList ? 'إخفاء قائمة النسخ' : 'إدارة واسترجاع النسخ'}</span>
            </button>
          </div>

          {showBackupsList && (
            <div className="mt-4 bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
              {/* Tabs for Local vs Google Drive */}
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <button
                  type="button"
                  onClick={() => setActiveBackupTab('local')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeBackupTab === 'local'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>النسخ المحلية على هذا الجهاز ({backups.length} / 7)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveBackupTab('cloud');
                    fetchDriveBackups();
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeBackupTab === 'cloud'
                      ? 'bg-sky-600 text-white shadow-md'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>نسخ Google Drive السحابية ({driveBackups.length} / 7)</span>
                </button>
              </div>

              {/* Local Backups Tab */}
              {activeBackupTab === 'local' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-slate-400 text-xs pb-1">
                    <span>النسخ الاحتياطية المتوفرة على القرص الصلب المحلي</span>
                    <button
                      type="button"
                      onClick={fetchBackups}
                      disabled={loadingBackups}
                      className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingBackups ? 'animate-spin' : ''}`} />
                      تحديث
                    </button>
                  </div>

                  {loadingBackups ? (
                    <div className="text-center py-4 text-slate-500">جاري تحميل قائمة النسخ المحلية...</div>
                  ) : backups.length === 0 ? (
                    <div className="text-center py-4 text-slate-500">لا توجد نسخ احتياطية محفوظة محلياً.</div>
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
                                {b.type === 'pre_restore' ? 'نسخة أمان' : 'نسخة دورية'}
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

              {/* Cloud Backups Tab (Google Drive) */}
              {activeBackupTab === 'cloud' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-slate-400 text-xs pb-1">
                    <span>النسخ المحفوظة على Google Drive في مجلد MISHKAT Backups</span>
                    <button
                      type="button"
                      onClick={fetchDriveBackups}
                      disabled={loadingDriveBackups}
                      className="text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingDriveBackups ? 'animate-spin' : ''}`} />
                      تحديث السحابة
                    </button>
                  </div>

                  {!backupStatus?.cloud.connected ? (
                    <div className="text-center py-6 space-y-3 bg-slate-900/40 rounded-xl border border-dashed border-slate-800">
                      <p className="text-slate-400">حساب Google Drive غير مربوط حالياً.</p>
                      <button
                        type="button"
                        onClick={handleConnectDrive}
                        className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold cursor-pointer"
                      >
                        ربط Google Drive الآن للاسترجاع
                      </button>
                    </div>
                  ) : loadingDriveBackups ? (
                    <div className="text-center py-4 text-slate-500">جاري الاتصال بـ Google Drive وجلب قائمة النسخ...</div>
                  ) : driveBackups.length === 0 ? (
                    <div className="text-center py-4 text-slate-500">لا توجد نسخ احتياطية على Google Drive حتى الآن.</div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {driveBackups.map((db) => (
                        <div
                          key={db.id}
                          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 hover:border-slate-700 transition-colors"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-slate-200 text-xs">{db.name}</span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-950 text-sky-300 border border-sky-800">
                                Google Drive
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500">
                              الحجم: {db.sizeFormatted} • التاريخ: {new Date(db.createdAt).toLocaleString('ar-SA')}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRestoreDrive(db.id, db.name)}
                            disabled={restoringFile === db.id}
                            className="px-3 py-1.5 bg-sky-900/30 hover:bg-sky-700 text-sky-300 hover:text-white border border-sky-800/60 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 shrink-0 flex items-center gap-1.5"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>{restoringFile === db.id ? 'جاري التنزيل والاسترجاع...' : 'تنزيل واسترجاع فوري'}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Card 3: Institutional Data Export (Migration & Open JSON) */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              <span>تصدير بيانات المؤسسة (ترحيل البيانات المفتوحة)</span>
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950/60 text-cyan-300 border border-cyan-800/60">
              JSON مفتوح • خالي من الأسرار
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-slate-400 leading-relaxed">
              تصدير بيانات المؤسسة بصيغة JSON مقروءة وقياسية لأغراض الترحيل لأنظمة أخرى أو المراجعة الخارجية. يتم استبعاد كلمات المرور، أسئلة الأمان، ورموز الجلسات بالكامل حفاظاً على سرية وخصوصية النظام.
            </div>
            <button
              type="button"
              onClick={handleExportInstitutionalDataAction}
              disabled={exportingData}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-semibold transition-all shrink-0 cursor-pointer"
            >
              <Download className={`w-4 h-4 text-cyan-400 ${exportingData ? 'animate-bounce' : ''}`} />
              <span>{exportingData ? 'جاري تصدير البيانات...' : 'تصدير بيانات المؤسسة (JSON)'}</span>
            </button>
          </div>
        </div>

        {/* Card 4: Reset Demo Data */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-rose-400" />
              <span>إعادة تعيين قاعدة البيانات المركزية</span>
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/60 text-rose-300 border border-rose-800/60">
              إجراء جذري
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-slate-400 leading-relaxed">
              إعادة تعيين قاعدة البيانات المركزية ومسح كافة بيانات النظام (الطلاب، الكتب، الإعارات وغيرها) باستثناء بيانات مدير النظام الافتراضية.
            </div>
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    '⚠️ تحذير: هل أنت متأكد من رغبتك في مسح كافة البيانات واستعادة نسخة النظام الأساسية الفارغة؟ لا يمكن التراجع عن هذا الإجراء.'
                  )
                ) {
                  onResetData();
                }
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white rounded-xl font-semibold transition-all shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>استعادة نسخة النظام الأساسية</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
