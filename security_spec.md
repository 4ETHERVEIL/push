# Firestore Security Specification

## 1. Data Invariants
- `/broadcasts/{broadcastId}` documents MUST only be created, updated, or deleted by a verified admin (`isAdmin()`, verified bootstrap email, GitHub bootstrap ID `229562872` via `github.com` provider, or `/admins/{uid}` registry).
- Public clients (web and APK) can only `get` or `list` `/broadcasts` documents where `active == true`; inactive/archived broadcasts are restricted to admins.
- `/broadcasts` documents MUST NOT contain PII (`email`, phone, etc.) and MUST strictly enforce `kind`, `variant`, field sizes, `https://` action URLs, immutable `authorUid`/`createdAt`, and server timestamps (`request.time`).
- `/admins/{adminId}` documents contain admin `email` (PII) and MUST only be readable by the matching user (`uid == adminId`) or an existing admin, and writable exclusively by an existing admin (`isAdmin()`).

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated client creates a `/broadcasts/test1` document.
2. Signed-in non-admin user creates a `/broadcasts/test2` document.
3. Unverified-email user claiming admin email creates `/broadcasts/test3`.
4. Admin creates `/broadcasts/test4` with a shadow field `{ isPinned: true }`.
5. Admin creates `/broadcasts/test5` with `authorUid` set to another user's UID.
6. Admin creates `/broadcasts/test6` with a spoofed past/future `createdAt` timestamp (not `request.time`).
7. Admin creates `/broadcasts/test7` with `actionUrl: "javascript:alert(1)"`.
8. Admin creates `/broadcasts/test8` with a >1000-char `message` or >120-char `title`.
9. Admin creates `/broadcasts/invalid.id/foo` or a 200-char document ID failing `isValidId`.
10. Admin updates `/broadcasts/test1` and mutates immutable `createdAt` or `authorUid`.
11. Unauthenticated or non-admin user executes `list` on `/broadcasts` without `active == true` constraint (fetching inactive drafts).
12. Non-admin signed-in user creates `/admins/{ownUid}` to self-assign admin role, or reads another admin's `/admins/{otherUid}` document.
