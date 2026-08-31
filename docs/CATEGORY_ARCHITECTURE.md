# CATEGORY_ARCHITECTURE.md
# Mishkat Central Server Category Architecture (Phase 1.7.3-A)

## 1. Overview & Data Ownership

In accordance with Phase 1.7.3-A, **Categories** are 100% server-authoritative. The client application (Electron student/admin workstation) owns no category database and performs no persistent local caching.

```text
┌─────────────────────────────────────────────────────────────┐
│                    React Client Workstation                 │
│  - Ephemeral React State (`categories`, `isCategoriesLoading`)│
│  - CategoryManagerView (Admin UI)                           │
│  - Header / Library / Search Viewers (Category Filters)     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                        CategoryRepository
                               │
                           apiClient
                   (JWT Bearer Authorization)
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   Mishkat Central Server                    │
│  - GET    /api/v1/categories                                │
│  - POST   /api/v1/categories                                │
│  - PUT    /api/v1/categories/:id                            │
│  - DELETE /api/v1/categories/:id                            │
│  - POST   /api/v1/categories/:id/reassign-delete            │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL Persistent Database                 │
│  - Table: categories                                        │
│  - Table: books (physical & digital - FK category_id)       │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. API Contract & Endpoints

| Method | Route | Access | Request Body | Response Body | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GET** | `/api/v1/categories` | Public / Authenticated | None | `Category[]` | Retrieves all active library categories from Central Server. |
| **POST** | `/api/v1/categories` | Admin Only | `{ name, nameEn?, description?, color?, iconName? }` | `Category` | Creates a new category record with server-generated ID. |
| **PUT** | `/api/v1/categories/:id` | Admin Only | `{ name?, nameEn?, description?, color?, iconName? }` | `{ message: string }` | Updates existing category attributes. |
| **POST** | `/api/v1/categories/:id/reassign-delete` | Admin Only | `{ targetCategoryId: string }` | `{ message: string }` | Atomically reassigns all physical and digital books to `targetCategoryId` and deletes the category within a PostgreSQL transaction. |
| **DELETE** | `/api/v1/categories/:id` | Admin Only | Optional `{ targetCategoryId?: string }` | `{ message: string }` | Deletes category (supports optional reassignment target in body). |

---

## 3. Client Architecture & CategoryRepository

The frontend accesses category resources strictly via `src/services/categoryRepository.ts`:

```typescript
export class CategoryRepository {
  public async getCategories(): Promise<{ success: boolean; data?: Category[]; error?: ApiError }>;
  public async createCategory(payload: CreateCategoryPayload): Promise<{ success: boolean; data?: Category; error?: ApiError }>;
  public async updateCategory(id: string, payload: UpdateCategoryPayload): Promise<{ success: boolean; data?: { message: string }; error?: ApiError }>;
  public async reassignAndDeleteCategory(categoryId: string, targetCategoryId: string): Promise<{ success: boolean; data?: { message: string }; error?: ApiError }>;
  public async deleteCategory(id: string, targetCategoryId?: string): Promise<{ success: boolean; data?: { message: string }; error?: ApiError }>;
}
```

### Key Architectural Guarantees:
1. **Server Authority**: React state holds categories in memory purely for display rendering. No `localStorage` or disk caching is used for categories.
2. **Atomic Reclassification**: When deleting a category that contains books, the client calls `reassignAndDeleteCategory(id, targetId)` which invokes the backend atomic transaction. The server guarantees zero orphaned books.
3. **Graceful Error Handling**: If the Central Server is unreachable, `categoryError` state displays a warning banner in `CategoryManagerView` with an explicit retry trigger (`onRefresh`), never falling back to fake mock data.
4. **Clean Decoupling**: Category synchronization has been stripped from `StorageService.syncWithServer()`, and legacy methods in `storageService.ts` are marked `@deprecated`.
