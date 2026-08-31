import React from 'react';
import {
  LayoutDashboard,
  BookOpen,
  ArrowLeftRight,
  Library,
  Globe2,
  BookmarkCheck,
  CheckSquare,
  Users,
  FolderTree,
  Settings,
  Sparkles,
  Server,
  Layers,
  GraduationCap,
  Shield,
  Star,
  Bookmark,
  Search,
  X as CloseIcon,
} from 'lucide-react';
import { NavigationTab, UserRole } from '../../types/library';

interface SidebarProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  userRole: UserRole;
  pendingReviewsCount: number;
  overdueLoansCount: number;
  favoritesCount?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  userRole,
  pendingReviewsCount,
  overdueLoansCount,
  favoritesCount = 0,
  isCollapsed = false,
  onToggleCollapse,
  onCloseMobile,
}) => {
  return (
    <aside
      className={`${
        isCollapsed ? 'w-18 sm:w-20' : 'w-64'
      } bg-slate-50 dark:bg-slate-900/95 border-l border-slate-200 dark:border-slate-800 flex flex-col h-full select-none shrink-0 transition-all duration-300 ease-in-out z-20 overflow-hidden`}
    >
      {/* Brand Header */}
      <div className={`p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800/80 ${isCollapsed ? 'flex justify-center' : ''}`}>
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between gap-3'}`}>
          <div className="flex items-center gap-3 min-w-0">
            {/* Book Icon Button that toggles the menu collapse */}
            <button
              type="button"
              onClick={onToggleCollapse}
              className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-emerald-500 hover:from-indigo-500 hover:to-emerald-400 active:scale-95 flex items-center justify-center shadow-md shadow-indigo-500/25 text-white font-bold text-lg cursor-pointer transition-all shrink-0 group relative"
              title={isCollapsed ? 'انقر لتوسيع وإظهار أسماء القوائم' : 'انقر لطي القائمة الجانبية وتوفير مساحة العمل'}
              aria-label="تبديل حجم القائمة الجانبية"
            >
              <BookOpen className="w-5 h-5 group-hover:scale-110 transition-transform" />
              {isCollapsed && (
                <span className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-slate-900 animate-pulse" />
              )}
            </button>

            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 truncate">
                  <span className="truncate">نظام المشكاة الذكي</span>
                  <span className="text-[10px] bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 font-mono px-1.5 py-0.5 rounded border border-indigo-500/20 shrink-0">
                    v2.6
                  </span>
                </h1>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {userRole === 'student' ? 'بوابة المطالعة والبحث الأكاديمي' : 'إدارة المكتبة المركزية'}
                </p>
              </div>
            )}
          </div>

          {/* Close button visible on mobile & tablet screens */}
          {onCloseMobile && !isCollapsed && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="lg:hidden p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="إغلاق القائمة"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation Sections */}
      <div className={`flex-1 overflow-y-auto ${isCollapsed ? 'p-2 space-y-3' : 'p-3 space-y-5'}`}>
        {/* Student-only Navigation Menu */}
        {userRole === 'student' && (
          <div>
            {!isCollapsed && (
              <div className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider px-3 mb-2 flex items-center justify-between">
                <span>فضاء الطالب المخصص</span>
                <span className="text-[9px] bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-300 px-1.5 py-0.2 rounded font-mono">طالب</span>
              </div>
            )}
            <div className="space-y-1">
              <NavItem
                icon={<BookmarkCheck className="w-4 h-4 text-purple-500" />}
                label="فضاء الطالب والأبحاث"
                active={activeTab === 'student_portal'}
                onClick={() => onSelectTab('student_portal')}
                isCollapsed={isCollapsed}
              />
              <NavItem
                icon={<Search className="w-4 h-4 text-indigo-500" />}
                label="البحث الموضوعي الشامل"
                active={activeTab === 'search_results'}
                onClick={() => onSelectTab('search_results')}
                isCollapsed={isCollapsed}
                badge={
                  !isCollapsed ? (
                    <span className="text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 font-bold px-1.5 py-0.5 rounded font-mono border border-indigo-500/20">
                      مواضيع
                    </span>
                  ) : undefined
                }
              />
              <NavItem
                icon={<Bookmark className="w-4 h-4 text-amber-500" />}
                label="مفكرة القراءة والتلخيص"
                active={activeTab === 'reading_workspace'}
                onClick={() => onSelectTab('reading_workspace')}
                isCollapsed={isCollapsed}
                badge={
                  !isCollapsed ? (
                    <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-300 font-bold px-1.5 py-0.5 rounded font-mono border border-amber-500/20">
                      فواصل وتلخيص
                    </span>
                  ) : undefined
                }
              />
              <NavItem
                icon={<Star className="w-4 h-4 text-amber-500" />}
                label="الكتب المفضلة"
                active={activeTab === 'favorites'}
                onClick={() => onSelectTab('favorites')}
                isCollapsed={isCollapsed}
                badge={
                  favoritesCount > 0 ? (
                    <span className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-300 font-bold px-1.5 py-0.5 rounded font-mono border border-amber-500/20">
                      {favoritesCount}
                    </span>
                  ) : undefined
                }
              />
              <NavItem
                icon={<BookOpen className="w-4 h-4 text-indigo-500" />}
                label="فهرس المكتبة الورقية"
                active={activeTab === 'physical'}
                onClick={() => onSelectTab('physical')}
                isCollapsed={isCollapsed}
              />
              <NavItem
                icon={<Library className="w-4 h-4 text-emerald-500" />}
                label="المستودع الرقمي والمطالعة"
                active={activeTab === 'digital'}
                onClick={() => onSelectTab('digital')}
                isCollapsed={isCollapsed}
              />
              <NavItem
                icon={<Globe2 className="w-4 h-4 text-sky-500" />}
                label="بوابة المكتبات المعتمدة"
                active={activeTab === 'portals'}
                onClick={() => onSelectTab('portals')}
                isCollapsed={isCollapsed}
                badge={
                  !isCollapsed ? (
                    <span className="text-[10px] bg-sky-500/10 text-sky-600 dark:text-sky-300 px-1.5 py-0.5 rounded font-mono border border-sky-500/20">
                      تصفح حي
                    </span>
                  ) : undefined
                }
              />
            </div>
          </div>
        )}

        {/* Admin Navigation Menu */}
        {userRole === 'admin' && (
          <>
            {/* Main Section */}
            <div>
              {!isCollapsed && (
                <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wider px-3 mb-2">
                  الرئيسية والمطالعة
                </div>
              )}
              <div className="space-y-1">
                <NavItem
                  icon={<LayoutDashboard className="w-4 h-4" />}
                  label="لوحة التحكم العامة"
                  active={activeTab === 'overview'}
                  onClick={() => onSelectTab('overview')}
                  isCollapsed={isCollapsed}
                />
                <NavItem
                  icon={<Search className="w-4 h-4 text-indigo-500" />}
                  label="البحث الموضوعي الشامل"
                  active={activeTab === 'search_results'}
                  onClick={() => onSelectTab('search_results')}
                  isCollapsed={isCollapsed}
                />
                <NavItem
                  icon={<Star className="w-4 h-4 text-amber-500" />}
                  label="الكتب المفضلة"
                  active={activeTab === 'favorites'}
                  onClick={() => onSelectTab('favorites')}
                  isCollapsed={isCollapsed}
                  badge={
                    favoritesCount > 0 ? (
                      <span className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-300 font-bold px-1.5 py-0.5 rounded font-mono border border-amber-500/20">
                        {favoritesCount}
                      </span>
                    ) : undefined
                  }
                />
                <NavItem
                  icon={<BookOpen className="w-4 h-4" />}
                  label="المكتبة الورقية (الفهرس)"
                  active={activeTab === 'physical'}
                  onClick={() => onSelectTab('physical')}
                  isCollapsed={isCollapsed}
                />
                <NavItem
                  icon={<Library className="w-4 h-4 text-emerald-500" />}
                  label="المستودع الرقمي (PDF/ePub)"
                  active={activeTab === 'digital'}
                  onClick={() => onSelectTab('digital')}
                  isCollapsed={isCollapsed}
                />
                <NavItem
                  icon={<Globe2 className="w-4 h-4 text-sky-500" />}
                  label="بوابة المكتبات المعتمدة"
                  active={activeTab === 'portals'}
                  onClick={() => onSelectTab('portals')}
                  isCollapsed={isCollapsed}
                  badge={
                    !isCollapsed ? (
                      <span className="text-[10px] bg-sky-500/10 text-sky-600 dark:text-sky-300 px-1.5 py-0.5 rounded font-mono border border-sky-500/20">
                        تصفح حي
                      </span>
                    ) : undefined
                  }
                />
              </div>
            </div>

            {/* Circulation Section for Librarian */}
            <div>
              {!isCollapsed && (
                <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wider px-3 mb-2">
                  مكتب الإعارة والتداول
                </div>
              )}
              <div className="space-y-1">
                <NavItem
                  icon={<ArrowLeftRight className="w-4 h-4 text-indigo-500" />}
                  label="تسيير الإعارات والتمديد"
                  active={activeTab === 'loans'}
                  onClick={() => onSelectTab('loans')}
                  isCollapsed={isCollapsed}
                  badge={
                    overdueLoansCount > 0 ? (
                      <span className="text-[10px] bg-rose-500/10 text-rose-600 dark:text-rose-300 px-1.5 py-0.5 rounded font-bold border border-rose-500/20">
                        {overdueLoansCount}
                      </span>
                    ) : undefined
                  }
                />
              </div>
            </div>

            {/* Administration Section */}
            <div>
              {!isCollapsed && (
                <div className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider px-3 mb-2 flex items-center justify-between">
                  <span>إدارة المشرف المركزي</span>
                  <span className="text-[9px] bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 px-1.5 py-0.2 rounded font-mono">Admin</span>
                </div>
              )}
              <div className="space-y-1">
                <NavItem
                  icon={<CheckSquare className="w-4 h-4" />}
                  label="طابور مراجعة الكتب"
                  active={activeTab === 'reviews'}
                  onClick={() => onSelectTab('reviews')}
                  isCollapsed={isCollapsed}
                  badge={
                    pendingReviewsCount > 0 ? (
                      <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-300 px-1.5 py-0.5 rounded font-bold animate-pulse border border-amber-500/20">
                        {pendingReviewsCount}
                      </span>
                    ) : undefined
                  }
                />
                <NavItem
                  icon={<Users className="w-4 h-4" />}
                  label="إدارة حسابات الطلبة"
                  active={activeTab === 'students'}
                  onClick={() => onSelectTab('students')}
                  isCollapsed={isCollapsed}
                />
                <NavItem
                  icon={<FolderTree className="w-4 h-4" />}
                  label="شجرة التصنيفات والنقل"
                  active={activeTab === 'categories'}
                  onClick={() => onSelectTab('categories')}
                  isCollapsed={isCollapsed}
                />
                <NavItem
                  icon={<Settings className="w-4 h-4" />}
                  label="إعدادات النظام والنسخ"
                  active={activeTab === 'settings'}
                  onClick={() => onSelectTab('settings')}
                  isCollapsed={isCollapsed}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Network Info / Role Identity Footer */}
      {!isCollapsed ? (
        userRole === 'admin' ? (
          <div className="p-3 border-t border-slate-200 dark:border-slate-800/80 bg-slate-100/50 dark:bg-slate-950/40 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center justify-between mb-1">
              <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium text-[11px]">
                <Server className="w-3.5 h-3.5 text-emerald-500" />
                الخادم المركزي
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">متصل محلياً</span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono truncate">
              المكتبة المركزية المتكاملة
            </div>
          </div>
        ) : (
          <div className="p-3 border-t border-slate-200 dark:border-slate-800/80 bg-purple-500/5 dark:bg-purple-950/20 text-xs text-purple-600 dark:text-purple-300">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-purple-500 shrink-0" />
              <div className="text-[11px] font-medium leading-tight">
                فضاء القراءة والبحث العلمي
              </div>
            </div>
          </div>
        )
      ) : (
        <div className="p-3 border-t border-slate-200 dark:border-slate-800/80 flex justify-center items-center">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" title="الخادم متصل ونشط" />
        </div>
      )}
    </aside>
  );
};

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: React.ReactNode;
  isCollapsed?: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, active, onClick, badge, isCollapsed = false }) => {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-full flex items-center ${
        isCollapsed ? 'justify-center px-2 py-3' : 'justify-between px-3 py-2.5'
      } rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer relative group ${
        active
          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-semibold'
          : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
      }`}
    >
      <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
        <span className={`${active ? 'text-white' : 'text-slate-400 group-hover:text-indigo-400 transition-colors'}`}>
          {icon}
        </span>
        {!isCollapsed && <span>{label}</span>}
      </div>

      {!isCollapsed && badge}

      {/* Floating dot/badge in collapsed mode */}
      {isCollapsed && badge && (
        <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>
      )}
    </button>
  );
};
