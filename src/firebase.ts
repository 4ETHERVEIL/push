import { initializeApp } from "firebase/app";
import { getAuth, GithubAuthProvider, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, doc, getDocFromServer, Timestamp } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const githubProvider = new GithubAuthProvider();
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export const firebaseProjectId = firebaseConfig.projectId;
export const firebaseAuthDomain = firebaseConfig.authDomain;
export const ADMIN_BOOTSTRAP_EMAIL = "afrigaming08@gmail.com";
export const ADMIN_BOOTSTRAP_GITHUB_ID = "229562872";
export const ADMIN_BOOTSTRAP_GITHUB_LOGIN = "4ETHERVEIL";

export const BROADCAST_LIMITS = {
  TITLE_MIN: 1,
  TITLE_MAX: 120,
  MESSAGE_MIN: 1,
  MESSAGE_MAX: 1000,
  ACTION_LABEL_MAX: 40,
  ACTION_URL_MAX: 300,
  SENDER_NAME_MIN: 1,
  SENDER_NAME_MAX: 50,
} as const;

export type BroadcastKind = "toast" | "dialog" | "notification";
export type BroadcastVariant = "info" | "success" | "warning" | "error";

export interface BroadcastItem {
  id: string;
  kind: BroadcastKind;
  variant: BroadcastVariant;
  title: string;
  message: string;
  actionLabel: string;
  actionUrl: string;
  senderName: string;
  active: boolean;
  authorUid: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface AdminUserItem {
  id: string;
  uid: string;
  email: string;
  role: "admin";
  createdAt?: Timestamp | null;
}

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

testConnection();
