import React, { useState, useEffect, useMemo } from 'react';
import {
  Globe2,
  Lock,
  Upload,
  Search,
  BookOpen,
  Sparkles,
  ShieldCheck,
  Plus,
  Trash2,
  Layers,
  ArrowRight,
  Filter,
  CheckCircle2,
  RotateCcw,
  Maximize2,
  Minimize2,
  Compass,
  FileDown,
  Monitor,
  Share2,
  X,
  BookMarked,
  Info,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  FileText,
  Star,
  Edit3,
  Loader2,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import { WhitelistedPortal, User, Category } from '../../types/library';
import { BookIngestionModal } from './BookIngestionModal';
import { PORTAL_CATALOG_DATABASE, PortalBookItem } from '../../data/portalCatalogs';
import { isSafeUrl, sanitizeText } from '../../utils/security';
import { portalRepository } from '../../services/portalRepository';

interface WhitelistedPortalsViewProps {
  portals: WhitelistedPortal[];
  currentUser: User;
  categories: Category[];
  onSubmitIngestion: (data: any) => void;
  onAddPortal: (portal: any) => void;
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
  const [viewMode, setViewMode] = useState<'explorer' | 'browser'>('explorer');
  const [portalSearch, setPortalSearch] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [activeReadingPortalBook, setActiveReadingPortalBook] = useState<PortalBookItem | null>(null);
  const [activeChapterIndex, setActiveChapterIndex] = useState<number>(0);
  const [iframeKey, setIframeKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeWarningDismissed, setIframeWarningDismissed] = useState(false);
  const [ingestionModalData, setIngestionModalData] = useState<{
    portalName: string;
    url?: string;
    prefill?: any;
  } | null>(null);

  // Phase 15.4-E: If portal is BROWSE_ONLY, default directly to embedded web browser
  useEffect(() => {
    if (selectedPortal?.status === 'BROWSE_ONLY' || selectedPortal?.integrationMethod === 'BROWSE_ONLY') {
      setViewMode('browser');
    }
  }, [selectedPortal]);
  const [isAddPortalOpen, setIsAddPortalOpen] = useState(false);
  const [editingPortal, setEditingPortal] = useState<WhitelistedPortal | null>(null);
  const [portalToDelete, setPortalToDelete] = useState<WhitelistedPortal | null>(null);

  // New Portal form state
  const [newPortalName, setNewPortalName] = useState('');
  const [newPortalUrl, setNewPortalUrl] = useState('');
  const [newPortalCategory, setNewPortalCategory] = useState('المصادر والأبحاث الرقمية');
  const [newPortalDesc, setNewPortalDesc] = useState('');
  const [newPortalDomains, setNewPortalDomains] = useState('');
  const [newPortalIsFeatured, setNewPortalIsFeatured] = useState(false);

  // Edit Portal form state
  const [editPortalName, setEditPortalName] = useState('');
  const [editPortalUrl, setEditPortalUrl] = useState('');
  const [editPortalCategory, setEditPortalCategory] = useState('المصادر والأبحاث الرقمية');
  const [editPortalDesc, setEditPortalDesc] = useState('');
  const [editPortalDomains, setEditPortalDomains] = useState('');
  const [editPortalIsFeatured, setEditPortalIsFeatured] = useState(false);

  // Phase 15.4-D: Live Source Verification & Technical Test Suite State
  const [verificationStates, setVerificationStates] = useState<
    Record<string, { status: string; details?: string; loading?: boolean }>
  >({});
  const [isTestingPortalId, setIsTestingPortalId] = useState<string | null>(null);
  const [activeTestReport, setActiveTestReport] = useState<any | null>(null);
  const [isDiscoveringPreview, setIsDiscoveringPreview] = useState(false);
  const [previewDiscoveryResult, setPreviewDiscoveryResult] = useState<any | null>(null);
  const [previewDiscoveryError, setPreviewDiscoveryError] = useState<string | null>(null);

  const handleVerifyRecord = async (book: PortalBookItem) => {
    setVerificationStates((prev) => ({
      ...prev,
      [book.id]: { status: 'LOADING', loading: true },
    }));
    try {
      const res = await portalRepository.verifyRecord({
        portalId: book.portalId,
        recordUrl: book.sourceRecordUrl,
        title: book.title,
        author: book.author,
        recordId: book.id,
      });
      if (res.success && res.data) {
        setVerificationStates((prev) => ({
          ...prev,
          [book.id]: {
            status: res.data.status,
            details: res.data.details,
            loading: false,
          },
        }));
      } else {
        setVerificationStates((prev) => ({
          ...prev,
          [book.id]: {
            status: 'ERROR',
            details: res.error?.message || 'فشل التحقق',
            loading: false,
          },
        }));
      }
    } catch (err: any) {
      setVerificationStates((prev) => ({
        ...prev,
        [book.id]: {
          status: 'ERROR',
          details: err.message,
          loading: false,
        },
      }));
    }
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

  // Keep selected portal synchronized with portals list
  useEffect(() => {
    if (!selectedPortal || !portals.some((p) => p.id === selectedPortal.id)) {
      setSelectedPortal(portals[0] || ({} as WhitelistedPortal));
    }
  }, [portals, selectedPortal]);

  // Close fullscreen on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Strict Source-Bound Retrieval (Phase 15.4-C): Only return verified records originating strictly from the selected portal.
  // NEVER synthesize or hallucinate records.
  const portalBooks = useMemo(() => {
    if (!selectedPortal?.id) return [];
    return PORTAL_CATALOG_DATABASE.filter((b) => b.portalId === selectedPortal.id);
  }, [selectedPortal]);

  // Filtered books within the selected portal
  const filteredPortalBooks = useMemo(() => {
    if (!portalBooks.length) return [];
    const q = portalSearch.trim().toLowerCase();
    return portalBooks.filter((book) => {
      const matchSearch =
        !q ||
        book.title.toLowerCase().includes(q) ||
        book.author.toLowerCase().includes(q) ||
        book.summary.toLowerCase().includes(q) ||
        (book.investigator && book.investigator.toLowerCase().includes(q)) ||
        (book.tags && book.tags.some((t) => t.toLowerCase().includes(q)));

      const matchCat =
        selectedCategoryFilter === 'all' ||
        book.categorySuggestion === selectedCategoryFilter ||
        book.categoryName.includes(selectedCategoryFilter);

      return matchSearch && matchCat;
    });
  }, [portalBooks, portalSearch, selectedCategoryFilter]);

  const handleCreatePortal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPortalName.trim() || !newPortalUrl.trim()) return;

    const domains = newPortalDomains
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);

    const initialStatus =
      previewDiscoveryResult && previewDiscoveryResult.detectedMethod !== 'NONE'
        ? 'DISCOVERING'
        : 'DRAFT';
    const initialMethod = previewDiscoveryResult?.detectedMethod || 'NONE';

    onAddPortal({
      name: newPortalName.trim(),
      url: newPortalUrl.trim(),
      category: newPortalCategory.trim() || 'المصادر والأبحاث الرقمية',
      description: newPortalDesc.trim() || `موقع معتمد لتصفح المراجع والكتب الرقمية: ${newPortalName.trim()}`,
      allowedDomains: domains.length > 0 ? domains : [newPortalUrl.replace(/https?:\/\//, '').split('/')[0]],
      isFeatured: newPortalIsFeatured,
      status: initialStatus,
      integrationMethod: initialMethod,
      capabilities: previewDiscoveryResult?.capabilities,
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

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Whitelist Security Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 whitespace-nowrap">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>بيئة تصفح مقيدة ومحمية داخلياً (Closed Sandbox)</span>
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 break-words">
            <Globe2 className="w-5 h-5 text-sky-500 shrink-0" />
            <span className="break-words">بوابة المكتبات العالمية المعتمدة وتصفح المواقع</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed break-words">
            تصفح مباشر ومحمي للمواقع المعتمدة (المكتبة الشاملة الإباضية، الشاملة العامة، المعاجم) مع قراءة فورية للمتون واستيراد وتوثيق أي كتاب للمكتبة المركزية
          </p>
        </div>

        {/* Top actions */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {currentUser?.role === 'admin' && (
            <button
              onClick={() => setIsAddPortalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm whitespace-nowrap"
            >
              <Plus className="w-4 h-4 text-sky-500 shrink-0" />
              <span>إضافة موقع معتمد</span>
            </button>
          )}

          <button
            onClick={() => {
              const defaultBook = portalBooks[0];
              setIngestionModalData({
                portalName: selectedPortal?.name || 'المكتبة الشاملة الإباضية',
                url: selectedPortal?.url,
                prefill: defaultBook
                  ? {
                      title: defaultBook.title,
                      author: defaultBook.author,
                      categorySuggestion: defaultBook.categorySuggestion,
                      summary: defaultBook.summary,
                      pages: defaultBook.pagesCount,
                      tags: defaultBook.tags,
                      sourceUrl: selectedPortal?.url,
                    }
                  : undefined,
              });
            }}
            className="flex items-center gap-2 px-3.5 sm:px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-sky-600/30 transition-all cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-4 h-4 shrink-0" />
            <span>استيراد وتوثيق كتاب للمكتبة</span>
          </button>
        </div>
      </div>

      {/* Portals Horizontal Navigation Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {portals.map((portal) => {
          const isSelected = selectedPortal?.id === portal.id;
          return (
            <div
              key={portal.id}
              onClick={() => {
                setSelectedPortal(portal);
                setActiveReadingPortalBook(null);
              }}
              className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group shadow-sm ${
                isSelected
                  ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-500 ring-2 ring-sky-500/20'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className={`p-2.5 rounded-xl border ${
                    isSelected
                      ? 'bg-sky-500/20 text-sky-600 dark:text-sky-300 border-sky-500/40'
                      : 'bg-slate-100 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {/* Phase 15.4-D: Technical Status Badge */}
                  {portal.status === 'VERIFIED' ? (
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-md font-bold border border-emerald-500/30 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      <span>موثق VERIFIED</span>
                    </span>
                  ) : portal.status === 'UNSUPPORTED' ? (
                    <span className="text-[10px] bg-rose-500/10 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-md font-bold border border-rose-500/30 flex items-center gap-1" title="لم يتم رصد واجهة برمجية أو وسيلة تكامل موثوقة">
                      <AlertCircle className="w-3 h-3 text-rose-500" />
                      <span>غير مدعوم UNSUPPORTED</span>
                    </span>
                  ) : portal.status === 'BLOCKED' ? (
                    <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-md font-bold border border-amber-500/30 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                      <span>محظور BLOCKED</span>
                    </span>
                  ) : (
                    <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-md font-medium border border-slate-200 dark:border-slate-700">
                      {portal.status || 'مسودة DRAFT'}
                    </span>
                  )}

                  {portal.isFeatured && (
                    <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-md font-bold border border-amber-500/20 flex items-center gap-0.5">
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
                      title="تشغيل حزمة الفحص الفني المعتمدة (12 اختباراً) للتأكد من البروتوكول والمصداقية"
                    >
                      {isTestingPortalId === portal.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-500" />
                      ) : (
                        <ShieldCheck className="w-3.5 h-3.5 text-sky-500" />
                      )}
                    </button>
                  )}

                  {currentUser?.role === 'admin' && onToggleFeatured && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFeatured(portal.id);
                      }}
                      className={`p-1 rounded-lg border transition-all cursor-pointer ${
                        portal.isFeatured
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 hover:bg-amber-500/20'
                          : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:text-amber-500'
                      }`}
                      title={portal.isFeatured ? 'إلغاء وسم رئيسي (جعله فرعياً)' : 'تعيين كوسم رئيسي (مصدر أساسي)'}
                    >
                      <Star className={`w-3.5 h-3.5 ${portal.isFeatured ? 'fill-amber-500 text-amber-500' : ''}`} />
                    </button>
                  )}
                </div>
              </div>

              <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm group-hover:text-sky-600 dark:group-hover:text-sky-300 transition-colors truncate">
                {portal.name}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                {portal.description}
              </p>

              <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                <span className="font-mono text-sky-600 dark:text-sky-400 truncate max-w-[130px]">
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
                      className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors p-1 rounded-md cursor-pointer"
                      title="تعديل معلومات الموقع ورابطه"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPortalToDelete(portal);
                      }}
                      className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors p-1 rounded-md cursor-pointer"
                      title="حذف من القائمة المعتمدة"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Portal Explorer Container */}
      {selectedPortal && (
        <div
          className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 transition-all ${
            isFullscreen
              ? 'fixed inset-0 z-50 rounded-none w-screen h-screen flex flex-col shadow-2xl overflow-hidden'
              : 'rounded-3xl overflow-hidden shadow-lg flex flex-col'
          }`}
        >
          {/* Top Browser Address & Mode Ribbon */}
          <div className="bg-slate-100 dark:bg-slate-950 p-3 sm:p-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
            {/* Window Dots & Security Status */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded-full bg-rose-400/80 hover:bg-rose-500 cursor-pointer transition-colors"
                  onClick={() => setIsFullscreen(false)}
                  title={isFullscreen ? 'الخروج من وضع ملء الشاشة' : ''}
                />
                <div className="w-3 h-3 rounded-full bg-amber-400/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-400/80" />
              </div>

              {/* Secure Address Bar */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs shadow-inner">
                <Lock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="text-slate-400 hidden md:inline text-[11px]">موقع معتمد:</span>
                <span className="text-slate-800 dark:text-slate-200 font-mono font-semibold truncate max-w-[200px] sm:max-w-[280px]">
                  {selectedPortal.url}
                </span>
                <button
                  onClick={() => setIframeKey((k) => k + 1)}
                  className="text-slate-400 hover:text-sky-500 transition-colors p-0.5"
                  title="تحديث الصفحة"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                {currentUser?.role === 'admin' && (
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(selectedPortal)}
                    className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-0.5"
                    title="تعديل بيانات هذا الموقع"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {isFullscreen && (
                <span className="hidden lg:flex items-center gap-1 px-2.5 py-1 bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-300 rounded-xl text-[11px] font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>تصفح داخلي كامل وآمن</span>
                </span>
              )}
            </div>

            {/* Mode Switcher & Fullscreen Action Buttons */}
            <div className="flex items-center gap-2">
              <div className="flex items-center p-1 bg-slate-200 dark:bg-slate-800 rounded-xl">
                <button
                  disabled={selectedPortal.status === 'BROWSE_ONLY' || selectedPortal.integrationMethod === 'BROWSE_ONLY'}
                  onClick={() => {
                    setViewMode('explorer');
                    setActiveReadingPortalBook(null);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'explorer'
                      ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  } ${
                    (selectedPortal.status === 'BROWSE_ONLY' || selectedPortal.integrationMethod === 'BROWSE_ONLY')
                      ? 'opacity-40 cursor-not-allowed'
                      : ''
                  }`}
                  title={
                    (selectedPortal.status === 'BROWSE_ONLY' || selectedPortal.integrationMethod === 'BROWSE_ONLY')
                      ? 'هذا الموقع مخصص للتصفح المباشر فقط'
                      : ''
                  }
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>
                    {selectedPortal.integrationMethod === 'STATIC_VERIFIED_SNAPSHOT' || selectedPortal.integrationMethod === 'MANUAL_VERIFIED_CATALOG'
                      ? `فهرس المخطوطات الموثق (${portalBooks.length})`
                      : `المستكشف التفاعلي للمخطوطات والكتب (${portalBooks.length})`}
                  </span>
                </button>
                <button
                  onClick={() => setViewMode('browser')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'browser'
                      ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>إطار الويب المباشر</span>
                </button>
              </div>

              {/* Fullscreen Immersion Button */}
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isFullscreen
                    ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                    : 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30'
                }`}
                title={isFullscreen ? 'الخروج من وضع ملء الشاشة (Esc)' : 'تصفح بملء الشاشة داخل التطبيق'}
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>تصغير (Esc)</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>ملء الشاشة</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Mode 1: Comprehensive Interactive Portal Explorer */}
          {viewMode === 'explorer' && (
            <div className={`flex-1 flex flex-col p-4 sm:p-6 space-y-5 overflow-y-auto ${isFullscreen ? 'h-[calc(100vh-4rem)]' : 'min-h-[580px]'}`}>
              {/* BROWSE_ONLY State: Explorer is Disabled per Non-Negotiable Principle */}
              {(selectedPortal.status === 'BROWSE_ONLY' || selectedPortal.integrationMethod === 'BROWSE_ONLY' || selectedPortal.capabilities?.isBrowseOnly) ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4 max-w-lg mx-auto my-auto animate-in fade-in">
                  <div className="w-16 h-16 rounded-2xl bg-sky-500/10 text-sky-500 flex items-center justify-center border border-sky-500/20">
                    <Globe2 className="w-8 h-8" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">
                      هذا الموقع متاح للتصفح المباشر فقط
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      لا تتوفر طريقة تقنية موثوقة للبحث داخل فهرسه من خلال منصة مشكاة. يمكنك تصفح الموقع مباشرة في إطار الويب واقتراح أي كتاب تجده هناك للمكتبة المركزية بعد تدقيق المشرف.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <button
                      onClick={() => setViewMode('browser')}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow cursor-pointer transition-all"
                    >
                      <Monitor className="w-4 h-4" />
                      <span>فتح في إطار الويب</span>
                    </button>
                    <a
                      href={selectedPortal.url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>فتح الموقع الخارجي</span>
                    </a>
                    <button
                      onClick={() => {
                        setIngestionModalData({
                          portalName: selectedPortal.name,
                          url: selectedPortal.url,
                          prefill: {
                            sourcePortalId: selectedPortal.id,
                            sourcePortalName: selectedPortal.name,
                            sourceUrl: selectedPortal.url,
                          },
                        });
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow cursor-pointer transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      <span>اقتراح كتاب من هذا الموقع للمكتبة</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* LIVE SOURCE Banner */}
                  {(selectedPortal.integrationMethod === 'LIVE_OFFICIAL_API' || selectedPortal.integrationMethod === 'OFFICIAL_API' || selectedPortal.capabilities?.isLiveSearchSupported) && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-3 px-4 flex items-center justify-between gap-3 text-xs text-emerald-800 dark:text-emerald-200">
                      <div className="flex items-center gap-2.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <div>
                          <span className="font-bold">المستكشف المباشر (LIVE SOURCE SEARCH)</span>
                          <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 mt-0.5">
                            المصدر: {selectedPortal.name} • بحث مباشر في المصدر • متصل الآن
                          </p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded-lg text-[10px] font-bold shrink-0 font-mono">
                        LIVE_SOURCE
                      </span>
                    </div>
                  )}

                  {/* Snapshot Notice Banner for Curated Catalogs */}
                  {(selectedPortal.integrationMethod === 'STATIC_VERIFIED_SNAPSHOT' || selectedPortal.integrationMethod === 'MANUAL_VERIFIED_CATALOG') && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 px-4 flex items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-200">
                      <div className="flex items-center gap-2.5">
                        <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        <div>
                          <span className="font-bold">نسخة فهرس موثقة مسبقاً (غير متزامن حياً)</span>
                          <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                            هذا الفهرس يمثل نسخة موثقة مسبقاً من متون ومخطوطات البوابة مع معاينة الأبواب والتحقيق. للتصفح الحي للموقع، انتقل إلى "إطار الويب المباشر".
                          </p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded-lg text-[10px] font-bold shrink-0 font-mono">
                        STATIC_VERIFIED_SNAPSHOT
                      </span>
                    </div>
                  )}
              {/* Search & Filter Header inside portal */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <div className="p-2 bg-sky-500/10 text-sky-600 dark:text-sky-400 rounded-xl">
                    <Search className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      محرك البحث والتصفية في {selectedPortal.name}:
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      ابحث في العناوين، المؤلفين، المتون، أو التراجم
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                  <input
                    type="text"
                    value={portalSearch}
                    onChange={(e) => setPortalSearch(e.target.value)}
                    placeholder="بحث في الكتب والمخطوطات..."
                    className="w-full md:w-72 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-sky-500 shadow-inner"
                  />

                  <select
                    value={selectedCategoryFilter}
                    onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                  >
                    <option value="all">كافة الأقسام</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Active Book Reader Modal inside Portal (If user opened a book from the portal) */}
              {activeReadingPortalBook ? (
                <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-md animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setActiveReadingPortalBook(null)}
                        className="p-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                        <span>العودة لقائمة الكتب</span>
                      </button>
                      <div>
                        <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                          {activeReadingPortalBook.title}
                        </h4>
                        <p className="text-xs text-slate-500">{activeReadingPortalBook.author} • {activeReadingPortalBook.volumeInfo || 'طبعة معتمدة'}</p>
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        setIngestionModalData({
                          portalName: selectedPortal.name,
                          url: selectedPortal.url,
                          prefill: {
                            title: activeReadingPortalBook.title,
                            author: activeReadingPortalBook.author,
                            categorySuggestion: activeReadingPortalBook.categorySuggestion,
                            summary: activeReadingPortalBook.summary,
                            pages: activeReadingPortalBook.pagesCount,
                            tags: activeReadingPortalBook.tags,
                          },
                        })
                      }
                      className="flex items-center gap-2 px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>استيراد هذا الكتاب للمكتبة المركزية</span>
                    </button>
                  </div>

                  {/* Chapter Selector Tabs */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {activeReadingPortalBook.sampleChapters.map((ch, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveChapterIndex(idx)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all cursor-pointer ${
                          activeChapterIndex === idx
                            ? 'bg-sky-600 text-white shadow-sm'
                            : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {ch.title}
                      </button>
                    ))}
                  </div>

                  {/* Chapter Manuscript Preview Sheet */}
                  <div className="bg-[#f7f0e1] dark:bg-[#151c28] text-[#342718] dark:text-slate-100 p-8 rounded-2xl border border-[#e4d4bc] dark:border-slate-800 font-amiri shadow-inner space-y-4">
                    <div className="border-b border-[#dfceb6] dark:border-slate-800 pb-3 flex items-center justify-between text-xs font-sans text-[#6e5842] dark:text-slate-400">
                      <span>{activeReadingPortalBook.sampleChapters[activeChapterIndex]?.title}</span>
                      <span>صفحة {activeReadingPortalBook.sampleChapters[activeChapterIndex]?.page}</span>
                    </div>

                    <p className="text-lg leading-loose text-justify whitespace-pre-line selection:bg-amber-300 selection:text-black">
                      {activeReadingPortalBook.sampleChapters[activeChapterIndex]?.previewText}
                    </p>

                    <div className="pt-4 border-t border-[#dfceb6] dark:border-slate-800 flex items-center justify-between text-xs font-sans text-[#6e5842] dark:text-slate-400">
                      <span>مصدر التوثيق: {selectedPortal.name}</span>
                      <span>جاهز للاستيراد الرقمي المباشر بنقرة واحدة</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Book List in this portal */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
                      <BookMarked className="w-4 h-4 text-sky-500" />
                      المصنفات والمخطوطات المتاحة في {selectedPortal.name} ({filteredPortalBooks.length})
                    </h3>
                    <span className="text-xs text-slate-500">
                      يمكنك قراءة أي كتاب أو استيراده بضغطة زر واحدة إلى المكتبة
                    </span>
                  </div>

                  {filteredPortalBooks.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
                      لا توجد نتائج مطابقة لبحثك في هذا المصدر. استخدم زر "استيراد وتوثيق كتاب" لإدخال أي عنوان آخر.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredPortalBooks.map((book) => (
                        <div
                          key={book.id}
                          className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 flex flex-col justify-between hover:border-sky-500/50 hover:shadow-md transition-all"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                                  {book.categoryName}
                                </span>
                                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm mt-1.5 line-clamp-1">
                                  {book.title}
                                </h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  المؤلف: {book.author} {book.investigator ? `• ${book.investigator}` : ''}
                                </p>
                                {/* Source Provenance Badge & Live Verification Button */}
                                <div className="flex items-center gap-2 flex-wrap text-[10px] text-slate-500 dark:text-slate-400 mt-1.5">
                                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    <span>المصدر الموثق: {book.sourcePortalName}</span>
                                  </span>

                                  {/* Live Verification Button (Phase 15.4-D) */}
                                  <button
                                    type="button"
                                    onClick={() => handleVerifyRecord(book)}
                                    disabled={verificationStates[book.id]?.loading}
                                    className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                                      verificationStates[book.id]?.status === 'VERIFIED'
                                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold'
                                        : verificationStates[book.id]?.status === 'NOT_FOUND'
                                        ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-500/30 text-rose-600 dark:text-rose-400 font-bold'
                                        : verificationStates[book.id]?.status === 'BLOCKED'
                                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold'
                                        : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-sky-500'
                                    }`}
                                    title={verificationStates[book.id]?.details || 'التحقق المباشر من وجود وصحة السجل الأصلي لدى خادم المصدر'}
                                  >
                                    {verificationStates[book.id]?.loading ? (
                                      <Loader2 className="w-3 h-3 animate-spin text-sky-500" />
                                    ) : verificationStates[book.id]?.status === 'VERIFIED' ? (
                                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                    ) : verificationStates[book.id]?.status === 'NOT_FOUND' ? (
                                      <AlertCircle className="w-3 h-3 text-rose-500" />
                                    ) : (
                                      <ShieldCheck className="w-3 h-3 text-sky-500" />
                                    )}
                                    <span>
                                      {verificationStates[book.id]?.loading
                                        ? 'جارٍ فحص المصدر...'
                                        : verificationStates[book.id]?.status === 'VERIFIED'
                                        ? '✓ موثق من المصدر'
                                        : verificationStates[book.id]?.status === 'NOT_FOUND'
                                        ? '⚠ صفحة غير موجودة (404)'
                                        : verificationStates[book.id]?.status === 'BLOCKED'
                                        ? '⚠ محظور آلياً'
                                        : 'تحقق من المصدر'}
                                    </span>
                                  </button>

                                  {book.sourceRecordUrl && (
                                    <a
                                      href={book.sourceRecordUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sky-500 hover:underline flex items-center gap-0.5"
                                    >
                                      <span>السجل الأصلي</span>
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                  )}
                                </div>
                              </div>

                              <span className="text-[11px] font-mono text-slate-400 shrink-0">
                                {book.pagesCount} صفحة
                              </span>
                            </div>

                            <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 line-clamp-2 leading-relaxed">
                              {book.summary}
                            </p>

                            {/* Tags */}
                            <div className="flex flex-wrap gap-1.5 mt-3">
                              {book.tags.map((tag, tIdx) => (
                                <span
                                  key={tIdx}
                                  className="text-[10px] bg-slate-200 dark:bg-slate-900 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-md"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                            <button
                              onClick={() => {
                                setActiveReadingPortalBook(book);
                                setActiveChapterIndex(0);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                            >
                              <BookOpen className="w-3.5 h-3.5 text-sky-500" />
                              <span>تصفح وقراءة المتن</span>
                            </button>

                            <button
                              onClick={() =>
                                setIngestionModalData({
                                  portalName: selectedPortal.name,
                                  url: book.sourceRecordUrl || selectedPortal.url,
                                  prefill: {
                                    title: book.title,
                                    author: book.author,
                                    categorySuggestion: book.categorySuggestion,
                                    summary: book.summary,
                                    pages: book.pagesCount,
                                    tags: book.tags,
                                    sourceUrl: book.sourceRecordUrl,
                                    sourcePortalId: book.portalId,
                                    sourcePortalName: book.sourcePortalName,
                                    sourceRecordId: book.id,
                                    sourceRecordUrl: book.sourceRecordUrl,
                                    sourceMethod: book.extractionMethod,
                                    sourceRetrievedAt: book.retrievedAt,
                                    verificationStatus: 'VERIFIED',
                                  },
                                })
                              }
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              <span>استيراد وتوثيق للمكتبة</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
                </>
              )}
            </div>
          )}

          {/* Mode 2: Live Embedded Browser with Sandbox and Smart Fallback */}
          {viewMode === 'browser' && (
            <div className={`flex-1 flex flex-col relative bg-slate-50 dark:bg-slate-950 ${isFullscreen ? 'h-[calc(100vh-4rem)]' : 'min-h-[580px]'}`}>
              {/* Informative Notice Bar */}
              <div className="bg-sky-500/10 border-b border-sky-500/20 px-4 py-2 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 text-xs text-sky-700 dark:text-sky-300">
                  <Sparkles className="w-4 h-4 text-sky-500 shrink-0" />
                  <span>
                    تتصفح حالياً: <strong>{selectedPortal.name}</strong> في بيئة آمنة تماماً داخل نظام المكتبة.
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {selectedPortal.status !== 'BROWSE_ONLY' && selectedPortal.integrationMethod !== 'BROWSE_ONLY' && (
                    <button
                      onClick={() => setViewMode('explorer')}
                      className="flex items-center gap-1 px-3 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Compass className="w-3.5 h-3.5 text-sky-500" />
                      <span>الانتقال للمستكشف السريع</span>
                    </button>
                  )}

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
                          sourceMethod: selectedPortal.integrationMethod || 'BROWSE_ONLY',
                          verificationStatus: 'UNVERIFIED',
                        },
                      });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>اقتراح كتاب من هذا الموقع للمكتبة</span>
                  </button>
                </div>
              </div>

              {/* Embedded Web View Frame */}
              <div className="flex-1 w-full relative h-full flex flex-col">
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
                      الرابط المدخل يحتوي على بروتوكول غير آمن أو غير مصرح به من سياسة جدار الحماية (يُسمح فقط بـ https:// و http:// المعتمدة).
                    </p>
                  </div>
                )}

                {/* Safe info bar */}
                <div className="p-3 bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-500 dark:text-slate-400 gap-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <Info className="w-3.5 h-3.5 text-sky-500" />
                    <span>
                      إذا منع الموقع الخارجي التضمين عبر أمان المتصفح (X-Frame-Options)، يمكنك التبديل إلى تبويب "المستكشف التفاعلي للمخطوطات" لتصفح كافة نصوص وكتب الموقع فورياً.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setViewMode('explorer')}
                      className="flex items-center gap-1 text-sky-600 dark:text-sky-400 font-bold hover:underline cursor-pointer"
                    >
                      <Compass className="w-3.5 h-3.5" />
                      <span>فتح المستكشف التفاعلي الكامل</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add New Portal Modal */}
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
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">اسم الموقع أو البوابة:</label>
                <input
                  type="text"
                  required
                  value={newPortalName}
                  onChange={(e) => setNewPortalName(e.target.value)}
                  placeholder="مثال: مستودع الرسائل الجامعية"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200 outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-slate-700 dark:text-slate-300 font-bold">رابط الموقع المباشر (URL):</label>
                  <button
                    type="button"
                    onClick={handleRunDiscoveryPreview}
                    disabled={!newPortalUrl.trim() || isDiscoveringPreview}
                    className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    {isDiscoveringPreview ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    <span>فحص واكتشاف البروتوكول تقنياً (Discovery)</span>
                  </button>
                </div>
                <input
                  type="url"
                  required
                  value={newPortalUrl}
                  onChange={(e) => setNewPortalUrl(e.target.value)}
                  placeholder="https://repository.example.edu"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200 outline-none focus:border-sky-500 font-mono"
                />
              </div>

              {/* Discovery Preview Output */}
              {isDiscoveringPreview && (
                <div className="p-3 bg-sky-500/10 border border-sky-500/20 rounded-xl text-sky-700 dark:text-sky-300 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-sky-500" />
                  <span>جارٍ الفحص التقني للرابط، وفحص بروتوكولات OAI-PMH وواجهات الـ REST API وجدار الحماية...</span>
                </div>
              )}

              {previewDiscoveryError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>فشل الاستكشاف: {previewDiscoveryError}</span>
                </div>
              )}

              {previewDiscoveryResult && (
                <div className={`p-3 rounded-xl border space-y-1.5 ${
                  previewDiscoveryResult.detectedMethod !== 'NONE'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-200'
                }`}>
                  <div className="flex items-center justify-between font-bold">
                    <span>نتيجة الاستكشاف الفني:</span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-slate-900 border">
                      {previewDiscoveryResult.detectedMethod}
                    </span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] space-y-0.5 opacity-90">
                    {previewDiscoveryResult.notes?.map((n: string, i: number) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                  {previewDiscoveryResult.detectedMethod === 'NONE' && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 pt-1 font-semibold">
                      ⚠️ سيتم حفظ البوابة كـ UNSUPPORTED ولن يتم تفعيلها للبحث التلقائي حتى يتم إثبات وسيلة تكامل موثوقة.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">تصنيف وتخصص البوابة العلمي:</label>
                <select
                  value={newPortalCategory}
                  onChange={(e) => setNewPortalCategory(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200 outline-none focus:border-sky-500 text-xs"
                >
                  <option value="المصادر والأبحاث الرقمية">المصادر والأبحاث الرقمية</option>
                  <option value="التراث والفقه الإسلامي">التراث والفقه الإسلامي</option>
                  <option value="المعاجم واللغة العربية">المعاجم واللغة العربية</option>
                  <option value="المناهج والأبحاث الطلابية">المناهج والأبحاث الطلابية</option>
                  <option value="المستودعات الأكاديمية والجامعية">المستودعات الأكاديمية والجامعية</option>
                  {categories
                    .filter((c) => !['المصادر والأبحاث الرقمية', 'التراث والفقه الإسلامي', 'المعاجم واللغة العربية', 'المناهج والأبحاث الطلابية', 'المستودعات الأكاديمية والجامعية'].includes(c.name))
                    .map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">النطاقات المسموحة للتصفح (مفصولة بفاصلة):</label>
                <input
                  type="text"
                  value={newPortalDomains}
                  onChange={(e) => setNewPortalDomains(e.target.value)}
                  placeholder="al-maktaba.org, shamela.ws"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200 outline-none focus:border-sky-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">نبذة تعريفية وتخصص البوابة:</label>
                <textarea
                  rows={2}
                  value={newPortalDesc}
                  onChange={(e) => setNewPortalDesc(e.target.value)}
                  placeholder="بوابة رقمية متخصصة في الفقه وأصول الاستنباط والتراث الإسلامي..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200 outline-none focus:border-sky-500 resize-none"
                />
              </div>

              {/* Classification Option */}
              <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 rounded-2xl">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newPortalIsFeatured}
                    onChange={(e) => setNewPortalIsFeatured(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                  />
                  <div className="flex-1">
                    <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                      تعيين هذا الموقع كوسم «رئيسي» (مصدر مرجعي أساسي)
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                      المواقع الموسومة بـ «رئيسي» تظهر في مقدمة البوابات المعتمدة كأولوية للمطالعة والبحث الأكاديمي الشامل.
                    </p>
                  </div>
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddPortalOpen(false);
                    setPreviewDiscoveryResult(null);
                    setPreviewDiscoveryError(null);
                  }}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold shadow-md shadow-sky-600/30 cursor-pointer"
                >
                  اعتماد الموقع والبدء في الفحص
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Phase 15.4-D: Technical Onboarding 12-Test Report Modal */}
      {activeTestReport && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-sky-500/10 text-sky-500 rounded-xl">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                    تقرير الفحص الفني المعتمد للبوابة (12 اختباراً)
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">{activeTestReport.portalName} ({activeTestReport.url})</p>
                </div>
              </div>
              <button onClick={() => setActiveTestReport(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Verdict banner */}
            <div className={`p-4 rounded-2xl border flex items-center justify-between ${
              activeTestReport.suggestedStatus === 'VERIFIED'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
            }`}>
              <div>
                <h4 className="font-bold text-sm">
                  الحالة الفنية للبوابة: {activeTestReport.suggestedStatus}
                </h4>
                <p className="text-xs opacity-90 mt-0.5">
                  طريقة التكامل المعتمدة: {activeTestReport.suggestedMethod}
                </p>
                {activeTestReport.failureReason && (
                  <p className="text-xs text-rose-600 dark:text-rose-400 mt-1 font-semibold">
                    {activeTestReport.failureReason}
                  </p>
                )}
              </div>
              <div className="text-right">
                <span className="text-xs font-mono font-bold">
                  {activeTestReport.checks.filter((c: any) => c.passed).length} / {activeTestReport.checks.length} ناجح
                </span>
              </div>
            </div>

            {/* Checks list */}
            <div className="space-y-2 text-xs">
              {activeTestReport.checks.map((check: any, idx: number) => (
                <div
                  key={check.id || idx}
                  className={`p-3 rounded-xl border flex items-start justify-between gap-3 ${
                    check.passed
                      ? 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800'
                      : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50'
                  }`}
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      {check.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      )}
                      <span className="font-bold text-slate-800 dark:text-slate-200">{check.name}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mr-6">
                      {check.description}
                    </p>
                    {check.details && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 font-mono mr-6">
                        {check.details}
                      </p>
                    )}
                    {check.error && (
                      <p className="text-[11px] text-rose-600 dark:text-rose-400 mr-6 font-semibold">
                        خطأ: {check.error}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 shrink-0">
                    {check.durationMs}ms
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveTestReport(null)}
                className="px-5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold"
              >
                إغلاق التقرير
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Existing Whitelisted Portal Modal */}
      {editingPortal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                    تعديل بيانات الموقع المعتمد
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    تحديث الاسم، الرابط، النطاقات المصرح بها، وتصنيف المصدر
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingPortal(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditPortal} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">اسم الموقع / البوابة:</label>
                <input
                  type="text"
                  required
                  value={editPortalName}
                  onChange={(e) => setEditPortalName(e.target.value)}
                  placeholder="مثال: المكتبة الشاملة الحديثة"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">رابط الموقع المباشر (URL):</label>
                <input
                  type="url"
                  required
                  value={editPortalUrl}
                  onChange={(e) => setEditPortalUrl(e.target.value)}
                  placeholder="https://al-maktaba.org"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">تصنيف وتخصص البوابة العلمي:</label>
                <select
                  value={editPortalCategory}
                  onChange={(e) => setEditPortalCategory(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 text-xs"
                >
                  <option value="المصادر والأبحاث الرقمية">المصادر والأبحاث الرقمية</option>
                  <option value="التراث والفقه الإسلامي">التراث والفقه الإسلامي</option>
                  <option value="المعاجم واللغة العربية">المعاجم واللغة العربية</option>
                  <option value="المناهج والأبحاث الطلابية">المناهج والأبحاث الطلابية</option>
                  <option value="المستودعات الأكاديمية والجامعية">المستودعات الأكاديمية والجامعية</option>
                  {categories
                    .filter((c) => !['المصادر والأبحاث الرقمية', 'التراث والفقه الإسلامي', 'المعاجم واللغة العربية', 'المناهج والأبحاث الطلابية', 'المستودعات الأكاديمية والجامعية'].includes(c.name))
                    .map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">النطاقات المسموحة للتصفح (مفصولة بفاصلة):</label>
                <input
                  type="text"
                  value={editPortalDomains}
                  onChange={(e) => setEditPortalDomains(e.target.value)}
                  placeholder="al-maktaba.org, shamela.ws"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">نبذة تعريفية وتخصص البوابة:</label>
                <textarea
                  rows={2}
                  value={editPortalDesc}
                  onChange={(e) => setEditPortalDesc(e.target.value)}
                  placeholder="بوابة رقمية متخصصة في الفقه وأصول الاستنباط والتراث الإسلامي..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              {/* Classification Option: Primary/Featured vs Specialized */}
              <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 rounded-2xl">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editPortalIsFeatured}
                    onChange={(e) => setEditPortalIsFeatured(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                  />
                  <div className="flex-1">
                    <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                      تعيين هذا الموقع كوسم «رئيسي» (مصدر مرجعي أساسي)
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                      المواقع الموسومة بـ «رئيسي» تظهر في مقدمة البوابات المعتمدة كأولوية للمطالعة والبحث الأكاديمي الشامل، بينما المواقع غير المحددة تصنف كبوابات تخصصية وفرعية.
                    </p>
                  </div>
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPortalToDelete(editingPortal);
                  }}
                  className="px-3.5 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>حذف الموقع</span>
                </button>
                <div className="flex items-center gap-2 mr-auto">
                  <button
                    type="button"
                    onClick={() => setEditingPortal(null)}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-md shadow-indigo-600/30 cursor-pointer"
                  >
                    حفظ التعديلات
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Portal Confirmation Modal (Safe In-App Dialog) */}
      {portalToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="p-3 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                  تأكيد حذف الموقع المعتمد
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  إزالة الموقع من قائمة البوابات المصرح بها
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">اسم الموقع:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">{portalToDelete.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">الرابط:</span>
                <span className="font-mono text-sky-600 dark:text-sky-400 truncate max-w-[200px]">{portalToDelete.url}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              هل أنت متأكد من رغبتك في حذف هذا الموقع من قائمة المواقع المعتمدة؟ سيتم إزالته من البوابات الموثقة مباشرة.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setPortalToDelete(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  const idToDelete = portalToDelete.id;
                  onDeletePortal(idToDelete);
                  if (selectedPortal?.id === idToDelete) {
                    const remaining = portals.filter((p) => p.id !== idToDelete);
                    setSelectedPortal(remaining[0] || ({} as WhitelistedPortal));
                  }
                  if (editingPortal?.id === idToDelete) {
                    setEditingPortal(null);
                  }
                  setPortalToDelete(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/30 cursor-pointer transition-colors"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Book Ingestion Modal with Strict Provenance & Feedback */}
      {ingestionModalData && (
        <BookIngestionModal
          isOpen={!!ingestionModalData}
          currentUser={currentUser}
          sourcePortalName={ingestionModalData.portalName || selectedPortal.name}
          categories={categories}
          initialUrl={ingestionModalData.url}
          prefillData={ingestionModalData.prefill}
          onClose={() => setIngestionModalData(null)}
          onSubmit={async (data) => {
            return onSubmitIngestion(data);
          }}
        />
      )}
    </div>
  );
};
