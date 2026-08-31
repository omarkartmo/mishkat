import React, { useState, useRef } from 'react';
import {
  FolderUp,
  FileUp,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
  Layers,
  FolderTree,
  HelpCircle,
  Trash2,
  RefreshCw,
  FolderOpen,
  ArrowRight,
  UploadCloud,
} from 'lucide-react';
import { Category, DigitalBook } from '../../types/library';

interface BulkDigitalImportModalProps {
  categories: Category[];
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (books: Omit<DigitalBook, 'id' | 'addedAt' | 'downloadCount' | 'readCount'>[]) => void;
}

interface StagedBook {
  tempId: string;
  originalFileName: string;
  relativePath: string;
  title: string;
  author: string;
  categoryId: string;
  format: 'pdf' | 'epub';
  fileSizeMb: number;
  pages: number;
  tags: string[];
  summary: string;
  matchedBy: 'folder' | 'ai_smart' | 'manual';
}

export const BulkDigitalImportModal: React.FC<BulkDigitalImportModalProps> = ({
  categories,
  isOpen,
  onClose,
  onImportSuccess,
}) => {
  const [folderPathInput, setFolderPathInput] = useState('D:/Library/School_Digital_Books');
  const [stagedBooks, setStagedBooks] = useState<StagedBook[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bulkCategoryOverride, setBulkCategoryOverride] = useState<string>('');
  const [selectedBooksCount, setSelectedBooksCount] = useState<number>(0);
  const [showGuide, setShowGuide] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Smart heuristic classifier for Arabic book titles & filenames
  const classifyBookSmartly = (
    fileName: string,
    relativePath: string
  ): { categoryId: string; title: string; author: string; matchedBy: 'folder' | 'ai_smart' } => {
    // 1. Check if relative path contains a subfolder matching an existing category name
    const pathParts = relativePath.split(/[/\\]/);
    if (pathParts.length > 1) {
      const folderName = pathParts[pathParts.length - 2].toLowerCase().trim();
      const matchedCat = categories.find(
        (c) =>
          c.name.toLowerCase().includes(folderName) ||
          folderName.includes(c.name.toLowerCase()) ||
          (folderName.includes('دين') || folderName.includes('شرع') || folderName.includes('فقه') || folderName.includes('عقيد')
            ? c.id === 'cat-islamic'
            : false) ||
          (folderName.includes('تاريخ') || folderName.includes('حضار') || folderName.includes('سير')
            ? c.id === 'cat-history'
            : false) ||
          (folderName.includes('لغ') || folderName.includes('أدب') || folderName.includes('شعر') || folderName.includes('نحو')
            ? c.id === 'cat-arabic'
            : false) ||
          (folderName.includes('علوم') || folderName.includes('فيزياء') || folderName.includes('حاسوب') || folderName.includes('تقني')
            ? c.id === 'cat-science'
            : false) ||
          (folderName.includes('روايات') || folderName.includes('قصص') || folderName.includes('ناشئ')
            ? c.id === 'cat-literature'
            : false)
      );

      if (matchedCat) {
        const { title, author } = cleanTitleAndAuthor(fileName);
        return {
          categoryId: matchedCat.id,
          title,
          author,
          matchedBy: 'folder',
        };
      }
    }

    // 2. Smart auto-classification based on filename keywords
    const { title, author } = cleanTitleAndAuthor(fileName);
    const cleanLower = fileName.toLowerCase();

    let categoryId = categories[0]?.id || 'cat-islamic';

    if (
      cleanLower.includes('فقه') ||
      cleanLower.includes('عقيدة') ||
      cleanLower.includes('تفسير') ||
      cleanLower.includes('حديث') ||
      cleanLower.includes('قرآن') ||
      cleanLower.includes('إباضي') ||
      cleanLower.includes('سالمي') ||
      cleanLower.includes('جيطالي') ||
      cleanLower.includes('بخاري') ||
      cleanLower.includes('مسلم') ||
      cleanLower.includes('أصول') ||
      cleanLower.includes('شريعة')
    ) {
      const islamicCat = categories.find((c) => c.id === 'cat-islamic' || c.name.includes('إسلام') || c.name.includes('شرع'));
      if (islamicCat) categoryId = islamicCat.id;
    } else if (
      cleanLower.includes('تاريخ') ||
      cleanLower.includes('حضارة') ||
      cleanLower.includes('عمان') ||
      cleanLower.includes('أندلس') ||
      cleanLower.includes('طبري') ||
      cleanLower.includes('ابن الأثير') ||
      cleanLower.includes('فتوح') ||
      cleanLower.includes('سيرة')
    ) {
      const histCat = categories.find((c) => c.id === 'cat-history' || c.name.includes('تاريخ') || c.name.includes('حضار'));
      if (histCat) categoryId = histCat.id;
    } else if (
      cleanLower.includes('نحو') ||
      cleanLower.includes('إعراب') ||
      cleanLower.includes('بلاغة') ||
      cleanLower.includes('معجم') ||
      cleanLower.includes('لسان العرب') ||
      cleanLower.includes('ألفية') ||
      cleanLower.includes('جرجاني') ||
      cleanLower.includes('سيبويه') ||
      cleanLower.includes('شعر')
    ) {
      const arabCat = categories.find((c) => c.id === 'cat-arabic' || c.name.includes('عرب') || c.name.includes('لغ'));
      if (arabCat) categoryId = arabCat.id;
    } else if (
      cleanLower.includes('فيزياء') ||
      cleanLower.includes('كيمياء') ||
      cleanLower.includes('أحياء') ||
      cleanLower.includes('رياضيات') ||
      cleanLower.includes('ذكاء') ||
      cleanLower.includes('برمجة') ||
      cleanLower.includes('علوم') ||
      cleanLower.includes('فلك')
    ) {
      const sciCat = categories.find((c) => c.id === 'cat-science' || c.name.includes('علوم') || c.name.includes('تقني'));
      if (sciCat) categoryId = sciCat.id;
    } else if (
      cleanLower.includes('رواية') ||
      cleanLower.includes('قصة') ||
      cleanLower.includes('ديوان') ||
      cleanLower.includes('أدب') ||
      cleanLower.includes('مسرحية')
    ) {
      const litCat = categories.find((c) => c.id === 'cat-literature' || c.name.includes('أدب') || c.name.includes('قصص'));
      if (litCat) categoryId = litCat.id;
    }

    return {
      categoryId,
      title,
      author,
      matchedBy: 'ai_smart',
    };
  };

  // Helper to extract clean Title & Author from common filename patterns
  const cleanTitleAndAuthor = (fileName: string): { title: string; author: string } => {
    // remove extension
    let clean = fileName.replace(/\.(pdf|epub|mobi)$/i, '');
    clean = clean.replace(/_/g, ' ').replace(/-/g, ' - ').replace(/\s+/g, ' ').trim();

    let title = clean;
    let author = 'غير محدد';

    // Pattern: "Title - Author" or "Author - Title"
    if (clean.includes(' - ')) {
      const parts = clean.split(' - ').map((p) => p.trim());
      if (parts.length >= 2) {
        if (
          parts[0].startsWith('الشيخ') ||
          parts[0].startsWith('الإمام') ||
          parts[0].startsWith('ابن') ||
          parts[0].startsWith('د.') ||
          parts[0].startsWith('أ.')
        ) {
          author = parts[0];
          title = parts.slice(1).join(' - ');
        } else {
          title = parts[0];
          author = parts.slice(1).join(' - ');
        }
      }
    } else if (clean.includes(' للشيخ ') || clean.includes(' للإمام ') || clean.includes(' تأليف ')) {
      const splitKeywords = [' للشيخ ', ' للإمام ', ' تأليف '];
      for (const kw of splitKeywords) {
        if (clean.includes(kw)) {
          const parts = clean.split(kw);
          title = parts[0].trim();
          author = parts[1].trim();
          break;
        }
      }
    }

    return { title, author };
  };

  // Handle local files selected by user
  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    const newStaged: StagedBook[] = [];

    Array.from(files).forEach((file, index) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext !== 'pdf' && ext !== 'epub') return;

      // Check if relative path was captured
      const relPath = (file as any).webkitRelativePath || file.name;
      const { categoryId, title, author, matchedBy } = classifyBookSmartly(file.name, relPath);

      const estimatedPages = Math.max(45, Math.min(1200, Math.floor(file.size / (1024 * 60))));
      const sizeMb = parseFloat((file.size / (1024 * 1024)).toFixed(2)) || 2.5;

      newStaged.push({
        tempId: `staged-${Date.now()}-${index}`,
        originalFileName: file.name,
        relativePath: relPath,
        title: title || file.name.replace(/\.[^/.]+$/, ''),
        author: author || 'غير محدد',
        categoryId,
        format: ext === 'epub' ? 'epub' : 'pdf',
        fileSizeMb: sizeMb,
        pages: estimatedPages,
        tags: ['استيراد جماعي', ext.toUpperCase()],
        summary: `تم استيراد هذا الكتاب رقمياً من الملف المحلي: ${file.name}`,
        matchedBy,
      });
    });

    setStagedBooks((prev) => [...prev, ...newStaged]);
    setSelectedBooksCount(newStaged.length);
    setIsProcessing(false);
  };

  // Simulate scanning a folder path if user pastes a path or clicks mock library scan
  const handleSimulateFolderScan = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const sampleScannedFiles = [
        {
          fileName: 'مقدمة_ابن_خلدون_في_التاريخ_والعمران.pdf',
          relPath: 'التاريخ_والحضارة/مقدمة_ابن_خلدون_في_التاريخ_والعمران.pdf',
          size: 4.8,
          pages: 620,
        },
        {
          fileName: 'طلعة_الشمس_شرح_شمس_الأصول_-_الشيخ_نور_الدين_السالمي.pdf',
          relPath: 'العلوم_الشرعية/طلعة_الشمس_شرح_شمس_الأصول_-_الشيخ_نور_الدين_السالمي.pdf',
          size: 6.2,
          pages: 480,
        },
        {
          fileName: 'شرح_ابن_عقيل_على_ألفية_ابن_مالك.pdf',
          relPath: 'اللغة_العربية_وآدابها/شرح_ابن_عقيل_على_ألفية_ابن_مالك.pdf',
          size: 3.5,
          pages: 390,
        },
        {
          fileName: 'تحفة_الأعيان_بسيرة_أهل_عمان_-_السالمي.pdf',
          relPath: 'التاريخ_والحضارة/تحفة_الأعيان_بسيرة_أهل_عمان_-_السالمي.pdf',
          size: 5.1,
          pages: 510,
        },
        {
          fileName: 'مبادئ_الفيزياء_الفلكية_واستكشاف_الفضاء.epub',
          relPath: 'العلوم_الطبيعية/مبادئ_الفيزياء_الفلكية_واستكشاف_الفضاء.epub',
          size: 2.1,
          pages: 280,
        },
        {
          fileName: 'كتاب_الإيضاح_في_الفقه_الإباضي_-_الشيخ_عامر_بن_علي_الشماخي.pdf',
          relPath: 'العلوم_الشرعية/كتاب_الإيضاح_في_الفقه_الإباضي_-_الشيخ_عامر_بن_علي_الشماخي.pdf',
          size: 7.9,
          pages: 740,
        },
        {
          fileName: 'البيان_والتبيين_-_الجاحظ.pdf',
          relPath: 'اللغة_العربية_وآدابها/البيان_والتبيين_-_الجاحظ.pdf',
          size: 4.2,
          pages: 430,
        },
      ];

      const newStaged: StagedBook[] = sampleScannedFiles.map((item, idx) => {
        const ext = item.fileName.endsWith('.epub') ? 'epub' : 'pdf';
        const { categoryId, title, author, matchedBy } = classifyBookSmartly(item.fileName, item.relPath);
        return {
          tempId: `mock-${Date.now()}-${idx}`,
          originalFileName: item.fileName,
          relativePath: `${folderPathInput}/${item.relPath}`,
          title,
          author,
          categoryId,
          format: ext,
          fileSizeMb: item.size,
          pages: item.pages,
          tags: ['استيراد جماعي', ext.toUpperCase(), 'مجلد محلي'],
          summary: `كتاب رقمي معتمد تم استيراده تلقائياً من المسار المحلي: ${item.relPath}`,
          matchedBy,
        };
      });

      setStagedBooks(newStaged);
      setSelectedBooksCount(newStaged.length);
      setIsProcessing(false);
    }, 600);
  };

  // Apply a category override to all staged books
  const handleApplyCategoryToAll = (catId: string) => {
    if (!catId) return;
    setStagedBooks((prev) =>
      prev.map((b) => ({
        ...b,
        categoryId: catId,
        matchedBy: 'manual',
      }))
    );
  };

  // Update specific book category or title
  const handleUpdateBook = (tempId: string, updates: Partial<StagedBook>) => {
    setStagedBooks((prev) =>
      prev.map((b) => (b.tempId === tempId ? { ...b, ...updates, matchedBy: 'manual' } : b))
    );
  };

  const handleRemoveBook = (tempId: string) => {
    setStagedBooks((prev) => prev.filter((b) => b.tempId !== tempId));
  };

  const handleConfirmImport = () => {
    if (stagedBooks.length === 0) return;

    const booksToImport: Omit<DigitalBook, 'id' | 'addedAt' | 'downloadCount' | 'readCount'>[] = stagedBooks.map((b) => ({
      title: b.title,
      author: b.author,
      categoryId: b.categoryId,
      format: b.format,
      fileSizeMb: b.fileSizeMb,
      pages: b.pages,
      tags: b.tags,
      summary: b.summary,
      filePath: b.relativePath,
      isLocalHosted: true,
      sourceOrigin: 'استيراد محلي جماعي (Bulk Directory)',
    }));

    onImportSuccess(booksToImport);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 dark:bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <FolderUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                الاستيراد الجماعي للكتب الرقمية (Bulk Importer)
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">
                  فرز ذكي وتلقائي
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                أدخل مسار المجلد أو اختر الملفات مباشرة ليقوم النظام باستخراج العناوين والتصنيفات بدقة عالية
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>دليل ترتيب المجلدات</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Informative Guidance Panel (Answers user's question directly in the UI) */}
        {showGuide && (
          <div className="p-4 bg-sky-950/40 border-b border-sky-800/40 text-xs text-slate-300 space-y-2">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sky-200 text-sm mb-1">
                  كيف يتعامل النظام مع ملفات الكتب الرقمية؟ هل يتعين عليك فرزها يدوياً؟
                </h4>
                <p className="text-slate-300 leading-relaxed">
                  <strong>لا يشترط فرزها مسبقاً!</strong> يوفر النظام خيارين مرنين لتوفير الجهد والوقت:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2.5">
                  <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                    <span className="font-bold text-emerald-400 flex items-center gap-1 mb-1">
                      <FolderTree className="w-3.5 h-3.5" />
                      1. طريقة المجلدات المصنفة (Folder Hierarchy)
                    </span>
                    <p className="text-[11px] text-slate-400">
                      إذا وضعت الكتب داخل مجلدات فرعية بأسمائها (مثلاً: <code className="text-amber-300">مجلد_الكتب/التاريخ/كتاب1.pdf</code>)، سيعتمد البرنامج اسم المجلد كتصنيف للكتاب مباشرة.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                    <span className="font-bold text-sky-400 flex items-center gap-1 mb-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      2. الفرز الذكي التلقائي (Smart Keywords Detection)
                    </span>
                    <p className="text-[11px] text-slate-400">
                      إذا كانت الكتب مجمعة في مجلد واحد، يحلل النظام أسماء الملفات ويطابق الكلمات المفتاحية التراثية والعلمية ليقترح التصنيف واسم المؤلف تلقائياً، مع إمكانية تعديلها بنقرة زر في الجدول أدناه!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Source Picker Section */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/30 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            {/* Direct Folder Path Input */}
            <div className="md:col-span-8 flex items-center gap-2 bg-slate-900 border border-slate-800 focus-within:border-emerald-500 rounded-2xl px-3.5 py-2">
              <FolderOpen className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="flex-1">
                <label className="text-[10px] text-slate-400 block">مسار المجلد المحلي على الخادم أو القرص الصلب:</label>
                <input
                  type="text"
                  value={folderPathInput}
                  onChange={(e) => setFolderPathInput(e.target.value)}
                  placeholder="مثال: D:/Library/Islamic_Books/ أو /var/www/school-library/digital/"
                  className="w-full bg-transparent text-xs text-slate-200 outline-none font-mono"
                />
              </div>
              <button
                onClick={handleSimulateFolderScan}
                disabled={isProcessing}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isProcessing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>فحص وتصنيف المحتوى</span>
              </button>
            </div>

            {/* Direct Multi-file Browse buttons */}
            <div className="md:col-span-4 flex items-center gap-2">
              {/* Directory Browser using webkitdirectory */}
              <input
                ref={directoryInputRef}
                type="file"
                // @ts-ignore
                webkitdirectory=""
                directory=""
                multiple
                className="hidden"
                onChange={(e) => handleFilesSelected(e.target.files)}
              />
              <button
                onClick={() => directoryInputRef.current?.click()}
                className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <FolderUp className="w-4 h-4 text-amber-400" />
                <span>اختيار مجلد كامل</span>
              </button>

              {/* Multiple files picker */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.epub"
                className="hidden"
                onChange={(e) => handleFilesSelected(e.target.files)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileUp className="w-4 h-4 text-sky-400" />
                <span>تحديد ملفات PDF/ePub</span>
              </button>
            </div>
          </div>
        </div>

        {/* Staged Books Table / Review area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {stagedBooks.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-800 hover:border-emerald-500/50 rounded-3xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all group bg-slate-950/20"
            >
              <div className="w-16 h-16 rounded-3xl bg-slate-800/80 group-hover:bg-emerald-500/10 border border-slate-700 group-hover:border-emerald-500/30 flex items-center justify-center text-slate-400 group-hover:text-emerald-400 transition-all mb-4">
                <UploadCloud className="w-8 h-8" />
              </div>
              <h4 className="text-sm font-bold text-slate-200 group-hover:text-emerald-300 transition-colors">
                اسحب وأفلت مجلد الكتب أو مجموعة ملفات هنا
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-md">
                يدعم صيغ PDF و ePub. سيقوم البرنامج بفحص العناوين، إزالة الرموز الزائدة، وتحديد التصنيف المناسب والمؤلف تلقائياً
              </p>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-[11px] px-3 py-1 bg-slate-800 text-slate-300 rounded-lg border border-slate-700">
                  أو اضغط زر "فحص وتصنيف المحتوى" لتجربة الفحص الذكي الفوري
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Batch Tools Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-200">
                    الكتب الجاهزة للاستيراد ({stagedBooks.length}):
                  </span>
                  <span className="text-[11px] text-slate-400">
                    (
                    {stagedBooks.filter((b) => b.matchedBy === 'folder').length} عبر المجلدات،{' '}
                    {stagedBooks.filter((b) => b.matchedBy === 'ai_smart').length} فرز ذكي
                    )
                  </span>
                </div>

                {/* Bulk override dropdown */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">تطبيق تصنيف موحد:</span>
                  <select
                    value={bulkCategoryOverride}
                    onChange={(e) => {
                      setBulkCategoryOverride(e.target.value);
                      handleApplyCategoryToAll(e.target.value);
                    }}
                    className="bg-slate-900 border border-slate-700 text-slate-200 rounded-xl px-2.5 py-1 text-xs outline-none"
                  >
                    <option value="">-- اختر لتطبيق تصنيف عام --</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => setStagedBooks([])}
                    className="p-1.5 text-slate-400 hover:text-rose-400 transition-colors"
                    title="تفريغ القائمة"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/40">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-3 font-semibold">اسم الملف الأصلي</th>
                      <th className="p-3 font-semibold">العنوان المستخرج</th>
                      <th className="p-3 font-semibold">المؤلف</th>
                      <th className="p-3 font-semibold">التصنيف المعتمد</th>
                      <th className="p-3 font-semibold text-center">الصيغة / الحجم</th>
                      <th className="p-3 font-semibold text-center">طريقة الفرز</th>
                      <th className="p-3 font-semibold text-center">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {stagedBooks.map((book) => {
                      return (
                        <tr key={book.tempId} className="hover:bg-slate-900/60 transition-colors">
                          <td className="p-3 font-mono text-[11px] text-slate-400 max-w-[160px] truncate" title={book.originalFileName}>
                            {book.originalFileName}
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={book.title}
                              onChange={(e) => handleUpdateBook(book.tempId, { title: e.target.value })}
                              className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-lg px-2 py-1 text-slate-100 font-semibold outline-none"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={book.author}
                              onChange={(e) => handleUpdateBook(book.tempId, { author: e.target.value })}
                              className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-lg px-2 py-1 text-slate-300 outline-none"
                            />
                          </td>
                          <td className="p-3">
                            <select
                              value={book.categoryId}
                              onChange={(e) => handleUpdateBook(book.tempId, { categoryId: e.target.value })}
                              className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-lg px-2 py-1 text-slate-200 text-xs outline-none"
                            >
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-3 text-center">
                            <span className="uppercase font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {book.format}
                            </span>
                            <span className="text-[10px] text-slate-500 mr-1.5 font-mono">
                              {book.fileSizeMb} MB
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            {book.matchedBy === 'folder' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <FolderTree className="w-3 h-3" />
                                مجلد فرعي
                              </span>
                            ) : book.matchedBy === 'ai_smart' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                                <Sparkles className="w-3 h-3" />
                                فرز ذكي
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                يدوي
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleRemoveBook(book.tempId)}
                              className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                              title="حذف من الاستيراد"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {stagedBooks.length > 0 && (
              <span>
                الإجمالي:{' '}
                <strong className="text-slate-200 font-mono">{stagedBooks.length}</strong> كتاب رقمي جاهز للإضافة إلى المستودع المركزي.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={stagedBooks.length === 0}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>استيراد جميع الكتب ({stagedBooks.length}) للمكتبة</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
