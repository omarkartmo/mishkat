import React, { useState, useRef, useEffect } from 'react';
import {
  Server,
  Search,
  UserCheck,
  Shield,
  GraduationCap,
  Bell,
  RefreshCw,
  ChevronDown,
  LogOut,
  User as UserIcon,
  Check,
  Sparkles,
  Sun,
  Moon,
  CheckCheck,
  Trash2,
  BookOpen,
  Library,
  Bookmark,
  Clock,
  Inbox,
  AlertCircle,
  X,
  MapPin,
  KeyRound,
  Lock,
  ShieldCheck,
  Menu as MenuIcon,
} from 'lucide-react';
import {
  User,
  SystemConfig,
  AppNotification,
  NavigationTab,
  PhysicalBook,
  DigitalBook,
  Category,
} from '../../types/library';
import { useTheme } from '../../context/ThemeContext';
import { matchesArabicQuery } from '../../utils/searchUtils';

interface HeaderBarProps {
  currentUser: User;
  allUsers?: User[];
  onUserChange?: (user: User) => void;
  onLogout?: () => void;
  config?: SystemConfig;
  schoolName?: string;
  libraryName?: string;
  activeTab?: string;
  pendingCount?: number;
  overdueCount?: number;
  notifications?: AppNotification[];
  onMarkNotificationRead?: (id: string) => void;
  onMarkAllNotificationsRead?: () => void;
  onClearNotifications?: () => void;
  onNavigateToTab?: (tab: NavigationTab) => void;
  onQuickSearch?: (query: string) => void;
  onNavigateToSearchResults?: (query: string) => void;
  searchQuery?: string;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onToggleCollapse?: () => void;
  physicalBooks?: PhysicalBook[];
  digitalBooks?: DigitalBook[];
  categories?: Category[];
  onOpenBookReader?: (book: DigitalBook) => void;
  onOpenPhysicalBookmark?: (book: PhysicalBook) => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  currentUser,
  allUsers = [],
  onUserChange,
  onLogout,
  config,
  schoolName,
  libraryName,
  activeTab,
  pendingCount = 0,
  overdueCount = 0,
  notifications = [],
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onClearNotifications,
  onNavigateToTab,
  onQuickSearch,
  onNavigateToSearchResults,
  searchQuery = '',
  isSidebarCollapsed = false,
  onToggleSidebar,
  onToggleCollapse,
  physicalBooks = [],
  digitalBooks = [],
  categories = [],
  onOpenBookReader,
  onOpenPhysicalBookmark,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileSearchExpanded, setIsMobileSearchExpanded] = useState(false);
  const [searchFilterType, setSearchFilterType] = useState<'all' | 'physical' | 'digital'>('all');
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const displaySchool = schoolName || config?.schoolName || 'معهد المنهاج للدراسات الأكاديمية';
  const displayLibrary = libraryName || config?.libraryName || 'المكتبة المركزية';

  const userNotifications = notifications.filter((n) => {
    if (currentUser?.role === 'admin') {
      return n.recipientRole === 'admin' || n.recipientId === 'admin' || n.recipientId === 'all';
    }
    return n.recipientId === currentUser?.id || n.recipientId === 'all';
  });

  const unreadCount = userNotifications.filter((n) => !n.isRead).length;

  // Sync external search query
  useEffect(() => {
    if (searchQuery !== undefined && searchQuery !== localSearch) {
      setLocalSearch(searchQuery);
    }
  }, [searchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchChange = (val: string) => {
    setLocalSearch(val);
    if (onQuickSearch) {
      onQuickSearch(val);
    }
    if (val.trim()) {
      setIsSearchOpen(true);
    }
  };

  const handleClearSearch = () => {
    setLocalSearch('');
    if (onQuickSearch) {
      onQuickSearch('');
    }
    setIsSearchOpen(false);
  };

  const handleSelectUser = (user: User) => {
    if (onUserChange) {
      onUserChange(user);
    }
    setIsUserMenuOpen(false);
  };

  const handleNotificationItemClick = (notif: AppNotification) => {
    if (onMarkNotificationRead && !notif.isRead) {
      onMarkNotificationRead(notif.id);
    }
    if (notif.targetTab && onNavigateToTab) {
      onNavigateToTab(notif.targetTab as NavigationTab);
      setIsNotificationsOpen(false);
    }
  };

  // Perform search across physical and digital books with Arabic normalization
  const trimmedSearch = localSearch.trim();

  const matchingPhysical = physicalBooks.filter((book) => {
    if (!trimmedSearch) return false;
    const cat = categories.find((c) => c.id === book.categoryId)?.name || '';
    return (
      matchesArabicQuery(book.title, trimmedSearch) ||
      matchesArabicQuery(book.author, trimmedSearch) ||
      matchesArabicQuery(book.publisher, trimmedSearch) ||
      matchesArabicQuery(cat, trimmedSearch) ||
      (book.isbn && book.isbn.toLowerCase().includes(trimmedSearch.toLowerCase())) ||
      (book.tags && book.tags.some((t) => matchesArabicQuery(t, trimmedSearch)))
    );
  });

  const matchingDigital = digitalBooks.filter((book) => {
    if (!trimmedSearch) return false;
    const cat = categories.find((c) => c.id === book.categoryId)?.name || '';
    return (
      matchesArabicQuery(book.title, trimmedSearch) ||
      matchesArabicQuery(book.author, trimmedSearch) ||
      matchesArabicQuery(book.summary, trimmedSearch) ||
      matchesArabicQuery(cat, trimmedSearch) ||
      (book.tags && book.tags.some((t) => matchesArabicQuery(t, trimmedSearch)))
    );
  });

  const totalResultsCount =
    searchFilterType === 'physical'
      ? matchingPhysical.length
      : searchFilterType === 'digital'
      ? matchingDigital.length
      : matchingPhysical.length + matchingDigital.length;

  return (
    <header className="h-14 sm:h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-2 sm:px-3 md:px-4 select-none shrink-0 sticky top-0 z-40 transition-colors gap-1.5 sm:gap-2.5 shadow-sm">
      {/* Left: Menu Drawer Toggle + School Identity Badge (Optimized for Mobile & Tablet) */}
      <div className={`items-center gap-1.5 sm:gap-2 shrink-0 ${isMobileSearchExpanded ? 'hidden lg:flex' : 'flex'}`}>
        {/* Mobile & Tablet Slide-over Drawer Trigger */}
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="lg:hidden p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shrink-0 shadow-xs"
            title="فتح القائمة الرئيسية"
            aria-label="القائمة الجانبية"
          >
            <MenuIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </button>
        )}

        {/* Desktop Sidebar Collapse & Expand Toggle */}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden lg:flex p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 active:scale-95 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shrink-0 shadow-xs group"
            title={isSidebarCollapsed ? 'توسيع القائمة الجانبية' : 'تصغير القائمة الجانبية'}
            aria-label="تبديل القائمة الجانبية"
          >
            <MenuIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />
          </button>
        )}

        {/* Institutional Identity Badge */}
        <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-2xl bg-gradient-to-r from-slate-50 via-indigo-50/40 to-slate-50 dark:from-slate-800/90 dark:via-indigo-950/30 dark:to-slate-800/90 border border-slate-200/80 dark:border-slate-800/90 shadow-xs transition-all hover:border-indigo-300 dark:hover:border-indigo-700/50">
          <div className="w-6.5 h-6.5 sm:w-7.5 sm:h-7.5 rounded-xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 flex items-center justify-center text-amber-300 shadow-sm shrink-0">
            <GraduationCap className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1 sm:gap-1.5">
              <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 tracking-tight leading-tight whitespace-nowrap max-w-[85px] xs:max-w-[120px] sm:max-w-[150px] lg:max-w-none truncate">
                {displaySchool}
              </span>
              {currentUser?.role === 'admin' && (
                <span className="hidden xl:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-mono font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" title="الخادم المحلي نشط">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  LAN
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-none mt-0.5 whitespace-nowrap hidden sm:block truncate max-w-[100px] sm:max-w-[130px] lg:max-w-none">
              {displayLibrary}
            </span>
          </div>
        </div>
      </div>

      {/* Center: Global Fast Unified Search (Responsive & Expandable) */}
      <div
        className={`relative transition-all ${
          isMobileSearchExpanded
            ? 'flex flex-1 w-full mx-0 z-50 animate-in fade-in duration-150'
            : 'hidden lg:flex flex-1 min-w-0 max-w-xs lg:max-w-md xl:max-w-xl mx-2 lg:mx-4'
        }`}
        ref={searchContainerRef}
      >
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => {
              if (localSearch.trim()) setIsSearchOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && localSearch.trim()) {
                e.preventDefault();
                setIsSearchOpen(false);
                setIsMobileSearchExpanded(false);
                if (onNavigateToSearchResults) {
                  onNavigateToSearchResults(localSearch.trim());
                } else if (onNavigateToTab) {
                  if (onQuickSearch) onQuickSearch(localSearch.trim());
                  onNavigateToTab('search_results');
                }
              }
            }}
            placeholder="ابحث عن كتاب، مؤلف، موضوع، أو تصنيف..."
            className="w-full bg-slate-100/90 dark:bg-slate-950/90 hover:bg-slate-100 dark:hover:bg-slate-950 border border-slate-200/90 dark:border-slate-800 focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-indigo-500/10 rounded-2xl pr-10 pl-24 py-2 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition-all shadow-xs"
          />
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {localSearch && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="مسح البحث"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {isMobileSearchExpanded && (
              <button
                type="button"
                onClick={() => {
                  setIsMobileSearchExpanded(false);
                  setIsSearchOpen(false);
                }}
                className="lg:hidden flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer shadow-xs shrink-0"
                title="إغلاق البحث والعودة"
              >
                <X className="w-3.5 h-3.5" />
                <span>إغلاق</span>
              </button>
            )}
          </div>
        </div>

        {/* Instant Search Results Dropdown Overlay */}
        {isSearchOpen && trimmedSearch && (
          <div className="absolute top-full right-0 left-0 lg:left-auto mt-2 w-full lg:w-[680px] max-w-[calc(100vw-1.5rem)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in-50 duration-150 max-h-[75vh] flex flex-col">
            {/* Filter Tabs Header */}
            <div className="p-2.5 sm:p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-2 shrink-0 overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-1.5 text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setSearchFilterType('all')}
                  className={`px-2.5 sm:px-3 py-1 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap text-xs ${
                    searchFilterType === 'all'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                  }`}
                >
                  الكل ({matchingPhysical.length + matchingDigital.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSearchFilterType('physical')}
                  className={`px-2.5 sm:px-3 py-1 rounded-lg font-bold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap text-xs ${
                    searchFilterType === 'physical'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5 shrink-0" />
                  <span>ورقية ({matchingPhysical.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSearchFilterType('digital')}
                  className={`px-2.5 sm:px-3 py-1 rounded-lg font-bold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap text-xs ${
                    searchFilterType === 'digital'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <Library className="w-3.5 h-3.5 shrink-0" />
                  <span>رقمية ({matchingDigital.length})</span>
                </button>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setIsSearchOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg text-xs"
                  title="إغلاق"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Results List - Horizontal Items Full Width */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 p-2 space-y-1">
              {totalResultsCount === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <BookOpen className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    لم يتم العثور على كتب تطابق "{trimmedSearch}"
                  </p>
                  <p className="text-[11px] text-slate-400">
                    جرب البحث بكلمات أخرى، أو باسم المؤلف، أو بالتصنيف
                  </p>
                </div>
              ) : (
                <>
                  {/* Physical Books Section */}
                  {(searchFilterType === 'all' || searchFilterType === 'physical') &&
                    matchingPhysical.map((book) => {
                      const category = categories.find((c) => c.id === book.categoryId)?.name;
                      const isAvailable = book.availableCopies > 0;
                      return (
                        <div
                          key={`p-${book.id}`}
                          className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors flex items-center justify-between gap-3 sm:gap-4 w-full"
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            {/* Badges Line (Horizontal & Never Wrap Letters) */}
                            <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto no-scrollbar">
                              <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0">
                                <BookOpen className="w-3 h-3 shrink-0" />
                                كتاب ورقي
                              </span>
                              {category && (
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-medium whitespace-nowrap shrink-0">
                                  {category}
                                </span>
                              )}
                              <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md whitespace-nowrap shrink-0 ${
                                isAvailable
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                              }`}>
                                {isAvailable ? `متوفر: ${book.availableCopies} من ${book.totalCopies}` : 'معار حالياً'}
                              </span>
                            </div>

                            {/* Book Title (Full Horizontal Width) */}
                            <h4 className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm truncate w-full block">
                              {book.title}
                            </h4>

                            {/* Metadata Row (Horizontal) */}
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-3 whitespace-nowrap overflow-x-auto no-scrollbar">
                              <span className="shrink-0">المؤلف: <strong className="text-slate-700 dark:text-slate-300">{book.author}</strong></span>
                              {book.location && (
                                <span className="text-amber-700 dark:text-amber-400 font-mono inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded text-[10px] shrink-0">
                                  <MapPin className="w-3 h-3 shrink-0" />
                                  الرف: {book.location.cabinet} - {book.location.shelf}
                                </span>
                              )}
                              {book.pages && <span className="shrink-0">{book.pages} صفحة</span>}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                            {onOpenPhysicalBookmark && (
                              <button
                                type="button"
                                onClick={() => {
                                  onOpenPhysicalBookmark(book);
                                  setIsSearchOpen(false);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500 text-amber-700 hover:text-white dark:text-amber-400 text-[11px] font-bold transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                title="تثبيت فاصل قراءة لهذا الكتاب"
                              >
                                <Bookmark className="w-3.5 h-3.5 shrink-0" />
                                <span>فاصل قراءة</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setIsSearchOpen(false);
                                if (onNavigateToSearchResults) {
                                  onNavigateToSearchResults(book.title);
                                } else if (onNavigateToTab) {
                                  if (onQuickSearch) onQuickSearch(book.title);
                                  onNavigateToTab('search_results');
                                }
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap"
                            >
                              تفاصيل
                            </button>
                          </div>
                        </div>
                      );
                    })}

                  {/* Digital Books Section */}
                  {(searchFilterType === 'all' || searchFilterType === 'digital') &&
                    matchingDigital.map((book) => {
                      const category = categories.find((c) => c.id === book.categoryId)?.name;
                      return (
                        <div
                          key={`d-${book.id}`}
                          className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors flex items-center justify-between gap-3 sm:gap-4 w-full"
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            {/* Badges Line (Horizontal & Never Wrap Letters) */}
                            <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto no-scrollbar">
                              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0">
                                <Library className="w-3 h-3 shrink-0" />
                                كتاب إلكتروني
                              </span>
                              {category && (
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-medium whitespace-nowrap shrink-0">
                                  {category}
                                </span>
                              )}
                              <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 uppercase font-semibold bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded-md whitespace-nowrap shrink-0">
                                {book.format || 'PDF'}
                              </span>
                            </div>

                            {/* Book Title (Full Horizontal Width) */}
                            <h4 className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm truncate w-full block">
                              {book.title}
                            </h4>

                            {/* Metadata Row (Horizontal) */}
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-3 whitespace-nowrap overflow-x-auto no-scrollbar">
                              <span className="shrink-0">المؤلف: <strong className="text-slate-700 dark:text-slate-300">{book.author}</strong></span>
                              {book.pagesCount && <span className="shrink-0">{book.pagesCount} صفحة</span>}
                              {book.fileSize && <span className="shrink-0">{book.fileSize}</span>}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                            {onOpenBookReader && (
                              <button
                                type="button"
                                onClick={() => {
                                  onOpenBookReader(book);
                                  setIsSearchOpen(false);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-all shadow-sm inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                title="فتح الكتاب فوراً في القارئ المدمج"
                              >
                                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                                <span>قراءة الآن 📖</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setIsSearchOpen(false);
                                if (onNavigateToSearchResults) {
                                  onNavigateToSearchResults(book.title);
                                } else if (onNavigateToTab) {
                                  if (onQuickSearch) onQuickSearch(book.title);
                                  onNavigateToTab('search_results');
                                }
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap"
                            >
                              تفاصيل
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </>
              )}
            </div>

            {/* Quick Footer - Full-Page Search Results Link */}
            {totalResultsCount > 0 && (
              <div className="p-2.5 bg-gradient-to-r from-indigo-50 via-slate-50 to-indigo-50 dark:from-slate-950 dark:via-indigo-950/30 dark:to-slate-950 border-t border-slate-200 dark:border-slate-800 text-center shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsSearchOpen(false);
                    if (onNavigateToSearchResults) {
                      onNavigateToSearchResults(trimmedSearch);
                    } else if (onNavigateToTab) {
                      if (onQuickSearch) onQuickSearch(trimmedSearch);
                      onNavigateToTab('search_results');
                    }
                  }}
                  className="w-full py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md hover:shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Search className="w-4 h-4" />
                  <span>استعراض كافة النتائج ({totalResultsCount}) ←</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Theme Switcher, Notifications & User Role Switcher */}
      <div className={`items-center gap-1.5 sm:gap-2.5 relative shrink-0 ${isMobileSearchExpanded ? 'hidden lg:flex' : 'flex'}`}>
        {/* Mobile & Tablet Search Open Trigger Button */}
        <button
          type="button"
          onClick={() => {
            setIsMobileSearchExpanded(true);
            setTimeout(() => {
              const inp = searchContainerRef.current?.querySelector('input');
              inp?.focus();
            }, 50);
          }}
          className="lg:hidden p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shadow-xs shrink-0"
          title="بحث سريع"
          aria-label="بحث سريع"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Dark / Light Mode Toggle Button */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shadow-xs shrink-0"
          title={theme === 'dark' ? 'التبديل إلى الوضع النهاري (Light Mode)' : 'التبديل إلى الوضع الليلي (Dark Mode)'}
          aria-label="تبديل المظهر"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400 hover:rotate-90 transition-transform" />
          ) : (
            <Moon className="w-4 h-4 text-indigo-600 hover:-rotate-12 transition-transform" />
          )}
        </button>

        {/* Notifications Bell Dropdown */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => {
              setIsNotificationsOpen(!isNotificationsOpen);
              setIsUserMenuOpen(false);
            }}
            className={`p-2 rounded-xl border transition-all cursor-pointer relative shadow-xs shrink-0 ${
              isNotificationsOpen
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
            title="الإشعارات والتنبيهات"
            aria-label="الإشعارات والتنبيهات"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-md animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown Panel (Responsive Width & Mobile Alignment) */}
          {isNotificationsOpen && (
            <div className="absolute left-0 top-full mt-2 w-[calc(100vw-1.5rem)] sm:w-80 md:w-96 max-w-[380px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 overflow-hidden">
              {/* Header */}
              <div className="p-3 bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-indigo-500 shrink-0" />
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    مركز الإشعارات والتنبيهات
                  </h4>
                  {unreadCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold border border-rose-500/20">
                      {unreadCount} جديد
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 text-[11px]">
                  {unreadCount > 0 && onMarkAllNotificationsRead && (
                    <button
                      onClick={onMarkAllNotificationsRead}
                      className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium cursor-pointer p-1"
                      title="تحديد الكل كمقروء"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>قراءة الكل</span>
                    </button>
                  )}
                  {userNotifications.length > 0 && onClearNotifications && (
                    <button
                      onClick={onClearNotifications}
                      className="text-slate-400 hover:text-rose-500 flex items-center gap-1 cursor-pointer p-1"
                      title="مسح كافة الإشعارات"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Notification Items List */}
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                {userNotifications.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <Inbox className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      لا توجد إشعارات جديدة حالياً
                    </p>
                  </div>
                ) : (
                  userNotifications.map((notif) => {
                    const isApproved = notif.type === 'loan_request_approved' || notif.type === 'loan_handed_over';
                    const isRejected = notif.type === 'loan_request_rejected';
                    const isPending = notif.type === 'loan_request_submitted';

                    return (
                      <div
                        key={notif.id}
                        onClick={() => handleNotificationItemClick(notif)}
                        className={`p-3 transition-colors cursor-pointer text-right flex gap-2.5 items-start ${
                          notif.isRead
                            ? 'bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/40 opacity-80'
                            : 'bg-indigo-50/50 dark:bg-indigo-950/20 hover:bg-indigo-50 dark:hover:bg-indigo-950/40'
                        }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-xs mt-0.5 ${
                            isApproved
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : isRejected
                              ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                              : isPending
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                              : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
                          }`}
                        >
                          {isApproved ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : isRejected ? (
                            <AlertCircle className="w-3.5 h-3.5" />
                          ) : isPending ? (
                            <Clock className="w-3.5 h-3.5" />
                          ) : (
                            <BookOpen className="w-3.5 h-3.5" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <h5 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                              {notif.title}
                            </h5>
                            {!notif.isRead && (
                              <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed break-words">
                            {notif.message}
                          </p>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-mono">
                            {notif.createdAt}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Quick notification alerts for admin (Desktop & Tablet) */}
        {currentUser?.role === 'admin' && (
          <div className="hidden lg:flex items-center gap-1.5">
            {overdueCount > 0 && (
              <button
                onClick={() => onNavigateToTab && onNavigateToTab('loans')}
                className="flex items-center gap-1 px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-medium animate-pulse cursor-pointer whitespace-nowrap"
                title={`${overdueCount} إعارات متأخرة`}
              >
                <Bell className="w-3.5 h-3.5" />
                <span>{overdueCount} متأخر</span>
              </button>
            )}
            {pendingCount > 0 && (
              <button
                onClick={() => onNavigateToTab && onNavigateToTab('reviews')}
                className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl text-xs font-medium cursor-pointer whitespace-nowrap"
                title={`${pendingCount} كتب بانتظار الاعتماد`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{pendingCount} مراجعة</span>
              </button>
            )}
          </div>
        )}

        {/* Current Authenticated User & Profile Menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => {
              setIsUserMenuOpen(!isUserMenuOpen);
              setIsNotificationsOpen(false);
            }}
            className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-xl transition-all text-right group cursor-pointer shadow-xs shrink-0"
            title="الملف الشخصي وإعدادات الجلسة"
            aria-label="حساب المستخدم وتسجيل الخروج"
          >
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${
                currentUser?.role === 'admin'
                  ? 'bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
                  : 'bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
              }`}
            >
              {currentUser?.role === 'admin' ? <Shield className="w-3.5 h-3.5" /> : <GraduationCap className="w-3.5 h-3.5" />}
            </div>

            <div className="hidden sm:block text-right min-w-0">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span className="truncate max-w-[100px] sm:max-w-[120px] md:max-w-[160px] lg:max-w-[200px] font-bold">
                  {currentUser?.name}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-normal whitespace-nowrap shrink-0 ${
                    currentUser?.role === 'admin'
                      ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                      : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  {currentUser?.role === 'admin' ? 'أمين المكتبة' : 'طالب'}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate">{currentUser?.registrationNumber}</div>
            </div>

            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-transform shrink-0 ${
                isUserMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Secure User Profile & Session Dropdown Modal */}
          {isUserMenuOpen && (
            <div className="absolute left-0 top-full mt-2 w-80 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-3.5 z-50 animate-in fade-in slide-in-from-top-2 space-y-3">
              {/* Profile Card Header */}
              <div className="p-3.5 bg-gradient-to-br from-slate-50 to-indigo-50/30 dark:from-slate-950 dark:to-indigo-950/20 rounded-xl border border-slate-200/80 dark:border-slate-800/80 space-y-2.5">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shadow-xs shrink-0 ${
                      currentUser?.role === 'admin'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {currentUser?.role === 'admin' ? <Shield className="w-5 h-5" /> : <GraduationCap className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                        {currentUser?.name}
                      </h4>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap shrink-0 ${
                          currentUser?.role === 'admin'
                            ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20'
                            : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                        }`}
                      >
                        {currentUser?.role === 'admin' ? 'أمين المكتبة' : 'طالب مسجل'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {currentUser?.grade || (currentUser?.role === 'admin' ? 'إدارة المنظومة' : 'المكتبة المدرسية')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 text-[10px]">
                  <div className="flex flex-col">
                    <span className="text-slate-400 dark:text-slate-500">رقم القيد الأكاديمي:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-200 font-mono truncate">{currentUser?.registrationNumber}</span>
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-slate-400 dark:text-slate-500">حالة الجلسة:</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      نشطة ومحمية
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions List with Logout Button */}
              <div className="space-y-1.5 pt-0.5">
                {onLogout && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-bold transition-all cursor-pointer border border-rose-200 dark:border-rose-900/40 shadow-xs"
                  >
                    <LogOut className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>تسجيل الخروج من الحساب</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
