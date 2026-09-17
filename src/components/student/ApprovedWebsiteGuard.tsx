import React, { useState, useEffect } from 'react';
import { ShieldAlert, ArrowRight, ExternalLink, Globe2 } from 'lucide-react';
import { portalRepository } from '../../services/portalRepository';
import { WhitelistedPortal } from '../../types/library';
import { telemetryService } from '../../services/telemetry/telemetryService';

interface ApprovedWebsiteGuardProps {
  targetUrl: string;
  onReturnHome: () => void;
}

export const ApprovedWebsiteGuard: React.FC<ApprovedWebsiteGuardProps> = ({ targetUrl, onReturnHome }) => {
  const [isAllowed, setIsAllowed] = useState<boolean | null>(null);
  const [portals, setPortals] = useState<WhitelistedPortal[]>([]);
  const [matchedPortal, setMatchedPortal] = useState<WhitelistedPortal | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function verifyUrl() {
      try {
        const res = await portalRepository.getPortals();
        const list = res.data || [];
        if (!isMounted) return;
        setPortals(list);

        const targetDomain = extractDomain(targetUrl);
        if (!targetDomain) {
          setIsAllowed(false);
          telemetryService.reportWhitelistBlock(targetUrl);
          return;
        }

        // Match against approved domains from all active portals
        let found: WhitelistedPortal | null = null;
        for (const p of list) {
          const allowedDomains = (p.allowedDomains || []).map((d) => d.toLowerCase().trim());
          const portalHost = extractDomain(p.url);
          if (portalHost) allowedDomains.push(portalHost);

          if (allowedDomains.some((d) => targetDomain === d || targetDomain.endsWith(`.${d}`))) {
            found = p;
            break;
          }
        }

        if (found) {
          setMatchedPortal(found);
          setIsAllowed(true);
        } else {
          setIsAllowed(false);
          telemetryService.reportWhitelistBlock(targetUrl);
        }
      } catch {
        if (isMounted) {
          setIsAllowed(false);
          telemetryService.reportWhitelistBlock(targetUrl);
        }
      }
    }

    verifyUrl();

    return () => {
      isMounted = false;
    };
  }, [targetUrl]);

  function extractDomain(rawUrl: string): string | null {
    try {
      const parsed = new URL(rawUrl);
      return parsed.hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  if (isAllowed === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-900 text-slate-100">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-slate-400">جاري التحقق من أمان الرابط ومطابقته للقائمة المعتمدة...</p>
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] h-full p-6 text-center bg-slate-950 text-slate-100">
        <div className="max-w-md w-full p-8 bg-slate-900/90 border border-rose-500/30 rounded-2xl shadow-2xl space-y-5">
          <div className="w-16 h-16 mx-auto bg-rose-500/10 text-rose-400 rounded-2xl flex items-center justify-center border border-rose-500/20">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-bold text-slate-100">
              هذا الموقع غير متاح ضمن المواقع المعتمدة في MISHKAT
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              لحماية بيئة التعلم والبحث، يسمح نظام مشكاة فقط بتصفح المواقع والمستودعات الرقمية المعتمدة مسبقاً من إدارة المكتبة.
            </p>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-400 font-mono break-all text-left">
            URL: {targetUrl}
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={onReturnHome}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/20"
            >
              <ArrowRight className="w-4 h-4" />
              <span>العودة إلى فضاء الطالب الآمن</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-slate-900">
      {/* Approved Site Top Banner */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-950/80 border-b border-slate-800 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <Globe2 className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-slate-100">{matchedPortal?.name || 'موقع معتمد'}</span>
          <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 rounded">
            معتمد من إدارة المكتبة
          </span>
        </div>
        <button
          type="button"
          onClick={onReturnHome}
          className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer flex items-center gap-1"
        >
          <span>إغلاق والتراجع</span>
        </button>
      </div>

      {/* Embedded Safe Viewport */}
      <iframe
        src={targetUrl}
        title={matchedPortal?.name || 'Approved Site'}
        className="flex-1 w-full h-full border-0 bg-white"
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
    </div>
  );
};
