import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  BookOpen,
  Info,
  Layers,
  ArrowRight,
  Search,
  RefreshCw,
} from 'lucide-react';
import { Category, PhysicalBook } from '../../types/library';

export interface ParsedPhysicalBookRow {
  id: string;
  title: string;
  author: string;
  categoryName: string;
  categoryId: string;
  publisher: string;
  publishYear: string;
  isbn: string;
  totalCopies: number;
  cabinet: string;
  shelf: string;
  section: string;
  pagesCount: number;
  summary: string;
  isValid: boolean;
  errors: string[];
}

export interface BulkCsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onImport: (books: Array<Partial<PhysicalBook> & { categoryName?: string }>) => Promise<boolean | void>;
  onSuccessRefresh?: () => void;
}

// Parses raw CSV text respecting quotes and commas inside cells
export function parseCsvText(csvText: string): string[][] {
  const cleanText = csvText.replace(/^\uFEFF/, '').trim(); // Remove UTF-8 BOM if present
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n
      }
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  // Push trailing cell and row
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export interface BulkCsvImportContentProps {
  categories?: Category[];
  onImport: (books: any[]) => Promise<any>;
  onSuccessRefresh?: () => void;
  onClose?: () => void;
}

export const BulkCsvImportContent: React.FC<BulkCsvImportContentProps> = ({
  categories = [],
  onImport,
  onSuccessRefresh,
  onClose,
}) => {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'completed'>('upload');
  const [fileName, setFileName] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedPhysicalBookRow[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [importingError, setImportingError] = useState<string | null>(null);
  const [importedSuccessCount, setImportedSuccessCount] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generates and triggers download of template CSV file with UTF-8 BOM for Arabic compatibility
  const handleDownloadTemplate = () => {
    const headers = [
      'العنوان',
      'المؤلف',
      'التصنيف',
      'دار النشر',
      'سنة النشر',
      'الرقم المعياري ISBN',
      'عدد النسخ',
      'الخزانة',
      'الرف',
      'القسم',
      'عدد الصفحات',
      'الملخص',
    ];

    const sampleRows = [
      [
        'بهجة الأنوار شرح بهجة النظر',
        'الإمام عبد الله بن حميد السالمي',
        'العلوم الشرعية والفكر الإسلامي',
        'مكتبة الإمام السالمي',
        '1425',
        '978-99901-23-45-1',
        '3',
        'A1',
        '2',
        'الفقه المقارن',
        '320',
        'شرح نفيس في أصول الفقه والعقيدة',
      ],
      [
        'ديوان أبي مسلم الرواحي',
        'أبو مسلم ناصر بن سالم الرواحي',
        'اللغة العربية وآدابها',
        'مطابع النهضة',
        '2018',
        '978-99901-88-99-0',
        '2',
        'B3',
        '1',
        'الشعر العربي',
        '450',
        'مختارات من قصائد وأشعار حسان عمان في التوحيد والوطنيات',
      ],
      [
        'تحفة الأعيان بسيرة أهل عمان',
        'عبد الله بن حميد السالمي',
        'التاريخ والحضارة والآثار',
        'مكتبة الاستقامة',
        '2015',
        '978-99901-11-22-3',
        '4',
        'C2',
        '3',
        'تاريخ عمان',
        '580',
        'أوسع مرجع تاريخي موثق في سيرة أئمة وأعلام عمان',
      ],
    ];

    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...sampleRows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))].join(
        '\r\n'
      );

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'نموذج_استيراد_الكتب_الورقية_مشكاة.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Maps header names flexibly (supports Arabic and Latin keys)
  const mapHeaderIndex = (headers: string[]) => {
    const cleanHeaders = headers.map((h) => h.replace(/[\"\'\s]/g, '').toLowerCase());
    const findIndex = (aliases: string[]) => {
      return cleanHeaders.findIndex((h) => aliases.some((a) => h.includes(a.toLowerCase())));
    };

    return {
      title: findIndex(['العنوان', 'اسم الكتاب', 'title', 'book']),
      author: findIndex(['المؤلف', 'اسم المؤلف', 'author', 'writer']),
      category: findIndex(['التصنيف', 'القسم', 'category', 'genre']),
      publisher: findIndex(['دار النشر', 'الناشر', 'publisher']),
      publishYear: findIndex(['سنة النشر', 'السنة', 'عام النشر', 'year', 'publishyear']),
      isbn: findIndex(['الرقم المعياري', 'isbn', 'الردمك', 'ردمك']),
      copies: findIndex(['عدد النسخ', 'النسخ', 'copies', 'totalcopies', 'count']),
      cabinet: findIndex(['الخزانة', 'الدولاب', 'cabinet']),
      shelf: findIndex(['الرف', 'shelf']),
      section: findIndex(['الفرع', 'الجناح', 'القسم المكتبي', 'section']),
      pages: findIndex(['عدد الصفحات', 'الصفحات', 'pages', 'pagescount']),
      summary: findIndex(['الملخص', 'الوصف', 'نبذة', 'summary', 'description']),
    };
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) return;

        const table = parseCsvText(text);
        if (table.length < 2) {
          alert('الملف فارغ أو لا يحتوي على صفوف بيانات كافية.');
          return;
        }

        const headerRow = table[0];
        const mapping = mapHeaderIndex(headerRow);

        if (mapping.title === -1) {
          alert('تعذر العثور على عمود "العنوان" في ترويسة ملف الـ CSV.');
          return;
        }

        const rows: ParsedPhysicalBookRow[] = [];
        for (let i = 1; i < table.length; i++) {
          const cells = table[i];
          const rawTitle = (mapping.title !== -1 ? cells[mapping.title] : '') || '';
          const rawAuthor = (mapping.author !== -1 ? cells[mapping.author] : '') || '';
          const rawCategory = (mapping.category !== -1 ? cells[mapping.category] : '') || '';
          const rawPublisher = (mapping.publisher !== -1 ? cells[mapping.publisher] : '') || '';
          const rawYear = (mapping.publishYear !== -1 ? cells[mapping.publishYear] : '') || '';
          const rawIsbn = (mapping.isbn !== -1 ? cells[mapping.isbn] : '') || '';
          const rawCopies = (mapping.copies !== -1 ? cells[mapping.copies] : '') || '1';
          const rawCabinet = (mapping.cabinet !== -1 ? cells[mapping.cabinet] : '') || '';
          const rawShelf = (mapping.shelf !== -1 ? cells[mapping.shelf] : '') || '';
          const rawSection = (mapping.section !== -1 ? cells[mapping.section] : '') || '';
          const rawPages = (mapping.pages !== -1 ? cells[mapping.pages] : '') || '0';
          const rawSummary = (mapping.summary !== -1 ? cells[mapping.summary] : '') || '';

          const title = rawTitle.trim();
          const author = rawAuthor.trim();
          const categoryName = rawCategory.trim();
          const errors: string[] = [];

          if (!title) {
            errors.push('عنوان الكتاب مفقود');
          }

          // Match category
          let matchedCatId = 'cat-general';
          if (categoryName) {
            const foundCat = categories.find(
              (c) =>
                c.name.toLowerCase().includes(categoryName.toLowerCase()) ||
                categoryName.toLowerCase().includes(c.name.toLowerCase()) ||
                c.id.toLowerCase() === categoryName.toLowerCase()
            );
            if (foundCat) matchedCatId = foundCat.id;
          }

          const parsedCopies = Math.max(1, parseInt(rawCopies, 10) || 1);
          const parsedPages = Math.max(0, parseInt(rawPages, 10) || 0);

          rows.push({
            id: `row-${i}-${Date.now()}`,
            title,
            author: author || 'مؤلف غير محدد',
            categoryName: categoryName || 'عام',
            categoryId: matchedCatId,
            publisher: rawPublisher.trim(),
            publishYear: rawYear.trim(),
            isbn: rawIsbn.trim(),
            totalCopies: parsedCopies,
            cabinet: rawCabinet.trim(),
            shelf: rawShelf.trim(),
            section: rawSection.trim(),
            pagesCount: parsedPages,
            summary: rawSummary.trim(),
            isValid: errors.length === 0,
            errors,
          });
        }

        setParsedRows(rows);
        setStep('preview');
      } catch (err: any) {
        alert(`فشل قراءة الملف: ${err.message}`);
      }
    };

    reader.readAsText(file, 'UTF-8');
  };

  const handleDeleteRow = (id: string) => {
    setParsedRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleConfirmImport = async () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      alert('لا توجد كتب صالحة للاستيراد. يرجى التأكد من احتواء الكتب على عناوين.');
      return;
    }

    setStep('importing');
    setImportingError(null);

    try {
      const itemsToImport: Array<Partial<PhysicalBook> & { categoryName?: string }> = validRows.map((r) => ({
        type: 'physical',
        title: r.title,
        author: r.author,
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        publisher: r.publisher || undefined,
        publishYear: r.publishYear ? parseInt(r.publishYear, 10) || undefined : undefined,
        isbn: r.isbn || undefined,
        totalCopies: r.totalCopies,
        availableCopies: r.totalCopies,
        pages: r.pagesCount,
        summary: r.summary,
        location: {
          cabinet: r.cabinet,
          shelf: r.shelf,
          section: r.section,
        },
      }));

      await onImport(itemsToImport);
      setImportedSuccessCount(validRows.length);
      setStep('completed');
      if (onSuccessRefresh) {
        onSuccessRefresh();
      }
    } catch (err: any) {
      setImportingError(err.message || 'حدث خطأ أثناء استيراد الكتب الورقية.');
      setStep('preview');
    }
  };

  const filteredRows = parsedRows.filter(
    (r) =>
      r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.categoryName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const invalidCount = parsedRows.length - validCount;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* STEP 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-6">
              {/* Instructions and Download Template Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-indigo-300 font-semibold text-sm">
                    <Info className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>نموذج ملف CSV المعتمد للمكتبة</span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    حمل النموذج الجاهز المُعرب، وافتحه في Microsoft Excel أو Google Sheets، واملأ بيانات كتبك ثم ارفعه هنا.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-md shadow-indigo-600/20 whitespace-nowrap cursor-pointer shrink-0"
                >
                  <Download className="w-4 h-4" />
                  <span>تحميل نموذج CSV الجاهز</span>
                </button>
              </div>

              {/* Upload Drop Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-amber-500/80 bg-slate-50 dark:bg-slate-950/50 hover:bg-slate-50 dark:bg-slate-950 rounded-3xl p-8 sm:p-12 text-center transition-all cursor-pointer group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelected}
                  accept=".csv,text/csv"
                  className="hidden"
                />
                <div className="w-16 h-16 rounded-3xl bg-amber-500/10 group-hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-4 transition-transform group-hover:scale-110">
                  <Upload className="w-8 h-8" />
                </div>
                <h4 className="text-base font-bold text-white mb-1">
                  انقر لاختيار ملف الـ CSV أو اسحبه وأفلته هنا
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  يدعم الملفات بصيغة CSV المشفرة بـ UTF-8. سيتم استخراج وفحص العناوين، المؤلفين، التصنيفات، وأماكن الرفوف تلقائياً.
                </p>
              </div>

              {/* Supported Columns Guide */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span>الأعمدة المدعومة في النموذج:</span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-amber-300 font-bold">العنوان (إلزامي)</span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">المؤلف</span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">التصنيف</span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">دار النشر</span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">سنة النشر</span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">الرقم المعياري</span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-emerald-300">عدد النسخ</span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">الخزانة</span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">الرف</span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">الملخص</span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Preview & Validation Table */}
          {step === 'preview' && (
            <div className="space-y-4">
              {importingError && (
                <div className="p-3.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{importingError}</span>
                </div>
              )}

              {/* Toolbar & Stats */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950/70 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-700 dark:text-slate-300 font-semibold">الملف: {fileName}</span>
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      جاهز: {validCount}
                    </span>
                    {invalidCount > 0 && (
                      <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        ناقص: {invalidCount}
                      </span>
                    )}
                  </div>
                </div>

                {/* Filter Search */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="بحث في البيانات المعروضة..."
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700/80 rounded-xl pr-9 pl-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Preview Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden max-h-[50vh] overflow-y-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
                    <tr>
                      <th className="p-3 w-10">#</th>
                      <th className="p-3">عنوان الكتاب</th>
                      <th className="p-3">المؤلف</th>
                      <th className="p-3">التصنيف</th>
                      <th className="p-3">النسخ</th>
                      <th className="p-3">الموقع المكتبي</th>
                      <th className="p-3">الحالة</th>
                      <th className="p-3 w-12 text-center">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-700 dark:text-slate-300">
                    {filteredRows.map((row, idx) => (
                      <tr key={row.id} className="hover:bg-slate-100 dark:bg-slate-800/40 transition-colors">
                        <td className="p-3 text-slate-500 font-mono">{idx + 1}</td>
                        <td className="p-3 font-semibold text-white">
                          <div>{row.title || <span className="text-rose-400 italic">بدون عنوان</span>}</div>
                          {row.isbn && <div className="text-[10px] text-slate-500 font-mono">ردمك: {row.isbn}</div>}
                        </td>
                        <td className="p-3 text-slate-700 dark:text-slate-300">{row.author}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 text-amber-300 border border-slate-300 dark:border-slate-700">
                            {row.categoryName}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-semibold text-emerald-400">{row.totalCopies}</td>
                        <td className="p-3 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                          {row.cabinet ? `خ:${row.cabinet}` : ''} {row.shelf ? `ر:${row.shelf}` : ''}
                        </td>
                        <td className="p-3">
                          {row.isValid ? (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>صالح</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] text-rose-400 font-semibold" title={row.errors.join(', ')}>
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>{row.errors[0]}</span>
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleDeleteRow(row.id)}
                            className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-100 dark:bg-slate-800 transition-colors cursor-pointer"
                            title="حذف هذا السطر"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredRows.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-500">
                          لا توجد بيانات مطابقة للبحث
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 3: Importing Spinner */}
          {step === 'importing' && (
            <div className="py-16 text-center space-y-4">
              <div className="w-16 h-16 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin mx-auto" />
              <h4 className="text-base font-bold text-white">جاري استيراد وحفظ الكتب في الخادم المركزي...</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                يتم التحقق من البيانات، توليد باركود النسخ، وتحديث سجلات الفهرسة والمكتبة.
              </p>
            </div>
          )}

          {/* STEP 4: Completed */}
          {step === 'completed' && (
            <div className="py-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h4 className="text-lg font-bold text-white">تم الاستيراد الجماعي بنجاح!</h4>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                تمت إضافة <span className="font-bold text-emerald-400 font-mono">{importedSuccessCount}</span> كتاب ورقي جديد إلى الفهرس المركزي بنجاح.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex items-center justify-between shrink-0">
          {step === 'preview' ? (
            <>
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-white hover:bg-slate-100 dark:bg-slate-800 transition-colors cursor-pointer"
              >
                اختيار ملف آخر
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-white hover:bg-slate-100 dark:bg-slate-800 transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={validCount === 0}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-amber-600/30 transition-all cursor-pointer whitespace-nowrap"
                >
                  <span>تأكيد استيراد {validCount} كتاب ورقي</span>
                  <ArrowRight className="w-4 h-4 rotate-180" />
                </button>
              </div>
            </>
          ) : step === 'completed' ? (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
              >
                إغلاق والعودة للفهرس
              </button>
            </div>
          ) : (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-white hover:bg-slate-100 dark:bg-slate-800 transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          )}
        </div>
      </div>
  );
};

export const BulkCsvImportModal: React.FC<BulkCsvImportModalProps> = ({
  isOpen,
  onClose,
  categories = [],
  onImport,
  onSuccessRefresh,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>استيراد الكتب الورقية جماعياً (ملف CSV)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
                  Bulk CSV
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                أضف عشرات أو مئات الكتب الورقية للفهرس المكتبي بدقة وسرعة عبر ملف بيانات Excel / CSV
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-white hover:bg-slate-100 dark:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <BulkCsvImportContent
          categories={categories}
          onImport={onImport}
          onSuccessRefresh={onSuccessRefresh}
          onClose={onClose}
        />
      </div>
    </div>
  );
};

