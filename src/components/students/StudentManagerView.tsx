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
  Trash2,
  Printer,
  Copy,
} from 'lucide-react';
import { User, StudentRosterRow } from '../../types/library';
import { printStudentCredentialCard } from '../../utils/printCredentialCard';

interface StudentManagerViewProps {
  students: User[];
  onAddStudent: (student: Omit<User, 'id'>) => Promise<any> | any;
  onBulkImportStudents: (roster: StudentRosterRow[]) => Promise<{
    importedCount: number;
    generatedCredentials: { name: string; regNumber: string; tempPass: string }[];
  } | undefined> | {
    importedCount: number;
    generatedCredentials: { name: string; regNumber: string; tempPass: string }[];
  };
  onResetStudentPassword: (studentId: string, newPassword?: string) => Promise<string | void> | string | void;
  onDeleteStudent?: (studentId: string) => Promise<{ success: boolean; error?: string } | void> | void;
}

export const StudentManagerView: React.FC<StudentManagerViewProps> = ({
  students = [],
  onAddStudent,
  onBulkImportStudents,
  onResetStudentPassword,
  onDeleteStudent,
}) => {
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [resetModalStudent, setResetModalStudent] = useState<User | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [credentialCardData, setCredentialCardData] = useState<{
    name: string;
    registrationNumber: string;
    password: string;
    grade?: string;
  } | null>(null);

  // Delete modal state
  const [deleteModalStudent, setDeleteModalStudent] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);

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

  const handleExecutePasswordReset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!resetModalStudent) return;
    setIsResetting(true);
    try {
      const pass = newPasswordInput.trim() || undefined;
      const generatedPass = await onResetStudentPassword(resetModalStudent.id, pass);
      if (generatedPass) {
        setCredentialCardData({
          name: resetModalStudent.name,
          registrationNumber: resetModalStudent.registrationNumber,
          password: generatedPass,
          grade: resetModalStudent.grade,
        });
      }
      setResetModalStudent(null);
      setNewPasswordInput('');
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء إعادة تعيين كلمة المرور.');
    } finally {
      setIsResetting(false);
    }
  };

  const handleSaveNewStudent = async (newStudent: any) => {
    const result = await onAddStudent(newStudent);
    setIsAddModalOpen(false);
    if (result && result.generatedPassword) {
      setCredentialCardData({
        name: result.name || newStudent.name,
        registrationNumber: result.registrationNumber || newStudent.registrationNumber,
        password: result.generatedPassword,
        grade: result.grade || newStudent.grade,
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteModalStudent || !onDeleteStudent) return;
    setIsDeleting(true);
    setDeleteErrorMessage(null);
    try {
      const result = await onDeleteStudent(deleteModalStudent.id);
      if (result && typeof result === 'object' && result.success === false) {
        setDeleteErrorMessage(result.error || 'تعذر حذف حساب الطالب.');
        setIsDeleting(false);
        return;
      }
      setDeleteModalStudent(null);
    } catch (err: any) {
      setDeleteErrorMessage(err.message || 'حدث خطأ غير متوقع أثناء حذف الطالب.');
    } finally {
      setIsDeleting(false);
    }
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
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
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

                        {onDeleteStudent && (
                          <button
                            onClick={() => {
                              setDeleteModalStudent(student);
                              setDeleteErrorMessage(null);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-500/10 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/20 hover:border-rose-600 rounded-lg text-[11px] font-medium transition-colors cursor-pointer"
                            title="حذف حساب الطالب"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>حذف الحساب</span>
                          </button>
                        )}
                      </div>
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
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
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

            <div className="space-y-4 text-xs">
              <p className="text-slate-300 leading-relaxed">
                سيقوم النظام المركزي فوراً بتوليد <strong>كلمة مرور عشوائية قوية وفريدة</strong>، وتشفيرها في قاعدة البيانات (Bcrypt Hash)، وإلغاء صلاحية كافة الجلسات المفتوحة للطالب.
              </p>

              <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span>توليد آمن وفوري</span>
                </div>
                <p className="text-[11px] text-amber-200/80">
                  ستتمكن مباشرة بعد الضغط على الزر من استعراض كلمة المرور الجديدة وطباعة بطاقة الدخول لتسليمها للطالب يدوياً.
                </p>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1 text-[11px]">
                  تعيين كلمة مرور مخصصة (اختياري - اترك الحقل فارغاً للتوليد الآلي القوي)
                </label>
                <input
                  type="text"
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  placeholder="اترك فارغاً لتوليد كلمة سر عشوائية قوية تلقائياً"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-xs outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setResetModalStudent(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => handleExecutePasswordReset()}
                  disabled={isResetting}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-600/30"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{isResetting ? 'جارٍ التوليد والتشفير...' : 'توليد وتعيين كلمة المرور'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Student Confirmation Modal */}
      {deleteModalStudent && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-rose-400 text-sm flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span>تأكيد حذف حساب الطالب</span>
              </h3>
              <button
                onClick={() => {
                  if (!isDeleting) {
                    setDeleteModalStudent(null);
                    setDeleteErrorMessage(null);
                  }
                }}
                disabled={isDeleting}
                className="text-slate-400 hover:text-slate-200 cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">اسم الطالب:</span>
                <span className="font-bold text-slate-100">{deleteModalStudent.name}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">رقم القيد / التسجيل:</span>
                <span className="font-mono text-sky-400 font-semibold">{deleteModalStudent.registrationNumber}</span>
              </div>
              {deleteModalStudent.grade && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">القسم / الصف:</span>
                  <span className="text-slate-300">{deleteModalStudent.grade}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              هل أنت متأكد من رغبتك في حذف حساب هذا الطالب من الخادم المركزي؟ سيتم إلغاء وصول الطالب للنظام فوراً.
            </p>

            {deleteErrorMessage && (
              <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{deleteErrorMessage}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalStudent(null);
                  setDeleteErrorMessage(null);
                }}
                disabled={isDeleting}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold transition-colors shadow-lg shadow-rose-600/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                    <span>جارٍ الحذف...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>تأكيد الحذف</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Single Student Modal */}
      {isAddModalOpen && (
        <AddStudentModal
          onClose={() => setIsAddModalOpen(false)}
          onSave={handleSaveNewStudent}
        />
      )}

      {/* Student Credential Card Modal (Print / Hand over credentials) */}
      {credentialCardData && (
        <StudentCredentialCardModal
          card={credentialCardData}
          onClose={() => setCredentialCardData(null)}
        />
      )}

      {/* Bulk Roster Import Modal */}
      {isImportModalOpen && (
        <BulkImportModal
          onClose={() => {
            setIsImportModalOpen(false);
            setImportResult(null);
          }}
          onImport={async (roster) => {
            const res = await onBulkImportStudents(roster);
            if (res) {
              setImportResult({
                importedCount: res.importedCount,
                credentials: res.generatedCredentials,
              });
            }
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
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !regNumber) return;

    setIsSubmitting(true);
    try {
      await onSave({
        name,
        registrationNumber: regNumber,
        grade,
        role: 'student',
        password: password.trim() || undefined,
        isBlocked: false,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
            <Plus className="w-5 h-5 text-indigo-400" />
            <span>إضافة حساب طالب جديد</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

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
            <label className="block text-slate-300 font-medium mb-1">رقم التسجيل المدرسي (اسم المستخدم) *</label>
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

          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 rounded-xl space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>أمان الحساب وتوليد بطاقة الدخول</span>
            </div>
            <p className="text-[11px] text-indigo-200/80 leading-relaxed">
              سيقوم النظام المركزي تلقائياً بتوليد كلمة مرور عشوائية قوية وتشفيرها في قاعدة البيانات. ستظهر بطاقة الدخول قابلة للطباعة فور حفظ الحساب.
            </p>
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1 text-[11px]">
              كلمة مرور مخصصة (اختياري - اترك الحقل فارغاً للتوليد العشوائي التلقائي)
            </label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="اترك فارغاً لتوليد كلمة مرور عشوائية قوية ومشفرة"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-xs outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl cursor-pointer shadow-lg shadow-indigo-600/30 flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{isSubmitting ? 'جارٍ الإنشاء والتشفير...' : 'حفظ الحساب وتوليد البطاقة'}</span>
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

// Student Credential Card Modal (Print / Hand over credentials)
interface StudentCredentialCardModalProps {
  card: {
    name: string;
    registrationNumber: string;
    password: string;
    grade?: string;
  };
  onClose: () => void;
}

const StudentCredentialCardModal: React.FC<StudentCredentialCardModalProps> = ({ card, onClose }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = `اسم الطالب: ${card.name}\nرقم القيد / اسم المستخدم: ${card.registrationNumber}\nكلمة المرور: ${card.password}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    printStudentCredentialCard({
      name: card.name,
      registrationNumber: card.registrationNumber,
      password: card.password,
      grade: card.grade,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-indigo-400">
            <KeyRound className="w-5 h-5" />
            <h3 className="font-bold text-slate-100 text-base">بطاقة بيانات دخول الطالب المركزية</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3.5 bg-emerald-950/30 border border-emerald-800/40 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-300">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>تم توليد كلمة مرور عشوائية قوية وتشفيرها (Bcrypt Hash) في قاعدة البيانات المركزية بنجاح.</span>
        </div>

        {/* Card visual representation */}
        <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl space-y-4">
          <div className="border-b border-slate-800/80 pb-3">
            <span className="text-[11px] text-slate-400 block mb-1">اسم الطالب الكامل:</span>
            <span className="text-base font-bold text-slate-100">{card.name}</span>
            {card.grade && (
              <span className="text-xs text-indigo-300 block mt-0.5">{card.grade}</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl">
              <span className="text-[11px] text-slate-400 block mb-1">رقم القيد (المستخدم):</span>
              <span className="text-sm font-bold font-mono text-indigo-300">{card.registrationNumber}</span>
            </div>

            <div className="p-3 bg-slate-900/90 border border-amber-500/30 rounded-xl bg-amber-500/5">
              <span className="text-[11px] text-amber-400 block mb-1">كلمة المرور الجديدة:</span>
              <span className="text-base font-bold font-mono text-amber-300 tracking-wider select-all">{card.password}</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
            ⚠️ <strong>تنبيه أمني:</strong> لا تُحفظ كلمة المرور في النظام كنص صريح. يرجى تسليم هذه البيانات للطالب أو طباعة البطاقة الورقية له الآن.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
            <span>{copied ? 'تم النسخ بنجاح' : 'نسخ بيانات الدخول'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة بطاقة الدخول</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
