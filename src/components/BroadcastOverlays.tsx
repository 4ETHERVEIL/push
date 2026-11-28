import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  ExternalLink,
  Info,
  AlertTriangle,
  X,
} from "lucide-react";
import { BroadcastItem, BroadcastVariant } from "../firebase";
import { cn } from "../lib/utils";

const VARIANT_STYLES: Record<
  BroadcastVariant,
  { bg: string; headerBg: string; borderText: string; label: string; Icon: any }
> = {
  info: {
    bg: "bg-blue-50",
    headerBg: "bg-blue-500 text-white",
    borderText: "text-blue-700",
    label: "INFO",
    Icon: Info,
  },
  success: {
    bg: "bg-green-50",
    headerBg: "bg-green-500 text-white",
    borderText: "text-green-700",
    label: "SUKSES",
    Icon: CheckCircle2,
  },
  warning: {
    bg: "bg-yellow-50",
    headerBg: "bg-[#FFD600] text-black",
    borderText: "text-amber-800",
    label: "PERINGATAN",
    Icon: AlertTriangle,
  },
  error: {
    bg: "bg-red-50",
    headerBg: "bg-red-500 text-white",
    borderText: "text-red-700",
    label: "PENTING",
    Icon: AlertCircle,
  },
};

function isSafeHttpsUrl(url?: string): boolean {
  return Boolean(url && /^https:\/\/\S+/i.test(url.trim()));
}

export interface ActiveToast extends BroadcastItem {
  instanceId: string;
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ActiveToast[];
  onDismiss: (instanceId: string) => void;
}) {
  return (
    <div
      className="fixed top-20 right-4 z-[120] flex flex-col gap-3 max-w-sm w-[calc(100vw-2rem)] pointer-events-none"
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          const style = VARIANT_STYLES[toast.variant] || VARIANT_STYLES.info;
          const IconComponent = style.Icon;
          return (
            <motion.div
              key={toast.instanceId}
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ duration: 0.18 }}
              className={cn(
                "pointer-events-auto border-4 border-black shadow-[6px_6px_0px_rgba(0,0,0,1)] overflow-hidden",
                style.bg
              )}
            >
              <div
                className={cn(
                  "px-3 py-1.5 border-b-2 border-black flex items-center justify-between gap-2",
                  style.headerBg
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <IconComponent size={15} className="shrink-0" />
                  <span className="text-[11px] font-black uppercase tracking-wider truncate">
                    {toast.senderName} · {style.label}
                  </span>
                </div>
                <button
                  onClick={() => onDismiss(toast.instanceId)}
                  className="p-0.5 hover:opacity-75 transition-opacity shrink-0"
                  aria-label="Tutup toast"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="p-3 space-y-1.5">
                <p className="font-black text-sm text-black leading-snug">
                  {toast.title}
                </p>
                <p className="text-xs font-bold text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
                  {toast.message}
                </p>
                {toast.actionLabel && isSafeHttpsUrl(toast.actionUrl) && (
                  <a
                    href={toast.actionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-1 text-xs font-black underline text-black hover:text-blue-700"
                  >
                    {toast.actionLabel} <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function BroadcastDialog({
  dialog,
  onClose,
}: {
  dialog: BroadcastItem | null;
  onClose: () => void;
}) {
  if (!dialog) return null;
  const style = VARIANT_STYLES[dialog.variant] || VARIANT_STYLES.info;
  const IconComponent = style.Icon;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="max-w-md w-full bg-white border-4 border-black shadow-[12px_12px_0px_rgba(0,0,0,1)] overflow-hidden"
      >
        <div
          className={cn(
            "px-4 py-3 border-b-4 border-black flex items-center justify-between gap-2",
            style.headerBg
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <IconComponent size={18} className="shrink-0" />
            <h3 className="font-black uppercase text-xs tracking-widest truncate">
              {dialog.senderName} · {style.label}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:opacity-75 transition-opacity shrink-0"
            aria-label="Tutup dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <h4 className="text-xl font-black text-black leading-tight break-words">
            {dialog.title}
          </h4>
          <div className={cn("p-4 border-2 border-black text-sm font-bold text-gray-800 whitespace-pre-wrap break-words leading-relaxed", style.bg)}>
            {dialog.message}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {dialog.actionLabel && isSafeHttpsUrl(dialog.actionUrl) && (
              <a
                href={dialog.actionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-[140px] py-2.5 px-4 bg-[#FFD600] text-black border-4 border-black font-black text-xs uppercase text-center shadow-[4px_4px_0px_black] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all inline-flex items-center justify-center gap-2"
              >
                {dialog.actionLabel} <ExternalLink size={14} />
              </a>
            )}
            <button
              onClick={onClose}
              className="flex-1 min-w-[120px] py-2.5 px-4 bg-black text-white border-4 border-black font-black text-xs uppercase shadow-[4px_4px_0px_rgba(0,0,0,0.3)] hover:bg-gray-800 transition-colors"
            >
              MENGERTI
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function NotificationCenterModal({
  isOpen,
  onClose,
  notifications,
  unreadIds,
  onMarkAllRead,
  notificationPermission,
  onRequestPermission,
}: {
  isOpen: boolean;
  onClose: () => void;
  notifications: BroadcastItem[];
  unreadIds: Set<string>;
  onMarkAllRead: () => void;
  notificationPermission: NotificationPermission | "unsupported";
  onRequestPermission: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.16 }}
        className="max-w-lg w-full max-h-[85vh] flex flex-col bg-white border-4 border-black shadow-[12px_12px_0px_rgba(0,0,0,1)] overflow-hidden"
      >
        <div className="p-4 bg-black text-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-[#FFD600]" />
            <h3 className="font-black uppercase text-sm tracking-widest">
              Pusat Notifikasi
            </h3>
          </div>
          <div className="flex items-center gap-3">
            {notifications.length > 0 && unreadIds.size > 0 && (
              <button
                onClick={onMarkAllRead}
                className="text-[11px] font-black uppercase bg-[#FFD600] text-black px-2.5 py-1 border-2 border-white whitespace-nowrap"
              >
                Tandai Dibaca
              </button>
            )}
            <button
              onClick={onClose}
              className="hover:text-red-400 transition-colors"
              aria-label="Tutup pusat notifikasi"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {notificationPermission === "default" && (
          <div className="p-3 bg-yellow-100 border-b-4 border-black flex items-center justify-between gap-3 shrink-0">
            <p className="text-xs font-bold text-black">
              Aktifkan izin notifikasi agar pesan admin muncul di bilah sistem.
            </p>
            <button
              onClick={onRequestPermission}
              className="px-3 py-1.5 bg-black text-[#FFD600] font-black text-xs uppercase whitespace-nowrap shrink-0"
            >
              Izinkan
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F7F7F7]">
          {notifications.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Bell size={32} className="mx-auto text-gray-400" />
              <p className="font-black text-sm text-gray-700 uppercase">
                Belum Ada Notifikasi
              </p>
              <p className="text-xs font-bold text-gray-500">
                Pengumuman dan notifikasi dari Admin akan tampil di sini.
              </p>
            </div>
          ) : (
            notifications.map((item) => {
              const style = VARIANT_STYLES[item.variant] || VARIANT_STYLES.info;
              const IconComponent = style.Icon;
              const isUnread = unreadIds.has(item.id);
              const dateText = item.updatedAt?.toDate
                ? item.updatedAt.toDate().toLocaleString("id-ID", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Baru saja";

              return (
                <div
                  key={item.id}
                  className={cn(
                    "bg-white border-4 border-black p-4 space-y-2 shadow-[4px_4px_0px_black]",
                    isUnread ? "ring-2 ring-[#FFD600]" : ""
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          "px-2 py-0.5 text-[10px] font-black uppercase border-2 border-black shrink-0 inline-flex items-center gap-1",
                          style.headerBg
                        )}
                      >
                        <IconComponent size={11} />
                        {style.label}
                      </span>
                      <span className="text-xs font-black text-gray-700 truncate">
                        {item.senderName}
                      </span>
                      {isUnread && (
                        <span className="text-[10px] font-black uppercase text-blue-600">
                          · BARU
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-gray-500 shrink-0">
                      {dateText}
                    </span>
                  </div>
                  <p className="font-black text-sm text-black break-words">
                    {item.title}
                  </p>
                  <p className="text-xs font-bold text-gray-700 whitespace-pre-wrap break-words leading-relaxed">
                    {item.message}
                  </p>
                  {item.actionLabel && isSafeHttpsUrl(item.actionUrl) && (
                    <a
                      href={item.actionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-black underline text-blue-700 hover:text-black"
                    >
                      {item.actionLabel} <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              );
            })
          )}
        </div>
      </motion.div>
    </div>
  );
}
