import React, { ReactNode } from "react";
import { cn } from "../lib/utils";

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
