import React, { useState } from 'react';
import { X, Shield, KeyRound, ArrowRight, Loader2, CheckCircle2, Copy, Check, Sparkles, User, HelpCircle } from 'lucide-react';

interface AccountRecoveryModalProps {
  onClose: () => void;
  onRecovered: (regNumber?: string, newPassword?: string) => void;
}

export const AccountRecoveryModal: React.FC<AccountRecoveryModalProps> = ({ onClose, onRecovered }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [identifier, setIdentifier] = useState('');
  
  // Account info returned from server
  const [accountInfo, setAccountInfo] = useState<{
    name: string;
    role: string;
    registrationNumber: string;
    question: string;
  } | null>(null);

  const [securityAnswer, setSecurityAnswer] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  
  // Student recovered password
  const [recoveredPassword, setRecoveredPassword] = useState('');
  const [copied, setCopied] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Step 1: Fetch security question
  const fetchSecurityQuestion = async () => {
    if (!identifier.trim()) {
      setError('يرجى إدخال رقم القيد أو اسم المستخدم أولاً.');
      return;
    }
    
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/auth/security-question?registrationNumber=${encodeURIComponent(identifier.trim())}`);
      const data = await res.json();
      
      if (data.success && data.data?.question) {
        setAccountInfo(data.data);
        setStep(2);
      } else {
        setError(data.error?.message || 'تعذر العثور على سؤال أمان لهذا الحساب.');
      }
    } catch (err) {
      setError('فشل الاتصال بالخادم المركزي.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Submit security answer and recover
  const handleRecover = async () => {
    if (!securityAnswer.trim()) {
      setError('يرجى إدخال إجابة سؤال الأمان.');
      return;
    }

    if (accountInfo?.role === 'admin' && (!newAdminPassword || newAdminPassword.length < 6)) {
      setError('يرجى إدخال كلمة مرور جديدة للمشرف لا تقل عن 6 خانات.');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const res = await fetch('/api/v1/auth/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationNumber: accountInfo?.registrationNumber || identifier.trim(),
          securityAnswer: securityAnswer.trim(),
          newPassword: newAdminPassword.trim() || undefined,
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        if (data.data?.role === 'student' && data.data?.recoveredPassword) {
          // Student recovery: show recovered password
          setRecoveredPassword(data.data.recoveredPassword);
          setStep(3);
        } else {
          // Admin recovery: success message then close
          setSuccess(data.data?.message || 'تم استرجاع الحساب وتغيير كلمة المرور بنجاح.');
          setTimeout(() => {
            onRecovered(accountInfo?.registrationNumber, newAdminPassword);
            onClose();
          }, 2000);
        }
      } else {
        setError(data.error?.message || 'فشلت عملية التحقق من إجابة سؤال الأمان.');
      }
    } catch (err) {
      setError('فشل الاتصال بالخادم.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPassword = () => {
    if (!recoveredPassword) return;
    navigator.clipboard.writeText(recoveredPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleLoginWithRecovered = () => {
    onRecovered(accountInfo?.registrationNumber || identifier.trim(), recoveredPassword);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md shadow-2xl shadow-indigo-950/40 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/60">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-400" />
            <span>استعادة الحساب وكلمة المرور عن بُعد</span>
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-700 p-2 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-xs">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl leading-relaxed">
              {error}
            </div>
          )}
          
          {success && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* STEP 1: Search Account */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-slate-400 text-xs leading-relaxed">
                أدخل رقم القيد الخاص بك (طالب أو مشرف) أو اسم المستخدم للبحث عن حسابك وجلب سؤال الأمان المعتمد.
              </p>

              <div className="space-y-1.5 text-right">
                <label className="font-semibold text-slate-300">رقم القيد أو اسم المستخدم *</label>
                <div className="relative">
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="مثال: STU-2026-101 أو ADM-001"
                    className="w-full pl-4 pr-10 py-3 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl font-mono text-sm text-white placeholder-slate-600 transition-colors"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') fetchSecurityQuestion();
                    }}
                  />
                  <User className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <button
                onClick={fetchSecurityQuestion}
                disabled={loading || !identifier.trim()}
                className="w-full py-3 px-4 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-lg shadow-indigo-600/25"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'البحث عن الحساب والتالي'}
              </button>
            </div>
          )}

          {/* STEP 2: Answer Question */}
          {step === 2 && accountInfo && (
            <div className="space-y-4">
              {/* Account Identifier Card */}
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-200 text-sm">{accountInfo.name}</div>
                  <div className="text-[11px] text-slate-400 font-mono">{accountInfo.registrationNumber}</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  accountInfo.role === 'admin'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                }`}>
                  {accountInfo.role === 'admin' ? 'مشرف المكتبة' : 'طالب باحث'}
                </span>
              </div>

              {/* Security Question Display */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-indigo-400" />
                  <span>سؤال الأمان المسجل:</span>
                </label>
                <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl text-xs sm:text-sm text-indigo-200 leading-relaxed font-medium">
                  {accountInfo.question}
                </div>
              </div>

              {/* Security Answer Input */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-300">إجابة سؤال الأمان *</label>
                <input
                  type="text"
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  placeholder="أدخل الإجابة السرية..."
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-sm text-white placeholder-slate-600 transition-colors"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRecover();
                  }}
                />
              </div>

              {/* If Admin: Enter new password */}
              {accountInfo.role === 'admin' && (
                <div className="space-y-1.5 pt-2 border-t border-slate-800">
                  <label className="font-semibold text-slate-300">كلمة المرور الجديدة للمشرف *</label>
                  <input
                    type="password"
                    value={newAdminPassword}
                    onChange={(e) => setNewAdminPassword(e.target.value)}
                    placeholder="لا تقل عن 6 خانات..."
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-sm text-white placeholder-slate-600 transition-colors"
                  />
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-3 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  رجوع
                </button>
                <button
                  onClick={handleRecover}
                  disabled={loading || !securityAnswer.trim()}
                  className="flex-1 py-3 px-4 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-lg shadow-emerald-600/25"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'تأكيد واستعادة كلمة المرور'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Student Success Card (Displays Recovered Password) */}
          {step === 3 && (
            <div className="space-y-5 text-center py-2 animate-in zoom-in-95 duration-200">
              <div className="w-14 h-14 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400 shadow-xl shadow-emerald-500/10">
                <Sparkles className="w-7 h-7" />
              </div>

              <div className="space-y-1">
                <h4 className="text-base font-extrabold text-white">
                  تم استعادة كلمة المرور بنجاح!
                </h4>
                <p className="text-slate-400 text-xs">
                  مرحباً بك يا <strong className="text-indigo-300">{accountInfo?.name}</strong>، تم إنشاء كلمة مرور جديدة لحسابك:
                </p>
              </div>

              {/* Password Highlight Box */}
              <div className="p-4 bg-slate-950 border-2 border-emerald-500/50 rounded-2xl relative shadow-xl space-y-2">
                <div className="text-[11px] text-slate-400 font-medium">كلمة المرور الجديدة لحسابك:</div>
                <div className="font-mono text-xl sm:text-2xl font-black text-emerald-400 tracking-widest select-all">
                  {recoveredPassword}
                </div>
                <div className="text-[10px] text-slate-500">
                  يرجى حفظها أو تدوينها في مكان آمن
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={handleCopyPassword}
                  className="w-full py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">تم نسخ كلمة المرور بنجاح!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-indigo-400" />
                      <span>نسخ كلمة المرور إلى الحافظة</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleLoginWithRecovered}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-bold text-sm transition-all shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>تسجيل الدخول الآن بهذه الكلمة</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
