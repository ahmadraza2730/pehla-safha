"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  API,
  clearSession,
  downloadPdf,
  getUserId,
  timeAgo,
  type Article,
  type Edition,
} from "@/lib/api";
import Masthead from "@/components/Masthead";
import ThemeToggle from "@/components/ThemeToggle";

function Meta({ a }: { a: Article }) {
  return (
    <p className="kicker">
      <span className="text-accent">{a.source}</span> &middot;{" "}
      {timeAgo(a.published_at)}
    </p>
  );
}

function Lead({ a }: { a: Article }) {
  return (
    <article className="reveal-2 grid gap-8 border-b border-ink pb-10 md:grid-cols-5">
      {a.image_url && (
        <div className="md:col-span-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.image_url} alt="" className="photo max-h-96 md:h-full" />
        </div>
      )}

      <div className={a.image_url ? "md:col-span-3" : "md:col-span-5"}>
        <p className="kicker mb-3 !text-accent">Lead story</p>
        <Meta a={a} />
        <h2 className="headline font-display mt-3 text-4xl font-black leading-[1.05] tracking-tight md:text-6xl">
          <Link href={`/article/${a.id}`}>{a.title}</Link>
        </h2>

        {a.summary && (
          <p className="dropcap mt-5 text-lg leading-relaxed">{a.summary}</p>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <Link href={`/article/${a.id}`} className="btn btn-solid">
            Read the full story &rarr;
          </Link>
          <Link href={`/article/${a.id}?compare=1`} className="btn">
            Compare coverage
          </Link>
        </div>
      </div>
    </article>
  );
}

function Story({ a }: { a: Article }) {
  return (
    <article>
      {a.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.image_url} alt="" className="photo mb-3 h-36" />
      )}

      <Meta a={a} />
      <h3 className="headline font-display mt-1.5 text-xl font-bold leading-snug">
        <Link href={`/article/${a.id}`}>{a.title}</Link>
      </h3>

      {a.summary && (
        <p className="mt-2 text-sm leading-relaxed text-muted">{a.summary}</p>
      )}
    </article>
  );
}

function Skeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-6 px-5 pt-6">
      <div className="h-36 bg-paper2" />
      <div className="grid gap-6 md:grid-cols-5">
        <div className="h-64 bg-paper2 md:col-span-2" />
        <div className="space-y-4 md:col-span-3">
          <div className="h-10 w-4/5 bg-paper2" />
          <div className="h-10 w-3/5 bg-paper2" />
          <div className="h-24 bg-paper2" />
        </div>
      </div>
      <p className="font-display text-center italic text-muted">
        Setting the type...
      </p>
    </div>
  );
}

export default function Paper() {
  const router = useRouter();
  const [edition, setEdition] = useState<Edition | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [day, setDay] = useState<string | null>(null);

  function signOut() {
    clearSession();
    router.replace("/login");
  }

  async function onPdf() {
    const userId = getUserId();
    if (!userId) {
      router.replace("/login");
      return;
    }

    setPdfBusy(true);
    try {
      await downloadPdf(userId, day);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not build the PDF");
    } finally {
      setPdfBusy(false);
    }
  }

  useEffect(() => {
    const userId = getUserId();

    if (!userId) {
      router.replace("/login");
      return;
    }

    setName(localStorage.getItem("safha_name") ?? "");

    const requested = new URLSearchParams(window.location.search).get("date");
    setDay(requested);

    const path = requested
      ? `/edition/by-date/${encodeURIComponent(requested)}?user_id=${encodeURIComponent(userId)}`
      : `/edition/today?user_id=${encodeURIComponent(userId)}`;

    let cancelled = false;

    fetch(`${API}${path}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));

        if (res.status === 404 && data.detail === "Unknown user") {
          clearSession();
          router.replace("/login");
          return;
        }

        if (!res.ok) {
          throw new Error(data.detail ?? "Could not load your paper");
        }

        if (!cancelled) {
          setEdition(data as Edition);
          setError("");
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;

        setError(
          e instanceof TypeError
            ? "Couldn't reach the server. Is the API running on port 8000?"
            : e instanceof Error
              ? e.message
              : "Could not load your paper"
        );
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  const bar = (
    <div className="sticky top-0 z-30 border-b border-soft bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-2.5">
        <span className="kicker hidden sm:block">
          {name ? `Printed for ${name}` : "Your paper"}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ThemeToggle />
          <Link href="/search" className="btn">
            Search
          </Link>
          <Link href="/archive" className="btn">
            Archive
          </Link>
          <button
            onClick={onPdf}
            disabled={pdfBusy || !edition}
            className="btn btn-solid"
          >
            {pdfBusy ? "Building..." : "PDF"}
          </button>
          <button onClick={signOut} className="btn">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );

  if (error) {
    return (
      <main className="min-h-screen">
        {bar}
        <div className="mx-auto max-w-xl px-6 py-20 text-center">
          <h1 className="font-display text-4xl font-black">
            The presses are jammed.
          </h1>
          <p className="mt-3 text-accent">{error}</p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="btn btn-solid"
            >
              Try again
            </button>
            {day && (
              <Link href="/paper" className="btn">
                Today&apos;s paper
              </Link>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (!edition) {
    return (
      <main className="min-h-screen">
        {bar}
        <Skeleton />
      </main>
    );
  }

  const dateLabel = new Date(edition.date).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <main className="min-h-screen">
      {bar}

      <div className="mx-auto max-w-6xl px-5 pb-16 pt-6">
        {day && (
          <p className="kicker mb-4 border border-ink bg-paper2 px-4 py-2 text-center">
            You are reading a past edition &middot;{" "}
            <Link
              href="/paper"
              className="!text-accent underline underline-offset-4"
            >
              Back to today&apos;s paper
            </Link>
          </p>
        )}

        <Masthead
          left={dateLabel}
          right={`Edition No. ${edition.edition_no}`}
          title={edition.title}
          sub="Pehla Safha · The First Page"
          big
        />

        <section className="mt-8">
          <Lead a={edition.lead} />
        </section>

        {edition.sections.map((s, idx) => (
          <section key={s.title} className="reveal-3 mt-12">
            <div className="flex items-baseline gap-3 border-b-2 border-ink pb-2">
              <span className="font-display text-2xl font-black text-accent">
                §
              </span>
              <h2 className="font-display text-3xl font-black uppercase tracking-wide">
                {s.title}
              </h2>
              <span className="kicker ml-auto">Section {idx + 1}</span>
            </div>

            <div className="cols-rule mt-6 grid gap-8 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
              {s.articles.map((a) => (
                <Story key={a.id} a={a} />
              ))}
            </div>
          </section>
        ))}

        {edition.more.length > 0 && (
          <section className="mt-14 border-t-4 border-double border-ink pt-6">
            <h2 className="font-display text-3xl font-black uppercase tracking-wide">
              Also today
            </h2>

            <ol className="mt-5 grid gap-x-12 md:grid-cols-2">
              {edition.more.map((a, i) => (
                <li
                  key={a.id}
                  className="flex gap-4 border-b border-soft py-4"
                >
                  <span className="font-display text-3xl font-black leading-none text-accent">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="headline font-display text-lg font-bold leading-snug">
                      <Link href={`/article/${a.id}`}>{a.title}</Link>
                    </h3>
                    <p className="kicker mt-1">{a.source}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <footer className="mt-16 border-t border-ink pt-4 text-center">
          <p
            lang="ur"
            dir="rtl"
            className="font-urdu text-xl leading-[2] text-accent"
          >
            پہلا صفحہ
          </p>
          <p className="kicker">
            Printed for you by Pehla Safha &middot; Set in Playfair Display
            &amp; Source Serif
          </p>
        </footer>
      </div>
    </main>
  );
}
