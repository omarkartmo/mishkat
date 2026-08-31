import React, { useState } from 'react';
import {
  Users,
  Search,
  Plus,
  KeyRound,
  Check,
  ShieldAlert,
  ShieldCheck,
  FileSpreadsheet,
  AlertCircle,
  X,
  Lock,
  RotateCcw,
} from 'lucide-react';
import { User, StudentRosterRow } from '../../types/library';

interface StudentManagerViewProps {
  students: User[];
  onAddStudent: (student: Omit<User, 'id'>) => void;
  onBulkImportStudents: (roster: StudentRosterRow[]) => {
    importedCount: number;
    generatedCredentials: { name: string; regNumber: string; tempPass: string }[];
  };
  onResetStudentPassword: (studentId: string, newPassword?: string) => string;
}

export const StudentManagerView: React.FC<StudentManagerViewProps> = ({
  students = [],
  onAddStudent,
  onBulkImportStudents,
  onResetStudentPassword,
}) => {
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [resetModalStudent, setResetModalStudent] = useState<User | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importResult, setImportResult] = useState<{
    importedCount: number;
    credentials: { name: string; regNumber: string; tempPass: string }[];
  } | null>(null);

  const filteredStudents = (students || []).filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.registrationNumber.toLowerCase().includes(search.toLowerCase()) ||
      (s.grade && s.grade.toLowerCase().includes(search.toLowerCase()));

    const matchesGrade = gradeFilter === 'all' || s.grade === gradeFilter;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'blocked' && s.isBlocked) ||
      (statusFilter === 'active' && !s.isBlocked);

    return matchesSearch && matchesGrade && matchesStatus;
  });

  const blockedCount = (students || []).filter((s) => s.isBlocked).length;
  const grades = Array.from(new Set((students || []).map((s) => s.grade).filter(Boolean)));

  const handleExecutePasswordReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalStudent) return;
    const pass = newPasswordInput.trim() || '123456';
    onResetStudentPassword(resetModalStudent.id, pass);
    setResetSuccessMessage(`تم تحديث وتعيين كلمة المرور للطالب ${resetModalStudent.name} بنجاح.`);
    setTimeout(() => {
      setResetSuccessMessage(null);
      setResetModalStudent(null);
      setNewPasswordInput('');
    }, 2000);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            إدارة حسابات الطلبة وبيانات الدخول المركزية
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            إدارة سجلات الطلاب، استيراد القوائم المدرسية، وإعادة تعيين كلمات المرور المشفرة على الخادم المركزي
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>استيراد جماعي (CSV / Excel)</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة طالب يدوياً</span>
          </button>
        </div>
      </div>

      {/* Info / Overdue Notice */}
      {blockedCount > 0 && (
        <div className="p-4 bg-rose-950/30 border border-rose-800/60 rounded-2xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-rose-300 font-medium">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span>
              يوجد <strong>{blockedCount}</strong> حسابات مقيدة تلقائياً بسبب تأخر إرجاع كتب ورقية مستعارة.
            </span>
          </div>
          <button
            onClick={() => setStatusFilter('blocked')}
            className="text-xs bg-rose-600 text-white px-3 py-1 rounded-lg font-semibold"
          >
            تصفية المحظورين
          </button>
        </div>
      )}

      {/* Search & Filters */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="w-full md:w-80 relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="البحث باسم الطالب، رقم التسجيل، أو القسم..."
            className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 rounded-xl pr-10 pl-4 py-2 text-xs text-slate-200 outline-none"
          />
        </div>

        <div className="flex items-center gap-2 text-xs w-full md:w-auto">
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 outline-none focus:border-indigo-500"
          >
            <option value="all">كل الفصول والأقسام</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 outline-none focus:border-indigo-500"
          >
            <option value="all">كل حالات الحسابات</option>
            <option value="active">نشط ومؤهل للإعارة</option>
            <option value="blocked">محظور (متأخرات)</option>
          </select>
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold">
              <tr>
                <th className="py-3.5 px-4">الطالب</th>
                <th className="py-3.5 px-4">رقم التسجيل المدرسي</th>
                <th className="py-3.5 px-4">القسم / المستوى</th>
                <th className="py-3.5 px-4">حالة الحساب</th>
                <th className="py-3.5 px-4">حالة كلمة المرور</th>
                <th className="py-3.5 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {filteredStudents.map((student) => {
                const isBlocked = student.isBlocked;

                return (
                  <tr
                    key={student.id}
                    className={`hover:bg-slate-800/40 transition-colors ${
                      isBlocked ? 'bg-rose-950/15' : ''
                    }`}
                  >
                    {/* Student Name */}
                    <td className="py-3.5 px-4 font-semibold text-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-bold text-xs">
                          {student.name.slice(0, 1)}
                        </div>
                        <div>
                          <div>{student.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {student.email || 'حساب مدرسي'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Reg Number */}
                    <td className="py-3.5 px-4 font-mono text-sky-400 font-semibold">
                      {student.registrationNumber}
                    </td>

                    {/* Grade */}
                    <td className="py-3.5 px-4 text-slate-300 font-medium">{student.grade || '—'}</td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      {isBlocked ? (
                        <span className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-semibold flex items-center gap-1 w-fit">
                          <ShieldAlert className="w-3 h-3 text-rose-400" />
                          <span>محظور (متأخرات)</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold flex items-center gap-1 w-fit">
                          <ShieldCheck className="w-3 h-3 text-emerald-400" />
                          <span>نشط ومؤهل</span>
                        </span>
                      )}
                    </td>

                    {/* Password Security Status */}
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300 font-mono">
                        <Lock className="w-3 h-3 text-emerald-400" />
                        <span>مشفرة (Bcrypt Hash)</span>
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => {
                          setResetModalStudent(student);
                          setNewPasswordInput('');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-300 rounded-lg text-[11px] font-medium transition-colors cursor-pointer"
                        title="إعادة تعيين كلمة المرور"
                      >
                        <KeyRound className="w-3 h-3" />
                        <span>إعادة تعيين كلمة السر</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Password Reset Modal */}
      {resetModalStudent && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span>إعادة تعيين كلمة المرور: {resetModalStudent.name}</span>
              </h3>
              <button onClick={() => setResetModalStudent(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            {resetSuccessMessage ? (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-xl flex items-center gap-2 text-xs">
                <Check className="w-4 h-4" />
                <span>{resetSuccessMessage}</span>
              </div>
            ) : (
              <form onSubmit={handleExecutePasswordReset} className="space-y-3 text-xs">
                <p className="text-slate-400 leading-relaxed">
                  أدخل كلمة مرور جديدة للطالب أو اترك الحقل فارغاً لتعيين الكلمة الافتراضية (123456).
                </p>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">كلمة المرور الجديدة</label>
                  <input
                    type="password"
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    placeholder="اترك فارغاً للافتراضي 123456"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setResetModalStudent(null)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl"
                  >
                    تأكيد التحديث
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Add Single Student Modal */}
      {isAddModalOpen && (
        <AddStudentModal
          onClose={() => setIsAddModalOpen(false)}
          onSave={(data) => {
            onAddStudent(data);
            setIsAddModalOpen(false);
          }}
        />
      )}

      {/* Bulk Roster Import Modal */}
      {isImportModalOpen && (
        <BulkImportModal
          onClose={() => {
            setIsImportModalOpen(false);
            setImportResult(null);
          }}
          onImport={(roster) => {
            const res = onBulkImportStudents(roster);
            setImportResult({
              importedCount: res.importedCount,
              credentials: res.generatedCredentials,
            });
          }}
          result={importResult}
        />
      )}
    </div>
  );
};

// Add Student Modal
interface AddStudentModalProps {
  onClose: () => void;
  onSave: (data: any) => void;
}

const AddStudentModal: React.FC<AddStudentModalProps> = ({ onClose, onSave }) => {
  const [name, setName] = useState('');
  const [regNumber, setRegNumber] = useState(`STU-${Math.floor(1000 + Math.random() * 9000)}`);
  const [grade, setGrade] = useState('الصف العاشر - عام');
  const [password, setPassword] = useState('123456');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !regNumber) return;

    onSave({
      name,
      registrationNumber: regNumber,
      grade,
      role: 'student',
      password,
      isBlocked: false,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
        <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
          <Plus className="w-5 h-5 text-indigo-400" />
          إضافة حساب طالب جديد
        </h3>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">اسم الطالب الكامل *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: يحيى بن إبراهيم الحارثي"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">رقم التسجيل المدرسي *</label>
            <input
              type="text"
              required
              value={regNumber}
              onChange={(e) => setRegNumber(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">القسم / المستوى الدراسي</label>
            <input
              type="text"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="مثال: الصف الحادي عشر - علمي"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">كلمة المرور المبدئية</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl"
            >
              حفظ الحساب في الخادم المركزي
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Bulk Import Modal
interface BulkImportModalProps {
  onClose: () => void;
  onImport: (roster: StudentRosterRow[]) => void;
  result: {
    importedCount: number;
    credentials: { name: string; regNumber: string; tempPass: string }[];
  } | null;
}

const BulkImportModal: React.FC<BulkImportModalProps> = ({ onClose, onImport, result }) => {
  const [csvContent, setCsvContent] = useState(
    `رقم التسجيل,اسم الطالب,القسم\n2025-0101,سيف بن عامر المعولي,الثالثة ثانوي - آداب وفلسفة\n2025-0102,البتول بنت يوسف الشيبانية,الثانية ثانوي - علوم تجريبية\n2025-0103,محمد الأمين بلقاسم,الأولى ثانوي - جذع مشترك علوم\n2025-0104,فاطمة الزهراء الهنائي,الثالثة ثانوي - رياضيات`
  );

  const handleProcessImport = () => {
    const lines = csvContent.trim().split('\n');
    if (lines.length <= 1) {
      alert('يرجى إدخال بيانات الطلبة');
      return;
    }

    const rows: StudentRosterRow[] = [];
    // Skip header
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(',');
      if (parts.length >= 2) {
        rows.push({
          registrationNumber: parts[0].trim(),
          name: parts[1].trim(),
          grade: parts[2]?.trim(),
        });
      }
    }

    onImport(rows);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            استيراد قائمة الطلبة وتوليد الحسابات بالخادم المركزي
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {result ? (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-xl flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>تم استيراد وإنشاء <strong>{result.importedCount}</strong> حساب طالب بنجاح!</span>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold"
              >
                إغلاق
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-xs">
            <p className="text-slate-300 leading-relaxed">
              قم بلصق بيانات ملف Excel أو CSV بالصيغة: <code>رقم التسجيل, اسم الطالب, القسم</code>. سيقوم النظام
              بإنشاء الحسابات وتشفير كلمات المرور في قاعدة البيانات المركزية.
            </p>

            <textarea
              rows={8}
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] text-slate-200 outline-none focus:border-emerald-500"
            />

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-medium"
              >
                إلغاء
              </button>
              <button
                onClick={handleProcessImport}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>معالجة واستيراد الحسابات</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
