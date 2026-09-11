import React, { useState } from 'react';
import { X, Shield, KeyRound, ArrowRight, Loader2 } from 'lucide-react';

interface AdminRecoveryModalProps {
  onClose: () => void;
  onRecovered: () => void;
}

export const AdminRecoveryModal: React.FC<AdminRecoveryModalProps> = ({ onClose, onRecovered }) => {
  const [step, setStep] = useState(1);
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchSecurityQuestion = async () => {
    if (!registrationNumber) {
      setError('يرجى إدخال رقم قيد المشرف أولاً.');
      return;
    }
    
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`http://localhost:3000/api/v1/auth/security-question?registrationNumber=${encodeURIComponent(registrationNumber)}`);
      const data = await res.json();
      
      if (data.success && data.data?.question) {
        setSecurityQuestion(data.data.question);
        setStep(2);
      } else {
        setError(data.error?.message || 'لا يوجد سؤال أمان لهذا الحساب.');
      }
    } catch (err) {
      setError('فشل الاتصال بالخادم.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecover = async () => {
    if (!securityAnswer || !newPassword) {
      setError('يرجى إدخال إجابة السؤال وكلمة المرور الجديدة.');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const res = await fetch('http://localhost:3000/api/v1/auth/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationNumber,
          securityAnswer,
          newPassword
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setSuccess('تم استرجاع الحساب وتغيير كلمة المرور بنجاح.');
        setTimeout(() => {
          onRecovered();
          onClose();
        }, 2000);
      } else {
        setError(data.error?.message || 'فشل الاسترجاع.');
      }
    } catch (err) {
      setError('فشل الاتصال بالخادم.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md shadow-2xl shadow-indigo-900/20 overflow-hidden flex flex-col animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-400" />
            استرجاع حساب المشرف
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700 p-2 rounded-xl transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl">
              {error}
            </div>
          )}
          
          {success && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl">
              {success}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="text-sm text-slate-400">
                أدخل رقم قيد المشرف (أو اسم المستخدم) للبحث عن الحساب وجلب سؤال الأمان المرتبط به.
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">رقم قيد المشرف</label>
                <input
                  type="text"
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                  placeholder="ADM-001"
                  className="w-full pl-4 pr-4 py-3 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-sm font-mono text-white placeholder-slate-600 transition-colors"
                  autoFocus
                />
              </div>
              <button
                onClick={fetchSecurityQuestion}
                disabled={loading || !registrationNumber}
                className="w-full py-3 px-4 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'التالي'}
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">سؤال الأمان</label>
                <div className="w-full p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-sm text-indigo-200">
                  {securityQuestion}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">الإجابة</label>
                <input
                  type="text"
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  placeholder="أدخل الإجابة السرية..."
                  className="w-full pl-4 pr-4 py-3 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-sm text-white placeholder-slate-600 transition-colors"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">كلمة المرور الجديدة</label>
                <div className="relative">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-sm font-mono text-white placeholder-slate-600 transition-colors"
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <KeyRound className="w-4 h-4" />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setStep(1);
                    setError('');
                  }}
                  className="py-3 px-4 rounded-xl text-sm font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-all flex items-center justify-center cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={handleRecover}
                  disabled={loading || !securityAnswer || !newPassword}
                  className="flex-1 py-3 px-4 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ واسترجاع'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
