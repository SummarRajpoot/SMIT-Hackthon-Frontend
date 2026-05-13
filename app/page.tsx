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
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
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
    if (score >= 80) return "bg-primary text-white shadow-sm";
    if (score >= 50) return "bg-primary/20 text-primary-dark";
    return "bg-gray-100 text-gray-600";
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

      const data = (await res.json()) as { message?: string; response?: string; content?: string; reply?: string };
      const aiText = (data.reply ?? data.message ?? data.response ?? data.content ?? "").toString().trim();
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
    <div className="min-h-dvh bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-r from-primary-light/10 via-primary/5 to-primary-dark/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-[420px] w-[640px] rounded-full bg-gradient-to-tr from-primary-light/5 via-primary/5 to-transparent blur-3xl" />
      </div>

      <main className="relative mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <header className="mb-10">
          <nav className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/5 shadow-sm">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5 text-primary"
                  fill="currentColor"
                >
                  <path d="M10 4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2h3a3 3 0 0 1 3 3v4.2a3 3 0 0 1-1.76 2.74l-.24.1V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.96l-.24-.1A3 3 0 0 1 2 13.2V9a3 3 0 0 1 3-3h3V4Zm4 2V4a0 0 0 0 0 0 0h-2a0 0 0 0 0 0 0v2h2Zm-9 4a1 1 0 0 0-1 1v2.2a1 1 0 0 0 .58.91l3.42 1.47V14a1 1 0 1 1 2 0v2h4v-2a1 1 0 1 1 2 0v1.58l3.42-1.47A1 1 0 0 0 22 13.2V11a1 1 0 0 0-1-1H5Zm1 10h12v-2.27l-4 1.72V20a1 1 0 1 1-2 0v-2h-4v2a1 1 0 1 1-2 0v-.55l-4-1.72V20Z" />
                </svg>
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold tracking-tight text-foreground">JobScout AI</div>
                <div className="text-xs text-text-secondary">Professional job discovery</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-primary/5 px-3 py-1 text-xs text-primary font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Powered by Groq + Gemini
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                SMIT Hackathon 2026
              </div>
              {session?.user && (
                <div className="ml-0 flex items-center gap-2 rounded-full border border-gray-200 bg-white px-2 py-1 shadow-sm sm:ml-1">
                  {session.user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={session.user.image}
                      alt={session.user.name ?? "User avatar"}
                      className="h-6 w-6 rounded-full ring-1 ring-gray-200"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="h-6 w-6 rounded-full bg-gray-100 ring-1 ring-gray-200" />
                  )}
                  <span className="max-w-[140px] truncate text-xs font-medium text-foreground">
                    {session.user.name ?? "Signed in"}
                  </span>
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </nav>

          <div className="mt-10">
            <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl text-foreground">
              Find Your Dream Job with{" "}
              <span className="bg-gradient-to-r from-primary via-primary-light to-primary-dark bg-clip-text text-transparent">
                AI
              </span>
            </h1>
            <p className="mt-4 max-w-3xl text-pretty text-sm leading-7 text-text-secondary sm:text-base">
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
                  className="inline-flex items-center rounded-full border border-primary/10 bg-primary/5 px-3 py-1 text-xs text-primary font-medium"
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
                "group relative rounded-2xl border bg-white p-6 shadow-xl shadow-gray-200/50",
                dragActive ? "border-primary ring-4 ring-primary/10" : "border-gray-200",
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
                  <p className="text-sm font-semibold text-foreground">Drag & drop your CV</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    Accepted: <span className="font-medium text-foreground">PDF</span> or{" "}
                    <span className="font-medium text-foreground">DOCX</span>
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
                    className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-gray-50 transition-colors shadow-sm"
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
                      "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all",
                      "bg-primary hover:bg-primary-dark text-white shadow-md shadow-primary/20",
                      !file || uploading ? "opacity-60 cursor-not-allowed" : "hover:scale-[1.02]",
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

              <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3 text-sm text-text-secondary">
                {file ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="truncate">
                      Selected: <span className="font-semibold text-primary">{file.name}</span>
                    </span>
                    <button
                      type="button"
                      className="text-primary font-medium hover:text-primary-dark transition-colors"
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
                <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 font-medium">
                  {error}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm animate-[jsai_fadeInUp_700ms_ease-out_both]">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">How it works</h2>
              <div className="mt-4 grid gap-3 text-sm text-text-secondary sm:grid-cols-3">
                <div className="rounded-xl border border-gray-100 bg-gray-50/30 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-lg">📄</div>
                    <div>
                      <p className="font-semibold text-foreground">1) Upload</p>
                      <p className="mt-1 text-sm leading-6 text-text-secondary">
                        Simply drag and drop your CV in PDF or DOCX format. Our system securely
                        extracts your skills, experience, and education.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50/30 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-lg">🔍</div>
                    <div>
                      <p className="font-semibold text-foreground">2) Search</p>
                      <p className="mt-1 text-sm leading-6 text-text-secondary">
                        Our AI agent autonomously generates smart search queries based on your
                        profile and searches real-time job listings.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50/30 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-lg">🎯</div>
                    <div>
                      <p className="font-semibold text-foreground">3) Rank</p>
                      <p className="mt-1 text-sm leading-6 text-text-secondary">
                        Every job is evaluated against your CV using advanced LLM reasoning and
                        assigned a match score.
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
          <section className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl shadow-gray-200/50">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground">AI Agent is searching for jobs…</h2>
                <p className="mt-2 text-sm text-text-secondary">
                  Session: <span className="font-mono font-medium text-primary">{sessionId}</span>
                </p>
              </div>

              <div className="flex items-center gap-2 text-sm text-primary font-medium">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
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
                      "flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition-colors",
                      done
                        ? "border-primary/20 bg-primary/5 text-primary"
                        : active
                          ? "border-primary-light/30 bg-primary-light/10 text-primary-dark"
                          : "border-gray-100 bg-gray-50/50 text-text-secondary",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={[
                          "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                          done
                            ? "bg-primary text-white"
                            : active
                              ? "bg-primary-light text-white animate-pulse"
                              : "bg-gray-200 text-gray-500",
                        ].join(" ")}
                      >
                        {done ? "✓" : idx + 1}
                      </span>
                      <span className="font-semibold">{s}</span>
                    </div>
                    {active && <span className="text-xs font-bold text-primary animate-pulse">in progress</span>}
                  </div>
                );
              })}
            </div>

            {error && (
              <div className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 font-medium">
                {error}
              </div>
            )}
          </section>
        )}

        {uiState === "RESULTS" && (
          <section className="grid gap-6">
            <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground">Top matches</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Showing <span className="font-bold text-primary">{jobs.length}</span> results
                  ranked by match score.
                </p>
              </div>
              <button
                type="button"
                onClick={reset}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-foreground hover:bg-gray-50 transition-colors shadow-sm"
              >
                Search Again
              </button>
            </div>

            {jobs.length === 0 ? (
              <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-8 text-sm text-text-secondary text-center italic">
                No jobs returned. Try uploading a different CV or run again.
              </div>
            ) : (
              <div className="grid gap-4">
                {jobs.map((job, idx) => (
                  <article
                    key={`${job.url}-${idx}`}
                    className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl shadow-gray-200/40 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-bold text-foreground">
                          {job.title}
                        </h3>
                        <p className="mt-1 text-sm text-text-secondary">
                          <span className="font-semibold text-primary">{job.company}</span>
                          <span className="text-gray-300"> • </span>
                          {job.location}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold tabular-nums shadow-sm",
                            scoreBadge(job.score),
                          ].join(" ")}
                        >
                          Match {Math.round(job.score)}%
                        </span>
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary-dark shadow-md shadow-primary/20 transition-all hover:scale-105"
                        >
                          Apply
                        </a>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-gray-50 bg-gray-50/50 px-4 py-3 text-sm text-text-secondary leading-relaxed">
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
          <section className="mt-10 rounded-2xl border border-gray-200 bg-white p-6 shadow-xl shadow-gray-200/50">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-foreground">AI Career Chat</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Ask about your CV, best matches, skills to improve, and next steps.
                </p>
              </div>
              <p className="text-xs text-text-secondary">
                Session: <span className="font-mono font-medium text-primary">{sessionId}</span>
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {quickQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-primary/10 hover:text-primary hover:border-primary/20 transition-all"
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

            <div className="mt-5 h-[420px] overflow-hidden rounded-2xl border border-gray-100 bg-gray-50/50">
              <div className="h-full overflow-y-auto p-4">
                {chatMessages.length === 0 ? (
                  <div className="rounded-xl border border-gray-100 bg-white p-4 text-sm text-text-secondary text-center italic">
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
                            "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
                            m.role === "user"
                              ? "bg-primary text-white"
                              : "bg-white text-foreground border border-gray-100",
                          ].join(" ")}
                        >
                          {m.content}
                        </div>
                      </div>
                    ))}

                    {chatTyping && (
                      <div className="flex justify-start">
                        <div className="rounded-2xl bg-white border border-gray-100 px-4 py-3 shadow-sm">
                          <span className="inline-flex items-center gap-2">
                            <span className="h-2 w-2 animate-bounce rounded-full bg-primary/40" />
                            <span className="h-2 w-2 animate-bounce rounded-full bg-primary/40 [animation-delay:150ms]" />
                            <span className="h-2 w-2 animate-bounce rounded-full bg-primary/40 [animation-delay:300ms]" />
                            <span className="ml-2 text-text-secondary font-medium">AI is typing</span>
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
              <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 font-medium">
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
                className="min-h-[44px] flex-1 resize-none rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-foreground placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                disabled={chatTyping}
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || chatTyping}
                className={[
                  "inline-flex h-[44px] items-center justify-center rounded-2xl px-6 text-sm font-bold text-white transition-all shadow-md shadow-primary/20",
                  "bg-primary hover:bg-primary-dark",
                  (!chatInput.trim() || chatTyping) ? "opacity-60 cursor-not-allowed" : "hover:scale-105 active:scale-95",
                ].join(" ")}
              >
                Send
              </button>
            </form>
          </section>
        )}

        <footer className="mt-12">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          <div className="flex flex-col gap-4 bg-transparent py-8 text-xs text-text-secondary sm:flex-row sm:items-center sm:justify-between">
            <div className="text-center sm:text-left font-medium">
              © 2026 JobScout AI — Empowering careers with AI
            </div>

            <div className="flex items-center justify-center gap-1 font-medium">
              <span>Developed by</span>
              <span className="font-bold text-primary">M. Summar Rajpoot</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="ml-1 h-3.5 w-3.5 text-primary"
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
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-text-secondary hover:bg-gray-50 transition-colors"
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
                href="https://linkedin.com/in/SummarRajpoot"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-text-secondary hover:bg-gray-50 transition-colors"
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
