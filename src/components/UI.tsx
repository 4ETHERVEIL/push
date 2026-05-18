import React, { ReactNode } from "react";
import { cn } from "../lib/utils";
import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "danger" | "yellow";
}

export function Button({ children, variant = "primary", className, ...props }: any) {
  const variants = {
    primary: "bg-white text-black border-black",
    secondary: "bg-blue-400 text-black border-black",
    danger: "bg-red-500 text-white border-black",
    yellow: "bg-yellow-400 text-black border-black",
  };

  return (
    <button
      className={cn(
        "px-6 py-2 border-4 font-bold transition-all hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0 active:translate-y-0 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] active:shadow-none bg-white",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("bg-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]", className)}>
      {children}
    </div>
  );
}

export function Input({ className, ...props }: any) {
  return (
    <input
      className={cn(
        "w-full px-4 py-2 border-4 border-black focus:outline-none focus:ring-0 bg-white placeholder-gray-500 font-bold",
        className
      )}
      {...props}
    />
  );
}

export function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  onConfirm, 
  confirmText = "Ya, Lanjutkan",
  confirmVariant = "danger"
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  title: string; 
  children: ReactNode; 
  onConfirm?: () => void;
  confirmText?: string;
  confirmVariant?: "primary" | "secondary" | "danger" | "yellow";
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white border-4 border-black shadow-[12px_12px_0px_rgba(0,0,0,1)] overflow-hidden"
      >
        <div className="p-4 bg-black text-white flex items-center justify-between">
          <h3 className="font-display font-black uppercase text-sm tracking-widest">{title}</h3>
          <button onClick={onClose} className="hover:text-red-400 transition-colors">
            <Trash2 size={18} />
          </button>
        </div>
        <div className="p-6">
          <div className="text-gray-700 font-bold mb-8">
            {children}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Button onClick={onClose} variant="primary" className="text-sm py-2">
              BATAL
            </Button>
            {onConfirm && (
              <Button onClick={() => { onConfirm(); onClose(); }} variant={confirmVariant} className="text-sm py-2">
                {confirmText}
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
