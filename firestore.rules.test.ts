/**
 * Security Rule Invariant Verification Suite (Dirty Dozen Reference)
 * Evaluates the 12 adversarial payloads against the Firestore rules contract.
 */
export interface RuleTestCase {
  id: number;
  name: string;
  collection: string;
  operation: "create" | "update" | "delete" | "get" | "list";
  auth: { uid?: string; email?: string; email_verified?: boolean } | null;
  payload?: Record<string, unknown>;
  expected: "PERMISSION_DENIED";
}

export const DIRTY_DOZEN_CASES: RuleTestCase[] = [
  {
    id: 1,
    name: "Unauthenticated broadcast create",
    collection: "broadcasts/b1",
    operation: "create",
    auth: null,
    payload: { kind: "toast", variant: "info", title: "Hi", message: "Test", active: true },
    expected: "PERMISSION_DENIED",
  },
  {
    id: 2,
    name: "Non-admin broadcast create",
    collection: "broadcasts/b2",
    operation: "create",
    auth: { uid: "user_1", email: "attacker@example.com", email_verified: true },
    payload: { kind: "toast", variant: "info", title: "Hi", message: "Test", active: true },
    expected: "PERMISSION_DENIED",
  },
  {
    id: 3,
    name: "Unverified email spoofing admin email",
    collection: "broadcasts/b3",
    operation: "create",
    auth: { uid: "spoof_1", email: "afrigaming08@gmail.com", email_verified: false },
    payload: { kind: "dialog", variant: "warning", title: "Spoof", message: "Test", active: true },
    expected: "PERMISSION_DENIED",
  },
  {
    id: 4,
    name: "Shadow field injection on broadcast create",
    collection: "broadcasts/b4",
    operation: "create",
    auth: { uid: "admin_1", email: "afrigaming08@gmail.com", email_verified: true },
    payload: { kind: "toast", variant: "info", title: "Hi", message: "Test", isPinned: true },
    expected: "PERMISSION_DENIED",
  },
  {
    id: 5,
    name: "Identity spoofing authorUid",
    collection: "broadcasts/b5",
    operation: "create",
    auth: { uid: "admin_1", email: "afrigaming08@gmail.com", email_verified: true },
    payload: { authorUid: "other_uid", kind: "toast", variant: "info", title: "Hi", message: "Test" },
    expected: "PERMISSION_DENIED",
  },
  {
    id: 6,
    name: "Client-forged createdAt timestamp",
    collection: "broadcasts/b6",
    operation: "create",
    auth: { uid: "admin_1", email: "afrigaming08@gmail.com", email_verified: true },
    payload: { createdAt: "2020-01-01T00:00:00Z" },
    expected: "PERMISSION_DENIED",
  },
  {
    id: 7,
    name: "Malicious javascript: actionUrl",
    collection: "broadcasts/b7",
    operation: "create",
    auth: { uid: "admin_1", email: "afrigaming08@gmail.com", email_verified: true },
    payload: { actionUrl: "javascript:alert(1)" },
    expected: "PERMISSION_DENIED",
  },
  {
    id: 8,
    name: "Oversized message > 1000 chars",
    collection: "broadcasts/b8",
    operation: "create",
    auth: { uid: "admin_1", email: "afrigaming08@gmail.com", email_verified: true },
    payload: { message: "a".repeat(1001) },
    expected: "PERMISSION_DENIED",
  },
  {
    id: 9,
    name: "Oversized document ID > 128 chars",
    collection: `broadcasts/${"x".repeat(129)}`,
    operation: "create",
    auth: { uid: "admin_1", email: "afrigaming08@gmail.com", email_verified: true },
    payload: { title: "Bad ID" },
    expected: "PERMISSION_DENIED",
  },
  {
    id: 10,
    name: "Mutating immutable createdAt on update",
    collection: "broadcasts/b1",
    operation: "update",
    auth: { uid: "admin_1", email: "afrigaming08@gmail.com", email_verified: true },
    payload: { createdAt: "2025-01-01T00:00:00Z" },
    expected: "PERMISSION_DENIED",
  },
  {
    id: 11,
    name: "Public list query attempting to scrape inactive broadcasts",
    collection: "broadcasts",
    operation: "list",
    auth: null,
    expected: "PERMISSION_DENIED",
  },
  {
    id: 12,
    name: "Self-assigning admin role in /admins",
    collection: "admins/user_1",
    operation: "create",
    auth: { uid: "user_1", email: "attacker@example.com", email_verified: true },
    payload: { uid: "user_1", email: "attacker@example.com", role: "admin" },
    expected: "PERMISSION_DENIED",
  },
];
