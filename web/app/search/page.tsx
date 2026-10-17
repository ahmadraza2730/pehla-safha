"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  errMsg,
  getJson,
  getUserId,
  postJson,
  timeAgo,
  type Hit,
} from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";

export default function Search() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const asked = useRef("");

  async function runSearch(query: string) {
    const userId = getUserId();
    if (!userId || query.trim().length < 2) return;
    asked.current = query.trim();
    setBusy(true);
    setError("");
    setNote("");
    try {
      setHits(
        await getJson(
          `/search?q=${encodeURIComponent(query.trim())}&user_id=${encodeURIComponent(userId)}`
        )
      );
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function runLive(query: string) {
    const userId = getUserId();
    if (!userId || query.trim().length < 2) return;
    asked.current = query.trim();
    setLive(true);
    setError("");
    setNote("");
    try {
      const data = await postJson(
        `/search/live?user_id=${encodeURIComponent(userId)}`,
        { q: query.trim() }
      );
      setHits(data.results);
      setNote(
        data.added > 0
          ? `Fetched ${data.added} new stories from around the world.`
          : "No new stories found beyond what you already have."
      );
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLive(false);
    }
  }

  useEffect(() => {
    if (!getUserId()) {
      router.replace("/login");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const initial = params.get("q") ?? "";
    if (initial) {
      setQ(initial);
      if (params.get("live") === "1") runLive(initial);
      else runSearch(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return (
    <main className="min-h-screen">
      <div className="sticky top-0 z-30 border-b border-soft bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-2.5">
          <Link href="/paper" className="btn">
            &larr; Today&apos;s paper
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/archive" className="btn">
              Archive
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-5 pb-16 pt-8">
        <h1 className="font-display reveal text-5xl font-black tracking-tight md:text-6xl">
          Search the news
        </h1>
        <p className="reveal-2 mt-2 text-muted">
          Search your library first, then pull fresh stories from anywhere in
          the world.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(q);
          }}
          className="reveal-2 mt-6 flex gap-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Pakistan cricket, SpaceX launch, inflation"
            className="field"
            autoFocus
          />
          <button
            type="submit"
            disabled={busy || live || q.trim().length < 2}
            className="btn btn-solid"
          >
            {busy ? "..." : "Search"}
          </button>
        </form>

        {hits && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="kicker">
              {hits.length} {hits.length === 1 ? "story" : "stories"} for
              &ldquo;{asked.current}&rdquo;
            </p>
            <button
              onClick={() => runLive(asked.current || q)}
              disabled={live}
              className="btn btn-accent ml-auto"
            >
              {live ? "Searching the world..." : "Search the world live"}
            </button>
          </div>
        )}

        {note && <p className="mt-3 text-sm text-muted">{note}</p>}
        {error && <p className="mt-3 text-accent">{error}</p>}

        {hits && hits.length === 0 && !live && (
          <p className="mt-8 text-center text-muted">
            Nothing in your library yet. Try &ldquo;Search the world live&rdquo;.
          </p>
        )}

        <ul className="mt-6">
          {hits?.map((h) => (
            <li key={h.id} className="border-b border-soft py-5">
              <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
                <div>
                  <p className="kicker">
                    <span className="text-accent">{h.source}</span> &middot;{" "}
                    {timeAgo(h.published_at)}
                  </p>
                  <h2 className="headline font-display mt-1 text-2xl font-bold leading-snug">
                    <Link href={`/article/${h.id}`}>{h.title}</Link>
                  </h2>
                  {h.summary && (
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      {h.summary}
                    </p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <Link href={`/article/${h.id}`} className="btn">
                      Read here
                    </Link>
                    <Link href={`/article/${h.id}?compare=1`} className="btn">
                      Compare
                    </Link>
                  </div>
                </div>
                {h.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={h.image_url} alt="" className="photo hidden h-28 sm:block" />
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}