import React, { useState } from 'react';
import { Shield, Key, Save, CheckCircle2, X, HelpCircle, User, Lock, Sparkles } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { User as LibraryUser } from '../../types/library';

interface StudentSecurityModalProps {
  currentUser: LibraryUser;
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

const PRESET_QUESTIONS = [
  'ما هو اسم أول مدرسة ابتدائية التحقت بها؟',
  'ما هو عنوان كتابك أو قصتك المفضلة؟',
  'ما هو اسم مدينتك أو قريتك الأصلية؟',
  'ما هي هوايتك أو مادتك الدراسية المفضلة؟',
  'ما هو اسم الشخصية التاريخية أو العلمية المفضلة لديك؟',
  'سؤال مخصص آخر...',
];

export const StudentSecurityModal: React.FC<StudentSecurityModalProps> = ({
  currentUser,
  isOpen,
  onClose,
  onUpdated,
}) => {
  const [selectedPreset, setSelectedPreset] = useState(PRESET_QUESTIONS[0]);
  const [customQuestion, setCustomQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState(currentUser.username || '');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  const actualQuestion = selectedPreset === 'سؤال مخصص آخر...' ? customQuestion : selectedPreset;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!currentPassword) {
      setError('يرجى إدخال كلمة المرور الحالية لتأكيد حفظ الإعدادات.');
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      setError('كلمة المرور الجديدة وتأكيدها غير متطابقين.');
      return;
    }

    if (newPassword && newPassword.length < 4) {
      setError('يجب ألا تقل كلمة المرور الجديدة عن 4 خانات.');
      return;
    }

    if (selectedPreset === 'سؤال مخصص آخر...' && !customQuestion.trim()) {
      setError('يرجى كتابة السؤال المخصص.');
      return;
    }

    if (actualQuestion && !securityAnswer.trim()) {
      setError('يرجى إدخال إجابة سؤال الأمان.');
      return;
    }

    setLoading(true);

    try {
      const res = await apiClient.put<{ message: string }>('/users/my-security', {
        currentPassword,
        newPassword: newPassword.trim() || undefined,
        securityQuestion: actualQuestion.trim() || undefined,
        securityAnswer: securityAnswer.trim() || undefined,
        username: username.trim() || undefined,
      });

      if (res.success) {
        setSuccess('تم حفظ إعدادات الأمان وسؤال الاسترداد بنجاح! يمكنك الآن استعادة حسابك من واجهة الدخول إذا نسيت كلمة المرور.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setSecurityAnswer('');
        if (onUpdated) onUpdated();
        setTimeout(() => {
          onClose();
        }, 2200);
      } else {
        setError(res.error?.message || 'تعذر حفظ إعدادات الأمان.');
      }
    } catch (err: any) {
      setError('حدث خطأ في الاتصال بالخادم المركزي.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl shadow-purple-950/30 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>إعدادات أمان حساب الطالب</span>
                <span className="text-[10px] bg-purple-500/20 text-purple-300 font-mono px-2 py-0.5 rounded-full border border-purple-500/30">
                  {currentUser.registrationNumber}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                إعداد سؤال الاسترجاع السري وتحديث كلمة المرور
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-700 p-2 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Quick Notice */}
          <div className="p-3.5 bg-gradient-to-r from-purple-950/40 to-slate-900 border border-purple-500/20 rounded-2xl flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-slate-300 leading-relaxed">
              <span className="font-bold text-purple-300">لماذا سؤال الأمان مهم؟</span>
              <p className="text-slate-400 text-[11px]">
                إذا نسيت كلمة المرور مستقبلاً، يمكنك الضغط على "نسيت كلمة المرور" في شاشة الدخول والإجابة على هذا السؤال ليظهر لك كود الدخول فوراً دون الحاجة للذهاب إلى أمين المكتبة.
              </p>
            </div>
          </div>

          {/* Section 1: Security Question */}
          <div className="space-y-3 bg-slate-950/40 p-4 rounded-2xl border border-slate-800/60">
            <label className="font-bold text-slate-200 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-purple-400" />
              <span>اختر سؤال الأمان الخاص بك:</span>
            </label>

            <select
              value={selectedPreset}
              onChange={(e) => setSelectedPreset(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 focus:outline-none focus:border-purple-500"
            >
              {PRESET_QUESTIONS.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>

            {selectedPreset === 'سؤال مخصص آخر...' && (
              <input
                type="text"
                value={customQuestion}
                onChange={(e) => setCustomQuestion(e.target.value)}
                placeholder="اكتب سؤال أمان خاص بك تعرف إجابته جيداً..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500 mt-2"
                required
              />
            )}

            <div className="space-y-1 pt-1">
              <label className="text-slate-300 font-medium">الإجابة السرية (Secret Answer) *</label>
              <input
                type="text"
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                placeholder="أدخل إجابتك التي سيتذكرها النظام..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500"
                required
              />
              <p className="text-[10px] text-slate-500">لا تشارك هذه الإجابة مع زملائك، فهي مفتاح استعادة حسابك.</p>
            </div>
          </div>

          {/* Section 2: Change Password (Optional) */}
          <div className="space-y-3 bg-slate-950/40 p-4 rounded-2xl border border-slate-800/60">
            <label className="font-bold text-slate-200 flex items-center gap-2">
              <Key className="w-4 h-4 text-indigo-400" />
              <span>تغيير كلمة المرور (اختياري):</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-slate-400 font-medium">كلمة المرور الجديدة</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="اتركها فارغة إذا لم ترغب بتغييرها"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-400 font-medium">تأكيد كلمة المرور</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="أعد كتابة كلمة المرور الجديدة"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Current Password confirmation */}
          <div className="p-4 bg-purple-950/20 border border-purple-500/20 rounded-2xl space-y-2">
            <label className="block text-amber-300 font-bold">
              كلمة المرور الحالية (مطلوبة لتأكيد الهوية وحفظ البيانات) *
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="أدخل كلمة مرورك الحالية..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none focus:border-purple-500"
              required
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-purple-600/30 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'جارٍ الحفظ...' : 'حفظ إعدادات الأمان'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
