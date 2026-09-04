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
  Check,
  Search,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { Category, DigitalBook } from '../../types/library';
import { bookRepository } from '../../services/bookRepository';

interface BulkDigitalImportModalProps {
  categories: Category[];
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (importedCount: number) => void;
}

export interface StagedBookItem {
  tempId: string;
  originalFileName: string;
  stagedFilePath: string;
  format: 'pdf' | 'epub';
  fileSizeMb: number;
  fileHash: string;
  title: string;
  author: string;
  categoryId: string;
  categoryName?: string;
  confidence: number;
  status: 'ready' | 'needs_review' | 'duplicate' | 'imported' | 'failed';
  isDuplicate?: boolean;
  duplicateReason?: string | null;
  pages?: number;
  summary?: string;
}

export const BulkDigitalImportModal: React.FC<BulkDigitalImportModalProps> = ({
  categories,
  isOpen,
  onClose,
  onImportSuccess,
}) => {
  const [folderPathInput, setFolderPathInput] = useState('');
  const [stagedBooks, setStagedBooks] = useState<StagedBookItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [bulkCategoryOverride, setBulkCategoryOverride] = useState<string>('');
  const [showGuide, setShowGuide] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    total: number;
    imported: number;
    skipped: number;
    failed: number;
    message: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Handle local files selected by user -> upload to backend /bulk-stage for real staging & metadata extraction
  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setImportResult(null);

    try {
      const formData = new FormData();
      let count = 0;
      Array.from(files).forEach((file) => {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'pdf' || ext === 'epub') {
          formData.append('files', file);
          count++;
        }
      });

      if (count === 0) {
        setErrorMessage('لم يتم العثور على أي ملفات بصيغة PDF أو EPUB صالحة.');
        setIsProcessing(false);
        return;
      }

      const res = await bookRepository.bulkStageFiles(formData);
      if (res.success && res.data) {
        setStagedBooks((prev) => [...prev, ...res.data!.staged]);
      } else {
        setErrorMessage(res.error?.message || 'فشل إرسال الملفات للخادم المركزي للفرز والتجهيز.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء رفع وتجهيز الملفات.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (directoryInputRef.current) directoryInputRef.current.value = '';
    }
  };

  // Scan server folder path (or configured digitalBookRootUrl)
  const handleScanDirectory = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    setImportResult(null);

    try {
      const res = await bookRepository.bulkScanDirectory(folderPathInput.trim() || undefined);
      if (res.success && res.data) {
        if (res.data.items.length === 0) {
          setErrorMessage(`لم يتم العثور على أي ملفات PDF أو EPUB في المسار: ${res.data.rootScanned}`);
        } else {
          setStagedBooks(res.data.items);
        }
      } else {
        setErrorMessage(res.error?.message || 'فشل فحص المجلد المركزي.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء فحص المجلد.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Apply a category override to all staged books
  const handleApplyCategoryToAll = (catId: string) => {
    if (!catId) return;
    const catName = categories.find((c) => c.id === catId)?.name || '';
    setStagedBooks((prev) =>
      prev.map((b) => ({
        ...b,
        categoryId: catId,
        categoryName: catName,
        confidence: 100,
        status: b.status === 'needs_review' ? 'ready' : b.status,
      }))
    );
  };

  // Update specific book field
  const handleUpdateBook = (tempId: string, updates: Partial<StagedBookItem>) => {
    setStagedBooks((prev) =>
      prev.map((b) => {
        if (b.tempId !== tempId) return b;
        const updated = { ...b, ...updates };
        if (updates.categoryId) {
          updated.categoryName = categories.find((c) => c.id === updates.categoryId)?.name || b.categoryName;
          updated.confidence = 100;
          if (updated.status === 'needs_review') updated.status = 'ready';
        }
        return updated;
      })
    );
  };

  const handleRemoveBook = (tempId: string) => {
    setStagedBooks((prev) => prev.filter((b) => b.tempId !== tempId));
  };

  // Execute actual import to library (calls /api/v1/books/bulk-import in safe chunks)
  const handleConfirmImport = async () => {
    const validBooks = stagedBooks.filter((b) => !b.isDuplicate && b.status !== 'duplicate');
    if (validBooks.length === 0) {
      setErrorMessage('لا توجد كتب صالحة للاستيراد (قد تكون جميع الملفات مكررة مسبقاً).');
      return;
    }

    setIsImporting(true);
    setErrorMessage(null);

    try {
      const res = await bookRepository.bulkImportStagedItems(validBooks);
      if (res.success && res.data) {
        setImportResult(res.data);
        onImportSuccess(res.data.imported);
        // Clear staged books if all imported or show remaining
        if (res.data.imported > 0) {
          setStagedBooks([]);
        }
      } else {
        setErrorMessage(res.error?.message || 'تعذر استيراد الكتب إلى المستودع المركزي.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ غير متوقع أثناء الاستيراد.');
    } finally {
      setIsImporting(false);
    }
  };

  const readyCount = stagedBooks.filter((b) => b.status === 'ready').length;
  const reviewCount = stagedBooks.filter((b) => b.status === 'needs_review').length;
  const duplicateCount = stagedBooks.filter((b) => b.isDuplicate || b.status === 'duplicate').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <FolderUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                الاستيراد والتصنيف الجماعي للكتب الرقمية (Server-Authoritative Bulk Importer)
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">
                  فرز وتخزين مركزي حقيقي
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                فحص الخادم أو رفع الملفات، استخراج البصمات والعناوين والتصنيف التلقائي قبل الاستيراد لمنع التكرار
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

        {/* Guide Panel */}
        {showGuide && (
          <div className="p-4 bg-sky-950/40 border-b border-sky-800/40 text-xs text-slate-300 space-y-2">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sky-200 text-sm mb-1">
                  آلية المعالجة والتصنيف التلقائي في مشكاة:
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2.5">
                  <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                    <span className="font-bold text-emerald-400 flex items-center gap-1 mb-1">
                      <FolderTree className="w-3.5 h-3.5" />
                      1. الفحص من المسار المعتمد
                    </span>
                    <p className="text-[11px] text-slate-400">
                      يمكن فحص المجلد المخصص في إعدادات النظام مباشرة على الخادم مع استيراد المجلدات الفرعية.
                    </p>
                  </div>
                  <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                    <span className="font-bold text-sky-400 flex items-center gap-1 mb-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      2. الفرز الذكي والتصنيف
                    </span>
                    <p className="text-[11px] text-slate-400">
                      يحلل النظام الكلمات المفتاحية التراثية والعلمية ويعين التصنيف المقترح ونسبة الثقة قبل الحفظ.
                    </p>
                  </div>
                  <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                    <span className="font-bold text-amber-400 flex items-center gap-1 mb-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      3. فحص البصمة والتكرار (SHA-256)
                    </span>
                    <p className="text-[11px] text-slate-400">
                      يتم احتساب بصمة كل ملف لمنع تكرار تخزين الكتب في المستودع المركزي.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error or Result Message Banner */}
        {errorMessage && (
          <div className="p-3 bg-rose-950/60 border-b border-rose-800/60 flex items-center gap-2 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {importResult && (
          <div className="p-3 bg-emerald-950/60 border-b border-emerald-800/60 flex items-center justify-between text-xs text-emerald-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{importResult.message}</span>
            </div>
            <span className="font-mono text-[11px] bg-emerald-900/40 px-2 py-0.5 rounded border border-emerald-700/50">
              ناجح: {importResult.imported} | متخطى (مكرر): {importResult.skipped} | فاشل: {importResult.failed}
            </span>
          </div>
        )}

        {/* Source Picker Section */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/30 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            {/* Direct Folder Path Input */}
            <div className="md:col-span-7 flex items-center gap-2 bg-slate-900 border border-slate-800 focus-within:border-emerald-500 rounded-2xl px-3.5 py-2">
              <FolderOpen className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="flex-1">
                <label className="text-[10px] text-slate-400 block">مسار المجلد على الخادم أو اترك فارغاً لاستخدام مسار الإعدادات المعتمد:</label>
                <input
                  type="text"
                  value={folderPathInput}
                  onChange={(e) => setFolderPathInput(e.target.value)}
                  placeholder="المسار المعتمد في إعدادات النظام (Digital Book Root URL)"
                  className="w-full bg-transparent text-xs text-slate-200 outline-none font-mono"
                />
              </div>
              <button
                onClick={handleScanDirectory}
                disabled={isProcessing || isImporting}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isProcessing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>فحص وتصنيف الخادم</span>
              </button>
            </div>

            {/* Direct Multi-file Browse buttons */}
            <div className="md:col-span-5 flex items-center gap-2">
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
                disabled={isProcessing || isImporting}
                className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <FolderUp className="w-4 h-4 text-amber-400" />
                <span>رفع مجلد محلي كامل</span>
              </button>

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
                disabled={isProcessing || isImporting}
                className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
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
                يدعم صيغ PDF و ePub. سيتم نقل الملفات إلى بيئة التجهيز المركزية (Staging Area)، فحص البصمة، واستخراج العناوين والتصنيفات المقترحة بدقة.
              </p>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-[11px] px-3 py-1 bg-slate-800 text-slate-300 rounded-lg border border-slate-700">
                  أو اضغط زر "فحص وتصنيف الخادم" للبحث في المجلد المعين في الإعدادات
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Batch Tools Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-200">
                    الكتب المجهزة للاستيراد ({stagedBooks.length}):
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    جاهز: {readyCount}
                  </span>
                  {reviewCount > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      يحتاج مراجعة: {reviewCount}
                    </span>
                  )}
                  {duplicateCount > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      مكرر مسبقاً: {duplicateCount}
                    </span>
                  )}
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

              {/* Table (Section 25 Preview Requirement) */}
              <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/40">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-3 font-semibold">الملف الأصلي</th>
                      <th className="p-3 font-semibold">العنوان المستخرج</th>
                      <th className="p-3 font-semibold">المؤلف</th>
                      <th className="p-3 font-semibold">التصنيف المعتمد</th>
                      <th className="p-3 font-semibold text-center">النوع / الحجم</th>
                      <th className="p-3 font-semibold text-center">الحالة / الدقة</th>
                      <th className="p-3 font-semibold text-center">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {stagedBooks.map((book) => {
                      return (
                        <tr
                          key={book.tempId}
                          className={`hover:bg-slate-900/60 transition-colors ${
                            book.isDuplicate ? 'opacity-60 bg-rose-950/10' : ''
                          }`}
                        >
                          <td className="p-3 font-mono text-[11px] text-slate-400 max-w-[160px] truncate" title={book.originalFileName}>
                            {book.originalFileName}
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={book.title}
                              disabled={book.isDuplicate}
                              onChange={(e) => handleUpdateBook(book.tempId, { title: e.target.value })}
                              className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-lg px-2 py-1 text-slate-100 font-semibold outline-none disabled:opacity-50"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={book.author}
                              disabled={book.isDuplicate}
                              onChange={(e) => handleUpdateBook(book.tempId, { author: e.target.value })}
                              className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-lg px-2 py-1 text-slate-300 outline-none disabled:opacity-50"
                            />
                          </td>
                          <td className="p-3">
                            <select
                              value={book.categoryId}
                              disabled={book.isDuplicate}
                              onChange={(e) => handleUpdateBook(book.tempId, { categoryId: e.target.value })}
                              className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-lg px-2 py-1 text-slate-200 text-xs outline-none disabled:opacity-50"
                            >
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <span className="uppercase font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {book.format}
                            </span>
                            <span className="text-[10px] text-slate-500 mr-1.5 font-mono">
                              {book.fileSizeMb} MB
                            </span>
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            {book.isDuplicate ? (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20" title={book.duplicateReason || ''}>
                                <AlertTriangle className="w-3 h-3" />
                                مكرر
                              </span>
                            ) : book.status === 'needs_review' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20" title={`نسبة الدقة: ${book.confidence}%`}>
                                يحتاج مراجعة ({book.confidence}%)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" title={`نسبة الدقة: ${book.confidence}%`}>
                                <Check className="w-3 h-3" />
                                جاهز ({book.confidence}%)
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleRemoveBook(book.tempId)}
                              className="p-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                              title="استبعاد من الاستيراد"
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
                إجمالي المعروض:{' '}
                <strong className="text-slate-200 font-mono">{stagedBooks.length}</strong> | صالح للاستيراد:{' '}
                <strong className="text-emerald-400 font-mono">{stagedBooks.filter((b) => !b.isDuplicate).length}</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isImporting}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              إغلاق
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={stagedBooks.length === 0 || stagedBooks.every((b) => b.isDuplicate) || isImporting}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isImporting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>
                {isImporting
                  ? 'جاري الاستيراد والتخزين المركزي...'
                  : `استيراد الكتب الصالحة (${stagedBooks.filter((b) => !b.isDuplicate).length}) للمكتبة`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

