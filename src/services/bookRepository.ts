/**
 * Mishkat Central Server Book Repository (Phase 1.7.3-B)
 * Provides server-authoritative Physical and Digital Book data access and mutations via REST API.
 */

import { apiClient, ApiError } from './apiClient';
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
}

export const bookRepository = new BookRepository();
