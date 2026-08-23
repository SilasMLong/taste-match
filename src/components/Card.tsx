import { displayUrl } from "@/lib/imageProxy";
import type { ImageRecord } from "@/lib/types";

function caption(image: ImageRecord): string {
  const parts = [image.date_period, image.culture, image.medium].filter(
    (part): part is string => Boolean(part)
  );
  return parts.join(" · ");
}

export default function Card({ image }: { image: ImageRecord }) {
  const sub = caption(image);
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-md border border-border bg-surface shadow-sm">
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#f2f0ec] p-4 sm:p-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- external, unoptimized museum-hosted images */}
        <img
          src={displayUrl(image)}
          alt={image.title}
          draggable={false}
          // The Art Institute of Chicago's image server 403s any request
          // carrying a third-party Referer header -- verified live: 0/80
          // sampled images loaded with a referrer present, 78/80 without
          // one. Browsers send Referer by default on <img> loads, so this
          // was silently breaking every AIC image (1,856 of them) until
          // this was set.
          referrerPolicy="no-referrer"
          className="max-h-full max-w-full select-none object-contain"
        />
      </div>
      <div className="border-t border-border px-6 py-5 text-center sm:px-8 sm:py-6">
        <p className="font-serif text-lg leading-snug text-foreground sm:text-xl">
          {image.title}
        </p>
        {image.artist && (
          <p className="mt-1 text-sm text-muted sm:text-base">{image.artist}</p>
        )}
        {sub && <p className="mt-1 text-xs text-muted sm:text-sm">{sub}</p>}
      </div>
    </div>
  );
}
