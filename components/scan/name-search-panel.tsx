"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search, UserSearch } from "lucide-react";

import { MemberStatusBadge } from "@/components/members/member-status-badge";
import { EmptyState } from "@/components/patterns/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { CheckInCandidate } from "@/server/attendance";

/** Mirrors `CHECK_IN_SEARCH_MIN_LENGTH`; the service enforces it. */
const MIN_LENGTH = 2;
const DEBOUNCE_MS = 200;

type SearchState = "idle" | "loading" | "done" | "error";

function describe(candidate: CheckInCandidate) {
  return [
    candidate.cellGroupName ?? "No cell group",
    candidate.birthYear ? `Born ${candidate.birthYear}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Check-in by name: the path that works whatever the camera is doing. An usher
 * types part of a name, picks the person, and the box clears with focus kept,
 * so the next name can be typed straight away.
 *
 * Keyboard-first: the arrow keys move through the matches, Enter checks in the
 * highlighted one and Escape clears the box.
 */
export function NameSearchPanel({
  search,
  onSelect,
  defaultQuery = "",
  className,
}: {
  search: (query: string) => Promise<CheckInCandidate[]>;
  /**
   * Check the picked member in. Resolve `true` once they are recorded (or
   * already were) to clear the box for the next name, `false` to keep it.
   */
  onSelect: (candidate: CheckInCandidate) => Promise<boolean>;
  /** What the box starts with; it searches straight away when long enough. */
  defaultQuery?: string;
  className?: string;
}) {
  const [query, setQuery] = useState(defaultQuery);
  const [results, setResults] = useState<CheckInCandidate[]>([]);
  const [state, setState] = useState<SearchState>("idle");
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const inputId = useId();
  const listId = useId();

  const text = query.trim();
  const searchable = text.length >= MIN_LENGTH;

  useEffect(() => {
    const request = ++requestRef.current;
    if (!searchable) return;

    const timer = setTimeout(() => {
      setState("loading");
      search(text).then(
        (rows) => {
          // A slower answer to an earlier query must not replace this one.
          if (request !== requestRef.current) return;
          setResults(rows);
          setActive(0);
          setState("done");
        },
        () => {
          if (request !== requestRef.current) return;
          setResults([]);
          setState("error");
        },
      );
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, searchable, text]);

  function change(value: string) {
    setQuery(value);
    if (value.trim().length < MIN_LENGTH) {
      setResults([]);
      setState("idle");
    }
  }

  function clear() {
    requestRef.current += 1;
    setQuery("");
    setResults([]);
    setState("idle");
  }

  async function pick(candidate: CheckInCandidate) {
    if (busy) return;
    setBusy(true);
    try {
      if (await onSelect(candidate)) clear();
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  const open = searchable && results.length > 0;
  const optionId = (index: number) => `${listId}-${index}`;

  function keyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        if (!open) return;
        event.preventDefault();
        setActive((i) => (i + 1) % results.length);
        break;
      case "ArrowUp":
        if (!open) return;
        event.preventDefault();
        setActive((i) => (i - 1 + results.length) % results.length);
        break;
      case "Enter":
        if (!open) return;
        event.preventDefault();
        void pick(results[Math.min(active, results.length - 1)]);
        break;
      case "Escape":
        if (!query) return;
        event.preventDefault();
        clear();
        break;
    }
  }

  return (
    <Card className={className}>
      <CardContent className="space-y-2">
        <Label htmlFor={inputId} className="flex items-center gap-1.5">
          <UserSearch className="size-3.5" aria-hidden />
          Check in by name
        </Label>
        <div className="relative">
          <Search
            className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={inputRef}
            id={inputId}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open ? optionId(active) : undefined}
            aria-busy={busy || undefined}
            value={query}
            onChange={(event) => change(event.target.value)}
            onKeyDown={keyDown}
            placeholder="Type at least 2 letters of a name"
            autoComplete="off"
            spellCheck={false}
            className="pr-8 pl-8"
          />
          {state === "loading" || busy ? (
            <Loader2
              className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
              aria-hidden
            />
          ) : null}
        </div>

        <ul
          id={listId}
          role="listbox"
          aria-label="Matching members"
          hidden={!open}
          className="divide-y overflow-hidden rounded-md border"
        >
          {open
            ? results.map((candidate, index) => (
                <li
                  key={candidate.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === active}
                  // Keep focus in the box, so typing carries on after a click.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setActive(index)}
                  onClick={() => void pick(candidate)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm",
                    index === active && "bg-accent text-accent-foreground",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{candidate.fullName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {describe(candidate)}
                    </p>
                  </div>
                  <MemberStatusBadge status={candidate.status} />
                </li>
              ))
            : null}
        </ul>

        {searchable && state === "done" && results.length === 0 ? (
          <EmptyState
            variant="inline"
            className="py-4"
            title={`No member matches “${text}”`}
            description="Check the spelling, or try part of the surname."
          />
        ) : null}
        {searchable && state === "error" ? (
          <p role="alert" className="text-xs text-destructive">
            The search failed. Try again in a moment.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
