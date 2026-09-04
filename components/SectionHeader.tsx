import Link from "next/link";

export default function SectionHeader({
  title,
  href,
  accentClass = "text-accent",
}: {
  title: string;
  href?: string;
  accentClass?: string;
}) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <h2 className="font-display text-xl font-black sm:text-2xl">
        {title} <span className={accentClass}>.</span>
      </h2>
      {href && (
        <Link href={href} className="text-sm font-semibold text-muted hover:text-accent">
          Xem thêm →
        </Link>
      )}
    </div>
  );
}
