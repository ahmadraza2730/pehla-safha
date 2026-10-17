"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

type Article = {
  id: string; title: string; source: string; url: string;
  summary: string; topics: string[];
};
type Edition = {
  title: string; date: string; edition_no: number;
  lead: Article;
  sections: { title: string; articles: Article[] }[];
  more: Article[];
};

function Card({ a }: { a: Article }) {
  return (
    <article className="border-b border-neutral-400 py-4">
      <p className="text-xs uppercase tracking-wider text-neutral-600">
        {a.source}
      </p>
      <h3 className="font-display text-lg font-bold leading-snug">{a.title}</h3>
      <p className="mt-1 text-sm text-neutral-700">{a.summary}</p>
      <a
        href={a.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-xs font-medium text-[#B3261E] underline"
      >
        Read original
      </a>
    </article>
  );
}

export default function Paper() {
  const router = useRouter();
  const [edition, setEdition] = useState<Edition | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = localStorage.getItem("safha_user");
    if (!id) {
      router.push("/");
      return;
    }
    fetch(`${API}/edition/today?user_id=${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setEdition)
      .catch((e) => setError(`Could not load your paper (${e}).`));
  }, [router]);

  if (error) return <p className="p-10 text-[#B3261E]">{error}</p>;
  if (!edition) return <p className="p-10">Printing your paper...</p>;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="border-b-4 border-double border-[#141414] pb-4 text-center">
        <h1 className="font-display text-5xl font-bold">{edition.title}</h1>
        <p className="text-sm text-neutral-700">
          {edition.date} · Edition No. {edition.edition_no}
        </p>
      </header>

      <section className="border-b border-[#141414] py-6">
        <p className="text-xs uppercase tracking-wider text-[#B3261E]">
          Top story
        </p>
        <h2 className="font-display text-4xl font-bold leading-tight">
          {edition.lead.title}
        </h2>
        <p className="mt-2 max-w-2xl text-neutral-800">{edition.lead.summary}</p>
        <a
          href={edition.lead.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm font-medium text-[#B3261E] underline"
        >
          Read original · {edition.lead.source}
        </a>
      </section>

      {edition.sections.map((s) => (
        <section key={s.title} className="py-6">
          <h2 className="border-b-2 border-[#141414] pb-1 text-sm font-bold uppercase tracking-[0.2em]">
            {s.title}
          </h2>
          <div className="grid gap-x-8 md:grid-cols-2">
            {s.articles.map((a) => (
              <Card key={a.id} a={a} />
            ))}
          </div>
        </section>
      ))}

      <section className="py-6">
        <h2 className="border-b-2 border-[#141414] pb-1 text-sm font-bold uppercase tracking-[0.2em]">
          More for you
        </h2>
        <div className="grid gap-x-8 md:grid-cols-2">
          {edition.more.map((a) => (
            <Card key={a.id} a={a} />
          ))}
        </div>
      </section>
    </main>
  );
}