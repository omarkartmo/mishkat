import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  FolderOpen,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  HardDrive,
  Scan,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Copy,
  Inbox,
} from 'lucide-react';
import { apiClient } from '../../services/apiClient';

interface StagingQueueItem {
  id: string;
  originalFilename: string;
  source: string;
  format: 'pdf' | 'epub';
  fileSizeMb: number;
  fileHash: string;
  title: string;
  author: string;
  categoryId: string | null;
  confidence: number;
  status: 'PENDING_REVIEW' | 'IMPORTING' | 'IMPORTED' | 'REJECTED' | 'DUPLICATE' | 'ERROR';
  duplicateReason: string | null;
  adminNotes: string | null;
  queuedAt: string;
  reviewedAt: string | null;
}

interface WatcherStatus {
  isActive: boolean;
  incomingDir: string;
  startedAt: string | null;
  pendingFiles: number;
  lastScanAt: string | null;
  lastScanResult: string | null;
}

interface IncomingStatusResponse {
  watcher: WatcherStatus;
  queue: StagingQueueItem[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING_REVIEW: { label: 'بانتظار المراجعة', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  IMPORTING: { label: 'قيد الاستيراد', color: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
  IMPORTED: { label: 'تم الاستيراد', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  REJECTED: { label: 'مرفوض', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  DUPLICATE: { label: 'مكرر', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  ERROR: { label: 'خطأ', color: 'bg-red-500/20 text-red-300 border-red-500/30' },
};

const SOURCE_LABELS: Record<string, string> = {
  incoming_watcher: 'مراقب المجلد (Watcher)',
  bulk_upload: 'رفع جماعي',
  bulk_scan: 'فحص جماعي',
  manual_scan: 'فحص يدوي',
};

interface ImportItemModalProps {
  item: StagingQueueItem;
  categories: { id: string; name: string }[];
  onConfirm: (itemId: string, meta: any) => Promise<void>;
  onCancel: () => void;
}

const ImportItemModal: React.FC<ImportItemModalProps> = ({ item, categories, onConfirm, onCancel }) => {
  const [title, setTitle] = useState(item.title || item.originalFilename.replace(/\.[^.]+$/, ''));
  const [author, setAuthor] = useState(item.author || '');
  const [categoryId, setCategoryId] = useState(item.categoryId || categories[0]?.id || '');
  const [language, setLanguage] = useState('العربية');
  const [summary, setSummary] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200] p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full shadow-2xl p-5 space-y-4 text-xs">
        <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          تأكيد استيراد: {item.originalFilename}
        </h3>

        <div className="space-y-3">
          <div>
            <label className="block text-slate-300 font-medium mb-1">عنوان الكتاب *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-emerald-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">المؤلف</label>
              <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">التصنيف</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-emerald-500">
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">اللغة</label>
              <input type="text" value={language} onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-emerald-500" />
            </div>
          </div>
          <div>
            <label className="block text-slate-300 font-medium mb-1">نبذة</label>
            <textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-emerald-500 resize-none" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
          <button type="button" onClick={onCancel} disabled={isSubmitting}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium cursor-pointer">
            إلغاء
          </button>
          <button
            type="button"
            disabled={isSubmitting || !title.trim()}
            onClick={async () => {
              setIsSubmitting(true);
              await onConfirm(item.id, { title, author, categoryId, language, summary });
              setIsSubmitting(false);
            }}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl font-semibold flex items-center gap-2 cursor-pointer transition-all"
          >
            {isSubmitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />استيراد...</> : <><CheckCircle2 className="w-3.5 h-3.5" />استيراد إلى المكتبة</>}
          </button>
        </div>
      </div>
    </div>
  );
};

interface Props {
  categories: { id: string; name: string }[];
}

export const IngestionObservabilityPanel: React.FC<Props> = ({ categories }) => {
  const [data, setData] = useState<IncomingStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [importingItem, setImportingItem] = useState<StagingQueueItem | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get<IncomingStatusResponse>('/system/incoming-status');
      if (res.success && res.data) {
        setData(res.data);
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  const handleScanNow = async () => {
    setIsScanning(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await apiClient.post<any>('/system/incoming-scan');
      if (res.success) {
        setActionSuccess((res as any).message || 'تم الفحص بنجاح');
        await loadStatus();
      } else {
        setActionError(res.error?.message || 'فشل الفحص');
      }
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsScanning(false);
    }
  };

  const handleReject = async (itemId: string, filename: string) => {
    if (!confirm(`تأكيد رفض: ${filename}؟`)) return;
    setActionError(null);
    try {
      const res = await apiClient.post(`/system/staging-queue/${itemId}/reject`);
      if (res.success) {
        setActionSuccess(`تم رفض: ${filename}`);
        await loadStatus();
      } else {
        setActionError(res.error?.message || 'فشل الرفض');
      }
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleImportConfirm = async (itemId: string, meta: any) => {
    setActionError(null);
    try {
      const res = await apiClient.post(`/system/staging-queue/${itemId}/import`, meta);
      if (res.success) {
        setActionSuccess(`تم استيراد: ${meta.title}`);
        setImportingItem(null);
        await loadStatus();
      } else {
        setActionError(res.error?.message || 'فشل الاستيراد');
        setImportingItem(null);
      }
    } catch (err: any) {
      setActionError(err.message);
      setImportingItem(null);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pendingCount = data?.queue.filter((q) => q.status === 'PENDING_REVIEW').length ?? 0;

  return (
    <div className="space-y-4">
      {/* Import modal */}
      {importingItem && (
        <ImportItemModal
          item={importingItem}
          categories={categories}
          onConfirm={handleImportConfirm}
          onCancel={() => setImportingItem(null)}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            مراقبة خط استيراد الكتب الرقمية (Ingestion Pipeline)
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            مراقبة حالة الواردة، طابور المراجعة، وإجراء الاستيراد أو الرفض على مستوى كل ملف
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadStatus}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            تحديث
          </button>
          <button
            onClick={handleScanNow}
            disabled={isScanning}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors"
          >
            <Scan className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            {isScanning ? 'جاري الفحص...' : 'فحص مجلد الواردة الآن'}
          </button>
        </div>
      </div>

      {/* Action feedback */}
      {actionSuccess && (
        <div className="p-2.5 bg-emerald-950/50 border border-emerald-800/60 rounded-xl text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />{actionSuccess}
        </div>
      )}
      {actionError && (
        <div className="p-2.5 bg-rose-950/50 border border-rose-800/60 rounded-xl text-rose-200 text-xs flex items-center gap-2">
          <XCircle className="w-3.5 h-3.5 shrink-0" />{actionError}
        </div>
      )}

      {/* Watcher Status Card */}
      {data && (
        <div className={`p-4 rounded-2xl border text-xs space-y-2 ${data.watcher.isActive ? 'bg-emerald-950/30 border-emerald-800/50' : 'bg-slate-900/80 border-slate-800'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-slate-100 text-sm">
              <div className={`w-2 h-2 rounded-full ${data.watcher.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              {data.watcher.isActive ? 'مراقب الواردة نشط' : 'مراقب الواردة متوقف'}
            </div>
            {pendingCount > 0 && (
              <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg font-bold">
                {pendingCount} بانتظار المراجعة
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-slate-400 font-mono text-[11px]">
            <span>مجلد الواردة:</span>
            <span className="text-slate-200 truncate flex items-center gap-1" title={data.watcher.incomingDir}>
              <FolderOpen className="w-3 h-3 text-amber-400 shrink-0" />
              {data.watcher.incomingDir.split(/[/\\]/).slice(-3).join('/')}
            </span>

            {data.watcher.startedAt && (
              <>
                <span>بدأ في:</span>
                <span className="text-slate-300">{new Date(data.watcher.startedAt).toLocaleString('ar-SA')}</span>
              </>
            )}

            {data.watcher.lastScanAt && (
              <>
                <span>آخر فحص:</span>
                <span className="text-slate-300">{new Date(data.watcher.lastScanAt).toLocaleString('ar-SA')}</span>
              </>
            )}

            {data.watcher.lastScanResult && (
              <>
                <span>نتيجة الفحص:</span>
                <span className="text-emerald-300">{data.watcher.lastScanResult}</span>
              </>
            )}

            <span>ملفات قيد المعالجة:</span>
            <span className={data.watcher.pendingFiles > 0 ? 'text-amber-300' : 'text-slate-300'}>
              {data.watcher.pendingFiles}
            </span>
          </div>
        </div>
      )}

      {/* Staging Queue */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <Inbox className="w-3.5 h-3.5 text-sky-400" />
            طابور المراجعة ({data?.queue.length ?? 0} عنصر)
          </h4>
        </div>

        {!data || data.queue.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs bg-slate-900/60 border border-slate-800 rounded-2xl">
            {isLoading ? 'جاري تحميل طابور المراجعة...' : 'لا توجد ملفات في طابور المراجعة حالياً.'}
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[480px] overflow-y-auto">
            {data.queue.map((item) => {
              const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.ERROR;
              const isExpanded = expandedItems.has(item.id);
              const isPending = item.status === 'PENDING_REVIEW';

              return (
                <div key={item.id}
                  className={`bg-slate-900 border rounded-xl overflow-hidden transition-all ${isPending ? 'border-amber-800/40' : 'border-slate-800/70'}`}>
                  {/* Row header */}
                  <div className="flex items-center gap-2 p-3 text-xs">
                    <div className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                      <FileText className="w-3.5 h-3.5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-100 truncate" title={item.originalFilename}>
                        {item.title || item.originalFilename}
                      </p>
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-0.5 font-mono">
                        <span>{SOURCE_LABELS[item.source] || item.source}</span>
                        <span>•</span>
                        <span>{item.format?.toUpperCase()}</span>
                        {item.fileSizeMb && <><span>•</span><span>{item.fileSizeMb} MB</span></>}
                        <span>•</span>
                        <span>{new Date(item.queuedAt).toLocaleString('ar-SA')}</span>
                      </div>
                    </div>

                    {/* Confidence badge */}
                    {item.status === 'PENDING_REVIEW' && (
                      <div className="shrink-0 text-center">
                        <div className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded ${item.confidence >= 70 ? 'text-emerald-300' : item.confidence >= 40 ? 'text-amber-300' : 'text-rose-300'}`}>
                          {item.confidence}%
                        </div>
                        <div className="text-[9px] text-slate-500">ثقة</div>
                      </div>
                    )}

                    {/* Status badge */}
                    <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-lg border font-semibold ${cfg.color}`}>
                      {cfg.label}
                    </span>

                    {/* Actions */}
                    {isPending && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => setImportingItem(item)}
                          className="px-2.5 py-1 bg-emerald-600/80 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <CheckCircle2 className="w-3 h-3" />استيراد
                        </button>
                        <button
                          onClick={() => handleReject(item.id, item.originalFilename)}
                          className="px-2.5 py-1 bg-rose-900/40 hover:bg-rose-700 text-rose-300 hover:text-white rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <XCircle className="w-3 h-3" />رفض
                        </button>
                      </div>
                    )}

                    <button
                      onClick={() => toggleExpand(item.id)}
                      className="p-1 text-slate-500 hover:text-slate-300 cursor-pointer shrink-0"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t border-slate-800/60 p-3 bg-slate-950/50 text-[11px] font-mono space-y-1 text-slate-400">
                      <div className="flex gap-2"><span className="text-slate-500 w-24 shrink-0">الاسم الأصلي:</span><span className="text-slate-300 break-all">{item.originalFilename}</span></div>
                      {item.author && <div className="flex gap-2"><span className="text-slate-500 w-24 shrink-0">المؤلف:</span><span className="text-slate-300">{item.author}</span></div>}
                      {item.fileHash && (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 w-24 shrink-0">SHA-256:</span>
                          <span className="text-emerald-400 truncate flex-1" title={item.fileHash}>{item.fileHash.substring(0, 32)}…</span>
                          <button
                            onClick={() => navigator.clipboard.writeText(item.fileHash)}
                            className="text-slate-500 hover:text-slate-300 cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                      {item.duplicateReason && <div className="flex gap-2"><span className="text-slate-500 w-24 shrink-0">سبب التكرار:</span><span className="text-purple-300">{item.duplicateReason}</span></div>}
                      {item.adminNotes && <div className="flex gap-2"><span className="text-slate-500 w-24 shrink-0">ملاحظات:</span><span className="text-slate-300">{item.adminNotes}</span></div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
