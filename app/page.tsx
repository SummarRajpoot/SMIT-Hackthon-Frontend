"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type UIState = "UPLOAD" | "SEARCHING" | "RESULTS";

type Job = {
  title: string;
  company: string;
  location: string;
  url: string;
  score: number;
  description?: string | null;
};

type ChatRole = "user" | "ai";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
};

export default function Home() {
  const API_BASE = "http://localhost:8000";
  const router = useRouter();
  const { data: session, status } = useSession();

  const [uiState, setUiState] = useState<UIState>("UPLOAD");
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatTyping, setChatTyping] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [activeStep, setActiveStep] = useState(0);
  const steps = useMemo(
    () => ["Parsing CV", "Generating Queries", "Searching Jobs", "Ranking Results"],
    [],
  );

  const inputRef = useRef<HTMLInputElement | null>(null);

  const isValidFile = (f: File) => {
    const name = f.name.toLowerCase();
    return name.endsWith(".pdf") || name.endsWith(".docx");
  };

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  const reset = () => {
    setUiState("UPLOAD");
    setDragActive(false);
    setFile(null);
    setUploading(false);
    setSessionId(null);
    setJobs([]);
    setError(null);
    setActiveStep(0);
    setChatMessages([]);
    setChatInput("");
    setChatTyping(false);
    setChatError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const scoreBadge = (score: number) => {
    if (score >= 80) return "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30";
    if (score >= 50) return "bg-yellow-500/15 text-yellow-200 ring-1 ring-yellow-500/30";
    return "bg-rose-500/15 text-rose-200 ring-1 ring-rose-500/30";
  };

  const upload = async () => {
    setError(null);
    if (!file) {
      setError("Please select a PDF or DOCX CV first.");
      return;
    }
    if (!isValidFile(file)) {
      setError("Unsupported file type. Please upload a PDF or DOCX.");
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`${API_BASE}/upload-cv`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Upload failed (${res.status})`);
      }

      const data = (await res.json()) as { session_id?: string };
      if (!data.session_id) throw new Error("Upload succeeded but no session_id was returned.");

      setSessionId(data.session_id);
      setUiState("SEARCHING");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setUiState("UPLOAD");
    } finally {
      setUploading(false);
    }
  };

  const quickQuestions = useMemo(
    () => [
      "Which job is best for me?",
      "What skills should I improve?",
      "How to improve my CV?",
      "What salary can I expect?",
      "What role should I target next?",
      "How can I tailor my CV for these jobs?",
      "What projects should I build to stand out?",
      "How should I prepare for interviews?",
    ],
    [],
  );

  const sendChat = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || !sessionId) return;

    setChatError(null);
    setChatTyping(true);
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };
    setChatMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: trimmed }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Chat failed (${res.status})`);
      }

      const data = (await res.json()) as { message?: string; response?: string; content?: string };
      const aiText = (data.message ?? data.response ?? data.content ?? "").toString().trim();
      if (!aiText) throw new Error("Chat endpoint returned an empty response.");

      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "ai",
        content: aiText,
        createdAt: Date.now(),
      };
      setChatMessages((prev) => [...prev, aiMsg]);
    } catch (e) {
      setChatError(e instanceof Error ? e.message : "Chat failed.");
    } finally {
      setChatTyping(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatMessages.length, chatTyping]);

  useEffect(() => {
    if (uiState !== "SEARCHING" || !sessionId) return;

    const controller = new AbortController();
    let mounted = true;

    // Simple step animation while backend works
    setActiveStep(0);
    const t = window.setInterval(() => {
      setActiveStep((s) => (s < steps.length - 1 ? s + 1 : s));
    }, 1100);

    (async () => {
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/search-jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Search failed (${res.status})`);
        }

        const data = (await res.json()) as { jobs?: Job[] };
        const gotJobs = Array.isArray(data.jobs) ? data.jobs : [];

        if (!mounted) return;
        setJobs(gotJobs);
        setUiState("RESULTS");
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Search failed.");
        setUiState("UPLOAD");
      } finally {
        window.clearInterval(t);
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
      window.clearInterval(t);
    };
  }, [uiState, sessionId, steps.length]);

  return (
    <div className="min-h-dvh bg-[#070A12] text-zinc-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-500/20 via-cyan-400/15 to-fuchsia-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-[420px] w-[640px] rounded-full bg-gradient-to-tr from-emerald-400/10 via-sky-500/10 to-transparent blur-3xl" />
      </div>

      <main className="relative mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <header className="mb-10">
          <nav className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5 text-zinc-100"
                  fill="currentColor"
                >
                  <path d="M10 4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2h3a3 3 0 0 1 3 3v4.2a3 3 0 0 1-1.76 2.74l-.24.1V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.96l-.24-.1A3 3 0 0 1 2 13.2V9a3 3 0 0 1 3-3h3V4Zm4 2V4a0 0 0 0 0 0 0h-2a0 0 0 0 0 0 0v2h2Zm-9 4a1 1 0 0 0-1 1v2.2a1 1 0 0 0 .58.91l3.42 1.47V14a1 1 0 1 1 2 0v2h4v-2a1 1 0 1 1 2 0v1.58l3.42-1.47A1 1 0 0 0 22 13.2V11a1 1 0 0 0-1-1H5Zm1 10h12v-2.27l-4 1.72V20a1 1 0 1 1-2 0v-2h-4v2a1 1 0 1 1-2 0v-.55l-4-1.72V20Z" />
                </svg>
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold tracking-tight text-zinc-50">JobScout AI</div>
                <div className="text-xs text-zinc-400">Professional job discovery</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Powered by Groq + Gemini
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-zinc-300">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                SMIT Hackathon 2026
              </div>
              {session?.user && (
                <div className="ml-0 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1 sm:ml-1">
                  {session.user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={session.user.image}
                      alt={session.user.name ?? "User avatar"}
                      className="h-6 w-6 rounded-full ring-1 ring-white/10"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="h-6 w-6 rounded-full bg-white/10 ring-1 ring-white/10" />
                  )}
                  <span className="max-w-[140px] truncate text-xs font-medium text-zinc-200">
                    {session.user.name ?? "Signed in"}
                  </span>
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/10"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </nav>

          <div className="mt-10">
            <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
              <span className="bg-gradient-to-r from-indigo-300 via-cyan-200 to-fuchsia-300 bg-clip-text text-transparent">
                Find Your Dream Job with AI
              </span>
            </h1>
            <p className="mt-4 max-w-3xl text-pretty text-sm leading-7 text-zinc-300 sm:text-base">
              Upload your CV and let our autonomous AI agent search, match, and rank real job listings
              tailored to your profile.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {[
                "🤖 Autonomous Agent",
                "⚡ Real-time Results",
                "🎯 Smart Matching",
              ].map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </header>

        {uiState === "UPLOAD" && (
          <section className="grid gap-6">
            <div
              className={[
                "group relative rounded-2xl border bg-white/5 p-6 shadow-2xl shadow-black/30",
                dragActive ? "border-cyan-400/50 ring-2 ring-cyan-400/20" : "border-white/10",
              ].join(" ")}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
                const f = e.dataTransfer.files?.[0];
                if (!f) return;
                if (!isValidFile(f)) {
                  setError("Unsupported file type. Please upload a PDF or DOCX.");
                  return;
                }
                setError(null);
                setFile(f);
              }}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-100">Drag & drop your CV</p>
                  <p className="mt-1 text-sm text-zinc-300">
                    Accepted: <span className="font-medium text-zinc-200">PDF</span> or{" "}
                    <span className="font-medium text-zinc-200">DOCX</span>
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      if (!f) return setFile(null);
                      if (!isValidFile(f)) {
                        setFile(null);
                        setError("Unsupported file type. Please upload a PDF or DOCX.");
                        return;
                      }
                      setError(null);
                      setFile(f);
                    }}
                  />
                  <button
                    type="button"
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-100 hover:bg-white/10"
                    onClick={() => inputRef.current?.click()}
                    disabled={uploading}
                  >
                    Choose file
                  </button>
                  <button
                    type="button"
                    onClick={upload}
                    disabled={!file || uploading}
                    className={[
                      "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium",
                      "bg-gradient-to-r from-indigo-500 via-cyan-500 to-fuchsia-500 text-white",
                      "shadow-lg shadow-cyan-500/10 transition-opacity",
                      !file || uploading ? "opacity-60" : "hover:opacity-95",
                    ].join(" ")}
                  >
                    {uploading ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Uploading…
                      </>
                    ) : (
                      "Upload CV"
                    )}
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-200">
                {file ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="truncate">
                      Selected: <span className="font-medium text-zinc-50">{file.name}</span>
                    </span>
                    <button
                      type="button"
                      className="text-zinc-300 hover:text-zinc-50"
                      onClick={() => {
                        setFile(null);
                        setError(null);
                        if (inputRef.current) inputRef.current.value = "";
                      }}
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <span>No file selected yet.</span>
                )}
              </div>

              {error && (
                <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {error}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 animate-[jsai_fadeInUp_700ms_ease-out_both]">
              <h2 className="text-sm font-semibold text-zinc-100">How it works</h2>
              <div className="mt-4 grid gap-3 text-sm text-zinc-300 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4 transition-all duration-300 hover:-translate-y-1.5 hover:border-cyan-400/30 hover:ring-2 hover:ring-cyan-500/20">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-lg">📄</div>
                    <div>
                      <p className="font-medium text-zinc-100">1) Upload</p>
                      <p className="mt-1 text-sm leading-6 text-zinc-300">
                        Simply drag and drop your CV in PDF or DOCX format. Our system securely
                        extracts your skills, experience, education, and job history to build your
                        complete career profile.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4 transition-all duration-300 hover:-translate-y-1.5 hover:border-indigo-400/30 hover:ring-2 hover:ring-indigo-500/20">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-lg">🔍</div>
                    <div>
                      <p className="font-medium text-zinc-100">2) Search</p>
                      <p className="mt-1 text-sm leading-6 text-zinc-300">
                        Our AI agent autonomously generates smart search queries based on your
                        profile. It then searches real-time job listings using Tavily to find the
                        most relevant opportunities.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4 transition-all duration-300 hover:-translate-y-1.5 hover:border-fuchsia-400/30 hover:ring-2 hover:ring-fuchsia-500/20">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-lg">🎯</div>
                    <div>
                      <p className="font-medium text-zinc-100">3) Rank</p>
                      <p className="mt-1 text-sm leading-6 text-zinc-300">
                        Every job is evaluated against your CV using advanced LLM reasoning. Each
                        result gets a match score from 0-100 with a detailed explanation of why it
                        fits your profile.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <style jsx>{`
                @keyframes jsai_fadeInUp {
                  0% {
                    opacity: 0;
                    transform: translateY(10px);
                  }
                  100% {
                    opacity: 1;
                    transform: translateY(0);
                  }
                }
              `}</style>
            </div>
          </section>
        )}

        {uiState === "SEARCHING" && (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/30">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">AI Agent is searching for jobs…</h2>
                <p className="mt-2 text-sm text-zinc-300">
                  Session: <span className="font-mono text-zinc-200">{sessionId}</span>
                </p>
              </div>

              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
                <span className="inline-flex items-center gap-1">
                  Working
                  <span className="inline-flex w-10 justify-start">
                    <span className="animate-pulse">…</span>
                  </span>
                </span>
              </div>
            </div>

            <div className="mt-8 grid gap-3">
              {steps.map((s, idx) => {
                const done = idx < activeStep;
                const active = idx === activeStep;
                return (
                  <div
                    key={s}
                    className={[
                      "flex items-center justify-between rounded-xl border px-4 py-3 text-sm",
                      done
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
                        : active
                          ? "border-cyan-500/30 bg-cyan-500/10 text-zinc-100"
                          : "border-white/10 bg-black/20 text-zinc-300",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={[
                          "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                          done
                            ? "bg-emerald-400/20 text-emerald-200 ring-1 ring-emerald-500/30"
                            : active
                              ? "bg-cyan-400/20 text-cyan-200 ring-1 ring-cyan-500/30"
                              : "bg-white/5 text-zinc-300 ring-1 ring-white/10",
                        ].join(" ")}
                      >
                        {done ? "✓" : idx + 1}
                      </span>
                      <span className="font-medium">{s}</span>
                    </div>
                    {active && <span className="text-xs text-zinc-200">in progress</span>}
                  </div>
                );
              })}
            </div>

            {error && (
              <div className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            )}
          </section>
        )}

        {uiState === "RESULTS" && (
          <section className="grid gap-6">
            <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Top matches</h2>
                <p className="mt-1 text-sm text-zinc-300">
                  Showing <span className="font-medium text-zinc-100">{jobs.length}</span> results
                  ranked by match score.
                </p>
              </div>
              <button
                type="button"
                onClick={reset}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-100 hover:bg-white/10"
              >
                Search Again
              </button>
            </div>

            {jobs.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-sm text-zinc-300">
                No jobs returned. Try uploading a different CV or run again.
              </div>
            ) : (
              <div className="grid gap-4">
                {jobs.map((job, idx) => (
                  <article
                    key={`${job.url}-${idx}`}
                    className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-semibold text-zinc-50">
                          {job.title}
                        </h3>
                        <p className="mt-1 text-sm text-zinc-300">
                          <span className="font-medium text-zinc-100">{job.company}</span>
                          <span className="text-zinc-500"> • </span>
                          {job.location}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tabular-nums",
                            scoreBadge(job.score),
                          ].join(" ")}
                        >
                          Match {Math.round(job.score)}
                        </span>
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-100"
                        >
                          Apply
                        </a>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-200">
                      {job.description?.trim()
                        ? job.description
                        : "No description provided for this result."}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {sessionId && (
          <section className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-50">AI Career Chat</h2>
                <p className="mt-1 text-sm text-zinc-300">
                  Ask about your CV, best matches, skills to improve, and next steps.
                </p>
              </div>
              <p className="text-xs text-zinc-400">
                Session: <span className="font-mono text-zinc-300">{sessionId}</span>
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {quickQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-zinc-200 hover:bg-white/10"
                  onClick={() => {
                    setChatInput(q);
                    void sendChat(q);
                  }}
                  disabled={chatTyping}
                >
                  {q}
                </button>
              ))}
            </div>

            <div className="mt-5 h-[420px] overflow-hidden rounded-2xl border border-white/10 bg-black/20">
              <div className="h-full overflow-y-auto p-4">
                {chatMessages.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                    Start chatting once your session is created.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {chatMessages.map((m) => (
                      <div
                        key={m.id}
                        className={[
                          "flex w-full",
                          m.role === "user" ? "justify-end" : "justify-start",
                        ].join(" ")}
                      >
                        <div
                          className={[
                            "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6",
                            m.role === "user"
                              ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
                              : "bg-white/5 text-zinc-100 ring-1 ring-white/10",
                          ].join(" ")}
                        >
                          {m.content}
                        </div>
                      </div>
                    ))}

                    {chatTyping && (
                      <div className="flex justify-start">
                        <div className="rounded-2xl bg-white/5 px-4 py-3 text-sm text-zinc-200 ring-1 ring-white/10">
                          <span className="inline-flex items-center gap-2">
                            <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-300/70" />
                            <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-300/70 [animation-delay:150ms]" />
                            <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-300/70 [animation-delay:300ms]" />
                            <span className="ml-2 text-zinc-300">AI is typing</span>
                          </span>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}
              </div>
            </div>

            {chatError && (
              <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {chatError}
              </div>
            )}

            <form
              className="mt-4 flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const msg = chatInput.trim();
                if (!msg) return;
                setChatInput("");
                void sendChat(msg);
              }}
            >
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask something…"
                rows={2}
                className="min-h-[44px] flex-1 resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                disabled={chatTyping}
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || chatTyping}
                className={[
                  "inline-flex h-[44px] items-center justify-center rounded-2xl px-4 text-sm font-semibold text-white",
                  "bg-gradient-to-r from-indigo-500 via-cyan-500 to-fuchsia-500",
                  (!chatInput.trim() || chatTyping) ? "opacity-60" : "hover:opacity-95",
                ].join(" ")}
              >
                Send
              </button>
            </form>
          </section>
        )}

        <footer className="mt-12">
          <div className="h-px w-full bg-gradient-to-r from-indigo-500/60 via-cyan-500/60 to-fuchsia-500/60" />
          <div className="flex flex-col gap-4 border-t border-white/10 bg-black/10 py-6 text-xs text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-center sm:text-left">
              © 2026 JobScout AI — All rights reserved
            </div>

            <div className="flex items-center justify-center gap-1">
              <span>Developed by</span>
              <span className="font-semibold text-zinc-200">M. Summar Rajpoot</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="ml-1 h-3.5 w-3.5 text-rose-300"
                fill="currentColor"
              >
                <path d="M12 21s-7.2-4.35-10-9.05C.2 8.65 2.1 5.5 5.7 5.1 7.8 4.9 9.6 6 10.6 7.55c.5.8 1.3.8 1.8 0C13.4 6 15.2 4.9 17.3 5.1c3.6.4 5.5 3.55 3.7 6.85C19.2 16.65 12 21 12 21z" />
              </svg>
            </div>

            <div className="flex items-center justify-center gap-3 sm:justify-end">
              <a
                href="https://github.com/SummarRajpoot"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-zinc-200 hover:bg-white/10"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="currentColor"
                >
                  <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.42c.57.1.78-.25.78-.55v-2c-3.17.7-3.84-1.34-3.84-1.34-.52-1.33-1.26-1.68-1.26-1.68-1.03-.7.08-.69.08-.69 1.14.08 1.74 1.17 1.74 1.17 1.01 1.74 2.65 1.24 3.3.95.1-.74.4-1.24.72-1.53-2.53-.29-5.19-1.27-5.19-5.64 0-1.25.45-2.27 1.17-3.07-.12-.29-.5-1.46.11-3.04 0 0 .96-.31 3.14 1.17a10.9 10.9 0 0 1 5.72 0c2.18-1.48 3.14-1.17 3.14-1.17.61 1.58.23 2.75.11 3.04.73.8 1.17 1.82 1.17 3.07 0 4.38-2.66 5.35-5.2 5.64.41.35.77 1.05.77 2.12v3.14c0 .3.2.65.79.55A11.5 11.5 0 0 0 12 .5Z" />
                </svg>
                <span className="hidden sm:inline">GitHub</span>
              </a>

              <a
                href="https://www.linkedin.com/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-zinc-200 hover:bg-white/10"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="currentColor"
                >
                  <path d="M4.98 3.5A2.5 2.5 0 1 1 5 8.5a2.5 2.5 0 0 1-.02-5ZM3.5 9h3v11.5h-3V9Zm6 0h2.87v1.57h.04c.4-.75 1.38-1.55 2.85-1.55 3.05 0 3.62 2.01 3.62 4.62v6.86h-3v-6.08c0-1.45-.03-3.31-2.02-3.31-2.02 0-2.33 1.58-2.33 3.21v6.18h-3V9Z" />
                </svg>
                <span className="hidden sm:inline">LinkedIn</span>
              </a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
