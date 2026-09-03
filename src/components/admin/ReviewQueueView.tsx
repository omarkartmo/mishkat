import React, { useState } from 'react';
import {
  CheckSquare,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  User,
  Globe2,
  FileText,
  AlertCircle,
  ArrowRight,
  Filter,
  Check,
  X,
  ExternalLink,
  ShieldCheck,
  FileDown,
} from 'lucide-react';
import { PendingBookSubmission, Category } from '../../types/library';

interface ReviewQueueViewProps {
  submissions: PendingBookSubmission[];
  categories: Category[];
  onApprove: (submissionId: string, categoryId?: string) => void;
  onReject: (submissionId: string, reason: string) => void;
}

export const ReviewQueueView: React.FC<ReviewQueueViewProps> = ({
  submissions = [],
  categories = [],
  onApprove,
  onReject,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [search, setSearch] = useState('');
  
  // Modals
  const [approvingSub, setApprovingSub] = useState<PendingBookSubmission | null>(null);
  const [selectedApprovedCatId, setSelectedApprovedCatId] = useState<string>('');
  const [rejectingSub, setRejectingSub] = useState<PendingBookSubmission | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const filteredSubmissions = (submissions || []).filter((sub) => {
    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
    const matchesSearch =
      sub.title.toLowerCase().includes(search.toLowerCase()) ||
      sub.author.toLowerCase().includes(search.toLowerCase()) ||
      sub.studentName.toLowerCase().includes(search.toLowerCase()) ||
      sub.sourcePortalName.toLowerCase().includes(search.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  const pendingCount = (submissions || []).filter((s) => s.status === 'pending').length;
  const getCategory = (catId: string) => (categories || []).find((c) => c.id === catId);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-amber-400" />
            طابور مراجعة واعتماد الكتب المرفوعة
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            مراجعة المراجع والكتب الإلكترونية المقترحة من الطلبة وتدقيق بيانات الفهرسة قبل إضافتها للمستودع المركزي
          </p>
        </div>

        {pendingCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl text-xs font-semibold animate-pulse">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>يوجد {pendingCount} كتب بانتظار قرار أمين المكتبة</span>
          </div>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="w-full md:w-80 relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="البحث باسم الكتاب، الطالب، أو المصدر..."
            className="w-full bg-slate-950/80 border border-slate-800 focus:border-amber-500 rounded-xl pr-10 pl-4 py-2 text-xs text-slate-200 outline-none"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
              statusFilter === 'pending'
                ? 'bg-amber-600 text-white font-bold'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>قيد المراجعة ({pendingCount})</span>
          </button>
          <button
            onClick={() => setStatusFilter('approved')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
              statusFilter === 'approved'
                ? 'bg-emerald-600 text-white font-bold'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>المعتمدة ({submissions.filter((s) => s.status === 'approved').length})</span>
          </button>
          <button
            onClick={() => setStatusFilter('rejected')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
              statusFilter === 'rejected'
                ? 'bg-rose-600 text-white font-bold'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>المرفوضة ({submissions.filter((s) => s.status === 'rejected').length})</span>
          </button>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              statusFilter === 'all'
                ? 'bg-slate-100 text-slate-900 font-bold'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200'
            }`}
          >
            جميع الطلبات ({submissions.length})
          </button>
        </div>
      </div>

      {/* Submissions List */}
      {filteredSubmissions.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/40 border border-slate-800 rounded-2xl">
          <CheckCircle2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-300">لا توجد طلبات في هذا القسم حالياً</h3>
          <p className="text-xs text-slate-500 mt-1">تمت معالجة جميع الطلبات بنجاح</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredSubmissions.map((sub) => {
            const cat = getCategory(sub.suggestedCategoryId);
            const isPending = sub.status === 'pending';
            const isApproved = sub.status === 'approved';
            const isRejected = sub.status === 'rejected';

            return (
              <div
                key={sub.id}
                className={`bg-slate-900/80 border rounded-2xl p-5 flex flex-col justify-between space-y-4 transition-all shadow-sm ${
                  isPending
                    ? 'border-amber-500/40 hover:border-amber-500/70'
                    : isApproved
                    ? 'border-emerald-500/30'
                    : 'border-rose-500/30'
                }`}
              >
                <div className="space-y-3">
                  {/* Top Bar: Portal Source & Status */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-sky-400 font-medium flex items-center gap-1.5 bg-sky-500/10 px-2.5 py-0.5 rounded-lg border border-sky-500/20">
                      <Globe2 className="w-3.5 h-3.5" />
                      <span>{sub.sourcePortalName}</span>
                    </span>

                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-lg font-semibold flex items-center gap-1 ${
                        isPending
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : isApproved
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {isPending && <Clock className="w-3 h-3 text-amber-400" />}
                      {isApproved && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                      {isRejected && <XCircle className="w-3 h-3 text-rose-400" />}
                      <span>
                        {isPending
                          ? 'قيد المراجعة'
                          : isApproved
                          ? 'معتمد ومنشور'
                          : 'تم الرفض'}
                      </span>
                    </span>
                  </div>

                  {/* Book Title & Author */}
                  <div>
                    <h3 className="font-bold text-slate-100 text-base leading-snug">{sub.title}</h3>
                    <p className="text-xs text-slate-400 mt-0.5 font-medium">المؤلف: {sub.author}</p>
                  </div>

                  {/* Summary */}
                  <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                    {sub.summary}
                  </p>

                  {/* Student Submitter & Suggested Category */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                    <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/60">
                      <span className="block text-slate-500 text-[10px]">مقدم الطلب:</span>
                      <strong className="text-slate-200">{sub.studentName}</strong>
                      <span className="font-mono text-slate-400 block text-[10px]">{sub.studentRegNumber}</span>
                    </div>
                    <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/60">
                      <span className="block text-slate-500 text-[10px]">التصنيف المقترح:</span>
                      <strong className="text-indigo-300">{cat?.name || 'غير محدد'}</strong>
                      <span className="text-slate-500 block text-[10px]">بتاريخ: {sub.submittedAt}</span>
                    </div>
                  </div>

                  {/* Feedback or Approval note if exists */}
                  {sub.adminFeedback && (
                    <div className="text-xs text-rose-300 bg-rose-950/30 p-2 rounded-lg border border-rose-900/40">
                      <strong>سبب الرفض:</strong> {sub.adminFeedback}
                    </div>
                  )}

                  {/* Phase 15.4-G Mandate: Complete Source Provenance & Inspection Panel for Admin */}
                  <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-2 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-medium flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                        <span>توثيق المصدر الأصلي</span>
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        sub.verificationStatus === 'VERIFIED'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : sub.verificationStatus === 'INCOMPLETE_PROVENANCE'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}>
                        {sub.verificationStatus || 'USER_SUGGESTED'}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5 pt-1 text-slate-300">
                      {/* Source Book Page URL */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500 shrink-0">صفحة الكتاب:</span>
                        {(sub.sourceRecordUrl || sub.sourceUrl) ? (
                          <a
                            href={sub.sourceRecordUrl || sub.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-400 hover:text-sky-300 font-mono text-[10px] flex items-center gap-1 underline truncate max-w-[220px]"
                            title={sub.sourceRecordUrl || sub.sourceUrl}
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span className="truncate">{sub.sourceRecordUrl || sub.sourceUrl}</span>
                          </a>
                        ) : (
                          <span className="text-rose-400 font-semibold text-[10px]">غير متوفر (سجل ناقص)</span>
                        )}
                      </div>

                      {/* Download URL */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500 shrink-0">رابط التحميل:</span>
                        {sub.downloadUrl ? (
                          <a
                            href={sub.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-400 hover:text-emerald-300 font-mono text-[10px] flex items-center gap-1 underline truncate max-w-[220px]"
                            title={sub.downloadUrl}
                          >
                            <FileDown className="w-3 h-3 shrink-0" />
                            <span className="truncate">{sub.downloadUrl}</span>
                          </a>
                        ) : (
                          <span className="text-slate-500 text-[10px]">غير مدخل (يتطلب استخراج يدوي)</span>
                        )}
                      </div>

                      {/* Source Method */}
                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-900">
                        <span>طريقة المصدر:</span>
                        <span className="font-mono text-slate-300">{sub.sourceMethod || 'USER_ASSISTED_CAPTURE'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions Footer */}
                {isPending && (
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                    <button
                      onClick={() => setRejectingSub(sub)}
                      className="px-3.5 py-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>رفض مع بيان السبب</span>
                    </button>

                    <button
                      onClick={() => {
                        setApprovingSub(sub);
                        setSelectedApprovedCatId(sub.suggestedCategoryId);
                      }}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/30 transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>اعتماد ونشر في المستودع</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Approve Modal (Confirm or adjust category) */}
      {approvingSub && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              تأكيد اعتماد ونشر الكتاب
            </h3>

            <p className="text-xs text-slate-300 leading-relaxed">
              سيتم حفظ كتاب <strong className="text-white">"{approvingSub.title}"</strong> في المستودع الرقمي المركزي
              ويتاح لجميع الحواسيب المحمولة بالمدرسة فوراً.
            </p>

            <div className="space-y-1 text-xs">
              <label className="block text-slate-300 font-medium">تأكيد التصنيف النهائي للكتاب:</label>
              <select
                value={selectedApprovedCatId}
                onChange={(e) => setSelectedApprovedCatId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setApprovingSub(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs"
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  onApprove(approvingSub.id, selectedApprovedCatId);
                  setApprovingSub(null);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/30"
              >
                اعتماد ونشر الآن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectingSub && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
              <XCircle className="w-5 h-5 text-rose-400" />
              رفض طلب إضافة الكتاب
            </h3>

            <p className="text-xs text-slate-300">
              يرجى كتابة سبب الرفض ليظهر للطالب في حسابه:
            </p>

            <textarea
              rows={3}
              required
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="مثال: الكتاب موجود مسبقاً في المستودع المركزي، أو الملف غير واضح..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 text-xs outline-none focus:border-rose-500 resize-none"
            />

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setRejectingSub(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs"
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  if (!rejectReason.trim()) {
                    alert('يرجى كتابة سبب الرفض');
                    return;
                  }
                  onReject(rejectingSub.id, rejectReason.trim());
                  setRejectingSub(null);
                  setRejectReason('');
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-rose-600/30"
              >
                تأكيد الرفض
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
