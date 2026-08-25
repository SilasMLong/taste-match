"use client";

import { useEffect, useState } from "react";
import Loader from "./Loader";

type Entry = [string, number];

interface ProfileData {
  swipe_count: number;
  liked_count: number;
  favored: Entry[];
  avoided: Entry[];
}

type Status = "loading" | "ready" | "error";

export default function TasteProfile() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    fetch("/api/profile")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load taste profile");
        return res.json();
      })
      .then((d) => {
        setData(d as ProfileData);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-sm text-muted">Couldn&apos;t load your taste profile.</p>
      </div>
    );
  }

  if (data.swipe_count === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="font-serif text-lg text-foreground">Nothing to read yet.</p>
        <p className="text-sm text-muted">
          Swipe on a few pieces and this will start to take shape.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-10 px-6 py-12 sm:py-16">
      <div className="text-center">
        <p className="font-serif text-xl text-foreground sm:text-2xl">Your taste so far</p>
        <p className="mt-2 text-sm text-muted">
          {data.liked_count} liked out of {data.swipe_count} swiped
        </p>
      </div>

      {data.favored.length > 0 && (
        <section>
          <h2 className="mb-3 text-center text-xs uppercase tracking-wide text-muted">
            You favor
          </h2>
          <ul className="flex flex-wrap justify-center gap-2">
            {data.favored.map(([tag, weight]) => (
              <li
                key={tag}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
              >
                {tag} <span className="text-muted">+{weight}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.avoided.length > 0 && (
        <section>
          <h2 className="mb-3 text-center text-xs uppercase tracking-wide text-muted">
            You tend to pass on
          </h2>
          <ul className="flex flex-wrap justify-center gap-2">
            {data.avoided.map(([tag, weight]) => (
              <li
                key={tag}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-muted"
              >
                {tag} <span>{weight}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.favored.length === 0 && data.avoided.length === 0 && (
        <p className="text-center text-sm text-muted">
          Still even -- keep swiping and a pattern will emerge.
        </p>
      )}
    </div>
  );
}
