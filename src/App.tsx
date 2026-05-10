import React, { useState, useEffect } from "react";
import { Octokit } from "octokit";
import JSZip from "jszip";
import { Github, Upload, FileText, Trash2, Send, LogOut, ChevronRight, AlertCircle, CheckCircle2, Loader2, FolderOpen, ArrowRight, Plus, Globe, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Card, Input } from "./components/UI";
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

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("gh_token"));
  const [user, setUser] = useState<any>(null);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [branch, setBranch] = useState("main");
  const [files, setFiles] = useState<GitHubFile[]>([]);
  const [fetchingFiles, setFetchingFiles] = useState(false);
  const [editingFile, setEditingFile] = useState<number | null>(null);
  const [commitMessage, setCommitMessage] = useState("Feat: push from GitHub Fast Push");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  // New Repo State
  const [showCreateRepo, setShowCreateRepo] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoDesc, setNewRepoDesc] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [creatingRepo, setCreatingRepo] = useState(false);

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
    const octokit = new Octokit({ auth: token });
    const [owner, repo] = repoFullName.split("/");

    try {
      // Get the tree recursively
      const { data } = await octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: branchName,
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
      const { data } = await octokit.rest.repos.listForAuthenticatedUser({ sort: "updated", per_page: 100 });
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
        .then(({ data }) => setUser(data))
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
    const confirmDelete = window.confirm(`APAKAH ANDA YAKIN? Ini akan menghapus repositori ${selectedRepo.full_name} SECARA PERMANEN dari GitHub!`);
    if (!confirmDelete) return;

    setLoading(true);
    setStatus({ type: "info", message: "Deleting repository..." });

    try {
      const octokit = new Octokit({ auth: token });
      const [owner, repo] = selectedRepo.full_name.split("/");
      await octokit.rest.repos.delete({ owner, repo });

      setStatus({ type: "success", message: `Repository ${selectedRepo.full_name} deleted.` });
      setSelectedRepo(null);
      setFiles([]);
      fetchRepos(token);
    } catch (err: any) {
      console.error(err);
      setStatus({ type: "error", message: `Delete failed: ${err.message}. Pastikan token OAuth Anda memiliki izin 'delete_repo'.` });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFileFromGitHub = async (index: number) => {
    const file = files[index];
    if (!selectedRepo || !token || !file.path) return;
    
    // Check if it's a new file (not on GitHub yet)
    if (!(file as any).sha) {
      removeFile(index);
      return;
    }

    const confirmDelete = window.confirm(`Hapus file "${file.path}" dari GitHub?`);
    if (!confirmDelete) return;

    setLoading(true);
    setStatus({ type: "info", message: `Deleting ${file.path}...` });

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

      setStatus({ type: "success", message: `File ${file.path} deleted from GitHub.` });
      removeFile(index);
    } catch (err: any) {
      console.error(err);
      setStatus({ type: "error", message: `Failed to delete file: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles) return;

    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      if (file.name.endsWith(".zip")) {
        try {
          const zip = await JSZip.loadAsync(file);
          const extractedFiles: GitHubFile[] = [];
          const promises = Object.keys(zip.files).map(async (filename) => {
            const zipFile = zip.files[filename];
            if (!zipFile.dir) {
              const content = await zipFile.async("string");
              extractedFiles.push({ path: filename, content });
            }
          });
          await Promise.all(promises);
          setFiles(prev => [...prev, ...extractedFiles]);
        } catch (err) {
          console.error("ZIP load error:", err);
          setStatus({ type: "error", message: "Gagal memproses file ZIP." });
        }
      } else {
        const reader = new FileReader();
        reader.onload = (event) => {
          setFiles(prev => [...prev, { path: file.name, content: event.target?.result as string }]);
        };
        reader.readAsText(file);
      }
    }
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
    setLoading(true);
    setStatus({ type: "info", message: "Preparing push..." });

    try {
      const octokit = new Octokit({ auth: token });
      const [owner, repo] = selectedRepo.full_name.split("/");

      // 1. Get latest commit SHA
      const { data: refData } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
      const latestCommitSha = refData.object.sha;

      // 2. Create Blobs for files that have content (new or modified)
      const blobs = await Promise.all(
        files
          .filter(f => f.content !== "") 
          .map(async (f) => {
            const { data: blob } = await octokit.rest.git.createBlob({
              owner,
              repo,
              content: f.content,
              encoding: "utf-8",
            });
            return { path: f.path, sha: blob.sha, mode: "100644" as const, type: "blob" as const };
          })
      );

      // 3. Create Tree
      const { data: treeData } = await octokit.rest.git.createTree({
        owner,
        repo,
        base_tree: latestCommitSha,
        tree: blobs,
      });

      // 4. Create Commit
      const { data: commitData } = await octokit.rest.git.createCommit({
        owner,
        repo,
        message: commitMessage,
        tree: treeData.sha,
        parents: [latestCommitSha],
      });

      // 5. Update Ref
      await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: commitData.sha,
      });

      setStatus({ type: "success", message: `Successfully pushed ${files.length} files to ${selectedRepo.full_name}!` });
      setFiles([]);
      setEditingFile(null);
    } catch (err: any) {
      console.error(err);
      setStatus({ type: "error", message: `Push failed: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

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
              <button 
                onClick={() => setShowCreateRepo(!showCreateRepo)}
                className={cn(
                  "p-1 border-2 border-black transition-colors rounded hover:bg-black hover:text-white",
                  showCreateRepo && "bg-black text-white"
                )}
                title="Create New Repo"
              >
                <Plus size={16} />
              </button>
            </div>
            
            <AnimatePresence>
              {showCreateRepo ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden space-y-4 pt-2"
                >
                  <div className="p-4 border-4 border-black bg-blue-50 space-y-3">
                    <h3 className="font-black text-xs uppercase text-blue-600">Create New Repository</h3>
                    <div>
                      <label className="text-[10px] font-black uppercase mb-1 block">Repo Name</label>
                      <Input 
                        value={newRepoName} 
                        onChange={(e) => setNewRepoName(e.target.value)} 
                        placeholder="my-new-app"
                        className="text-sm py-1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase mb-1 block">Description</label>
                      <Input 
                        value={newRepoDesc} 
                        onChange={(e) => setNewRepoDesc(e.target.value)} 
                        placeholder="Optonal description"
                        className="text-sm py-1"
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setIsPrivate(false)}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-2 py-1 border-2 border-black font-bold text-xs",
                          !isPrivate ? "bg-white" : "bg-gray-200 opacity-50"
                        )}
                      >
                        <Globe size={12} /> Public
                      </button>
                      <button 
                        onClick={() => setIsPrivate(true)}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-2 py-1 border-2 border-black font-bold text-xs",
                          isPrivate ? "bg-white" : "bg-gray-200 opacity-50"
                        )}
                      >
                        <Lock size={12} /> Private
                      </button>
                    </div>
                    <Button 
                      variant="yellow" 
                      className="w-full py-2 text-xs shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)]"
                      onClick={handleCreateRepo}
                      disabled={creatingRepo || !newRepoName}
                    >
                      {creatingRepo ? <Loader2 className="animate-spin mx-auto" size={16} /> : "CREATE REPO"}
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <div className="space-y-4">
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
                    <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" />
                  </div>

                  <div>
                    <label className="text-xs font-black uppercase mb-1 block">Pesan Commit</label>
                    <Input value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)} />
                  </div>
                </div>
              )}
            </AnimatePresence>
          </Card>

          <Card className="bg-yellow-100">
            <h3 className="font-black text-sm uppercase mb-3 flex items-center gap-2">
              <Upload size={18} /> Upload File
            </h3>
            <label className="group block cursor-pointer">
              <div className="border-4 border-dashed border-black p-8 text-center bg-white group-hover:bg-yellow-50 transition-colors">
                <Upload className="mx-auto mb-2 text-black group-hover:scale-110 transition-transform" />
                <p className="text-sm font-black">Klik atau Drag File/ZIP</p>
                <p className="text-[10px] uppercase mt-2 text-gray-500 font-black">Mendukung multi-upload</p>
              </div>
              <input type="file" multiple className="hidden" onChange={handleFileUpload} />
            </label>
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

          <Button 
            variant="yellow" 
            className="w-full py-4 text-xl flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading || !selectedRepo || files.length === 0}
            onClick={handlePush}
          >
            {loading ? <Loader2 className="animate-spin" /> : <Send />}
            PUSH TO GITHUB
          </Button>
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

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2">
              {/* File List */}
              <div className="border-r-0 md:border-r-4 border-black overflow-y-auto max-h-[500px]">
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
                    {files.map((file, idx) => (
                      <div 
                        key={idx}
                        className={cn(
                          "p-4 flex items-center gap-3 cursor-pointer group transition-colors",
                          editingFile === idx ? "bg-yellow-200" : "hover:bg-gray-100"
                        )}
                        onClick={() => {
                          setEditingFile(idx);
                          fetchFileContent(idx);
                        }}
                      >
                        <FileText size={20} className={editingFile === idx ? "text-black" : "text-gray-400"} />
                        <span className="flex-1 font-bold text-sm truncate">{file.path}</span>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              handleDeleteFileFromGitHub(idx); 
                            }}
                            className="p-1 hover:text-red-600 transition-colors"
                            title={(file as any).sha ? "Hapus dari GitHub Permanen" : "Hapus dari daftar"}
                          >
                            <Trash2 size={16} />
                          </button>
                          <ChevronRight size={16} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Editor */}
              <div className="flex flex-col bg-gray-50">
                {editingFile !== null && files[editingFile] ? (
                  <div className="h-full flex flex-col">
                    <div className="p-4 bg-white border-b-4 border-black space-y-3">
                      <div className="flex items-center gap-2 text-xs font-black uppercase text-gray-500">
                        <FileText size={14} /> Nama File
                      </div>
                      <Input 
                        value={files[editingFile].path} 
                        onChange={(e) => updateFilePath(e.target.value)}
                        className="bg-gray-50 text-sm"
                      />
                    </div>
                    <textarea
                      className="flex-1 p-4 font-mono text-sm focus:outline-none bg-[#1e1e1e] text-green-400 resize-none selection:bg-white selection:text-black"
                      value={files[editingFile].content || ""}
                      onChange={(e) => updateFileContent(e.target.value)}
                      spellCheck={false}
                    />
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center italic">
                    <ArrowRight size={48} className="mb-4 opacity-20 rotate-90 md:rotate-0" />
                    <p className="font-bold uppercase text-xs">Pilih file untuk diedit</p>
                  </div>
                )}
              </div>
            </div>
          </Card>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-pink-100 flex items-center gap-4">
              <div className="bg-black text-white p-3 rounded-xl shadow-[4px_4px_0px_rgba(0,0,0,0.2)]">
                <CheckCircle2 />
              </div>
              <div>
                <p className="text-xs uppercase font-black text-gray-600">Fitur Utama</p>
                <p className="font-bold">Multi-file Pushing</p>
              </div>
            </Card>
            <Card className="bg-blue-100 flex items-center gap-4">
              <div className="bg-black text-white p-3 rounded-xl shadow-[4px_4px_0px_rgba(0,0,0,0.2)]">
                <FolderOpen />
              </div>
              <div>
                <p className="text-xs uppercase font-black text-gray-600">Extract ZIP</p>
                <p className="font-bold">Auto Unzip & Edit</p>
              </div>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="max-w-6xl mx-auto p-12 text-center opacity-50">
        <p className="text-xs font-black uppercase text-gray-400 tracking-widest flex items-center justify-center gap-2">
          Build with <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity }} className="text-red-500">❤️</motion.span> for developers
        </p>
      </footer>
    </div>
  );
}
