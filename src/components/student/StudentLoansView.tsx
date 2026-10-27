import React, { useState } from 'react';
import {
  ArrowLeftRight,
  BookOpen,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  Bookmark,
  MapPin,
  PlusCircle,
  FileText,
  ShieldCheck,
  History,
  ChevronLeft,
  Printer,
} from 'lucide-react';
import { printRequestRepository, DigitalPrintRequest } from '../../services/printRequestRepository';
import {
  User,
  LoanRecord,
  PhysicalLoanRequest,
  PhysicalBook,
  PhysicalBookmark,
  NavigationTab,
} from '../../types/library';

interface StudentLoansViewProps {
  currentUser: User;
  loans: LoanRecord[];
  loanRequests: PhysicalLoanRequest[];
  physicalBooks: PhysicalBook[];
  physicalBookmarks?: PhysicalBookmark[];
  onNavigate: (tab: NavigationTab) => void;
  onOpenPhysicalBookmark?: (book: PhysicalBook) => void;
  onRequestNewLoan?: () => void;
  onCancelLoanRequest?: (requestId: string, reason?: string) => Promise<void> | void;
}

export const StudentLoansView: React.FC<StudentLoansViewProps> = ({
  currentUser,
  loans = [],
  loanRequests = [],
  physicalBooks = [],
  physicalBookmarks = [],
  onNavigate,
  onOpenPhysicalBookmark,
  onRequestNewLoan,
  onCancelLoanRequest,
}) => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'requests' | 'history' | 'print_requests'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [printRequests, setPrintRequests] = useState<DigitalPrintRequest[]>([]);
  const [isLoadingPrints, setIsLoadingPrints] = useState(false);

  const fetchPrintRequests = React.useCallback(async () => {
    try {
      setIsLoadingPrints(true);
      const res = await printRequestRepository.getPrintRequests();
      if (res.success && res.data) {
        setPrintRequests(res.data);
      }
    } catch {
    } finally {
      setIsLoadingPrints(false);
    }
  }, []);

  React.useEffect(() => {
    fetchPrintRequests();
  }, [fetchPrintRequests]);

  const handleCancelPrintRequest = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في إلغاء طلب الطباعة هذا؟')) return;
    try {
      const res = await printRequestRepository.cancelPrintRequest(id);
      if (res.success) {
        setPrintRequests((prev) => prev.filter((r) => r.id !== id));
      } else {
        alert(res.error?.message || 'تعذر إلغاء الطلب.');
      }
    } catch (err: any) {
      alert(err?.message || 'تعذر إلغاء الطلب.');
    }
  };

  // Current student specific data
  const myLoans = (loans || []).filter((l) => l.studentId === currentUser?.id);
  const myActiveLoans = myLoans.filter((l) => l.status !== 'returned');
  const myOverdueLoans = myLoans.filter((l) => l.status === 'overdue');
  const myReturnedLoans = myLoans.filter((l) => l.status === 'returned');
  const myRequests = (loanRequests || []).filter((r) => r.studentId === currentUser?.id);
  const myPendingRequests = myRequests.filter((r) => r.status === 'pending');
  const myApprovedRequests = myRequests.filter((r) => r.status === 'approved');

  // Filtered lists
  const filteredActiveLoans = myActiveLoans.filter((loan) =>
    searchQuery ? loan.bookTitle.toLowerCase().includes(searchQuery.toLowerCase()) : true
  );

  const filteredRequests = myRequests.filter((req) =>
    searchQuery
      ? req.bookTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.purpose.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  );

  const filteredHistory = myReturnedLoans.filter((loan) =>
    searchQuery ? loan.bookTitle.toLowerCase().includes(searchQuery.toLowerCase()) : true
  );

  const filteredPrintRequests = printRequests.filter((req) =>
    searchQuery
      ? req.book_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (req.purpose || '').toLowerCase().includes(searchQuery.toLowerCase())
      : true
  );

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-sky-900/80 via-slate-900 to-indigo-950/80 text-white border border-sky-500/30 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-sky-500/30 text-sky-200 border border-sky-400/30 text-xs font-semibold whitespace-nowrap flex items-center gap-1.5">
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>إعارة الكتب وسجل إعاراتي</span>
              </span>
              <span className="text-xs text-slate-300 font-mono">
                الطالب: {currentUser.name} ({currentUser.registrationNumber})
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              متابعة الإعارات الورقية وطلبات الاستعارة
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              تابع تواريخ استحقاق الكتب المستعارة، حالة طلبات الإعارة قيد مراجعة أمين المكتبة، وسجل قراءتك الورقية المكتملة.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => {
                if (onRequestNewLoan) onRequestNewLoan();
                else onNavigate('physical');
              }}
              className="px-4 py-2.5 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs sm:text-sm transition-all shadow-lg shadow-sky-600/30 flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>طلب استعارة كتاب جديد</span>
            </button>
          </div>
        </div>
      </div>

      {/* Approved Loan Requests Pickup Notice */}
      {myApprovedRequests.length > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/30 flex items-start gap-3.5 text-emerald-950 dark:text-emerald-200 animate-in fade-in">
          <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 shrink-0 mt-0.5">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="space-y-1 min-w-0 flex-1">
            <h4 className="font-bold text-sm text-emerald-800 dark:text-emerald-300">
              تمت الموافقة على طلب الاستعارة! جاهز للاستلام الورقي ({myApprovedRequests.length})
            </h4>
            <p className="text-xs text-emerald-700 dark:text-emerald-300/80 leading-relaxed">
              قام أمين المكتبة باعتماد طلب استعارة كتاب {myApprovedRequests.map((r) => `"${r.bookTitle}"`).join(' و ')}. الكتاب بانتظارك حالياً في مكتب الإعارة لتسلمه ورقياً وبدء فترة الاستعارة.
            </p>
          </div>
          <button
            onClick={() => setActiveFilter('requests')}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shrink-0 cursor-pointer transition-colors"
          >
            عرض التفاصيل
          </button>
        </div>
      )}

      {/* Stats Counter Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
              {myActiveLoans.length}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              كتب مستعارة سارية
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
              {myPendingRequests.length + myApprovedRequests.length}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              طلبات إعارة نشطة
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
              {myOverdueLoans.length}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              كتب متأخرة عن الموعد
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
              {myReturnedLoans.length}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              إعارات سابقة مكتملة
            </div>
          </div>
        </div>
      </div>

      {/* Overdue Warning Alert */}
      {myOverdueLoans.length > 0 && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-800 dark:text-rose-200">
          <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <h4 className="font-bold text-sm">تنبيه: لديك كتب تجاوزت موعد الإرجاع المحدد!</h4>
            <p>
              يرجى التوجه إلى مكتب الإعارة وتسليم الكتب المتأخرة لأمين المكتبة لتجنب تعليق إمكانية استعارة كتب جديدة.
            </p>
          </div>
        </div>
      )}

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-2.5 sm:p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            الكل ({myLoans.length + myRequests.length})
          </button>
          <button
            onClick={() => setActiveFilter('active')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeFilter === 'active'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            الكتب المستعارة حالياً ({myActiveLoans.length})
          </button>
          <button
            onClick={() => setActiveFilter('requests')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeFilter === 'requests'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            طلبات الإعارة ({myRequests.length})
          </button>
          <button
            onClick={() => setActiveFilter('history')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeFilter === 'history'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            السجل المكتمل ({myReturnedLoans.length})
          </button>
          <button
            onClick={() => setActiveFilter('print_requests')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeFilter === 'print_requests'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Printer className="w-3.5 h-3.5 text-amber-400" />
            <span>طلبات طباعة الكتب ({printRequests.length})</span>
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث في سجل الإعارات..."
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pr-8 pl-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-sky-500"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
        </div>
      </div>

      {/* 1. Active Loans Section */}
      {(activeFilter === 'all' || activeFilter === 'active') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-sky-500" />
              <span>الكتب المستعارة حالياً ({filteredActiveLoans.length})</span>
            </h3>
            {activeFilter === 'all' && myActiveLoans.length > 0 && (
              <button
                onClick={() => setActiveFilter('active')}
                className="text-xs text-sky-600 dark:text-sky-400 hover:underline font-semibold"
              >
                عرض الكل
              </button>
            )}
          </div>

          {filteredActiveLoans.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
              <BookOpen className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <div className="space-y-1">
                <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
                  لا توجد كتب ورقية مستعارة بحوزتك حالياً
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  يمكنك تصفح فهرس الكتب الورقية وطلب استعارة أي كتاب متاح لدى أمين المكتبة.
                </p>
              </div>
              <button
                onClick={() => onNavigate('physical')}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>تصفح الفهرس الورقي</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredActiveLoans.map((loan) => {
                const isOverdue = loan.status === 'overdue';
                const book = physicalBooks.find((b) => b.id === loan.bookId);
                const bookmark = physicalBookmarks.find((b) => b.bookId === loan.bookId);

                return (
                  <div
                    key={loan.id}
                    className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 text-xs transition-all shadow-sm ${
                      isOverdue
                        ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-900/60'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm line-clamp-1">
                            {loan.bookTitle}
                          </h4>
                          {book?.author && (
                            <p className="text-slate-500 text-[11px] truncate mt-0.5">
                              المؤلف: {book.author}
                            </p>
                          )}
                        </div>

                        {isOverdue ? (
                          <span className="px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-300 border border-rose-500/20 text-[10px] font-bold flex items-center gap-1 shrink-0">
                            <AlertTriangle className="w-3 h-3" />
                            <span>تجاوزت الموعد</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 text-[10px] font-semibold shrink-0">
                            سارية
                          </span>
                        )}
                      </div>

                      <div className="text-slate-500 dark:text-slate-400 text-[11px] space-y-1 bg-slate-50 dark:bg-slate-950/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80">
                        <div className="flex items-center justify-between">
                          <span>غرض الإعارة:</span>
                          <span className="text-slate-700 dark:text-slate-300 font-medium">
                            {loan.purpose === 'academic_research' ? 'بحث أكاديمي' : 'مطالعة عامة'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>تاريخ الاستعارة:</span>
                          <span className="font-mono text-slate-700 dark:text-slate-300">{loan.issueDate}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>موعد الإرجاع المقرر:</span>
                          <span
                            className={`font-mono font-bold ${
                              isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {loan.dueDate}
                          </span>
                        </div>
                        {book?.location && (
                          <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-800">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-sky-500" />
                              <span>موقع الرف:</span>
                            </span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {book.location.cabinet || 'الخزانة'} - {book.location.shelf || 'الرف'}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Physical Reading Progress & Bookmark info */}
                      {bookmark ? (
                        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-amber-700 dark:text-amber-300 font-bold flex items-center gap-1">
                              <Bookmark className="w-3 h-3 text-amber-500" />
                              وصلت لصفحة {bookmark.currentPage} من {bookmark.totalPages}
                            </span>
                            <span className="font-mono text-amber-600 dark:text-amber-400 font-bold text-[10px]">
                              {Math.round((bookmark.currentPage / (bookmark.totalPages || 1)) * 100)}%
                            </span>
                          </div>
                          {bookmark.chapterOrTopic && (
                            <p className="text-[10px] text-amber-800/80 dark:text-amber-300/80 truncate">
                              📌 {bookmark.chapterOrTopic}
                            </p>
                          )}
                        </div>
                      ) : (
                        book && onOpenPhysicalBookmark && (
                          <button
                            onClick={() => onOpenPhysicalBookmark(book)}
                            className="w-full py-1.5 px-2 bg-amber-500/5 hover:bg-amber-500/10 text-amber-700 dark:text-amber-300 rounded-xl border border-dashed border-amber-500/30 flex items-center justify-center gap-1 text-[11px] font-semibold transition-colors cursor-pointer"
                          >
                            <Bookmark className="w-3 h-3 text-amber-500" />
                            <span>تسجيل فاصل قراءة لهذا الكتاب</span>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2. Loan Requests Section */}
      {(activeFilter === 'all' || activeFilter === 'requests') && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              <span>طلبات الاستعارة المرسلة ({filteredRequests.length})</span>
            </h3>
            {activeFilter === 'all' && myRequests.length > 0 && (
              <button
                onClick={() => setActiveFilter('requests')}
                className="text-xs text-amber-600 dark:text-amber-400 hover:underline font-semibold"
              >
                عرض الكل
              </button>
            )}
          </div>

          {filteredRequests.length === 0 ? (
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
              لا توجد طلبات استعارة مسجلة حالياً.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-sm"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                        {req.bookTitle}
                      </h4>
                      {req.bookAuthor && (
                        <span className="text-slate-500 text-[11px]">— {req.bookAuthor}</span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-3 flex-wrap">
                      <span>السبب: <strong className="text-slate-700 dark:text-slate-300">{req.purpose}</strong></span>
                      {req.requestedDurationDays && (
                        <span>المدة المقترحة: <strong className="font-mono text-slate-700 dark:text-slate-300">{req.requestedDurationDays} يوم</strong></span>
                      )}
                      <span>تاريخ الإرسال: <span className="font-mono">{req.requestedAt}</span></span>
                    </div>

                    {req.adminNotes && (
                      <p className="text-[11px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 p-2 rounded-lg mt-1 border border-indigo-200 dark:border-indigo-900/60">
                        ملاحظة أمين المكتبة: {req.adminNotes}
                      </p>
                    )}

                    {req.rejectionReason && (
                      <p className="text-[11px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 p-2 rounded-lg mt-1 border border-rose-200 dark:border-rose-900/60">
                        سبب عدم الموافقة: {req.rejectionReason}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
                    {(req.status === 'pending' || req.status === 'approved') && onCancelLoanRequest && (
                      <button
                        onClick={async () => {
                          const confirmed = window.confirm('هل أنت متأكد من رغبتك في إلغاء طلب استعارة هذا الكتاب؟');
                          if (confirmed) {
                            await onCancelLoanRequest(req.id, 'ألغاه الطالب');
                          }
                        }}
                        className="px-2.5 py-1 text-xs text-rose-500 hover:text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 rounded-xl transition-colors cursor-pointer font-medium"
                        title="إلغاء طلب الاستعارة"
                      >
                        إلغاء الطلب
                      </button>
                    )}

                    {req.status === 'pending' && (
                      <span className="px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-bold text-xs flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 animate-spin" />
                        <span>قيد المراجعة</span>
                      </span>
                    )}
                    {req.status === 'approved' && (
                      <div className="flex flex-col items-end gap-1">
                        <span className="px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold text-xs flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>معتمد - تفضل باستلام الكتاب</span>
                        </span>
                        {req.approvedDurationDays && (
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-mono">
                            المدة المعتمدة: {req.approvedDurationDays} أيام
                          </span>
                        )}
                      </div>
                    )}
                    {req.status === 'handed_over' && (
                      <span className="px-3 py-1.5 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 font-bold text-xs flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>تم تسليم الكتاب</span>
                      </span>
                    )}
                    {req.status === 'cancelled' && (
                      <span className="px-3 py-1.5 rounded-xl bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20 font-bold text-xs flex items-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>تم الإلغاء</span>
                      </span>
                    )}
                    {req.status === 'rejected' && (
                      <span className="px-3 py-1.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-bold text-xs flex items-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>مرفوض</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. Returned Loans History Section */}
      {(activeFilter === 'all' || activeFilter === 'history') && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
              <History className="w-5 h-5 text-emerald-500" />
              <span>سجل الإعارات المكتملة السابقة ({filteredHistory.length})</span>
            </h3>
            {activeFilter === 'all' && myReturnedLoans.length > 0 && (
              <button
                onClick={() => setActiveFilter('history')}
                className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
              >
                عرض الكل
              </button>
            )}
          </div>

          {filteredHistory.length === 0 ? (
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
              لا توجد إعارات مكتملة بعد.
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredHistory.map((loan) => (
                <div
                  key={loan.id}
                  className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between text-xs gap-3 shadow-xs"
                >
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-slate-100">{loan.bookTitle}</h4>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      تاريخ الاستعارة: <span className="font-mono">{loan.issueDate}</span>
                      {loan.returnDate && (
                        <span> • أُرجع في: <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">{loan.returnDate}</span></span>
                      )}
                    </p>
                  </div>

                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold text-[11px] shrink-0">
                    أُرجع بنجاح ✓
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. Digital Book Print Requests Section */}
      {(activeFilter === 'all' || activeFilter === 'print_requests') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
              <Printer className="w-5 h-5 text-amber-500" />
              <span>طلبات طباعة الكتب الرقمية ({filteredPrintRequests.length})</span>
            </h3>
            {activeFilter === 'all' && printRequests.length > 0 && (
              <button
                onClick={() => setActiveFilter('print_requests')}
                className="text-xs text-amber-600 dark:text-amber-400 hover:underline font-semibold cursor-pointer"
              >
                عرض الكل
              </button>
            )}
          </div>

          {filteredPrintRequests.length === 0 ? (
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
              لا توجد طلبات طباعة رقمية حالياً. يمكنك فتح أي كتاب رقمي والضغط على زر "طلب طباعة" لاقتطاع صفحات محددة.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPrintRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-3 shadow-xs hover:border-amber-500/40 transition-colors"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                        {req.book_title}
                      </h4>
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-mono text-[11px] font-semibold">
                        ص {req.page_from} إلى ص {req.page_to} ({req.total_pages} صفحة)
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500 text-[11px]">
                      <span>
                        الغرض: <strong className="text-slate-700 dark:text-slate-300">{req.purpose || 'بحث صفي'}</strong>
                      </span>
                      <span>
                        تاريخ الطلب: <span className="font-mono">{new Date(req.created_at).toLocaleDateString('ar-EG')}</span>
                      </span>
                      {req.notes && (
                        <span>
                          ملاحظات: <span className="italic text-slate-600 dark:text-slate-400">{req.notes}</span>
                        </span>
                      )}
                    </div>

                    {req.admin_notes && (
                      <div className="text-[11px] text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 px-2 py-1 rounded-lg border border-sky-200 dark:border-sky-800/40">
                        ملاحظة أمين المكتبة: {req.admin_notes}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {req.status === 'pending' && (
                      <>
                        <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-semibold text-[11px]">
                          قيد المراجعة ⏳
                        </span>
                        <button
                          onClick={() => handleCancelPrintRequest(req.id)}
                          className="px-2.5 py-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer text-[11px]"
                          title="إلغاء الطلب"
                        >
                          إلغاء
                        </button>
                      </>
                    )}
                    {req.status === 'approved_printing' && (
                      <span className="px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 font-semibold text-[11px] flex items-center gap-1">
                        <span>جاري الطباعة 🖨️</span>
                      </span>
                    )}
                    {req.status === 'ready_for_pickup' && (
                      <span className="px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 animate-pulse flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>جاهز للاستلام بالمكتبة!</span>
                      </span>
                    )}
                    {req.status === 'completed' && (
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-semibold text-[11px]">
                        تم الاستلام ✓
                      </span>
                    )}
                    {req.status === 'rejected' && (
                      <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-semibold text-[11px]">
                        مرفوض ✕
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
