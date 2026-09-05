import React, { useState } from 'react';
import {
  BookOpen,
  Library,
  ArrowLeftRight,
  AlertTriangle,
  Clock,
  PlusCircle,
  Globe2,
  Users,
  CheckCircle2,
  Bookmark,
  FolderTree,
  ChevronLeft,
  Search,
  Sparkles,
  MapPin,
  FileText,
  Play,
  FolderUp,
} from 'lucide-react';
import { BulkDigitalImportModal } from '../digital/BulkDigitalImportModal';
import {
  PhysicalBook,
  DigitalBook,
  LoanRecord,
  Category,
  User,
  PendingBookSubmission,
  PhysicalBookmark,
  ReadingProgress,
} from '../../types/library';

interface OverviewDashboardProps {
  currentUser?: User;
  physicalBooks?: PhysicalBook[];
  digitalBooks?: DigitalBook[];
  loans?: LoanRecord[];
  categories?: Category[];
  users?: User[];
  submissions?: PendingBookSubmission[];
  pendingSubmissions?: PendingBookSubmission[];
  physicalBookmarks?: PhysicalBookmark[];
  readingProgress?: Record<string, ReadingProgress>;
  onNavigate: (tab: any) => void;
  onQuickLoan?: () => void;
  onOpenNewLoanModal?: () => void;
  onOpenBookReader?: (book: DigitalBook) => void;
  onOpenPhysicalBookmark?: (bookmark?: PhysicalBookmark, loan?: LoanRecord) => void;
  onOpenNewPhysicalBookmark?: () => void;
  onBulkAddDigitalBooks?: (books: DigitalBook[]) => void;
  onRefreshBooks?: () => void;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  currentUser = {
    id: 'usr-admin-01',
    name: 'أ. عبد الرحمن الهنائي',
    role: 'admin',
    registrationNumber: 'ADM-2024-01',
    email: 'librarian@school.edu',
    createdAt: '2024-09-01',
  },
  physicalBooks = [],
  digitalBooks = [],
  loans = [],
  categories = [],
  submissions = [],
  pendingSubmissions = [],
  physicalBookmarks = [],
  readingProgress = {},
  onNavigate,
  onQuickLoan,
  onOpenNewLoanModal,
  onOpenBookReader,
  onOpenPhysicalBookmark,
  onOpenNewPhysicalBookmark,
  onBulkAddDigitalBooks,
  onRefreshBooks,
}) => {
  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false);
  const allSubmissions = submissions.length > 0 ? submissions : pendingSubmissions;
  const activeLoans = (loans || []).filter((l) => l.status !== 'returned');
  const overdueLoans = (loans || []).filter((l) => l.status === 'overdue');
  const pendingCount = (allSubmissions || []).filter((s) => s.status === 'pending').length;

  const totalPhysicalCopies = (physicalBooks || []).reduce((acc, b) => acc + (b.totalCopies || 0), 0);
  const availableCopies = (physicalBooks || []).reduce((acc, b) => acc + (b.availableCopies || 0), 0);

  // Digital in-progress books
  const inProgressDigitalBooks = Object.entries(readingProgress || {})
    .map(([bookId, prog]) => {
      const book = (digitalBooks || []).find((b) => b.id === bookId);
      return book ? { book, prog } : null;
    })
    .filter(Boolean) as { book: DigitalBook; prog: ReadingProgress }[];

  const activePhysicalBookmarks = physicalBookmarks.filter((b) => !b.isCompleted);

  const handleLoanAction = () => {
    if (onQuickLoan) onQuickLoan();
    else if (onOpenNewLoanModal) onOpenNewLoanModal();
    else onNavigate('loans');
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-7">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950/70 to-slate-900 border border-slate-800 p-5 sm:p-7 md:p-8 shadow-xl">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 whitespace-nowrap">
                {currentUser.role === 'admin' ? 'لوحة تحكم المشرف المركزي' : 'بوابة الطالب والباحث'}
              </span>
              <span className="text-xs text-slate-400 truncate max-w-[200px] sm:max-w-none">مرحباً بك، {currentUser.name}</span>
            </div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight leading-snug break-words">
              نظام إدارة ومطالعة المكتبة المركزية
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1.5 max-w-2xl leading-relaxed break-words">
              تصفح فهارس الكتب الورقية، تابع تقدم قراءتك في قاعة المطالعة، واقرأ في المستودع الرقمي أو استورد مراجع من المكتبات العالمية المعتمدة.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 shrink-0 pt-2 lg:pt-0">
            {currentUser.role === 'admin' && (
              <>
                <button
                  onClick={handleLoanAction}
                  className="flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer whitespace-nowrap"
                >
                  <PlusCircle className="w-4 h-4 shrink-0" />
                  <span>تسجيل إعارة جديدة</span>
                </button>

                <button
                  onClick={() => setIsBulkImportModalOpen(true)}
                  className="flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-lg shadow-emerald-600/30 transition-all cursor-pointer whitespace-nowrap"
                  title="استيراد مجلد كتب رقمية بالكامل دفعة واحدة"
                >
                  <FolderUp className="w-4 h-4 shrink-0" />
                  <span>استيراد مجلد كتب (Bulk)</span>
                </button>
              </>
            )}
            <button
              onClick={() => onNavigate('reading_workspace')}
              className="flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 bg-amber-600/90 hover:bg-amber-500 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-lg shadow-amber-600/30 transition-all cursor-pointer whitespace-nowrap"
            >
              <Bookmark className="w-4 h-4 shrink-0" />
              <span>مفكرة القراءة والتلخيص</span>
            </button>
            <button
              onClick={() => onNavigate('portals')}
              className="flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap"
            >
              <Globe2 className="w-4 h-4 text-sky-400 shrink-0" />
              <span>المكتبات المعتمدة</span>
            </button>
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="absolute -left-20 -bottom-20 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard
          title="الكتب الورقية"
          value={physicalBooks.length}
          subtext={`${availableCopies} نسخة متوفرة`}
          icon={<BookOpen className="w-5 h-5 text-indigo-400" />}
          onClick={() => onNavigate('search_results')}
        />
        <MetricCard
          title="المستودع الرقمي"
          value={digitalBooks.length}
          subtext="كتب PDF & ePub"
          icon={<Library className="w-5 h-5 text-emerald-400" />}
          onClick={() => onNavigate('digital')}
        />
        <MetricCard
          title="فواصل ورقية جارية"
          value={activePhysicalBookmarks.length}
          subtext="مطالعة بقاعة المكتبة"
          icon={<Bookmark className="w-5 h-5 text-amber-400" />}
          onClick={() => onNavigate('reading_workspace')}
        />
        <MetricCard
          title="مطالعة رقمية جارية"
          value={inProgressDigitalBooks.length}
          subtext="كتب قيد القراءة"
          icon={<Play className="w-5 h-5 text-emerald-400" />}
          onClick={() => onNavigate('search_results')}
        />
        <MetricCard
          title="الإعارات النشطة"
          value={activeLoans.length}
          subtext="قيد التداول حالياً"
          icon={<ArrowLeftRight className="w-5 h-5 text-sky-400" />}
          onClick={() => onNavigate('loans')}
        />
        <MetricCard
          title="التصنيفات المعتمدة"
          value={categories.length}
          subtext="أقسام ومواد دراسية"
          icon={<FolderTree className="w-5 h-5 text-purple-400" />}
          onClick={() => onNavigate('categories')}
        />
      </div>

      {/* =================================================================== */}
      {/* DIRECT IN-DASHBOARD READING PROGRESS & PHYSICAL BOOKMARKS HUB       */}
      {/* =================================================================== */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Bookmark className="w-5 h-5" />
              </span>
              <span>محطة متابعة القراءة والمطالعة الحالية</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              متابعة فورية لأين وصلت في قراءة الكتب الورقية بقاعة المكتبة والمستودع الرقمي
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (onOpenNewPhysicalBookmark) {
                  onOpenNewPhysicalBookmark();
                } else if (onOpenPhysicalBookmark) {
                  onOpenPhysicalBookmark();
                } else {
                  onNavigate('reading_workspace');
                }
              }}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-600/25 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>تثبيت فاصل كتاب ورقي جديد</span>
            </button>
            <button
              onClick={() => onNavigate('reading_workspace')}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>فتح المفكرة الكاملة</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Physical In-Library Bookmarks */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-400" />
                <span>فواصل مطالعة الكتب الورقية بقاعة المكتبة ({activePhysicalBookmarks.length})</span>
              </h4>
              <span className="text-[11px] text-slate-400 font-mono">مطالعة داخلية</span>
            </div>

            {activePhysicalBookmarks.length === 0 ? (
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 mx-auto flex items-center justify-center">
                  <Bookmark className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h5 className="font-bold text-slate-200 text-sm">لم تسجل فواصل مطالعة للكتب الورقية بعد</h5>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    عندما تطالع كتاباً في قاعة المكتبة، ثبّت رقم الصفحة والباب لتعود إليه في أي وقت دون أن تنسى موضعك.
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (onOpenNewPhysicalBookmark) onOpenNewPhysicalBookmark();
                    else if (onOpenPhysicalBookmark) onOpenPhysicalBookmark();
                    else onNavigate('reading_workspace');
                  }}
                  className="px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  + تثبيت فاصل كتاب ورقي الآن
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {activePhysicalBookmarks.slice(0, 3).map((bm) => {
                  const percent = Math.min(100, Math.round((bm.currentPage / (bm.totalPages || 1)) * 100));
                  return (
                    <div
                      key={bm.id}
                      className="p-4 bg-slate-950/70 border border-amber-500/20 rounded-2xl hover:border-amber-500/40 transition-all space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <h5 className="font-bold text-slate-100 text-sm truncate">{bm.bookTitle}</h5>
                          <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                            {bm.bookAuthor && <span>المؤلف: {bm.bookAuthor}</span>}
                            {bm.location && (
                              <>
                                <span>•</span>
                                <span className="text-amber-400 font-mono flex items-center gap-1">
                                  <MapPin className="w-3 h-3 text-amber-500" />
                                  الخزانة {bm.location.cabinet} - الرف {bm.location.shelf}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            if (onOpenPhysicalBookmark) onOpenPhysicalBookmark(bm);
                            else onNavigate('reading_workspace');
                          }}
                          className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
                        >
                          <Bookmark className="w-3.5 h-3.5 text-amber-400" />
                          <span>تحديث الصفحة</span>
                        </button>
                      </div>

                      {/* Progress Bar & Details */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-amber-400 font-bold">
                            وصلت لصفحة {bm.currentPage} من {bm.totalPages}
                          </span>
                          <span className="text-slate-400">{percent}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>

                      {/* Topic or Quick Note */}
                      {(bm.chapterOrTopic || bm.quickNote) && (
                        <div className="p-2 bg-slate-900/80 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1">
                          {bm.chapterOrTopic && (
                            <div className="font-semibold text-amber-300/90 truncate">
                              📌 {bm.chapterOrTopic}
                            </div>
                          )}
                          {bm.quickNote && (
                            <p className="text-slate-400 text-[11px] line-clamp-1 italic">
                              "{bm.quickNote}"
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Digital In-Progress Books */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                <Library className="w-4 h-4 text-emerald-400" />
                <span>متابعة قراءة الكتب الرقمية ({inProgressDigitalBooks.length})</span>
              </h4>
              <button
                onClick={() => onNavigate('digital')}
                className="text-[11px] text-emerald-400 hover:underline cursor-pointer"
              >
                تصفح المستودع
              </button>
            </div>

            {inProgressDigitalBooks.length === 0 ? (
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 mx-auto flex items-center justify-center">
                  <Library className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h5 className="font-bold text-slate-200 text-sm">لا توجد كتب رقمية قيد القراءة حالياً</h5>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    تصفح المستودع الرقمي وافتح أي كتاب بصيغة PDF أو ePub في القارئ المدمج لحفظ تقدمك تلقائياً.
                  </p>
                </div>
                <button
                  onClick={() => onNavigate('digital')}
                  className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  تصفح المستودع الرقمي
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {inProgressDigitalBooks.slice(0, 3).map(({ book, prog }) => {
                  const percent = Math.min(100, Math.round((prog.currentPage / (prog.totalPages || 1)) * 100));
                  return (
                    <div
                      key={book.id}
                      className="p-4 bg-slate-950/70 border border-emerald-500/20 rounded-2xl hover:border-emerald-500/40 transition-all space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              {book.format}
                            </span>
                            <h5 className="font-bold text-slate-100 text-sm truncate">{book.title}</h5>
                          </div>
                          <p className="text-xs text-slate-400 truncate">{book.author}</p>
                        </div>

                        <button
                          onClick={() => {
                            if (onOpenBookReader) onOpenBookReader(book);
                            else onNavigate('digital');
                          }}
                          className="px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>متابعة القراءة</span>
                        </button>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-emerald-400 font-bold">
                            صفحة {prog.currentPage} من {prog.totalPages}
                          </span>
                          <span className="text-slate-400">{percent}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Two Column Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Real-Time Circulation & Urgent Overdues */}
        <div className="lg:col-span-2 space-y-6">
          {/* Urgent Overdue Alert Banner if exists */}
          {overdueLoans.length > 0 && (
            <div className="bg-rose-950/40 border border-rose-800/60 rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-rose-300 font-bold text-sm">
                  <AlertTriangle className="w-5 h-5 text-rose-400 animate-bounce" />
                  <span>تنبيه إعارات ورقية متجاوزة لموعد الإرجاع ({overdueLoans.length})</span>
                </div>
                <button
                  onClick={() => onNavigate('loans')}
                  className="text-xs text-rose-400 hover:text-rose-200 underline font-medium cursor-pointer"
                >
                  إدارة كافة الإعارات
                </button>
              </div>

              <div className="space-y-2">
                {overdueLoans.slice(0, 3).map((loan) => (
                  <div
                    key={loan.id}
                    className="flex items-center justify-between bg-slate-900/80 p-3 rounded-xl border border-rose-900/40"
                  >
                    <div>
                      <div className="font-semibold text-slate-100 text-sm">{loan.bookTitle}</div>
                      <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        <span className="text-rose-400 font-medium">الطالب: {loan.studentName}</span>
                        <span>•</span>
                        <span className="font-mono text-slate-400">{loan.studentRegNumber}</span>
                        <span>•</span>
                        <span className="text-rose-400/80">استحقاق: {loan.dueDate}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => onNavigate('loans')}
                      className="px-3 py-1.5 bg-rose-600/30 hover:bg-rose-600 text-rose-200 text-xs rounded-lg font-medium transition-colors cursor-pointer"
                    >
                      متابعة / إرجاع
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Loans Table Snapshot */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4 text-sky-400" />
                  أحدث عمليات الإعارة الورقية الجارية
                </h3>
                <p className="text-xs text-slate-400">متابعة الكتب المستعارة وفترات الاستحقاق والتمديد</p>
              </div>
              <button
                onClick={() => onNavigate('loans')}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 cursor-pointer"
              >
                <span>عرض الكل ({activeLoans.length})</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            {activeLoans.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                لا توجد إعارات نشطة حالياً. جميع النسخ متوفرة على الرفوف.
              </div>
            ) : (
              <div className="space-y-2.5">
                {activeLoans.slice(0, 4).map((loan) => (
                  <div
                    key={loan.id}
                    className="flex items-center justify-between p-3 bg-slate-950/60 hover:bg-slate-950 border border-slate-800/80 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold ${
                          loan.purpose === 'academic_research'
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                        }`}
                        title={loan.purpose === 'academic_research' ? 'إعارة لأجل بحث' : 'إعارة للمطالعة'}
                      >
                        {loan.purpose === 'academic_research' ? 'بحث' : 'مطالعة'}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-200 text-sm">{loan.bookTitle}</div>
                        <div className="text-xs text-slate-400 flex items-center gap-2">
                          <span className="text-slate-300">{loan.studentName}</span>
                          <span>•</span>
                          <span>تاريخ الإرجاع: <strong className="text-slate-200">{loan.dueDate}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {loan.status === 'extended' && (
                        <span className="text-[11px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">
                          ممددة ({loan.extensionCount})
                        </span>
                      )}
                      <span
                        className={`text-xs px-2.5 py-1 rounded-lg font-medium ${
                          loan.status === 'overdue'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {loan.status === 'overdue' ? 'متأخر' : 'نشطة'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Access to Categories */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-purple-400" />
                تصفح حسب المواد والتصنيفات المدرسية
              </h3>
              <button
                onClick={() => onNavigate('physical')}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
              >
                تصفح الفهرس الكامل
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {categories.slice(0, 6).map((cat) => (
                <div
                  key={cat.id}
                  onClick={() => onNavigate('physical')}
                  className="p-3.5 bg-slate-950/60 hover:bg-slate-950 border border-slate-800 rounded-xl cursor-pointer transition-all group"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="text-[11px] text-slate-400 group-hover:text-slate-200">
                      {cat.booksCount || 0} كتب
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-200 group-hover:text-indigo-400 transition-colors truncate">
                    {cat.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 1 Col: Featured Digital Books & Whitelisted Gateway banner */}
        <div className="space-y-6">
          {/* Whitelisted Portal Shortcut Card */}
          <div className="bg-gradient-to-br from-sky-950/60 to-slate-900 border border-sky-800/40 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <Globe2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-white text-sm">بوابة المكتبات العالمية المعتمدة</h4>
                <p className="text-xs text-sky-200/70">المكتبة الإباضية الشاملة والمصادر الرقمية</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              يمكن للطالب تصفح مصادر التراث والأبحاث بأمان، واستيراد أي كتاب بضغطة زر مع بيانات الفهرسة الكاملة.
            </p>
            <button
              onClick={() => onNavigate('portals')}
              className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-sky-600/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Globe2 className="w-4 h-4" />
              <span>دخول بوابة المكتبة الشاملة</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Digital Books Import Modal */}
      {isBulkImportModalOpen && (
        <BulkDigitalImportModal
          isOpen={isBulkImportModalOpen}
          onClose={() => setIsBulkImportModalOpen(false)}
          categories={categories}
          onImportSuccess={(importedCount) => {
            if (onRefreshBooks) {
              onRefreshBooks();
            }
            setIsBulkImportModalOpen(false);
          }}
        />
      )}
    </div>
  );
};

interface MetricCardProps {
  title: string;
  value: number;
  subtext: string;
  icon: React.ReactNode;
  isAlert?: boolean;
  isWarning?: boolean;
  onClick: () => void;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtext,
  icon,
  isAlert,
  isWarning,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-2xl border transition-all cursor-pointer group ${
        isAlert
          ? 'bg-rose-950/30 border-rose-800/60 hover:border-rose-600'
          : isWarning
          ? 'bg-amber-950/30 border-amber-800/60 hover:border-amber-600'
          : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-400">{title}</span>
        <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 group-hover:scale-110 transition-transform">
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-100 tracking-tight">{value}</div>
      <div className="text-[11px] text-slate-400 mt-1 font-medium">{subtext}</div>
    </div>
  );
};
