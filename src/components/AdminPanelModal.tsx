import React, { useState, useEffect } from "react";
import { User, signInWithPopup, signOut } from "firebase/auth";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { motion } from "framer-motion";
import {
  Shield,
  Send,
  Bell,
  MessageSquare,
  AlertTriangle,
  Trash2,
  Power,
  RotateCcw,
  LogOut,
  X,
  UserPlus,
  Eye,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  auth,
  db,
  googleProvider,
  ADMIN_BOOTSTRAP_EMAIL,
  BROADCAST_LIMITS,
  BroadcastItem,
  BroadcastKind,
  BroadcastVariant,
  AdminUserItem,
  OperationType,
  handleFirestoreError,
} from "../firebase";
import { Button, Input } from "./UI";
import { cn } from "../lib/utils";

export function AdminPanelModal({
  isOpen,
  onClose,
  firebaseUser,
  isAdmin,
  isNativeApk,
  onPreviewBroadcast,
}: {
  isOpen: boolean;
  onClose: () => void;
  firebaseUser: User | null;
  isAdmin: boolean;
  isNativeApk: boolean;
  onPreviewBroadcast: (item: BroadcastItem) => void;
}) {
  const [activeTab, setActiveTab] = useState<"compose" | "history" | "admins">("compose");
  const [kind, setKind] = useState<BroadcastKind>("toast");
  const [variant, setVariant] = useState<BroadcastVariant>("info");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [actionLabel, setActionLabel] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [senderName, setSenderName] = useState("Admin");

  const [submitting, setSubmitting] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [allBroadcasts, setAllBroadcasts] = useState<BroadcastItem[]>([]);
  const [admins, setAdmins] = useState<AdminUserItem[]>([]);
  const [newAdminUid, setNewAdminUid] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");

  useEffect(() => {
    if (!isOpen || !isAdmin) {
      setAllBroadcasts([]);
      setAdmins([]);
      return;
    }

    const unsubBroadcasts = onSnapshot(
      collection(db, "broadcasts"),
      (snap) => {
        const items: BroadcastItem[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<BroadcastItem, "id">),
        }));
        items.sort((a, b) => {
          const tA = a.updatedAt?.toMillis?.() || 0;
          const tB = b.updatedAt?.toMillis?.() || 0;
          return tB - tA;
        });
        setAllBroadcasts(items);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, "broadcasts");
      }
    );

    const unsubAdmins = onSnapshot(
      collection(db, "admins"),
      (snap) => {
        const list: AdminUserItem[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AdminUserItem, "id">),
        }));
        setAdmins(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, "admins");
      }
    );

    return () => {
      unsubBroadcasts();
      unsubAdmins();
    };
  }, [isOpen, isAdmin]);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    setFeedback(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Google Sign-In Error:", err);
      const msg = String(err?.message || "");
      if (msg.includes("popup-blocked")) {
        setFeedback({ type: "error", text: "Popup login diblokir browser. Izinkan popup lalu coba lagi." });
      } else if (isNativeApk) {
        setFeedback({
          type: "error",
          text: "Login Google Admin tidak didukung di dalam WebView APK. Buka versi web (https://gitpush.axeoncore.my.id) di browser untuk mengirim siaran ke semua APK.",
        });
      } else {
        setFeedback({ type: "error", text: `Gagal login Google: ${err?.message || "Coba lagi"}` });
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleLogout = async () => {
    await signOut(auth);
    setFeedback(null);
  };

  const validateForm = (): string | null => {
    const t = title.trim();
    const m = message.trim();
    const s = senderName.trim();
    const al = actionLabel.trim();
    const au = actionUrl.trim();

    if (t.length < BROADCAST_LIMITS.TITLE_MIN || t.length > BROADCAST_LIMITS.TITLE_MAX) {
      return `Judul wajib diisi (1–${BROADCAST_LIMITS.TITLE_MAX} karakter).`;
    }
    if (m.length < BROADCAST_LIMITS.MESSAGE_MIN || m.length > BROADCAST_LIMITS.MESSAGE_MAX) {
      return `Isi pesan wajib diisi (1–${BROADCAST_LIMITS.MESSAGE_MAX} karakter).`;
    }
    if (s.length < BROADCAST_LIMITS.SENDER_NAME_MIN || s.length > BROADCAST_LIMITS.SENDER_NAME_MAX) {
      return `Nama pengirim wajib diisi (1–${BROADCAST_LIMITS.SENDER_NAME_MAX} karakter).`;
    }
    if (al.length > BROADCAST_LIMITS.ACTION_LABEL_MAX) {
      return `Label tombol maksimal ${BROADCAST_LIMITS.ACTION_LABEL_MAX} karakter.`;
    }
    if (au.length > BROADCAST_LIMITS.ACTION_URL_MAX) {
      return `URL tombol maksimal ${BROADCAST_LIMITS.ACTION_URL_MAX} karakter.`;
    }
    if (au && !au.startsWith("https://")) {
      return "URL tombol aksi harus diawali dengan https://";
    }
    return null;
  };

  const handlePreview = () => {
    const err = validateForm();
    if (err) {
      setFeedback({ type: "error", text: err });
      return;
    }
    setFeedback(null);
    onPreviewBroadcast({
      id: `preview-${Date.now()}`,
      kind,
      variant,
      title: title.trim(),
      message: message.trim(),
      actionLabel: actionLabel.trim(),
      actionUrl: actionUrl.trim(),
      senderName: senderName.trim() || "Admin",
      active: true,
      authorUid: firebaseUser?.uid || "preview",
    });
  };

  const handlePublish = async () => {
    if (!firebaseUser || !isAdmin) return;
    const validationErr = validateForm();
    if (validationErr) {
      setFeedback({ type: "error", text: validationErr });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    const payload = {
      kind,
      variant,
      title: title.trim(),
      message: message.trim(),
      actionLabel: actionLabel.trim(),
      actionUrl: actionUrl.trim(),
      senderName: senderName.trim() || "Admin",
      active: true,
      authorUid: firebaseUser.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, "broadcasts"), payload);
      setTitle("");
      setMessage("");
      setActionLabel("");
      setActionUrl("");
      setFeedback({
        type: "success",
        text: `${kind.toUpperCase()} berhasil disiarkan secara live ke semua pengguna!`,
      });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.CREATE, "broadcasts");
      } catch (wrappedErr: any) {
        setFeedback({ type: "error", text: `Gagal menyiarkan: ${wrappedErr.message}` });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (item: BroadcastItem) => {
    try {
      await updateDoc(doc(db, "broadcasts", item.id), {
        active: !item.active,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `broadcasts/${item.id}`);
      } catch (wrappedErr: any) {
        setFeedback({ type: "error", text: `Gagal memperbarui status: ${wrappedErr.message}` });
      }
    }
  };

  const handleRetrigger = async (item: BroadcastItem) => {
    try {
      await updateDoc(doc(db, "broadcasts", item.id), {
        active: true,
        updatedAt: serverTimestamp(),
      });
      setFeedback({ type: "success", text: `Siaran "${item.title}" dipicu ulang ke semua pengguna.` });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `broadcasts/${item.id}`);
      } catch (wrappedErr: any) {
        setFeedback({ type: "error", text: `Gagal memicu ulang: ${wrappedErr.message}` });
      }
    }
  };

  const handleDeleteBroadcast = async (id: string) => {
    try {
      await deleteDoc(doc(db, "broadcasts", id));
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, `broadcasts/${id}`);
      } catch (wrappedErr: any) {
        setFeedback({ type: "error", text: `Gagal menghapus siaran: ${wrappedErr.message}` });
      }
    }
  };

  const handleAddAdmin = async () => {
    const uid = newAdminUid.trim();
    const email = newAdminEmail.trim();
    if (!uid || !/^[a-zA-Z0-9_-]+$/.test(uid)) {
      setFeedback({ type: "error", text: "UID Admin tidak valid (hanya huruf, angka, - dan _)." });
      return;
    }
    if (!email || !email.includes("@")) {
      setFeedback({ type: "error", text: "Masukkan email Google yang valid." });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      await setDoc(doc(db, "admins", uid), {
        uid,
        email,
        role: "admin",
        createdAt: serverTimestamp(),
      });
      setNewAdminUid("");
      setNewAdminEmail("");
      setFeedback({ type: "success", text: `Admin ${email} berhasil ditambahkan.` });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.CREATE, `admins/${uid}`);
      } catch (wrappedErr: any) {
        setFeedback({ type: "error", text: `Gagal menambah admin: ${wrappedErr.message}` });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveAdmin = async (uid: string) => {
    try {
      await deleteDoc(doc(db, "admins", uid));
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, `admins/${uid}`);
      } catch (wrappedErr: any) {
        setFeedback({ type: "error", text: `Gagal menghapus admin: ${wrappedErr.message}` });
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.16 }}
        className="max-w-3xl w-full max-h-[90vh] flex flex-col bg-white border-4 border-black shadow-[12px_12px_0px_rgba(0,0,0,1)] overflow-hidden"
      >
        {/* Top Bar */}
        <div className="p-4 bg-black text-white flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Shield size={20} className="text-[#FFD600] shrink-0" />
            <h3 className="font-black uppercase text-sm tracking-widest truncate">
              Admin Panel Siaran
            </h3>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {firebaseUser && (
              <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-gray-300">
                <span className="truncate max-w-[180px]">{firebaseUser.email}</span>
                <button
                  onClick={handleGoogleLogout}
                  className="p-1.5 border border-gray-600 hover:bg-white hover:text-black transition-colors"
                  title="Keluar Akun Admin"
                >
                  <LogOut size={14} />
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="hover:text-red-400 transition-colors p-1"
              aria-label="Tutup Admin Panel"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#FAFAFA]">
          {feedback && (
            <div
              className={cn(
                "p-3 border-4 border-black flex items-center justify-between gap-2 text-xs font-black",
                feedback.type === "success" ? "bg-green-200 text-black" : "bg-red-200 text-red-900"
              )}
            >
              <div className="flex items-center gap-2">
                {feedback.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{feedback.text}</span>
              </div>
              <button onClick={() => setFeedback(null)} className="shrink-0">
                <X size={14} />
              </button>
            </div>
          )}

          {!firebaseUser ? (
            <div className="bg-white border-4 border-black p-6 shadow-[6px_6px_0px_black] text-center space-y-4">
              <div className="w-14 h-14 bg-[#FFD600] border-4 border-black mx-auto flex items-center justify-center">
                <Shield size={28} className="text-black" />
              </div>
              <div className="space-y-2">
                <h4 className="text-lg font-black uppercase">Verifikasi Akun Admin</h4>
                <p className="text-xs font-bold text-gray-600 max-w-md mx-auto">
                  Masuk dengan akun Google Admin ({ADMIN_BOOTSTRAP_EMAIL}) untuk mengirim Toast, Dialog, dan Notifikasi live ke seluruh pengguna Web dan APK.
                </p>
              </div>
              {isNativeApk && (
                <div className="p-3 bg-yellow-100 border-2 border-black text-xs font-bold text-left text-gray-800">
                  Catatan APK: Login Google Admin disarankan dibuka melalui browser web (https://gitpush.axeoncore.my.id) agar popup Google OAuth tidak diblokir WebView Android.
                </div>
              )}
              <Button
                variant="yellow"
                onClick={handleGoogleLogin}
                disabled={authLoading}
                className="w-full sm:w-auto text-sm py-3"
              >
                {authLoading ? "MEMPROSES LOGIN..." : "MASUK ADMIN DENGAN GOOGLE"}
              </Button>
            </div>
          ) : !isAdmin ? (
            <div className="bg-red-50 border-4 border-black p-6 shadow-[6px_6px_0px_black] text-center space-y-4">
              <AlertTriangle size={36} className="mx-auto text-red-600" />
              <div className="space-y-1">
                <h4 className="text-base font-black uppercase text-red-800">
                  Akses Ditolak
                </h4>
                <p className="text-xs font-bold text-gray-700">
                  Akun <span className="underline">{firebaseUser.email}</span> tidak terdaftar sebagai Admin.
                </p>
                <p className="text-[11px] font-mono text-gray-500">
                  UID: {firebaseUser.uid}
                </p>
              </div>
              <Button variant="primary" onClick={handleGoogleLogout} className="text-xs py-2">
                GANTI AKUN GOOGLE
              </Button>
            </div>
          ) : (
            <>
              {/* Segmented Tabs */}
              <div className="flex flex-wrap gap-2 border-b-4 border-black pb-3">
                <button
                  onClick={() => setActiveTab("compose")}
                  className={cn(
                    "px-4 py-2 border-2 border-black font-black text-xs uppercase whitespace-nowrap transition-all",
                    activeTab === "compose"
                      ? "bg-[#FFD600] text-black shadow-[3px_3px_0px_black]"
                      : "bg-white text-gray-600 hover:bg-gray-100"
                  )}
                >
                  Buat Siaran
                </button>
                <button
                  onClick={() => setActiveTab("history")}
                  className={cn(
                    "px-4 py-2 border-2 border-black font-black text-xs uppercase whitespace-nowrap transition-all",
                    activeTab === "history"
                      ? "bg-[#FFD600] text-black shadow-[3px_3px_0px_black]"
                      : "bg-white text-gray-600 hover:bg-gray-100"
                  )}
                >
                  Daftar Siaran ({allBroadcasts.length})
                </button>
                <button
                  onClick={() => setActiveTab("admins")}
                  className={cn(
                    "px-4 py-2 border-2 border-black font-black text-xs uppercase whitespace-nowrap transition-all",
                    activeTab === "admins"
                      ? "bg-[#FFD600] text-black shadow-[3px_3px_0px_black]"
                      : "bg-white text-gray-600 hover:bg-gray-100"
                  )}
                >
                  Kelola Admin
                </button>
              </div>

              {activeTab === "compose" && (
                <div className="space-y-4">
                  {/* Kind & Variant */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-black uppercase text-gray-600">
                        Jenis Tampilan
                      </span>
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            { id: "toast", label: "Toast", Icon: MessageSquare },
                            { id: "dialog", label: "Dialog", Icon: AlertCircle },
                            { id: "notification", label: "Notif", Icon: Bell },
                          ] as const
                        ).map(({ id, label, Icon }) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setKind(id)}
                            className={cn(
                              "py-2.5 px-2 border-2 border-black font-black text-xs uppercase flex items-center justify-center gap-1.5 whitespace-nowrap transition-all",
                              kind === id
                                ? "bg-black text-[#FFD600] shadow-[3px_3px_0px_#FFD600]"
                                : "bg-white text-black hover:bg-gray-100"
                            )}
                          >
                            <Icon size={14} /> {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[11px] font-black uppercase text-gray-600">
                        Gaya / Level
                      </span>
                      <div className="grid grid-cols-4 gap-1.5">
                        {(
                          [
                            { id: "info", label: "Info", activeBg: "bg-blue-500 text-white" },
                            { id: "success", label: "Sukses", activeBg: "bg-green-500 text-white" },
                            { id: "warning", label: "Warn", activeBg: "bg-[#FFD600] text-black" },
                            { id: "error", label: "Error", activeBg: "bg-red-500 text-white" },
                          ] as const
                        ).map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => setVariant(v.id)}
                            className={cn(
                              "py-2.5 px-1 border-2 border-black font-black text-[11px] uppercase whitespace-nowrap transition-all",
                              variant === v.id ? v.activeBg : "bg-white text-gray-700 hover:bg-gray-100"
                            )}
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-[11px] font-black uppercase text-gray-600">
                        Judul ({title.length}/{BROADCAST_LIMITS.TITLE_MAX})
                      </span>
                      <Input
                        value={title}
                        maxLength={BROADCAST_LIMITS.TITLE_MAX}
                        onChange={(e: any) => setTitle(e.target.value)}
                        placeholder="Contoh: Update Sistem v2.1"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] font-black uppercase text-gray-600">
                        Nama Pengirim
                      </span>
                      <Input
                        value={senderName}
                        maxLength={BROADCAST_LIMITS.SENDER_NAME_MAX}
                        onChange={(e: any) => setSenderName(e.target.value)}
                        placeholder="Admin"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-black uppercase text-gray-600">
                      Isi Pesan ({message.length}/{BROADCAST_LIMITS.MESSAGE_MAX})
                    </span>
                    <textarea
                      value={message}
                      maxLength={BROADCAST_LIMITS.MESSAGE_MAX}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={3}
                      placeholder="Tulis pesan untuk ditampilkan di Toast, Dialog, atau Notifikasi pengguna..."
                      className="w-full px-4 py-2 border-4 border-black bg-white font-bold text-sm focus:outline-none resize-y"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-[11px] font-black uppercase text-gray-600">
                        Label Tombol Aksi (Opsional)
                      </span>
                      <Input
                        value={actionLabel}
                        maxLength={BROADCAST_LIMITS.ACTION_LABEL_MAX}
                        onChange={(e: any) => setActionLabel(e.target.value)}
                        placeholder="Contoh: Buka Panduan"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] font-black uppercase text-gray-600">
                        URL Tombol Aksi (Opsional, https://)
                      </span>
                      <Input
                        value={actionUrl}
                        maxLength={BROADCAST_LIMITS.ACTION_URL_MAX}
                        onChange={(e: any) => setActionUrl(e.target.value)}
                        placeholder="https://gitpush.axeoncore.my.id"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <Button
                      type="button"
                      variant="primary"
                      onClick={handlePreview}
                      className="flex-1 text-xs py-3 flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <Eye size={16} /> PREVIEW DI LAYAR
                    </Button>
                    <Button
                      type="button"
                      variant="yellow"
                      onClick={handlePublish}
                      disabled={submitting}
                      className="flex-1 text-xs py-3 flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <Send size={16} /> {submitting ? "MENGIRIM..." : "SIARKAN LIVE KE SEMUA"}
                    </Button>
                  </div>
                </div>
              )}

              {activeTab === "history" && (
                <div className="space-y-3">
                  {allBroadcasts.length === 0 ? (
                    <div className="bg-white border-4 border-black p-8 text-center space-y-2">
                      <Bell size={28} className="mx-auto text-gray-400" />
                      <p className="font-black text-sm uppercase text-gray-700">
                        Belum Ada Riwayat Siaran
                      </p>
                      <p className="text-xs font-bold text-gray-500">
                        Buat siaran Toast, Dialog, atau Notifikasi di tab Buat Siaran.
                      </p>
                    </div>
                  ) : (
                    allBroadcasts.map((item) => (
                      <div
                        key={item.id}
                        className="bg-white border-4 border-black p-4 shadow-[4px_4px_0px_black] space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs font-black uppercase">
                            <span className="bg-black text-[#FFD600] px-2 py-0.5">
                              {item.kind}
                            </span>
                            <span className="border-2 border-black px-2 py-0.5">
                              {item.variant}
                            </span>
                            <span
                              className={cn(
                                "px-2 py-0.5 border-2 border-black",
                                item.active ? "bg-green-300 text-black" : "bg-gray-200 text-gray-600"
                              )}
                            >
                              {item.active ? "AKTIF" : "NONAKTIF"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleRetrigger(item)}
                              className="p-1.5 border-2 border-black bg-[#FFD600] hover:bg-yellow-300 transition-colors"
                              title="Picu ulang di layar pengguna"
                            >
                              <RotateCcw size={14} />
                            </button>
                            <button
                              onClick={() => handleToggleActive(item)}
                              className="p-1.5 border-2 border-black bg-white hover:bg-gray-100 transition-colors"
                              title={item.active ? "Nonaktifkan" : "Aktifkan"}
                            >
                              <Power size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteBroadcast(item.id)}
                              className="p-1.5 border-2 border-black bg-red-100 text-red-700 hover:bg-red-500 hover:text-white transition-colors"
                              title="Hapus siaran"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <p className="font-black text-sm text-black">{item.title}</p>
                        <p className="text-xs font-bold text-gray-700 whitespace-pre-wrap break-words">
                          {item.message}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "admins" && (
                <div className="space-y-4">
                  <div className="bg-yellow-50 border-4 border-black p-4 space-y-1">
                    <p className="text-xs font-black uppercase">Admin Utama (Bootstrap)</p>
                    <p className="text-sm font-bold text-black">{ADMIN_BOOTSTRAP_EMAIL}</p>
                  </div>

                  <div className="bg-white border-4 border-black p-4 space-y-3">
                    <p className="text-xs font-black uppercase">Tambah Admin Baru</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input
                        value={newAdminUid}
                        onChange={(e: any) => setNewAdminUid(e.target.value)}
                        placeholder="Firebase UID pengguna"
                      />
                      <Input
                        value={newAdminEmail}
                        onChange={(e: any) => setNewAdminEmail(e.target.value)}
                        placeholder="Email Google pengguna"
                      />
                    </div>
                    <Button
                      variant="yellow"
                      onClick={handleAddAdmin}
                      disabled={submitting}
                      className="text-xs py-2 flex items-center gap-2"
                    >
                      <UserPlus size={14} /> TAMBAH ADMIN
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-black uppercase text-gray-600">
                      Daftar Admin Tambahan ({admins.length})
                    </p>
                    {admins.length === 0 ? (
                      <p className="text-xs font-bold text-gray-500 italic">
                        Belum ada admin tambahan.
                      </p>
                    ) : (
                      admins.map((adm) => (
                        <div
                          key={adm.id}
                          className="bg-white border-2 border-black p-3 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-black truncate">{adm.email}</p>
                            <p className="text-[11px] font-mono text-gray-500 truncate">
                              UID: {adm.uid}
                            </p>
                          </div>
                          <button
                            onClick={() => handleRemoveAdmin(adm.id)}
                            className="p-1.5 border-2 border-black bg-red-100 text-red-700 hover:bg-red-500 hover:text-white"
                            title="Hapus akses admin"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
