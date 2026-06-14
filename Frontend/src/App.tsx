import { useState, useEffect, useRef } from "react";
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Terminal,
  GitBranch,
  User,
  Hash,
  RefreshCw,
  Search,
  ChevronRight,
  Copy,
  ArrowDown,
  Database,
  ExternalLink,
  Zap,
} from "lucide-react";

interface Deployment {
  _id: string;
  runId: string;
  repoFullName: string;
  branch: string;
  commitSha: string;
  commitMessage?: string;
  pusher?: string;
  targetType: "ssh" | "s3" | "local";
  targetDir?: string;
  status: "queued" | "running" | "success" | "failed" | "rolled_back" | "cancelled";
  logs: string;
  exitCode?: number | null;
  trigger?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  createdAt: string;
  updatedAt: string;
}

export default function App() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRepo, setSelectedRepo] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");

  // SSE log streaming states
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);

  const selectedDeployment = deployments.find((d) => d.runId === selectedId);

  // Fetch all deployments from Backend
  const fetchDeployments = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/deploy");
      if (!res.ok) throw new Error(`Server returned status ${res.status}`);
      const data = await res.json();
      setDeployments(data.deployments || []);
      setError(null);
    } catch (err: any) {
      console.error("Fetch deployments error:", err);
      setError(err.message || "Failed to load deployments");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeployments();
    const interval = setInterval(() => fetchDeployments(true), 10000);
    return () => clearInterval(interval);
  }, []);

  // Manage Log Streaming (SSE) for the selected deployment
  useEffect(() => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    setLiveLogs([]);

    if (!selectedDeployment) return;

    // If active (running/queued), open SSE stream
    if (
      selectedDeployment.status === "running" ||
      selectedDeployment.status === "queued"
    ) {
      const eventSource = new EventSource(`/logs/${selectedDeployment.runId}`);
      sseRef.current = eventSource;

      eventSource.addEventListener("log", (event: any) => {
        setLiveLogs((prev) => [...prev, event.data]);
      });

      eventSource.onerror = (err) => {
        console.error("SSE stream error:", err);
        eventSource.close();
      };

      return () => {
        eventSource.close();
      };
    } else {
      // Completed deployment - load static logs from database
      if (selectedDeployment.logs) {
        setLiveLogs(selectedDeployment.logs.split("\n"));
      } else {
        setLiveLogs(["[System] No logs available for this deployment."]);
      }
    }
  }, [selectedId, selectedDeployment?.status]);

  // Autoscroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveLogs]);

  // Statistics calculation
  const totalRuns = deployments.length;
  const successfulRuns = deployments.filter((d) => d.status === "success").length;
  const successRate = totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0;
  const activeRuns = deployments.filter(
    (d) => d.status === "running" || d.status === "queued"
  ).length;

  const totalDuration = deployments.reduce(
    (acc, cur) => acc + (cur.durationMs || 0),
    0
  );
  const avgDurationMs = totalRuns > 0 ? Math.round(totalDuration / totalRuns) : 0;
  const avgDurationSec = (avgDurationMs / 1000).toFixed(1);

  // Filter repositories lists
  const uniqueRepos = ["All", ...Array.from(new Set(deployments.map((d) => d.repoFullName)))];

  const filteredDeployments = deployments.filter((d) => {
    const matchesSearch =
      d.commitMessage?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.commitSha?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.runId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.pusher?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRepo = selectedRepo === "All" || d.repoFullName === selectedRepo;
    const matchesStatus = selectedStatus === "All" || d.status === selectedStatus;

    return matchesSearch && matchesRepo && matchesStatus;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-5 h-5 text-emerald-400" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-rose-500" />;
      case "running":
        return <Activity className="w-5 h-5 text-blue-400 animate-pulse" />;
      case "queued":
        return <Clock className="w-5 h-5 text-amber-400 animate-pulse" />;
      default:
        return <Clock className="w-5 h-5 text-zinc-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      success: "bg-emerald-950/40 text-emerald-400 border-emerald-500/30",
      failed: "bg-rose-950/40 text-rose-400 border-rose-500/30",
      running: "bg-blue-950/40 text-blue-400 border-blue-500/30 animate-pulse",
      queued: "bg-amber-955/40 text-amber-400 border-amber-500/30",
      rolled_back: "bg-orange-950/40 text-orange-400 border-orange-500/30",
      cancelled: "bg-zinc-800/60 text-zinc-400 border-zinc-700/50",
    };
    return (
      <span
        className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${
          styles[status] || styles.cancelled
        }`}
      >
        {status.toUpperCase().replace("_", " ")}
      </span>
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute bottom-10 right-1/4 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none -z-10" />

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-8 border-b border-slate-800/80 gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-xl shadow-lg shadow-indigo-500/20">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                ShipIt Pipeline
              </h1>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Self-Hosted CI/CD Deployment Server
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => fetchDeployments()}
              className="inline-flex items-center px-3.5 py-2 text-sm font-semibold rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition duration-200"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <div className="h-2 w-2 bg-emerald-400 rounded-full animate-ping" />
            <span className="text-xs font-semibold text-emerald-400 tracking-wider uppercase">
              Server Active
            </span>
          </div>
        </header>

        {/* Stats Grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 py-8">
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/70 p-5 rounded-2xl">
            <div className="flex justify-between items-start">
              <span className="text-sm font-semibold text-slate-400">Total Runs</span>
              <Database className="w-5 h-5 text-indigo-400" />
            </div>
            <p className="text-3xl font-bold tracking-tight mt-3">{totalRuns}</p>
          </div>

          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/70 p-5 rounded-2xl">
            <div className="flex justify-between items-start">
              <span className="text-sm font-semibold text-slate-400">Success Rate</span>
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex items-baseline space-x-1.5 mt-3">
              <p className="text-3xl font-bold tracking-tight">{successRate}%</p>
              <span className="text-xs text-slate-500 font-medium">({successfulRuns} of {totalRuns})</span>
            </div>
          </div>

          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/70 p-5 rounded-2xl">
            <div className="flex justify-between items-start">
              <span className="text-sm font-semibold text-slate-400">Avg Duration</span>
              <Clock className="w-5 h-5 text-blue-400" />
            </div>
            <p className="text-3xl font-bold tracking-tight mt-3">{avgDurationSec}s</p>
          </div>

          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/70 p-5 rounded-2xl">
            <div className="flex justify-between items-start">
              <span className="text-sm font-semibold text-slate-400">Active Runs</span>
              <Activity className="w-5 h-5 text-amber-400" />
            </div>
            <p className="text-3xl font-bold tracking-tight mt-3">
              {activeRuns}
              {activeRuns > 0 && (
                <span className="inline-flex items-center ml-2 px-2 py-0.5 text-xs font-semibold rounded bg-amber-950/60 text-amber-400 border border-amber-800/50 animate-pulse">
                  Deploying
                </span>
              )}
            </p>
          </div>
        </section>

        {error && (
          <div className="p-4 mb-6 rounded-xl bg-rose-950/40 border border-rose-500/20 text-rose-300 text-sm">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Workspace Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Panel: List & Filters */}
          <div className="lg:col-span-5 space-y-4">
            {/* Filter Panel */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 p-4 rounded-2xl space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search commits, sha, or pusher..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm bg-slate-950 border border-slate-800 rounded-xl focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition"
                />
              </div>

              <div className="flex gap-2.5">
                <div className="flex-1">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Repository</label>
                  <select
                    value={selectedRepo}
                    onChange={(e) => setSelectedRepo(e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg focus:outline-none"
                  >
                    {uniqueRepos.map((repo) => (
                      <option key={repo} value={repo}>
                        {repo === "All" ? "All Repositories" : repo.split("/")[1] || repo}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex-1">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Status</label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg focus:outline-none"
                  >
                    <option value="All">All Statuses</option>
                    <option value="success">Success</option>
                    <option value="failed">Failed</option>
                    <option value="running">Running</option>
                    <option value="queued">Queued</option>
                    <option value="rolled_back">Rolled Back</option>
                  </select>
                </div>
              </div>
            </div>

            {/* List */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-2xl overflow-hidden divide-y divide-slate-800/60 max-h-[600px] overflow-y-auto">
              {filteredDeployments.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">
                  {loading ? "Loading deployments..." : "No deployments found."}
                </div>
              ) : (
                filteredDeployments.map((d) => (
                  <button
                    key={d.runId}
                    onClick={() => setSelectedId(d.runId)}
                    className={`w-full text-left p-4 hover:bg-slate-900/60 transition flex items-center justify-between border-l-2 ${
                      selectedId === d.runId
                        ? "bg-slate-900/80 border-indigo-500"
                        : "border-transparent"
                    }`}
                  >
                    <div className="space-y-1.5 flex-1 min-w-0 pr-4">
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(d.status)}
                        <span className="font-semibold text-sm truncate text-slate-200">
                          {d.repoFullName.split("/")[1]}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-850 text-slate-400 font-mono">
                          {d.branch}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 truncate">
                        {d.commitMessage || "No commit message"}
                      </p>
                      <div className="flex items-center space-x-3 text-[10px] text-slate-500">
                        <span className="font-mono">{d.commitSha?.slice(0, 7) || "unknown"}</span>
                        <span>•</span>
                        <span>{d.pusher || "unknown"}</span>
                        <span>•</span>
                        <span>
                          {d.durationMs ? `${(d.durationMs / 1000).toFixed(1)}s` : "-"}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right Panel: Detail Log Console */}
          <div className="lg:col-span-7">
            {selectedDeployment ? (
              <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-2xl overflow-hidden flex flex-col min-h-[640px]">
                {/* Detail Header */}
                <div className="p-5 border-b border-slate-800/80 bg-slate-900/20">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-3">
                        <h2 className="text-lg font-bold text-slate-100">
                          {selectedDeployment.repoFullName.split("/")[1]}
                        </h2>
                        {getStatusBadge(selectedDeployment.status)}
                      </div>
                      <p className="text-xs text-slate-400 font-mono">
                        Run ID: {selectedDeployment.runId}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={`https://github.com/${selectedDeployment.repoFullName}/commit/${selectedDeployment.commitSha}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-950 border border-slate-800 text-slate-350 hover:text-white transition"
                      >
                        <ExternalLink className="w-3 h-3 mr-1.5" />
                        GitHub Commit
                      </a>
                    </div>
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 text-xs text-slate-400 border-t border-slate-800/50 pt-4">
                    <div className="space-y-1">
                      <span className="flex items-center text-slate-500 font-medium">
                        <GitBranch className="w-3.5 h-3.5 mr-1" /> Branch
                      </span>
                      <p className="font-semibold text-slate-305 font-mono">{selectedDeployment.branch}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="flex items-center text-slate-500 font-medium">
                        <User className="w-3.5 h-3.5 mr-1" /> Pusher
                      </span>
                      <p className="font-semibold text-slate-305">{selectedDeployment.pusher || "webhook"}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="flex items-center text-slate-500 font-medium">
                        <Hash className="w-3.5 h-3.5 mr-1" /> Commit
                      </span>
                      <p className="font-semibold font-mono text-slate-305">
                        {selectedDeployment.commitSha?.slice(0, 8) || "N/A"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <span className="flex items-center text-slate-500 font-medium">
                        <Clock className="w-3.5 h-3.5 mr-1" /> Duration
                      </span>
                      <p className="font-semibold text-slate-305">
                        {selectedDeployment.durationMs
                          ? `${(selectedDeployment.durationMs / 1000).toFixed(1)} seconds`
                          : "In progress"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 p-3 bg-slate-950/60 border border-slate-850 rounded-xl text-xs">
                    <strong className="text-slate-300">Commit Message:</strong>
                    <p className="text-slate-400 mt-1 italic">
                      "{selectedDeployment.commitMessage || "No commit message available"}"
                    </p>
                  </div>
                </div>

                {/* Console Bar */}
                <div className="flex items-center justify-between px-5 py-2.5 bg-slate-900/50 border-b border-slate-800/80">
                  <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400">
                    <Terminal className="w-4 h-4 text-indigo-400" />
                    <span>Deployment Logs</span>
                    {selectedDeployment.status === "running" && (
                      <span className="inline-flex items-center space-x-1">
                        <span className="h-1.5 w-1.5 bg-blue-400 rounded-full animate-ping" />
                        <span className="text-[10px] text-blue-400 uppercase">Streaming live</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => copyToClipboard(liveLogs.join("\n"))}
                      className="p-1.5 text-slate-400 hover:text-slate-200 bg-slate-950/60 hover:bg-slate-950 border border-slate-800 rounded-lg transition"
                      title="Copy full logs"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className="p-1.5 text-slate-400 hover:text-slate-200 bg-slate-950/60 hover:bg-slate-950 border border-slate-800 rounded-lg transition"
                      title="Scroll to bottom"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Terminal Console */}
                <div className="flex-1 bg-black p-5 font-mono text-xs overflow-y-auto max-h-[420px] select-text">
                  <div className="space-y-1">
                    {liveLogs.map((log, idx) => {
                      // Basic coloring heuristics
                      let color = "text-slate-300";
                      if (log.toLowerCase().includes("failed") || log.toLowerCase().includes("error:")) {
                        color = "text-rose-400";
                      } else if (log.toLowerCase().includes("success") || log.toLowerCase().includes("passed")) {
                        color = "text-emerald-400";
                      } else if (log.startsWith("+ ") || log.includes("[webhook]")) {
                        color = "text-indigo-400";
                      } else if (log.includes("warning") || log.includes("warn")) {
                        color = "text-amber-400";
                      }
                      return (
                        <div key={idx} className={`${color} whitespace-pre-wrap`}>
                          {log}
                        </div>
                      );
                    })}
                    {selectedDeployment.status === "running" && (
                      <div className="text-indigo-400 flex items-center space-x-1">
                        <span className="h-1 w-2 bg-indigo-400 animate-pulse inline-block" />
                        <span className="italic animate-pulse">Running step...</span>
                      </div>
                    )}
                    <div ref={terminalEndRef} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/20 border-2 border-dashed border-slate-800/80 rounded-2xl flex flex-col items-center justify-center p-12 text-center min-h-[640px]">
                <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800/50 mb-4 text-slate-550">
                  <Terminal className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="font-semibold text-slate-300 text-sm">No Run Selected</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  Choose a deployment pipeline from the left list history to inspect live build telemetry and historical logs.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
