import React, { useState, useEffect } from 'react';
import {
  Globe2,
  Lock,
  Upload,
  ShieldCheck,
  Plus,
  Trash2,
  RotateCcw,
  Maximize2,
  Minimize2,
  Info,
  Star,
  Edit3,
  Loader2,
  AlertCircle,
  AlertTriangle,
  X,
  Sparkles,
  ExternalLink,
  HelpCircle,
} from 'lucide-react';
import { WhitelistedPortal, User, Category } from '../../types/library';
import { BookIngestionModal } from './BookIngestionModal';
import { isSafeUrl } from '../../utils/security';
import { portalRepository } from '../../services/portalRepository';
import { submissionRepository } from '../../services/submissionRepository';

interface WhitelistedPortalsViewProps {
  portals: WhitelistedPortal[];
  currentUser: User;
  categories: Category[];
  onSubmitIngestion?: (submissionData: any) => Promise<any> | void;
  onAddPortal: (portal: Omit<WhitelistedPortal, 'id'>) => void;
  onDeletePortal: (id: string) => void;
  onUpdatePortal?: (id: string, updates: Partial<WhitelistedPortal>) => void;
  onToggleFeatured?: (id: string) => void;
}

export const WhitelistedPortalsView: React.FC<WhitelistedPortalsViewProps> = ({
  portals,
  currentUser,
  categories,
  onSubmitIngestion,
  onAddPortal,
  onDeletePortal,
  onUpdatePortal,
  onToggleFeatured,
}) => {
  const [selectedPortal, setSelectedPortal] = useState<WhitelistedPortal>(portals[0] || ({} as WhitelistedPortal));
  const [iframeKey, setIframeKey] = useState(0);
  const [isPortalFullscreen, setIsPortalFullscreen] = useState(false);
  const [ingestionModalData, setIngestionModalData] = useState<{
    portalName: string;
    url?: string;
    prefill?: any;
  } | null>(null);

  const [isAddPortalOpen, setIsAddPortalOpen] = useState(false);
  const [editingPortal, setEditingPortal] = useState<WhitelistedPortal | null>(null);
  const [portalToDelete, setPortalToDelete] = useState<WhitelistedPortal | null>(null);

  // New Portal form state (Admin only)
  const [newPortalName, setNewPortalName] = useState('');
  const [newPortalUrl, setNewPortalUrl] = useState('');
  const [newPortalCategory, setNewPortalCategory] = useState('المصادر والأبحاث الرقمية');
  const [newPortalDesc, setNewPortalDesc] = useState('');
  const [newPortalDomains, setNewPortalDomains] = useState('');
  const [newPortalIsFeatured, setNewPortalIsFeatured] = useState(false);

  // Edit Portal form state (Admin only)
  const [editPortalName, setEditPortalName] = useState('');
  const [editPortalUrl, setEditPortalUrl] = useState('');
  const [editPortalCategory, setEditPortalCategory] = useState('المصادر والأبحاث الرقمية');
  const [editPortalDesc, setEditPortalDesc] = useState('');
  const [editPortalDomains, setEditPortalDomains] = useState('');
  const [editPortalIsFeatured, setEditPortalIsFeatured] = useState(false);

  // Technical Test Suite State (Admin only)
  const [isTestingPortalId, setIsTestingPortalId] = useState<string | null>(null);
  const [activeTestReport, setActiveTestReport] = useState<any | null>(null);
  const [isDiscoveringPreview, setIsDiscoveringPreview] = useState(false);
  const [previewDiscoveryResult, setPreviewDiscoveryResult] = useState<any | null>(null);
  const [previewDiscoveryError, setPreviewDiscoveryError] = useState<string | null>(null);

  // Synchronize selected portal
  useEffect(() => {
    if (!selectedPortal || !portals.some((p) => p.id === selectedPortal.id)) {
      setSelectedPortal(portals[0] || ({} as WhitelistedPortal));
    }
  }, [portals, selectedPortal]);

  // Handle ESC key to exit portal fullscreen mode (Section 3 Requirement)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPortalFullscreen) {
        setIsPortalFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPortalFullscreen]);

  const handleOpenPortalFullscreen = (portal: WhitelistedPortal) => {
    setSelectedPortal(portal);
    setIframeKey((k) => k + 1);
    setIsPortalFullscreen(true);
  };

  const handleRunOnboardingTests = async (portalId: string) => {
    setIsTestingPortalId(portalId);
    try {
      const res = await portalRepository.runTests(portalId);
      if (res.success && res.data) {
        setActiveTestReport(res.data);
      }
    } catch (err: any) {
      alert(`تعذر تشغيل حزمة الفحص الفني: ${err.message}`);
    } finally {
      setIsTestingPortalId(null);
    }
  };

  const handleRunDiscoveryPreview = async () => {
    if (!newPortalUrl.trim()) return;
    setIsDiscoveringPreview(true);
    setPreviewDiscoveryError(null);
    setPreviewDiscoveryResult(null);

    const domains = newPortalDomains
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);

    try {
      const res = await portalRepository.discoverPreview(newPortalUrl.trim(), domains);
      if (res.success && res.data) {
        setPreviewDiscoveryResult(res.data);
      } else {
        setPreviewDiscoveryError(res.error?.message || 'فشل الاستكشاف التقني للبوابة.');
      }
    } catch (err: any) {
      setPreviewDiscoveryError(err.message || 'فشل الاستكشاف التقني.');
    } finally {
      setIsDiscoveringPreview(false);
    }
  };

  const handleCreatePortal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPortalName.trim() || !newPortalUrl.trim()) return;

    const domains = newPortalDomains
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);

    onAddPortal({
      name: newPortalName.trim(),
      url: newPortalUrl.trim(),
      category: newPortalCategory.trim() || 'المصادر والأبحاث الرقمية',
      description: newPortalDesc.trim() || `موقع معتمد لتصفح المراجع والكتب الرقمية: ${newPortalName.trim()}`,
      allowedDomains: domains.length > 0 ? domains : [newPortalUrl.replace(/https?:\/\//, '').split('/')[0]],
      isFeatured: newPortalIsFeatured,
      status: 'APPROVED_BROWSABLE',
      integrationMethod: 'BROWSE_ONLY',
    });

    setNewPortalName('');
    setNewPortalUrl('');
    setNewPortalCategory('المصادر والأبحاث الرقمية');
    setNewPortalDesc('');
    setNewPortalDomains('');
    setNewPortalIsFeatured(false);
    setPreviewDiscoveryResult(null);
    setPreviewDiscoveryError(null);
    setIsAddPortalOpen(false);
  };

  const handleOpenEditModal = (portal: WhitelistedPortal) => {
    setEditingPortal(portal);
    setEditPortalName(portal.name);
    setEditPortalUrl(portal.url);
    setEditPortalCategory(portal.category || 'المصادر والأبحاث الرقمية');
    setEditPortalDesc(portal.description);
    setEditPortalDomains(portal.allowedDomains.join(', '));
    setEditPortalIsFeatured(!!portal.isFeatured);
  };

  const handleSaveEditPortal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPortal || !editPortalName.trim() || !editPortalUrl.trim()) return;

    const domains = editPortalDomains
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);

    const updates: Partial<WhitelistedPortal> = {
      name: editPortalName.trim(),
      url: editPortalUrl.trim(),
      category: editPortalCategory.trim() || 'المصادر والأبحاث الرقمية',
      description: editPortalDesc.trim() || `موقع معتمد لتصفح المراجع والكتب الرقمية: ${editPortalName.trim()}`,
      allowedDomains: domains.length > 0 ? domains : [editPortalUrl.replace(/https?:\/\//, '').split('/')[0]],
      isFeatured: editPortalIsFeatured,
    };

    if (onUpdatePortal) {
      onUpdatePortal(editingPortal.id, updates);
    }

    if (selectedPortal?.id === editingPortal.id) {
      setSelectedPortal((prev) => ({
        ...prev,
        ...updates,
      }));
    }

    setEditingPortal(null);
  };

  const handleConfirmDelete = () => {
    if (!portalToDelete) return;
    onDeletePortal(portalToDelete.id);
    if (selectedPortal?.id === portalToDelete.id) {
      const remaining = portals.filter((p) => p.id !== portalToDelete.id);
      setSelectedPortal(remaining[0] || ({} as WhitelistedPortal));
    }
    setPortalToDelete(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Banner & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Globe2 className="w-5 h-5 text-sky-500" />
              البوابات والمكتبات الرقمية المعتمدة
            </h2>
            <span className="text-xs bg-sky-500/10 text-sky-600 dark:text-sky-400 font-bold px-2.5 py-0.5 rounded-full border border-sky-500/20">
              تصفح مدمج داخل مشكاة
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed max-w-2xl">
            تصفح المواقع والمصادر المعتمدة مباشرة داخل المنصة بوضع ملء الشاشة. إذا عثرت على كتاب أو مرجع تحتاجه، اضغط على زر "اقتراح كتاب" لإرساله لتدقيق أمين المكتبة واعتماده في المستودع المركزي.
          </p>
        </div>

        {/* Global Suggest Book Action + Admin Portal Management (Section 2 & 5 Requirement) */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start md:self-center">
          {/* Exactly ONE clearly visible global book-suggestion action near the top of the page */}
          <button
            onClick={() => {
              setIngestionModalData({
                portalName: selectedPortal?.name || portals[0]?.name || 'بوابة معتمدة',
                url: selectedPortal?.url || portals[0]?.url || '',
                prefill: {
                  sourcePortalId: selectedPortal?.id,
                  sourcePortalName: selectedPortal?.name || 'بوابة معتمدة',
                  sourceUrl: selectedPortal?.url || '',
                  sourceRecordUrl: selectedPortal?.url || '',
                  sourceMethod: 'USER_ASSISTED_CAPTURE',
                  verificationStatus: 'USER_SUGGESTED',
                },
              });
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
            title="اقتراح كتاب أو مرجع لإضافته إلى المكتبة المركزية بعد تدقيق الإدارة"
          >
            <Upload className="w-4 h-4" />
            <span>اقتراح كتاب للمكتبة</span>
          </button>

          {currentUser?.role === 'admin' && (
            <button
              onClick={() => setIsAddPortalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 text-sky-500" />
              <span>إضافة موقع معتمد</span>
            </button>
          )}
        </div>
      </div>

      {/* Portals Directory Cards Grid (Section 2: NO "Suggest Book" on individual cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {portals.map((portal) => {
          const isSelected = selectedPortal?.id === portal.id;
          const isAvailable = portal.status !== 'BLOCKED' && portal.status !== 'DISABLED';

          return (
            <div
              key={portal.id}
              onClick={() => setSelectedPortal(portal)}
              className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 cursor-pointer transition-all duration-200 flex flex-col justify-between space-y-3 relative group shadow-sm hover:shadow-md ${
                isSelected
                  ? 'border-sky-500 ring-2 ring-sky-500/20 shadow-md'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md font-medium truncate max-w-[140px]">
                    {portal.category}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {/* Status Badge */}
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-md font-bold flex items-center gap-1 ${
                        isAvailable
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isAvailable ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      <span>{isAvailable ? 'متاح للتصفح المضمن' : 'غير متاح'}</span>
                    </span>

                    {portal.isFeatured && (
                      <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 p-1 rounded-md font-bold border border-amber-500/20" title="موقع رئيسي مميز">
                        <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                      </span>
                    )}

                    {currentUser?.role === 'admin' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRunOnboardingTests(portal.id);
                        }}
                        disabled={isTestingPortalId === portal.id}
                        className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-sky-50 dark:hover:bg-sky-950/50 text-slate-400 hover:text-sky-500 transition-colors"
                        title="تشغيل حزمة الفحص الفني للتأكد من بروتوكول الموقع وسلامة الاتصال"
                      >
                        {isTestingPortalId === portal.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-500" />
                        ) : (
                          <ShieldCheck className="w-3.5 h-3.5 text-sky-500" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm group-hover:text-sky-600 dark:group-hover:text-sky-300 transition-colors truncate">
                  {portal.name}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                  {portal.description}
                </p>
              </div>

              {/* Card Footer: Domain and In-Platform "فتح الموقع" action ONLY */}
              <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-mono text-sky-600 dark:text-sky-400 truncate max-w-[160px]" title={portal.allowedDomains.join(', ')}>
                    {portal.allowedDomains.join(', ')}
                  </span>
                  {currentUser?.role === 'admin' && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditModal(portal);
                        }}
                        className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1 rounded-md transition-colors cursor-pointer"
                        title="تعديل بيانات الموقع"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPortalToDelete(portal);
                        }}
                        className="text-slate-400 hover:text-rose-500 p-1 rounded-md transition-colors cursor-pointer"
                        title="حذف الموقع"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Section 1.1 & 3: "فتح الموقع" opens INSIDE MISHKAT in Portal Fullscreen Mode.
                    NO <a target="_blank">, NO window.open, NO individual suggest button on cards. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenPortalFullscreen(portal);
                  }}
                  className="w-full py-2 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-600 text-sky-700 dark:text-sky-300 hover:text-white border border-sky-200 dark:border-sky-800 hover:border-sky-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
                >
                  <Globe2 className="w-3.5 h-3.5" />
                  <span>فتح الموقع داخل المنصة</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Embedded Portal Browsing Preview Card */}
      {selectedPortal && !isPortalFullscreen && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-md flex flex-col">
          {/* Ribbon */}
          <div className="bg-slate-100 dark:bg-slate-950 p-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">الموقع المحدد:</span>
              <span className="font-bold text-xs text-slate-800 dark:text-slate-200">{selectedPortal.name}</span>
              <span className="font-mono text-xs text-sky-600 dark:text-sky-400 hidden sm:inline">({selectedPortal.url})</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIframeKey((k) => k + 1)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                title="تحديث الصفحة"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleOpenPortalFullscreen(selectedPortal)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>وضع التصفح بملء الشاشة (ESC)</span>
              </button>
            </div>
          </div>

          {/* Embedded Sandbox */}
          <div className="relative min-h-[460px] flex flex-col bg-slate-50 dark:bg-slate-950">
            {isSafeUrl(selectedPortal.url) ? (
              <iframe
                key={iframeKey}
                src={selectedPortal.url}
                title={selectedPortal.name}
                className="w-full flex-1 border-0 bg-white min-h-[460px]"
                sandbox="allow-same-origin allow-scripts allow-forms"
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300">
                <Lock className="w-12 h-12 mb-3 text-rose-500" />
                <h3 className="font-bold text-base">تم حظر هذا الرابط لأسباب أمنية</h3>
                <p className="text-xs text-rose-600 dark:text-rose-400 mt-1 max-w-md">
                  الرابط المدخل يحتوي على بروتوكول غير مصرح به. يُسمح فقط ببروتوكولات الويب الآمنة المعتمدة.
                </p>
              </div>
            )}

            {/* Non-Navigation Informational Banner (Section 1.1 Requirement) */}
            <div className="p-3 bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <Info className="w-4 h-4 text-sky-500 shrink-0" />
              <span>
                إذا منع خادم الموقع التضمين الداخلي (عبر سياسة X-Frame-Options)، تذكر أنه يمكنك نسخ رابط صفحة الكتاب واستخدام زر <strong>[اقتراح كتاب للمكتبة]</strong> في أعلى الصفحة ليقوم أمين المكتبة باعتماده وإضافته إلى مشكاة.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* PORTAL FULLSCREEN MODE (Section 3 Requirement) */}
      {isPortalFullscreen && selectedPortal && (
        <div className="fixed inset-0 z-[120] bg-slate-950 w-screen h-screen flex flex-col overflow-hidden animate-in fade-in duration-200">
          {/* Dedicated Fullscreen Top Bar */}
          <div className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-3 sm:px-5 shrink-0 shadow-md">
            {/* Portal Identity */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center">
                <Globe2 className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-100 truncate max-w-[200px] sm:max-w-[320px]">
                    {selectedPortal.name}
                  </span>
                  <span className="text-[10px] bg-sky-500/10 text-sky-400 font-mono px-2 py-0.5 rounded border border-sky-500/20 hidden sm:inline">
                    تصفح داخل مشكاة
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                  <Lock className="w-2.5 h-2.5 text-emerald-400" />
                  <span className="truncate max-w-[180px] sm:max-w-[280px]">{selectedPortal.url}</span>
                </div>
              </div>
            </div>

            {/* Controls: Refresh, Suggest Book, and Explicit Exit Control */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIframeKey((k) => k + 1)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                title="إعادة تحميل الصفحة"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setIngestionModalData({
                    portalName: selectedPortal.name,
                    url: selectedPortal.url,
                    prefill: {
                      sourcePortalId: selectedPortal.id,
                      sourcePortalName: selectedPortal.name,
                      sourceUrl: selectedPortal.url,
                      sourceRecordUrl: selectedPortal.url,
                      sourceMethod: 'USER_ASSISTED_CAPTURE',
                      verificationStatus: 'USER_SUGGESTED',
                    },
                  });
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                title="اقتراح كتاب وجدته في هذا الموقع لإضافته إلى المكتبة المركزية"
              >
                <Upload className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">اقتراح كتاب من هذا الموقع</span>
                <span className="sm:hidden">اقتراح</span>
              </button>

              {/* Explicit Exit Control with ESC Badge (Section 3) */}
              <button
                onClick={() => setIsPortalFullscreen(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer"
                title="الخروج من وضع ملء الشاشة (Esc)"
              >
                <X className="w-4 h-4" />
                <span>خروج (ESC)</span>
              </button>
            </div>
          </div>

          {/* Fullscreen Iframe Body */}
          <div className="flex-1 w-full relative h-full flex flex-col bg-white">
            {isSafeUrl(selectedPortal.url) ? (
              <iframe
                key={iframeKey}
                src={selectedPortal.url}
                title={selectedPortal.name}
                className="w-full flex-1 border-0 bg-white"
                sandbox="allow-same-origin allow-scripts allow-forms"
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-950 text-slate-200">
                <Lock className="w-12 h-12 mb-3 text-rose-500" />
                <h3 className="font-bold text-base text-rose-400">تم حظر هذا الرابط لأسباب أمنية</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md">
                  الرابط المدخل يحتوي على بروتوكول غير مصرح به.
                </p>
              </div>
            )}

            {/* Non-Navigation Guidance Footer (Section 1.1 Requirement) */}
            <div className="bg-slate-900 border-t border-slate-800 px-4 py-2 flex items-center justify-between text-xs text-slate-400 shrink-0">
              <div className="flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="text-[11px]">
                  إذا ظهرت رسالة تمنع العرض داخل الإطار، فهذا الموقع لا يسمح بالتصفح المضمن داخل المنصة. يمكنك نسخ عنوان الكتاب ورابطه واستخدام زر [اقتراح كتاب من هذا الموقع] في الأعلى.
                </span>
              </div>
              <button
                onClick={() => setIsPortalFullscreen(false)}
                className="text-[11px] text-slate-300 hover:text-white underline shrink-0 cursor-pointer"
              >
                العودة لقائمة البوابات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Portal Modal (Admin Only) */}
      {isAddPortalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                <Globe2 className="w-5 h-5 text-sky-500" />
                إضافة موقع مكتبة معتمد جديد
              </h3>
              <button onClick={() => setIsAddPortalOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePortal} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">اسم الموقع / البوابة *</label>
                <input
                  type="text"
                  required
                  value={newPortalName}
                  onChange={(e) => setNewPortalName(e.target.value)}
                  placeholder="مثال: المستودع العلمي للأبحاث"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">الرابط الرسمي (URL) *</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    required
                    value={newPortalUrl}
                    onChange={(e) => setNewPortalUrl(e.target.value)}
                    placeholder="https://example-library.org"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 font-mono outline-none focus:border-sky-500 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleRunDiscoveryPreview}
                    disabled={isDiscoveringPreview || !newPortalUrl.trim()}
                    className="px-3 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold flex items-center gap-1 transition-colors shrink-0 disabled:opacity-40"
                    title="فحص تقني تمهيدي للموقع"
                  >
                    {isDiscoveringPreview ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-sky-500" />
                    )}
                    <span>فحص فني</span>
                  </button>
                </div>
              </div>

              {previewDiscoveryResult && (
                <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">حالة الفحص التقني:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {previewDiscoveryResult.protocol} — {previewDiscoveryResult.detectedMethod}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">معدل الاستجابة:</span>
                    <span className="font-mono">{previewDiscoveryResult.latencyMs}ms</span>
                  </div>
                </div>
              )}

              {previewDiscoveryError && (
                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-xl text-rose-700 dark:text-rose-300 text-[11px] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{previewDiscoveryError}</span>
                </div>
              )}

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">التصنيف الأكاديمي</label>
                <input
                  type="text"
                  value={newPortalCategory}
                  onChange={(e) => setNewPortalCategory(e.target.value)}
                  placeholder="المصادر والأبحاث الرقمية"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">النطاقات المصرح بها (مفصولة بفواصل)</label>
                <input
                  type="text"
                  value={newPortalDomains}
                  onChange={(e) => setNewPortalDomains(e.target.value)}
                  placeholder="al-maktaba.org, maktaba.net"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 font-mono outline-none focus:border-sky-500 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">وصف الموقع ومحتوياته</label>
                <textarea
                  rows={2}
                  value={newPortalDesc}
                  onChange={(e) => setNewPortalDesc(e.target.value)}
                  placeholder="بيان موجز للمكتبة والمخطوطات المتاحة فيها..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 outline-none focus:border-sky-500 resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="newPortalIsFeatured"
                  checked={newPortalIsFeatured}
                  onChange={(e) => setNewPortalIsFeatured(e.target.checked)}
                  className="rounded text-sky-600 focus:ring-sky-500"
                />
                <label htmlFor="newPortalIsFeatured" className="text-slate-700 dark:text-slate-300 text-xs cursor-pointer select-none">
                  تمييز كمصدر أساسي في قائمة البوابات
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddPortalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold transition-all shadow-md cursor-pointer"
                >
                  حفظ واعتماد الموقع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Portal Modal (Admin Only) */}
      {editingPortal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-indigo-500" />
                تعديل بيانات الموقع المعتمد
              </h3>
              <button onClick={() => setEditingPortal(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditPortal} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">اسم الموقع / البوابة *</label>
                <input
                  type="text"
                  required
                  value={editPortalName}
                  onChange={(e) => setEditPortalName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">الرابط الرسمي (URL) *</label>
                <input
                  type="url"
                  required
                  value={editPortalUrl}
                  onChange={(e) => setEditPortalUrl(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 font-mono outline-none focus:border-sky-500 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">التصنيف الأكاديمي</label>
                <input
                  type="text"
                  value={editPortalCategory}
                  onChange={(e) => setEditPortalCategory(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">النطاقات المصرح بها (مفصولة بفواصل)</label>
                <input
                  type="text"
                  value={editPortalDomains}
                  onChange={(e) => setEditPortalDomains(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 font-mono outline-none focus:border-sky-500 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">الوصف</label>
                <textarea
                  rows={2}
                  value={editPortalDesc}
                  onChange={(e) => setEditPortalDesc(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 outline-none focus:border-sky-500 resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editPortalIsFeatured"
                  checked={editPortalIsFeatured}
                  onChange={(e) => setEditPortalIsFeatured(e.target.checked)}
                  className="rounded text-sky-600 focus:ring-sky-500"
                />
                <label htmlFor="editPortalIsFeatured" className="text-slate-700 dark:text-slate-300 text-xs cursor-pointer select-none">
                  تمييز كمصدر أساسي
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingPortal(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-md cursor-pointer"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Admin Only) */}
      {portalToDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95 text-center">
            <div className="w-12 h-12 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">تأكيد حذف الموقع المعتمد</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                هل أنت متأكد من حذف موقع <strong>{portalToDelete.name}</strong> من قائمة البوابات المعتمدة؟
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPortalToDelete(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                حذف نهائي
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Technical Test Report Modal (Admin Diagnostics) */}
      {activeTestReport && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-xl w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-sky-500" />
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">تقرير الفحص الفني المعتمد</h3>
              </div>
              <button onClick={() => setActiveTestReport(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px]">
                <div>
                  <span className="text-slate-400 block">البوابة:</span>
                  <strong className="text-slate-800 dark:text-slate-200">{activeTestReport.portalName || activeTestReport.portalId}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">النتيجة الإجمالية:</span>
                  <strong className={activeTestReport.overallStatus === 'PASS' ? 'text-emerald-500' : 'text-amber-500'}>
                    {activeTestReport.overallStatus} ({activeTestReport.passedCount}/{activeTestReport.totalTests})
                  </strong>
                </div>
              </div>

              <div className="space-y-1.5">
                {activeTestReport.results?.map((t: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800/80 flex items-start justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${t.passed ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <strong className="text-slate-800 dark:text-slate-200">{t.name}</strong>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t.description}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      t.passed
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    }`}>
                      {t.passed ? 'ناجح' : 'فشل'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTestReport(null)}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-all shadow cursor-pointer"
              >
                إغلاق التقرير
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Book Suggestion Modal */}
      {ingestionModalData && (
        <BookIngestionModal
          isOpen={true}
          portals={portals}
          portalName={ingestionModalData.portalName}
          initialUrl={ingestionModalData.url}
          prefillData={ingestionModalData.prefill}
          categories={categories}
          currentUser={currentUser}
          onClose={() => setIngestionModalData(null)}
          onSubmit={async (submissionData) => {
            if (onSubmitIngestion) {
              return await onSubmitIngestion(submissionData);
            }
            const res = await submissionRepository.createSubmission(submissionData);
            return res;
          }}
        />
      )}
    </div>
  );
};
