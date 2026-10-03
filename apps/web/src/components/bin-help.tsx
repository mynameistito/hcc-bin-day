import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { BIN_ITEM_SOURCE, BIN_ITEMS, searchBinItems } from "@/lib/bin-items";
import type { BinType } from "@/lib/bin-items";

interface BinHelpProps {
  readonly bin: BinType | null;
  readonly binName: string;
  readonly onClose: () => void;
}

interface BinHelpControlProps {
  readonly bin: BinType | null;
  readonly binName: string;
}

const verificationDateFormatter = new Intl.DateTimeFormat("en-NZ", {
  dateStyle: "long",
  timeZone: "UTC",
});
const hasConflictingKerbsideGuidance = (itemId: number): boolean =>
  itemId === 231 || itemId === 232;

const KerbsideGuidanceNotice = () => (
  <p className="text-copy-muted mt-1 block text-xs">
    Council sorter entries 231 and 232 classify these takeaway containers as
    red, while separate Council{" "}
    <a
      className="underline underline-offset-2"
      href="https://hamilton.govt.nz/fight-the-landfill/kerbside-collection"
      rel="noreferrer"
      target="_blank"
    >
      kerbside guidance
    </a>{" "}
    says clean cardboard and eligible plastics numbered 1, 2 or 5 go in yellow
    recycling. Check current Council advice before disposal.
  </p>
);

const BinHelp = ({ bin, binName, onClose }: BinHelpProps) => {
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const guidance = bin ? BIN_ITEMS.filter((entry) => entry.bin === bin) : [];
  const results = query.trim() ? searchBinItems(query) : null;
  const hasGuidanceConflict = guidance.some(({ id }) =>
    hasConflictingKerbsideGuidance(id)
  );
  const showGuidance = results === null && guidance.length > 0;
  const showNoGuidance = results === null && guidance.length === 0;
  const hasMoreGuidance = guidance.length > 10;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    dialog.showModal?.();
    if (!dialog.open) {
      dialog.setAttribute("open", "");
    }
    searchRef.current?.focus();
    return () => {
      if (dialog.open) {
        dialog.close?.();
      }
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable.item(0);
    const last = focusable.item(focusable.length - 1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    <dialog
      aria-labelledby="bin-help-title"
      aria-modal="true"
      className="fixed inset-0 z-50 m-0 grid h-dvh max-h-none w-full max-w-none items-end border-0 bg-black/55 p-0 sm:place-items-center sm:p-5"
      onKeyDown={handleKeyDown}
      ref={dialogRef}
    >
      <section className="border-card-border bg-surface text-ink max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl border p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-caption text-xs font-bold tracking-wide uppercase">
              Bin help
            </p>
            <h2 className="mt-1 text-xl font-semibold" id="bin-help-title">
              What goes in the {binName}?
            </h2>
          </div>
          <Button
            aria-label="Close bin help"
            className="min-h-11 min-w-11"
            onClick={onClose}
            variant="outline"
          >
            <span aria-hidden="true">×</span>
          </Button>
        </div>

        <label className="mt-6 block font-semibold" htmlFor="bin-item-search">
          Search the full catalogue
        </label>
        <input
          className="border-sage-border bg-panel focus-visible:outline-focus-leaf mt-2 min-h-12 w-full rounded-xl border px-4 py-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
          id="bin-item-search"
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="e.g. glass bottles"
          ref={searchRef}
          type="search"
        />
        {results && (
          <output aria-live="polite" className="mt-3 block">
            {results.length ? (
              <ul className="space-y-2">
                {results.map((entry) => (
                  <li
                    className="bg-panel rounded-xl p-3 text-sm"
                    key={entry.id}
                  >
                    <span className="font-semibold">{entry.item}</span>
                    <span className="mt-1 block">{entry.destination}</span>
                    {entry.notes && (
                      <span className="mt-1 block">{entry.notes}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <>
                No item matches “{query}”. Search again or visit the Council
                sorter.
              </>
            )}
          </output>
        )}

        {showGuidance && (
          <>
            <h3 className="mt-6 font-semibold">
              Council sorter items for this bin
            </h3>
            {hasGuidanceConflict && <KerbsideGuidanceNotice />}
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6">
              {guidance.slice(0, 10).map((entry) => (
                <li key={entry.id}>
                  {entry.item}
                  {entry.notes && (
                    <span className="text-copy-muted"> — {entry.notes}</span>
                  )}
                </li>
              ))}
            </ul>
            {hasMoreGuidance && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer underline underline-offset-2">
                  Show the remaining {guidance.length - 10} items
                </summary>
                <ul className="mt-2 list-disc space-y-2 pl-5 leading-6">
                  {guidance.slice(10).map((entry) => (
                    <li key={entry.id}>
                      {entry.item}
                      {entry.notes && (
                        <span className="text-copy-muted">
                          {" "}
                          — {entry.notes}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
        {showNoGuidance && (
          <p className="text-copy-muted mt-2 text-sm leading-6">
            The Council sorter has no listed items for this bin. Search the
            catalogue below or visit Hamilton City Council for current advice.
          </p>
        )}

        <p className="text-copy-muted mt-5 text-xs leading-5">
          Checked{" "}
          {verificationDateFormatter.format(
            new Date(`${BIN_ITEM_SOURCE.verifiedOn}T12:00:00Z`)
          )}
          . Full Council sorter catalogue; see{" "}
          <a
            className="underline underline-offset-2"
            href={BIN_ITEM_SOURCE.url}
            rel="noreferrer"
            target="_blank"
          >
            Hamilton City Council’s item sorter
          </a>{" "}
          for current guidance.
        </p>
      </section>
    </dialog>
  );
};

/** Render a per-bin help trigger and its dismissible item guide. */
const BinHelpControl = ({ bin, binName }: BinHelpControlProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hasOpened = useRef(false);

  useEffect(() => {
    if (isOpen) {
      hasOpened.current = true;
    } else if (hasOpened.current) {
      buttonRef.current?.focus();
    }
  }, [isOpen]);

  const close = () => setIsOpen(false);

  return (
    <>
      <Button
        aria-label={`What goes in the ${binName}?`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="size-11 shrink-0"
        onClick={() => setIsOpen(true)}
        ref={buttonRef}
        variant="icon"
      >
        ?
      </Button>
      {isOpen &&
        createPortal(
          <BinHelp bin={bin} binName={binName} onClose={close} />,
          document.body
        )}
    </>
  );
};

export { BinHelpControl };
