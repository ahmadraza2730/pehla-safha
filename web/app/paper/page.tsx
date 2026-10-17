"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  API,
  clearSession,
  downloadPdf,
  getUserId,
  type Article,
  type Edition,
} from "@/lib/api";

function timeAgo(iso: string) {
  const hours = Math.max(0, (Date.now() - new Date(iso).getTime()) / 36e5);
  if (hours < 1) return "just now";
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function Meta({ a }: { a: Article }) {
  return (
    <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-600">
      {a.source} &middot; {timeAgo(a.published_at)}
    </p>
  );
}

function Lead({ a }: { a: Article }) {
  return (
    <article className="grid gap-6 border-b-2 border-[#141414] pb-8 md:grid-cols-5">
      {a.image_url && (
        <div className="md:col-span-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={a.image_url}
            alt=""
            className="h-full max-h-80 w-full object-cover grayscale"
          />
        </div>
      )}
      <div className={a.image_url ? "md:col-span-3" : "md:col-span-5"}>
        <Meta a={a} />
        <h2 className="font-display mt-2 text-4xl font-bold leading-tight md:text-5xl">
          <a
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {a.title}
          </a>
        </h2>
        {a.summary && (
          <p className="mt-4 text-lg leading-relaxed text-neutral-800">
            {a.summary}
          </p>
        )}
        <a
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block text-sm font-medium text-[#B3261E] hover:underline"
        >
          Read the full story &rarr;
        </a>
      </div>
    </article>
  );
}

function Story({ a }: { a: Article }) {
  return (
    <article>
      {a.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={a.image_url}
          alt=""
          className="mb-3 h-36 w-full object-cover grayscale"
        />
      )}
      <Meta a={a} />
      <h3 className="font-display mt-1 text-xl font-bold leading-snug">
        <a
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {a.title}
        </a>
      </h3>
      {a.summary && (
        <p className="mt-2 text-sm leading-relaxed text-neutral-700">
          {a.summary}
        </p>
      )}
    </article>
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
    if (!userId) return;
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
      ? `/edition/by-date/${requested}?user_id=${encodeURIComponent(userId)}`
      : `/edition/today?user_id=${encodeURIComponent(userId)}`;

    fetch(`${API}${path}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.status === 404 && data.detail === "Unknown user") {
          clearSession();
          router.replace("/login");
          return;
        }
        if (!res.ok) throw new Error(data.detail ?? "Could not load your paper");
        setEdition(data);
      })
      .catch((e) =>
        setError(
          e instanceof TypeError
            ? "Couldn't reach the server. Is the API running on port 8000?"
            : e.message
        )
      );
  }, [router]);

  const bar = (
    <div className="border-b border-neutral-400 bg-[#F6F1E7]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-2 text-sm">
        <span className="text-neutral-600">
          {name ? `Printed for ${name}` : "Your paper"}
        </span>
        <div className="flex gap-2">
          <Link
            href="/archive"
            className="border border-[#141414] px-3 py-1 hover:bg-[#141414] hover:text-[#F6F1E7]"
          >
            Archive
          </Link>
          <button
            onClick={onPdf}
            disabled={pdfBusy || !edition}
            className="bg-[#141414] px-3 py-1 text-[#F6F1E7] hover:bg-[#B3261E] disabled:opacity-50"
          >
            {pdfBusy ? "Building PDF..." : "Download PDF"}
          </button>
          <button
            onClick={signOut}
            className="border border-[#141414] px-3 py-1 hover:bg-[#141414] hover:text-[#F6F1E7]"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );

  if (error) {
    return (
      <main className="min-h-screen bg-[#F6F1E7] text-[#141414]">
        {bar}
        <div className="mx-auto max-w-xl px-6 py-16 text-center">
          <h1 className="font-display text-3xl font-bold">
            The presses are jammed.
          </h1>
          <p className="mt-3 text-[#B3261E]">{error}</p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="bg-[#141414] px-6 py-3 text-[#F6F1E7]"
            >
              Try again
            </button>
            {day && (
              <Link href="/paper" className="border border-[#141414] px-6 py-3">
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
      <main className="min-h-screen bg-[#F6F1E7] text-[#141414]">
        {bar}
        <p className="font-display p-10 text-center text-xl italic">
          Setting the type...
        </p>
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
    <main className="min-h-screen bg-[#F6F1E7] text-[#141414]">
      {bar}
      <div className="mx-auto max-w-6xl px-5 pb-16 pt-6">
        {day && (
          <p className="mb-3 border border-[#141414] bg-white/50 px-4 py-2 text-center text-sm">
            You are reading a past edition.{" "}
            <Link href="/paper" className="font-medium underline">
              Back to today&apos;s paper
            </Link>
          </p>
        )}

        <header className="border-b-4 border-double border-[#141414] pb-4 text-center">
          <div className="flex justify-between text-[11px] uppercase tracking-[0.25em] text-neutral-600">
            <span>{dateLabel}</span>
            <span>Edition No. {edition.edition_no}</span>
          </div>
          <h1 className="font-display mt-3 text-5xl font-bold md:text-7xl">
            {edition.title}
          </h1>
          <p className="font-display mt-1 italic text-neutral-700">
            Pehla Safha &middot; The First Page
          </p>
        </header>

        <section className="mt-6">
          <Lead a={edition.lead} />
        </section>

        {edition.sections.map((s) => (
          <section key={s.title} className="mt-10">
            <div className="flex items-center gap-4">
              <h2 className="font-display text-2xl font-bold uppercase tracking-wide">
                {s.title}
              </h2>
              <div className="h-px flex-1 bg-[#141414]" />
            </div>
            <div className="mt-5 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
              {s.articles.map((a) => (
                <Story key={a.id} a={a} />
              ))}
            </div>
          </section>
        ))}

        {edition.more.length > 0 && (
          <section className="mt-12 border-t-2 border-[#141414] pt-5">
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide">
              Also today
            </h2>
            <ul className="mt-4 grid gap-x-10 gap-y-3 md:grid-cols-2">
              {edition.more.map((a) => (
                <li key={a.id} className="border-b border-neutral-300 pb-2">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-display text-lg font-semibold hover:underline"
                  >
                    {a.title}
                  </a>
                  <span className="ml-2 text-xs uppercase tracking-wider text-neutral-600">
                    {a.source}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}