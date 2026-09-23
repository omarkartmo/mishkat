import React, { useState, useEffect } from 'react';
import {
  Server,
  Activity,
  HardDrive,
  Database,
  Cloud,
  Users,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Clock,
  ShieldCheck,
  ShieldAlert,
  ArrowUpCircle,
  Laptop,
  ChevronDown,
  ChevronUp,
  FileText,
  AlertCircle,
  HelpCircle,
  X,
  Send,
  Inbox,
  Camera,
  Image as ImageIcon,
  Trash2,
  Globe,
  Check,
  Edit3,
} from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { telemetryService } from '../../services/telemetry/telemetryService';

interface HealthData {
  health: {
    status: 'healthy' | 'degraded' | 'critical';
    service: {
      name: string;
      uptimeSeconds: number;
      memoryUsageMb: number;
      pid: number;
      nodeVersion: string;
      platform: string;
    };
    database: {
      status: 'connected' | 'error';
      engine: string;
      latencyMs: number;
      tableCounts: {
        books: number;
        users: number;
        activeLoans: number;
        telemetryEvents: number;
      };
    };
    storage: {
      libraryDataPath: string;
      libraryDataSizeMb: number;
      diskFreeSpaceMb: number;
      diskTotalSpaceMb: number;
      isWritable: boolean;
    };
    backups: {
      localBackupsCount: number;
      latestLocalBackupTime: string | null;
      googleDriveConnected: boolean;
      googleDriveAccount: string | null;
      latestCloudBackupTime: string | null;
      retentionPolicy: string;
    };
  };
  students: {
    connectedNowCount: number;
    seenTodayCount: number;
    totalRegisteredCount: number;
  };
}

interface AggregatedError {
  signature: string;
  sourceType?: 'student' | 'server';
  category?: 'automatic' | 'manual';
  eventType: string;
  errorCode: string;
  severity: 'critical' | 'warning' | 'info';
  occurrenceCount: number;
  affectedClientsCount: number;
  affectedClientIds: string[];
  affectedAppVersions: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  sampleMessage: string;
  sampleStackTrace?: string;
  recentRoute?: string;
}

interface ClientStation {
  clientId: string;
  machineName: string;
  appVersion: string;
  osVersion: string;
  ipAddress: string;
  lastSeenAt: string;
  isOnline: boolean;
  todayErrorsCount: number;
}

interface OutboundQueueSummary {
  pendingCount: number;
  sentCount: number;
  failedCount: number;
  totalCount: number;
}

export const SystemSupportDashboard: React.FC = () => {
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [aggregatedErrors, setAggregatedErrors] = useState<AggregatedError[]>([]);
  const [clientStations, setClientStations] = useState<ClientStation[]>([]);
  const [outboundQueue, setOutboundQueue] = useState<OutboundQueueSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modal states for Reporting a Problem
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [problemDescription, setProblemDescription] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isCompressingImage, setIsCompressingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [expandedSignature, setExpandedSignature] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'errors' | 'clients' | 'updater'>('overview');
  const [errorSourceFilter, setErrorSourceFilter] = useState<'all' | 'student' | 'server'>('all');
  const [errorCategoryFilter, setErrorCategoryFilter] = useState<'all' | 'automatic' | 'manual'>('all');

  // Updater state
  const [updateStatus, setUpdateStatus] = useState<any>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  // Support Server Endpoint State
  const [supportEndpoint, setSupportEndpoint] = useState<string>('http://127.0.0.1:4000');
  const [endpointInput, setEndpointInput] = useState<string>('http://127.0.0.1:4000');
  const [isEditingEndpoint, setIsEditingEndpoint] = useState(false);
  const [isSavingEndpoint, setIsSavingEndpoint] = useState(false);
  const [isTestingEndpoint, setIsTestingEndpoint] = useState(false);
  const [testResult, setTestResult] = useState<{ reachable: boolean; latencyMs?: number; error?: string } | null>(null);

  const fetchDashboardData = async () => {
    try {
      const [healthRes, errorsRes, clientsRes, updaterRes, queueRes, endpointRes] = await Promise.all([
        apiClient.get<HealthData>('/support/health-summary'),
        apiClient.get<AggregatedError[]>('/support/aggregated-errors'),
        apiClient.get<{ clients: ClientStation[] }>('/support/clients'),
        apiClient.get<any>('/support/updater/status').catch(() => ({ success: false, data: null })),
        apiClient.get<OutboundQueueSummary>('/support/outbound-queue').catch(() => ({ success: false, data: null })),
        apiClient.get<{ supportApiUrl: string }>('/support/endpoint').catch(() => ({ success: false, data: null })),
      ]);

      if (healthRes.success && healthRes.data) {
        setHealthData(healthRes.data);
      }
      if (errorsRes.success && errorsRes.data) {
        setAggregatedErrors(errorsRes.data);
      }
      if (clientsRes.success && clientsRes.data?.clients) {
        setClientStations(clientsRes.data.clients);
      }
      if (updaterRes.success && updaterRes.data) {
        setUpdateStatus(updaterRes.data);
      }
      if (queueRes && queueRes.success && queueRes.data) {
        setOutboundQueue(queueRes.data);
      }
      if (endpointRes && endpointRes.success && endpointRes.data?.supportApiUrl) {
        setSupportEndpoint(endpointRes.data.supportApiUrl);
        setEndpointInput((prev) => (isEditingEndpoint ? prev : endpointRes.data.supportApiUrl));
      }
    } catch (err) {
      console.error('Failed to load support dashboard:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    // Auto refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchDashboardData();
  };

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    try {
      const res = await apiClient.post<any>('/support/updater/check', {});
      if (res.success && res.data) {
        setUpdateStatus((prev: any) => ({
          ...prev,
          availableVersion: res.data.latestRelease?.version || null,
          latestRelease: res.data.latestRelease || null,
          message: res.data.hasUpdate
            ? `يتوفر تحديث معتمد: ${res.data.latestRelease.version}`
            : 'النظام محدث إلى أحدث إصدار.',
        }));
      }
    } catch {
      // Handled cleanly
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleApplyUpdate = async () => {
    if (!updateStatus?.latestRelease) return;
    setIsCheckingUpdate(true);
    try {
      const res = await apiClient.post<any>('/support/updater/apply', {
        downloadUrl: updateStatus.latestRelease.downloadUrl,
        expectedSha256: updateStatus.latestRelease.sha256,
      });
      if (res.success) {
        alert('تم تحميل حزمة التحديث بنجاح، جاري إعادة التشغيل لتطبيق التحديث...');
      } else {
        alert(res.error?.message || 'فشل التحديث');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء التحديث');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const [isFlushingQueue, setIsFlushingQueue] = useState(false);
  const [flushResult, setFlushResult] = useState<string | null>(null);

  const handleTestConnection = async (targetUrl?: string) => {
    setIsTestingEndpoint(true);
    setTestResult(null);
    try {
      const urlToTest = targetUrl || (isEditingEndpoint ? endpointInput : supportEndpoint);
      const res = await apiClient.post<any>('/support/test-connection', { endpoint: urlToTest });
      if (res.success && res.data) {
        setTestResult(res.data);
      } else {
        setTestResult({ reachable: false, error: res.error?.message || 'فشل الاتصال' });
      }
    } catch (err: any) {
      setTestResult({ reachable: false, error: err.message || 'تعذر الاتصال بالسيرفر' });
    } finally {
      setIsTestingEndpoint(false);
    }
  };

  const handleSaveEndpoint = async () => {
    if (!endpointInput.trim()) return;
    setIsSavingEndpoint(true);
    try {
      const res = await apiClient.post<any>('/support/endpoint', { supportApiUrl: endpointInput.trim() });
      if (res.success) {
        const savedUrl = res.data?.url || endpointInput.trim();
        setSupportEndpoint(savedUrl);
        setIsEditingEndpoint(false);
        await handleTestConnection(savedUrl);
      } else {
        alert(res.error?.message || 'فشل حفظ العنوان');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء حفظ العنوان');
    } finally {
      setIsSavingEndpoint(false);
    }
  };

  const handleFlushQueue = async () => {
    setIsFlushingQueue(true);
    setFlushResult(null);
    try {
      const res = await apiClient.post<any>('/support/flush-queue', { endpoint: supportEndpoint });
      if (res.success && res.data) {
        if (res.data.summary) {
          setOutboundQueue(res.data.summary);
        }
        setFlushResult(`تم الإرسال: ${res.data.sent} ناجح، ${res.data.failed} فاشل`);
      } else {
        setFlushResult('فشل تفريغ الطابور');
      }
    } catch (err: any) {
      setFlushResult(err.message || 'تعذر الاتصال بمركز دعم المطور');
    } finally {
      setIsFlushingQueue(false);
      setTimeout(() => setFlushResult(null), 5000);
    }
  };

  // Helper to compress and convert image file to base64 jpeg
  const processImageFile = (file: File | Blob) => {
    if (!file || !file.type.startsWith('image/')) return;
    setIsCompressingImage(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_DIM = 1280;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.7);
          setScreenshot(compressed);
        }
        setIsCompressingImage(false);
      };
      img.onerror = () => setIsCompressingImage(false);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => setIsCompressingImage(false);
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          processImageFile(file);
          break;
        }
      }
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!problemDescription.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await apiClient.post<any>('/support/report-problem', {
        problemDescription: problemDescription.trim(),
        screen: 'SystemSupportDashboard',
        screenshot: screenshot || null,
      });

      if (res.success) {
        setSubmitSuccess(true);
        setTimeout(() => {
          handleFlushQueue();
          fetchDashboardData();
        }, 800);

        setTimeout(() => {
          setIsReportModalOpen(false);
          setProblemDescription('');
          setScreenshot(null);
          setSubmitSuccess(false);
          setIsSubmitting(false);
        }, 1500);
      } else {
        alert(res.error?.message || 'فشل إرسال البلاغ');
        setIsSubmitting(false);
      }
    } catch (err: any) {
      alert(err.message || 'تعذر إرسال البلاغ');
      setIsSubmitting(false);
    }
  };

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d} يوم و ${h} ساعة`;
    if (h > 0) return `${h} ساعة و ${m} دقيقة`;
    return `${m} دقيقة`;
  };

  const h = healthData?.health;
  const s = healthData?.students;

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6 animate-fade-in text-slate-100 pb-10">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-100">صحة النظام والدعم الفني (System Health & Support)</h1>
              <p className="text-xs text-slate-400">
                مراقبة مركزية لحالة خادم MISHKAT، وقاعدة البيانات، والنسخ الاحتياطية، وأجهزة الطلاب المتصلة
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                h?.status === 'healthy' ? 'bg-emerald-400' : h?.status === 'degraded' ? 'bg-amber-400' : 'bg-rose-500'
              }`}
            />
            <span className="font-semibold text-slate-200">
              {h?.status === 'healthy' ? 'الخادم في حالة ممتازة' : h?.status === 'degraded' ? 'تنبيه: أداء منخفض' : 'حالة حرجة'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsReportModalOpen(true)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer border border-slate-700 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>إبلاغ عن مشكلة</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('overview')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
            activeSubTab === 'overview'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          نظرة عامة على الخادم
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('errors')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 ${
            activeSubTab === 'errors'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <span>الأخطاء المجمعة (Aggregated Errors)</span>
          {aggregatedErrors.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500/20 text-rose-300 font-mono">
              {aggregatedErrors.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('clients')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 ${
            activeSubTab === 'clients'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <span>أجهزة الطلاب المتصلة</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-500/20 text-purple-300 font-mono">
            {s?.connectedNowCount || 0}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('updater')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
            activeSubTab === 'updater'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          المحدث التلقائي (Updater)
        </button>
      </div>

      {/* Sub-Tab 1: Overview */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Server Service Card */}
            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>خدمة ويندوز المركزية</span>
                <Server className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-lg font-bold text-slate-100">{h?.service.name}</div>
              <div className="text-xs text-slate-400 space-y-0.5">
                <div>مدة التشغيل: <span className="text-slate-200">{formatUptime(h?.service.uptimeSeconds || 0)}</span></div>
                <div>الذاكرة: <span className="text-slate-200">{h?.service.memoryUsageMb} MB</span></div>
                <div>المنصة: <span className="text-slate-300 font-mono text-[11px]">{h?.service.platform}</span></div>
              </div>
            </div>

            {/* Database Card */}
            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>قاعدة البيانات المركزية</span>
                <Database className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-lg font-bold text-slate-100">{h?.database.engine}</div>
              <div className="text-xs text-slate-400 space-y-0.5">
                <div>زمن الاستجابة: <span className="text-slate-200 font-mono">{h?.database.latencyMs}ms</span></div>
                <div>إجمالي الكتب: <span className="text-slate-200 font-bold">{h?.database.tableCounts.books}</span></div>
                <div>المستخدمون: <span className="text-slate-200">{h?.database.tableCounts.users}</span> | إعارات نشطة: <span className="text-slate-200">{h?.database.tableCounts.activeLoans}</span></div>
              </div>
            </div>

            {/* Storage Card */}
            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>وحدة التخزين والمساحة</span>
                <HardDrive className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-lg font-bold text-slate-100">{h?.storage.libraryDataSizeMb} MB</div>
              <div className="text-xs text-slate-400 space-y-0.5">
                <div>المساحة المتاحة على القرص: <span className="text-emerald-400 font-bold">{h?.storage.diskFreeSpaceMb} MB</span></div>
                <div>حالة الكتابة: <span className="text-emerald-400">{h?.storage.isWritable ? 'جاهزة وقابلة للكتابة' : 'خطأ'}</span></div>
                <div>المسار: <span className="font-mono text-[10px] text-slate-400 truncate block">{h?.storage.libraryDataPath}</span></div>
              </div>
            </div>

            {/* Backups Card */}
            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>منظومة النسخ الاحتياطي</span>
                <Cloud className="w-4 h-4 text-sky-400" />
              </div>
              <div className="text-lg font-bold text-slate-100">
                {h?.backups.googleDriveConnected ? '✓ متصل بـ Drive' : 'نسخ محلي فقط'}
              </div>
              <div className="text-xs text-slate-400 space-y-0.5">
                <div>النسخ المحلية: <span className="text-slate-200 font-bold">{h?.backups.localBackupsCount} / 7</span></div>
                <div>سياسة الاستبقاء: <span className="text-slate-300 text-[11px]">{h?.backups.retentionPolicy}</span></div>
                {h?.backups.googleDriveAccount && (
                  <div className="truncate font-mono text-[10px] text-sky-300">{h.backups.googleDriveAccount}</div>
                )}
              </div>
            </div>
          </div>

          {/* Student Activity Summary */}
          <div className="p-5 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                <Users className="w-4 h-4 text-purple-400" />
                <span>نشاط أجهزة الطلاب المتصلة (Connected Student Stations)</span>
              </div>
              <span className="text-xs text-slate-400">
                {s?.connectedNowCount} متصل الآن من إجمالي {s?.totalRegisteredCount} جهاز مسجل
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div className="text-xl font-bold text-emerald-400">{s?.connectedNowCount}</div>
                <div className="text-xs text-slate-400">متصل بالشبكة الآن</div>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div className="text-xl font-bold text-indigo-400">{s?.seenTodayCount}</div>
                <div className="text-xs text-slate-400">نشط خلال اليوم</div>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div className="text-xl font-bold text-slate-200">{s?.totalRegisteredCount}</div>
                <div className="text-xs text-slate-400">إجمالي الأجهزة المعتمدة</div>
              </div>
            </div>
          </div>

          {/* Outbound Support Queue Panel */}
          <div className="p-5 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                <Inbox className="w-4 h-4 text-sky-400" />
                <span>طابور التقارير الصادرة (Outbound Report Queue)</span>
              </div>
              <span className="text-xs text-slate-400">
                {outboundQueue
                  ? `${outboundQueue.totalCount} تقرير في الطابور`
                  : 'جاري التحميل...'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div className="text-xl font-bold text-amber-400">{outboundQueue?.pendingCount ?? '-'}</div>
                <div className="text-xs text-slate-400">معلّق الإرسال</div>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div className="text-xl font-bold text-emerald-400">{outboundQueue?.sentCount ?? '-'}</div>
                <div className="text-xs text-slate-400">تم إرساله</div>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div className={`text-xl font-bold ${
                  (outboundQueue?.failedCount ?? 0) > 0 ? 'text-rose-400' : 'text-slate-500'
                }`}>{outboundQueue?.failedCount ?? '-'}</div>
                <div className="text-xs text-slate-400">فشل الإرسال</div>
              </div>
            </div>

            {/* Developer Support Server Connection Bar */}
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <Globe className="w-3.5 h-3.5 text-indigo-400" />
                  <span>عنوان خادم المطور (Support Server URL):</span>
                  {!isEditingEndpoint && (
                    <span className="font-mono text-[11px] text-indigo-300 bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-800/40">
                      {supportEndpoint}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {testResult && (
                    <div className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border ${
                      testResult.reachable
                        ? 'text-emerald-400 bg-emerald-950/50 border-emerald-800/40'
                        : 'text-rose-400 bg-rose-950/50 border-rose-800/40'
                    }`}>
                      {testResult.reachable ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>متصل بنجاح ({testResult.latencyMs}ms)</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3 h-3 text-rose-400" />
                          <span title={testResult.error}>فشل الاتصال: {testResult.error ? testResult.error.slice(0, 45) : ''}...</span>
                        </>
                      )}
                    </div>
                  )}

                  {!isEditingEndpoint ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleTestConnection()}
                        disabled={isTestingEndpoint}
                        className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium cursor-pointer transition-colors disabled:opacity-50"
                        title="اختبار الاتصال بسيرفر دعم المطور"
                      >
                        <RefreshCw className={`w-3 h-3 ${isTestingEndpoint ? 'animate-spin' : ''}`} />
                        <span>{isTestingEndpoint ? 'جاري الفحص...' : 'اختبار الاتصال'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEndpointInput(supportEndpoint);
                          setIsEditingEndpoint(true);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                        title="تغيير رابط أو IP سيرفر الدعم"
                      >
                        <Edit3 className="w-3 h-3 text-slate-400" />
                        <span>تعديل</span>
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {isEditingEndpoint && (
                <div className="flex items-center gap-2 pt-1 border-t border-slate-800/50">
                  <input
                    type="text"
                    value={endpointInput}
                    onChange={(e) => setEndpointInput(e.target.value)}
                    placeholder="مثال: http://192.168.1.15:4000 أو http://127.0.0.1:4000"
                    className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={handleSaveEndpoint}
                    disabled={isSavingEndpoint || !endpointInput.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isSavingEndpoint ? 'جاري الحفظ...' : 'حفظ واختبار'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEndpointInput(supportEndpoint);
                      setIsEditingEndpoint(false);
                    }}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-xs cursor-pointer transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              )}
            </div>

            {/* Action Bar & Explanation note */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-800/60 pt-3">
              <div className="text-[11px] text-slate-400">
                {(outboundQueue?.sentCount ?? 0) > 0
                  ? '✅ تم إرسال التقارير بنجاح إلى مركز دعم المطور (Developer Support Hub).'
                  : '📦 التقارير تُخزن في قاعدة البيانات المحلية وتُرسل تلقائياً إلى خادم المطور (Port 4000) كل دقيقة أو عند الضغط على إرسال.'}
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                {flushResult && (
                  <span className="text-xs text-sky-400 font-medium animate-fade-in bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800/40">
                    {flushResult}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleFlushQueue}
                  disabled={isFlushingQueue}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors"
                  title="إرسال التقارير المعلقة والفاشلة إلى سيرفر دعم المطور فوراً"
                >
                  <Send className={`w-3.5 h-3.5 ${isFlushingQueue ? 'animate-spin' : ''}`} />
                  <span>{isFlushingQueue ? 'جاري الإرسال...' : 'إرسال التقارير للمطور الآن'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab 2: Aggregated Errors */}
      {activeSubTab === 'errors' && (() => {
        const studentErrors = aggregatedErrors.filter((e) => e.sourceType !== 'server');
        const serverErrors = aggregatedErrors.filter((e) => e.sourceType === 'server');

        const studentAutoErrors = studentErrors.filter((e) => e.category !== 'manual');
        const studentManualErrors = studentErrors.filter((e) => e.category === 'manual');

        const serverAutoErrors = serverErrors.filter((e) => e.category !== 'manual');
        const serverManualErrors = serverErrors.filter((e) => e.category === 'manual');

        const applyCategoryFilter = (list: AggregatedError[]) => {
          if (errorCategoryFilter === 'automatic') return list.filter((e) => e.category !== 'manual');
          if (errorCategoryFilter === 'manual') return list.filter((e) => e.category === 'manual');
          return list;
        };

        const visibleStudentErrors = applyCategoryFilter(studentErrors);
        const visibleServerErrors = applyCategoryFilter(serverErrors);

        const renderErrorCard = (err: AggregatedError) => {
          const isExpanded = expandedSignature === err.signature;
          const isServer = err.sourceType === 'server';
          const isManual = err.category === 'manual';

          return (
            <div
              key={`${err.sourceType || 'student'}-${err.signature}`}
              className="p-4 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-3 transition-all hover:border-slate-700"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded-xl mt-0.5 ${
                      err.severity === 'critical'
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-slate-100">{err.signature}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                          err.severity === 'critical'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {err.severity}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 ${
                          isManual
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {isManual ? '📝 بلاغ يدوي' : '⚡ تلقائي'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          isServer
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                        }`}
                      >
                        {isServer ? '🏢 الخادم والأدمن' : '💻 جهاز طالب'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 line-clamp-2">{err.sampleMessage}</p>
                  </div>
                </div>

                {/* Occurrences & Affected Badge */}
                <div className="flex items-center gap-3 shrink-0 text-left">
                  <div className="text-right">
                    <div className="text-sm font-bold text-indigo-400">{err.occurrenceCount} تكرار</div>
                    <div className="text-[11px] text-slate-400">
                      {isServer ? 'خادم المؤسسة' : `على ${err.affectedClientsCount} جهاز طالب`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedSignature(isExpanded ? null : err.signature)}
                    className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Metadata summary bar */}
              <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-2 border-t border-slate-800/80 flex-wrap">
                <div>أول رصد: <span className="text-slate-300">{new Date(err.firstSeenAt).toLocaleTimeString()}</span></div>
                <div>آخر رصد: <span className="text-slate-300">{new Date(err.lastSeenAt).toLocaleTimeString()}</span></div>
                <div>إصدار التطبيق: <span className="font-mono text-slate-300">{err.affectedAppVersions.join(', ')}</span></div>
                {err.recentRoute && <div>المسار / المكون: <span className="font-mono text-slate-300">{err.recentRoute}</span></div>}
              </div>

              {/* Expandable details */}
              {isExpanded && (
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-2 animate-fade-in">
                  <div className="font-semibold text-slate-300">
                    {isServer ? 'المعرف المصدر:' : 'معرفات الأجهزة المتأثرة (Client IDs):'}
                  </div>
                  <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
                    {err.affectedClientIds.map((cid) => (
                      <span key={cid} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                        {cid}
                      </span>
                    ))}
                  </div>

                  {err.sampleStackTrace && (
                    <div className="pt-2">
                      <div className="font-semibold text-slate-300 mb-1">أثر الشيفرة بعد التنقية (Sanitized Stack Trace):</div>
                      <pre className="p-2.5 bg-slate-900 rounded-lg text-[10px] text-slate-300 font-mono overflow-x-auto max-h-40">
                        {err.sampleStackTrace}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        };

        return (
          <div className="space-y-6">
            {/* Top Control Bar: Source & Category Filters */}
            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-400">تصفية المصدر:</span>
                <button
                  type="button"
                  onClick={() => setErrorSourceFilter('all')}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    errorSourceFilter === 'all'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  كافة المصادر ({aggregatedErrors.length})
                </button>
                <button
                  type="button"
                  onClick={() => setErrorSourceFilter('student')}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    errorSourceFilter === 'student'
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Laptop className="w-3.5 h-3.5" />
                  <span>أجهزة الطلاب ({studentErrors.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setErrorSourceFilter('server')}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    errorSourceFilter === 'server'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Server className="w-3.5 h-3.5" />
                  <span>الخادم والأدمن ({serverErrors.length})</span>
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-400">النوع:</span>
                <button
                  type="button"
                  onClick={() => setErrorCategoryFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    errorCategoryFilter === 'all'
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  الكل
                </button>
                <button
                  type="button"
                  onClick={() => setErrorCategoryFilter('automatic')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    errorCategoryFilter === 'automatic'
                      ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>⚡ تلقائي</span>
                </button>
                <button
                  type="button"
                  onClick={() => setErrorCategoryFilter('manual')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    errorCategoryFilter === 'manual'
                      ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>📝 يدوي</span>
                </button>
              </div>
            </div>

            {aggregatedErrors.length === 0 ? (
              <div className="p-8 text-center bg-slate-900/30 border border-slate-800 rounded-2xl text-slate-400">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                <div className="font-bold text-slate-200">لا توجد أخطاء مسجلة اليوم</div>
                <div className="text-xs text-slate-500">جميع أجهزة الطلاب والخدمات تعمل بدون مشاكل أو أعطال معلقة.</div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* SECTION 1: STUDENT STATIONS */}
                {(errorSourceFilter === 'all' || errorSourceFilter === 'student') && (
                  <div className="p-5 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                          <Laptop className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-slate-100">أخطاء أجهزة الطلاب (Student Stations)</h3>
                          <p className="text-[11px] text-slate-400">أخطاء التشغيل والقراءة والبلاغات المجمعة من حواسيب الطلاب</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                          ⚡ تلقائي: {studentAutoErrors.length}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                          📝 يدوي: {studentManualErrors.length}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono font-bold">
                          المجموع: {visibleStudentErrors.length}
                        </span>
                      </div>
                    </div>

                    {visibleStudentErrors.length === 0 ? (
                      <div className="p-6 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-slate-800/60">
                        لا توجد أخطاء مطابقة من أجهزة الطلاب في هذا التصنيف.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {visibleStudentErrors.map(renderErrorCard)}
                      </div>
                    )}
                  </div>
                )}

                {/* SECTION 2: SERVER & ADMIN */}
                {(errorSourceFilter === 'all' || errorSourceFilter === 'server') && (
                  <div className="p-5 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          <Server className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-slate-100">أخطاء خادم المؤسسة وحساب الأدمن (Server & Admin)</h3>
                          <p className="text-[11px] text-slate-400">أخطاء خدمات السيرفر المركزي وبلاغات الدعم الفني الصادرة من لوحة الإدارة</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                          ⚡ تلقائي: {serverAutoErrors.length}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                          📝 يدوي: {serverManualErrors.length}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono font-bold">
                          المجموع: {visibleServerErrors.length}
                        </span>
                      </div>
                    </div>

                    {visibleServerErrors.length === 0 ? (
                      <div className="p-6 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-slate-800/60">
                        لا توجد أخطاء مطابقة من خادم المؤسسة أو حساب الأدمن في هذا التصنيف.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {visibleServerErrors.map(renderErrorCard)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Sub-Tab 3: Connected Student Stations */}
      {activeSubTab === 'clients' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>سجل أجهزة الطلاب المسجلة في شبكة المؤسسة:</span>
            <span>إجمالي الأجهزة: {clientStations.length}</span>
          </div>

          <div className="overflow-x-auto bg-slate-900/60 border border-slate-800 rounded-2xl">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-3">حالة الجهاز</th>
                  <th className="p-3">اسم الحاسوب</th>
                  <th className="p-3">معرف التثبيت (Client ID)</th>
                  <th className="p-3">عنوان الشبكة (IP)</th>
                  <th className="p-3">إصدار التطبيق</th>
                  <th className="p-3">آخر ظهور</th>
                  <th className="p-3 text-center">أخطاء اليوم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {clientStations.map((station) => (
                  <tr key={station.clientId} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${station.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                        <span className={station.isOnline ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                          {station.isOnline ? 'متصل الآن' : 'غير متصل'}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 font-semibold text-slate-200 flex items-center gap-1.5">
                      <Laptop className="w-3.5 h-3.5 text-purple-400" />
                      <span>{station.machineName}</span>
                    </td>
                    <td className="p-3 font-mono text-[10px] text-slate-400">{station.clientId}</td>
                    <td className="p-3 font-mono text-slate-300">{station.ipAddress}</td>
                    <td className="p-3 font-mono text-indigo-300">{station.appVersion}</td>
                    <td className="p-3 text-slate-400">{new Date(station.lastSeenAt).toLocaleString()}</td>
                    <td className="p-3 text-center">
                      {station.todayErrorsCount > 0 ? (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold font-mono">
                          {station.todayErrorsCount}
                        </span>
                      ) : (
                        <span className="text-slate-600">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub-Tab 4: Updater */}
      {activeSubTab === 'updater' && (
        <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-6 max-w-2xl mx-auto">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <ArrowUpCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">نظام التحديث البرمجي الآمن (MISHKAT Updater)</h3>
              <p className="text-xs text-slate-400">
                تحديث ملفات البرنامج فقط مع الحفاظ التام على بيانات المؤسسة والكتب وقاعدة البيانات
              </p>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between p-3.5 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-400">الإصدار المثبت حالياً:</span>
              <span className="font-bold text-slate-200 font-mono text-sm">
                v{updateStatus?.currentVersion || '1.0.0'}
              </span>
            </div>

            <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
              <div className="font-semibold text-slate-200">حالة التحديث:</div>
              <p className="text-slate-400">
                {updateStatus?.message || 'أنت تستخدم أحدث إصدار معتمد من نظام المشكاة.'}
              </p>
              {updateStatus?.lastBackupPath && (
                <div className="text-[11px] text-emerald-400">
                  🛡️ تم إنشاء نسخة أمان احتياطية قبل التحديث بنجاح.
                </div>
              )}
            </div>

            <div className="p-4 bg-indigo-950/20 border border-indigo-500/20 rounded-xl text-slate-300 space-y-1.5">
              <div className="font-bold text-indigo-300">ضمانات الأمان أثناء التحديث:</div>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-400">
                <li>إنشاء نسخة احتياطية فورية وتلقائية لقاعدة البيانات قبل أي تعديل.</li>
                <li>حماية مجلد البيانات <code>LibraryData</code> وملف الإعدادات من أي حذف أو تعديل.</li>
                <li>تطبيق ترحيل الجداول الجديدة (Database Migrations) آلياً.</li>
                <li>التراجع التلقائي السريع (Rollback) في حال حدوث أي خطأ في الفحص الصحي بعد التحديث.</li>
              </ul>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={handleCheckUpdate}
                disabled={isCheckingUpdate}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-xl font-bold cursor-pointer transition-all flex items-center justify-center gap-2 border border-slate-700"
              >
                {isCheckingUpdate ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                <span>{isCheckingUpdate ? 'جاري الفحص...' : 'فحص تحديثات'}</span>
              </button>

              {updateStatus?.availableVersion && (
                <button
                  type="button"
                  onClick={handleApplyUpdate}
                  disabled={isCheckingUpdate}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold cursor-pointer transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
                >
                  <RefreshCw className={`w-4 h-4 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                  <span>تحديث النظام الآن</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Report Problem Modal */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-slate-100 font-bold text-sm">
                <HelpCircle className="w-4 h-4 text-purple-400" />
                <span>الإبلاغ عن مشكلة تقنية</span>
              </div>
              <button
                type="button"
                onClick={() => setIsReportModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {submitSuccess ? (
              <div className="py-6 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h4 className="text-sm font-bold text-slate-100">تم إرسال التقرير بنجاح</h4>
                <p className="text-xs text-slate-400">
                  شكراً لك. تم إرسال المعلومات التشخيصية بنجاح ليتم مراجعتها.
                </p>
              </div>
            ) : (
              <form onSubmit={handleReportSubmit} onPaste={handlePaste} className="space-y-3">
                <div className="text-xs text-slate-400">
                  سيتم إرسال وصف المشكلة ومعلومات الشاشة الحالية فقط دون أي بيانات خاصة.
                </div>

                <div>
                  <label className="block text-xs text-slate-300 font-medium mb-1">
                    ما المشكلة التي واجهتك؟ *
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={problemDescription}
                    onChange={(e) => setProblemDescription(e.target.value)}
                    placeholder="مثال: تعذر تحميل الصفحة رقم 5 في الكتاب أو بطء في عرض الفهرس..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-purple-500 resize-none"
                  />
                </div>

                {/* Screenshot Attachment */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-purple-400" />
                      <span>إرفاق لقطة شاشة / صورة (اختياري)</span>
                    </label>
                    <span className="text-[10px] text-slate-500">أو الصق مباشرة بالضغط على Ctrl+V</span>
                  </div>

                  {screenshot ? (
                    <div className="relative border border-purple-500/40 rounded-xl p-2 bg-purple-950/20 flex items-center gap-3">
                      <img
                        src={screenshot}
                        alt="Screenshot Preview"
                        className="w-16 h-12 object-cover rounded-lg border border-slate-700 bg-slate-900"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-slate-200 font-medium truncate flex items-center gap-1">
                          <ImageIcon className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span>تم إرفاق لقطة الشاشة بنجاح</span>
                        </div>
                        <div className="text-[10px] text-slate-400">ستُعرض في لوحة تحكم المطور للمساعدة في معالجة المشكلة</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setScreenshot(null)}
                        className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                        title="حذف الصورة"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="file"
                        id="admin-screenshot-file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) processImageFile(file);
                        }}
                      />
                      <label
                        htmlFor="admin-screenshot-file"
                        className="border border-dashed border-slate-700 hover:border-purple-500/60 rounded-xl p-2.5 flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-purple-300 hover:bg-slate-950 cursor-pointer transition-all"
                      >
                        {isCompressingImage ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
                            <span>جاري معالجة الصورة...</span>
                          </>
                        ) : (
                          <>
                            <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
                            <span>انقر لاختيار صورة من جهازك، أو الصق من الحافظة (Ctrl+V)</span>
                          </>
                        )}
                      </label>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsReportModalOpen(false)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !problemDescription.trim()}
                    className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-lg shadow-purple-600/20"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>إرسال التقرير</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
