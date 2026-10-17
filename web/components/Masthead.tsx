
import Image from "next/image";

type Props = {
  left?: string;
  right?: string;
  title: string;
  sub?: string;
  urdu?: boolean;
  big?: boolean;
};

export default function Masthead({
  left,
  right,
  title,
  sub,
  urdu,
  big,
}: Props) {
  return (
    <header className="rule-double reveal py-4 text-center">
      {/* Pehla Safha brand logo */}
      <div className="mb-3 flex justify-center">
        <Image
          src="/logo.png"
          alt="Pehla Safha"
          width={180}
          height={180}
          priority
          className="h-auto w-28 object-contain sm:w-32 md:w-36"
        />
      </div>

      {/* Existing newspaper information */}
      {(left || right) && (
        <div className="kicker flex justify-between gap-4">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      )}

      {/* Existing page heading */}
      <h1
        className={`font-display font-black leading-[0.95] tracking-tight ${
          big ? "mt-4 text-5xl md:text-7xl" : "mt-3 text-5xl md:text-6xl"
        }`}
      >
        {title}
      </h1>

      {/* Existing Urdu heading */}
      {urdu && (
        <p
          lang="ur"
          dir="rtl"
          className="font-urdu mt-3 text-2xl leading-[2] text-accent"
        >
          پہلا صفحہ
        </p>
      )}

      {/* Existing subtitle */}
      {sub && (
        <p className="font-display mt-1 italic text-muted">
          {sub}
        </p>
      )}
    </header>
  );
}
