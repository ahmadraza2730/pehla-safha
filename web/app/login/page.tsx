"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getUserId, postJson, saveSession } from "@/lib/api";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getUserId()) router.replace("/paper");
  }, [router]);

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!emailOk || loading) return;
    setLoading(true);
    setError("");
    try {
      const data = await postJson("/login", {
        email: email.trim().toLowerCase(),
      });
      saveSession(data.user_id, data.name ?? "");
      router.push("/paper");
    } catch (err) {
      setError(
        err instanceof Error && !err.message.includes("fetch")
          ? err.message
          : "Couldn't reach the server. Is the API running on port 8000?"
      );
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F6F1E7] px-6 py-10 text-[#141414]">
      <div className="mx-auto max-w-md">
        <Link href="/" className="text-sm text-neutral-600 hover:text-[#141414]">
          &larr; Back to start
        </Link>

        <header className="mt-6 border-y-4 border-double border-[#141414] py-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.35em] text-neutral-600">
            Est. this morning
          </p>
          <h1 className="font-display mt-2 text-5xl font-bold">Pehla Safha</h1>
          <p className="font-display italic text-neutral-700">The First Page</p>
        </header>

        <form
          onSubmit={submit}
          className="mt-10 border border-[#141414] bg-white/60 p-8 shadow-[6px_6px_0_#141414]"
        >
          <h2 className="font-display text-3xl font-bold">Welcome back.</h2>
          <p className="mt-2 text-neutral-700">
            Enter your email and we&apos;ll open today&apos;s paper.
          </p>

          <label className="mt-6 block">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full border border-neutral-500 bg-white px-4 py-3 outline-none focus:border-[#B3261E]"
            />
          </label>

          {error && <p className="mt-3 text-sm text-[#B3261E]">{error}</p>}

          <button
            type="submit"
            disabled={!emailOk || loading}
            className="mt-6 w-full bg-[#141414] py-3 font-medium text-[#F6F1E7] transition hover:bg-[#B3261E] disabled:opacity-40 disabled:hover:bg-[#141414]"
          >
            {loading ? "Opening..." : "Open my paper"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm">
          New here?{" "}
          <Link href="/" className="underline">
            Create your paper
          </Link>
        </p>
      </div>
    </main>
  );
}