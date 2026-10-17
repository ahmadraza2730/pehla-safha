"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API, getUserId } from "@/lib/api";
import Masthead from "@/components/Masthead";
import ThemeToggle from "@/components/ThemeToggle";

type Row = {
  date: string;
  edition_no: number;
  title: string;
  lead_title: string;
};

export default function Archive() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const userId = getUserId();
    if (!userId) {
      router.replace("/login");
      return;
    }
    fetch(`${API}/editions?user_id=${encodeURIComponent(userId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load your archive");
        setRows(await res.json());
      })
      .catch((e) =>
        setError(
          e instanceof TypeError
            ? "Couldn't reach the server. Is the API running on port 8000?"
            : e.message
        )
      );
  }, [router]);

  return (
    <main className="min-h-screen">
      <div className="sticky top-0 z-30 border-b border-soft bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-2.5">
          <Link href="/paper" className="btn">
            &larr; Today&apos;s paper
          </Link>
          <ThemeToggle />
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-5 pb-16 pt-6">
        <Masthead
          left="The back issues"
          right={rows ? `${rows.length} editions` : ""}
          title="The Archive"
          sub="Every front page printed for you"
        />

        {error && <p className="mt-8 text-accent">{error}</p>}
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

        <ul className="reveal-2 mt-8">
          {rows?.map((r) => {
            const d = new Date(r.date);
            return (
              <li key={r.date} className="border-b border-soft">
                <Link
                  href={`/paper?date=${r.date}`}
                  className="group grid grid-cols-[4.5rem_1fr] items-center gap-5 py-5 transition-colors hover:bg-paper2"
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
                      {d.toLocaleDateString("en-GB", { weekday: "long" })}{" "}
                      &middot; Edition No. {r.edition_no}
                    </p>
                    <p className="font-display mt-1 text-xl font-bold leading-snug">
                      {r.lead_title}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}