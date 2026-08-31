import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  ZoomIn,
  ZoomOut,
  Sun,
  Moon,
  Coffee,
  Bookmark,
  List,
  MessageSquarePlus,
  Trash2,
  Share2,
  Maximize2,
  Minimize2,
  FileText,
  Sparkles,
  Search,
  BookOpen,
  Columns,
  Square,
  Type,
  AlignJustify,
  Check,
  Volume2,
} from 'lucide-react';
import { DigitalBook, StudentNote } from '../../types/library';
import { getRichBookPage, BookPageContent } from '../../data/richBookContent';

interface BookReaderModalProps {
  book: DigitalBook;
  onClose: () => void;
  onSaveProgress: (page: number, totalPages: number) => void;
  initialPage?: number;
  notes: StudentNote[];
  onAddNote: (note: Omit<StudentNote, 'id' | 'createdAt'>) => void;
  onDeleteNote: (noteId: string) => void;
}

export const BookReaderModal: React.FC<BookReaderModalProps> = ({
  book,
  onClose,
  onSaveProgress,
  initialPage = 1,
  notes,
  onAddNote,
  onDeleteNote,
}) => {
  const totalPages = Math.max(book.pagesCount || 12, 10);
  const [currentPage, setCurrentPage] = useState(Math.min(initialPage, totalPages));
  const [zoomLevel, setZoomLevel] = useState(100);
  const [readingTheme, setReadingTheme] = useState<'dark' | 'sepia' | 'light'>('sepia');
  const [fontFamily, setFontFamily] = useState<'amiri' | 'scheherazade' | 'ruqaa' | 'tajawal'>('amiri');
  const [fontSize, setFontSize] = useState<number>(18);
  const [lineHeight, setLineHeight] = useState<number>(2.0);
  const [layoutMode, setLayoutMode] = useState<'single' | 'spread'>('single'); // single page or 2-page book spread
  const [showToc, setShowToc] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bookmarks, setBookmarks] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem(`bookmarks_${book.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Note creation form state
  const [newNoteContent, setNewNoteContent] = useState('');
  const [selectedQuote, setSelectedQuote] = useState('');
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Get rich structured page content
  const page1Content: BookPageContent = useMemo(() => {
    return getRichBookPage(book, currentPage, totalPages);
  }, [book, currentPage, totalPages]);

  const page2Content: BookPageContent | null = useMemo(() => {
    if (layoutMode === 'spread' && currentPage < totalPages) {
      return getRichBookPage(book, currentPage + 1, totalPages);
    }
    return null;
  }, [book, currentPage, totalPages, layoutMode]);

  // Auto-save progress
  useEffect(() => {
    onSaveProgress(currentPage, totalPages);
  }, [currentPage, totalPages, onSaveProgress]);

  // Keyboard navigation & Esc key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        // In RTL: ArrowRight goes to previous page
        setCurrentPage((p) => Math.max(1, p - (layoutMode === 'spread' ? 2 : 1)));
      } else if (e.key === 'ArrowLeft') {
        // In RTL: ArrowLeft goes to next page
        setCurrentPage((p) => Math.min(totalPages, p + (layoutMode === 'spread' ? 2 : 1)));
      } else if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages, layoutMode, isFullscreen, onClose]);

  // Toggle Bookmark
  const toggleBookmark = (page: number) => {
    setBookmarks((prev) => {
      const next = prev.includes(page) ? prev.filter((p) => p !== page) : [...prev, page].sort((a, b) => a - b);
      try {
        localStorage.setItem(`bookmarks_${book.id}`, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim()) return;

    onAddNote({
      bookId: book.id,
      bookTitle: book.title,
      pageNumber: currentPage,
      quote: selectedQuote.trim() || undefined,
      content: newNoteContent.trim(),
    });

    setNewNoteContent('');
    setSelectedQuote('');
  };

  // Theme styling for authentic paper sheet
  const paperThemeStyles = {
    sepia: {
      canvasBg: 'bg-[#2b241d]/95',
      paperBg: 'bg-[#f7f0e1] text-[#342718] border-[#e4d4bc] shadow-[0_15px_40px_rgba(0,0,0,0.45)]',
      headerBorder: 'border-[#dfceb6]',
      footnoteBorder: 'border-[#dfceb6]',
      headerText: 'text-[#6e5842]',
      footnoteText: 'text-[#6e5842]',
      citationBox: 'bg-[#eee3ce] border-r-4 border-[#8c6b45] text-[#3d2e1c]',
      watermark: 'text-[#9c8469]/40',
      activeTab: 'bg-[#dfceb6] text-[#342718]',
    },
    light: {
      canvasBg: 'bg-slate-300/90',
      paperBg: 'bg-white text-slate-900 border-slate-200 shadow-[0_15px_40px_rgba(0,0,0,0.25)]',
      headerBorder: 'border-slate-200',
      footnoteBorder: 'border-slate-200',
      headerText: 'text-slate-500',
      footnoteText: 'text-slate-600',
      citationBox: 'bg-slate-50 border-r-4 border-indigo-600 text-slate-800',
      watermark: 'text-slate-400/40',
      activeTab: 'bg-slate-200 text-slate-900',
    },
    dark: {
      canvasBg: 'bg-slate-950/98',
      paperBg: 'bg-[#151c28] text-slate-100 border-slate-800 shadow-[0_15px_40px_rgba(0,0,0,0.7)]',
      headerBorder: 'border-slate-800',
      footnoteBorder: 'border-slate-800',
      headerText: 'text-slate-400',
      footnoteText: 'text-slate-400',
      citationBox: 'bg-[#1c2436] border-r-4 border-indigo-500 text-indigo-200',
      watermark: 'text-slate-600/40',
      activeTab: 'bg-slate-800 text-slate-100',
    },
  };

  const currentTheme = paperThemeStyles[readingTheme];

  const fontClassNames = {
    amiri: 'font-amiri',
    scheherazade: 'font-scheherazade',
    ruqaa: 'font-ruqaa',
    tajawal: 'font-tajawal',
  };

  const bookNotes = notes.filter((n) => n.bookId === book.id);
  const isCurrentPageBookmarked = bookmarks.includes(currentPage);

  // Render an authentic full manuscript/book sheet
  const renderSingleBookSheet = (content: BookPageContent, pageNum: number, isRightPage = false) => {
    return (
      <div
        className={`flex-1 flex flex-col justify-between p-8 sm:p-12 rounded-2xl border transition-all relative overflow-hidden select-text ${currentTheme.paperBg}`}
        style={{
          minHeight: '740px',
          maxWidth: layoutMode === 'spread' ? '540px' : '760px',
        }}
      >
        {/* Subtle Paper Grain Effect & Corner Borders */}
        <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 opacity-30 border-current pointer-events-none" />
        <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 opacity-30 border-current pointer-events-none" />
        <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 opacity-30 border-current pointer-events-none" />
        <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 opacity-30 border-current pointer-events-none" />

        {/* Top Header of the Page Sheet */}
        <div className={`pb-3.5 mb-6 border-b flex items-center justify-between text-xs ${currentTheme.headerBorder} ${currentTheme.headerText}`}>
          <div className="flex items-center gap-2 font-bold truncate max-w-[220px]">
            <BookOpen className="w-3.5 h-3.5 opacity-70 shrink-0" />
            <span className="truncate">{book.title}</span>
          </div>
          <div className="hidden sm:block text-[11px] font-medium opacity-80 truncate max-w-[200px]">
            {content.chapterTitle}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleBookmark(pageNum)}
              className={`p-1 rounded transition-colors ${bookmarks.includes(pageNum) ? 'text-amber-500 font-bold' : 'opacity-40 hover:opacity-100'}`}
              title={bookmarks.includes(pageNum) ? 'إزالة الإشارة المرجعية' : 'حفظ إشارة مرجعية في هذه الصفحة'}
            >
              <Bookmark className="w-4 h-4 fill-current" />
            </button>
            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-black/5 dark:bg-white/5">
              ص {pageNum}
            </span>
          </div>
        </div>

        {/* Central Manuscript Body Text */}
        <div className="flex-1 space-y-4 text-justify leading-relaxed">
          {/* Chapter / Section Title */}
          {content.sectionTitle && (
            <div className="text-center py-2 mb-3">
              <h3
                className={`text-lg sm:text-xl font-bold tracking-wide ${
                  readingTheme === 'dark' ? 'text-indigo-300' : 'text-[#543b22]'
                } ${fontClassNames[fontFamily]}`}
              >
                {content.sectionTitle}
              </h3>
              <div className="w-16 h-0.5 mx-auto mt-2 bg-current opacity-20" />
            </div>
          )}

          {/* Paragraphs with scholarly indent */}
          <div
            className={`space-y-3.5 ${fontClassNames[fontFamily]}`}
            style={{
              fontSize: `${fontSize}px`,
              lineHeight: `${lineHeight}`,
            }}
          >
            {content.paragraphs.map((p, pIdx) => {
              // Highlight search queries if present
              if (searchQuery.trim() && p.includes(searchQuery.trim())) {
                const parts = p.split(searchQuery.trim());
                return (
                  <p key={pIdx} className="indent-6 sm:indent-8 selection:bg-amber-400 selection:text-black">
                    {parts.map((part, i) => (
                      <React.Fragment key={i}>
                        {part}
                        {i < parts.length - 1 && (
                          <mark className="bg-amber-300 dark:bg-amber-500 text-black px-1 rounded font-bold">
                            {searchQuery.trim()}
                          </mark>
                        )}
                      </React.Fragment>
                    ))}
                  </p>
                );
              }
              return (
                <p key={pIdx} className="indent-6 sm:indent-8 selection:bg-amber-400 selection:text-black">
                  {p}
                </p>
              );
            })}
          </div>

          {/* Hadith / Classical Poetic Citation Box */}
          {content.hadithOrPoetryCitation && (
            <div className={`my-4 p-4 rounded-xl text-center space-y-1.5 ${currentTheme.citationBox}`}>
              <div className={`text-base sm:text-lg font-bold font-scheherazade`}>
                {content.hadithOrPoetryCitation.text}
              </div>
              <div className="text-[11px] opacity-75 font-sans">
                [{content.hadithOrPoetryCitation.source}]
              </div>
            </div>
          )}
        </div>

        {/* Footnotes & Bottom Page Marginalia */}
        <div className="mt-8 pt-4 border-t space-y-1.5 select-text" style={{ borderColor: 'inherit' }}>
          {content.footnotes && content.footnotes.length > 0 && (
            <div className={`space-y-1 text-xs sm:text-[13px] ${currentTheme.footnoteText} ${fontClassNames[fontFamily]}`}>
              <div className="w-20 h-px bg-current opacity-40 mb-2" />
              {content.footnotes.map((fn, fnIdx) => (
                <div key={fnIdx} className="leading-normal">
                  {fn}
                </div>
              ))}
            </div>
          )}

          {/* Page Sheet Footer */}
          <div className="pt-3 flex items-center justify-between text-[11px] opacity-60 font-sans border-t border-current/10 mt-2">
            <span className="truncate">المكتبة المدرسية المركزية الذكية • المستودع الرقمي</span>
            <span className="font-mono font-bold">-{pageNum}-</span>
            <span className="hidden sm:inline font-mono">طبعة رقمية موثقة</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col transition-colors duration-200 select-none ${
        isFullscreen ? 'w-screen h-screen' : ''
      } ${currentTheme.canvasBg}`}
    >
      {/* Top Application Ribbon / Desktop Reader Controls */}
      <div className="h-14 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between px-4 sm:px-6 shrink-0 shadow-lg text-slate-100 z-30">
        {/* Left Section: Book metadata & Close */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer shadow-sm"
            title="إغلاق القارئ والعودة (Esc)"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="border-r border-slate-800 pr-3 min-w-0">
            <h2 className="text-xs sm:text-sm font-bold text-slate-100 truncate max-w-[180px] sm:max-w-sm">
              {book.title}
            </h2>
            <p className="text-[11px] text-slate-400 truncate">{book.author}</p>
          </div>
        </div>

        {/* Center Section: Page Navigation & Jump Bar */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - (layoutMode === 'spread' ? 2 : 1)))}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-200 rounded-xl transition-all cursor-pointer shadow-sm"
            title="الصفحة السابقة (السهم الأيمن)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5 text-xs font-mono text-slate-300 bg-slate-950/80 px-2.5 py-1 rounded-xl border border-slate-800">
            <span>صفحة</span>
            <input
              type="number"
              min="1"
              max={totalPages}
              value={currentPage}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (val >= 1 && val <= totalPages) setCurrentPage(val);
              }}
              className="w-11 bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-0.5 text-center text-amber-400 font-bold outline-none focus:border-indigo-500"
            />
            {layoutMode === 'spread' && currentPage < totalPages && (
              <span className="text-amber-300 font-bold">- {currentPage + 1}</span>
            )}
            <span className="text-slate-400">من {totalPages}</span>
          </div>

          <button
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + (layoutMode === 'spread' ? 2 : 1)))}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-200 rounded-xl transition-all cursor-pointer shadow-sm"
            title="الصفحة التالية (السهم الأيسر)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Right Section: View Options, Layout, Fonts, Search & Drawers */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* In-Book Search Toggle */}
          <button
            onClick={() => {
              setShowSearch(!showSearch);
              setShowToc(false);
              setShowNotes(false);
            }}
            className={`p-1.5 rounded-xl text-xs flex items-center gap-1 transition-all ${
              showSearch ? 'bg-amber-500 text-black font-bold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title="البحث في نص الكتاب"
          >
            <Search className="w-4 h-4" />
            <span className="hidden md:inline">بحث</span>
          </button>

          {/* Layout Mode (Single vs Two-Page Spread) */}
          <div className="hidden sm:flex items-center bg-slate-800 rounded-xl p-0.5 border border-slate-700">
            <button
              onClick={() => setLayoutMode('single')}
              className={`p-1 rounded-lg transition-all ${layoutMode === 'single' ? 'bg-slate-900 text-amber-400 font-bold shadow' : 'text-slate-400'}`}
              title="عرض صفحة واحدة كاملة"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setLayoutMode('spread')}
              className={`p-1 rounded-lg transition-all ${layoutMode === 'spread' ? 'bg-slate-900 text-amber-400 font-bold shadow' : 'text-slate-400'}`}
              title="عرض صفحتين متقابلتين (تصفح كتاب مفتوح)"
            >
              <Columns className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Font Family Selector */}
          <div className="hidden lg:flex items-center bg-slate-800 rounded-xl px-2 py-0.5 border border-slate-700 text-xs">
            <Type className="w-3.5 h-3.5 text-slate-400 ml-1" />
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value as any)}
              className="bg-transparent text-slate-200 text-xs outline-none cursor-pointer py-1"
            >
              <option value="amiri" className="bg-slate-900 text-slate-200">الخط الأميري (نسخ تراثي)</option>
              <option value="scheherazade" className="bg-slate-900 text-slate-200">خط شهرزاد (كلاسيكي)</option>
              <option value="ruqaa" className="bg-slate-900 text-slate-200">خط الرقعة</option>
              <option value="tajawal" className="bg-slate-900 text-slate-200">خط تجوال (عصري)</option>
            </select>
          </div>

          {/* Font Size & Zoom */}
          <div className="hidden xl:flex items-center bg-slate-800 rounded-xl p-0.5 border border-slate-700 text-xs">
            <button
              onClick={() => setFontSize((s) => Math.max(14, s - 1))}
              className="px-1.5 py-0.5 text-slate-300 hover:text-white"
              title="تصغير الخط"
            >
              -A
            </button>
            <span className="text-[10px] font-mono px-1 text-amber-300">{fontSize}px</span>
            <button
              onClick={() => setFontSize((s) => Math.min(28, s + 1))}
              className="px-1.5 py-0.5 text-slate-300 hover:text-white"
              title="تكبير الخط"
            >
              +A
            </button>
          </div>

          {/* Reading Paper Theme Toggles */}
          <div className="flex items-center bg-slate-800 rounded-xl p-0.5 border border-slate-700">
            <button
              onClick={() => setReadingTheme('sepia')}
              className={`p-1 rounded-lg transition-all ${readingTheme === 'sepia' ? 'bg-[#dfceb6] text-[#342718] font-bold shadow' : 'text-slate-400'}`}
              title="ورق مخطوط عاجي (Parchment)"
            >
              <Coffee className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setReadingTheme('light')}
              className={`p-1 rounded-lg transition-all ${readingTheme === 'light' ? 'bg-white text-slate-900 font-bold shadow' : 'text-slate-400'}`}
              title="ورق أبيض ناصع (Pure White)"
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setReadingTheme('dark')}
              className={`p-1 rounded-lg transition-all ${readingTheme === 'dark' ? 'bg-slate-950 text-indigo-400 font-bold shadow' : 'text-slate-400'}`}
              title="الورق الليلي (Night Velvet)"
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Table of Contents Toggle */}
          <button
            onClick={() => {
              setShowToc(!showToc);
              setShowNotes(false);
              setShowSearch(false);
            }}
            className={`p-1.5 rounded-xl text-xs flex items-center gap-1 transition-all ${
              showToc ? 'bg-indigo-600 text-white shadow' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title="فهرس فصول الكتاب"
          >
            <List className="w-4 h-4" />
            <span className="hidden sm:inline">الفهرس</span>
          </button>

          {/* Research Notes Toggle */}
          <button
            onClick={() => {
              setShowNotes(!showNotes);
              setShowToc(false);
              setShowSearch(false);
            }}
            className={`p-1.5 rounded-xl text-xs flex items-center gap-1 transition-all ${
              showNotes ? 'bg-indigo-600 text-white shadow' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title="دفتر الملاحظات والاقتباسات"
          >
            <MessageSquarePlus className="w-4 h-4" />
            <span className="hidden sm:inline">ملاحظاتي ({bookNotes.length})</span>
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all"
            title={isFullscreen ? 'الخروج من ملء الشاشة' : 'وضع ملء الشاشة للتركيز'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Reading Stage and Sidebars */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* In-Book Search Drawer */}
        {showSearch && (
          <div className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col h-full z-30 shadow-2xl animate-in slide-in-from-right-5 duration-200">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h4 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                <Search className="w-4 h-4 text-amber-400" />
                البحث في نص ومخطوطة الكتاب
              </h4>
              <button onClick={() => setShowSearch(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 border-b border-slate-800 space-y-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="اكتب كلمة، مسألة فقهية، أو مصطلح..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 outline-none focus:border-amber-500"
                autoFocus
              />
              <p className="text-[11px] text-slate-400 leading-relaxed">
                سيتم إبراز نتائج المطابقة تلقائياً بلون مميز داخل صفحات الكتاب أثناء تصفحك.
              </p>
            </div>

            {/* Quick jump to bookmarked pages */}
            <div className="p-4 flex-1 overflow-y-auto space-y-2">
              <div className="text-xs font-bold text-slate-300 flex items-center gap-1 mb-2">
                <Bookmark className="w-3.5 h-3.5 text-amber-400" />
                العلامات المرجعية المحفوظة ({bookmarks.length}):
              </div>
              {bookmarks.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-6">
                  لم تقم بحفظ أي علامات مرجعية بعد. اضغط على أيقونة الإشارة المرجعية أعلى أي صفحة للرجوع إليها لاحقاً.
                </div>
              ) : (
                bookmarks.map((bmPage) => (
                  <button
                    key={bmPage}
                    onClick={() => {
                      setCurrentPage(bmPage);
                      setShowSearch(false);
                    }}
                    className="w-full text-right p-2.5 bg-slate-950/80 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs flex items-center justify-between text-slate-200"
                  >
                    <span>صفحة {bmPage}</span>
                    <span className="text-[10px] text-amber-400 font-mono">انتقال سريع ←</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Table of Contents Drawer */}
        {showToc && (
          <div className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col h-full z-30 shadow-2xl animate-in slide-in-from-right-5 duration-200">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h4 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                <List className="w-4 h-4 text-indigo-400" />
                فهرس فصول وأبواب المخطوط
              </h4>
              <button onClick={() => setShowToc(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 text-xs">
              {book.tableOfContents && book.tableOfContents.length > 0 ? (
                book.tableOfContents.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setCurrentPage(item.page);
                      setShowToc(false);
                    }}
                    className={`w-full text-right p-3 rounded-xl transition-all flex items-center justify-between ${
                      currentPage === item.page
                        ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 font-bold'
                        : 'text-slate-300 hover:bg-slate-800/80 border border-transparent'
                    }`}
                  >
                    <span className="truncate">{item.title}</span>
                    <span className="text-[11px] font-mono opacity-70 shrink-0 mr-2">ص {item.page}</span>
                  </button>
                ))
              ) : (
                <div className="space-y-1">
                  {[1, 5, 10, 15, 20].filter((p) => p <= totalPages).map((pNum) => (
                    <button
                      key={pNum}
                      onClick={() => {
                        setCurrentPage(pNum);
                        setShowToc(false);
                      }}
                      className="w-full text-right p-3 rounded-xl bg-slate-950/60 hover:bg-slate-800 text-slate-200 flex items-center justify-between text-xs"
                    >
                      <span>الفصل {Math.ceil(pNum / 5)}: مباحث الصفحة {pNum}</span>
                      <span className="font-mono text-slate-400">ص {pNum}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Research Notes & Quotes Drawer */}
        {showNotes && (
          <div className="w-84 bg-slate-900 border-l border-slate-800 flex flex-col h-full z-30 shadow-2xl animate-in slide-in-from-right-5 duration-200">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h4 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                <MessageSquarePlus className="w-4 h-4 text-indigo-400" />
                دفتر الملاحظات والاقتباسات
              </h4>
              <button onClick={() => setShowNotes(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Note form */}
            <form onSubmit={handleCreateNote} className="p-3 border-b border-slate-800 space-y-2.5 text-xs">
              <div className="text-slate-300 font-semibold flex items-center justify-between">
                <span>تدوين ملاحظة في (صفحة {currentPage}):</span>
              </div>
              <input
                type="text"
                value={selectedQuote}
                onChange={(e) => setSelectedQuote(e.target.value)}
                placeholder="اقتباس نصي من الصفحة (اختياري)..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500"
              />
              <textarea
                rows={3}
                required
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                placeholder="اكتب تحليلك المنهجي، الشواهد، أو الفائدة المستخلصة..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 placeholder-slate-500 resize-none outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-md cursor-pointer"
              >
                حفظ في مذكرة الطالب
              </button>
            </form>

            {/* Notes List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
              {bookNotes.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  لا توجد ملاحظات مسجلة لهذا الكتاب بعد. دون أفكارك أثناء المطالعة للرجوع إليها في مشاريعك وأبحاثك المدرسية.
                </div>
              ) : (
                bookNotes.map((note) => (
                  <div
                    key={note.id}
                    className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2 group hover:border-slate-700 transition-all"
                  >
                    <div className="flex items-center justify-between text-[11px] text-amber-400 font-medium">
                      <span>صفحة {note.pageNumber}</span>
                      <button
                        onClick={() => onDeleteNote(note.id)}
                        className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                        title="حذف الملاحظة"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {note.quote && (
                      <div className="text-[11px] text-slate-400 italic bg-slate-900 p-2 rounded-lg border-r-2 border-amber-500">
                        "{note.quote}"
                      </div>
                    )}
                    <p className="text-slate-200 leading-relaxed">{note.content}</p>
                    <div className="text-[10px] text-slate-500 font-mono">{note.createdAt}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Central Book Page Presentation Arena */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 sm:p-8">
          <div
            className={`flex items-stretch justify-center gap-4 transition-transform duration-150 ${
              layoutMode === 'spread' ? 'max-w-6xl w-full' : 'max-w-3xl w-full'
            }`}
            style={{
              transform: `scale(${zoomLevel / 100})`,
              transformOrigin: 'center center',
            }}
          >
            {/* Right Page (In RTL books, right page comes first or second depending on spread) */}
            {renderSingleBookSheet(page1Content, currentPage, false)}

            {/* Left Page (If two-page spread mode is active) */}
            {layoutMode === 'spread' && page2Content && (
              renderSingleBookSheet(page2Content, currentPage + 1, true)
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
