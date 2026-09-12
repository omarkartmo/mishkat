import React, { useState } from 'react';
import { Shield, Key, Save, CheckCircle2 } from 'lucide-react';
import { apiClient } from '../../services/apiClient';

export const AdminSecuritySettings: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      setError('يجب إدخال كلمة المرور الحالية.');
      return;
    }

    if (!newPassword && (!securityQuestion || !securityAnswer)) {
      setError('يجب إدخال كلمة مرور جديدة أو إعداد سؤال الأمان.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await apiClient.put<{ message: string }>('/users/admin/security', {
        currentPassword,
        newPassword,
        securityQuestion,
        securityAnswer,
      });

      if (res.success) {
        setSuccess('تم تحديث إعدادات الأمان بنجاح.');
        setCurrentPassword('');
        setNewPassword('');
        setSecurityQuestion('');
        setSecurityAnswer('');
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
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
      <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-3">
        <Shield className="w-4 h-4 text-indigo-400" />
        إعدادات أمان حساب المشرف
      </h3>

      <div className="text-slate-400 mb-4">
        يمكنك هنا تغيير كلمة المرور الخاصة بحساب الإدارة، وإعداد "سؤال الأمان" لاستخدامه في حالة نسيان كلمة المرور.
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl">
          {error}
        </div>
      )}
      
      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="block text-slate-300 font-medium">كلمة المرور الحالية (مطلوبة) *</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800/50">
          <div className="space-y-1">
            <label className="block text-slate-300 font-medium">كلمة المرور الجديدة (اختياري)</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
              placeholder="اتركه فارغاً إذا لم ترغب بتغييرها"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800/50">
          <div className="space-y-1">
            <label className="block text-slate-300 font-medium">سؤال الأمان (اختياري)</label>
            <input
              type="text"
              value={securityQuestion}
              onChange={(e) => setSecurityQuestion(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
              placeholder="مثال: ما هو اسم معلمك الأول؟"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-slate-300 font-medium">إجابة سؤال الأمان (اختياري)</label>
            <input
              type="text"
              value={securityAnswer}
              onChange={(e) => setSecurityAnswer(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
              placeholder="الإجابة السرية"
            />
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-semibold transition-all shadow-lg shadow-indigo-600/20"
          >
            <Save className="w-4 h-4" />
            <span>حفظ إعدادات الأمان</span>
          </button>
        </div>
      </form>
    </div>
  );
};
