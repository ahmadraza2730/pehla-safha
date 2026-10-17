"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  clearSession,
  errMsg,
  getJson,
  getUserId,
  timeAgo,
  type ArticleFull,
  type Related,
} from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";

export default function ArticlePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [article, setArticle] = useState<ArticleFull | null>(null);
  const [error, setError] = useState("");
  const [related, setRelated] = useState<Related[] | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState("");

  useEffect(() => {
    const userId = getUserId();
    if (!userId) {
      router.replace("/login");
      return;
    }
    setArticle(null);
    setRelated(null);
    setError("");

    getJson(`/article/${id}?user_id=${encodeURIComponent(userId)}`)
      .then((data) => {
        setArticle(data);
        if (new URLSearchParams(window.location.search).get("compare") === "1") {
          loadCompare(userId);
        }
      })
      .catch((e) => {
        if (e instanceof Error && e.message === "Unknown user") {
          clearSession();
          router.replace("/login");
          return;
        }
        setError(errMsg(e));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  async function loadCompare(userIdArg?: string) {
    const userId = userIdArg ?? getUserId();
    if (!userId) return;
    setComparing(true);
    setCompareError("");
    try {
      setRelated(
        await getJson(`/article/${id}/compare?user_id=${encodeURIComponent(userId)}`)
      );
    } catch (e) {
      setCompareError(errMsg(e));
    } finally {
      setComparing(false);
    }
  }

  const bar = (
    <div className="sticky top-0 z-30 border-b border-soft bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-2.5">
        <button onClick={() => router.back()} className="btn">
          &larr; Back
        </button>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/search" className="btn">
            Search
          </Link>
          <Link href="/paper" className="btn">
            Today&apos;s paper
          </Link>
        </div>
      </div>
    </div>
  );

  if (error) {
    return (
      <main className="min-h-screen">
        {bar}
        <div className="mx-auto max-w-xl px-6 py-20 text-center">
          <h1 className="font-display text-4xl font-black">Story not found.</h1>
          <p className="mt-3 text-accent">{error}</p>
        </div>
      </main>
    );
  }

  if (!article) {
    return (
      <main className="min-h-screen">
        {bar}
        <div className="mx-auto max-w-3xl animate-pulse space-y-4 px-5 pt-10">
          <div className="h-12 w-4/5 bg-paper2" />
          <div className="h-64 bg-paper2" />
          <div className="h-32 bg-paper2" />
        </div>
      </main>
    );
  }

  const paragraphs = (article.content ?? "")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <main className="min-h-screen">
      {bar}
      <article className="mx-auto max-w-3xl px-5 pb-16 pt-8">
        <p className="kicker reveal">
          <span className="text-accent">{article.source}</span> &middot;{" "}
          {timeAgo(article.published_at)}
        </p>
        <h1 className="font-display reveal mt-3 text-4xl font-black leading-[1.05] tracking-tight md:text-6xl">
          {article.title}
        </h1>

        {article.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.image_url}
            alt=""
            className="photo reveal-2 mt-8 max-h-[28rem]"
          />
        )}

        <div className="reveal-2 mt-8 border-t border-ink pt-6 text-lg leading-8">
          {paragraphs.length > 0 ? (
            paragraphs.map((p, i) => (
              <p key={i} className={`mb-5 ${i === 0 ? "dropcap" : ""}`}>
                {p}
              </p>
            ))
          ) : (
            <p className="text-muted">
              {article.summary ||
                "We couldn't extract the full text for this story."}
            </p>
          )}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-ink pt-5">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
          >
            Read original at {article.source} &rarr;
          </a>
          <button
            onClick={() => loadCompare()}
            disabled={comparing}
            className="btn btn-accent"
          >
            {comparing ? "Comparing..." : "Compare coverage"}
          </button>
        </div>

        {compareError && <p className="mt-4 text-accent">{compareError}</p>}

        {related && (
          <section className="mt-10">
            <div className="flex items-baseline gap-3 border-b-2 border-ink pb-2">
              <span className="font-display text-2xl font-black text-accent">§</span>
              <h2 className="font-display text-3xl font-black uppercase tracking-wide">
                Compare coverage
              </h2>
              <span className="kicker ml-auto">
                {related.length + 1} outlets
              </span>
            </div>

            {related.length === 0 ? (
              <p className="mt-5 text-muted">
                No other outlet in your library covers this story yet.{" "}
                <Link
                  href={`/search?q=${encodeURIComponent(article.title)}&live=1`}
                  className="font-medium text-ink underline underline-offset-4"
                >
                  Search the world for it
                </Link>
                .
              </p>
            ) : (
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <div className="card p-5">
                  <p className="kicker !text-accent">This story</p>
                  <p className="kicker mt-1">{article.source}</p>
                  <h3 className="font-display mt-2 text-xl font-bold leading-snug">
                    {article.title}
                  </h3>
                  {article.summary && (
                    <p className="mt-2 text-sm text-muted">{article.summary}</p>
                  )}
                </div>
                {related.map((r) => (
                  <div key={r.id} className="border border-ink bg-paper2 p-5">
                    <p className="kicker flex justify-between">
                      <span className="text-accent">{r.source}</span>
                      <span>{Math.round(r.similarity * 100)}% match</span>
                    </p>
                    <p className="kicker mt-1">{timeAgo(r.published_at)}</p>
                    <h3 className="headline font-display mt-2 text-xl font-bold leading-snug">
                      <Link href={`/article/${r.id}`}>{r.title}</Link>
                    </h3>
                    {r.summary && (
                      <p className="mt-2 text-sm text-muted">{r.summary}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </article>
    </main>
  );
}