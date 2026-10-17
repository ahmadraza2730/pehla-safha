"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  errMsg,
  getJson,
  getUserId,
  timeAgo,
  type HistoryRow,
} from "@/lib/api";
import Masthead from "@/components/Masthead";
import ThemeToggle from "@/components/ThemeToggle";

type Row = {
  date: string;
  edition_no: number;
  title: string;
  lead_title: string;
};

type ArchiveTab = "editions" | "read";

export default function Archive() {
  const router = useRouter();
  const [tab, setTab] = useState<ArchiveTab>("editions");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [read, setRead] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const userId = getUserId();

    if (!userId) {
      router.replace("/login");
      return;
    }

    const uid = encodeURIComponent(userId);
    let cancelled = false;

    getJson<Row[]>(`/editions?user_id=${uid}`)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errMsg(e));
      });

    getJson<HistoryRow[]>(`/history?user_id=${uid}`)
      .then((data) => {
        if (!cancelled) setRead(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errMsg(e));
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  function tabBtn(key: ArchiveTab, label: string, count?: number) {
    return (
      <button
        type="button"
        onClick={() => setTab(key)}
        aria-pressed={tab === key}
        className="chip"
      >
        {label}
        {count !== undefined ? ` (${count})` : ""}
      </button>
    );
  }

  return (
    <main className="min-h-screen">
      <div className="sticky top-0 z-30 border-b border-soft bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-2.5">
          <Link href="/paper" className="btn">
            &larr; Today&apos;s paper
          </Link>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/search" className="btn">
              Search
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-5 pb-16 pt-6">
        <Masthead
          left="The back issues"
          right={rows ? `${rows.length} editions` : ""}
          title="The Archive"
          sub="Every front page, and every story you read"
        />

        <div className="mt-6 flex flex-wrap gap-2">
          {tabBtn("editions", "Past editions", rows?.length)}
          {tabBtn("read", "Recently read", read?.length)}
        </div>

        {error && <p className="mt-6 text-accent">{error}</p>}

        {tab === "editions" && (
          <>
            {!rows && !error && (
              <p className="font-display mt-8 animate-pulse text-center italic text-muted">
                Opening the cabinet...
              </p>
            )}

            {rows && rows.length === 0 && (
              <p className="mt-8 text-center text-muted">
                No papers yet. Open today&apos;s paper first.
              </p>
            )}

            <ul className="reveal-2 mt-6">
              {rows?.map((r) => {
                const d = new Date(r.date);

                return (
                  <li key={r.date} className="border-b border-soft">
                    <Link
                      href={`/paper?date=${encodeURIComponent(r.date)}`}
                      className="grid grid-cols-[4.5rem_1fr] items-center gap-5 py-5 transition-colors hover:bg-paper2"
                    >
                      <div className="border-r border-soft pr-5 text-center">
                        <p className="font-display text-4xl font-black leading-none text-accent">
                          {d.getDate()}
                        </p>
                        <p className="kicker mt-1">
                          {d.toLocaleDateString("en-GB", { month: "short" })}
                        </p>
                      </div>

                      <div>
                        <p className="kicker">
                          {d.toLocaleDateString("en-GB", {
                            weekday: "long",
                          })}{" "}
                          &middot; Edition No. {r.edition_no}
                        </p>
                        <p className="font-display mt-1 text-xl font-bold leading-snug">
                          {r.lead_title || r.title}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {tab === "read" && (
          <>
            {!read && !error && (
              <p className="font-display mt-8 animate-pulse text-center italic text-muted">
                Finding your reading history...
              </p>
            )}

            {read && read.length === 0 && (
              <p className="mt-8 text-center text-muted">
                Stories you open will appear here.
              </p>
            )}

            <ul className="reveal-2 mt-6">
              {read?.map((h) => (
                <li key={h.id} className="border-b border-soft">
                  <Link
                    href={`/article/${h.id}`}
                    className="block py-5 transition-colors hover:bg-paper2"
                  >
                    <p className="kicker">
                      <span className="text-accent">{h.source}</span>
                      {" "}&middot; read {timeAgo(h.viewed_at)}
                      {h.view_count > 1 ? ` · ${h.view_count} times` : ""}
                    </p>
                    <p className="font-display mt-1 text-xl font-bold leading-snug">
                      {h.title}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </>
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
            Printed for you by Pehla Safha &middot; The back issues
          </p>
        </footer>
      </div>
    </main>
  );
}
