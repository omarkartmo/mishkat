import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  User,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  Clock,
  ChevronLeft,
  LogIn,
} from 'lucide-react';
import { User as LibraryUser, SystemConfig } from '../../types/library';

interface LoginViewProps {
  config: SystemConfig;
  users?: LibraryUser[];
  onLogin: (regNumber: string, password?: string) => {
    success: boolean;
    user?: LibraryUser;
    error?: string;
    isLocked?: boolean;
    remainingSeconds?: number;
    attemptsLeft?: number;
  };
}

export const LoginView: React.FC<LoginViewProps> = ({ config, users = [], onLogin }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          setErrorMsg(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (lockoutSeconds > 0) {
      setErrorMsg(`الحساب مؤمن ومقفل مؤقتاً. يرجى الانتظار لمدة ${lockoutSeconds} ثانية.`);
      return;
    }

    if (!identifier.trim()) {
      setErrorMsg('يرجى إدخال رقم القيد أو المعرف');
      return;
    }

    if (!password.trim()) {
      setErrorMsg('يرجى إدخال كلمة المرور');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = onLogin(identifier, password);
      if (!result.success) {
        setErrorMsg(result.error || 'فشل تسجيل الدخول. يرجى التحقق من البيانات.');
        if (result.isLocked && result.remainingSeconds) {
          setLockoutSeconds(result.remainingSeconds);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col justify-between relative overflow-hidden font-sans selection:bg-indigo-500 selection:text-white" dir="rtl">
      {/* Background Decorative Gradients & Grid */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e1b4b_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header Bar */}
      <header className="relative z-10 w-full mx-auto px-6 py-8 flex flex-col items-center justify-center text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-indigo-600 to-emerald-500 flex items-center justify-center shadow-xl shadow-indigo-500/25 text-white font-bold">
          <BookOpen className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-indigo-400 tracking-wide">
            نظام المشكاة
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            {config.libraryName || 'المكتبة المركزية'} • {config.schoolName || 'معهد المنهاج للدراسات الأكاديمية'}
          </p>
        </div>
      </header>

      {/* Main Login Card Centered Container */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/60 space-y-6">
          {/* Card Title */}
          <div className="text-right space-y-1">
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <LogIn className="w-5 h-5 text-indigo-400" />
              <span>تسجيل الدخول</span>
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              أدخل رقم القيد أو رمز المستخدم وكلمة المرور للدخول إلى النظام مباشرة
            </p>
          </div>

          {/* Lockout Warning Banner */}
          {lockoutSeconds > 0 && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-3 text-rose-300 text-xs animate-pulse">
              <Clock className="w-5 h-5 text-rose-400 shrink-0" />
              <div>
                <p className="font-bold">تم قفل تسجيل الدخول مؤقتاً</p>
                <p className="text-[11px] text-rose-300/80">
                  يرجى الانتظار <strong className="text-white font-mono">{lockoutSeconds}</strong> ثانية قبل المحاولة مجدداً.
                </p>
              </div>
            </div>
          )}

          {/* Error Message Alert */}
          {errorMsg && lockoutSeconds <= 0 && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-2.5 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{errorMsg}</div>
            </div>
          )}

          {/* Unified Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Identifier Field */}
            <div className="space-y-1.5 text-right">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>رقم القيد / رمز المستخدم</span>
                <span className="text-[10px] text-slate-500 font-mono">
                  مثال: STU-2026-101 أو ADM-001
                </span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="STU-2026-101 أو ADM-001"
                  disabled={lockoutSeconds > 0}
                  className="w-full pl-4 pr-10 py-3 bg-slate-950/80 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm font-mono text-white placeholder-slate-600 transition-colors disabled:opacity-50"
                  required
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                  <User className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5 text-right">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>كلمة المرور</span>
                <span className="text-[10px] text-slate-500">حساس لحالة الأحرف</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  disabled={lockoutSeconds > 0}
                  className="w-full pl-10 pr-10 py-3 bg-slate-950/80 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm font-mono text-white placeholder-slate-600 transition-colors disabled:opacity-50"
                  required
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                  <KeyRound className="w-4 h-4" />
                </div>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer p-1"
                  title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Action Button */}
            <button
              type="submit"
              disabled={isSubmitting || lockoutSeconds > 0}
              className="w-full py-3.5 px-4 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>تسجيل الدخول</span>
                  <ChevronLeft className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </main>

      {/* Footer System Notice */}
      <footer className="relative z-10 w-full max-w-6xl mx-auto px-6 py-4 text-center text-xs text-slate-500">
        نظام المشكاة الذكي لإدارة المكتبات المدرسية والأكاديمية
      </footer>
    </div>
  );
};
