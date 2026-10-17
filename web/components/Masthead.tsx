type Props = {
  left?: string;
  right?: string;
  title: string;
  sub?: string;
  urdu?: boolean;
  big?: boolean;
};

export default function Masthead({ left, right, title, sub, urdu, big }: Props) {
  return (
    <header className="rule-double reveal py-4 text-center">
      {(left || right) && (
        <div className="kicker flex justify-between gap-4">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      )}
      <h1
        className={`font-display font-black leading-[0.95] tracking-tight ${
          big ? "mt-4 text-5xl md:text-7xl" : "mt-3 text-5xl md:text-6xl"
        }`}
      >
        {title}
      </h1>
      {urdu && (
        <p lang="ur" dir="rtl" className="font-urdu mt-3 text-2xl leading-[2] text-accent">
          پہلا صفحہ
        </p>
      )}
      {sub && <p className="font-display mt-1 italic text-muted">{sub}</p>}
    </header>
  );
}