import React, { useState } from 'react';
import {
  BookOpen,
  Search,
  Filter,
  Plus,
  MapPin,
  Barcode,
  Layers,
  ArrowLeftRight,
  Edit2,
  Trash2,
  CheckCircle,
  AlertCircle,
  X,
  Printer,
  Star,
  BookPlus,
  BookOpenCheck,
  Sparkles,
  Bookmark,
  MinusCircle,
  PlusCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { PhysicalBook, Category, UserRole, User as UserType, SystemConfig } from '../../types/library';
import { StudentLoanRequestModal } from './StudentLoanRequestModal';
import { BulkCsvImportModal, BulkCsvImportContent } from './BulkCsvImportModal';

interface PhysicalLibraryViewProps {
  books: PhysicalBook[];
  categories: Category[];
  userRole: UserRole;
  currentUser?: UserType;
  favoriteBookIds?: string[];
  systemConfig?: SystemConfig;
  onToggleFavorite?: (bookId: string) => void;
  onOpenPhysicalBookmark?: (book: PhysicalBook) => void;
  onRequestLoanSubmit?: (params: {
    bookId: string;
    studentId: string;
    purpose: string;
    customReason?: string;
    requestedDurationDays?: number;
  }) => void;
  onAddBook: (book: Omit<PhysicalBook, 'id' | 'addedAt' | 'availableCopies'>) => void;
  onUpdateBook?: (id: string, updates: Partial<PhysicalBook>) => void;
  onDeleteBook?: (id: string, options?: { copiesCount?: number; reason?: string }) => Promise<any> | void;
  onIssueLoanForBook?: (book: PhysicalBook) => void;
  onQuickLoan?: (bookId: string) => void;
  onBulkImportBooks?: (books: Array<Partial<PhysicalBook> & { categoryName?: string }>) => Promise<boolean | void>;
  initialSearchQuery?: string;
}

export const PhysicalLibraryView: React.FC<PhysicalLibraryViewProps> = ({
  books,
  categories,
  userRole,
  currentUser,
  favoriteBookIds = [],
  systemConfig,
  onToggleFavorite,
  onOpenPhysicalBookmark,
  onRequestLoanSubmit,
  onAddBook,
  onUpdateBook,
  onDeleteBook,
  onIssueLoanForBook,
  onQuickLoan,
  onBulkImportBooks,
  initialSearchQuery = '',
}) => {
  const [search, setSearch] = useState(initialSearchQuery);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available' | 'borrowed'>('all');
  
  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<PhysicalBook | null>(null);
  const [shelfCardBook, setShelfCardBook] = useState<PhysicalBook | null>(null);
  const [requestingLoanBook, setRequestingLoanBook] = useState<PhysicalBook | null>(null);
  const [bookToDelete, setBookToDelete] = useState<PhysicalBook | null>(null);
  const [deleteMode, setDeleteMode] = useState<'entire' | 'copies'>('copies');
  const [copiesToRemove, setCopiesToRemove] = useState(1);
  const [removalReason, setRemovalReason] = useState('نسخة مفقودة / ضائعة (لم يتم العثور عليها)');
  const [customRemovalReason, setCustomRemovalReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleOpenDeleteModal = (book: PhysicalBook) => {
    setBookToDelete(book);
    setDeleteMode(book.totalCopies > 1 ? 'copies' : 'entire');
    setCopiesToRemove(1);
    setRemovalReason('نسخة مفقودة / ضائعة (لم يتم العثور عليها)');
    setCustomRemovalReason('');
  };

  // Filtered books
  const filteredBooks = books.filter((b) => {
    const matchesSearch =
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.author.toLowerCase().includes(search.toLowerCase()) ||
      (b.isbn && b.isbn.includes(search)) ||
      b.location.cabinet.toLowerCase().includes(search.toLowerCase()) ||
      b.location.shelf.toLowerCase().includes(search.toLowerCase());

    const matchesCategory = selectedCategory === 'all' || b.categoryId === selectedCategory;

    const matchesAvailability =
      availabilityFilter === 'all' ||
      (availabilityFilter === 'available' && b.availableCopies > 0) ||
      (availabilityFilter === 'borrowed' && b.availableCopies < b.totalCopies);

    return matchesSearch && matchesCategory && matchesAvailability;
  });

  const getCategory = (catId: string) => categories.find((c) => c.id === catId);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg sm:text-xl font-bold text-slate-100 flex items-center gap-2 break-words">
            <BookOpen className="w-5 h-5 text-indigo-400 shrink-0" />
            <span className="break-words">فهرس المكتبة الورقية والجرد المكاني</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed break-words">
            إدارة الكتب الورقية، مواقع الرفوف والخزائن، وتتبع النسخ المتوفرة للإعارة
          </p>
        </div>

        {(userRole === 'admin' || userRole === 'librarian') && (
          <div className="flex items-center gap-2.5 self-start md:self-auto shrink-0 flex-wrap">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-amber-600/30 hover:shadow-amber-500/40 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4 shrink-0 stroke-[2.5]" />
              <span>إضافة الكتب الورقية</span>
            </button>
          </div>
        )}
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="البحث بالعنوان، المؤلف، رقم الـ ISBN، أو رقم الخزانة والرف..."
              className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 rounded-xl pr-10 pl-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              value={availabilityFilter}
              onChange={(e) => setAvailabilityFilter(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-300 outline-none focus:border-indigo-500"
            >
              <option value="all">كل حالات التوفر</option>
              <option value="available">النسخ المتوفرة فقط</option>
              <option value="borrowed">الكتب المعارة جزئياً / كلياً</option>
            </select>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all shrink-0 ${
              selectedCategory === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            جميع الأقسام ({books.length})
          </button>
          {categories.map((cat) => {
            const count = books.filter((b) => b.categoryId === cat.id).length;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all shrink-0 flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-slate-100 text-slate-900 font-bold'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                <span>{cat.name}</span>
                <span className="text-[10px] opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Book Grid */}
      {filteredBooks.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/40 border border-slate-800/60 rounded-2xl space-y-3">
          <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-1" />
          <h3 className="text-base font-bold text-slate-300">لا توجد كتب مطابقة لخيارات البحث</h3>
          <p className="text-xs text-slate-500">جرب تغيير كلمات البحث أو اختيار قسم آخر</p>
          {userRole === 'admin' && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة الكتب الورقية</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredBooks.map((book) => {
            const cat = getCategory(book.categoryId);
            const isAvailable = book.availableCopies > 0;

            return (
              <div
                key={book.id}
                className="bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 flex flex-col justify-between transition-all group shadow-sm hover:shadow-md"
              >
                <div className="space-y-3">
                  {/* Category & Status Bar */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[11px] px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1"
                        style={{
                          backgroundColor: `${cat?.color || '#6366f1'}20`,
                          color: cat?.color || '#818cf8',
                          border: `1px solid ${cat?.color || '#6366f1'}40`,
                        }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat?.color }} />
                        {cat?.name || 'عام'}
                      </span>

                      {/* Favorite Star Button */}
                      {onToggleFavorite && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(book.id);
                          }}
                          className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                            favoriteBookIds.includes(book.id)
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-sm'
                              : 'bg-slate-800/80 text-slate-400 hover:text-amber-400 hover:bg-slate-800 border-slate-700/60'
                          }`}
                          title={favoriteBookIds.includes(book.id) ? 'إزالة من المفضلة' : 'إضافة للكتب المفضلة'}
                        >
                          <Star
                            className={`w-3.5 h-3.5 ${
                              favoriteBookIds.includes(book.id) ? 'fill-amber-400 text-amber-400' : ''
                            }`}
                          />
                        </button>
                      )}
                    </div>

                    {/* Copies availability badge */}
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-lg font-mono font-medium flex items-center gap-1 ${
                        isAvailable
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                      }`}
                    >
                      {isAvailable ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                      <span>
                        {book.availableCopies} / {book.totalCopies} متوفر
                      </span>
                    </span>
                  </div>

                  {/* Title & Author */}
                  <div>
                    <h3 className="font-bold text-slate-100 text-base leading-snug group-hover:text-indigo-300 transition-colors">
                      {book.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 font-medium">{book.author}</p>
                  </div>

                  {/* Summary */}
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {book.summary}
                  </p>

                  {/* Shelf Location Box (Critical Feature) */}
                  <div className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-1 text-xs">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-1 text-slate-400 font-medium">
                        <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                        الموقع على الرف:
                      </span>
                      <span className="font-semibold text-indigo-300">
                        {book.location.cabinet} • {book.location.shelf}
                      </span>
                    </div>
                    {book.location.section && (
                      <div className="text-[11px] text-slate-400 pr-4 truncate">
                        {book.location.section}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => setShelfCardBook(book)}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs transition-colors"
                      title="عرض بطاقة الرف والباركود"
                    >
                      <Barcode className="w-4 h-4" />
                    </button>
                    {userRole === 'admin' && (
                      <>
                        <button
                          onClick={() => setEditingBook(book)}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-indigo-950/60 text-slate-300 hover:text-indigo-300 border border-slate-700/70 hover:border-indigo-500/50 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                          title="تعديل بيانات الكتاب الورقي"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-indigo-400" />
                          <span>تعديل</span>
                        </button>
                        {onDeleteBook && (
                          <button
                            type="button"
                            onClick={() => handleOpenDeleteModal(book)}
                            className="p-2 bg-slate-800 hover:bg-rose-900/50 text-slate-300 hover:text-rose-400 rounded-lg text-xs transition-colors cursor-pointer"
                            title="حذف الكتاب أو استبعاد نسخ مفقودة"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {userRole === 'admin' ? (
                    <button
                      disabled={!isAvailable}
                      onClick={() => {
                        if (onIssueLoanForBook) {
                          onIssueLoanForBook(book);
                        } else if (onQuickLoan) {
                          onQuickLoan(book.id);
                        }
                      }}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        isAvailable
                          ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 cursor-pointer'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      <span>{isAvailable ? 'تسجيل إعارة' : 'غير متوفر'}</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      {onOpenPhysicalBookmark && (
                        <button
                          onClick={() => onOpenPhysicalBookmark(book)}
                          className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-lg text-xs transition-colors cursor-pointer"
                          title="تثبيت أو تعديل فاصل القراءة لهذا الكتاب"
                        >
                          <Bookmark className="w-4 h-4" />
                        </button>
                      )}
                      {isAvailable ? (
                        <button
                          onClick={() => setRequestingLoanBook(book)}
                          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
                        >
                          <BookPlus className="w-3.5 h-3.5" />
                          <span>طلب استعارة الكتاب</span>
                        </button>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-medium">
                          مستعار حالياً
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Book Modal */}
      {isAddModalOpen && (
        <BookFormModal
          categories={categories}
          onClose={() => setIsAddModalOpen(false)}
          onSave={(data) => {
            onAddBook(data);
            setIsAddModalOpen(false);
          }}
          onBulkImportBooks={onBulkImportBooks}
        />
      )}

      {/* Edit Book Modal */}
      {editingBook && (
        <BookFormModal
          initialBook={editingBook}
          categories={categories}
          onClose={() => setEditingBook(null)}
          onSave={(data) => {
            if (onUpdateBook) onUpdateBook(editingBook.id, data);
            setEditingBook(null);
          }}
          onDelete={(book) => {
            setEditingBook(null);
            handleOpenDeleteModal(book);
          }}
        />
      )}

      {/* Shelf Location & Barcode Card Modal */}
      {shelfCardBook && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <Barcode className="w-5 h-5 text-indigo-400" />
                بطاقة الجرد والرف المكتبي
              </h3>
              <button onClick={() => setShelfCardBook(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-white text-slate-900 p-5 rounded-xl space-y-3 font-sans shadow-inner">
              <div className="text-center border-b pb-3">
                <div className="text-xs font-bold text-slate-500">المكتبة المدرسية المركزية</div>
                <div className="text-base font-extrabold mt-0.5">{shelfCardBook.title}</div>
                <div className="text-xs text-slate-600">{shelfCardBook.author}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs py-2 bg-slate-100 p-2 rounded-lg">
                <div>
                  <span className="text-slate-500">الخزانة:</span>{' '}
                  <strong className="text-slate-900">{shelfCardBook.location.cabinet}</strong>
                </div>
                <div>
                  <span className="text-slate-500">الرف:</span>{' '}
                  <strong className="text-slate-900">{shelfCardBook.location.shelf}</strong>
                </div>
                {shelfCardBook.isbn && (
                  <div className="col-span-2">
                    <span className="text-slate-500">ISBN:</span>{' '}
                    <span className="font-mono">{shelfCardBook.isbn}</span>
                  </div>
                )}
              </div>

              {/* Simulated Barcode */}
              <div className="pt-2 text-center">
                <div className="h-12 bg-slate-900 w-full flex items-center justify-around px-2 rounded">
                  {Array.from({ length: 32 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-full bg-white"
                      style={{ width: `${(i % 3) + 1}px` }}
                    />
                  ))}
                </div>
                <div className="text-[10px] font-mono tracking-widest text-slate-600 mt-1">
                  ALM-{shelfCardBook.id.toUpperCase()}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة الملصق</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Loan Request Modal */}
      {requestingLoanBook && currentUser && (
        <StudentLoanRequestModal
          book={requestingLoanBook}
          currentUser={currentUser}
          isOpen={!!requestingLoanBook}
          availableReasons={systemConfig?.predefinedLoanReasons}
          onClose={() => setRequestingLoanBook(null)}
          onSubmitRequest={(params) => {
            if (onRequestLoanSubmit) {
              onRequestLoanSubmit(params);
            }
          }}
        />
      )}

      {/* Delete Book & Copies Management Modal */}
      {bookToDelete && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 text-right" dir="rtl">
            {/* Modal Header */}
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-3 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-base">إدارة الحذف واستبعاد النسخ</h3>
                <p className="text-xs text-slate-400">حذف الكتاب بالكامل أو استبعاد نسخ مفقودة لتطابق جرد الرف</p>
              </div>
            </div>

            {/* Book Info Summary */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">عنوان الكتاب:</span>
                <span className="font-bold text-slate-200">{bookToDelete.title}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">المؤلف:</span>
                <span className="text-slate-300">{bookToDelete.author}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">الموقع على الرف:</span>
                <span className="font-mono text-indigo-400">{bookToDelete.location.cabinet} • {bookToDelete.location.shelf}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                <span className="text-slate-400">حالة الجرد الحالي:</span>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-lg bg-indigo-500/15 text-indigo-300 font-mono font-bold">
                    {bookToDelete.totalCopies} نسخة إجمالية
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-400 font-mono font-bold">
                    {bookToDelete.availableCopies} متوفرة
                  </span>
                  {bookToDelete.totalCopies > bookToDelete.availableCopies && (
                    <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-400 font-mono font-bold">
                      {bookToDelete.totalCopies - bookToDelete.availableCopies} معارة
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* If book has multiple copies, show selection between Copies Reduction vs Full Deletion */}
            {bookToDelete.totalCopies > 1 && (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">اختر نوع العملية المطلوبة:</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDeleteMode('copies')}
                    className={`p-3 rounded-2xl border text-right transition-all cursor-pointer space-y-1 ${
                      deleteMode === 'copies'
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 shadow-sm'
                        : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <MinusCircle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>استبعاد نسخ مفقودة/تالفة</span>
                    </div>
                    <p className="text-[11px] opacity-80 leading-relaxed">
                      تقليص عدد النسخ فقط ليعكس النظام ما هو موجود فعلياً بالرف
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeleteMode('entire')}
                    className={`p-3 rounded-2xl border text-right transition-all cursor-pointer space-y-1 ${
                      deleteMode === 'entire'
                        ? 'bg-rose-500/15 border-rose-500/50 text-rose-300 shadow-sm'
                        : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>حذف الكتاب بالكامل</span>
                    </div>
                    <p className="text-[11px] opacity-80 leading-relaxed">
                      إزالة سجل الكتاب نهائياً من المكتبة بجميع نسخه وبياناته
                    </p>
                  </button>
                </div>
              </div>
            )}

            {/* Mode A: Reduce Specific Copies */}
            {deleteMode === 'copies' && (
              <div className="space-y-4 bg-slate-950/50 border border-slate-800/80 rounded-2xl p-4">
                {bookToDelete.availableCopies === 0 ? (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs text-amber-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      جميع نسخ هذا الكتاب معارة حالياً ({bookToDelete.totalCopies} نسخ). لا يمكن استبعاد أي نسخة حتى يتم إرجاعها إلى المكتبة أولاً.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">
                        عدد النسخ المراد استبعادها من الفهرس:
                      </label>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center bg-slate-900 border border-slate-700/80 rounded-xl p-1">
                          <button
                            type="button"
                            onClick={() => setCopiesToRemove(Math.max(1, copiesToRemove - 1))}
                            disabled={copiesToRemove <= 1}
                            className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg disabled:opacity-30 cursor-pointer"
                          >
                            <MinusCircle className="w-4 h-4" />
                          </button>
                          <span className="w-12 text-center font-mono font-bold text-base text-amber-400">
                            {copiesToRemove}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCopiesToRemove(Math.min(bookToDelete.availableCopies, copiesToRemove + 1))}
                            disabled={copiesToRemove >= bookToDelete.availableCopies}
                            className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg disabled:opacity-30 cursor-pointer"
                          >
                            <PlusCircle className="w-4 h-4" />
                          </button>
                        </div>
                        <span className="text-xs text-slate-400">
                          (الحد الأقصى المتاح للاستبعاد: <strong className="text-emerald-400 font-mono">{bookToDelete.availableCopies}</strong> نسخة متوفرة)
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">
                        سبب الاستبعاد (لتوثيق الجرد):
                      </label>
                      <select
                        value={removalReason}
                        onChange={(e) => setRemovalReason(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
                      >
                        <option value="نسخة مفقودة / ضائعة (لم يتم العثور عليها)">نسخة مفقودة / ضائعة (لم يتم العثور عليها بالرف)</option>
                        <option value="نسخة تالفة / ممزقة (استبعاد من الجرد)">نسخة تالفة / ممزقة (استبعاد من الجرد)</option>
                        <option value="نقل أو إهداء خارج المكتبة">نقل أو إهداء خارج المكتبة</option>
                        <option value="سبب آخر (مخصص)">سبب آخر (مخصص)...</option>
                      </select>

                      {removalReason === 'سبب آخر (مخصص)' && (
                        <input
                          type="text"
                          value={customRemovalReason}
                          onChange={(e) => setCustomRemovalReason(e.target.value)}
                          placeholder="اكتب سبب الاستبعاد باختصار..."
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500 mt-2"
                        />
                      )}
                    </div>

                    <div className="p-3 bg-slate-900/90 border border-slate-800/80 rounded-xl text-xs space-y-1">
                      <div className="flex items-center justify-between text-slate-300">
                        <span>النسخ الإجمالية بعد الاستبعاد:</span>
                        <strong className="text-amber-400 font-mono">
                          {Math.max(0, bookToDelete.totalCopies - copiesToRemove)} نسخة
                        </strong>
                      </div>
                      <div className="flex items-center justify-between text-slate-400 text-[11px]">
                        <span>النسخ المتوفرة على الرف بعد التحديث:</span>
                        <span className="font-mono text-emerald-400 font-semibold">
                          {Math.max(0, bookToDelete.availableCopies - copiesToRemove)} نسخة
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Mode B: Delete Entire Book */}
            {deleteMode === 'entire' && (
              <div className="space-y-3">
                {bookToDelete.availableCopies < bookToDelete.totalCopies ? (
                  <div className="p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-2xl text-xs text-amber-300 space-y-1.5">
                    <div className="font-bold flex items-center gap-1.5 text-amber-400">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>تنبيه: توجد إعارات نشطة مرتبطة بهذا الكتاب</span>
                    </div>
                    <p className="text-amber-300/90 leading-relaxed">
                      يوجد حالياً {bookToDelete.totalCopies - bookToDelete.availableCopies} نسخة قيد الاستعارة. لا يمكن حذف الكتاب بالكامل من النظام حتى يتم استرجاع كافة النسخ المعارة أولاً منعاً لتعارض السجلات.
                    </p>
                    {bookToDelete.availableCopies > 0 && (
                      <p className="text-xs text-indigo-300 underline cursor-pointer pt-1" onClick={() => setDeleteMode('copies')}>
                        💡 هل تريد فقط استبعاد النسخ المفقودة المتوفرة ({bookToDelete.availableCopies} متوفرة)؟ اضغط هنا.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-xs text-rose-300 leading-relaxed">
                    هل أنت متأكد من رغبتك في حذف كتاب <strong className="text-white">«{bookToDelete.title}»</strong> وجميع نسخه ({bookToDelete.totalCopies} نسخ) نهائياً من الفهرس وقاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء.
                  </div>
                )}
              </div>
            )}

            {/* Modal Actions Footer */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setBookToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors"
              >
                إلغاء
              </button>

              {deleteMode === 'copies' ? (
                <button
                  type="button"
                  disabled={isDeleting || bookToDelete.availableCopies === 0 || copiesToRemove < 1 || copiesToRemove > bookToDelete.availableCopies}
                  onClick={async () => {
                    if (onDeleteBook && bookToDelete) {
                      setIsDeleting(true);
                      const finalReason = removalReason === 'سبب آخر (مخصص)' && customRemovalReason.trim()
                        ? customRemovalReason.trim()
                        : removalReason;
                      try {
                        await onDeleteBook(bookToDelete.id, {
                          copiesCount: copiesToRemove,
                          reason: finalReason,
                        });
                        setBookToDelete(null);
                      } finally {
                        setIsDeleting(false);
                      }
                    }
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-slate-950 font-bold rounded-xl text-xs shadow-md shadow-amber-600/30 flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  {isDeleting ? (
                    <span>جارٍ الاستبعاد...</span>
                  ) : (
                    <>
                      <MinusCircle className="w-3.5 h-3.5" />
                      <span>تأكيد استبعاد {copiesToRemove} {copiesToRemove === 1 ? 'نسخة' : 'نسخ'}</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isDeleting || bookToDelete.availableCopies < bookToDelete.totalCopies}
                  onClick={async () => {
                    if (onDeleteBook && bookToDelete) {
                      setIsDeleting(true);
                      try {
                        await onDeleteBook(bookToDelete.id);
                        setBookToDelete(null);
                      } finally {
                        setIsDeleting(false);
                      }
                    }
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/30 flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  {isDeleting ? (
                    <span>جارٍ الحذف...</span>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>تأكيد حذف الكتاب بالكامل</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Book Form Modal Component
export interface BookFormModalProps {
  initialBook?: PhysicalBook;
  categories: Category[];
  onClose: () => void;
  onSave: (data: any) => void;
  onDelete?: (book: PhysicalBook) => void;
  isOpen?: boolean;
  onBulkImportBooks?: (books: Array<Partial<PhysicalBook> & { categoryName?: string }>) => Promise<boolean | void>;
  onSuccessRefresh?: () => void;
}

export const BookFormModal: React.FC<BookFormModalProps> = ({
  initialBook,
  categories,
  onClose,
  onSave,
  onDelete,
  isOpen = true,
  onBulkImportBooks,
  onSuccessRefresh,
}) => {
  if (!isOpen) return null;

  const [importMode, setImportMode] = useState<'single' | 'bulk_csv'>('single');
  const [title, setTitle] = useState(initialBook?.title || '');
  const [author, setAuthor] = useState(initialBook?.author || '');
  const [publisher, setPublisher] = useState(initialBook?.publisher || '');
  const [publishYear, setPublishYear] = useState(initialBook?.publishYear || new Date().getFullYear());
  const [isbn, setIsbn] = useState(initialBook?.isbn || '');
  const [categoryId, setCategoryId] = useState(initialBook?.categoryId || categories[0]?.id || '');
  const [cabinet, setCabinet] = useState(initialBook?.location.cabinet || 'خزانة أ');
  const [shelf, setShelf] = useState(initialBook?.location.shelf || 'الرف 1');
  const [section, setSection] = useState(initialBook?.location.section || '');
  const [totalCopies, setTotalCopies] = useState(initialBook?.totalCopies || 3);
  const [summary, setSummary] = useState(initialBook?.summary || '');
  const [tags, setTags] = useState(initialBook?.tags.join(', ') || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !author) {
      alert('يرجى ملء عنوان الكتاب واسم المؤلف كحد أدنى.');
      return;
    }

    onSave({
      title,
      author,
      publisher,
      publishYear: Number(publishYear),
      isbn,
      categoryId,
      location: { cabinet, shelf, section },
      totalCopies: Number(totalCopies),
      summary,
      language: 'العربية',
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 z-50 animate-in fade-in duration-200">
      <div
        className={`relative bg-slate-900 border border-slate-800 rounded-3xl w-full ${
          importMode === 'bulk_csv' && !initialBook
            ? 'max-w-4xl max-h-[92vh] flex flex-col'
            : 'max-w-2xl max-h-[90vh] overflow-y-auto'
        } p-5 sm:p-6 space-y-5 shadow-2xl transition-all`}
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              {importMode === 'bulk_csv' && !initialBook ? (
                <FileSpreadsheet className="w-5 h-5" />
              ) : (
                <BookOpen className="w-5 h-5 text-indigo-400" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base sm:text-lg flex items-center gap-2">
                <span>{initialBook ? 'تعديل بيانات الكتاب الورقي' : 'إضافة الكتب الورقية'}</span>
              </h3>
              {!initialBook && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {importMode === 'single'
                    ? 'إضافة كتاب ورقي جديد بشكل فردي إلى الفهرس'
                    : 'استيراد مجموعة كتب دفعة واحدة عبر ملف CSV مع كامل التفاصيل'}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Choice selector: single book vs bulk CSV */}
        {!initialBook && (
          <div className="grid grid-cols-1 sm:grid-cols-2 p-1.5 bg-slate-950/80 rounded-2xl border border-slate-800 gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setImportMode('single')}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                importMode === 'single'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              <span>كتاب فردي</span>
            </button>
            <button
              type="button"
              onClick={() => setImportMode('bulk_csv')}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                importMode === 'bulk_csv'
                  ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-white shadow-lg shadow-amber-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0 text-amber-400" />
              <span>مجموعة كتب باضافة ملف csv فيه كامل المعلومات</span>
            </button>
          </div>
        )}

        {/* Content Body */}
        {importMode === 'bulk_csv' && !initialBook ? (
          <BulkCsvImportContent
            categories={categories}
            onImport={async (books) => {
              if (onBulkImportBooks) {
                await onBulkImportBooks(books);
              }
            }}
            onSuccessRefresh={() => {
              if (onSuccessRefresh) onSuccessRefresh();
            }}
            onClose={onClose}
          />
        ) : (

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-1">عنوان الكتاب *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: مقدمة ابن خلدون"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">المؤلف / المحقق *</label>
              <input
                type="text"
                required
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="مثال: عبد الرحمن بن خلدون"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-1">القسم / المادة *</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">دار النشر</label>
              <input
                type="text"
                value={publisher}
                onChange={(e) => setPublisher(e.target.value)}
                placeholder="مثال: دار المعارف"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">عدد النسخ الإجمالي *</label>
              <input
                type="number"
                min="1"
                required
                value={totalCopies}
                onChange={(e) => setTotalCopies(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Shelf Location fields */}
          <div className="p-4 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-3">
            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-indigo-400" />
              تحديد الموقع المادي (الخزانة والرف)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 text-[11px] mb-1">الخزانة</label>
                <input
                  type="text"
                  value={cabinet}
                  onChange={(e) => setCabinet(e.target.value)}
                  placeholder="مثال: خزانة التاريخ (أ)"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 text-[11px] mb-1">الرف</label>
                <input
                  type="text"
                  value={shelf}
                  onChange={(e) => setShelf(e.target.value)}
                  placeholder="مثال: الرف الثاني"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 text-[11px] mb-1">القسم الداخلي (اختياري)</label>
                <input
                  type="text"
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  placeholder="مثال: قسم المراجع الكبرى"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-100"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-1">الرقم المعياري الدولي (ISBN)</label>
              <input
                type="text"
                value={isbn}
                onChange={(e) => setIsbn(e.target.value)}
                placeholder="978-..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">الكلمات الدلالية (مفصولة بفواصل)</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="تاريخ, فلسفة, مراجع"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">نبذة عن الكتاب</label>
            <textarea
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="وصف مختصر لمحتوى الكتاب وأهميته المنهجية..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
            {initialBook && onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(initialBook)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                title="حذف هذا الكتاب نهائياً من الفهرس"
              >
                <Trash2 className="w-4 h-4" />
                <span>حذف الكتاب من الفهرس</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold shadow-lg shadow-indigo-600/30 cursor-pointer"
              >
                حفظ في الفهرس
              </button>
            </div>
          </div>
        </form>
        )}
      </div>
    </div>
  );
};
