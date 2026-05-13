"use client";

import React, { useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-r from-primary-light/10 via-primary/5 to-primary-dark/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[420px] w-[640px] rounded-full bg-gradient-to-tl from-primary/10 via-primary-light/5 to-transparent blur-3xl" />
      </div>

      <main className="relative min-h-dvh">
        <section className="grid min-h-dvh grid-cols-1 md:grid-cols-5">
          <div className="relative flex items-center px-6 py-12 md:col-span-3 md:px-10 lg:px-14">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary-light/5 to-primary-dark/10" />
            <div className="relative w-full max-w-2xl">
              <div className="inline-flex items-center gap-3 rounded-2xl border border-primary/20 bg-white/80 backdrop-blur-sm p-4 shadow-xl shadow-primary/10">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-2xl shadow-inner">
                  💼
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    JobScout AI
                  </h1>
                  <p className="text-sm text-text-secondary font-medium">AI-powered career discovery</p>
                </div>
              </div>

              <h2 className="mt-12 text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
                Find Your Dream Job with{" "}
                <span className="bg-gradient-to-r from-primary via-primary-light to-primary-dark bg-clip-text text-transparent">
                  AI
                </span>
              </h2>

              <div className="mt-10 grid gap-3 text-sm text-text-secondary">
                {[
                  "🤖 Autonomous AI Agent",
                  "⚡ Real-time Job Search",
                  "🎯 Smart CV Matching",
                ].map((item) => (
                  <div
                    key={item}
                    className="inline-flex w-fit items-center rounded-full border border-primary/10 bg-primary/5 px-4 py-2 font-semibold text-primary"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center border-t border-gray-100 bg-white px-6 py-12 md:col-span-2 md:border-l md:border-t-0 md:px-8 lg:px-10 shadow-2xl">
            <div className="mx-auto w-full max-w-md">
              <p className="text-xs uppercase tracking-[0.2em] font-bold text-primary/60">Authentication</p>
              <h3 className="mt-2 text-4xl font-bold text-foreground">Welcome Back</h3>
              <p className="mt-1 text-sm text-text-secondary">Get started with your next opportunity.</p>

              <div className="mt-10 space-y-4">
                <button
                  type="button"
                  onClick={() => signIn("google", { callbackUrl: "/" })}
                  className="inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-primary px-4 py-4 text-sm font-bold text-white transition-all hover:bg-primary-dark shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                    <path d="M21.35 11.1H12v2.98h5.35c-.78 2.27-2.78 3.55-5.35 3.55a5.83 5.83 0 0 1 0-11.66c1.48 0 2.72.53 3.7 1.39l2.07-2.07C16.57 3.37 14.47 2.5 12 2.5 6.76 2.5 2.5 6.76 2.5 12S6.76 21.5 12 21.5c5.4 0 9-3.79 9-9.13 0-.62-.08-1.08-.15-1.27Z" />
                  </svg>
                  Continue with Google
                </button>

                <div className="flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-gray-100" />
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">or</span>
                  <div className="h-px flex-1 bg-gray-100" />
                </div>

                <button
                  type="button"
                  onClick={() => signIn("github", { callbackUrl: "/" })}
                  className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-4 text-sm font-bold text-foreground transition-all hover:bg-gray-50 hover:border-gray-300 shadow-sm hover:scale-[1.02] active:scale-[0.98]"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                    <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.42c.57.1.78-.25.78-.55v-2c-3.17.7-3.84-1.34-3.84-1.34-.52-1.33-1.26-1.68-1.26-1.68-1.03-.7.08-.69.08-.69 1.14.08 1.74 1.17 1.74 1.17 1.01 1.74 2.65 1.24 3.3.95.1-.74.4-1.24.72-1.53-2.53-.29-5.19-1.27-5.19-5.64 0-1.25.45-2.27 1.17-3.07-.12-.29-.5-1.46.11-3.04 0 0 .96-.31 3.14 1.17a10.9 10.9 0 0 1 5.72 0c2.18-1.48 3.14-1.17 3.14-1.17.61 1.58.23 2.75.11 3.04.73.8 1.17 1.82 1.17 3.07 0 4.38-2.66 5.35-5.2 5.64.41.35.77 1.05.77 2.12v3.14c0 .3.2.65.79.55A11.5 11.5 0 0 0 12 .5Z" />
                  </svg>
                  Continue with GitHub
                </button>
              </div>

              <p className="mt-8 text-center text-xs font-medium text-gray-400">
                By signing in, you agree to use JobScout AI responsibly
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

