"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getUserId, postJson, saveSession } from "@/lib/api";
import Masthead from "@/components/Masthead";
import ThemeToggle from "@/components/ThemeToggle";

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
        err instanceof TypeError
          ? "Couldn't reach the server. Is the API running on port 8000?"
          : err instanceof Error
          ? err.message
          : "Could not sign in"
      );
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-6 py-8">
      <div className="fixed right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      <Link href="/" className="kicker hover:text-ink">
        &larr; Back to start
      </Link>

      <div className="mt-5">
        <Masthead
          left="Est. this morning"
          right="Subscribers"
          title="Pehla Safha"
          sub="Your world, on your first page."
          urdu
        />
      </div>

      <form onSubmit={submit} className="card reveal-3 mt-10 p-8">
        <h2 className="font-display text-3xl font-bold">Welcome back.</h2>
        <p className="mt-2 text-muted">
          Enter your email and we&apos;ll open today&apos;s paper.
        </p>

        <label className="mt-6 block">
          <span className="kicker">Email</span>
          <input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="field mt-1"
          />
        </label>

        {error && <p className="mt-3 text-sm text-accent">{error}</p>}

        <button
          type="submit"
          disabled={!emailOk || loading}
          className="btn btn-solid mt-6 w-full justify-center py-3"
        >
          {loading ? "Opening..." : "Open my paper"}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-muted">
        New here?{" "}
        <Link href="/" className="font-medium text-ink underline underline-offset-4">
          Create your paper
        </Link>
      </p>
    </main>
  );
}