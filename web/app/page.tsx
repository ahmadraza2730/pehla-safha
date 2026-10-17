"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
const TOPICS = [
  "Politics", "World", "Business", "Technology", "AI", "Science", "Health",
  "Sports", "Cricket", "Entertainment", "Pakistan", "Education",
  "Environment", "Gaming", "Culture", "Opinion",
];
const IDEAS = [
  "I build games and follow computer vision",
  "Pakistan economy and cricket",
  "Startups, AI tools and space",
];

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [about, setAbout] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+\$/.test(email);
  const canNext =
    (step === 0 && name.trim().length > 0 && emailOk) ||
    (step === 1 && topics.length >= 3) ||
    step === 2;

  const toggle = (t: string) =>
    setTopics((cur) =>
      cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]
    );

  async function finish() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: name.trim(),
          topics,
          about,
        }),
      });
      if (!res.ok) throw new Error(`Server replied ${res.status}`);
      const data = await res.json();
      localStorage.setItem("safha_user", data.user_id);
      localStorage.setItem("safha_name", name.trim());
      router.push("/paper");
    } catch (e) {
      setError("Couldn't reach the server. Is the API running on port 8000?");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-10">
      <header className="border-b-4 border-double border-[#141414] pb-4 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-600">
          Est. this morning
        </p>
        <h1 className="font-display text-5xl font-bold">Pehla Safha</h1>
        <p className="font-display italic text-neutral-700">The First Page</p>
      </header>

      <div className="mt-6 h-1 w-full rounded bg-neutral-300">
        <div
          className="h-1 rounded bg-[#B3261E] transition-all"
          style={{ width: `${((step + 1) / 3) * 100}%` }}
        />
      </div>

      <section className="flex-1 py-10">
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-3xl font-bold">
                Let&apos;s print your first page.
              </h2>
              <p className="mt-2 text-neutral-700">
                One paper, made for you, every morning.
              </p>
            </div>
            <label className="block">
              <span className="text-sm font-medium">Your name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ahmad"
                className="mt-1 w-full rounded border border-neutral-400 bg-white/70 px-4 py-3 outline-none focus:border-[#B3261E]"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full rounded border border-neutral-400 bg-white/70 px-4 py-3 outline-none focus:border-[#B3261E]"
              />
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-3xl font-bold">
                What do you read about?
              </h2>
              <p className="mt-2 text-neutral-700">
                Pick at least 3. You can change this anytime.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {TOPICS.map((t) => {
                const on = topics.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggle(t)}
                    className={`rounded-full border px-4 py-2 text-sm transition ${
                      on
                        ? "border-[#141414] bg-[#141414] text-[#F6F1E7]"
                        : "border-neutral-400 bg-white/60 hover:border-[#141414]"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-neutral-600">
              {topics.length} selected
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-3xl font-bold">
                Anything else we should know?
              </h2>
              <p className="mt-2 text-neutral-700">
                Optional. Describe your interests in your own words.
              </p>
            </div>
            <textarea
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              rows={4}
              placeholder="e.g. I build games, follow computer vision and love cricket"
              className="w-full rounded border border-neutral-400 bg-white/70 px-4 py-3 outline-none focus:border-[#B3261E]"
            />
            <div className="flex flex-wrap gap-2">
              {IDEAS.map((i) => (
                <button
                  key={i}
                  onClick={() => setAbout(i)}
                  className="rounded border border-dashed border-neutral-400 px-3 py-1 text-xs text-neutral-700 hover:border-[#141414]"
                >
                  {i}
                </button>
              ))}
            </div>
            {error && <p className="text-sm text-[#B3261E]">{error}</p>}
          </div>
        )}
      </section>

      <footer className="flex items-center justify-between border-t border-neutral-400 pt-6">
        <button
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0 || loading}
          className="text-sm text-neutral-700 disabled:opacity-30"
        >
          Back
        </button>
        {step < 2 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext}
            className="rounded bg-[#141414] px-6 py-3 text-sm font-medium text-[#F6F1E7] disabled:opacity-30"
          >
            Continue
          </button>
        ) : (
          <button
            onClick={finish}
            disabled={loading}
            className="rounded bg-[#B3261E] px-6 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Printing your paper..." : "Print my first page"}
          </button>
        )}
      </footer>
    </main>
  );
}