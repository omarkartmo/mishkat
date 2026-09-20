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

export const SystemSupportDashboard: React.FC = () => {
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [aggregatedErrors, setAggregatedErrors] = useState<AggregatedError[]>([]);
  const [clientStations, setClientStations] = useState<ClientStation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modal states for Reporting a Problem
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [problemDescription, setProblemDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [expandedSignature, setExpandedSignature] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'errors' | 'clients' | 'updater'>('overview');

  // Updater state
  const [updateStatus, setUpdateStatus] = useState<any>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  const fetchDashboardData = async () => {
    try {
      const [healthRes, errorsRes, clientsRes, updaterRes] = await Promise.all([
        apiClient.get<HealthData>('/support/health-summary'),
        apiClient.get<AggregatedError[]>('/support/aggregated-errors'),
        apiClient.get<{ clients: ClientStation[] }>('/support/clients'),
        apiClient.get<any>('/support/updater/status').catch(() => ({ success: false, data: null })),
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

  const handleReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!problemDescription.trim()) return;

    setIsSubmitting(true);
    try {
      telemetryService.reportManualProblem('SystemSupportDashboard', problemDescription.trim());
      setSubmitSuccess(true);
      setTimeout(() => {
        setIsReportModalOpen(false);
        setProblemDescription('');
        setSubmitSuccess(false);
        setIsSubmitting(false);
      }, 1500);
    } catch {
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

          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer border border-slate-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>تحديث الآن</span>
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
        </div>
      )}

      {/* Sub-Tab 2: Aggregated Errors */}
      {activeSubTab === 'errors' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              يتم تجميع الأخطاء المتطابقة تلقائياً من جميع أجهزة الطلاب لمنع التكرار وتسهيل المعالجة.
            </span>
            <span>عدد الأنماط: {aggregatedErrors.length}</span>
          </div>

          {aggregatedErrors.length === 0 ? (
            <div className="p-8 text-center bg-slate-900/30 border border-slate-800 rounded-2xl text-slate-400">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
              <div className="font-bold text-slate-200">لا توجد أخطاء مسجلة اليوم</div>
              <div className="text-xs text-slate-500">جميع أجهزة الطلاب والخدمات تعمل بدون مشاكل أو أعطال معلقة.</div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {aggregatedErrors.map((err) => {
                const isExpanded = expandedSignature === err.signature;
                return (
                  <div
                    key={err.signature}
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
                          </div>
                          <p className="text-xs text-slate-300 line-clamp-2">{err.sampleMessage}</p>
                        </div>
                      </div>

                      {/* Occurrences & Clients Badge */}
                      <div className="flex items-center gap-3 shrink-0 text-left">
                        <div className="text-right">
                          <div className="text-sm font-bold text-indigo-400">{err.occurrenceCount} تكرار</div>
                          <div className="text-[11px] text-slate-400">على {err.affectedClientsCount} جهاز طالب</div>
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
                    <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
                      <div>أول رصد: <span className="text-slate-300">{new Date(err.firstSeenAt).toLocaleTimeString()}</span></div>
                      <div>آخر رصد: <span className="text-slate-300">{new Date(err.lastSeenAt).toLocaleTimeString()}</span></div>
                      <div>إصدار التطبيق: <span className="font-mono text-slate-300">{err.affectedAppVersions.join(', ')}</span></div>
                      {err.recentRoute && <div>المسار: <span className="font-mono text-slate-300">{err.recentRoute}</span></div>}
                    </div>

                    {/* Expandable details */}
                    {isExpanded && (
                      <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-2 animate-fade-in">
                        <div className="font-semibold text-slate-300">معرفات الأجهزة المتأثرة (Client IDs):</div>
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
              })}
            </div>
          )}
        </div>
      )}

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

            <div className="pt-2">
              <button
                type="button"
                onClick={handleCheckUpdate}
                disabled={isCheckingUpdate}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold cursor-pointer transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
              >
                {isCheckingUpdate ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                <span>{isCheckingUpdate ? 'جاري الفحص...' : 'فحص وجود تحديثات جديدة معتمدة'}</span>
              </button>
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
              <form onSubmit={handleReportSubmit} className="space-y-3">
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
