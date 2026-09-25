import React, { useState, useEffect } from 'react';
import { Shield, Key, Save, CheckCircle2, User, Hash } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { useAuth } from '../../context/AuthContext';

export const AdminSecuritySettings: React.FC = () => {
  const { user, refreshUser, logout } = useAuth();

  // Initial Registration Information (Simplified)
  const [registrationNumber, setRegistrationNumber] = useState(user?.registrationNumber || '');
  const [name, setName] = useState(user?.name || '');

  // Password & Security Question
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Sync state when user context updates
  useEffect(() => {
    if (user) {
      setRegistrationNumber(user.registrationNumber || '');
      setName(user.name || '');
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      setError('يجب إدخال كلمة المرور الحالية لتأكيد حفظ التعديلات.');
      return;
    }

    if (!registrationNumber.trim()) {
      setError('رمز الدخول لا يمكن أن يكون فارغاً.');
      return;
    }

    if (!name.trim()) {
      setError('اسم أمين المكتبة مطلوب.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await apiClient.put<{ message: string; user?: any }>('/users/admin/security', {
        currentPassword,
        registrationNumber: registrationNumber.trim(),
        name: name.trim(),
        newPassword: newPassword.trim() || undefined,
        securityQuestion: securityQuestion.trim() || undefined,
        securityAnswer: securityAnswer.trim() || undefined,
      });

      if (res.success) {
        if (newPassword.trim()) {
          setSuccess('تم تحديث معلومات الحساب وكلمة المرور بنجاح! تم إنهاء الجلسة لأسباب أمنية. جارٍ تحويلك لصفحة تسجيل الدخول...');
          setCurrentPassword('');
          setNewPassword('');
          setTimeout(async () => {
            await logout();
          }, 2000);
        } else {
          setSuccess(res.data?.message || 'تم تحديث معلومات الحساب بنجاح.');
          setCurrentPassword('');
          setSecurityQuestion('');
          setSecurityAnswer('');
          await refreshUser();
        }
      } else {
        setError(res.error?.message || 'حدث خطأ أثناء التحديث.');
      }
    } catch (err: any) {
      setError('حدث خطأ في الاتصال بالخادم.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-6 text-xs" dir="rtl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-400" />
            <span>معلومات الحساب وإعدادات الأمان للمشرف</span>
          </h3>
          <p className="text-slate-400 mt-1 text-[11px] leading-relaxed">
            يمكنك هنا تعديل رمز الدخول الخاص بحساب أمين المكتبة واسمك الشخصي بالإضافة لتحديث كلمة المرور وسؤال الأمان.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl">
          {error}
        </div>
      )}
      
      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Initial Registration Information */}
        <div className="space-y-4 bg-slate-950/40 p-4 rounded-xl border border-slate-800/60">
          <h4 className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" />
            <span>بيانات حساب أمين المكتبة</span>
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-slate-300 font-medium">
                رمز / اسم الدخول (رقم القيد) *
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 pr-8 text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                  placeholder="ADM-001"
                  required
                />
                <Hash className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <p className="text-[10px] text-slate-500">يستخدم لتسجيل الدخول في واجهة أمين المكتبة.</p>
            </div>

            <div className="space-y-1">
              <label className="block text-slate-300 font-medium">
                اسم أمين المكتبة (صاحب الحساب) *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                placeholder="أ. عمر بن حميد المعمري"
                required
              />
              <p className="text-[10px] text-slate-500">الاسم الشخصي لأمين المكتبة المعروض في السجلات والتقارير.</p>
            </div>
          </div>
        </div>

        {/* Section 2: Password & Security Recovery Question */}
        <div className="space-y-4 bg-slate-950/40 p-4 rounded-xl border border-slate-800/60">
          <h4 className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5" />
            <span>كلمة المرور وسؤال الأمان لاستعادة الحساب</span>
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-slate-300 font-medium">سؤال الأمان المعتمد لاستعادة الحساب</label>
              <input
                type="text"
                value={securityQuestion}
                onChange={(e) => setSecurityQuestion(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                placeholder="مثال: ما هو اسم معلمك الأول في المدرسة؟"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-slate-300 font-medium">إجابة سؤال الأمان السرية</label>
              <input
                type="text"
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                placeholder="الإجابة السرية (تحفظ مشفرة)"
              />
            </div>
          </div>

          <div className="space-y-1 pt-2 border-t border-slate-800/40">
            <label className="block text-slate-300 font-medium">كلمة المرور الجديدة (اختياري)</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
              placeholder="اتركه فارغاً إذا كنت لا ترغب بتغيير كلمة المرور"
            />
          </div>
        </div>

        {/* Section 3: Verification & Save */}
        <div className="bg-indigo-950/20 border border-indigo-500/20 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 flex-1">
            <label className="block text-amber-300 font-bold">
              كلمة المرور الحالية (مطلوبة لتأكيد التغييرات) *
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full max-w-sm bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
              placeholder="••••••••••••"
              required
            />
          </div>

          <div className="flex justify-end pt-2 sm:pt-0">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-600/30 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'جارٍ الحفظ...' : 'حفظ تعديلات الحساب'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
