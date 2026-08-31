import React, { useState } from 'react';
import {
  ArrowLeftRight,
  Search,
  Plus,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  User,
  BookOpen,
  RotateCcw,
  ShieldAlert,
  ChevronRight,
  X,
  FileText,
  Filter,
  Check,
  Ban,
  Send,
  MapPin,
  Sparkles,
  Inbox,
  PackageCheck,
} from 'lucide-react';
import {
  LoanRecord,
  PhysicalBook,
  User as UserType,
  SystemConfig,
  LoanPurpose,
  LoanStatus,
  PhysicalLoanRequest,
} from '../../types/library';

interface LoanManagerViewProps {
  loans: LoanRecord[];
  loanRequests?: PhysicalLoanRequest[];
  physicalBooks: PhysicalBook[];
  students: UserType[];
  config: SystemConfig;
  currentUser: UserType;
  onApproveLoanRequest?: (requestId: string, durationDays: number) => void;
  onRejectLoanRequest?: (requestId: string, reason: string) => void;
  onConfirmHandoverLoanRequest?: (requestId: string) => void;
  onCreateLoan: (params: {
    bookId: string;
    studentId: string;
    purpose: LoanPurpose;
    customDurationDays?: number;
    notes?: string;
    isOverrideExemption?: boolean;
    overrideReason?: string;
  }) => void;
  onExtendLoan: (loanId: string, additionalDays: number, notes?: string) => void;
  onReturnBook: (loanId: string, notes?: string) => void;
  onCheckStudentEligibility: (studentId: string) => {
    canBorrow: boolean;
    reason?: string;
    activeLoansCount: number;
    hasOverdue: boolean;
  };
  isNewLoanModalOpen: boolean;
  setIsNewLoanModalOpen: (open: boolean) => void;
  preSelectedBookId?: string;
}

export const LoanManagerView: React.FC<LoanManagerViewProps> = ({
  loans = [],
  loanRequests = [],
  physicalBooks = [],
  students = [],
  config,
  currentUser,
  onApproveLoanRequest,
  onRejectLoanRequest,
  onConfirmHandoverLoanRequest,
  onCreateLoan,
  onExtendLoan,
  onReturnBook,
  onCheckStudentEligibility,
  isNewLoanModalOpen,
  setIsNewLoanModalOpen,
  preSelectedBookId,
}) => {
  const pendingRequestsCount = loanRequests.filter((r) => r.status === 'pending').length;
  const approvedRequestsCount = loanRequests.filter((r) => r.status === 'approved').length;

  const [activeTab, setActiveTab] = useState<'requests' | 'loans'>(
    pendingRequestsCount > 0 ? 'requests' : 'loans'
  );
  const [requestsFilter, setRequestsFilter] = useState<'all' | 'pending' | 'approved' | 'handed_over' | 'rejected'>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [purposeFilter, setPurposeFilter] = useState<string>('all');

  // Modals & Approval state
  const [extendingLoan, setExtendingLoan] = useState<LoanRecord | null>(null);
  const [returningLoan, setReturningLoan] = useState<LoanRecord | null>(null);
  const [approvingRequest, setApprovingRequest] = useState<PhysicalLoanRequest | null>(null);
  const [approvalDuration, setApprovalDuration] = useState<number>(7);
  const [rejectingRequest, setRejectingRequest] = useState<PhysicalLoanRequest | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');

  // Filtered loans
  const filteredLoans = (loans || []).filter((loan) => {
    const matchesSearch =
      loan.bookTitle.toLowerCase().includes(search.toLowerCase()) ||
      loan.studentName.toLowerCase().includes(search.toLowerCase()) ||
      loan.studentRegNumber.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === 'all' || loan.status === statusFilter;
    const matchesPurpose = purposeFilter === 'all' || loan.purpose === purposeFilter;

    return matchesSearch && matchesStatus && matchesPurpose;
  });

  // Filtered requests
  const filteredRequests = (loanRequests || []).filter((req) => {
    const matchesStatus = requestsFilter === 'all' || req.status === requestsFilter;
    const matchesSearch =
      req.bookTitle.toLowerCase().includes(search.toLowerCase()) ||
      req.studentName.toLowerCase().includes(search.toLowerCase()) ||
      req.studentRegNumber.toLowerCase().includes(search.toLowerCase()) ||
      req.purpose.toLowerCase().includes(search.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  const activeCount = (loans || []).filter((l) => l.status !== 'returned').length;
  const overdueCount = (loans || []).filter((l) => l.status === 'overdue').length;
  const extendedCount = (loans || []).filter((l) => l.status === 'extended').length;
  const returnedCount = (loans || []).filter((l) => l.status === 'returned').length;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg sm:text-xl font-bold text-slate-100 flex items-center gap-2 break-words">
            <ArrowLeftRight className="w-5 h-5 text-sky-400 shrink-0" />
            <span className="break-words">نظام تسيير الإعارات وتتبع الاستحقاق</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed break-words">
            تسجيل الإعارات الورقية، تخصيص فترات المطالعة والبحوث، وإدارة التمديد والمنع التلقائي للمتأخرين
          </p>
        </div>

        {currentUser.role === 'admin' && (
          <button
            onClick={() => setIsNewLoanModalOpen(true)}
            className="flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer whitespace-nowrap self-start md:self-auto shrink-0"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>تسجيل إعارة كتاب ورقي</span>
          </button>
        )}
      </div>

      {/* Main Tab Switcher */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-900 border border-slate-800 rounded-2xl">
        <button
          onClick={() => setActiveTab('requests')}
          className={`flex items-center gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'requests'
              ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Inbox className="w-4 h-4 shrink-0" />
          <span>طلبات الإعارة الواردة</span>
          {pendingRequestsCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-500 text-white font-bold animate-pulse">
              {pendingRequestsCount} جديد
            </span>
          )}
          {approvedRequestsCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
              {approvedRequestsCount} بانتظار التسليم
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('loans')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'loans'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <ArrowLeftRight className="w-4 h-4" />
          <span>سجل الإعارات النشطة والتاريخ ({loans.length})</span>
          {overdueCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-500 text-white font-bold">
              {overdueCount} متأخر
            </span>
          )}
        </button>
      </div>

      {/* SUB-VIEW 1: LOAN REQUESTS QUEUE */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          {/* Requests Status Filter */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto text-xs">
              <button
                onClick={() => setRequestsFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  requestsFilter === 'all'
                    ? 'bg-slate-100 text-slate-900 font-bold'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
              >
                الكل ({loanRequests.length})
              </button>
              <button
                onClick={() => setRequestsFilter('pending')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  requestsFilter === 'pending'
                    ? 'bg-amber-600 text-white font-bold'
                    : 'bg-slate-950 text-amber-400 hover:bg-amber-950/30'
                }`}
              >
                <span>طلبات قيد المراجعة</span>
                <span className="text-[10px] bg-amber-950 px-1 rounded">{pendingRequestsCount}</span>
              </button>
              <button
                onClick={() => setRequestsFilter('approved')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  requestsFilter === 'approved'
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'bg-slate-950 text-emerald-400 hover:bg-emerald-950/30'
                }`}
              >
                <span>مقبولة (بانتظار تسليم النسخة)</span>
                <span className="text-[10px] bg-emerald-950 px-1 rounded">{approvedRequestsCount}</span>
              </button>
              <button
                onClick={() => setRequestsFilter('handed_over')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  requestsFilter === 'handed_over'
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
              >
                تم التسليم وخروج الكتاب
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث في الطلبات..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-3 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Requests List */}
          {filteredRequests.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-2">
              <Inbox className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-slate-300">لا توجد طلبات إعارة مطابقة</h3>
              <p className="text-xs text-slate-500">
                عندما يقدم الطلبة طلبات استعارة لكتب ورقية، ستظهر هنا للمراجعة والموافقة
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredRequests.map((req) => {
                const book = physicalBooks.find((b) => b.id === req.bookId);

                return (
                  <div
                    key={req.id}
                    className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 space-y-4 shadow-md transition-all"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                              req.status === 'pending'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
                                : req.status === 'approved'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : req.status === 'handed_over'
                                ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            }`}
                          >
                            {req.status === 'pending' && 'قيد مراجعة أمين المكتبة'}
                            {req.status === 'approved' && 'تمت الموافقة - بانتظار استلام الكتاب من الرف'}
                            {req.status === 'handed_over' && 'تم تأكيد خروج الكتاب وتسليمه للطالب'}
                            {req.status === 'rejected' && 'طلب مرفوض'}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {req.requestDate}
                          </span>
                        </div>

                        <h3 className="font-bold text-slate-100 text-sm mt-2">{req.bookTitle}</h3>
                        <p className="text-xs text-slate-400">المؤلف: {req.bookAuthor}</p>
                      </div>

                      {book && (
                        <div className="text-left shrink-0">
                          <span className="text-[10px] px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 font-mono border border-slate-700">
                            متوفر: {book.availableCopies} / {book.totalCopies}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Shelf Location Box */}
                    {book && (
                      <div className="p-2.5 bg-slate-950/80 border border-slate-800/80 rounded-xl text-xs flex items-center justify-between text-slate-300">
                        <span className="flex items-center gap-1 text-slate-400">
                          <MapPin className="w-3.5 h-3.5 text-sky-400" />
                          الموقع على الرف:
                        </span>
                        <span className="font-semibold text-sky-300">
                          {book.location?.cabinet} • {book.location?.shelf}
                        </span>
                      </div>
                    )}

                    {/* Student details & Purpose */}
                    <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-indigo-400" />
                          <span className="font-bold text-slate-200">{req.studentName}</span>
                          <span className="text-slate-400">({req.studentGrade || 'طالب'})</span>
                        </div>
                        <span className="font-mono text-[11px] text-slate-500">{req.studentRegNumber}</span>
                      </div>

                      <div className="pt-1.5 border-t border-slate-800 flex items-start gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-slate-400">سبب الإعارة: </span>
                          <strong className="text-slate-200">{req.purpose}</strong>
                          {req.customReason && (
                            <p className="text-slate-300 mt-1 italic bg-slate-900/90 p-2 rounded-lg border border-slate-800/80">
                              "{req.customReason}"
                            </p>
                          )}
                        </div>
                      </div>

                      {req.requestedDurationDays && (
                        <div className="pt-1 text-[11px] text-amber-400 flex items-center justify-between font-medium">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            <span>المدة المطلوبة من الطالب:</span>
                          </span>
                          <strong className="bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded text-amber-300">
                            {req.requestedDurationDays} يوماً
                          </strong>
                        </div>
                      )}

                      {req.approvedDurationDays && (
                        <div className="pt-1 text-[11px] text-emerald-400 flex items-center justify-between font-semibold">
                          <span className="flex items-center gap-1">
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>المدة المعتمدة من أمين المكتبة:</span>
                          </span>
                          <strong className="bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded text-emerald-300">
                            {req.approvedDurationDays} يوماً
                          </strong>
                        </div>
                      )}
                    </div>

                    {/* Actions based on status */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-end gap-2">
                      {req.status === 'pending' && (
                        <>
                          <button
                            onClick={() => {
                              setRejectingRequest(req);
                              setRejectReason('');
                            }}
                            className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                          >
                            رفض الطلب
                          </button>

                          <button
                            onClick={() => {
                              setApprovingRequest(req);
                              if (req.requestedDurationDays && req.requestedDurationDays > 0) {
                                setApprovalDuration(req.requestedDurationDays);
                              } else if (req.purpose.includes('بحث') || req.purpose.includes('مشروع')) {
                                setApprovalDuration(config.academicResearchDurationDays || 14);
                              } else {
                                setApprovalDuration(config.generalReadingDurationDays || 7);
                              }
                            }}
                            className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-sky-600/20 transition-all cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>تحديد المدة والموافقة</span>
                          </button>
                        </>
                      )}

                      {req.status === 'approved' && (
                        <button
                          onClick={() => {
                            if (onConfirmHandoverLoanRequest) {
                              onConfirmHandoverLoanRequest(req.id);
                            }
                          }}
                          className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
                        >
                          <PackageCheck className="w-4 h-4" />
                          <span>تأكيد خروج الكتاب وتسليمه للطالب (تحديث الفهرس)</span>
                        </button>
                      )}

                      {req.status === 'handed_over' && (
                        <span className="text-xs text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>الكتاب بحوزة الطالب ومسجل في الإعارات النشطة</span>
                        </span>
                      )}

                      {req.status === 'rejected' && (
                        <span className="text-xs text-rose-400 flex items-center gap-1">
                          <Ban className="w-4 h-4" />
                          <span>تم رفض الطلب: {req.rejectionReason || 'غير محدد'}</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-VIEW 2: ACTIVE LOANS */}
      {activeTab === 'loans' && (
        <div className="space-y-6">
      {overdueCount > 0 && (
        <div className="bg-rose-950/40 border border-rose-800/80 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <div className="font-bold text-rose-200 text-sm">
                تنبيه: يوجد {overdueCount} إعارات متأخرة تجاوزت موعد الاستحقاق
              </div>
              <div className="text-xs text-rose-300/80 mt-0.5">
                وفقاً لسياسة المكتبة، يتم حظر الطلبة المتأخرين تلقائياً من استعارة كتب جديدة حتى إرجاع النسخ السابقة.
              </div>
            </div>
          </div>
          <button
            onClick={() => setStatusFilter('overdue')}
            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shrink-0 transition-colors"
          >
            عرض المتأخرين فقط
          </button>
        </div>
      )}

      {/* Search & Tabs */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="البحث باسم الطالب، رقم التسجيل، أو عنوان الكتاب..."
              className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 rounded-xl pr-10 pl-4 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={purposeFilter}
              onChange={(e) => setPurposeFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none focus:border-indigo-500"
            >
              <option value="all">كل أغراض الإعارة</option>
              <option value="general_reading">مطالعة عامة ({config.generalReadingDurationDays} أيام)</option>
              <option value="academic_research">بحث أكاديمي ({config.academicResearchDurationDays} يوماً)</option>
            </select>
          </div>
        </div>

        {/* Status Filter Badges */}
        <div className="flex items-center gap-2 overflow-x-auto text-xs pt-1">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              statusFilter === 'all'
                ? 'bg-slate-100 text-slate-900 font-bold'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200'
            }`}
          >
            جميع السجلات ({loans.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
              statusFilter === 'active'
                ? 'bg-sky-600 text-white font-bold'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>النشطة</span>
            <span className="text-[10px] bg-sky-950 px-1 rounded">{activeCount}</span>
          </button>
          <button
            onClick={() => setStatusFilter('overdue')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
              statusFilter === 'overdue'
                ? 'bg-rose-600 text-white font-bold'
                : 'bg-slate-950 text-rose-400 hover:bg-rose-950/30'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>المتأخرة</span>
            <span className="text-[10px] bg-rose-950 px-1 rounded">{overdueCount}</span>
          </button>
          <button
            onClick={() => setStatusFilter('extended')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
              statusFilter === 'extended'
                ? 'bg-amber-600 text-white font-bold'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>الممددة</span>
            <span className="text-[10px] bg-amber-950 px-1 rounded">{extendedCount}</span>
          </button>
          <button
            onClick={() => setStatusFilter('returned')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
              statusFilter === 'returned'
                ? 'bg-emerald-600 text-white font-bold'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>المسترجعة</span>
            <span className="text-[10px] bg-emerald-950 px-1 rounded">{returnedCount}</span>
          </button>
        </div>
      </div>

      {/* Loans Table / Cards */}
      {filteredLoans.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/40 border border-slate-800 rounded-2xl">
          <ArrowLeftRight className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-300">لا توجد سجلات إعارة مطابقة</h3>
          <p className="text-xs text-slate-500 mt-1">تأكد من شروط البحث أو الفلاتر المحددة</p>
        </div>
      ) : (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold">
                <tr>
                  <th className="py-3.5 px-4">الكتاب الورقي المستعار</th>
                  <th className="py-3.5 px-4">الطالب المستعير</th>
                  <th className="py-3.5 px-4">غرض الإعارة</th>
                  <th className="py-3.5 px-4">تاريخ الإعارة</th>
                  <th className="py-3.5 px-4">موعد الاستحقاق</th>
                  <th className="py-3.5 px-4">الحالة والتمديد</th>
                  <th className="py-3.5 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {filteredLoans.map((loan) => {
                  const isOverdue = loan.status === 'overdue';
                  const isReturned = loan.status === 'returned';

                  return (
                    <tr
                      key={loan.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isOverdue ? 'bg-rose-950/20' : ''
                      }`}
                    >
                      {/* Book Title */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-100">{loan.bookTitle}</div>
                        {loan.notes && (
                          <div className="text-[11px] text-slate-400 truncate max-w-xs">{loan.notes}</div>
                        )}
                      </td>

                      {/* Student Info */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-200">{loan.studentName}</div>
                        <div className="text-[11px] font-mono text-slate-400">{loan.studentRegNumber}</div>
                        {loan.isOverrideExemption && (
                          <span className="text-[10px] text-amber-400 block" title={loan.overrideReason}>
                            ★ استثناء إداري مبرر
                          </span>
                        )}
                      </td>

                      {/* Purpose */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-md font-medium text-[11px] ${
                            loan.purpose === 'academic_research'
                              ? 'bg-purple-500/15 text-purple-300 border border-purple-500/20'
                              : 'bg-sky-500/15 text-sky-300 border border-sky-500/20'
                          }`}
                        >
                          {loan.purpose === 'academic_research' ? 'بحث أكاديمي' : 'مطالعة عامة'}
                        </span>
                      </td>

                      {/* Issue Date */}
                      <td className="py-3.5 px-4 font-mono text-slate-300">{loan.issueDate}</td>

                      {/* Due Date */}
                      <td className="py-3.5 px-4 font-mono">
                        <span className={isOverdue ? 'text-rose-400 font-bold' : 'text-slate-200'}>
                          {loan.dueDate}
                        </span>
                        {isReturned && loan.returnDate && (
                          <span className="text-[10px] text-emerald-400 block">أُرجع في {loan.returnDate}</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                              isOverdue
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : isReturned
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                            }`}
                          >
                            {isOverdue && <AlertTriangle className="w-3 h-3 text-rose-400" />}
                            {isReturned && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                            <span>
                              {isOverdue
                                ? 'متأخر (محظور)'
                                : isReturned
                                ? 'تم الإرجاع'
                                : 'قيد الاستعارة'}
                            </span>
                          </span>
                          {loan.extensionCount > 0 && (
                            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono">
                              +{loan.extensionCount} تمديد
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        {!isReturned ? (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => setExtendingLoan(loan)}
                              disabled={loan.extensionCount >= loan.maxExtensionsAllowed}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                                loan.extensionCount >= loan.maxExtensionsAllowed
                                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                  : 'bg-amber-600/30 hover:bg-amber-600 text-amber-200 cursor-pointer'
                              }`}
                              title={
                                loan.extensionCount >= loan.maxExtensionsAllowed
                                  ? 'تم استنفاد مرات التمديد المسموحة'
                                  : 'تمديد مدة الإعارة'
                              }
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>تمديد</span>
                            </button>

                            <button
                              onClick={() => setReturningLoan(loan)}
                              className="px-2.5 py-1 bg-emerald-600/30 hover:bg-emerald-600 text-emerald-200 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                              title="تسجيل إرجاع الكتاب واستعادة النسخة"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>إرجاع</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[11px]">مكتمل</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </div>
      )}

      {/* New Loan Modal */}
      {isNewLoanModalOpen && (
        <NewLoanModal
          books={physicalBooks}
          students={students}
          config={config}
          preSelectedBookId={preSelectedBookId}
          onClose={() => setIsNewLoanModalOpen(false)}
          onCheckEligibility={onCheckStudentEligibility}
          onSave={(data) => {
            onCreateLoan(data);
            setIsNewLoanModalOpen(false);
          }}
        />
      )}

      {/* Extend Loan Modal */}
      {extendingLoan && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-400" />
                تمديد فترة إعارة الكتاب
              </h3>
              <button onClick={() => setExtendingLoan(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div>
                الكتاب: <strong className="text-slate-100">{extendingLoan.bookTitle}</strong>
              </div>
              <div>
                الطالب: <strong className="text-slate-100">{extendingLoan.studentName}</strong>
              </div>
              <div>
                تاريخ الاستحقاق الحالي:{' '}
                <strong className="text-amber-400 font-mono">{extendingLoan.dueDate}</strong>
              </div>
              <div>
                مرات التمديد السابقة:{' '}
                <span className="font-mono">
                  {extendingLoan.extensionCount} من {extendingLoan.maxExtensionsAllowed}
                </span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block text-slate-300 font-medium">عدد الأيام الإضافية للتمديد:</label>
              <div className="grid grid-cols-3 gap-2">
                {[7, 10, 14].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => {
                      onExtendLoan(extendingLoan.id, days, 'طلب تمديد بحثي من الطالب');
                      setExtendingLoan(null);
                    }}
                    className="py-2 bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-200 rounded-xl font-semibold transition-colors"
                  >
                    +{days} أيام
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setExtendingLoan(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Loan Confirmation Modal */}
      {returningLoan && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                تأكيد إرجاع الكتاب واستعادة النسخة
              </h3>
              <button onClick={() => setReturningLoan(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              سيتم تسجيل إرجاع كتاب <strong className="text-white">"{returningLoan.bookTitle}"</strong> من الطالب{' '}
              <strong className="text-white">{returningLoan.studentName}</strong>، وإعادة إضافة النسخة إلى رصيد النسخ
              المتوفرة على الرف فوراً.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setReturningLoan(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  onReturnBook(returningLoan.id);
                  setReturningLoan(null);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/30"
              >
                تأكيد الإرجاع الآن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Request Modal */}
      {approvingRequest && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <Check className="w-5 h-5 text-sky-400" />
                الموافقة على طلب الإعارة وتحديد المدة
              </h3>
              <button onClick={() => setApprovingRequest(null)} className="text-slate-400 hover:text-slate-200 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs text-slate-300">
              <div>الكتاب: <strong className="text-slate-100">{approvingRequest.bookTitle}</strong></div>
              <div>المستعير: <strong className="text-slate-100">{approvingRequest.studentName}</strong></div>
              <div>سبب الاستعارة: <strong className="text-sky-300">{approvingRequest.purpose}</strong></div>
              {approvingRequest.customReason && (
                <div className="text-slate-400 italic bg-slate-900 p-2 rounded border border-slate-800">
                  "{approvingRequest.customReason}"
                </div>
              )}
              {approvingRequest.requestedDurationDays && (
                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center justify-between font-semibold">
                  <span>المدة المقترحة من الطالب:</span>
                  <span className="font-mono text-sm">{approvingRequest.requestedDurationDays} يوماً</span>
                </div>
              )}
            </div>

            <div className="space-y-2 text-xs">
              <label className="block text-slate-200 font-bold">
                حدد عدد أيام الإعارة المعتمدة رسمياً بقرار أمين المكتبة:
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[7, 10, 14, 21].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setApprovalDuration(days)}
                    className={`py-2 rounded-xl font-bold transition-colors cursor-pointer ${
                      approvalDuration === days
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {days} أيام
                  </button>
                ))}
              </div>

              <div className="pt-2">
                <label className="block text-slate-400 text-[11px] mb-1">أو أدخل عدداً مخصصاً للأيام:</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={approvalDuration}
                  onChange={(e) => setApprovalDuration(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setApprovingRequest(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onApproveLoanRequest) {
                    onApproveLoanRequest(approvingRequest.id, approvalDuration);
                  }
                  setApprovingRequest(null);
                }}
                className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-md shadow-sky-600/30 cursor-pointer"
              >
                تأكيد الموافقة وإرسال إشعار للطالب
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Request Modal */}
      {rejectingRequest && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <Ban className="w-5 h-5 text-rose-400" />
                رفض طلب استعارة الكتاب
              </h3>
              <button onClick={() => setRejectingRequest(null)} className="text-slate-400 hover:text-slate-200 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-300">
                أدخل سبب الرفض ليتم توضيحه للطالب <strong className="text-slate-100">{rejectingRequest.studentName}</strong> في الإشعار:
              </p>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="مثال: الكتاب محجوز لأغراض الجرد أو يوجد لديك كتاب متأخر..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 outline-none focus:border-rose-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setRejectingRequest(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onRejectLoanRequest) {
                    onRejectLoanRequest(rejectingRequest.id, rejectReason || 'تم رفض الطلب من أمين المكتبة');
                  }
                  setRejectingRequest(null);
                }}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold cursor-pointer"
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

// New Loan Modal Component with Real-Time Eligibility Checking & Override Exemption
interface NewLoanModalProps {
  books: PhysicalBook[];
  students: UserType[];
  config: SystemConfig;
  preSelectedBookId?: string;
  onClose: () => void;
  onCheckEligibility: (studentId: string) => {
    canBorrow: boolean;
    reason?: string;
    activeLoansCount: number;
    hasOverdue: boolean;
  };
  onSave: (data: any) => void;
}

const NewLoanModal: React.FC<NewLoanModalProps> = ({
  books,
  students,
  config,
  preSelectedBookId,
  onClose,
  onCheckEligibility,
  onSave,
}) => {
  const [selectedBookId, setSelectedBookId] = useState(preSelectedBookId || books[0]?.id || '');
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id || '');
  const [purpose, setPurpose] = useState<LoanPurpose>('general_reading');
  const [customDays, setCustomDays] = useState(config.generalReadingDurationDays);
  const [notes, setNotes] = useState('');
  const [isOverride, setIsOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  const eligibility = selectedStudentId ? onCheckEligibility(selectedStudentId) : { canBorrow: true, activeLoansCount: 0, hasOverdue: false };
  const selectedBook = books.find((b) => b.id === selectedBookId);

  const handlePurposeChange = (newPurpose: LoanPurpose) => {
    setPurpose(newPurpose);
    setCustomDays(
      newPurpose === 'academic_research'
        ? config.academicResearchDurationDays
        : config.generalReadingDurationDays
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookId || !selectedStudentId) {
      alert('يرجى اختيار الكتاب والطالب');
      return;
    }

    if (!eligibility.canBorrow && !isOverride) {
      alert(`لا يمكن إتمام الإعارة: ${eligibility.reason}`);
      return;
    }

    if (isOverride && !overrideReason.trim()) {
      alert('يرجى كتابة سبب الاستثناء الإداري لتجاوز المنع التلقائي');
      return;
    }

    onSave({
      bookId: selectedBookId,
      studentId: selectedStudentId,
      purpose,
      customDurationDays: Number(customDays),
      notes,
      isOverrideExemption: isOverride,
      overrideReason,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-indigo-400" />
            تسجيل عملية إعارة جديدة
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Step 1: Select Student */}
          <div className="space-y-1">
            <label className="block text-slate-300 font-medium">الطالب المستعير *</label>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-100 outline-none focus:border-indigo-500 font-medium"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.registrationNumber}) - {s.grade}
                </option>
              ))}
            </select>
          </div>

          {/* Real-time Student Eligibility Status Alert */}
          {!eligibility.canBorrow ? (
            <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-rose-300 font-bold">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>حظر تلقائي: {eligibility.reason}</span>
              </div>

              {/* Admin Override Checkbox */}
              <div className="pt-2 border-t border-rose-900/60 space-y-2">
                <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isOverride}
                    onChange={(e) => setIsOverride(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-0"
                  />
                  <span className="font-semibold text-amber-300">
                    تجاوز المنع بقرار استثنائي من أمين المكتبة (Special Exemption)
                  </span>
                </label>

                {isOverride && (
                  <input
                    type="text"
                    required
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="بيان سبب الاستثناء (مثال: لديه عذر مقبول لتأخير الكتاب السابق وتم الاتفاق على إرجاعه غداً)..."
                    className="w-full bg-slate-900 border border-amber-800/60 rounded-lg px-3 py-1.5 text-slate-100"
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-emerald-400 text-[11px] px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>الطالب مؤهل للاستعارة (لديه {eligibility.activeLoansCount} إعارات سارية)</span>
            </div>
          )}

          {/* Step 2: Select Book */}
          <div className="space-y-1">
            <label className="block text-slate-300 font-medium">الكتاب الورقي المطلوب *</label>
            <select
              value={selectedBookId}
              onChange={(e) => setSelectedBookId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-100 outline-none focus:border-indigo-500"
            >
              {books.map((b) => (
                <option key={b.id} value={b.id} disabled={b.availableCopies <= 0}>
                  {b.title} ({b.availableCopies}/{b.totalCopies} متوفر) - [{b.location.cabinet} • {b.location.shelf}]
                </option>
              ))}
            </select>
          </div>

          {/* Book Location Summary */}
          {selectedBook && (
            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 flex items-center justify-between text-[11px]">
              <span>موقع الكتاب على الرف: <strong className="text-indigo-300">{selectedBook.location.cabinet} - {selectedBook.location.shelf}</strong></span>
              <span className={selectedBook.availableCopies > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                النسخ المتوفرة: {selectedBook.availableCopies}
              </span>
            </div>
          )}

          {/* Step 3: Loan Purpose & Duration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">غرض الإعارة *</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handlePurposeChange('general_reading')}
                  className={`py-2 rounded-xl text-xs font-semibold transition-all ${
                    purpose === 'general_reading'
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-950 text-slate-400 border border-slate-800'
                  }`}
                >
                  مطالعة عامة ({config.generalReadingDurationDays} أيام)
                </button>
                <button
                  type="button"
                  onClick={() => handlePurposeChange('academic_research')}
                  className={`py-2 rounded-xl text-xs font-semibold transition-all ${
                    purpose === 'academic_research'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-950 text-slate-400 border border-slate-800'
                  }`}
                >
                  بحث أكاديمي ({config.academicResearchDurationDays} يوماً)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">مدة الإعارة بالأيام</label>
              <input
                type="number"
                min="1"
                max="60"
                value={customDays}
                onChange={(e) => setCustomDays(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-slate-300 font-medium mb-1">ملاحظات الإعارة (اختياري)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: استعارة لمشروع مادة التاريخ..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={!eligibility.canBorrow && !isOverride}
              className={`px-5 py-2 rounded-xl font-semibold shadow-lg transition-all ${
                !eligibility.canBorrow && !isOverride
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 cursor-pointer'
              }`}
            >
              تأكيد وتسجيل الإعارة
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
