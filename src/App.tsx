import React, { useState, useEffect } from "react";
import { Octokit } from "octokit";
import JSZip from "jszip";
import { Github, Upload, FileText, Trash2, Send, LogOut, ChevronRight, AlertCircle, CheckCircle2, Loader2, FolderOpen, ArrowRight, Plus, Globe, Lock, CornerUpLeft, Folder, X, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Card, Input, Modal } from "./components/UI";
import { cn } from "./lib/utils";

interface GitHubFile {
  path: string;
  content: string;
}

interface Repository {
  id: number;
  full_name: string;
  default_branch: string;
}

async function computeGitBlobSha(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const contentBytes = encoder.encode(content);
  const headerBytes = encoder.encode(`blob ${contentBytes.length}\0`);
  const combined = new Uint8Array(headerBytes.length + contentBytes.length);
  combined.set(headerBytes, 0);
  combined.set(contentBytes, headerBytes.length);
  const hashBuffer = await crypto.subtle.digest("SHA-1", combined);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("gh_token"));
  const [tokenScopes, setTokenScopes] = useState<string[]>([]);
  const [user, setUser] = useState<any>(null);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [branch, setBranch] = useState("main");
  const [files, setFiles] = useState<GitHubFile[]>([]);
  const [fetchingFiles, setFetchingFiles] = useState(false);
  const [editingFile, setEditingFile] = useState<number | null>(null);
  const [currentDirectory, setCurrentDirectory] = useState("");
  const [selectedFileIndexes, setSelectedFileIndexes] = useState<number[]>([]);
  const [commitMessage, setCommitMessage] = useState("Feat: push from GitHub Fast Push");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    isUploading: boolean;
    percent: number;
    currentFile: string;
    processed: number;
    total: number;
    completed: boolean;
  } | null>(null);
  const [boosterMode, setBoosterMode] = useState(true);
  const [pushProgress, setPushProgress] = useState<{
    isPushing: boolean;
    percent: number;
    stage: string;
    processed: number;
    total: number;
    completed: boolean;
    skipped?: number;
    modeLabel?: string;
  } | null>(null);
  const [deleteProgress, setDeleteProgress] = useState<{
    isDeleting: boolean;
    percent: number;
    currentFile: string;
    processed: number;
    total: number;
    completed: boolean;
  } | null>(null);

  // New Repo State
  const [showCreateRepo, setShowCreateRepo] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoDesc, setNewRepoDesc] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [creatingRepo, setCreatingRepo] = useState(false);
  const [securityWarning, setSecurityWarning] = useState<string | null>(null);

  // Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    confirmVariant?: any;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });
  
  // Security & Anti-Inspect System
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setSecurityWarning("WARNING: PENGGUNAAN KLIK KANAN DILARANG! PERCOBAAN MELIHAT KODE AKAN MENGAKIBATKAN BANNED PERMANEN.");
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Block F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U, Ctrl+S
      const bannedKeys = ["I", "J", "C", "U", "S"];
      if (
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && bannedKeys.includes(e.key.toUpperCase())) ||
        (e.ctrlKey && e.key.toLowerCase() === "u") ||
        (e.ctrlKey && e.key.toLowerCase() === "s")
      ) {
        e.preventDefault();
        setSecurityWarning("Sistem mendeteksi upaya ilegal untuk mengintip kode aplikasi via Shortcut Keyboard.");
      }
    };

    // DevTools detection via window size shifts
    const detectDevTools = () => {
      const threshold = 160;
      if (window.outerWidth - window.innerWidth > threshold || window.outerHeight - window.innerHeight > threshold) {
        setSecurityWarning("Sistem mendeteksi upaya ilegal untuk mengintip kode aplikasi via window resize (DevTools).");
      }
    };

    // Anti-Debugging Time Trap
    const antiDebug = setInterval(() => {
      const start = new Date().getTime();
      debugger;
      const end = new Date().getTime();
      if (end - start > 100) {
        setSecurityWarning("Terdeteksi debugger tertahan! Akses dilarang.");
      }
    }, 1000);

    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("keydown", handleKeyDown);
    const interval = setInterval(detectDevTools, 1000);

    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
      clearInterval(interval);
      clearInterval(antiDebug);
    };
  }, []);

  // Auth Listener
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        const newToken = event.data.token;
        localStorage.setItem("gh_token", newToken);
        setToken(newToken);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Fetch Repo Files (Tree)
  const fetchRepoFiles = async (repoFullName: string, branchName: string) => {
    if (!token) return;
    setFetchingFiles(true);
    setFiles([]); // Reset files while fetching
    setEditingFile(null); // Reset selection to prevent crashes
    setSelectedFileIndexes([]); // Reset selections
    setCurrentDirectory(""); // Reset directory view
    const octokit = new Octokit({ auth: token });
    const [owner, repo] = repoFullName.split("/");

    try {
      // 1. Get current branch SHA to avoid caching stale data
      const { data: refData } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${branchName}`,
      });
      const latestSha = refData.object.sha;

      // 2. Get the tree recursively using the latest SHA
      const { data } = await octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: latestSha,
        recursive: "true",
      });

      // Filter only blobs (files)
      const repoFiles: GitHubFile[] = data.tree
        .filter(item => item.type === "blob")
        .map(item => ({
          path: item.path || "",
          content: "", // Content will be loaded on demand
          sha: item.sha,
        }));

      setFiles(repoFiles);
    } catch (err: any) {
      console.error("Fetch Tree Error:", err);
      // Some repos might be empty and have no branch yet
      if (err.status !== 404 && err.status !== 409) {
        setStatus({ type: "error", message: "Gagal mengambil daftar file dari repo." });
      }
    } finally {
      setFetchingFiles(false);
    }
  };

  // Fetch Single File Content
  const fetchFileContent = async (index: number) => {
    const file = files[index];
    if (file.content || !token || !selectedRepo) return;

    setLoading(true);
    const octokit = new Octokit({ auth: token });
    const [owner, repo] = selectedRepo.full_name.split("/");

    try {
      const { data }: any = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: file.path,
        ref: branch,
      });

      if (data && !Array.isArray(data) && data.content) {
        const content = atob(data.content.replace(/\n/g, ""));
        setFiles(prev => {
          const next = [...prev];
          next[index] = { ...next[index], content };
          return next;
        });
      }
    } catch (err) {
      console.error("Fetch Content Error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Trigger fetch when repo/branch changes
  useEffect(() => {
    if (selectedRepo && branch) {
      fetchRepoFiles(selectedRepo.full_name, branch);
    }
  }, [selectedRepo, branch]);

  // Fetch User and Repos
  const fetchRepos = async (authToken: string) => {
    const octokit = new Octokit({ auth: authToken });
    try {
      const { data } = await octokit.rest.repos.listForAuthenticatedUser({ 
        sort: "updated", 
        per_page: 100,
        headers: {
          "If-None-Match": "" // Force fresh data
        }
      });
      setRepos(data.map(r => ({ id: r.id, full_name: r.full_name, default_branch: r.default_branch || "main" })));
      return data;
    } catch (err) {
      console.error(err);
      return [];
    }
  };

  useEffect(() => {
    if (token) {
      const octokit = new Octokit({ auth: token });
      octokit.rest.users.getAuthenticated()
        .then((res) => {
          setUser(res.data);
          const scopeHeader = res.headers?.["x-oauth-scopes"] || "";
          setTokenScopes(
            String(scopeHeader)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          );
        })
        .catch(err => {
          console.error(err);
          handleLogout();
        });
      
      fetchRepos(token);
    }
  }, [token]);

  const handleLogin = async () => {
    try {
      const resp = await fetch("/api/auth/url");
      const data = await resp.json();
      
      if (data.error) {
        setStatus({ type: "error", message: data.error });
        return;
      }
      
      if (data.url) {
        window.open(data.url, "GitHub OAuth", "width=600,height=700");
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (err) {
      console.error(err);
      setStatus({ type: "error", message: "Failed to connect to authentication server. Check your environment variables." });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("gh_token");
    setToken(null);
    setTokenScopes([]);
    setUser(null);
    setRepos([]);
  };

  const handleCreateRepo = async () => {
    if (!newRepoName || !token) return;
    setCreatingRepo(true);
    setStatus({ type: "info", message: "Creating repository..." });

    try {
      const octokit = new Octokit({ auth: token });
      const { data } = await octokit.rest.repos.createForAuthenticatedUser({
        name: newRepoName,
        description: newRepoName, // description from user or same as name
        private: isPrivate,
        auto_init: true,
      });

      setStatus({ type: "success", message: `Repository '${data.name}' created successfully!` });
      setNewRepoName("");
      setNewRepoDesc("");
      setShowCreateRepo(false);
      
      await fetchRepos(token);
      setSelectedRepo({ 
        id: data.id, 
        full_name: data.full_name, 
        default_branch: data.default_branch || "main" 
      });
      setBranch(data.default_branch || "main");
    } catch (err: any) {
      console.error(err);
      setStatus({ type: "error", message: `Failed to create repo: ${err.message}` });
    } finally {
      setCreatingRepo(false);
    }
  };

  const handleDeleteRepo = async () => {
    if (!selectedRepo || !token) return;
    
    setConfirmModal({
      isOpen: true,
      title: "HAPUS REPOSITORI",
      message: `APAKAH ANDA YAKIN? Ini akan menghapus repositori ${selectedRepo.full_name} SECARA PERMANEN dari GitHub. Data tidak dapat dipulihkan!`,
      confirmText: "HAPUS SEKARANG",
      confirmVariant: "danger",
      onConfirm: async () => {
        setLoading(true);
        setStatus({ type: "info", message: "Deleting repository..." });

        try {
          const octokit = new Octokit({ auth: token });
          const [owner, repo] = selectedRepo.full_name.split("/");
          await octokit.rest.repos.delete({ owner, repo });

          setStatus({ type: "success", message: `Repository ${selectedRepo.full_name} deleted.` });
          setSelectedRepo(null);
          setFiles([]);
          await fetchRepos(token);
        } catch (err: any) {
          console.error(err);
          const isPermissionErr = err.message.includes("admin") || err.status === 403 || err.status === 404;
          setStatus({ 
            type: "error", 
            message: `Delete failed: ${err.message}. ${isPermissionErr ? "LOGOUT dan LOGIN kembali untuk memberikan izin 'delete_repo'." : ""}` 
          });
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleDeleteFileFromGitHub = async (index: number) => {
    const file = files[index];
    if (!selectedRepo || !token || !file.path) return;
    
    // Check if it's a new file (not on GitHub yet)
    if (!(file as any).sha) {
      removeFile(index);
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "HAPUS FILE",
      message: `Hapus file "${file.path}" dari GitHub secara permanen?`,
      confirmText: "HAPUS FILE",
      confirmVariant: "danger",
      onConfirm: async () => {
        setLoading(true);
        setStatus(null);
        setDeleteProgress({
          isDeleting: true,
          percent: 25,
          currentFile: file.path,
          processed: 0,
          total: 1,
          completed: false,
        });

        try {
          const octokit = new Octokit({ auth: token });
          const [owner, repo] = selectedRepo.full_name.split("/");
          
          await octokit.rest.repos.deleteFile({
            owner,
            repo,
            path: file.path,
            message: `Delete: ${file.path} via Fast Push`,
            sha: (file as any).sha,
            branch: branch,
          });

          setDeleteProgress({
            isDeleting: true,
            percent: 85,
            currentFile: "Memperbarui daftar file...",
            processed: 1,
            total: 1,
            completed: false,
          });

          setSelectedFileIndexes(prev => prev.filter(i => i !== index));
          
          // Force refresh from GitHub after deletion to sync state
          await fetchRepoFiles(selectedRepo.full_name, branch);

          setDeleteProgress({
            isDeleting: false,
            percent: 100,
            currentFile: `${file.path} berhasil dihapus!`,
            processed: 1,
            total: 1,
            completed: true,
          });
          setStatus({ type: "success", message: `File ${file.path} deleted from GitHub.` });
        } catch (err: any) {
          console.error(err);
          setDeleteProgress(null);
          setStatus({ type: "error", message: `Failed to delete file: ${err.message}` });
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleBatchDelete = async (indices: number[]) => {
    if (indices.length === 0 || !selectedRepo || !token) return;
    
    // Check if we are only deleting local files
    const filesToDelete = indices.map(i => ({ index: i, file: files[i] }));
    const githubFiles = filesToDelete.filter(f => (f.file as any).sha);
    const localFiles = filesToDelete.filter(f => !(f.file as any).sha);
    
    if (githubFiles.length === 0) {
      // All local files, simply remove them
      setFiles(prev => prev.filter((_, i) => !indices.includes(i)));
      setSelectedFileIndexes(prev => prev.filter(i => !indices.includes(i)));
      setDeleteProgress({
        isDeleting: false,
        percent: 100,
        currentFile: `${localFiles.length} file lokal berhasil dihapus!`,
        processed: localFiles.length,
        total: localFiles.length,
        completed: true,
      });
      setStatus({ type: "success", message: `Berhasil menghapus ${localFiles.length} file lokal.` });
      return;
    }
    
    setConfirmModal({
      isOpen: true,
      title: "HAPUS BANYAK FILE",
      message: `Apakah Anda yakin ingin menghapus ${indices.length} file? Ada ${githubFiles.length} file yang akan DITETAPKAN DIHAPUS DARI GITHUB secara permanen!`,
      confirmText: "HAPUS SEMUA",
      confirmVariant: "danger",
      onConfirm: async () => {
        setLoading(true);
        setStatus(null);
        const totalToDelete = githubFiles.length;
        setDeleteProgress({
          isDeleting: true,
          percent: 5,
          currentFile: "Mempersiapkan penghapusan...",
          processed: 0,
          total: totalToDelete,
          completed: false,
        });

        try {
          const octokit = new Octokit({ auth: token });
          const [owner, repo] = selectedRepo.full_name.split("/");
          
          // Delete sequentially to avoid rate limits or conflicts
          for (let i = 0; i < githubFiles.length; i++) {
            const gf = githubFiles[i];
            setDeleteProgress({
              isDeleting: true,
              percent: Math.max(5, Math.round((i / totalToDelete) * 90)),
              currentFile: gf.file.path,
              processed: i,
              total: totalToDelete,
              completed: false,
            });
            await octokit.rest.repos.deleteFile({
              owner,
              repo,
              path: gf.file.path,
              message: `Delete: ${gf.file.path} via Fast Push`,
              sha: (gf.file as any).sha,
              branch: branch,
            });
            setDeleteProgress({
              isDeleting: true,
              percent: Math.round(((i + 1) / totalToDelete) * 90),
              currentFile: gf.file.path,
              processed: i + 1,
              total: totalToDelete,
              completed: false,
            });
          }

          setDeleteProgress({
            isDeleting: true,
            percent: 95,
            currentFile: "Memperbarui daftar file...",
            processed: totalToDelete,
            total: totalToDelete,
            completed: false,
          });

          setSelectedFileIndexes(prev => prev.filter(i => !indices.includes(i)));
          
          // Force refresh from GitHub after deletion to sync state
          await fetchRepoFiles(selectedRepo.full_name, branch);

          setDeleteProgress({
            isDeleting: false,
            percent: 100,
            currentFile: `${indices.length} file berhasil dihapus!`,
            processed: totalToDelete,
            total: totalToDelete,
            completed: true,
          });
          setStatus({ type: "success", message: `Berhasil menghapus ${indices.length} file.` });
        } catch (err: any) {
          console.error(err);
          setDeleteProgress(null);
          setStatus({ type: "error", message: `Failed to delete files: ${err.message}` });
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleDeleteSelected = () => {
    handleBatchDelete(selectedFileIndexes);
  };

  const handleDeleteFolder = (folderPath: string) => {
    const indices: number[] = [];
    for (let i = 0; i < files.length; i++) {
      if (files[i].path.startsWith(folderPath + '/')) {
        indices.push(i);
      }
    }
    handleBatchDelete(indices);
  };

  const processFiles = async (uploadedFiles: FileList) => {
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    const totalInputFiles = uploadedFiles.length;
    setUploadProgress({
      isUploading: true,
      percent: 0,
      currentFile: "Mempersiapkan file...",
      processed: 0,
      total: totalInputFiles,
      completed: false,
    });

    let newFilesList: GitHubFile[] = [];
    let totalWorkItems = totalInputFiles;
    let completedWorkItems = 0;

    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      const filePath = file.webkitRelativePath || file.name;

      if (file.name.endsWith(".zip") && !file.webkitRelativePath) {
        try {
          setCurrentDirectory(""); // Reset for safety
          setUploadProgress({
            isUploading: true,
            percent: Math.min(95, Math.round((completedWorkItems / totalWorkItems) * 100)),
            currentFile: `Mengekstrak ${file.name}...`,
            processed: completedWorkItems,
            total: totalWorkItems,
            completed: false,
          });

          const zip = await JSZip.loadAsync(file);
          const zipEntries = Object.keys(zip.files).filter((filename) => !zip.files[filename].dir);
          totalWorkItems = totalWorkItems - 1 + Math.max(1, zipEntries.length);

          if (zipEntries.length === 0) {
            completedWorkItems++;
          } else {
            for (const filename of zipEntries) {
              const zipFile = zip.files[filename];
              const content = await zipFile.async("string");
              newFilesList.push({ path: filename, content });
              completedWorkItems++;
              setUploadProgress({
                isUploading: true,
                percent: Math.round((completedWorkItems / totalWorkItems) * 100),
                currentFile: filename,
                processed: completedWorkItems,
                total: totalWorkItems,
                completed: false,
              });
            }
          }
        } catch (err) {
          console.error("ZIP load error:", err);
          setStatus({ type: "error", message: "Gagal memproses file ZIP." });
          completedWorkItems++;
        }
      } else {
        setUploadProgress({
          isUploading: true,
          percent: Math.round((completedWorkItems / totalWorkItems) * 100),
          currentFile: filePath,
          processed: completedWorkItems,
          total: totalWorkItems,
          completed: false,
        });

        const content = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onprogress = (event) => {
            if (event.lengthComputable && event.total > 0) {
              const fileRatio = event.loaded / event.total;
              const overallPercent = Math.round(((completedWorkItems + fileRatio) / totalWorkItems) * 100);
              setUploadProgress((prev) =>
                prev
                  ? {
                      ...prev,
                      percent: Math.min(99, overallPercent),
                      currentFile: filePath,
                    }
                  : null
              );
            }
          };
          reader.onload = (event) => resolve((event.target?.result as string) ?? "");
          reader.readAsText(file);
        });
        newFilesList.push({ path: filePath, content });
        completedWorkItems++;
        setUploadProgress({
          isUploading: true,
          percent: Math.round((completedWorkItems / totalWorkItems) * 100),
          currentFile: filePath,
          processed: completedWorkItems,
          total: totalWorkItems,
          completed: false,
        });
      }
    }

    let updatedCount = 0;
    let addedCount = 0;

    setFiles(prev => {
      const merged = [...prev];
      newFilesList.forEach(newFile => {
        const existingIndex = merged.findIndex(f => f.path === newFile.path);
        if (existingIndex >= 0) {
          merged[existingIndex] = newFile; // Update existing
          updatedCount++;
        } else {
          merged.push(newFile); // Add new
          addedCount++;
        }
      });

      // Show notification after we successfully counted
      if (updatedCount > 0) {
        setTimeout(() => setStatus({ type: "success", message: `Berhasil upload: ${addedCount} file baru, ${updatedCount} file diupdate.` }), 0);
      } else if (addedCount > 0) {
        setTimeout(() => setStatus({ type: "success", message: `Berhasil upload: ${addedCount} file baru.` }), 0);
      }

      return merged;
    });

    if (newFilesList.length > 0) {
      setUploadProgress({
        isUploading: false,
        percent: 100,
        currentFile: "Selesai diupload!",
        processed: newFilesList.length,
        total: newFilesList.length,
        completed: true,
      });
    } else {
      setUploadProgress(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles) return;
    await processFiles(uploadedFiles);
    e.target.value = ""; // Reset input
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    if (editingFile === index) setEditingFile(null);
  };

  const updateFileContent = (content: string) => {
    if (editingFile === null) return;
    setFiles(prev => {
      const next = [...prev];
      next[editingFile] = { ...next[editingFile], content };
      return next;
    });
  };

  const updateFilePath = (path: string) => {
    if (editingFile === null) return;
    setFiles(prev => {
      const next = [...prev];
      next[editingFile] = { ...next[editingFile], path };
      return next;
    });
  };

  const handlePush = async () => {
    if (!selectedRepo || files.length === 0 || !token) return;

    const normalizedFiles = files
      .filter(f => f.content !== "")
      .map(f => ({
        ...f,
        path: f.path.replace(/^\/+/, "").replace(/\/+/g, "/"),
      }))
      .filter(f => f.path !== "" && !f.path.endsWith("/"));

    const dedupedMap = new Map<string, GitHubFile>();
    for (const f of normalizedFiles) {
      dedupedMap.set(f.path, f);
    }
    const nonEmptyFiles = Array.from(dedupedMap.values());
    const hasWorkflowFiles = nonEmptyFiles.some(f => f.path.startsWith(".github/workflows/"));

    if (hasWorkflowFiles && tokenScopes.length > 0 && !tokenScopes.includes("workflow")) {
      setStatus({
        type: "error",
        message: "Izin 'workflow' diperlukan untuk push folder .github/workflows/. Klik Login Ulang agar file bisa di-push tanpa menghapus daftar file Anda.",
      });
      setConfirmModal({
        isOpen: true,
        title: "IZIN WORKFLOW DIPERLUKAN",
        message: "Project ini berisi file di .github/workflows/. GitHub mewajibkan izin 'workflow' saat login. Klik LOGIN ULANG untuk memperbarui izin sekarang (daftar file Anda tetap aman).",
        confirmText: "LOGIN ULANG",
        confirmVariant: "primary",
        onConfirm: () => {
          handleLogin();
        },
      });
      return;
    }

    setLoading(true);
    setStatus(null);
    const startTime = performance.now();

    const totalCandidates = nonEmptyFiles.length;

    setPushProgress({
      isPushing: true,
      percent: 5,
      stage: boosterMode ? "Booster: Mengambil referensi & tree..." : "Mengambil referensi branch...",
      processed: 0,
      total: totalCandidates,
      completed: false,
      modeLabel: boosterMode ? "BOOSTER" : "STANDAR",
    });

    try {
      const octokit = new Octokit({ auth: token });
      const [owner, repo] = selectedRepo.full_name.split("/");

      // 1. Get latest commit SHA (auto-init if repo is completely empty)
      let latestCommitSha = "";
      try {
        const { data: refData } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
        latestCommitSha = refData.object.sha;
      } catch (refErr: any) {
        if ((refErr?.status === 404 || refErr?.status === 409) && nonEmptyFiles.length > 0) {
          // Initialize empty repository or missing branch with a README if empty
          const initFile = nonEmptyFiles.find(f => !f.path.startsWith(".github/workflows/")) || nonEmptyFiles[0];
          const encodedContent = btoa(unescape(encodeURIComponent(initFile.content)));
          await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: initFile.path,
            message: `Initial commit: ${initFile.path}`,
            content: encodedContent,
            branch,
          });
          const { data: refData } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
          latestCommitSha = refData.object.sha;
        } else {
          throw refErr;
        }
      }

      const { data: latestCommitData } = await octokit.rest.git.getCommit({
        owner,
        repo,
        commit_sha: latestCommitSha,
      });
      const baseTreeSha = latestCommitData.tree.sha;

      let filesToUpload = nonEmptyFiles;
      let skippedCount = 0;

      // Booster Step: Compare local Git Blob SHA-1 against remote tree SHAs to skip identical files
      if (boosterMode && totalCandidates > 0 && typeof crypto !== "undefined" && crypto.subtle) {
        try {
          setPushProgress({
            isPushing: true,
            percent: 10,
            stage: "Booster: Memindai perbedaan SHA-1...",
            processed: 0,
            total: totalCandidates,
            completed: false,
            modeLabel: "BOOSTER",
          });

          const { data: remoteTreeData } = await octokit.rest.git.getTree({
            owner,
            repo,
            tree_sha: baseTreeSha,
            recursive: "true",
          });

          const remoteShaMap = new Map<string, string>();
          for (const item of remoteTreeData.tree) {
            if (item.type === "blob" && item.path && item.sha) {
              remoteShaMap.set(item.path, item.sha);
            }
          }

          const localShas = await Promise.all(
            nonEmptyFiles.map(async (f) => ({
              file: f,
              sha: await computeGitBlobSha(f.content),
            }))
          );

          const changed: GitHubFile[] = [];
          for (const entry of localShas) {
            const remoteSha = remoteShaMap.get(entry.file.path);
            if (remoteSha && remoteSha === entry.sha) {
              skippedCount++;
            } else {
              changed.push(entry.file);
            }
          }
          filesToUpload = changed;
        } catch (diffErr) {
          console.warn("Booster SHA diff skipped, uploading all files:", diffErr);
          filesToUpload = nonEmptyFiles;
          skippedCount = 0;
        }
      }

      const totalBlobs = filesToUpload.length;

      // If Booster detected zero changes needed
      if (boosterMode && totalCandidates > 0 && totalBlobs === 0) {
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
        setPushProgress({
          isPushing: false,
          percent: 100,
          stage: `Semua ${skippedCount} file sudah sama (${elapsed} dtk)`,
          processed: 0,
          total: 0,
          completed: true,
          skipped: skippedCount,
          modeLabel: "BOOSTER",
        });
        setStatus({
          type: "success",
          message: `⚡ Booster Push: Semua ${skippedCount} file sudah identik dengan GitHub (${elapsed} dtk) — tidak ada perubahan perlu di-push.`,
        });
        setFiles([]);
        setEditingFile(null);
        return;
      }

      type TreeEntry = {
        path: string;
        mode: "100644";
        type: "blob";
        sha?: string;
        content?: string;
      };

      const uploadBlobsParallel = async (maxConcurrency: number): Promise<TreeEntry[]> => {
        const blobs: TreeEntry[] = new Array(totalBlobs);
        let completedBlobs = 0;
        let nextIndex = 0;
        const concurrency = Math.min(maxConcurrency, Math.max(1, totalBlobs));

        const createBlobWithRetry = async (content: string, retries = 2) => {
          for (let attempt = 0; attempt <= retries; attempt++) {
            try {
              return await octokit.rest.git.createBlob({
                owner,
                repo,
                content,
                encoding: "utf-8",
              });
            } catch (err: any) {
              const isRateOrTransient = err?.status === 403 || err?.status === 429 || err?.status >= 500;
              if (attempt < retries && isRateOrTransient) {
                await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
                continue;
              }
              throw err;
            }
          }
          throw new Error("Failed to create blob");
        };

        const worker = async () => {
          while (nextIndex < totalBlobs) {
            const currentIndex = nextIndex++;
            const f = filesToUpload[currentIndex];
            const { data: blob } = await createBlobWithRetry(f.content);
            blobs[currentIndex] = { path: f.path, sha: blob.sha, mode: "100644", type: "blob" };
            completedBlobs++;
            const blobPercent = totalBlobs > 0 ? 15 + Math.round((completedBlobs / totalBlobs) * 65) : 80;
            setPushProgress({
              isPushing: true,
              percent: blobPercent,
              stage: f.path,
              processed: completedBlobs,
              total: totalBlobs,
              completed: false,
              skipped: skippedCount,
              modeLabel: boosterMode ? "BOOSTER 15x" : "STANDAR",
            });
          }
        };

        if (totalBlobs > 0) {
          await Promise.all(Array.from({ length: concurrency }, () => worker()));
        }
        return blobs;
      };

      let treeDataSha = "";
      let usedStrategy = boosterMode ? "15x Paralel" : "Standar";

      // Check if eligible for 1-Shot Inline Tree (<= 150 changed files and <= 2 MB total UTF-8 payload)
      const encoder = new TextEncoder();
      const totalPayloadBytes = boosterMode
        ? filesToUpload.reduce((acc, f) => acc + encoder.encode(f.content).length, 0)
        : Infinity;
      const canUseInlineTree = boosterMode && totalBlobs > 0 && totalBlobs <= 150 && totalPayloadBytes <= 2 * 1024 * 1024;

      if (canUseInlineTree) {
        try {
          setPushProgress({
            isPushing: true,
            percent: 45,
            stage: `Booster 1-Shot: Mengirim ${totalBlobs} file sekaligus...`,
            processed: totalBlobs,
            total: totalBlobs,
            completed: false,
            skipped: skippedCount,
            modeLabel: "1-SHOT TREE",
          });

          const inlineTree: TreeEntry[] = filesToUpload.map((f) => ({
            path: f.path,
            mode: "100644",
            type: "blob",
            content: f.content,
          }));

          const { data: treeData } = await octokit.rest.git.createTree({
            owner,
            repo,
            base_tree: baseTreeSha,
            tree: inlineTree,
          });
          treeDataSha = treeData.sha;
          usedStrategy = "1-Shot Tree";
        } catch (inlineErr: any) {
          if (inlineErr?.status === 404 && hasWorkflowFiles) {
            throw inlineErr;
          }
          console.warn("1-Shot Inline Tree fallback to 15x Parallel blobs:", inlineErr);
          const blobs = await uploadBlobsParallel(15);
          setPushProgress({
            isPushing: true,
            percent: 85,
            stage: "Membuat Git Tree...",
            processed: totalBlobs,
            total: totalBlobs,
            completed: false,
            skipped: skippedCount,
            modeLabel: "BOOSTER 15x",
          });
          const { data: treeData } = await octokit.rest.git.createTree({
            owner,
            repo,
            base_tree: baseTreeSha,
            tree: blobs,
          });
          treeDataSha = treeData.sha;
        }
      } else {
        setPushProgress({
          isPushing: true,
          percent: 15,
          stage: totalBlobs > 0
            ? (boosterMode ? `Booster 15x: Mengunggah ${totalBlobs} file...` : "Mengunggah file ke GitHub...")
            : "Mempersiapkan tree...",
          processed: 0,
          total: totalBlobs,
          completed: false,
          skipped: skippedCount,
          modeLabel: boosterMode ? "BOOSTER 15x" : "STANDAR",
        });

        const blobs = await uploadBlobsParallel(boosterMode ? 15 : 5);

        // 3. Create Tree
        setPushProgress({
          isPushing: true,
          percent: 85,
          stage: "Membuat Git Tree...",
          processed: totalBlobs,
          total: totalBlobs,
          completed: false,
          skipped: skippedCount,
          modeLabel: boosterMode ? "BOOSTER 15x" : "STANDAR",
        });
        const { data: treeData } = await octokit.rest.git.createTree({
          owner,
          repo,
          base_tree: baseTreeSha,
          tree: blobs,
        });
        treeDataSha = treeData.sha;
      }

      // 4. Create Commit
      setPushProgress({
        isPushing: true,
        percent: 92,
        stage: "Membuat Commit...",
        processed: totalBlobs,
        total: totalBlobs,
        completed: false,
        skipped: skippedCount,
        modeLabel: boosterMode ? usedStrategy : "STANDAR",
      });
      const { data: commitData } = await octokit.rest.git.createCommit({
        owner,
        repo,
        message: commitMessage,
        tree: treeDataSha,
        parents: [latestCommitSha],
      });

      // 5. Update Ref
      setPushProgress({
        isPushing: true,
        percent: 97,
        stage: `Memperbarui branch ${branch}...`,
        processed: totalBlobs,
        total: totalBlobs,
        completed: false,
        skipped: skippedCount,
        modeLabel: boosterMode ? usedStrategy : "STANDAR",
      });
      await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: commitData.sha,
      });

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      setPushProgress({
        isPushing: false,
        percent: 100,
        stage: `Selesai dalam ${elapsed} dtk (${usedStrategy})`,
        processed: totalBlobs,
        total: totalBlobs,
        completed: true,
        skipped: skippedCount,
        modeLabel: boosterMode ? usedStrategy : "STANDAR",
      });
      setStatus({
        type: "success",
        message: boosterMode
          ? `⚡ Booster Push berhasil dalam ${elapsed} dtk! ${totalBlobs} file dikirim${skippedCount > 0 ? `, ${skippedCount} file sama dilewati` : ""} (${usedStrategy}).`
          : `Successfully pushed ${files.length} files to ${selectedRepo.full_name}!`,
      });
      setFiles([]);
      setEditingFile(null);
    } catch (err: any) {
      console.error(err);
      setPushProgress(null);
      if ((err?.status === 404 || err?.message?.includes("create-a-tree")) && hasWorkflowFiles) {
        setStatus({
          type: "error",
          message: "Push ditolak GitHub (404) karena folder .github/workflows/ butuh izin 'workflow'. Silakan Logout dan Login kembali untuk memperbarui izin.",
        });
        setConfirmModal({
          isOpen: true,
          title: "IZIN WORKFLOW DIPERLUKAN",
          message: "GitHub menolak push file .github/workflows/ karena sesi login Anda belum memiliki izin 'workflow'. Klik LOGIN ULANG sekarang untuk memperbarui izin (daftar file Anda tidak akan hilang).",
          confirmText: "LOGIN ULANG",
          confirmVariant: "primary",
          onConfirm: () => {
            handleLogin();
          },
        });
      } else {
        setStatus({ type: "error", message: `Push failed: ${err.message}` });
      }
    } finally {
      setLoading(false);
    }
  };

  // Derived state for File Manager
  const visibleItems = React.useMemo(() => {
    const items: { type: 'file' | 'folder', name: string, path: string, index: number }[] = [];
    const folders = new Set<string>();

    const dirPrefix = currentDirectory === "" ? "" : currentDirectory + "/";
    
    files.forEach((f, idx) => {
      if (f.path.startsWith(dirPrefix)) {
        const remaining = f.path.substring(dirPrefix.length);
        const parts = remaining.split('/');
        if (parts.length === 1) {
          items.push({ type: 'file', name: parts[0], path: f.path, index: idx });
        } else {
          folders.add(parts[0]);
        }
      }
    });

    const allItems: any[] = [];
    folders.forEach(folder => {
      allItems.push({ type: 'folder', name: folder, path: dirPrefix + folder, index: -1 });
    });
    items.forEach(item => {
      allItems.push(item);
    });

    return allItems.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [files, currentDirectory]);

  const currentDirFileIndices = React.useMemo(() => {
    const dirPrefix = currentDirectory === "" ? "" : currentDirectory + "/";
    const indices: number[] = [];
    files.forEach((f, idx) => {
      if (f.path.startsWith(dirPrefix)) {
        indices.push(idx);
      }
    });
    return indices;
  }, [files, currentDirectory]);

  if (!token) {
    return (
      <div className="min-h-screen bg-[#FFD600] flex items-center justify-center p-4 font-sans selection:bg-black selection:text-[#FFD600]">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-md w-full"
        >
          <Card className="text-center space-y-8 py-12">
            <div className="inline-block p-4 bg-black rounded-2xl rotate-3 shadow-[8px_8px_0px_rgba(0,0,0,0.3)]">
              <Github className="w-16 h-16 text-[#FFD600]" />
            </div>
            <div className="space-y-4">
              <h1 className="text-4xl font-display font-black uppercase tracking-tighter">
                GitHub <br />
                <span className="text-blue-600">Fast Push</span>
              </h1>
              <p className="text-gray-600 font-bold px-4">
                Push banyak file ke GitHub dalam 1 commit — Sekarang dengan ZIP Extract & File Editor!
              </p>
            </div>
            <Button variant="yellow" className="w-full text-xl py-4" onClick={handleLogin}>
              LOGIN WITH GITHUB
            </Button>

            <div className="grid grid-cols-1 gap-4 pt-4 text-left">
              <Card className="bg-pink-50 flex items-center gap-4 p-3 border-2">
                <div className="bg-black text-white p-2 rounded-lg">
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-black text-gray-500">Fitur Utama</p>
                  <p className="font-bold text-xs">Multi-file Pushing</p>
                </div>
              </Card>
              <Card className="bg-blue-50 flex items-center gap-4 p-3 border-2">
                <div className="bg-black text-white p-2 rounded-lg">
                  <FolderOpen size={18} />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-black text-gray-500">Extract ZIP</p>
                  <p className="font-bold text-xs">Auto Unzip & Edit</p>
                </div>
              </Card>
            </div>
            <div className="flex items-center gap-2 justify-center text-xs font-black text-gray-500 uppercase">
              <AlertCircle size={14} />
              Aplikasi ini menggunakan OAuth GitHub yang aman.
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F0F0] font-sans selection:bg-black selection:text-white pb-20">
      {/* Header */}
      <header className="bg-white border-b-4 border-black p-4 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-black p-2 rounded-lg rotate-2">
              <Github className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-display font-black tracking-tight hidden sm:block">FAST PUSH</h1>
          </div>

          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-2 bg-gray-100 border-2 border-black px-3 py-1 rounded-full">
                <img src={user.avatar_url} className="w-6 h-6 rounded-full border-2 border-black" alt="" />
                <span className="text-sm font-black text-gray-800">{user.login}</span>
              </div>
            )}
            <button onClick={handleLogout} className="p-2 border-2 border-black hover:bg-black hover:text-white transition-colors rounded-full">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column - Setup */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="space-y-4">
            <div className="flex items-center justify-between border-b-2 border-black pb-2">
              <div className="flex items-center gap-2 font-black uppercase text-sm">
                <FolderOpen size={18} /> Konfigurasi Repo
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    if (token) {
                      setStatus({ type: "info", message: "Refreshing repo list..." });
                      fetchRepos(token).then(() => setStatus({ type: "success", message: "Repo list updated." }));
                    }
                  }}
                  className="p-1 border-2 border-black transition-colors rounded hover:bg-black hover:text-white"
                  title="Refresh Repos"
                >
                  <motion.div whileTap={{ rotate: 180 }}>
                    <Plus size={16} className="rotate-45" /> 
                  </motion.div>
                </button>
                <button 
                  onClick={() => setShowCreateRepo(true)}
                  className="p-1 border-2 border-black transition-colors rounded hover:bg-black hover:text-white"
                  title="Create New Repo"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
            
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-black uppercase mb-1 block">Pilih Repositori</label>
                <div className="flex gap-2">
                  <select 
                    className="flex-1 border-4 border-black p-2 font-bold focus:outline-none bg-white cursor-pointer text-sm"
                    onChange={(e) => {
                      const r = repos.find(repo => repo.id === Number(e.target.value));
                      setSelectedRepo(r || null);
                      if (r) setBranch(r.default_branch);
                    }}
                    value={selectedRepo?.id || ""}
                  >
                    <option value="">-- Pilih Repo --</option>
                    {repos.map(repo => (
                      <option key={repo.id} value={repo.id}>{repo.full_name}</option>
                    ))}
                  </select>
                  {selectedRepo && (
                    <button 
                      onClick={handleDeleteRepo}
                      className="p-2 border-4 border-black bg-red-500 text-white hover:bg-red-600 transition-colors"
                      title="Hapus Repo dari GitHub"
                    >
                      <Trash2 size={20} />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-black uppercase mb-1 block">Branch</label>
                <Input value={branch} onChange={(e: any) => setBranch(e.target.value)} placeholder="main" />
              </div>

              <div>
                <label className="text-xs font-black uppercase mb-1 block">Pesan Commit</label>
                <Input value={commitMessage} onChange={(e: any) => setCommitMessage(e.target.value)} />
              </div>
            </div>
          </Card>

          <Card className="bg-yellow-100">
            <h3 className="font-black text-sm uppercase mb-3 flex items-center gap-2">
              <Upload size={18} /> Upload Data
            </h3>
            <label
              className="group block cursor-pointer"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  await processFiles(e.dataTransfer.files);
                }
              }}
            >
              <div className="border-4 border-dashed border-black p-8 text-center bg-white group-hover:bg-yellow-50 transition-colors">
                <Upload className="mx-auto mb-2 text-black group-hover:scale-110 transition-transform" />
                <p className="text-sm font-black">Klik atau Drag File/ZIP</p>
                <p className="text-[10px] uppercase mt-2 text-gray-500 font-black">Mendukung multi-upload</p>
              </div>
              <input type="file" multiple className="hidden" onChange={handleFileUpload} />
            </label>

            <AnimatePresence>
              {uploadProgress && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="mt-4 p-3 bg-white border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {uploadProgress.completed ? (
                        <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                      ) : (
                        <Loader2 size={16} className="animate-spin text-black shrink-0" />
                      )}
                      <span className="text-xs font-black uppercase truncate">
                        {uploadProgress.completed
                          ? `Upload Selesai (${uploadProgress.total} file)`
                          : `Mengupload: ${uploadProgress.currentFile}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-black px-1.5 py-0.5 border-2 border-black bg-yellow-300">
                        {uploadProgress.percent}%
                      </span>
                      {uploadProgress.completed && (
                        <button
                          type="button"
                          onClick={() => setUploadProgress(null)}
                          className="p-0.5 hover:bg-gray-200 border-2 border-black transition-colors"
                          title="Tutup"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="w-full h-4 bg-gray-200 border-2 border-black overflow-hidden">
                    <motion.div
                      className={cn(
                        "h-full transition-all duration-200",
                        uploadProgress.percent > 0 && uploadProgress.percent < 100 && "border-r-2 border-black",
                        uploadProgress.completed ? "bg-green-400" : "bg-blue-400"
                      )}
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadProgress.percent}%` }}
                      transition={{ duration: 0.15 }}
                    />
                  </div>
                  <div className="flex justify-between items-center mt-1.5 text-[10px] font-black uppercase text-gray-600">
                    <span>
                      {uploadProgress.completed ? "File berhasil dimuat" : "Memproses file..."}
                    </span>
                    <span>
                      {uploadProgress.processed} / {uploadProgress.total} file
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>

          <AnimatePresence>
            {status && (
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -20, opacity: 0 }}
                className={cn(
                  "p-4 border-4 border-black font-bold flex items-start gap-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]",
                  status.type === "success" ? "bg-green-400" : status.type === "error" ? "bg-red-400" : "bg-blue-400"
                )}
              >
                <div className="mt-0.5">
                  {status.type === "success" ? <CheckCircle2 className="shrink-0" /> : status.type === "error" ? <AlertCircle className="shrink-0" /> : <Loader2 className="animate-spin shrink-0" />}
                </div>
                <p className="text-sm flex-1">{status.message}</p>
                <button onClick={() => setStatus(null)} className="hover:scale-125 transition-transform">
                  <Trash2 size={16} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={() => setBoosterMode(!boosterMode)}
            className={cn(
              "w-full p-3 border-4 border-black flex items-center justify-between gap-3 text-left transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]",
              boosterMode ? "bg-green-300 hover:bg-green-400" : "bg-white hover:bg-gray-100"
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn(
                "p-2 border-2 border-black shrink-0",
                boosterMode ? "bg-yellow-300" : "bg-gray-200"
              )}>
                <Zap size={18} className="text-black" />
              </div>
              <div className="min-w-0">
                <div className="font-black text-xs uppercase flex items-center gap-2">
                  <span>Booster Push</span>
                  <span className={cn(
                    "px-1.5 py-0.5 text-[10px] border-2 border-black",
                    boosterMode ? "bg-black text-yellow-300" : "bg-gray-200 text-gray-700"
                  )}>
                    {boosterMode ? "ON" : "OFF"}
                  </span>
                </div>
                <p className="text-[10px] font-bold text-gray-800 truncate">
                  Skip file identik (SHA-1) + 1-Shot Tree / 15x Paralel
                </p>
              </div>
            </div>
            <div className={cn(
              "w-11 h-6 border-2 border-black p-0.5 flex items-center shrink-0 transition-colors",
              boosterMode ? "bg-black justify-end" : "bg-gray-300 justify-start"
            )}>
              <div className="w-4 h-4 bg-yellow-300 border border-black" />
            </div>
          </button>

          <Button 
            variant="yellow" 
            className="w-full py-4 text-xl flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading || !selectedRepo || files.length === 0}
            onClick={handlePush}
          >
            {loading ? <Loader2 className="animate-spin" /> : boosterMode ? <Zap /> : <Send />}
            {boosterMode ? "BOOSTER PUSH TO GITHUB" : "PUSH TO GITHUB"}
          </Button>

          <AnimatePresence>
            {pushProgress && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="p-3 bg-white border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {pushProgress.completed ? (
                      <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                    ) : (
                      <Loader2 size={16} className="animate-spin text-black shrink-0" />
                    )}
                    <span className="text-xs font-black uppercase truncate">
                      {pushProgress.completed
                        ? "Push Selesai!"
                        : `Push: ${pushProgress.stage}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {pushProgress.modeLabel && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 border-2 border-black bg-black text-yellow-300">
                        {pushProgress.modeLabel}
                      </span>
                    )}
                    <span className="text-xs font-black px-1.5 py-0.5 border-2 border-black bg-yellow-300">
                      {pushProgress.percent}%
                    </span>
                    {pushProgress.completed && (
                      <button
                        type="button"
                        onClick={() => setPushProgress(null)}
                        className="p-0.5 hover:bg-gray-200 border-2 border-black transition-colors"
                        title="Tutup"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="w-full h-4 bg-gray-200 border-2 border-black overflow-hidden">
                  <motion.div
                    className={cn(
                      "h-full transition-all duration-200",
                      pushProgress.percent > 0 && pushProgress.percent < 100 && "border-r-2 border-black",
                      pushProgress.completed ? "bg-green-400" : "bg-yellow-400"
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${pushProgress.percent}%` }}
                    transition={{ duration: 0.15 }}
                  />
                </div>
                <div className="flex justify-between items-center mt-1.5 text-[10px] font-black uppercase text-gray-600">
                  <span className="truncate mr-2">
                    {pushProgress.completed
                      ? pushProgress.stage
                      : pushProgress.skipped
                        ? `${pushProgress.skipped} file sama dilewati`
                        : "Mengirim ke GitHub..."}
                  </span>
                  <span className="shrink-0">
                    {pushProgress.processed} / {pushProgress.total} file
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Column - File List & Editor */}
        <div className="lg:col-span-8 space-y-6">
          <Card className="min-h-[600px] flex flex-col p-0 overflow-hidden">
            <div className="p-4 border-b-4 border-black bg-black text-white flex items-center justify-between">
              <h3 className="font-display font-black uppercase text-lg tracking-wider">File Manager</h3>
              <div className="flex items-center gap-2">
                {fetchingFiles && <Loader2 className="animate-spin w-4 h-4 text-yellow-400" />}
                <span className="text-xs bg-yellow-400 text-black px-2 py-1 rounded font-bold">{files.length} FILES</span>
              </div>
            </div>

            <AnimatePresence>
              {deleteProgress && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="p-3 bg-white border-b-4 border-black"
                >
                  <div className="p-3 bg-white border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {deleteProgress.completed ? (
                          <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                        ) : (
                          <Loader2 size={16} className="animate-spin text-black shrink-0" />
                        )}
                        <span className="text-xs font-black uppercase truncate">
                          {deleteProgress.completed
                            ? `Hapus Selesai (${deleteProgress.total} file)`
                            : `Menghapus: ${deleteProgress.currentFile}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-black px-1.5 py-0.5 border-2 border-black bg-yellow-300">
                          {deleteProgress.percent}%
                        </span>
                        {deleteProgress.completed && (
                          <button
                            type="button"
                            onClick={() => setDeleteProgress(null)}
                            className="p-0.5 hover:bg-gray-200 border-2 border-black transition-colors"
                            title="Tutup"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="w-full h-4 bg-gray-200 border-2 border-black overflow-hidden">
                      <motion.div
                        className={cn(
                          "h-full transition-all duration-200",
                          deleteProgress.percent > 0 && deleteProgress.percent < 100 && "border-r-2 border-black",
                          deleteProgress.completed ? "bg-green-400" : "bg-red-400"
                        )}
                        initial={{ width: 0 }}
                        animate={{ width: `${deleteProgress.percent}%` }}
                        transition={{ duration: 0.15 }}
                      />
                    </div>
                    <div className="flex justify-between items-center mt-1.5 text-[10px] font-black uppercase text-gray-600">
                      <span className="truncate mr-2">
                        {deleteProgress.completed ? deleteProgress.currentFile : "Menghapus dari GitHub..."}
                      </span>
                      <span className="shrink-0">
                        {deleteProgress.processed} / {deleteProgress.total} file
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2">
              {/* File List */}
              <div className="border-r-0 md:border-r-4 border-black overflow-y-auto max-h-[500px] bg-white relative">
                {!fetchingFiles && files.length > 0 && (
                  <div className="p-3 border-b-4 border-black flex flex-col gap-3 bg-white sticky top-0 z-10">
                    <div className="flex items-center gap-2">
                       {currentDirectory && (
                          <button 
                            onClick={() => {
                              const parts = currentDirectory.split('/');
                              parts.pop();
                              setCurrentDirectory(parts.join('/'));
                            }} 
                            className="p-1 border-2 border-black hover:bg-gray-100 transition-colors"
                            title="Back"
                          >
                            <CornerUpLeft size={16} />
                          </button>
                       )}
                       <div className="font-mono text-xs font-bold px-2 truncate flex-1 flex items-center gap-2 bg-gray-100 p-1.5 border-2 border-gray-200 shrink-0">
                         <Folder size={14} className="text-blue-500 shrink-0" />
                         <span className="truncate">/{currentDirectory}</span>
                       </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer border-2 border-black px-3 py-1.5 font-bold text-xs uppercase hover:bg-gray-100 transition-colors">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 accent-black cursor-pointer"
                          checked={currentDirFileIndices.length > 0 && currentDirFileIndices.every(i => selectedFileIndexes.includes(i))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedFileIndexes(prev => Array.from(new Set([...prev, ...currentDirFileIndices])));
                            } else {
                              setSelectedFileIndexes(prev => prev.filter(i => !currentDirFileIndices.includes(i)));
                            }
                          }}
                        />
                        PILIH SEMUA
                      </label>
                      <button 
                        disabled={selectedFileIndexes.length === 0}
                        onClick={handleDeleteSelected}
                        className="flex items-center gap-2 border-2 border-red-500 bg-red-200 text-red-600 px-3 py-1.5 font-bold text-xs uppercase disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-300 transition-colors"
                      >
                        <Trash2 size={16} />
                        HAPUS ({selectedFileIndexes.length})
                      </button>
                    </div>
                  </div>
                )}
                {fetchingFiles ? (
                  <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                    <Loader2 size={48} className="animate-spin mb-4 text-blue-500" />
                    <p className="font-bold uppercase text-xs">Mengambil struktur folder...</p>
                  </div>
                ) : files.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 p-12 text-center italic">
                    <FileText size={48} className="mb-4 opacity-20" />
                    <p className="font-bold uppercase text-xs">Belum ada file di repositori ini</p>
                  </div>
                ) : (
                  <div className="divide-y-4 divide-black">
                    {visibleItems.map((item, idx) => {
                      if (item.type === 'folder') {
                        const folderPrefix = item.path + '/';
                        const folderFileIndices: number[] = [];
                        files.forEach((f, i) => {
                          if (f.path.startsWith(folderPrefix)) {
                            folderFileIndices.push(i);
                          }
                        });
                        const selectedInFolder = folderFileIndices.filter(i => selectedFileIndexes.includes(i)).length;
                        const isFolderSelected = folderFileIndices.length > 0 && selectedInFolder === folderFileIndices.length;
                        const isFolderPartial = selectedInFolder > 0 && selectedInFolder < folderFileIndices.length;

                        return (
                          <div 
                            key={`folder-${idx}`}
                            className={cn(
                              "p-4 flex items-center gap-3 cursor-pointer group transition-colors",
                              isFolderSelected ? "bg-blue-50" : "hover:bg-gray-100"
                            )}
                            onClick={() => setCurrentDirectory(item.path)}
                          >
                            <input
                              type="checkbox"
                              className="w-5 h-5 accent-black cursor-pointer shrink-0"
                              checked={isFolderSelected}
                              ref={(el) => {
                                if (el) el.indeterminate = isFolderPartial;
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                e.stopPropagation();
                                if (e.target.checked) {
                                  setSelectedFileIndexes(prev => Array.from(new Set([...prev, ...folderFileIndices])));
                                } else {
                                  setSelectedFileIndexes(prev => prev.filter(i => !folderFileIndices.includes(i)));
                                }
                              }}
                            />
                            <Folder size={20} className="text-blue-500 shrink-0" />
                            <span className="flex-1 font-bold text-sm truncate">{item.name}</span>
                            <div className="flex items-center gap-2 shrink-0">
                               <button 
                                 onClick={(e) => { e.stopPropagation(); handleDeleteFolder(item.path); }}
                                 className="p-2 border-2 border-transparent hover:border-red-500 hover:bg-red-50 text-gray-400 hover:text-red-600 transition-all rounded-lg"
                                 title="Hapus Folder & Isinya"
                               >
                                  <Trash2 size={18} />
                               </button>
                               <ChevronRight size={16} className="text-gray-300" />
                            </div>
                          </div>
                        );
                      }

                      const isSelected = selectedFileIndexes.includes(item.index);
                      return (
                      <div 
                        key={`file-${idx}`}
                        className={cn(
                          "p-4 flex items-center gap-3 cursor-pointer group transition-colors",
                          editingFile === item.index ? "bg-yellow-200" : isSelected ? "bg-blue-50" : "hover:bg-gray-100"
                        )}
                        onClick={() => {
                          setEditingFile(item.index);
                          fetchFileContent(item.index);
                        }}
                      >
                        <input 
                          type="checkbox"
                          className="w-5 h-5 accent-black cursor-pointer shrink-0"
                          checked={isSelected}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            if (e.target.checked) {
                              setSelectedFileIndexes(prev => [...prev, item.index]);
                            } else {
                              setSelectedFileIndexes(prev => prev.filter(i => i !== item.index));
                            }
                          }}
                        />
                        <FileText size={20} className={editingFile === item.index ? "text-black shrink-0" : "text-gray-400 shrink-0"} />
                        <span className="flex-1 font-bold text-sm truncate">{item.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              handleDeleteFileFromGitHub(item.index); 
                            }}
                            className="p-2 border-2 border-transparent hover:border-red-500 hover:bg-red-50 text-gray-400 hover:text-red-600 transition-all rounded-lg"
                            title={(files[item.index] as any).sha ? "Hapus dari GitHub Permanen" : "Hapus dari daftar"}
                          >
                            <Trash2 size={18} />
                          </button>
                          <ChevronRight size={16} className="text-gray-300" />
                        </div>
                      </div>
                    )})}
                  </div>
                )}
              </div>

              {/* Editor */}
              <div className="flex flex-col bg-[#0d1117] relative">
                {editingFile !== null && files[editingFile] ? (
                  <div className="h-full flex flex-col">
                    {/* Editor Header/Toolbar */}
                    <div className="p-3 bg-[#161b22] border-b-2 border-black flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1.5 px-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                          <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                        </div>
                        <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest ml-2">Editor Mode</span>
                      </div>
                      <button 
                        onClick={() => setEditingFile(null)}
                        className="text-[10px] bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded font-bold uppercase transition-colors"
                      >
                        Tutup
                      </button>
                    </div>

                    <div className="p-4 bg-[#0d1117] border-b-2 border-black space-y-2">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase text-blue-400">
                        <FileText size={12} /> File Path
                      </div>
                      <input 
                        value={files[editingFile].path} 
                        onChange={(e) => updateFilePath(e.target.value)}
                        className="w-full bg-[#161b22] text-white border-2 border-black/50 focus:border-blue-500 p-2 font-mono text-xs rounded outline-none transition-colors"
                        spellCheck={false}
                      />
                    </div>

                    <div className="flex-1 relative flex">
                      {/* Gutter / Line Numbers Mock */}
                      <div className="w-12 bg-[#161b22] border-r-2 border-black flex flex-col items-center pt-4 select-none opacity-30">
                        {[...Array(20)].map((_, i) => (
                           <span key={i} className="text-[10px] font-mono text-gray-500 h-[1.5rem] leading-[1.5rem]">{i + 1}</span>
                        ))}
                      </div>

                      <textarea
                        className="flex-1 p-4 font-mono text-sm focus:outline-none bg-[#0d1117] text-gray-300 resize-none selection:bg-blue-500/30 leading-[1.5rem]"
                        value={files[editingFile].content || ""}
                        onChange={(e) => updateFileContent(e.target.value)}
                        spellCheck={false}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-600 p-8 text-center italic bg-[#0d1117]">
                    <div className="w-20 h-20 border-4 border-dashed border-gray-800 rounded-full flex items-center justify-center mb-4">
                      <ArrowRight size={32} className="opacity-20 rotate-90 md:rotate-0" />
                    </div>
                    <p className="font-bold uppercase text-[10px] tracking-widest text-gray-500">Pilih file dari daftar untuk mulai mengedit</p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </main>

      {/* Create Repo Modal */}
      <Modal
        isOpen={showCreateRepo}
        onClose={() => setShowCreateRepo(false)}
        title="BUAT REPOSITORI BARU"
        confirmText={creatingRepo ? "MEMBUAT..." : "BUAT REPO"}
        confirmVariant="yellow"
        onConfirm={handleCreateRepo}
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase text-gray-500">Nama Repositori</span>
            <Input 
              value={newRepoName}
              onChange={(e: any) => setNewRepoName(e.target.value)}
              placeholder="my-repo-name"
            />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase text-gray-500">Deskripsi (Opsional)</span>
            <Input 
              value={newRepoDesc}
              onChange={(e: any) => setNewRepoDesc(e.target.value)}
              placeholder="Tentang proyek ini..."
            />
          </div>
          <div className="flex items-center gap-4 pt-2">
            <button 
              onClick={() => setIsPrivate(false)}
              className={cn(
                "flex-1 p-3 border-4 border-black flex items-center justify-center gap-2 font-bold transition-all",
                !isPrivate ? "bg-green-400 translate-x-[-2px] translate-y-[-2px] shadow-[4px_4px_0px_rgba(0,0,0,1)]" : "bg-white opacity-50"
              )}
            >
              <Globe size={18} /> PUBLIC
            </button>
            <button 
              onClick={() => setIsPrivate(true)}
              className={cn(
                "flex-1 p-3 border-4 border-black flex items-center justify-center gap-2 font-bold transition-all",
                isPrivate ? "bg-red-400 translate-x-[-2px] translate-y-[-2px] shadow-[4px_4px_0px_rgba(0,0,0,1)]" : "bg-white opacity-50"
              )}
            >
              <Lock size={18} /> PRIVATE
            </button>
          </div>
        </div>
      </Modal>

      {/* Security Warning Modal */}
      <Modal
        isOpen={!!securityWarning}
        onClose={() => setSecurityWarning(null)}
        title="PERINGATAN KEAMANAN"
        confirmText="MENGERTI"
        confirmVariant="danger"
        onConfirm={() => setSecurityWarning(null)}
      >
        <div className="flex items-start gap-4 p-2 bg-red-100 border-2 border-red-500 rounded p-4 text-left">
          <AlertCircle size={32} className="text-red-500 shrink-0" />
          <p className="font-bold text-red-700 leading-tight">{securityWarning}</p>
        </div>
      </Modal>

      {/* Confirm Modal */}
      <Modal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        title={confirmModal.title}
        confirmText={confirmModal.confirmText}
        confirmVariant={confirmModal.confirmVariant}
        onConfirm={confirmModal.onConfirm}
      >
        <p className="text-sm">{confirmModal.message}</p>
      </Modal>

      {/* Footer Info */}
      <footer className="max-w-6xl mx-auto p-12 text-center opacity-50">
        <p className="text-xs font-black uppercase text-gray-400 tracking-widest flex items-center justify-center gap-2">
          ZYCHO
        </p>
      </footer>
    </div>
  );
}
