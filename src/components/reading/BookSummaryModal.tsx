import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  BookOpen,
  Library,
  FileText,
  Plus,
  Trash2,
  Edit3,
  Star,
  Quote,
  Check,
  X,
  ListOrdered,
  Lightbulb,
  Bookmark,
  Layers,
  Search,
  Tag,
} from 'lucide-react';
import { BookSummary, BookMedium, SummaryStructureType, PhysicalBook, DigitalBook } from '../../types/library';
import { matchesArabicQuery } from '../../utils/searchUtils';

interface BookSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  summaryToEdit?: BookSummary | null;
  initialBook?: {
    id: string;
    title: string;
    author: string;
    medium: BookMedium;
  } | null;
  physicalBooks?: PhysicalBook[];
  digitalBooks?: DigitalBook[];
  onSave: (summary: Omit<BookSummary, 'id' | 'createdAt'> & { id?: string }) => void;
}

export const BookSummaryModal: React.FC<BookSummaryModalProps> = ({
  isOpen,
  onClose,
  summaryToEdit,
  initialBook,
  physicalBooks = [],
  digitalBooks = [],
  onSave,
}) => {
  if (!isOpen) return null;

  const [bookMedium, setBookMedium] = useState<BookMedium>(
    summaryToEdit?.bookMedium || initialBook?.medium || 'physical'
  );
  const [selectedBookId, setSelectedBookId] = useState<string>(
    summaryToEdit?.bookId || initialBook?.id || ''
  );
  const [bookTitle, setBookTitle] = useState<string>(
    summaryToEdit?.bookTitle || initialBook?.title || ''
  );
  const [bookAuthor, setBookAuthor] = useState<string>(
    summaryToEdit?.bookAuthor || initialBook?.author || ''
  );

  const [title, setTitle] = useState<string>(
    summaryToEdit?.title || 'خلاصة الأفكار والفوائد الرئيسية للكتاب'
  );
  const [structureType, setStructureType] = useState<SummaryStructureType>(
    summaryToEdit?.structureType || 'structured'
  );
  const [mainIdea, setMainIdea] = useState<string>(
    summaryToEdit?.mainIdea || ''
  );

  // Key Takeaways (Bullet points)
  const [keyTakeaways, setKeyTakeaways] = useState<string[]>(
    summaryToEdit?.keyTakeaways || ['']
  );

  // Chapter Summaries
  const [chapters, setChapters] = useState<{
    chapterTitle: string;
    pagesRange?: string;
    keyPoints: string[];
  }[]>(
    summaryToEdit?.chaptersSummaries || [
      { chapterTitle: '', pagesRange: '', keyPoints: [''] },
    ]
  );

  // Quotes
  const [favoriteQuotes, setFavoriteQuotes] = useState<{
    quote: string;
    page?: number;
    reflection?: string;
  }[]>(
    summaryToEdit?.favoriteQuotes || [
      { quote: '', page: undefined, reflection: '' },
    ]
  );

  // Actionable Insights
  const [actionableInsights, setActionableInsights] = useState<string[]>(
    summaryToEdit?.actionableInsights || ['']
  );

  const [tagsInput, setTagsInput] = useState<string>(
    summaryToEdit?.tags ? summaryToEdit.tags.join('، ') : 'تلخيص، فوائد علمية'
  );
  const [rating, setRating] = useState<number>(summaryToEdit?.rating || 5);

  const [activeTab, setActiveTab] = useState<'main' | 'chapters' | 'quotes' | 'insights'>('main');

  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Click outside listener for dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter matching books based on medium and query with Arabic normalization
  const currentPool = bookMedium === 'physical' ? physicalBooks : digitalBooks;
  const filteredBooks = currentPool.filter((b) => {
    if (!bookTitle.trim()) return true;
    return (
      matchesArabicQuery(b.title, bookTitle) ||
      matchesArabicQuery(b.author, bookTitle) ||
      (b.isbn && b.isbn.toLowerCase().includes(bookTitle.toLowerCase().trim())) ||
      (b.tags && b.tags.some((t) => matchesArabicQuery(t, bookTitle)))
    );
  });

  const handleSelectBook = (bId: string) => {
    setSelectedBookId(bId);
    if (bookMedium === 'physical') {
      const b = physicalBooks.find((p) => p.id === bId);
      if (b) {
        setBookTitle(b.title);
        setBookAuthor(b.author);
        if (!title || title.startsWith('خلاصة') || title.startsWith('ملخص')) {
          setTitle(`خلاصة وافية: ${b.title}`);
        }
      }
    } else {
      const b = digitalBooks.find((d) => d.id === bId);
      if (b) {
        setBookTitle(b.title);
        setBookAuthor(b.author);
        if (!title || title.startsWith('خلاصة') || title.startsWith('ملخص')) {
          setTitle(`خلاصة وافية: ${b.title}`);
        }
      }
    }
    setShowSuggestions(false);
  };

  const handleSelectBookItem = (b: PhysicalBook | DigitalBook) => {
    setSelectedBookId(b.id);
    setBookTitle(b.title);
    setBookAuthor(b.author || '');
    if (!title || title.startsWith('خلاصة') || title.startsWith('ملخص')) {
      setTitle(`خلاصة وافية: ${b.title}`);
    }
    setShowSuggestions(false);
  };

  const handleTakeawayChange = (idx: number, val: string) => {
    const updated = [...keyTakeaways];
    updated[idx] = val;
    setKeyTakeaways(updated);
  };

  const addTakeaway = () => {
    setKeyTakeaways([...keyTakeaways, '']);
  };

  const removeTakeaway = (idx: number) => {
    if (keyTakeaways.length > 1) {
      setKeyTakeaways(keyTakeaways.filter((_, i) => i !== idx));
    }
  };

  const handleChapterChange = (cIdx: number, field: string, val: any) => {
    const updated = [...chapters];
    updated[cIdx] = { ...updated[cIdx], [field]: val };
    setChapters(updated);
  };

  const handleChapterPointChange = (cIdx: number, pIdx: number, val: string) => {
    const updated = [...chapters];
    const points = [...updated[cIdx].keyPoints];
    points[pIdx] = val;
    updated[cIdx].keyPoints = points;
    setChapters(updated);
  };

  const addChapterPoint = (cIdx: number) => {
    const updated = [...chapters];
    updated[cIdx].keyPoints = [...updated[cIdx].keyPoints, ''];
    setChapters(updated);
  };

  const removeChapterPoint = (cIdx: number, pIdx: number) => {
    const updated = [...chapters];
    if (updated[cIdx].keyPoints.length > 1) {
      updated[cIdx].keyPoints = updated[cIdx].keyPoints.filter((_, i) => i !== pIdx);
      setChapters(updated);
    }
  };

  const addChapter = () => {
    setChapters([...chapters, { chapterTitle: '', pagesRange: '', keyPoints: [''] }]);
  };

  const removeChapter = (cIdx: number) => {
    if (chapters.length > 1) {
      setChapters(chapters.filter((_, i) => i !== cIdx));
    }
  };

  const handleQuoteChange = (qIdx: number, field: string, val: any) => {
    const updated = [...favoriteQuotes];
    updated[qIdx] = { ...updated[qIdx], [field]: val };
    setFavoriteQuotes(updated);
  };

  const addQuote = () => {
    setFavoriteQuotes([...favoriteQuotes, { quote: '', page: undefined, reflection: '' }]);
  };

  const removeQuote = (qIdx: number) => {
    if (favoriteQuotes.length > 1) {
      setFavoriteQuotes(favoriteQuotes.filter((_, i) => i !== qIdx));
    }
  };

  const handleInsightChange = (idx: number, val: string) => {
    const updated = [...actionableInsights];
    updated[idx] = val;
    setActionableInsights(updated);
  };

  const addInsight = () => {
    setActionableInsights([...actionableInsights, '']);
  };

  const removeInsight = (idx: number) => {
    if (actionableInsights.length > 1) {
      setActionableInsights(actionableInsights.filter((_, i) => i !== idx));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookTitle.trim()) {
      alert('يرجى تحديد أو كتابة عنوان الكتاب المراد تلخيصه.');
      return;
    }

    const cleanedTags = tagsInput
      .split(/[,،]/)
      .map((t) => t.trim())
      .filter(Boolean);

    const cleanedTakeaways = keyTakeaways.map((t) => t.trim()).filter(Boolean);
    const cleanedChapters = chapters
      .filter((c) => c.chapterTitle.trim())
      .map((c) => ({
        ...c,
        keyPoints: c.keyPoints.map((p) => p.trim()).filter(Boolean),
      }));
    const cleanedQuotes = favoriteQuotes.filter((q) => q.quote.trim());
    const cleanedInsights = actionableInsights.map((i) => i.trim()).filter(Boolean);

    onSave({
      id: summaryToEdit?.id,
      studentId: summaryToEdit?.studentId || 'stu-001',
      bookId: selectedBookId || `book-${Date.now()}`,
      bookTitle,
      bookAuthor,
      bookMedium,
      title: title.trim() || `ملخص: ${bookTitle}`,
      structureType,
      mainIdea: mainIdea.trim(),
      keyTakeaways: cleanedTakeaways,
      chaptersSummaries: cleanedChapters,
      favoriteQuotes: cleanedQuotes,
      actionableInsights: cleanedInsights,
      tags: cleanedTags,
      rating,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 max-w-3xl w-full shadow-2xl animate-in zoom-in-95 max-h-[90vh] flex flex-col space-y-4">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                {summaryToEdit ? 'تعديل ملخص وتأملات الكتاب' : 'إنشاء ملخص منهجي وإبداعي للكتاب'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                تنظيم الأفكار الكبرى، الاقتباسات، خلاصات الأبواب، والتطبيقات العملية
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 pr-1 pl-1">
          {/* Book Choice & Medium */}
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                نوع الكتاب ومصدره:
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBookMedium('physical')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    bookMedium === 'physical'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>كتاب ورقي (المكتبة الورقية)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBookMedium('digital')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    bookMedium === 'digital'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Library className="w-3.5 h-3.5" />
                  <span>كتاب إلكتروني (المستودع الرقمي)</span>
                </button>
              </div>
            </div>

            {/* Select existing book or search with live autocomplete */}
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Autocomplete Book Title Input with live search dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Search className="w-3.5 h-3.5 text-indigo-500" />
                      <span>عنوان الكتاب (ابحث بكتابة جزء من العنوان):</span>
                      <span className="text-rose-500">*</span>
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      placeholder="مثال: مقدمة ابن خلدون، لسان العرب..."
                      value={bookTitle}
                      onChange={(e) => {
                        setBookTitle(e.target.value);
                        setShowSuggestions(true);
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 font-semibold pl-8"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                  </div>

                  {/* Autocomplete Suggestions Menu */}
                  {showSuggestions && (
                    <div className="absolute top-full right-0 left-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-50 max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in-50">
                      <div className="p-2 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-between">
                        <span>
                          اقتراحات الكتب ({filteredBooks.length}) - {bookMedium === 'physical' ? 'ورقي' : 'رقمي'}
                        </span>
                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400">انقر للتعبئة الفورية</span>
                      </div>
                      {filteredBooks.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-400">
                          لم يتم العثور على كتاب مطابق، يمكنك إكمال كتابة العنوان يدوياً.
                        </div>
                      ) : (
                        filteredBooks.slice(0, 8).map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => handleSelectBookItem(b)}
                            className="w-full text-right p-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors flex items-start justify-between gap-2 cursor-pointer group"
                          >
                            <div className="space-y-0.5 min-w-0">
                              <div className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">
                                {b.title}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                                <span>المؤلف: {b.author}</span>
                                {'location' in b && b.location && (
                                  <>
                                    <span>•</span>
                                    <span className="text-amber-600 dark:text-amber-400 font-mono text-[10px]">
                                      📍 {b.location.cabinet}
                                    </span>
                                  </>
                                )}
                                {'pages' in b && b.pages && (
                                  <>
                                    <span>•</span>
                                    <span>{b.pages} ص</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <span className="shrink-0 text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 group-hover:bg-indigo-600 group-hover:text-white text-slate-600 dark:text-slate-300 font-medium">
                              تحديد
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    أو اختر مباشرة من القائمة السريعة:
                  </label>
                  <select
                    value={selectedBookId}
                    onChange={(e) => handleSelectBook(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">-- تصفح قائمة كتب المكتبة --</option>
                    {bookMedium === 'physical'
                      ? physicalBooks.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.title} ({b.author})
                          </option>
                        ))
                      : digitalBooks.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.title} ({b.author})
                          </option>
                        ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  اسم المؤلف:
                </label>
                <input
                  type="text"
                  placeholder="المؤلف..."
                  value={bookAuthor}
                  onChange={(e) => setBookAuthor(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  عنوان الملخص / الفكرة الجامعة:
                </label>
                <input
                  type="text"
                  placeholder="مثال: خلاصة نظرية العمران والأطوار السياسية..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 font-semibold"
                />
              </div>
            </div>
          </div>

          {/* Sub-Navigation Tabs */}
          <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('main')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeTab === 'main'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5" />
              <span>الفكرة الكبرى والنقاط الجوهرية ({keyTakeaways.filter(Boolean).length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('chapters')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeTab === 'chapters'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>خلاصات الأبواب والفصول ({chapters.filter((c) => c.chapterTitle).length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('quotes')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeTab === 'quotes'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              <Quote className="w-3.5 h-3.5" />
              <span>الاقتباسات الذهبية والتأملات ({favoriteQuotes.filter((q) => q.quote).length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('insights')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeTab === 'insights'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>التطبيقات العملية والأثر الأكاديمي ({actionableInsights.filter(Boolean).length})</span>
            </button>
          </div>

          {/* TAB 1: Main Idea & Takeaways */}
          {activeTab === 'main' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  أطروحة الكتاب والفكرة المركزية (في 2-4 أسطر مكثفة):
                </label>
                <textarea
                  rows={3}
                  placeholder="ما هي الرسالة الجوهرية أو النظرية التي يدافع عنها المؤلف في هذا العمل؟"
                  value={mainIdea}
                  onChange={(e) => setMainIdea(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 leading-relaxed"
                />
              </div>

              {/* Key Takeaways */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <ListOrdered className="w-4 h-4 text-indigo-500" />
                    أهم النتائج والفوائد الجوهرية المستخلصة:
                  </label>
                  <button
                    type="button"
                    onClick={addTakeaway}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة فائدة</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {keyTakeaways.map((point, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-2">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        placeholder={`الفائدة أو النتيجة رقم ${idx + 1}...`}
                        value={point}
                        onChange={(e) => handleTakeawayChange(idx, e.target.value)}
                        className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                      {keyTakeaways.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTakeaway(idx)}
                          className="text-slate-400 hover:text-rose-500 p-2"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Chapters Breakdown */}
          {activeTab === 'chapters' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  تقسيمات الكتاب وخلاصات الأبواب:
                </span>
                <button
                  type="button"
                  onClick={addChapter}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة باب / فصل</span>
                </button>
              </div>

              <div className="space-y-4">
                {chapters.map((chapter, cIdx) => (
                  <div
                    key={cIdx}
                    className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="sm:col-span-2">
                          <input
                            type="text"
                            placeholder="عنوان الفصل / الباب (مثال: الباب الأول في العمران...)"
                            value={chapter.chapterTitle}
                            onChange={(e) => handleChapterChange(cIdx, 'chapterTitle', e.target.value)}
                            className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            placeholder="نطاق الصفحات (ص 20-50)"
                            value={chapter.pagesRange || ''}
                            onChange={(e) => handleChapterChange(cIdx, 'pagesRange', e.target.value)}
                            className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 text-center"
                          />
                        </div>
                      </div>

                      {chapters.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeChapter(cIdx)}
                          className="text-slate-400 hover:text-rose-500 p-1.5"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Chapter Points */}
                    <div className="space-y-1.5 pr-2">
                      {chapter.keyPoints.map((point, pIdx) => (
                        <div key={pIdx} className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                          <input
                            type="text"
                            placeholder="نقطة رئيسية في هذا الفصل..."
                            value={point}
                            onChange={(e) => handleChapterPointChange(cIdx, pIdx, e.target.value)}
                            className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100"
                          />
                          {chapter.keyPoints.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeChapterPoint(cIdx, pIdx)}
                              className="text-slate-400 hover:text-rose-500"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addChapterPoint(cIdx)}
                        className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-1 mt-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>إضافة نقطة لهذا الفصل</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: Favorite Quotes */}
          {activeTab === 'quotes' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  اقتباسات من الكتاب وتأملاتك الفكرية حولها:
                </span>
                <button
                  type="button"
                  onClick={addQuote}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة اقتباس</span>
                </button>
              </div>

              <div className="space-y-3">
                {favoriteQuotes.map((qItem, qIdx) => (
                  <div
                    key={qIdx}
                    className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Quote className="w-4 h-4 text-amber-500 shrink-0" />
                          <input
                            type="text"
                            placeholder="نص الاقتباس الحرفي..."
                            value={qItem.quote}
                            onChange={(e) => handleQuoteChange(qIdx, 'quote', e.target.value)}
                            className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100"
                          />
                          <input
                            type="number"
                            placeholder="ص"
                            value={qItem.page || ''}
                            onChange={(e) =>
                              handleQuoteChange(
                                qIdx,
                                'page',
                                e.target.value ? Number(e.target.value) : undefined
                              )
                            }
                            className="w-16 px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-center text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        <input
                          type="text"
                          placeholder="تأملك الشخصي أو سبب اختيار هذا الاقتباس (اختياري)..."
                          value={qItem.reflection || ''}
                          onChange={(e) => handleQuoteChange(qIdx, 'reflection', e.target.value)}
                          className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] text-slate-600 dark:text-slate-300"
                        />
                      </div>

                      {favoriteQuotes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeQuote(qIdx)}
                          className="text-slate-400 hover:text-rose-500 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: Actionable Insights & Rating & Tags */}
          {activeTab === 'insights' && (
            <div className="space-y-4">
              {/* Insights */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-emerald-500" />
                    كيف سأطبق ما تعلمته في أبحاثي أو حياتي الدراسية:
                  </label>
                  <button
                    type="button"
                    onClick={addInsight}
                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة تطبيق</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {actionableInsights.map((insight, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                        ✓
                      </span>
                      <input
                        type="text"
                        placeholder={`تطبيق عملي أو استخدام في بحث ${idx + 1}...`}
                        value={insight}
                        onChange={(e) => handleInsightChange(idx, e.target.value)}
                        className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                      {actionableInsights.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeInsight(idx)}
                          className="text-slate-400 hover:text-rose-500 p-2"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Tags & Rating */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    الوسوم والتصنيفات (مفصولة بفواصل):
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: فلسفة التاريخ، علم الاجتماع، أبحاث الصف"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    تقييمك الشخصي للقيمة العلمية للكتاب:
                  </label>
                  <div className="flex items-center gap-1.5 pt-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className="p-1 text-slate-300 hover:text-amber-400 transition-colors"
                      >
                        <Star
                          className={`w-5 h-5 ${
                            star <= rating
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-slate-300 dark:text-slate-700'
                          }`}
                        />
                      </button>
                    ))}
                    <span className="text-xs font-mono text-slate-500 font-bold mr-2">
                      ({rating} من 5 نجوم)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/30 flex items-center gap-2 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>حفظ الملخص في المفكرة الأكاديمية</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
