import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  declare props: Readonly<{ children: React.ReactNode }>;
  state: ErrorBoundaryState = { hasError: false, errorMessage: "" };

  constructor(props: { children: React.ReactNode }) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || "Terjadi kesalahan yang tidak terduga.",
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Application ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FFD600] flex items-center justify-center p-4 font-sans">
          <div className="max-w-md w-full bg-white border-4 border-black p-6 shadow-[8px_8px_0px_black] space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertCircle size={28} />
              <h2 className="text-lg font-black uppercase">Terjadi Kesalahan</h2>
            </div>
            <p className="text-sm font-bold text-gray-700 break-words">
              {this.state.errorMessage}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 px-4 bg-[#FFD600] border-4 border-black font-black uppercase text-sm flex items-center justify-center gap-2 shadow-[4px_4px_0px_black] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all"
            >
              <RefreshCw size={16} /> Muat Ulang Aplikasi
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
