"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API, getUserId } from "@/lib/api";

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
    <main className="min-h-screen bg-[#F6F1E7] text-[#141414]">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <Link
          href="/paper"
          className="text-sm text-neutral-600 hover:text-[#141414]"
        >
          &larr; Today&apos;s paper
        </Link>

        <header className="mt-4 border-b-4 border-double border-[#141414] pb-4 text-center">
          <h1 className="font-display text-5xl font-bold">The Archive</h1>
          <p className="font-display italic text-neutral-700">
            Every front page printed for you
          </p>
        </header>

        {error && <p className="mt-8 text-[#B3261E]">{error}</p>}
        {!rows && !error && (
          <p className="font-display mt-8 italic">Opening the cabinet...</p>
        )}
        {rows && rows.length === 0 && (
          <p className="mt-8">No papers yet. Open today&apos;s paper first.</p>
        )}

        <ul className="mt-6 divide-y divide-neutral-400">
          {rows?.map((r) => (
            <li key={r.date}>
              <Link
                href={`/paper?date=${r.date}`}
                className="block py-4 hover:bg-white/50"
              >
                <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-600">
                  {new Date(r.date).toLocaleDateString("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}{" "}
                  &middot; Edition No. {r.edition_no}
                </p>
                <p className="font-display mt-1 text-xl font-bold leading-snug">
                  {r.lead_title}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}