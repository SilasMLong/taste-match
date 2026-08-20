"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getSessionId } from "@/lib/session";
import type { ImageRecord } from "@/lib/types";

type Status = "loading" | "ready" | "error";

export default function LikedWall() {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    const id = getSessionId();
    fetch(`/api/liked?user_id=${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load liked wall");
        return res.json();
      })
      .then((data) => {
        setImages(data.images as ImageRecord[]);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted">Loading your wall…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-sm text-muted">Couldn&apos;t load your liked wall.</p>
      </div>
    );
  }

  const handleRemove = (imageId: string) => {
    setImages((prev) => prev.filter((img) => img.id !== imageId));
    // Converts the swipe to a pass rather than deleting it, so the deck's
    // existing "exclude anything already swiped" logic keeps this image out
    // of rotation for good -- no separate exclusion/weighting mechanism needed.
    fetch("/api/swipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: getSessionId(), image_id: imageId, liked: false }),
    }).catch(() => {
      // Best-effort, matching swipe logging: worst case it reappears on the
      // next reload rather than leaving the wall stuck mid-removal.
    });
  };

  if (images.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="font-serif text-lg text-foreground">Nothing here yet.</p>
        <p className="text-sm text-muted">Swipe right on a few pieces you like.</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-10 sm:px-10">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {images.map((image) => (
          <figure
            key={image.id}
            className="relative flex flex-col overflow-hidden rounded-md border border-border bg-surface"
          >
            <motion.button
              type="button"
              onClick={() => handleRemove(image.id)}
              aria-label={`Remove ${image.title} from liked`}
              whileTap={{ scale: 0.85 }}
              transition={{ type: "spring", stiffness: 500, damping: 20 }}
              className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface/90 text-sm text-muted opacity-70 transition-opacity hover:text-foreground hover:opacity-100 focus-visible:opacity-100 active:bg-[#f2f0ec]"
            >
              ✕
            </motion.button>
            <div className="flex aspect-square items-center justify-center bg-[#f2f0ec] p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- external, unoptimized museum-hosted images */}
              <img
                src={image.image_url}
                alt={image.title}
                loading="lazy"
                className="max-h-full max-w-full object-contain"
              />
            </div>
            <figcaption className="px-3 py-3">
              <p className="truncate font-serif text-sm text-foreground">
                {image.title}
              </p>
              {image.artist && (
                <p className="truncate text-xs text-muted">{image.artist}</p>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
