# AUTH_ARCHITECTURE.md
# Mishkat Central Server — Authentication & Session Architecture (Phase 1.7.2)

## 1. Architectural Philosophy & Principles

In accordance with the Mishkat centralized client-server model:

1. **Server Authoritative**: The Central Mishkat Server is the sole entity authorized to verify credentials, hash passwords, manage account locks, and issue authentication tokens.
2. **Zero Client-Side Databases for Auth**: The client application (React SPA / Electron renderer) does not maintain local password hashes, local user tables, or local mock credentials.
3. **No Silent Local Fallback**: If the Central Server is unreachable, authentication strictly fails with a clear network message (`تعذر الاتصال بالخادم المركزي`). The client never authenticates offline against stale memory or local databases.
4. **Stateless JWT Session Verification**: Client authentication state is governed by a digitally signed JWT token issued by the Central Server and verified on every server request.

---

## 2. End-to-End Authentication Flow

```text
+-----------------------------------------------------------------------------------+
|                                  CLIENT LAYER                                     |
|                                                                                   |
|  +--------------------+         +--------------------+                            |
|  |     LoginView      | ------> |    AuthContext     | (useAuth React Hook)       |
|  +--------------------+         +--------------------+                            |
|                                           |                                       |
|                                           v                                       |
|                                 +--------------------+                            |
|                                 |   AuthRepository   | (Data Access Layer)        |
|                                 +--------------------+                            |
|                                           |                                       |
|                                           v                                       |
|                                 +--------------------+                            |
|                                 |     ApiClient      | (HTTP & 401 Interceptor)   |
|                                 +--------------------+                            |
+-------------------------------------------|---------------------------------------+
                                            |
                         HTTPS / LAN HTTP   |  JSON Payload / Bearer Token
                                            v
+-----------------------------------------------------------------------------------+
|                              CENTRAL SERVER LAYER                                 |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |                         Express REST API Routes                             |  |
|  |                                                                             |  |
|  |  POST /api/v1/auth/login   ---> authRateLimiter -> bcrypt.compare -> JWT    |  |
|  |  GET  /api/v1/auth/me      ---> authenticateToken -> DB User Lookup         |  |
|  |  POST /api/v1/auth/logout  ---> authenticateToken -> Audit Log              |  |
|  +-----------------------------------------------------------------------------+  |
|                                           |                                       |
|                                           v                                       |
|                               +-----------------------+                           |
|                               |  PostgreSQL Database  |                           |
|                               |  (users table & hash) |                           |
|                               +-----------------------+                           |
+-----------------------------------------------------------------------------------+
```

---

## 3. Component & Module Breakdown

### 3.1. `src/services/apiClient.ts`
* **Role**: Central HTTP transport client with built-in header management, response serialization, and 401 interceptor.
* **Token Management**:
  * Persists JWT in browser storage (`mishkat_jwt_token`).
  * Attaches `Authorization: Bearer <token>` to all authenticated requests.
* **401 Unauthorized Interception**:
  * Registers event subscribers via `onUnauthorized(handler)`.
  * When any protected endpoint returns HTTP 401, triggers automatic session cleanup in `AuthContext`.
* **Network Error Normalization**:
  * Replaces legacy fallback messaging with explicit network failure errors:
  * `"تعذر الاتصال بالخادم المركزي. يرجى التحقق من اتصال الشبكة والمحاولة مرة أخرى."`

### 3.2. `src/services/authRepository.ts`
* **Role**: Isolated Data Access Layer (DAL) dedicated purely to authentication endpoints.
* **Methods**:
  * `login({ registrationNumber, password })`: Calls `POST /api/v1/auth/login`. Upon 200 OK, sets token in `apiClient`.
  * `getCurrentUser()`: Calls `GET /api/v1/auth/me` to validate token and retrieve active user profile.
  * `logout()`: Calls `POST /api/v1/auth/logout` on Central Server and clears client token.

### 3.3. `src/context/AuthContext.tsx`
* **Role**: React Context providing reactive authentication state throughout the component tree.
* **State**:
  * `user: User | null`: Active authenticated user object.
  * `isAuthenticated: boolean`: Boolean status indicating verified session.
  * `isLoading: boolean`: Session initialization check state on app boot.
* **Lifecycle**:
  * On mount, inspects stored token and invokes `authRepository.getCurrentUser()`.
  * If valid, initializes user session.
  * If invalid/expired (or on 401 signal), purges session and redirects to `LoginView`.

### 3.4. `src/components/auth/LoginView.tsx`
* **Role**: Presentation gateway for student and administrator logins.
* **Behavior**:
  * Fully asynchronous form submission invoking `onLogin(identifier, password)`.
  * Displays server-provided lockout countdowns (`lockoutSeconds`), blocking alerts, and field validations.

### 3.5. `src/App.tsx`
* **Role**: Main application orchestrator.
* **Integration**:
  * Reads `useAuth()` state.
  * Shows a clean loading screen while verifying session with Central Server.
  * Conditionally renders `LoginView` when `!isAuthenticated`.
  * Connects `onLogout` directly to `AuthContext.logout()`.

---

## 4. Token & Session Lifecycle

1. **Login Request**:
   * Client posts credentials to `POST /api/v1/auth/login`.
   * Server executes bcrypt comparison against stored hash in PostgreSQL.
   * If valid, server signs JWT with `serverConfig.jwtSecret` (7-day expiry) containing `userId`, `registrationNumber`, and `role`.
2. **Session Persistence**:
   * Token is saved in `localStorage['mishkat_jwt_token']`.
3. **Session Rehydration**:
   * When client launches or reloads, `AuthContext` requests `GET /api/v1/auth/me`.
   * Server validates JWT signature and retrieves active user profile.
4. **Session Expiry / Revocation**:
   * If server rejects token with HTTP 401, `apiClient` triggers `onUnauthorizedListeners`.
   * `AuthContext` clears `user` state and resets `isAuthenticated` to `false`.
5. **Manual Logout**:
   * User clicks logout in header.
   * `authRepository.logout()` issues `POST /api/v1/auth/logout` for server audit logging, then removes the local token.

---

## 5. Security Audit & Hardening Matrix

| Security Domain | Mitigation in Phase 1.7.2 |
| :--- | :--- |
| **Credential Storage** | Zero passwords or hashes stored in frontend bundles or client storage. |
| **Password Verification** | Server-side bcrypt execution only (`server/routes/auth.routes.ts`). |
| **Secret Protection** | JWT signing key resides strictly in server environment (`process.env.JWT_SECRET`). |
| **Brute-Force Defense** | Server rate limiting (`authRateLimiter(15)`) and user blocking status checks. |
| **Legacy Code Isolation** | All auth methods in `StorageService` marked `@deprecated` and disconnected from UI login flows. |
