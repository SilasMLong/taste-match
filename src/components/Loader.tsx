// The app's single loading indicator. Brass ring on the app's cream surfaces;
// the colour is the `brass` theme token rather than an inline hex so it can be
// retuned in globals.css alongside every other colour.
//
// `label` is optional because the two uses want different things. A page-level
// wait ("Curating") is one indicator on an otherwise empty screen. A card image
// is one of three in a stack, and three lots of CURATING at once is noise, so
// cards ask for the ring alone.

const SIZES = {
  sm: "h-[18px] w-[18px] border-2",
  md: "h-[30px] w-[30px] border-2",
} as const;

export default function Loader({
  label = "Curating",
  size = "md",
  showLabel = true,
}: {
  label?: string;
  size?: keyof typeof SIZES;
  showLabel?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-[22px]">
      <div
        role="status"
        aria-label={showLabel ? undefined : label}
        className={`${SIZES[size]} rounded-full border-brass/20 border-t-brass animate-spin motion-reduce:animate-none`}
      />
      {showLabel && (
        <div className="text-sm font-semibold uppercase tracking-[5px] text-brass">
          {label}
        </div>
      )}
    </div>
  );
}
