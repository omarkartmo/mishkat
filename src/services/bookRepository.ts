/**
 * Mishkat Central Server Book Repository (Phase 1.7.3-B)
 * Provides server-authoritative Physical and Digital Book data access and mutations via REST API.
 */

import { apiClient, ApiError, ApiResponse } from './apiClient';
import { PhysicalBook, DigitalBook } from '../types/library';

export interface BookQueryParams {
  type?: 'physical' | 'digital';
  categoryId?: string;
  search?: string;
}

export interface BulkImportResponse {
  count: number;
  message: string;
}

export interface UploadFileResponse {
  fileUrl?: string;
  coverUrl?: string;
  fileSize?: string;
}

export interface SingleUploadResponse {
  bookId: string;
  fileUrl: string;
  filePath: string;
  coverUrl?: string;
  fileSize: string;
  fileSizeMb: number;
  originalName: string;
  fileHash: string;
  sha256: string;
  format: 'pdf' | 'epub';
}

export class BookRepository {
  /**
   * Retrieve all physical books from Central Server (GET /api/v1/books?type=physical)
   */
  public async getPhysicalBooks(params?: Omit<BookQueryParams, 'type'>): Promise<{
    success: boolean;
    data?: PhysicalBook[];
    error?: ApiError;
  }> {
    const res = await apiClient.get<PhysicalBook[]>('/books', {
      type: 'physical',
      ...(params?.categoryId && params.categoryId !== 'all' ? { categoryId: params.categoryId } : {}),
      ...(params?.search ? { search: params.search } : {}),
    });

    if (res.success && Array.isArray(res.data)) {
      return {
        success: true,
        data: res.data,
      };
    }

    return {
      success: false,
      error: res.error || {
        code: 'PHYSICAL_BOOKS_FETCH_FAILED',
        message: 'تعذر استرجاع قائمة الكتب الورقية من الخادم المركزي.',
      },
    };
  }

  /**
   * Retrieve all digital books from Central Server (GET /api/v1/books?type=digital)
   */
  public async getDigitalBooks(params?: Omit<BookQueryParams, 'type'>): Promise<{
    success: boolean;
    data?: DigitalBook[];
    error?: ApiError;
  }> {
    const res = await apiClient.get<DigitalBook[]>('/books', {
      type: 'digital',
      ...(params?.categoryId && params.categoryId !== 'all' ? { categoryId: params.categoryId } : {}),
      ...(params?.search ? { search: params.search } : {}),
    });

    if (res.success && Array.isArray(res.data)) {
      return {
        success: true,
        data: res.data,
      };
    }

    return {
      success: false,
      error: res.error || {
        code: 'DIGITAL_BOOKS_FETCH_FAILED',
        message: 'تعذر استرجاع قائمة الكتب الرقمية من الخادم المركزي.',
      },
    };
  }

  /**
   * Retrieve all books (both physical and digital) from Central Server (GET /api/v1/books)
   */
  public async getAllBooks(params?: BookQueryParams): Promise<{
    success: boolean;
    data?: (PhysicalBook | DigitalBook)[];
    error?: ApiError;
  }> {
    const res = await apiClient.get<(PhysicalBook | DigitalBook)[]>('/books', {
      ...(params?.type ? { type: params.type } : {}),
      ...(params?.categoryId && params.categoryId !== 'all' ? { categoryId: params.categoryId } : {}),
      ...(params?.search ? { search: params.search } : {}),
    });

    if (res.success && Array.isArray(res.data)) {
      return {
        success: true,
        data: res.data,
      };
    }

    return {
      success: false,
      error: res.error || {
        code: 'BOOKS_FETCH_FAILED',
        message: 'تعذر استرجاع فهرس الكتب من الخادم المركزي.',
      },
    };
  }

  /**
   * Retrieve single book details by ID from Central Server (GET /api/v1/books/:id)
   */
  public async getBookById(id: string): Promise<{
    success: boolean;
    data?: PhysicalBook | DigitalBook;
    error?: ApiError;
  }> {
    const res = await apiClient.get<PhysicalBook | DigitalBook>(`/books/${id}`);
    if (res.success && res.data) {
      return {
        success: true,
        data: res.data,
      };
    }

    return {
      success: false,
      error: res.error || {
        code: 'BOOK_NOT_FOUND',
        message: 'الكتاب المطلوب غير موجود على الخادم المركزي.',
      },
    };
  }

  /**
   * Create a new Physical Book on Central Server (POST /api/v1/books - Admin/Librarian)
   */
  public async createPhysicalBook(
    book: Omit<PhysicalBook, 'id' | 'addedAt' | 'availableCopies'>
  ): Promise<{
    success: boolean;
    data?: PhysicalBook;
    error?: ApiError;
  }> {
    const res = await apiClient.post<PhysicalBook>('/books', {
      ...book,
      type: 'physical',
    });

    if (res.success && res.data) {
      return {
        success: true,
        data: res.data,
      };
    }

    return {
      success: false,
      error: res.error || {
        code: 'PHYSICAL_BOOK_CREATE_FAILED',
        message: 'فشل إضافة الكتاب الورقي في الخادم المركزي.',
      },
    };
  }

  /**
   * Create a new Digital Book on Central Server (POST /api/v1/books - Admin/Librarian)
   */
  public async createDigitalBook(
    book: Omit<DigitalBook, 'id' | 'addedAt' | 'downloadCount' | 'readCount'>
  ): Promise<{
    success: boolean;
    data?: DigitalBook;
    error?: ApiError;
  }> {
    const res = await apiClient.post<DigitalBook>('/books', {
      ...book,
      type: 'digital',
    });

    if (res.success && res.data) {
      return {
        success: true,
        data: res.data,
      };
    }

    return {
      success: false,
      error: res.error || {
        code: 'DIGITAL_BOOK_CREATE_FAILED',
        message: 'فشل إضافة الكتاب الرقمي في الخادم المركزي.',
      },
    };
  }

  /**
   * Update Physical Book on Central Server (PUT /api/v1/books/:id - Admin/Librarian)
   */
  public async updatePhysicalBook(
    id: string,
    updates: Partial<PhysicalBook>
  ): Promise<{
    success: boolean;
    data?: { message: string };
    error?: ApiError;
  }> {
    const res = await apiClient.put<{ message: string }>(`/books/${id}`, {
      ...updates,
      type: 'physical',
    });

    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }

    return {
      success: false,
      error: res.error || {
        code: 'PHYSICAL_BOOK_UPDATE_FAILED',
        message: 'فشل تحديث بيانات الكتاب الورقي في الخادم المركزي.',
      },
    };
  }

  /**
   * Update Digital Book on Central Server (PUT /api/v1/books/:id - Admin/Librarian)
   */
  public async updateDigitalBook(
    id: string,
    updates: Partial<DigitalBook>
  ): Promise<{
    success: boolean;
    data?: { message: string };
    error?: ApiError;
  }> {
    const res = await apiClient.put<{ message: string }>(`/books/${id}`, {
      ...updates,
      type: 'digital',
    });

    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }

    return {
      success: false,
      error: res.error || {
        code: 'DIGITAL_BOOK_UPDATE_FAILED',
        message: 'فشل تحديث بيانات الكتاب الرقمي في الخادم المركزي.',
      },
    };
  }

  /**
   * Delete Book from Central Server (DELETE /api/v1/books/:id - Admin only)
   */
  public async deleteBook(id: string): Promise<{
    success: boolean;
    data?: { message: string };
    error?: ApiError;
  }> {
    const res = await apiClient.delete<{ message: string }>(`/books/${id}`);
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }

    return {
      success: false,
      error: res.error || {
        code: 'BOOK_DELETE_FAILED',
        message: 'فشل حذف الكتاب من الخادم المركزي.',
      },
    };
  }

  /**
   * Bulk import digital books into Central Server (POST /api/v1/books/bulk - Admin/Librarian)
   */
  public async bulkImportDigitalBooks(
    books: Omit<DigitalBook, 'id' | 'addedAt' | 'downloadCount' | 'readCount'>[]
  ): Promise<{
    success: boolean;
    data?: BulkImportResponse;
    error?: ApiError;
  }> {
    const res = await apiClient.post<BulkImportResponse>('/books/bulk', { books });
    if (res.success && res.data) {
      return {
        success: true,
        data: res.data,
      };
    }

    return {
      success: false,
      error: res.error || {
        code: 'BULK_IMPORT_FAILED',
        message: 'فشل استيراد حزمة الكتب الرقمية إلى الخادم المركزي.',
      },
    };
  }

  /**
   * Upload digital book file or cover image to Central Storage (POST /api/v1/books/upload - Admin/Librarian)
   */
  public async uploadDigitalFile(
    file: File,
    fieldName: 'file' | 'cover' = 'file'
  ): Promise<{
    success: boolean;
    data?: UploadFileResponse;
    error?: ApiError;
  }> {
    const res = await apiClient.uploadFile(file, fieldName);
    if (res.success && res.data) {
      return {
        success: true,
        data: res.data,
      };
    }

    return {
      success: false,
      error: res.error || {
        code: 'FILE_UPLOAD_FAILED',
        message: 'فشل رفع الملف الرقمي إلى مساحة التخزين المركزية.',
      },
    };
  }

  /**
   * Authoritative Single Digital Book Upload (POST /api/v1/books/upload)
   * Realizes the pipeline: File -> FormData -> bookRepository.uploadSingleDigitalBook -> apiClient.uploadFormData()
   */
  public async uploadSingleDigitalBook(
    file: File,
    cover?: File | null
  ): Promise<ApiResponse<SingleUploadResponse>> {
    const formData = new FormData();
    formData.append('file', file);
    if (cover) {
      formData.append('cover', cover);
    }

    return apiClient.uploadFormData<SingleUploadResponse>('/books/upload', formData);
  }

  /**
   * Increment book read count on Central Server (POST /api/v1/books/:id/increment-read)
   */
  public async incrementReadCount(bookId: string): Promise<{
    success: boolean;
    data?: { incremented: boolean };
    error?: ApiError;
  }> {
    const res = await apiClient.post<{ incremented: boolean }>(`/books/${bookId}/increment-read`);
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }

    return {
      success: false,
      error: res.error || {
        code: 'INCREMENT_READ_FAILED',
        message: 'تعذر تسجيل قراءة الكتاب على الخادم المركزي.',
      },
    };
  }

  /**
   * Get secure streaming URL for digital book file (GET /api/v1/books/:id/file)
   */
  public getBookFileUrl(bookId: string): string {
    return `/api/v1/books/${bookId}/file`;
  }

  /**
   * Stage uploaded files on server with auto-extraction and auto-classification (POST /api/v1/books/bulk-stage)
   */
  public async bulkStageFiles(formData: FormData): Promise<ApiResponse<{ totalDiscovered: number; staged: any[] }>> {
    return apiClient.uploadFormData<{ totalDiscovered: number; staged: any[] }>('/books/bulk-stage', formData);
  }

  /**
   * Scan server directory (or configured root URL) for PDF/EPUB books (POST /api/v1/books/bulk-scan)
   */
  public async bulkScanDirectory(folderPath?: string): Promise<ApiResponse<{ rootScanned: string; totalDiscovered: number; items: any[] }>> {
    return apiClient.post<{ rootScanned: string; totalDiscovered: number; items: any[] }>('/books/bulk-scan', { folderPath });
  }

  /**
   * Safely import staged digital books into central library (POST /api/v1/books/bulk-import)
   */
  public async bulkImportStagedItems(items: any[]): Promise<ApiResponse<{
    total: number;
    imported: number;
    skipped: number;
    failed: number;
    details: any[];
    message: string;
  }>> {
    return apiClient.post('/books/bulk-import', { items });
  }

  /**
   * Fetch digital book content as Base64 JSON (immune to all browser download managers like IDM)
   */
  public async fetchBookContent(bookId: string): Promise<ApiResponse<{ id: string; title: string; format: string; sizeBytes: number; base64: string }>> {
    return apiClient.get(`/books/${encodeURIComponent(bookId)}/content`);
  }

  /**
   * Fetch digital book file as authorized Blob (passes JWT Authorization header via apiClient)
   */
  public async fetchBookFileBlob(bookId: string): Promise<ApiResponse<Blob>> {
    return apiClient.postBlob(`/books/${encodeURIComponent(bookId)}/stream`, {}, {
      'X-Mishkat-Viewer': 'true',
      'X-Requested-With': 'XMLHttpRequest',
    });
  }
}

export const bookRepository = new BookRepository();
