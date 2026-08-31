import React, { useState } from 'react';
import {
  GraduationCap,
  BookOpen,
  Library,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RotateCcw,
  MessageSquare,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  ChevronLeft,
  Calendar,
  Globe2,
  History,
  X,
  Bookmark,
  PlusCircle,
  MapPin,
} from 'lucide-react';
import {
  User,
  LoanRecord,
  DigitalBook,
  ReadingProgress,
  StudentNote,
  PendingBookSubmission,
  PhysicalBookmark,
} from '../../types/library';

interface StudentPortalViewProps {
  currentUser: User;
  loans: LoanRecord[];
  digitalBooks: DigitalBook[];
  readingProgress: Record<string, ReadingProgress>;
  notes: StudentNote[];
  submissions: PendingBookSubmission[];
  physicalBookmarks?: PhysicalBookmark[];
  onOpenReader: (book: DigitalBook) => void;
  onNavigate: (tab: any) => void;
  onDismissProgress?: (bookId: string) => void;
  onClearCompletedProgress?: () => void;
  onOpenPhysicalBookmark?: (bookmark?: PhysicalBookmark, loan?: LoanRecord) => void;
}

export const StudentPortalView: React.FC<StudentPortalViewProps> = ({
  currentUser,
  loans = [],
  digitalBooks = [],
  readingProgress = {},
  notes = [],
  submissions = [],
  physicalBookmarks = [],
  onOpenReader,
  onNavigate,
  onDismissProgress,
  onClearCompletedProgress,
  onOpenPhysicalBookmark,
}) => {
  const [showAllLoansModal, setShowAllLoansModal] = useState(false);

  // Student specific data
  const myLoans = (loans || []).filter((l) => l.studentId === currentUser?.id);
  const myActiveLoans = myLoans.filter((l) => l.status !== 'returned');
  const myOverdueLoans = myLoans.filter((l) => l.status === 'overdue');
  const myReturnedLoans = myLoans.filter((l) => l.status === 'returned');
  const mySubmissions = (submissions || []).filter((s) => s.studentId === currentUser?.id);
  const myNotes = notes || [];

  // Active in-progress digital books strictly for current student
  const inProgressBooks = Object.entries(readingProgress || {})
    .map(([bookId, prog]) => {
      const book = (digitalBooks || []).find((b) => b.id === bookId);
      return book ? { book, prog } : null;
    })
    .filter(Boolean) as { book: DigitalBook; prog: ReadingProgress }[];

  const completedBooksCount = inProgressBooks.filter(
    (item) => item.prog.isCompleted || (item.prog.currentPage >= (item.prog.totalPages || 1))
  ).length;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Student Welcome Banner */}
      <div className="bg-gradient-to-r from-indigo-900/80 via-slate-900 to-indigo-950/80 text-white border border-indigo-500/30 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 text-xs font-semibold whitespace-nowrap">
                فضاء الطالب المخصص للأبحاث
              </span>
              <span className="text-xs text-slate-300 font-mono truncate">
                رقم القيد: {currentUser.registrationNumber}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight leading-snug break-words">
              مرحباً بك، {currentUser.name}
            </h2>
            <p className="text-xs sm:text-sm text-slate-200 max-w-xl leading-relaxed break-words">
              قسم: <strong className="text-indigo-200">{currentUser.grade || 'طالب باحث'}</strong> • مساحتك الأكاديمية لمتابعة الإعارات الورقية، مطالعة المستودع الرقمي، وتدوين الملاحظات.
            </p>
          </div>

          {/* Account Status Badge & Quick Portal Icon */}
          <div className="shrink-0 flex flex-wrap items-center gap-2.5 sm:gap-3 pt-2 md:pt-0">
            {/* Compact Quick Portal Gateway Icon */}
            <button
              onClick={() => onNavigate('portals')}
              title="بوابة المكتبات المعتمدة - تصفح واستيراد الكتب"
              className="p-3 bg-white/10 hover:bg-white/20 border border-white/20 hover:border-sky-400 text-sky-200 hover:text-white rounded-2xl flex items-center gap-2 transition-all cursor-pointer shadow-md group"
            >
              <Globe2 className="w-5 h-5 text-sky-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-semibold hidden sm:inline">بوابة المكتبات</span>
            </button>

            {currentUser.isBlocked ? (
              <div className="bg-rose-950/90 border border-rose-600/80 rounded-2xl p-3.5 text-xs text-rose-200 flex items-center gap-2.5 shadow-lg">
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
                <div>
                  <div className="font-bold">الحساب مقيد مؤقتاً</div>
                  <div className="text-[11px] text-rose-300/90">
                    يرجى مراجعة أمين المكتبة لإرجاع الكتب المتأخرة
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-950/80 border border-emerald-600/60 rounded-2xl p-3.5 text-xs text-emerald-200 flex items-center gap-2.5 shadow-lg">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <div>
                  <div className="font-bold">حسابك نشط ومؤهل</div>
                  <div className="text-[11px] text-emerald-300/90">
                    يمكنك استعارة كتب جديدة وتصفح المستودع الرقمي
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hub of Active Reading: Side-by-Side Vertical Columns (Paper Reading Progress & Digital Reading Progress) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Column 1: Physical Bookmarks & Paper Reading Progress */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <Bookmark className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                    متابعة القراءة الورقية وفواصل المطالعة ({physicalBookmarks.filter((b) => !b.isCompleted).length})
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    أين وصلت في كتب قاعة المطالعة ومواقع الكتب على الرفوف
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (onOpenPhysicalBookmark) {
                      onOpenPhysicalBookmark();
                    } else {
                      onNavigate('reading_workspace');
                    }
                  }}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>تثبيت فاصل</span>
                </button>
              </div>
            </div>

            {physicalBookmarks.filter((b) => !b.isCompleted).length === 0 ? (
              <div className="text-center py-10 text-slate-400 dark:text-slate-500 text-xs space-y-2">
                <p>لا توجد فواصل نشطة للكتب الورقية حالياً.</p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  عند مطالعتك لأي كتاب في قاعة المكتبة، يمكنك تثبيت رقم الصفحة والخزانة لتتذكر موضعك في زيارتك القادمة.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80 space-y-2">
                {physicalBookmarks
                  .filter((b) => !b.isCompleted)
                  .slice(0, 4)
                  .map((bm) => {
                    const percent = Math.min(100, Math.round((bm.currentPage / (bm.totalPages || 1)) * 100));
                    return (
                      <div
                        key={bm.id}
                        className="pt-2.5 pb-1 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate">
                              {bm.bookTitle}
                            </h4>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap mt-0.5">
                              {bm.bookAuthor && <span>{bm.bookAuthor}</span>}
                              {bm.location && (
                                <span className="text-amber-600 dark:text-amber-400 font-mono flex items-center gap-0.5">
                                  <MapPin className="w-3 h-3 text-amber-500" />
                                  خزانة {bm.location.cabinet} - رف {bm.location.shelf}
                                </span>
                              )}
                            </div>
                            {bm.chapterOrTopic && (
                              <div className="text-[10px] text-slate-600 dark:text-slate-300 font-medium line-clamp-1 mt-0.5">
                                📌 {bm.chapterOrTopic}
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() => {
                              if (onOpenPhysicalBookmark) onOpenPhysicalBookmark(bm);
                              else onNavigate('reading_workspace');
                            }}
                            className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-xl text-[11px] font-bold shrink-0 flex items-center gap-1 cursor-pointer transition-all"
                          >
                            <Bookmark className="w-3 h-3 text-amber-500" />
                            <span>تحديث</span>
                          </button>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className="text-amber-600 dark:text-amber-400 font-bold">
                              صفحة {bm.currentPage} من {bm.totalPages}
                            </span>
                            <span className="text-slate-500 font-semibold">{percent}%</span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-amber-500 to-amber-400 h-full rounded-full transition-all duration-300"
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

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400 text-[11px]">
              مجموع الفواصل: <strong>{physicalBookmarks.length}</strong>
            </span>
            <button
              onClick={() => onNavigate('reading_workspace')}
              className="text-amber-600 dark:text-amber-400 font-semibold hover:underline text-[11px] flex items-center gap-1 cursor-pointer"
            >
              <span>مساحة المطالعة والتلخيص</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Column 2: Digital Reading Progress */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <Library className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                    متابعة القراءة الرقمية ({inProgressBooks.length})
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    أين وصلت في مطالعة الكتب الرقمية والإلكترونية
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {completedBooksCount > 0 && onClearCompletedProgress && (
                  <button
                    onClick={onClearCompletedProgress}
                    className="text-[11px] text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-medium flex items-center gap-1 cursor-pointer transition-colors"
                    title="إزالة جميع الكتب التي تمت قراءتها بالكامل من قائمة المتابعة"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>مسح المكتملة ({completedBooksCount})</span>
                  </button>
                )}

                <button
                  onClick={() => onNavigate('digital')}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>المستودع الرقمي</span>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {inProgressBooks.length === 0 ? (
              <div className="text-center py-10 text-slate-400 dark:text-slate-500 text-xs space-y-2">
                <p>لم تبدأ قراءة أي كتاب إلكتروني بعد.</p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  افتح المستودع الرقمي لبدء القراءة في كتب التراث والمراجع وتدوين الملاحظات.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80 space-y-2">
                {inProgressBooks.slice(0, 4).map(({ book, prog }) => {
                  const total = prog.totalPages || 100;
                  const current = prog.currentPage || 1;
                  const percent = Math.min(100, Math.round((current / total) * 100));
                  const isCompleted = prog.isCompleted || percent >= 100 || current >= total;

                  return (
                    <div key={book.id} className="pt-2.5 pb-1 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-slate-900 dark:text-slate-100 truncate text-xs">
                              {book.title}
                            </h4>
                            {isCompleted ? (
                              <span className="px-2 py-0.2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[9px] font-bold shrink-0">
                                مكتمل
                              </span>
                            ) : (
                              <span className="px-2 py-0.2 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[9px] font-semibold shrink-0">
                                سارٍ
                              </span>
                            )}
                          </div>

                          <div className="text-slate-500 dark:text-slate-400 text-[11px] flex items-center gap-2 mt-0.5">
                            {book.author && <span className="truncate">{book.author}</span>}
                            <span>•</span>
                            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                              صفحة {current} من {total}
                            </span>
                          </div>
                        </div>

                        {/* Action buttons: Continue & Cancel/Dismiss */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => onOpenReader(book)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                          >
                            <BookOpen className="w-3 h-3" />
                            <span>{isCompleted ? 'مراجعة' : 'مواصلة'}</span>
                          </button>

                          {onDismissProgress && (
                            <button
                              onClick={() => onDismissProgress(book.id)}
                              title={isCompleted ? 'إغلاق وإزالة الكتاب المكتمل' : 'إلغاء وإزالة الكتاب'}
                              className="p-1 bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/40 text-slate-500 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                            إنجاز المطالعة
                          </span>
                          <span className="text-slate-500 font-semibold">{percent}%</span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isCompleted ? 'bg-emerald-500' : 'bg-gradient-to-r from-emerald-500 to-teal-400'
                            }`}
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

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400 text-[11px]">
              دفتر الملاحظات: <strong>{myNotes.length}</strong> مسجلة
            </span>
            <button
              onClick={() => onNavigate('digital')}
              className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline text-[11px] cursor-pointer"
            >
              استعراض كل الكتب الرقمية ←
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Full-Width Section: My Physical Loans Record (تحتهما بشكل أفقي) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
              <BookOpen className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                سجل إعاراتي الورقية ({myActiveLoans.length} سارية)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                متابعة الكتب الورقية المستعارة وتواريخ الاستحقاق وفواصل القراءة المرتبطة بها
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAllLoansModal(true)}
            className="text-xs text-sky-600 dark:text-sky-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
          >
            <History className="w-3.5 h-3.5" />
            <span>سجل الإعارات الكامل ({myLoans.length})</span>
          </button>
        </div>

        {myActiveLoans.length === 0 ? (
          <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-xs">
            ليس لديك أي كتب ورقية مستعارة حالياً. يمكنك تصفح المكتبة الورقية واختيار كتاب للاستعارة لدى أمين المكتبة.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {myActiveLoans.map((loan) => {
              const isOverdue = loan.status === 'overdue';
              const bookmark = physicalBookmarks.find((b) => b.bookId === loan.bookId);

              return (
                <div
                  key={loan.id}
                  className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 text-xs transition-all ${
                    isOverdue
                      ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60'
                      : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm line-clamp-1">
                        {loan.bookTitle}
                      </h4>
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

                    <div className="text-slate-500 dark:text-slate-400 text-[11px] space-y-1">
                      <div className="flex items-center justify-between">
                        <span>غرض الإعارة:</span>
                        <span className="text-slate-700 dark:text-slate-300 font-medium">
                          {loan.purpose === 'academic_research' ? 'بحث أكاديمي' : 'مطالعة عامة'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>تاريخ الإعارة:</span>
                        <span className="font-mono text-slate-700 dark:text-slate-300">{loan.issueDate}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>موعد الإرجاع:</span>
                        <span className={`font-mono font-bold ${isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
                          {loan.dueDate}
                        </span>
                      </div>
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
                          <div className="text-[10px] text-slate-600 dark:text-slate-400 truncate">
                            📌 {bookmark.chapterOrTopic}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 italic">
                        لم تثبت فاصل قراءة لهذا الكتاب بعد.
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-end">
                    <button
                      onClick={() => {
                        if (onOpenPhysicalBookmark) {
                          onOpenPhysicalBookmark(bookmark, loan);
                        } else {
                          onNavigate('reading_workspace');
                        }
                      }}
                      className="w-full py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Bookmark className="w-3.5 h-3.5 text-amber-500" />
                      <span>{bookmark ? 'تحديث صفحة القراءة' : 'تثبيت فاصل لهذا الكتاب'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <span>تذكير: لإرجاع أو تمديد الكتب الورقية، يرجى التوجه لمكتب أمين المكتبة</span>
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            الحد الأقصى للإعارة: 14 يوماً قابلة للتمديد
          </span>
        </div>
      </div>

      {/* Section 3: Student Submissions Tracking */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" />
            متابعة الكتب التي رشحتها للمكتبة المركزية ({mySubmissions.length})
          </h3>
          <button
            onClick={() => onNavigate('portals')}
            className="px-3 py-1.5 bg-sky-50 dark:bg-sky-950/50 hover:bg-sky-100 dark:hover:bg-sky-900/50 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Globe2 className="w-3.5 h-3.5 text-sky-500" />
            <span>ترشيح كتاب عبر البوابة</span>
          </button>
        </div>

        {mySubmissions.length === 0 ? (
          <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-xs">
            لم تقم بإرسال أي ترشيحات لكتب بعد. يمكنك استخدام "بوابة المكتبات المعتمدة" للبحث عن مراجع علمية ومخطوطات وترشيحها لأمين المكتبة.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {mySubmissions.map((sub) => {
              const isPending = sub.status === 'pending';
              const isApproved = sub.status === 'approved';
              const isRejected = sub.status === 'rejected';

              return (
                <div
                  key={sub.id}
                  className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-900 dark:text-slate-100 truncate">{sub.title}</h4>
                    <p className="text-slate-500 dark:text-slate-400 text-[11px] truncate mt-0.5">
                      المؤلف: {sub.author} • المصدر: {sub.sourcePortalName}
                    </p>
                    {sub.adminFeedback && (
                      <div className="text-[11px] text-rose-600 dark:text-rose-300 mt-1">
                        ملاحظة أمين المكتبة: {sub.adminFeedback}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0">
                    {isPending && (
                      <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 font-semibold text-[11px] flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>قيد المراجعة</span>
                      </span>
                    )}
                    {isApproved && (
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 font-semibold text-[11px] flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>معتمد في المستودع</span>
                      </span>
                    )}
                    {isRejected && (
                      <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20 font-semibold text-[11px] flex items-center gap-1">
                        <XCircle className="w-3 h-3" />
                        <span>مرفوض</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Student Personal Loans Record Modal */}
      {showAllLoansModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-2xl w-full space-y-4 shadow-2xl animate-in zoom-in-95 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-sky-500" />
                سجل إعاراتي الورقية الكامل ({myLoans.length} عمليات)
              </h3>
              <button onClick={() => setShowAllLoansModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 p-1">
              {myLoans.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  لا توجد أي إعارات مسجلة باسمك حتى الآن.
                </div>
              ) : (
                myLoans.map((loan) => (
                  <div
                    key={loan.id}
                    className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between text-xs gap-3"
                  >
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100">{loan.bookTitle}</h4>
                      <p className="text-slate-500 text-[11px] mt-0.5">
                        تاريخ الاستعارة: {loan.issueDate} • موعد الاستحقاق: {loan.dueDate}
                        {loan.returnDate && ` • أُرجع في: ${loan.returnDate}`}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {loan.status === 'returned' && (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold text-[11px]">
                          أُرجع بنجاح
                        </span>
                      )}
                      {loan.status === 'active' && (
                        <span className="px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 font-semibold text-[11px]">
                          سارية
                        </span>
                      )}
                      {loan.status === 'overdue' && (
                        <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-bold text-[11px]">
                          متأخر
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
              <button
                onClick={() => setShowAllLoansModal(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
