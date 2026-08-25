"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import Card from "./Card";
import { displayUrl } from "@/lib/imageProxy";
import { getSessionId } from "@/lib/session";
import { CATEGORY_GROUPS, type CategoryGroup } from "@/lib/categoryGroups";
import type { ImageRecord } from "@/lib/types";

const SWIPE_THRESHOLD = 120;
const VELOCITY_THRESHOLD = 500;
const REFETCH_WHEN_BELOW = 5;
const FETCH_LIMIT = 20;
const STACK_DEPTH = 3;
// Only the three stacked cards have <img> tags in the DOM, so the fourth card's
// image doesn't begin loading until it enters the stack -- and proxied
// architecture images take a second or more to arrive. Warming the next few
// means the browser already holds them by the time they're shown.
const PRELOAD_AHEAD = 4;

type PendingAction = "like" | "pass" | null;

async function fetchDeck(userId: string, group: CategoryGroup | null): Promise<ImageRecord[]> {
  const params = new URLSearchParams({ user_id: userId, limit: String(FETCH_LIMIT) });
  if (group) params.set("category_group", group);
  const res = await fetch(`/api/deck?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to load deck");
  const data = await res.json();
  return data.images as ImageRecord[];
}

function logSwipe(userId: string, imageId: string, liked: boolean) {
  fetch("/api/swipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, image_id: imageId, liked }),
  }).catch(() => {
    // Best-effort: a dropped swipe just means that card won't count toward
    // a future session's recommendations. Not worth blocking or retrying in V1.
  });
}

function SwipeableCard({
  image,
  pendingAction,
  onSwiped,
}: {
  image: ImageRecord;
  pendingAction: PendingAction;
  onSwiped: (liked: boolean) => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-12, 12]);
  const likeOpacity = useTransform(x, [20, 120], [0, 1]);
  const passOpacity = useTransform(x, [-120, -20], [1, 0]);
  const fired = useRef(false);

  useEffect(() => {
    if (!pendingAction || fired.current) return;
    fired.current = true;
    const liked = pendingAction === "like";
    animate(x, liked ? 600 : -600, { duration: 0.25, ease: "easeOut" }).then(() =>
      onSwiped(liked)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction]);

  const handleDragEnd = (
    _: unknown,
    info: { offset: { x: number }; velocity: { x: number } }
  ) => {
    if (fired.current) return;
    const passed =
      Math.abs(info.offset.x) > SWIPE_THRESHOLD ||
      Math.abs(info.velocity.x) > VELOCITY_THRESHOLD;
    if (!passed) {
      animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
      return;
    }
    fired.current = true;
    const liked = info.offset.x > 0;
    animate(x, liked ? 600 : -600, { duration: 0.25, ease: "easeOut" }).then(() =>
      onSwiped(liked)
    );
  };

  return (
    <motion.div
      className="absolute inset-0 cursor-grab active:cursor-grabbing"
      style={{ x, rotate }}
      drag="x"
      dragElastic={0.6}
      onDragEnd={handleDragEnd}
    >
      <motion.span
        style={{ opacity: likeOpacity }}
        className="pointer-events-none absolute left-6 top-6 z-10 -rotate-6 rounded border-2 border-accent px-3 py-1 text-sm font-semibold tracking-wide text-accent"
      >
        LIKE
      </motion.span>
      <motion.span
        style={{ opacity: passOpacity }}
        className="pointer-events-none absolute right-6 top-6 z-10 rotate-6 rounded border-2 border-muted px-3 py-1 text-sm font-semibold tracking-wide text-muted"
      >
        PASS
      </motion.span>
      <Card image={image} />
    </motion.div>
  );
}

export default function SwipeDeck() {
  const [deck, setDeck] = useState<ImageRecord[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  // null = the unfiltered "all categories" state -- no bubble highlighted.
  const [selectedGroup, setSelectedGroup] = useState<CategoryGroup | null>(null);
  const seenIds = useRef<Set<string>>(new Set());
  // Not component state: it's never part of the rendered output, only read
  // imperatively for API calls, so it doesn't belong in useState.
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const id = getSessionId();
    sessionIdRef.current = id;
    fetchDeck(id, selectedGroup)
      .then((images) => {
        images.forEach((img) => seenIds.current.add(img.id));
        setDeck(images);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [selectedGroup]);

  useEffect(() => {
    const id = sessionIdRef.current;
    if (!id || status !== "ready" || deck.length >= REFETCH_WHEN_BELOW) return;
    fetchDeck(id, selectedGroup)
      .then((images) => {
        const fresh = images.filter((img) => !seenIds.current.has(img.id));
        fresh.forEach((img) => seenIds.current.add(img.id));
        if (fresh.length > 0) setDeck((prev) => [...prev, ...fresh]);
      })
      .catch(() => {
        // Deck just won't grow this round; the empty state below covers running out.
      });
  }, [deck.length, status, selectedGroup]);

  const handleSwiped = (liked: boolean) => {
    const top = deck[0];
    const id = sessionIdRef.current;
    if (!top || !id) return;
    logSwipe(id, top.id, liked);
    setDeck((prev) => prev.slice(1));
    setPendingAction(null);
  };

  const trigger = (liked: boolean) => {
    if (pendingAction || deck.length === 0) return;
    setPendingAction(liked ? "like" : "pass");
  };

  // Clicking the already-active bubble clears the filter back to "all
  // categories" -- that's the only way back to the unfiltered state, since
  // there's no separate "All" bubble. The reset happens here, synchronously
  // in the click handler, rather than in the effect that reacts to
  // selectedGroup -- a filter change is a new browsing session, not an
  // incremental update to the old one, and it's already known at click time.
  const handleSelectGroup = (group: CategoryGroup) => {
    setStatus("loading");
    setDeck([]);
    setPendingAction(null);
    seenIds.current = new Set();
    setSelectedGroup((prev) => (prev === group ? null : group));
  };

  const groupBubbles = (
    <div className="flex flex-wrap items-center justify-center gap-2 px-6 pt-6">
      {CATEGORY_GROUPS.map((group) => {
        const active = selectedGroup === group.key;
        return (
          <motion.button
            key={group.key}
            type="button"
            onClick={() => handleSelectGroup(group.key)}
            aria-pressed={active}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-surface text-muted hover:text-foreground"
            }`}
          >
            {group.label}
          </motion.button>
        );
      })}
    </div>
  );

  // Fire-and-forget: the browser caches the response, so the <img> that renders
  // later hits cache rather than the network. Nothing reads these objects.
  useEffect(() => {
    for (const image of deck.slice(STACK_DEPTH, STACK_DEPTH + PRELOAD_AHEAD)) {
      const preloader = new window.Image();
      preloader.referrerPolicy = "no-referrer";
      preloader.src = displayUrl(image);
    }
  }, [deck]);

  if (status === "loading") {
    return (
      <div className="flex flex-1 flex-col">
        {groupBubbles}
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted">Loading the gallery…</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-1 flex-col">
        {groupBubbles}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-sm text-foreground">Couldn&apos;t load the deck.</p>
          <p className="text-sm text-muted">
            Check that the backend is configured — see supabase/README.md.
          </p>
        </div>
      </div>
    );
  }

  if (deck.length === 0) {
    const activeLabel = CATEGORY_GROUPS.find((g) => g.key === selectedGroup)?.label;
    return (
      <div className="flex flex-1 flex-col">
        {groupBubbles}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="font-serif text-lg text-foreground">
            {selectedGroup ? `Nothing in ${activeLabel} yet.` : "You've seen everything in the collection."}
          </p>
          <p className="text-sm text-muted">
            {selectedGroup
              ? "This category doesn't have images yet — try Fine Art, or check back later."
              : "Run the seed script again for more, or check back later."}
          </p>
        </div>
      </div>
    );
  }

  const visible = deck.slice(0, STACK_DEPTH);

  return (
    <div className="flex flex-1 flex-col">
      {groupBubbles}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-6 sm:gap-10 sm:py-8">
      {/* Sized from viewport height (not width) so the card scales up on
          tall screens without ever pushing the swipe buttons below the fold
          on shorter ones -- width follows from the 3:4 aspect ratio. */}
      <div className="relative aspect-[3/4] h-[52vh] max-w-[90vw] sm:h-[60vh] lg:h-[65vh]">
        {visible
          .map((image, index) => (
            <div
              key={image.id}
              className="absolute inset-0"
              style={{
                zIndex: STACK_DEPTH - index,
                transform:
                  index === 0
                    ? undefined
                    : `translateY(${index * 10}px) scale(${1 - index * 0.04})`,
                opacity: index === 0 ? 1 : 0.7,
              }}
            >
              {index === 0 ? (
                <SwipeableCard
                  image={image}
                  pendingAction={pendingAction}
                  onSwiped={handleSwiped}
                />
              ) : (
                <Card image={image} />
              )}
            </div>
          ))
          .reverse()}
      </div>

      <div className="flex items-center gap-8">
        <motion.button
          type="button"
          onClick={() => trigger(false)}
          aria-label="Pass"
          whileTap={{ scale: 0.85 }}
          transition={{ type: "spring", stiffness: 500, damping: 20 }}
          className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-surface text-2xl text-muted transition-colors hover:text-foreground active:bg-[#f2f0ec] sm:h-20 sm:w-20 sm:text-3xl"
        >
          ✕
        </motion.button>
        <motion.button
          type="button"
          onClick={() => trigger(true)}
          aria-label="Like"
          whileTap={{ scale: 0.85 }}
          transition={{ type: "spring", stiffness: 500, damping: 20 }}
          className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-surface text-2xl text-accent transition-colors active:bg-[#f2f0ec] sm:h-20 sm:w-20 sm:text-3xl"
        >
          ♥
        </motion.button>
      </div>
      </div>
    </div>
  );
}
