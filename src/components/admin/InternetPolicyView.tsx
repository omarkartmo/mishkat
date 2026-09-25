import React, { useState, useEffect } from 'react';
import { Shield, Plus, Trash2, Globe, Wifi, WifiOff, AlertTriangle, ListPlus, CheckCircle2, ChevronDown, MonitorPlay, Layers, RefreshCw } from 'lucide-react';
import { BlockedCategory, BlockedSite } from '../../types/library';

type PolicyMode = 'OPEN' | 'RESTRICTED' | 'OFFLINE';

const PRESET_CATEGORIES = [
  {
    name: 'التواصل الاجتماعي',
    domains: ['facebook.com', 'twitter.com', 'instagram.com', 'tiktok.com', 'snapchat.com', 'x.com', 'pinterest.com', 'reddit.com', 'discord.com']
  },
  {
    name: 'منصات الفيديو واليوتيوب',
    domains: ['youtube.com', 'youtu.be', 'googlevideo.com', 'ytimg.com', 'dailymotion.com', 'vimeo.com', 'twitch.tv']
  },
  {
    name: 'الألعاب الترفيهية',
    domains: ['roblox.com', 'miniclip.com', 'epicgames.com', 'steamcommunity.com', 'steampowered.com', 'ea.com', 'crazygames.com', 'poki.com']
  },
  {
    name: 'البث والموسيقى',
    domains: ['youtube.com', 'youtu.be', 'netflix.com', 'spotify.com', 'anghami.com', 'soundcloud.com', 'hulu.com', 'disneyplus.com', 'primevideo.com']
  },
  {
    name: 'محتوى غير لائق',
    domains: ['pornhub.com', 'xvideos.com', 'redtube.com', 'youporn.com', 'onlyfans.com', 'livejasmin.com']
  }
];

export const InternetPolicyView: React.FC = () => {
  const [categories, setCategories] = useState<BlockedCategory[]>([]);
  const [sites, setSites] = useState<BlockedSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [policyMode, setPolicyMode] = useState<PolicyMode>('RESTRICTED');
  const [excludeServer, setExcludeServer] = useState(false);
  
  // Forms
  const [newCategoryName, setNewCategoryName] = useState('');
  const [activeTab, setActiveTab] = useState<'single' | 'bulk' | 'preset'>('preset');
  const [newSiteDomain, setNewSiteDomain] = useState('');
  const [bulkDomains, setBulkDomains] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('ALL');

  // Proxy sync & notifications
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);
  const [localProxyConfigured, setLocalProxyConfigured] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${localStorage.getItem('mishkat_jwt_token')}` };
      const [catsRes, sitesRes, modeRes, excludeRes, statusRes] = await Promise.all([
        fetch('/api/v1/internet-policy/categories', { headers }),
        fetch('/api/v1/internet-policy/sites', { headers }),
        fetch('/api/v1/internet-policy/mode', { headers }),
        fetch('/api/v1/internet-policy/exclude-server', { headers }),
        fetch('/api/v1/internet-policy/status', { headers }).catch(() => null)
      ]);
      if (catsRes.ok) setCategories(await catsRes.json());
      if (sitesRes.ok) setSites(await sitesRes.json());
      if (modeRes.ok) {
        const modeData = await modeRes.json();
        setPolicyMode(modeData.mode || 'RESTRICTED');
      }
      if (excludeRes.ok) {
        const excludeData = await excludeRes.json();
        setExcludeServer(excludeData.excludeServer ?? false);
      }
      if (statusRes && statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.data) {
          setLocalProxyConfigured(statusData.data.localProxyConfigured ?? false);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const syncLocalProxy = async () => {
    setIsSyncing(true);
    setSyncStatusMsg(null);
    try {
      const headers = { 'Authorization': `Bearer ${localStorage.getItem('mishkat_jwt_token')}` };
      const res = await fetch('/api/v1/internet-policy/sync-local-proxy', {
        method: 'POST',
        headers
      });
      const data = await res.json();
      if (data.success) {
        setLocalProxyConfigured(data.configured);
        setSyncStatusMsg(
          data.configured
            ? 'تم تفعيل الحظر على هذا الجهاز بنجاح (AutoConfigURL مفعل).'
            : 'حاسوب الإدارة مستثنى من الحظر (الوصول مباشر لكافة المواقع).'
        );
      }
    } catch {
      setSyncStatusMsg('تعذر مزامنة إعدادات الويندوز');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncStatusMsg(null), 4000);
    }
  };

  const updateExcludeServer = async (exclude: boolean) => {
    setExcludeServer(exclude);
    try {
      await fetch('/api/v1/internet-policy/exclude-server', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('mishkat_jwt_token')}`
        },
        body: JSON.stringify({ excludeServer: exclude })
      });
      // Automatically synchronize local Windows proxy
      await syncLocalProxy();
    } catch (e) {
      console.error('Failed to update exclude server setting', e);
    }
  };

  const updatePolicyMode = async (mode: PolicyMode) => {
    const prevMode = policyMode;
    setPolicyMode(mode); // Optimistic update
    try {
      const res = await fetch('/api/v1/internet-policy/mode', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('mishkat_jwt_token')}`
        },
        body: JSON.stringify({ mode })
      });
      if (!res.ok) {
        setPolicyMode(prevMode);
        alert('فشل في تحديث السياسة');
      } else {
        syncLocalProxy();
      }
    } catch (e) {
      setPolicyMode(prevMode);
      alert('فشل في تحديث السياسة');
    }
  };

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    try {
      const res = await fetch('/api/v1/internet-policy/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('mishkat_jwt_token')}`
        },
        body: JSON.stringify({ name: newCategoryName.trim() })
      });
      if (res.ok) {
        setNewCategoryName('');
        fetchData();
      }
    } catch (e) {
      alert('حدث خطأ أثناء الاتصال بالخادم.');
    }
  };

  const handleAddSite = async (domain: string, categoryId: string) => {
    await fetch('/api/v1/internet-policy/sites', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('mishkat_jwt_token')}`
      },
      body: JSON.stringify({ domain: domain.trim(), categoryId: categoryId || null })
    });
  };

  const handleBulkAdd = async (domainsArray: string[], categoryId: string) => {
    await fetch('/api/v1/internet-policy/sites/bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('mishkat_jwt_token')}`
      },
      body: JSON.stringify({ domains: domainsArray, categoryId: categoryId || null })
    });
  };

  const submitSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSiteDomain.trim()) return;
    await handleAddSite(newSiteDomain, selectedCategoryId);
    setNewSiteDomain('');
    await fetchData();
    syncLocalProxy();
  };

  const submitBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    const domains = bulkDomains.split('\n').map(d => d.trim()).filter(Boolean);
    if (domains.length === 0) return;
    await handleBulkAdd(domains, selectedCategoryId);
    setBulkDomains('');
    await fetchData();
    syncLocalProxy();
  };

  const togglePreset = async (preset: typeof PRESET_CATEGORIES[0]) => {
    const existingCat = categories.find(c => c.name === preset.name);
    
    if (existingCat) {
      // Unselect: Delete category and its sites
      await deleteCategory(existingCat.id);
    } else {
      // Select: Create category and add sites
      let catId = '';
      const res = await fetch('/api/v1/internet-policy/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('mishkat_jwt_token')}`
        },
        body: JSON.stringify({ name: preset.name })
      });
      if (res.ok) {
        const newCat = await res.json();
        catId = newCat.id;
        await handleBulkAdd(preset.domains, catId);
        await fetchData();
        syncLocalProxy();
      }
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      await fetch(`/api/v1/internet-policy/categories/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('mishkat_jwt_token')}` }
      });
      await fetchData();
      syncLocalProxy();
    } catch (e) {
      console.error(e);
    }
  };

  const deleteSite = async (id: string, domain?: string) => {
    try {
      await fetch(`/api/v1/internet-policy/sites/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('mishkat_jwt_token')}` }
      });
      setDeleteNotice(domain ? `✅ تم رفع الحظر فوراً عن "${domain}". يمكن للطلاب استخدامه الآن.` : '✅ تم حذف الموقع من قائمة الحظر.');
      setTimeout(() => setDeleteNotice(null), 4000);
      await fetchData();
      syncLocalProxy();
    } catch (e) {
      console.error(e);
    }
  };

  const toggleSiteStatus = async (site: BlockedSite) => {
    try {
      await fetch(`/api/v1/internet-policy/sites/${site.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('mishkat_jwt_token')}`
        },
        body: JSON.stringify({
          domain: site.domain,
          categoryId: site.categoryId,
          isActive: !site.isActive
        })
      });
      await fetchData();
      syncLocalProxy();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-10">
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-400" />
            سياسة الإنترنت والمواقع المحظورة
          </h2>
          <p className="text-xs text-slate-400">
            إدارة سياسة وصول الطلاب لشبكة الإنترنت داخل المدرسة وحماية البيئة الأكاديمية.
          </p>
        </div>

        {/* EXCLUDE SERVER PC CONTROL */}
        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 px-3.5 py-2 rounded-xl transition-all">
            <input 
               type="checkbox" 
               id="excludeServer" 
               checked={excludeServer}
               onChange={(e) => updateExcludeServer(e.target.checked)}
               className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer" 
            />
            <label htmlFor="excludeServer" className="text-xs font-semibold text-slate-200 cursor-pointer select-none">
              استثناء حاسوب الإدارة (Server PC)
            </label>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
              excludeServer
                ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40'
                : 'bg-rose-950/60 text-rose-400 border-rose-800/40'
            }`}>
              {excludeServer ? 'مستثنى (تصفح حر)' : 'يُطبق الحظر كحواسيب الطلبة'}
            </span>
          </div>

          <button
            type="button"
            onClick={syncLocalProxy}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
            title="مزامنة وتطبيق إعدادات البروكسي على نظام ويندوز في هذا الجهاز فوراً"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>مزامنة إعدادات هذا الجهاز</span>
          </button>
        </div>
      </div>

      {syncStatusMsg && (
        <div className="p-3 rounded-xl bg-indigo-950/60 border border-indigo-800/50 text-indigo-200 text-xs flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{syncStatusMsg}</span>
        </div>
      )}

      {/* MASTER POLICY TOGGLE */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          onClick={() => updatePolicyMode('OPEN')}
          className={`relative overflow-hidden p-4 rounded-xl border text-right transition-all duration-300 ${
            policyMode === 'OPEN' 
              ? 'bg-emerald-900/30 border-emerald-500/50 shadow-md shadow-emerald-900/20 scale-[1.01]' 
              : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700 opacity-60 hover:opacity-100'
          }`}
        >
          {policyMode === 'OPEN' && (
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 blur-2xl rounded-full" />
          )}
          <div className="flex items-center justify-between mb-1.5">
            <Wifi className={`w-5 h-5 ${policyMode === 'OPEN' ? 'text-emerald-400' : 'text-slate-500'}`} />
            {policyMode === 'OPEN' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          </div>
          <h3 className={`text-sm font-bold mb-1 ${policyMode === 'OPEN' ? 'text-emerald-300' : 'text-slate-300'}`}>مفتوح كلياً</h3>
          <p className="text-[11px] text-slate-500 leading-relaxed">الإنترنت متاح للطلاب بدون قيود. لا ينصح به في الدوام.</p>
        </button>

        <button
          onClick={() => updatePolicyMode('RESTRICTED')}
          className={`relative overflow-hidden p-4 rounded-xl border text-right transition-all duration-300 ${
            policyMode === 'RESTRICTED' 
              ? 'bg-amber-900/30 border-amber-500/50 shadow-md shadow-amber-900/20 scale-[1.01]' 
              : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700 opacity-60 hover:opacity-100'
          }`}
        >
          {policyMode === 'RESTRICTED' && (
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 blur-2xl rounded-full" />
          )}
          <div className="flex items-center justify-between mb-1.5">
            <Shield className={`w-5 h-5 ${policyMode === 'RESTRICTED' ? 'text-amber-400' : 'text-slate-500'}`} />
            {policyMode === 'RESTRICTED' && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
          </div>
          <h3 className={`text-sm font-bold mb-1 ${policyMode === 'RESTRICTED' ? 'text-amber-300' : 'text-slate-300'}`}>مقيد (موصى به)</h3>
          <p className="text-[11px] text-slate-500 leading-relaxed">تطبيق قواعد الحظر لمنع الوصول للمواقع المشتتة والمضرة.</p>
        </button>

        <button
          onClick={() => updatePolicyMode('OFFLINE')}
          className={`relative overflow-hidden p-4 rounded-xl border text-right transition-all duration-300 ${
            policyMode === 'OFFLINE' 
              ? 'bg-rose-900/30 border-rose-500/50 shadow-md shadow-rose-900/20 scale-[1.01]' 
              : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700 opacity-60 hover:opacity-100'
          }`}
        >
          {policyMode === 'OFFLINE' && (
            <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 blur-2xl rounded-full" />
          )}
          <div className="flex items-center justify-between mb-1.5">
            <WifiOff className={`w-5 h-5 ${policyMode === 'OFFLINE' ? 'text-rose-400' : 'text-slate-500'}`} />
            {policyMode === 'OFFLINE' && <CheckCircle2 className="w-4 h-4 text-rose-400" />}
          </div>
          <h3 className={`text-sm font-bold mb-1 ${policyMode === 'OFFLINE' ? 'text-rose-300' : 'text-slate-300'}`}>بدون إنترنت</h3>
          <p className="text-[11px] text-slate-500 leading-relaxed">إيقاف الإنترنت تماماً، والسماح بمكتبة المشكاة المحلية فقط.</p>
        </button>
      </div>

      <div className={`transition-opacity duration-500 ${policyMode === 'RESTRICTED' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
          
          {/* LEFT COLUMN: Categories */}
          <div className="xl:col-span-1 space-y-5">
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                إدارة الفئات
              </h3>
              
              <form onSubmit={addCategory} className="flex gap-2 mb-4">
                <input
                  type="text"
                  placeholder="فئة جديدة (ألعاب)"
                  className="flex-1 bg-slate-950/50 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs transition-all outline-none"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={!newCategoryName.trim()}
                  className="px-3 py-1.5 bg-indigo-600/90 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-all flex items-center justify-center shadow-md shadow-indigo-900/20"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </form>

              <div className="space-y-2">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/30 hover:bg-slate-800/60 border border-slate-700/50 hover:border-slate-600 transition-all group">
                    <span className="text-sm font-medium text-slate-300">{cat.name}</span>
                    <button
                      onClick={() => deleteCategory(cat.id)}
                      className="text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {categories.length === 0 && (
                  <div className="text-center text-sm text-slate-500 py-6">لا توجد فئات حالياً.</div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Sites & Bulk Add */}
          <div className="xl:col-span-3 space-y-5">
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl p-5 shadow-sm">
              
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
                <div className="flex items-center gap-4">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-indigo-400" />
                    النطاقات المحظورة
                  </h3>
                  
                  <select
                    className="bg-slate-900/80 border border-slate-700 text-slate-300 rounded-md px-2 py-1 text-[11px] outline-none focus:border-indigo-500 cursor-pointer"
                    value={filterCategoryId}
                    onChange={e => setFilterCategoryId(e.target.value)}
                  >
                    <option value="ALL">جميع الفئات</option>
                    <option value="NONE">مواقع بدون فئة</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                
                {/* TABS */}
                <div className="flex p-1 bg-slate-950/50 rounded-lg border border-slate-800">
                  <button
                    onClick={() => setActiveTab('preset')}
                    className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-all ${activeTab === 'preset' ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-400 hover:text-slate-300'}`}
                  >
                    حزم جاهزة
                  </button>
                  <button
                    onClick={() => setActiveTab('single')}
                    className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-all ${activeTab === 'single' ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-400 hover:text-slate-300'}`}
                  >
                    إضافة يدوية
                  </button>
                  <button
                    onClick={() => setActiveTab('bulk')}
                    className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-all ${activeTab === 'bulk' ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-400 hover:text-slate-300'}`}
                  >
                    إضافة بالجملة
                  </button>
                </div>
              </div>

              {/* INPUT AREA BASED ON TAB */}
              <div className="mb-6 p-4 bg-slate-950/40 border border-slate-800/50 rounded-xl">
                
                {activeTab === 'preset' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {PRESET_CATEGORIES.map(preset => {
                      const isSelected = categories.some(c => c.name === preset.name);
                      return (
                        <button
                          key={preset.name}
                          onClick={() => togglePreset(preset)}
                          className={`flex items-center gap-3 p-3 rounded-lg border text-right transition-all group ${
                            isSelected 
                              ? 'bg-indigo-900/30 border-indigo-500/50' 
                              : 'bg-slate-900/80 border-slate-700/60 hover:border-indigo-500/50'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                            isSelected ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-600 bg-slate-950/50'
                          }`}>
                            {isSelected && <CheckCircle2 className="w-3 h-3" />}
                          </div>
                          <div>
                            <h4 className="text-[11px] font-bold text-slate-200">{preset.name}</h4>
                            <p className="text-[10px] text-slate-500 mt-0.5">{preset.domains.length} مواقع</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {(activeTab === 'single' || activeTab === 'bulk') && (
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-3">
                      <select
                        className="bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-500 w-48"
                        value={selectedCategoryId}
                        onChange={e => setSelectedCategoryId(e.target.value)}
                      >
                        <option value="">-- الفئة (اختياري) --</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>

                    {activeTab === 'single' ? (
                      <form onSubmit={submitSingle} className="flex gap-2">
                        <div className="flex-1 relative">
                          <Globe className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                          <input
                            type="text"
                            placeholder="facebook.com"
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg pr-9 pl-3 py-2 text-slate-200 text-xs focus:border-indigo-500 outline-none transition-colors"
                            value={newSiteDomain}
                            onChange={e => setNewSiteDomain(e.target.value)}
                            dir="ltr"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={!newSiteDomain.trim()}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-all text-xs font-semibold shadow-md shadow-indigo-600/20"
                        >
                          إضافة
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={submitBulk} className="flex flex-col gap-2">
                        <textarea
                          placeholder="الصق الروابط هنا (رابط واحد في كل سطر)..."
                          className="w-full h-24 bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-200 text-xs focus:border-indigo-500 outline-none transition-colors resize-none"
                          value={bulkDomains}
                          onChange={e => setBulkDomains(e.target.value)}
                          dir="ltr"
                        />
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={!bulkDomains.trim()}
                            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-all text-xs font-semibold shadow-md shadow-indigo-600/20 flex items-center gap-2"
                          >
                            <ListPlus className="w-3.5 h-3.5" />
                            إضافة القائمة
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>

              {/* SITES TABLE */}
              {deleteNotice && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-950/60 border border-emerald-800/50 text-emerald-200 text-xs flex items-center gap-2 animate-fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{deleteNotice}</span>
                </div>
              )}
              <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
                <table className="w-full text-xs text-right">
                  <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="w-10 px-4 py-3 font-semibold text-center">حالة</th>
                      <th className="px-4 py-3 font-semibold">النطاق المحظور</th>
                      <th className="px-4 py-3 font-semibold">الفئة</th>
                      <th className="px-4 py-3 font-semibold">تاريخ الإضافة</th>
                      <th className="px-4 py-3 font-semibold w-16 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {sites.filter(site => {
                      if (filterCategoryId === 'ALL') return true;
                      if (filterCategoryId === 'NONE') return !site.categoryId;
                      return site.categoryId === filterCategoryId;
                    }).map(site => (
                      <tr key={site.id} className="hover:bg-slate-800/40 transition-colors group">
                        <td className="px-4 py-2.5 text-center">
                          <button 
                            onClick={() => deleteSite(site.id, site.domain)}
                            className="w-4 h-4 rounded border bg-indigo-500 border-indigo-500 text-white flex items-center justify-center transition-colors mx-auto"
                            title="نزع الاختيار لإلغاء الحظر فوراً"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                          </button>
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-200" dir="ltr" style={{ textAlign: 'right' }}>
                          {site.domain}
                        </td>
                        <td className="px-4 py-2.5">
                          {site.categoryName ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700/50">
                              {site.categoryName}
                            </span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 font-mono text-[10px]">
                          {new Date(site.createdAt).toLocaleDateString('ar-SA')}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => deleteSite(site.id, site.domain)}
                            className="text-slate-500 hover:text-rose-400 hover:bg-rose-400/10 transition-all p-1 rounded opacity-0 group-hover:opacity-100 mx-auto"
                            title="إلغاء الحظر فوراً"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {sites.filter(site => {
                      if (filterCategoryId === 'ALL') return true;
                      if (filterCategoryId === 'NONE') return !site.categoryId;
                      return site.categoryId === filterCategoryId;
                    }).length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center">
                          <div className="flex flex-col items-center justify-center text-slate-500">
                            <MonitorPlay className="w-8 h-8 mb-2 opacity-20" />
                            <p>لا توجد مواقع محظورة حالياً.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
