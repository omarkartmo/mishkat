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
  Filter,
  Check,
  X,
  ExternalLink,
  ShieldCheck,
  FileDown,
  Copy,
  Edit3,
  Loader2,
  Sparkles,
  ArrowRight,
  Upload,
} from 'lucide-react';
import { PendingBookSubmission, Category, SubmissionStatus } from '../../types/library';
import { submissionRepository } from '../../services/submissionRepository';

interface ReviewQueueViewProps {
  submissions: PendingBookSubmission[];
  categories: Category[];
  onApprove: (submissionId: string, categoryId?: string) => void;
  onReject: (submissionId: string, reason: string) => void;
  onRefresh?: () => void;
}

export const ReviewQueueView: React.FC<ReviewQueueViewProps> = ({
  submissions = [],
  categories = [],
  onApprove,
  onReject,
  onRefresh,
}) => {
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'PENDING_REVIEW' | 'NEEDS_MANUAL_ACQUISITION' | 'READY_FOR_FINAL_APPROVAL' | 'APPROVED' | 'REJECTED'
  >('PENDING_REVIEW');
  const [search, setSearch] = useState('');

  // Modals & Action State
  const [approvingSub, setApprovingSub] = useState<PendingBookSubmission | null>(null);
  const [selectedApprovedCatId, setSelectedApprovedCatId] = useState<string>('');
  const [rejectingSub, setRejectingSub] = useState<PendingBookSubmission | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Edit Metadata Modal (Section 7 Requirement)
  const [editingSub, setEditingSub] = useState<PendingBookSubmission | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAuthor, setEditAuthor] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editDownloadUrl, setEditDownloadUrl] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editIsbn, setEditIsbn] = useState('');

  // Manual File Path Attachment Modal (Section 9 Requirement)
  const [attachingSub, setAttachingSub] = useState<PendingBookSubmission | null>(null);
  const [manualFilePath, setManualFilePath] = useState('');

  // Loading & feedback state
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [copiedUrlSubId, setCopiedUrlSubId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Normalize status helper
  const getNormStatus = (s: string): SubmissionStatus => {
    if (s === 'pending') return 'PENDING_REVIEW';
    if (s === 'approved') return 'APPROVED';
    if (s === 'rejected') return 'REJECTED';
    return s as SubmissionStatus;
  };

  const filteredSubmissions = (submissions || []).filter((sub) => {
    const norm = getNormStatus(sub.status);
    const matchesStatus = statusFilter === 'all' || norm === statusFilter;
    const matchesSearch =
      sub.title.toLowerCase().includes(search.toLowerCase()) ||
      sub.author.toLowerCase().includes(search.toLowerCase()) ||
      sub.studentName.toLowerCase().includes(search.toLowerCase()) ||
      sub.sourcePortalName.toLowerCase().includes(search.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  const pendingReviewCount = (submissions || []).filter((s) => getNormStatus(s.status) === 'PENDING_REVIEW').length;
  const manualAcquisitionCount = (submissions || []).filter((s) => getNormStatus(s.status) === 'NEEDS_MANUAL_ACQUISITION').length;
  const readyApprovalCount = (submissions || []).filter((s) => getNormStatus(s.status) === 'READY_FOR_FINAL_APPROVAL').length;

  const getCategory = (catId: string) => (categories || []).find((c) => c.id === catId);

  // Copy Source URL to clipboard
  const handleCopySourceUrl = (sub: PendingBookSubmission) => {
    const url = sub.sourceRecordUrl || sub.sourceUrl || '';
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopiedUrlSubId(sub.id);
    setTimeout(() => setCopiedUrlSubId(null), 2000);
  };

  // Open Edit Metadata Modal
  const handleOpenEditModal = (sub: PendingBookSubmission) => {
    setEditingSub(sub);
    setEditTitle(sub.title);
    setEditAuthor(sub.author);
    setEditCategoryId(sub.suggestedCategoryId);
    setEditDownloadUrl(sub.downloadUrl || '');
    setEditSummary(sub.summary || '');
    setEditIsbn(sub.isbn || '');
  };

  // Save Edited Metadata
  const handleSaveEditedMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSub) return;
    setActionInProgressId(editingSub.id);
    setErrorMessage(null);

    try {
      const res = await submissionRepository.updateMetadata(editingSub.id, {
        title: editTitle.trim(),
        author: editAuthor.trim(),
        suggestedCategoryId: editCategoryId,
        downloadUrl: editDownloadUrl.trim() || undefined,
        summary: editSummary.trim(),
        isbn: editIsbn.trim() || undefined,
      });

      if (res.success) {
        setEditingSub(null);
        if (onRefresh) onRefresh();
      } else {
        setErrorMessage(res.error?.message || 'فشل تحديث البيانات.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء حفظ التعديل.');
    } finally {
      setActionInProgressId(null);
    }
  };

  // Move to NEEDS_MANUAL_ACQUISITION (Section 9 Requirement)
  const handleMarkManualAcquisition = async (sub: PendingBookSubmission) => {
    setActionInProgressId(sub.id);
    setErrorMessage(null);
    try {
      const res = await submissionRepository.markManualAcquisition(sub.id, {
        adminFeedback: 'تم تحويل الطلب للاستحواذ اليدوي وتدقيق الرابط.',
      });
      if (res.success) {
        if (onRefresh) onRefresh();
      } else {
        setErrorMessage(res.error?.message || 'فشل تحويل الحالة.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ.');
    } finally {
      setActionInProgressId(null);
    }
  };

  // Move to READY_FOR_FINAL_APPROVAL (Section 9 Requirement)
  const handleSaveManualAttachment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attachingSub) return;
    setActionInProgressId(attachingSub.id);
    setErrorMessage(null);

    try {
      const res = await submissionRepository.readyFinalApproval(attachingSub.id, manualFilePath.trim() || undefined);
      if (res.success) {
        setAttachingSub(null);
        setManualFilePath('');
        if (onRefresh) onRefresh();
      } else {
        setErrorMessage(res.error?.message || 'فشل تحديث حالة الاستحواذ.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ.');
    } finally {
      setActionInProgressId(null);
    }
  };

  // Case A Accept / Auto-Download & Case B Final Approve
  const handleExecuteApproval = async (sub: PendingBookSubmission, categoryId?: string) => {
    setActionInProgressId(sub.id);
    setErrorMessage(null);

    try {
      const res = await submissionRepository.approveSubmission(sub.id, {
        categoryId: categoryId || sub.suggestedCategoryId,
        title: sub.title,
        author: sub.author,
      });

      if (res.success) {
        setApprovingSub(null);
        if (onRefresh) onRefresh();
      } else {
        setErrorMessage(res.error?.message || 'تعذر اعتماد الكتاب.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء الاعتماد.');
    } finally {
      setActionInProgressId(null);
    }
  };

  // Rejection
  const handleExecuteRejection = async () => {
    if (!rejectingSub) return;
    setActionInProgressId(rejectingSub.id);
    setErrorMessage(null);

    try {
      const res = await submissionRepository.rejectSubmission(rejectingSub.id, rejectReason.trim() || 'عدم توافق مع معايير الفهرسة');
      if (res.success) {
        setRejectingSub(null);
        setRejectReason('');
        if (onRefresh) onRefresh();
      } else {
        setErrorMessage(res.error?.message || 'فشل رفض الطلب.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء رفض الطلب.');
    } finally {
      setActionInProgressId(null);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-amber-500" />
            طابور مراجعة واعتماد الكتب المقترحة
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            مراجعة المراجع والكتب المقترحة من الطلبة، التدقيق المصدري، الاستحواذ اليدوي، والاعتماد للمستودع المركزي
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {pendingReviewCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-300 rounded-xl text-xs font-semibold">
              <Clock className="w-4 h-4 text-amber-500" />
              <span>{pendingReviewCount} بانتظار المراجعة</span>
            </div>
          )}

          {manualAcquisitionCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-300 rounded-xl text-xs font-semibold">
              <Upload className="w-4 h-4 text-purple-500" />
              <span>{manualAcquisitionCount} بانتظار الاستحواذ اليدوي</span>
            </div>
          )}

          {readyApprovalCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-300 rounded-xl text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 text-sky-500" />
              <span>{readyApprovalCount} جاهزة للاعتماد النهائي</span>
            </div>
          )}
        </div>
      </div>

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-2xl text-rose-700 dark:text-rose-200 text-xs flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="block text-sm font-bold mb-0.5">تنبيه النظام:</strong>
            {errorMessage}
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="w-full md:w-80 relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="البحث باسم الكتاب، الطالب، أو المصدر..."
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-amber-500 rounded-xl pr-10 pl-4 py-2 text-xs text-slate-800 dark:text-slate-200 outline-none"
          />
        </div>

        {/* State Filter Buttons (Section 6 Requirement) */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            onClick={() => setStatusFilter('PENDING_REVIEW')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'PENDING_REVIEW'
                ? 'bg-amber-600 text-white font-bold'
                : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>قيد المراجعة ({pendingReviewCount})</span>
          </button>

          <button
            onClick={() => setStatusFilter('NEEDS_MANUAL_ACQUISITION')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'NEEDS_MANUAL_ACQUISITION'
                ? 'bg-purple-600 text-white font-bold'
                : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>استحواذ يدوي ({manualAcquisitionCount})</span>
          </button>

          <button
            onClick={() => setStatusFilter('READY_FOR_FINAL_APPROVAL')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'READY_FOR_FINAL_APPROVAL'
                ? 'bg-sky-600 text-white font-bold'
                : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>جاهزة للاعتماد ({readyApprovalCount})</span>
          </button>

          <button
            onClick={() => setStatusFilter('APPROVED')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'APPROVED'
                ? 'bg-emerald-600 text-white font-bold'
                : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <span>المعتمدة ({submissions.filter((s) => getNormStatus(s.status) === 'APPROVED').length})</span>
          </button>

          <button
            onClick={() => setStatusFilter('REJECTED')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'REJECTED'
                ? 'bg-rose-600 text-white font-bold'
                : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>المرفوضة ({submissions.filter((s) => getNormStatus(s.status) === 'REJECTED').length})</span>
          </button>

          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-slate-800 text-white font-bold'
                : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            الكل ({submissions.length})
          </button>
        </div>
      </div>

      {/* Submissions List */}
      {filteredSubmissions.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
          <CheckCircle2 className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">لا توجد طلبات في هذا القسم حالياً</h3>
          <p className="text-xs text-slate-500 mt-1">تمت معالجة كافة السجلات بنجاح</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredSubmissions.map((sub) => {
            const cat = getCategory(sub.suggestedCategoryId);
            const normStatus = getNormStatus(sub.status);
            const isPendingReview = normStatus === 'PENDING_REVIEW';
            const isNeedsManual = normStatus === 'NEEDS_MANUAL_ACQUISITION';
            const isReadyFinal = normStatus === 'READY_FOR_FINAL_APPROVAL';
            const isApproved = normStatus === 'APPROVED';
            const isRejected = normStatus === 'REJECTED';
            const isBusy = actionInProgressId === sub.id;

            return (
              <div
                key={sub.id}
                className={`bg-white dark:bg-slate-900 border rounded-2xl p-5 flex flex-col justify-between space-y-4 transition-all shadow-sm ${
                  isPendingReview
                    ? 'border-amber-400/60 dark:border-amber-500/40'
                    : isNeedsManual
                    ? 'border-purple-400/60 dark:border-purple-500/40'
                    : isReadyFinal
                    ? 'border-sky-400/60 dark:border-sky-500/40'
                    : isApproved
                    ? 'border-emerald-400/60 dark:border-emerald-500/30'
                    : 'border-rose-400/60 dark:border-rose-500/30'
                }`}
              >
                <div className="space-y-3">
                  {/* Top Bar: Source Portal, Edit Button, State Badge */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-sky-700 dark:text-sky-300 font-medium flex items-center gap-1.5 bg-sky-50 dark:bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-200 dark:border-sky-500/20">
                      <Globe2 className="w-3.5 h-3.5" />
                      <span>{sub.sourcePortalName}</span>
                    </span>

                    <div className="flex items-center gap-2">
                      {/* Edit Metadata Button (Section 7 Requirement) */}
                      {!isApproved && !isRejected && (
                        <button
                          onClick={() => handleOpenEditModal(sub)}
                          className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1 rounded-md transition-colors cursor-pointer"
                          title="تعديل بيانات الكتاب قبل الاعتماد"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}

                      {/* State Badge */}
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-lg font-semibold flex items-center gap-1 ${
                          isPendingReview
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                            : isNeedsManual
                            ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/30'
                            : isReadyFinal
                            ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/30'
                            : isApproved
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {isPendingReview && <Clock className="w-3 h-3 text-amber-500" />}
                        {isNeedsManual && <Upload className="w-3 h-3 text-purple-500" />}
                        {isReadyFinal && <CheckCircle2 className="w-3 h-3 text-sky-500" />}
                        {isApproved && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                        {isRejected && <XCircle className="w-3 h-3 text-rose-500" />}
                        <span>
                          {isPendingReview
                            ? 'قيد المراجعة'
                            : isNeedsManual
                            ? 'بانتظار الاستحواذ اليدوي'
                            : isReadyFinal
                            ? 'جاهز للاعتماد النهائي'
                            : isApproved
                            ? 'معتمد ومنشور'
                            : 'تم الرفض'}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Book Title & Author */}
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base leading-snug">{sub.title}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">المؤلف: {sub.author}</p>
                  </div>

                  {/* Summary */}
                  {sub.summary && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800/80">
                      {sub.summary}
                    </p>
                  )}

                  {/* Student Submitter & Suggested Category */}
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                      <span className="block text-slate-400 text-[10px]">مقدم الطلب:</span>
                      <strong className="text-slate-800 dark:text-slate-200">{sub.studentName}</strong>
                      <span className="font-mono text-slate-400 block text-[10px]">{sub.studentRegNumber}</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                      <span className="block text-slate-400 text-[10px]">التصنيف المقترح:</span>
                      <strong className="text-indigo-600 dark:text-indigo-300">{cat?.name || 'عام'}</strong>
                      <span className="text-slate-400 block text-[10px]">تاريخ الإرسال: {sub.submittedAt}</span>
                    </div>
                  </div>

                  {/* Feedback or Rejection Note */}
                  {sub.adminFeedback && (
                    <div className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/40">
                      <strong>ملاحظات الإدارة:</strong> {sub.adminFeedback}
                    </div>
                  )}

                  {/* ADMIN SOURCE-URL UX (Section 4 & 10 Requirement) */}
                  <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-400 font-medium flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-sky-500" />
                        <span>توثيق المصدر الأصلي (خاص بالأدمن)</span>
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        sub.verificationStatus === 'VERIFIED'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      }`}>
                        {sub.verificationStatus || 'USER_SUGGESTED'}
                      </span>
                    </div>

                    {/* Source Book Page URL Controls */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500 shrink-0 font-medium">صفحة الكتاب:</span>
                        {(sub.sourceRecordUrl || sub.sourceUrl) ? (
                          <div className="flex items-center gap-1.5">
                            {/* Copy Source URL (Section 10 Requirement: "نسخ رابط المصدر") */}
                            <button
                              type="button"
                              onClick={() => handleCopySourceUrl(sub)}
                              className="px-2 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                              title="نسخ رابط المصدر إلى الحافظة"
                            >
                              <Copy className="w-3 h-3" />
                              <span>{copiedUrlSubId === sub.id ? 'تم النسخ!' : 'نسخ رابط المصدر'}</span>
                            </button>

                            {/* Open Source Page Externally (Section 4 & 10 Requirement: "فتح صفحة المصدر خارج المنصة" ADMIN ONLY) */}
                            <a
                              href={sub.sourceRecordUrl || sub.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                              title="فتح صفحة المصدر في نافذة مستقلة للاستحواذ اليدوي"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>فتح صفحة المصدر خارج المنصة</span>
                            </a>
                          </div>
                        ) : (
                          <span className="text-rose-500 font-semibold text-[10px]">غير متوفر</span>
                        )}
                      </div>

                      {/* Download URL display */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200 dark:border-slate-800/80">
                        <span className="text-slate-500 shrink-0 font-medium">رابط التحميل:</span>
                        {sub.downloadUrl ? (
                          <div className="flex items-center gap-2 font-mono text-[10px] text-emerald-600 dark:text-emerald-400 truncate max-w-[240px]">
                            <FileDown className="w-3 h-3 shrink-0" />
                            <span className="truncate">{sub.downloadUrl}</span>
                          </div>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 text-[10px] font-medium">
                            غير متوفر (يتطلب استحواذاً يدوياً)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions Footer Controls (Section 7, 8, 9 Requirement) */}
                {!isApproved && !isRejected && (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    {/* Rejection Control */}
                    <button
                      disabled={isBusy}
                      onClick={() => setRejectingSub(sub)}
                      className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-600 text-rose-700 dark:text-rose-300 hover:text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>رفض الاقتراح</span>
                    </button>

                    <div className="flex items-center gap-2">
                      {/* Manual Acquisition Transition Control (Section 9 Requirement) */}
                      {isPendingReview && (
                        <button
                          disabled={isBusy}
                          onClick={() => handleMarkManualAcquisition(sub)}
                          className="px-3 py-1.5 bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-600 text-purple-700 dark:text-purple-300 hover:text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          title="تحويل الكتاب لحالة انتظار الاستحواذ اليدوي من المصدر الخارجي"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>انتظار الاستحواذ اليدوي</span>
                        </button>
                      )}

                      {/* Manual File Attachment Button (when in NEEDS_MANUAL_ACQUISITION) */}
                      {isNeedsManual && (
                        <button
                          disabled={isBusy}
                          onClick={() => {
                            setAttachingSub(sub);
                            setManualFilePath(sub.serverFilePath || '');
                          }}
                          className="px-3 py-1.5 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-600 text-sky-700 dark:text-sky-300 hover:text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>تحديد الملف المستحوذ عليه</span>
                        </button>
                      )}

                      {/* Accept / Final Approve Button */}
                      <button
                        disabled={isBusy}
                        onClick={() => {
                          setApprovingSub(sub);
                          setSelectedApprovedCatId(sub.suggestedCategoryId);
                        }}
                        className={`px-4 py-1.5 text-white rounded-xl text-xs font-semibold shadow-md transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                          isReadyFinal
                            ? 'bg-sky-600 hover:bg-sky-500 shadow-sky-600/30'
                            : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                        }`}
                      >
                        {isBusy ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>جاري المعالجة...</span>
                          </>
                        ) : isReadyFinal ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>موافقة نهائية</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>{sub.downloadUrl ? 'قبول واستيراد تلقائي' : 'اعتماد'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation & Category Confirmation Modal (Accept Flow) */}
      {approvingSub && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              تأكيد اعتماد ونشر الكتاب
            </h3>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              سيتم اعتماد كتاب <strong className="text-slate-900 dark:text-white">"{approvingSub.title}"</strong> وإضافته للمستودع الرقمي المركزي.
              {approvingSub.downloadUrl && (
                <span className="block text-sky-600 dark:text-sky-400 mt-1 font-medium">
                  • سيقوم الخادم المركزي بالتحقق الأمني من الرابط، وتنزيل الملف، وحساب البصمة SHA-256 تلقائياً.
                </span>
              )}
            </p>

            <div className="space-y-1 text-xs">
              <label className="block text-slate-700 dark:text-slate-300 font-medium">تأكيد التصنيف النهائي للكتاب:</label>
              <select
                value={selectedApprovedCatId}
                onChange={(e) => setSelectedApprovedCatId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-100 outline-none"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setApprovingSub(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleExecuteApproval(approvingSub, selectedApprovedCatId)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
              >
                تأكيد الاعتماد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Metadata Modal (Section 7 Requirement) */}
      {editingSub && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-indigo-500" />
                تعديل وتدقيق بيانات الاقتراح
              </h3>
              <button onClick={() => setEditingSub(null)} className="text-slate-400 hover:text-slate-200 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedMetadata} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">عنوان الكتاب *</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">المؤلف أو المحقق *</label>
                <input
                  type="text"
                  required
                  value={editAuthor}
                  onChange={(e) => setEditAuthor(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">التصنيف الأكاديمي</label>
                  <select
                    value={editCategoryId}
                    onChange={(e) => setEditCategoryId(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">الرقم الدولي (ISBN)</label>
                  <input
                    type="text"
                    value={editIsbn}
                    onChange={(e) => setEditIsbn(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 font-mono outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">رابط التحميل المباشر</label>
                <input
                  type="url"
                  value={editDownloadUrl}
                  onChange={(e) => setEditDownloadUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 font-mono outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">نبذة عن الكتاب</label>
                <textarea
                  rows={2}
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingSub(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual File Attachment Modal (Section 9 Requirement) */}
      {attachingSub && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
              <FileText className="w-5 h-5 text-sky-500" />
              تحديد ملف الكتاب المستحوذ عليه يدوياً
            </h3>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              بعد قيامك بتحميل الملف يدوياً من صفحة المصدر، أدخل المسار الداخلي للملف أو اختره لنقله لحالة <strong className="text-sky-600 dark:text-sky-400">جاهز للاعتماد النهائي</strong>.
            </p>

            <form onSubmit={handleSaveManualAttachment} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  المسار النسبي أو اسم الملف في المستودع الرقمي:
                </label>
                <input
                  type="text"
                  required
                  value={manualFilePath}
                  onChange={(e) => setManualFilePath(e.target.value)}
                  placeholder="LibraryData/books/digital/book.pdf"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 font-mono outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setAttachingSub(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                >
                  جاهز للاعتماد النهائي
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectingSub && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
              <XCircle className="w-5 h-5 text-rose-500" />
              تأكيد رفض اقتراح الكتاب
            </h3>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              يرجى كتابة سبب الرفض ليتم إرساله في إشعار رسمي للطالب:
            </p>

            <textarea
              rows={3}
              required
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="سبب الرفض (مثال: عدم وضوح الطبعة أو توفر نسخة أفضل مسبقاً)..."
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-800 dark:text-slate-200 outline-none resize-none"
            />

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setRejectingSub(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleExecuteRejection}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
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
