/**
 * Mishkat Central Server Note Repository
 * Provides server-authoritative student notes data access and mutations via REST API.
 */

import { apiClient, ApiError } from './apiClient';
import { StudentNote } from '../types/library';

export class NoteRepository {
  /**
   * Fetch student notes from Central Server (GET /api/v1/notes)
   * Automatically filtered by student user role on server.
   */
  public async getNotes(studentId?: string): Promise<{
    success: boolean;
    data?: StudentNote[];
    error?: ApiError;
  }> {
    const endpoint = studentId ? `/notes?studentId=${encodeURIComponent(studentId)}` : '/notes';
    const res = await apiClient.get<StudentNote[]>(endpoint);
    if (res.success && Array.isArray(res.data)) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'NOTES_FETCH_FAILED',
        message: 'تعذر استرجاع الفوائد والتدوينات من الخادم المركزي.',
      },
    };
  }

  /**
   * Create or update a student note (POST /api/v1/notes)
   */
  public async saveNote(note: Partial<StudentNote> & { content: string; bookId: string; bookTitle: string }): Promise<{
    success: boolean;
    data?: StudentNote;
    error?: ApiError;
  }> {
    const res = await apiClient.post<StudentNote>('/notes', note);
    if (res.success && res.data) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'NOTE_SAVE_FAILED',
        message: 'تعذر حفظ الفائدة في الخادم المركزي.',
      },
    };
  }

  /**
   * Delete a student note (DELETE /api/v1/notes/:id)
   */
  public async deleteNote(id: string): Promise<{
    success: boolean;
    data?: any;
    error?: ApiError;
  }> {
    const res = await apiClient.delete(`/notes/${id}`);
    if (res.success) {
      return {
        success: true,
        data: res.data,
      };
    }
    return {
      success: false,
      error: res.error || {
        code: 'NOTE_DELETE_FAILED',
        message: 'تعذر حذف الفائدة من الخادم المركزي.',
      },
    };
  }
}

export const noteRepository = new NoteRepository();
