import React, { useState } from 'react';
import {
  Bookmark,
  Sparkles,
  BookOpen,
  Library,
  FileText,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit3,
  Star,
  Quote,
  Clock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Layers,
  MapPin,
  Tag,
  Share2,
  Printer,
  Copy,
  Check,
  Calendar,
  Compass,
} from 'lucide-react';
import {
  PhysicalBookmark,
  BookSummary,
  StudentNote,
  User,
  PhysicalBook,
  DigitalBook,
  LoanRecord,
} from '../../types/library';
import { PhysicalBookmarkModal } from './PhysicalBookmarkModal';
import { BookSummaryModal } from './BookSummaryModal';
import { NoteEditorModal } from './NoteEditorModal';
import { matchesArabicQuery } from '../../utils/searchUtils';

interface ReadingWorkspaceViewProps {
  currentUser: User;
  physicalBookmarks: PhysicalBookmark[];
  summaries: BookSummary[];
  notes: StudentNote[];
  physicalBooks: PhysicalBook[];
  digitalBooks: DigitalBook[];
  loans: LoanRecord[];
  onSaveBookmark: (data: any) => void;
  onDeleteBookmark: (id: string) => void;
  onSaveSummary: (summary: any) => void;
  onDeleteSummary: (id: string) => void;
  onSaveNote: (note: any) => void;
  onDeleteNote: (id: string) => void;
  onOpenDigitalBook?: (book: DigitalBook) => void;
  onNavigateTab: (tab: any) => void;
}

export const ReadingWorkspaceView: React.FC<ReadingWorkspaceViewProps> = ({
  currentUser,
  physicalBookmarks = [],
  summaries = [],
  notes = [],
  physicalBooks = [],
  digitalBooks = [],
  loans = [],
  onSaveBookmark,
  onDeleteBookmark,
  onSaveSummary,
  onDeleteSummary,
  onSaveNote,
  onDeleteNote,
  onOpenDigitalBook,
  onNavigateTab,
}) => {
  const [activeSection, setActiveSection] = useState<'bookmarks' | 'summaries' | 'notes'>('bookmarks');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('all');
  const [selectedMediumFilter, setSelectedMediumFilter] = useState<'all' | 'physical' | 'digital'>('all');

  // Modals state
  const [isBookmarkModalOpen, setIsBookmarkModalOpen] = useState(false);
  const [selectedBookmarkToEdit, setSelectedBookmarkToEdit] = useState<PhysicalBookmark | null>(null);
  const [selectedPhysicalBookForBookmark, setSelectedPhysicalBookForBookmark] = useState<PhysicalBook | null>(null);

  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [selectedSummaryToEdit, setSelectedSummaryToEdit] = useState<BookSummary | null>(null);

  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [selectedNoteToEdit, setSelectedNoteToEdit] = useState<StudentNote | null>(null);

  const [selectedSummaryViewDetail, setSelectedSummaryViewDetail] = useState<BookSummary | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Active loans for student
  const myActiveLoans = loans.filter(
    (l) => l.studentId === currentUser.id && l.status !== 'returned'
  );

  // Filtered bookmarks
  const filteredBookmarks = physicalBookmarks.filter((b) => {
    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      const matchTitle = matchesArabicQuery(b.bookTitle, q);
      const matchAuthor = matchesArabicQuery(b.bookAuthor || '', q);
      const matchTopic = matchesArabicQuery(b.chapterOrTopic || '', q);
      const matchNote = matchesArabicQuery(b.quickNote || '', q);
      if (!matchTitle && !matchAuthor && !matchTopic && !matchNote) return false;
    }
    return true;
  });

  // Filtered summaries
  const filteredSummaries = summaries.filter((s) => {
    if (selectedMediumFilter !== 'all' && s.bookMedium !== selectedMediumFilter) return false;
    if (selectedTagFilter !== 'all' && !s.tags?.includes(selectedTagFilter)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      const matchTitle = matchesArabicQuery(s.title, q);
      const matchBook = matchesArabicQuery(s.bookTitle, q);
      const matchAuthor = matchesArabicQuery(s.bookAuthor, q);
      const matchMain = matchesArabicQuery(s.mainIdea, q);
      const matchTags = s.tags?.some((t) => matchesArabicQuery(t, q));
      if (!matchTitle && !matchBook && !matchAuthor && !matchMain && !matchTags) return false;
    }
    return true;
  });

  // Filtered notes
  const filteredNotes = notes.filter((n) => {
    if (selectedMediumFilter !== 'all' && n.bookMedium && n.bookMedium !== selectedMediumFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      const matchTitle = matchesArabicQuery(n.bookTitle, q);
      const matchContent = matchesArabicQuery(n.content, q);
      const matchQuote = matchesArabicQuery(n.quote || '', q);
      const matchTags = n.tags?.some((t) => matchesArabicQuery(t, q));
      const matchCat = matchesArabicQuery(n.category || '', q);
      if (!matchTitle && !matchContent && !matchQuote && !matchTags && !matchCat) return false;
    }
    return true;
  });

  // Unique tags for summaries
  const allSummaryTags = Array.from(
    new Set(summaries.flatMap((s) => s.tags || []))
  );

  const handleCopySummary = (summary: BookSummary) => {
    const textToCopy = `*ملخص كتاب: ${summary.bookTitle}*\nالمؤلف: ${summary.bookAuthor}\n\n*الفكرة المركزية:*\n${summary.mainIdea}\n\n*أبرز الفوائد والنتائج:*\n${summary.keyTakeaways.map((k, i) => `${i + 1}. ${k}`).join('\n')}\n\n*من الاقتباسات:*\n${summary.favoriteQuotes?.map((q) => `«${q.quote}» (ص ${q.page || '-'})`).join('\n') || ''}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(summary.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-3xl p-5 sm:p-7 md:p-8 text-white relative overflow-hidden shadow-xl">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap">
                <Bookmark className="w-3.5 h-3.5 shrink-0" />
                <span>فواصل الكتب الورقية والتأطير المعرفي</span>
              </span>
              <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>مختبر التلخيص الإبداعي</span>
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight leading-snug break-words">
              مفكرة القراءة والتلخيص وتدوين الملاحظات
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed break-words">
              مكانك المخصص لتسجيل رقم الصفحة في كتبك الورقية المستعارة بدقة متناهية، وتلخيص الكتب الورقية والرقمية بهيكلية معرفية رائعة، وحفظ الفوائد والشواهد ومشاركتها في أبحاثك المدرسية.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 pt-2 lg:pt-0">
            <button
              onClick={() => {
                setSelectedBookmarkToEdit(null);
                setSelectedPhysicalBookForBookmark(null);
                setIsBookmarkModalOpen(true);
              }}
              className="px-3.5 sm:px-4 py-2 sm:py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl text-xs font-bold shadow-lg shadow-amber-600/30 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap"
            >
              <Bookmark className="w-4 h-4 shrink-0" />
              <span>تثبيت فاصل كتاب ورقي</span>
            </button>

            <button
              onClick={() => {
                setSelectedSummaryToEdit(null);
                setIsSummaryModalOpen(true);
              }}
              className="px-3.5 sm:px-4 py-2 sm:py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>إنشاء ملخص جديد</span>
            </button>

            <button
              onClick={() => {
                setSelectedNoteToEdit(null);
                setIsNoteModalOpen(true);
              }}
              className="px-3.5 sm:px-4 py-2 sm:py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-2xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>تدوين فائدة سريعة</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Section Navigation Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setActiveSection('bookmarks')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
              activeSection === 'bookmarks'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            <span>فواصل الكتب الورقية ({physicalBookmarks.length})</span>
          </button>

          <button
            onClick={() => setActiveSection('summaries')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
              activeSection === 'summaries'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>ملخصات وتأملات الكتب ({summaries.length})</span>
          </button>

          <button
            onClick={() => setActiveSection('notes')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
              activeSection === 'notes'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>دفتر الفوائد والشواهد ({notes.length})</span>
          </button>
        </div>

        {/* Search input in workspace */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="بحث في العناوين، الأفكار، أو الوسوم..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-3 pr-9 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* SECTION 1: PHYSICAL BOOKMARKS */}
      {activeSection === 'bookmarks' && (
        <div className="space-y-6">
          {/* Active Borrowed Books Jumper */}
          {myActiveLoans.length > 0 && (
            <div className="bg-amber-500/5 dark:bg-amber-950/20 border border-amber-500/20 rounded-3xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-sm">
                  <BookOpen className="w-4 h-4" />
                  <span>كتبك الورقية المستعارة حالياً (أنشئ أو حدّث فاصل القراءة بضغطة زر):</span>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {myActiveLoans.length} كتاب بحوزتك
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {myActiveLoans.map((loan) => {
                  const existingBm = physicalBookmarks.find((b) => b.bookId === loan.bookId);
                  const physBook = physicalBooks.find((p) => p.id === loan.bookId);

                  return (
                    <div
                      key={loan.id}
                      className="p-3.5 bg-white dark:bg-slate-900 border border-amber-500/30 rounded-2xl flex flex-col justify-between gap-2.5 shadow-sm"
                    >
                      <div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span className="font-semibold text-amber-700 dark:text-amber-400">استحقاق: {loan.dueDate}</span>
                          {physBook?.pagesCount && (
                            <span className="font-mono">{physBook.pagesCount} صفحة</span>
                          )}
                        </div>
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm mt-1 line-clamp-1">
                          {loan.bookTitle}
                        </h4>
                        {physBook?.author && (
                          <p className="text-xs text-slate-500 line-clamp-1">{physBook.author}</p>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                        {existingBm ? (
                          <div className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                            الصفحة {existingBm.currentPage} من {existingBm.totalPages} (
                            {Math.round((existingBm.currentPage / (existingBm.totalPages || 1)) * 100)}%)
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">لم يحدد فاصل بعد</span>
                        )}

                        <button
                          onClick={() => {
                            setSelectedBookmarkToEdit(existingBm || null);
                            setSelectedPhysicalBookForBookmark(physBook || null);
                            setIsBookmarkModalOpen(true);
                          }}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <Bookmark className="w-3.5 h-3.5" />
                          <span>{existingBm ? 'تعديل الصفحة' : 'تثبيت الفاصل'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bookmarks Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                <Bookmark className="w-5 h-5 text-amber-500" />
                <span>جميع فواصل الكتب الورقية المحفوظة ({filteredBookmarks.length})</span>
              </h3>
            </div>

            {filteredBookmarks.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto">
                  <Bookmark className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-base">
                  لا توجد فواصل قراءة مسجلة بعد
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  عند قراءتك لأي كتاب ورقي من المكتبة، اضغط على "تثبيت فاصل كتاب ورقي" لتسجيل رقم الصفحة واسم الباب وملاحظتك لتتذكر بالضبط أين وصلت في جلستك القادمة.
                </p>
                <button
                  onClick={() => {
                    setSelectedBookmarkToEdit(null);
                    setSelectedPhysicalBookForBookmark(null);
                    setIsBookmarkModalOpen(true);
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-md inline-flex items-center gap-1.5 mt-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>تثبيت فاصل جديد</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredBookmarks.map((bookmark) => {
                  const percentage = Math.min(
                    100,
                    Math.round((bookmark.currentPage / (bookmark.totalPages || 1)) * 100)
                  );
                  const isCompleted = bookmark.isCompleted || percentage >= 100;

                  return (
                    <div
                      key={bookmark.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 space-y-3 shadow-sm hover:border-amber-500/40 transition-all flex flex-col justify-between group"
                    >
                      <div className="space-y-2">
                        {/* Status tag and shelf location */}
                        <div className="flex items-center justify-between text-xs">
                          {isCompleted ? (
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold text-[10px] flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>مكتمل القراءة</span>
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-bold text-[10px] flex items-center gap-1">
                              <Bookmark className="w-3 h-3" />
                              <span>قيد المطالعة</span>
                            </span>
                          )}

                          {bookmark.location && (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 font-mono">
                              <MapPin className="w-3 h-3 text-amber-500" />
                              {bookmark.location.cabinet} - {bookmark.location.shelf}
                            </span>
                          )}
                        </div>

                        {/* Book Title & Author */}
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-snug line-clamp-2">
                          {bookmark.bookTitle}
                        </h4>
                        {bookmark.bookAuthor && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            المؤلف: {bookmark.bookAuthor}
                          </p>
                        )}

                        {/* Chapter / Topic if present */}
                        {bookmark.chapterOrTopic && (
                          <div className="p-2 bg-slate-50 dark:bg-slate-950 rounded-xl text-[11px] text-slate-700 dark:text-slate-300 font-medium line-clamp-1 border border-slate-100 dark:border-slate-800">
                            📍 {bookmark.chapterOrTopic}
                          </div>
                        )}

                        {/* Quick Note */}
                        {bookmark.quickNote && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 italic line-clamp-2 bg-amber-500/5 p-2 rounded-xl border border-amber-500/10">
                            "{bookmark.quickNote}"
                          </p>
                        )}

                        {/* Progress Display */}
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between text-xs font-mono">
                            <span className="font-bold text-amber-600 dark:text-amber-400">
                              الصفحة {bookmark.currentPage} من {bookmark.totalPages}
                            </span>
                            <span className="text-slate-400 font-semibold">{percentage}%</span>
                          </div>

                          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                isCompleted ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-500 to-amber-400'
                              }`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Footer Info & Actions */}
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3" />
                          {bookmark.lastSessionDate}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedBookmarkToEdit(bookmark);
                              setSelectedPhysicalBookForBookmark(null);
                              setIsBookmarkModalOpen(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            title="تعديل الصفحة أو الملاحظة"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => onDeleteBookmark(bookmark.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
                            title="إزالة الفاصل"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 2: BOOK SUMMARIES (CREATIVE MULTI-STRUCTURE) */}
      {activeSection === 'summaries' && (
        <div className="space-y-6">
          {/* Summary Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">نوع المرجع:</span>
              <button
                onClick={() => setSelectedMediumFilter('all')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                  selectedMediumFilter === 'all'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                الكل
              </button>
              <button
                onClick={() => setSelectedMediumFilter('physical')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all ${
                  selectedMediumFilter === 'physical'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <BookOpen className="w-3 h-3" />
                <span>كتب ورقية</span>
              </button>
              <button
                onClick={() => setSelectedMediumFilter('digital')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all ${
                  selectedMediumFilter === 'digital'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <Library className="w-3 h-3" />
                <span>كتب رقمية</span>
              </button>
            </div>

            {/* Tag Filter Pills */}
            {allSummaryTags.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <button
                  onClick={() => setSelectedTagFilter('all')}
                  className={`px-2.5 py-0.5 rounded-lg text-[11px] font-medium transition-all ${
                    selectedTagFilter === 'all'
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  جميع الوسوم
                </button>
                {allSummaryTags.slice(0, 5).map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTagFilter(tag)}
                    className={`px-2.5 py-0.5 rounded-lg text-[11px] font-medium transition-all ${
                      selectedTagFilter === tag
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Summaries Grid */}
          {filteredSummaries.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center mx-auto">
                <Sparkles className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-slate-800 dark:text-slate-200 text-base">
                لا توجد ملخصات مسجلة بعد
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                ابدأ بتلخيص كتاب قرأته لتوثيق أفكاره المركزية، ونقاطه الجوهرية، واقتباساته، واسترجاعها بسهولة عند إعداد بحوثك المدرسية.
              </p>
              <button
                onClick={() => {
                  setSelectedSummaryToEdit(null);
                  setIsSummaryModalOpen(true);
                }}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md inline-flex items-center gap-1.5 mt-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إنشاء أول ملخص</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredSummaries.map((summary) => (
                <div
                  key={summary.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm hover:border-indigo-500/40 transition-all flex flex-col justify-between group"
                >
                  <div className="space-y-3">
                    {/* Header: Medium & Rating */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                          summary.bookMedium === 'physical'
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        {summary.bookMedium === 'physical' ? (
                          <>
                            <BookOpen className="w-3 h-3" />
                            <span>كتاب ورقي</span>
                          </>
                        ) : (
                          <>
                            <Library className="w-3 h-3" />
                            <span>كتاب إلكتروني</span>
                          </>
                        )}
                      </span>

                      {summary.rating && (
                        <div className="flex items-center gap-1 text-amber-400">
                          {Array.from({ length: summary.rating }).map((_, i) => (
                            <Star key={i} className="w-3.5 h-3.5 fill-amber-400" />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Summary Title & Book Title */}
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base leading-snug">
                        {summary.title}
                      </h4>
                      <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold mt-0.5">
                        مرجع: {summary.bookTitle} • {summary.bookAuthor}
                      </p>
                    </div>

                    {/* Main Idea box */}
                    <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800/80 rounded-2xl">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        الأطروحة المركزية:
                      </span>
                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed line-clamp-3">
                        {summary.mainIdea}
                      </p>
                    </div>

                    {/* Key Takeaways Snapshot */}
                    {summary.keyTakeaways && summary.keyTakeaways.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                          أبرز النتائج المستخلصة ({summary.keyTakeaways.length}):
                        </span>
                        <div className="space-y-1">
                          {summary.keyTakeaways.slice(0, 3).map((point, idx) => (
                            <div key={idx} className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                              <span className="text-indigo-500 font-bold shrink-0 mt-0.5">•</span>
                              <span className="line-clamp-1">{point}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Quotes & Chapters counts */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {summary.chaptersSummaries && summary.chaptersSummaries.length > 0 && (
                        <span className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                          📚 {summary.chaptersSummaries.length} فصول مفصلة
                        </span>
                      )}
                      {summary.favoriteQuotes && summary.favoriteQuotes.length > 0 && (
                        <span className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                          💬 {summary.favoriteQuotes.length} شواهد واقتباسات
                        </span>
                      )}
                      {summary.actionableInsights && summary.actionableInsights.length > 0 && (
                        <span className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                          💡 {summary.actionableInsights.length} تطبيقات بحثية
                        </span>
                      )}
                    </div>

                    {/* Tags */}
                    {summary.tags && summary.tags.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {summary.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-[10px] font-medium"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Summary Actions Footer */}
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-mono">
                      {summary.createdAt}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setSelectedSummaryViewDetail(summary)}
                        className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-600 hover:text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
                      >
                        عرض الملخص الكامل
                      </button>

                      <button
                        onClick={() => handleCopySummary(summary)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="نسخ نص الملخص"
                      >
                        {copiedId === summary.id ? (
                          <Check className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setSelectedSummaryToEdit(summary);
                          setIsSummaryModalOpen(true);
                        }}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="تعديل الملخص"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => onDeleteSummary(summary.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
                        title="حذف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION 3: NOTES & QUOTES NOTEBOOK */}
      {activeSection === 'notes' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-500" />
              <span>دفتر الفوائد المقتبسة والمسائل العلمية ({filteredNotes.length})</span>
            </h3>

            <button
              onClick={() => {
                setSelectedNoteToEdit(null);
                setIsNoteModalOpen(true);
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة فائدة جديدة</span>
            </button>
          </div>

          {filteredNotes.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
                <FileText className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-slate-800 dark:text-slate-200 text-base">
                لا توجد فوائد أو ملاحظات مدونة
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                سجل أي مسألة فقهية، شاهد لغوي، أو فكرة بحثية تخطر ببالك أثناء القراءة في الكتب الورقية أو الرقمية مع رقم الصفحة والباب.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredNotes.map((note) => {
                const colorTagClasses = {
                  amber: 'border-r-4 border-r-amber-500 bg-amber-500/5',
                  emerald: 'border-r-4 border-r-emerald-500 bg-emerald-500/5',
                  sky: 'border-r-4 border-r-sky-500 bg-sky-500/5',
                  purple: 'border-r-4 border-r-purple-500 bg-purple-500/5',
                  rose: 'border-r-4 border-r-rose-500 bg-rose-500/5',
                }[note.colorTag || 'amber'];

                const matchedDigital = digitalBooks.find(
                  (d) => d.id === note.bookId || d.title.trim() === note.bookTitle.trim()
                );

                return (
                  <div
                    key={note.id}
                    className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2.5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between ${colorTagClasses}`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs gap-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {note.category || 'فائدة علمية'}
                          </span>
                          {note.bookMedium === 'digital' || matchedDigital ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold">
                              رقمي
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] font-bold">
                              ورقي
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold shrink-0">
                          ص {note.pageNumber}
                        </span>
                      </div>

                      <h5 className="font-bold text-slate-900 dark:text-slate-100 text-xs line-clamp-1">
                        {note.bookTitle}
                      </h5>

                      {note.chapter && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          الباب/المحور: {note.chapter}
                        </div>
                      )}

                      {note.quote && (
                        <div className="p-2.5 bg-slate-50 dark:bg-slate-950 rounded-xl text-xs text-slate-700 dark:text-slate-300 italic border-l-2 border-slate-300 dark:border-slate-700">
                          «{note.quote}»
                        </div>
                      )}

                      <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                        {note.content}
                      </p>

                      {note.tags && note.tags.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 pt-1">
                          {note.tags.map((t) => (
                            <span
                              key={t}
                              className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px]"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 font-mono text-[10px]">{note.createdAt}</span>
                        {matchedDigital && onOpenDigitalBook && (
                          <button
                            type="button"
                            onClick={() => onOpenDigitalBook(matchedDigital)}
                            className="px-2 py-0.5 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-700 hover:text-white dark:text-emerald-400 rounded-lg text-[10px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                            title="الانتقال إلى قراءة الكتاب الإلكتروني في القارئ"
                          >
                            <BookOpen className="w-3 h-3" />
                            <span>فتح في القارئ</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setSelectedNoteToEdit(note);
                            setIsNoteModalOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded"
                          title="تعديل"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteNote(note.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* FULL SUMMARY DETAIL VIEW MODAL */}
      {selectedSummaryViewDetail && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 max-w-3xl w-full shadow-2xl animate-in zoom-in-95 max-h-[90vh] flex flex-col space-y-5">
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4 shrink-0">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                      selectedSummaryViewDetail.bookMedium === 'physical'
                        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                        : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {selectedSummaryViewDetail.bookMedium === 'physical' ? 'كتاب ورقي' : 'كتاب إلكتروني'}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    تاريخ التدوين: {selectedSummaryViewDetail.createdAt}
                  </span>
                </div>
                <h3 className="text-xl font-black text-slate-900 dark:text-slate-100">
                  {selectedSummaryViewDetail.title}
                </h3>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold mt-0.5">
                  مرجع الكتاب: {selectedSummaryViewDetail.bookTitle} • تأليف: {selectedSummaryViewDetail.bookAuthor}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopySummary(selectedSummaryViewDetail)}
                  className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                  title="نسخ الملخص بالكامل"
                >
                  {copiedId === selectedSummaryViewDetail.id ? (
                    <Check className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </button>
                <button
                  onClick={() => setSelectedSummaryViewDetail(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-6 pr-1 pl-1">
              {/* Main Thesis */}
              <div className="p-4 bg-indigo-500/5 dark:bg-indigo-950/20 border border-indigo-500/20 rounded-2xl space-y-1.5">
                <h4 className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  الأطروحة والرسالة المركزية للكتاب:
                </h4>
                <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-serif">
                  {selectedSummaryViewDetail.mainIdea}
                </p>
              </div>

              {/* Key Takeaways */}
              {selectedSummaryViewDetail.keyTakeaways?.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    أهم النتائج والفوائد الجوهرية:
                  </h4>
                  <div className="space-y-2">
                    {selectedSummaryViewDetail.keyTakeaways.map((point, i) => (
                      <div
                        key={i}
                        className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 flex items-start gap-2.5"
                      >
                        <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <span className="leading-relaxed">{point}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Chapters breakdown */}
              {selectedSummaryViewDetail.chaptersSummaries?.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    خلاصات الأبواب والفصول:
                  </h4>
                  <div className="space-y-3">
                    {selectedSummaryViewDetail.chaptersSummaries.map((ch, idx) => (
                      <div
                        key={idx}
                        className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <h5 className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                            {ch.chapterTitle}
                          </h5>
                          {ch.pagesRange && (
                            <span className="text-[11px] text-slate-400 font-mono font-semibold">
                              {ch.pagesRange}
                            </span>
                          )}
                        </div>
                        <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300 pr-3 list-disc list-inside">
                          {ch.keyPoints.map((pt, pIdx) => (
                            <li key={pIdx} className="leading-relaxed">
                              {pt}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quotes */}
              {selectedSummaryViewDetail.favoriteQuotes?.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                    <Quote className="w-4 h-4 text-amber-500" />
                    شواهد واقتباسات من الكتاب:
                  </h4>
                  <div className="space-y-2.5">
                    {selectedSummaryViewDetail.favoriteQuotes.map((qItem, qIdx) => (
                      <div
                        key={qIdx}
                        className="p-3.5 bg-amber-500/5 dark:bg-amber-950/20 border border-amber-500/20 rounded-2xl space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-amber-700 dark:text-amber-400 font-semibold italic">
                            «{qItem.quote}»
                          </span>
                          {qItem.page && (
                            <span className="text-[11px] font-mono text-slate-400 font-bold shrink-0">
                              ص {qItem.page}
                            </span>
                          )}
                        </div>
                        {qItem.reflection && (
                          <p className="text-[11px] text-slate-600 dark:text-slate-400 pt-1 border-t border-amber-500/10">
                            تأمل: {qItem.reflection}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actionable Insights */}
              {selectedSummaryViewDetail.actionableInsights?.length > 0 && (
                <div className="p-4 bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 rounded-2xl space-y-2">
                  <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    التطبيقات العملية والبحثية:
                  </h4>
                  <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300 pr-3 list-disc list-inside">
                    {selectedSummaryViewDetail.actionableInsights.map((ins, iIdx) => (
                      <li key={iIdx}>{ins}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedSummaryViewDetail(null)}
                className="px-5 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-200"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODALS */}
      <PhysicalBookmarkModal
        isOpen={isBookmarkModalOpen}
        onClose={() => setIsBookmarkModalOpen(false)}
        book={selectedPhysicalBookForBookmark}
        existingBookmark={selectedBookmarkToEdit}
        physicalBooks={physicalBooks}
        onSave={onSaveBookmark}
        onDelete={onDeleteBookmark}
      />

      <BookSummaryModal
        isOpen={isSummaryModalOpen}
        onClose={() => setIsSummaryModalOpen(false)}
        summaryToEdit={selectedSummaryToEdit}
        physicalBooks={physicalBooks}
        digitalBooks={digitalBooks}
        onSave={onSaveSummary}
      />

      <NoteEditorModal
        isOpen={isNoteModalOpen}
        onClose={() => setIsNoteModalOpen(false)}
        noteToEdit={selectedNoteToEdit}
        physicalBooks={physicalBooks}
        digitalBooks={digitalBooks}
        onSave={onSaveNote}
      />
    </div>
  );
};
