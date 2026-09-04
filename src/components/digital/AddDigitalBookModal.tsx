import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  HardDrive,
  ShieldCheck,
  ArrowRight,
  BookOpen,
  Image,
} from 'lucide-react';
import { Category } from '../../types/library';
import { apiClient } from '../../services/apiClient';
import { bookRepository } from '../../services/bookRepository';

interface AddDigitalBookModalProps {
  categories: Category[];
  adminUserId: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'upload' | 'metadata' | 'done';

interface UploadedFileInfo {
  bookId: string;
  fileUrl: string;
  filePath: string;
  coverUrl?: string;
  fileSize: string;
  fileSizeMb: number;
  originalName: string;
  fileHash: string;
}

function extractMeta(name: string): { title: string; author: string } {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (base.includes(' - ')) {
    const parts = base.split(' - ');
    return { title: parts[0].trim(), author: parts.slice(1).join(' - ').trim() };
  }
  if (base.includes(' للشيخ ')) {
    const parts = base.split(' للشيخ ');
    return { title: parts[0].trim(), author: `الشيخ ${parts[1].trim()}` };
  }
  if (base.includes(' تأليف ')) {
    const parts = base.split(' تأليف ');
    return { title: parts[0].trim(), author: parts[1].trim() };
  }
  return { title: base, author: 'مؤلف غير محدد' };
}

export const AddDigitalBookModal: React.FC<AddDigitalBookModalProps> = ({
  categories,
  adminUserId,
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<Step>('upload');
  const [uploadedFile, setUploadedFile] = useState<UploadedFileInfo | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedCover, setSelectedCover] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [format, setFormat] = useState<'pdf' | 'epub'>('pdf');
  const [pages, setPages] = useState(200);
  const [summary, setSummary] = useState('');
  const [language, setLanguage] = useState('العربية');
  const [isbn, setIsbn] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!selectedFile) { setUploadError('الرجاء اختيار ملف PDF أو EPUB أولاً.'); return; }
    const ext = selectedFile.name.split('.').pop()?.toLowerCase() || '';
    if (!['pdf', 'epub'].includes(ext)) { setUploadError('يُسمح فقط بملفات PDF و EPUB.'); return; }

    setIsUploading(true);
    setUploadError(null);

    try {
      const res = await bookRepository.uploadSingleDigitalBook(selectedFile, selectedCover);

      if (!res.success || !res.data) {
        setUploadError(res.error?.message || 'فشل رفع الملف إلى الخادم المركزي.');
        setIsUploading(false);
        return;
      }

      const data = res.data;
      if (!data.filePath || !data.fileHash) {
        setUploadError('الخادم المركزي لم يؤكد استلام وحفظ الملف بشكل صحيح. يرجى إعادة المحاولة.');
        setIsUploading(false);
        return;
      }

      setUploadedFile({
        bookId: data.bookId,
        fileUrl: data.fileUrl,
        filePath: data.filePath,
        coverUrl: data.coverUrl,
        fileSize: data.fileSize,
        fileSizeMb: data.fileSizeMb,
        originalName: data.originalName || selectedFile.name,
        fileHash: data.fileHash,
      });

      const meta = extractMeta(selectedFile.name);
      setTitle(meta.title);
      setAuthor(meta.author);
      setFormat(data.format === 'epub' ? 'epub' : 'pdf');
      setPages(Math.max(50, Math.round((data.fileSizeMb || 1) * 45)));
      setStep('metadata');
    } catch (err: any) {
      setUploadError(err.message || 'تعذر الاتصال بالخادم المركزي.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadedFile) return;
    if (!title.trim()) { setSaveError('عنوان الكتاب إلزامي.'); return; }

    setIsSaving(true);
    setSaveError(null);

    try {
      const res = await apiClient.post('/books', {
        id: uploadedFile.bookId,
        type: 'digital',
        title: title.trim(),
        author: author.trim() || 'مؤلف غير محدد',
        categoryId: categoryId || 'cat-general',
        format,
        fileSize: uploadedFile.fileSize,
        fileUrl: uploadedFile.fileUrl,
        filePath: uploadedFile.filePath,
        fileHash: uploadedFile.fileHash,
        coverImage: uploadedFile.coverUrl || null,
        pagesCount: Number(pages) || 200,
        summary: summary.trim() || `كتاب رقمي مرفوع مباشرة: ${title.trim()}`,
        language: language.trim() || 'العربية',
        isbn: isbn.trim() || null,
        sourceOrigin: 'رفع مباشر من الإدارة',
        uploadedBy: adminUserId,
        tags: ['رفع مباشر', format.toUpperCase()],
      });

      if (!res.success) {
        setSaveError(res.error?.message || 'فشل حفظ بيانات الكتاب في قاعدة البيانات.');
        setIsSaving(false);
        return;
      }

      setStep('done');
      setTimeout(() => { onSuccess(); onClose(); }, 1800);
    } catch (err: any) {
      setSaveError(err.message || 'حدث خطأ غير متوقع أثناء الحفظ.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[150] animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base">إضافة كتاب رقمي فردي</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {step === 'upload' ? 'الخطوة ١: رفع الملف إلى الخادم المركزي' :
                 step === 'metadata' ? 'الخطوة ٢: بيانات الكتاب وتصنيفه' : 'تم الاستيراد بنجاح'}
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={isUploading || isSaving}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step bar */}
        <div className="flex items-center gap-2 px-5 py-3 bg-slate-950/50 border-b border-slate-800/60 text-xs">
          {[
            { key: 'upload', icon: <Upload className="w-3.5 h-3.5" />, label: 'رفع الملف' },
            { key: 'metadata', icon: <BookOpen className="w-3.5 h-3.5" />, label: 'البيانات' },
            { key: 'done', icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: 'تم' },
          ].map((s, i, arr) => (
            <React.Fragment key={s.key}>
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition-colors ${step === s.key ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-500'}`}>
                {s.icon}{s.label}
              </div>
              {i < arr.length - 1 && <ArrowRight className="w-3 h-3 text-slate-600" />}
            </React.Fragment>
          ))}
        </div>

        <div className="p-5">
          {/* ====== STEP 1: UPLOAD ====== */}
          {step === 'upload' && (
            <div className="space-y-4">
              {uploadError && (
                <div className="p-3 bg-rose-950/50 border border-rose-800/60 rounded-xl text-rose-200 flex items-start gap-2.5 text-xs">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div><strong className="block text-rose-300 font-semibold mb-0.5">خطأ في الرفع</strong>{uploadError}</div>
                </div>
              )}

              <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500/60 rounded-2xl p-8 text-center space-y-3 cursor-pointer transition-colors"
                onClick={() => fileInputRef.current?.click()}>
                <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto text-emerald-400">
                  <FileText className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-slate-200 font-semibold text-sm">
                    {selectedFile ? selectedFile.name : 'اضغط لاختيار ملف PDF أو ePub'}
                  </p>
                  {selectedFile
                    ? <p className="text-emerald-400 text-xs mt-1">الحجم: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    : <p className="text-slate-500 text-xs mt-1">الحد الأقصى 100 MB — PDF أو ePub فقط</p>
                  }
                </div>
                <input ref={fileInputRef} type="file" accept=".pdf,.epub" className="hidden"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
              </div>

              <div className="border border-slate-800 hover:border-slate-600 rounded-xl p-4 flex items-center gap-3 cursor-pointer transition-colors"
                onClick={() => coverInputRef.current?.click()}>
                <div className="w-8 h-8 bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center text-slate-400">
                  <Image className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-300 text-xs font-medium">{selectedCover ? selectedCover.name : 'إضافة صورة غلاف (اختياري)'}</p>
                  {selectedCover && <p className="text-slate-500 text-[11px]">{(selectedCover.size / 1024).toFixed(0)} KB</p>}
                </div>
                <span className="text-[10px] text-slate-500 shrink-0 font-mono">JPG / PNG / WebP</span>
                <input ref={coverInputRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden"
                  onChange={(e) => setSelectedCover(e.target.files?.[0] || null)} />
              </div>

              <div className="p-3 bg-sky-950/40 border border-sky-800/60 rounded-xl flex items-start gap-2.5 text-[11px] text-sky-200">
                <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-sky-300 font-semibold mb-0.5">تحقق مركزي من الملف</strong>
                  سيتم حساب البصمة الرقمية SHA-256 على الخادم فور الاستلام، والتحقق من عدم وجود نسخ مكررة قبل تسجيل أي سجل في قاعدة البيانات.
                </div>
              </div>

              <button type="button" disabled={!selectedFile || isUploading} onClick={handleUpload}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl font-semibold shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed">
                {isUploading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /><span>جاري الرفع إلى الخادم المركزي...</span></>
                  : <><Upload className="w-4 h-4" /><span>رفع الملف إلى الخادم المركزي</span></>}
              </button>
            </div>
          )}

          {/* ====== STEP 2: METADATA ====== */}
          {step === 'metadata' && uploadedFile && (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl space-y-1.5 text-[11px]">
                <div className="flex items-center gap-1.5 text-emerald-300 font-bold">
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>تأكيد استلام الخادم المركزي للملف</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-400 font-mono">
                  <span>الحجم:</span><span className="text-slate-200">{uploadedFile.fileSize}</span>
                  <span>SHA-256:</span><span className="text-emerald-400 truncate" title={uploadedFile.fileHash}>{uploadedFile.fileHash.substring(0, 24)}…</span>
                  <span>المسار:</span><span className="text-slate-300 truncate" title={uploadedFile.filePath}>{uploadedFile.filePath.split(/[/\\]/).slice(-2).join('/')}</span>
                </div>
              </div>

              {saveError && (
                <div className="p-3 bg-rose-950/50 border border-rose-800/60 rounded-xl text-rose-200 flex items-start gap-2.5 text-xs">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div><strong className="block text-rose-300 font-semibold mb-0.5">خطأ في الحفظ</strong>{saveError}</div>
                </div>
              )}

              <form onSubmit={handleSave} className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">عنوان الكتاب *</label>
                    <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">المؤلف أو المحقق</label>
                    <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-emerald-500" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">التصنيف</label>
                    <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-emerald-500">
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">الصيغة</label>
                    <select value={format} onChange={(e) => setFormat(e.target.value as 'pdf' | 'epub')}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-emerald-500">
                      <option value="pdf">PDF</option>
                      <option value="epub">ePub</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">اللغة</label>
                    <input type="text" value={language} onChange={(e) => setLanguage(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-emerald-500" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">عدد الصفحات (تقريبي)</label>
                    <input type="number" min="1" value={pages} onChange={(e) => setPages(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">رقم ISBN (اختياري)</label>
                    <input type="text" value={isbn} onChange={(e) => setIsbn(e.target.value)} placeholder="978-..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono outline-none focus:border-emerald-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">نبذة عن الكتاب</label>
                  <textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-emerald-500 resize-none" />
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-800 gap-3">
                  <button type="button" onClick={() => { setStep('upload'); setUploadedFile(null); }}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium text-xs cursor-pointer transition-colors">
                    رجوع لرفع ملف آخر
                  </button>
                  <button type="submit" disabled={isSaving}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl font-semibold shadow-lg flex items-center gap-2 cursor-pointer transition-all disabled:cursor-not-allowed">
                    {isSaving
                      ? <><Loader2 className="w-4 h-4 animate-spin" /><span>جاري الحفظ في المستودع...</span></>
                      : <><CheckCircle2 className="w-4 h-4" /><span>حفظ الكتاب في المستودع الرقمي</span></>}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ====== STEP 3: SUCCESS ====== */}
          {step === 'done' && (
            <div className="py-12 text-center space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto text-emerald-400">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h4 className="font-bold text-slate-100 text-lg">تم إضافة الكتاب بنجاح!</h4>
              <p className="text-slate-400 text-sm max-w-sm mx-auto leading-relaxed">
                تم رفع الملف وتسجيل بيانات الكتاب في المستودع الرقمي المركزي. سيظهر في الفهرس الرقمي فوراً.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
