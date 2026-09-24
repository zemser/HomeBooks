"use client";

import { createPortal } from "react-dom";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { REVIEW_IMPORT_ALL, isReviewImportAll } from "@/features/expenses/review-filtering";
import type { ReviewQueueImportSummary } from "@/features/expenses/types";

import {
  filterStatements,
  groupStatementsBySource,
  partitionStatements,
  statementOptionLabel,
  statementOptionTitle,
  statementProgressPercent,
  statementRowSubtitle,
  statementSourceName,
  statementSwitcherMode,
  statementSwitcherTriggerLabel,
} from "@/components/expenses/statement-switcher-model";

const statementSheetQuery = "(max-width: 720px)";

function subscribeStatementSheet(onStoreChange: () => void) {
  const media = window.matchMedia(statementSheetQuery);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function useStatementSheet() {
  return useSyncExternalStore(subscribeStatementSheet, () => window.matchMedia(statementSheetQuery).matches, () => false);
}

function scrollOptionIntoList(option: HTMLElement, list: HTMLElement) {
  const optionRect = option.getBoundingClientRect();
  const listRect = list.getBoundingClientRect();
  if (optionRect.top < listRect.top) {
    list.scrollTop -= listRect.top - optionRect.top;
  } else if (optionRect.bottom > listRect.bottom) {
    list.scrollTop += optionRect.bottom - listRect.bottom;
  }
}

function CurrentMark() {
  return (
    <svg className="statement-switcher-check" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Chevron({ direction = "down" }: { direction?: "down" | "right" }) {
  return (
    <svg className="statement-switcher-chevron" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={direction === "right" ? "M6 4.5 10 8 6 11.5" : "M4 6.5 8 10.5 12 6.5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatementOption({
  item,
  current,
  showSource,
  onSelect,
  optionRef,
}: {
  item: ReviewQueueImportSummary;
  current: boolean;
  showSource: boolean;
  onSelect: (importId: string) => void;
  optionRef?: (node: HTMLButtonElement | null) => void;
}) {
  const title = statementOptionTitle(item);
  const showFilename = title !== item.originalFilename;
  const percent = statementProgressPercent(item);

  return (
    <button
      className={`statement-switcher-row${current ? " is-current" : ""}`}
      type="button"
      data-statement-option=""
      aria-current={current ? "true" : undefined}
      aria-label={statementOptionLabel(item)}
      title={item.originalFilename}
      ref={optionRef}
      onClick={() => onSelect(item.importId)}
    >
      <span className="statement-switcher-row-copy">
        <strong>{title}</strong>
        <span className="statement-switcher-meta">
          {showSource ? `${statementSourceName(item)} · ` : null}
          {statementRowSubtitle(item)}
        </span>
        {showFilename ? <span className="statement-switcher-filename">{item.originalFilename}</span> : null}
      </span>
      {current ? <CurrentMark /> : null}
      <span className="statement-switcher-meter" aria-hidden="true">
        <span className="statement-switcher-meter-fill" style={{ width: `${percent}%` }} />
      </span>
    </button>
  );
}

export function StatementSwitcher({
  statements,
  selectedImportId,
  remainingCount,
  onSelect,
}: {
  statements: ReviewQueueImportSummary[];
  selectedImportId: string;
  remainingCount: number;
  onSelect: (importId: string) => void;
}) {
  const panelId = useId();
  const isSheet = useStatementSheet();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const currentRowRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [completedOpen, setCompletedOpen] = useState(false);

  const mode = statementSwitcherMode(statements.length);
  const { active, complete } = useMemo(() => partitionStatements(statements), [statements]);
  const visibleActive = useMemo(() => filterStatements(active, query), [active, query]);
  const visibleComplete = useMemo(() => filterStatements(complete, query), [complete, query]);
  const searching = query.trim().length > 0;
  const showCompleteRows = mode === "menu" || (visibleComplete.length > 0 && (searching || completedOpen));
  const triggerLabel = statementSwitcherTriggerLabel(statements, selectedImportId);
  const allRemainingCurrent = isReviewImportAll(selectedImportId);
  const remainingLabel = `${remainingCount} transaction${remainingCount === 1 ? "" : "s"} remaining`;

  function assignCurrentRef(current: boolean) {
    return (node: HTMLButtonElement | null) => {
      if (current) currentRowRef.current = node;
    };
  }

  function closePanel(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function togglePanel() {
    if (open) {
      setOpen(false);
      return;
    }
    setQuery("");
    setCompletedOpen(complete.some((item) => item.importId === selectedImportId));
    setOpen(true);
  }

  function choose(importId: string) {
    onSelect(importId);
    closePanel(true);
  }

  function focusOption(option: HTMLElement) {
    option.focus({ preventScroll: true });
    const list = listRef.current;
    if (list?.contains(option)) scrollOptionIntoList(option, list);
  }

  function onPanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (query.trim() && event.target instanceof HTMLInputElement) {
        setQuery("");
        return;
      }
      closePanel(true);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

    const panel = panelRef.current;
    if (!panel) return;
    const options = [...panel.querySelectorAll<HTMLButtonElement>("[data-statement-option]")];
    if (options.length === 0) return;

    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const current = document.activeElement;
    if (current instanceof HTMLInputElement) {
      if (direction === 1) focusOption(options[0]!);
      return;
    }

    const index = options.findIndex((option) => option === current);
    if (index === -1) {
      focusOption(options[0]!);
      return;
    }
    if (direction === -1 && index === 0 && searchRef.current) {
      searchRef.current.focus({ preventScroll: true });
      return;
    }
    const next = options[index + direction];
    if (next) focusOption(next);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const search = searchRef.current;
      if (search && document.activeElement === search && search.value.trim()) {
        event.preventDefault();
        event.stopPropagation();
        setQuery("");
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const option = currentRowRef.current;
    const list = listRef.current;
    if (!option || !list?.contains(option)) return;
    scrollOptionIntoList(option, list);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (mode === "browser") {
      searchRef.current?.focus({ preventScroll: true });
      return;
    }
    const current = currentRowRef.current;
    if (!current) return;
    current.focus({ preventScroll: true });
    const list = listRef.current;
    if (list?.contains(current)) scrollOptionIntoList(current, list);
  }, [mode, open]);

  if (mode === "hidden") return null;

  const activeRows = mode === "browser"
    ? groupStatementsBySource(visibleActive).map((group) => (
        <div className="statement-switcher-group" key={group.source}>
          <div className="statement-switcher-source">{group.source}</div>
          {group.statements.map((item) => (
            <StatementOption
              current={item.importId === selectedImportId}
              item={item}
              key={item.importId}
              onSelect={choose}
              optionRef={assignCurrentRef(item.importId === selectedImportId)}
              showSource={false}
            />
          ))}
        </div>
      ))
    : visibleActive.map((item) => (
        <StatementOption
          current={item.importId === selectedImportId}
          item={item}
          key={item.importId}
          onSelect={choose}
          optionRef={assignCurrentRef(item.importId === selectedImportId)}
          showSource
        />
      ));

  const completeRows = showCompleteRows
    ? mode === "browser"
      ? groupStatementsBySource(visibleComplete).map((group) => (
          <div className="statement-switcher-group" key={`complete-${group.source}`}>
            <div className="statement-switcher-source">{group.source}</div>
            {group.statements.map((item) => (
              <StatementOption
                current={item.importId === selectedImportId}
                item={item}
                key={item.importId}
                onSelect={choose}
                optionRef={assignCurrentRef(item.importId === selectedImportId)}
                showSource={false}
              />
            ))}
          </div>
        ))
      : visibleComplete.map((item) => (
          <StatementOption
            current={item.importId === selectedImportId}
            item={item}
            key={item.importId}
            onSelect={choose}
            optionRef={assignCurrentRef(item.importId === selectedImportId)}
            showSource
          />
        ))
    : null;

  const panel = (
    <div
      className="statement-switcher-panel"
      id={panelId}
      ref={panelRef}
      role="dialog"
      aria-label="Choose a statement"
      aria-hidden={open ? undefined : true}
      data-open={open ? "true" : "false"}
      data-mode={mode}
      inert={open ? undefined : true}
      onKeyDown={onPanelKeyDown}
    >
      {mode === "browser" ? (
        <input
          className="input statement-switcher-search"
          ref={searchRef}
          type="search"
          value={query}
          autoComplete="off"
          placeholder="Search statements"
          aria-label="Search statements"
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}
      <div className="statement-switcher-pinned">
        <button
          className={`statement-switcher-row statement-switcher-all${allRemainingCurrent ? " is-current" : ""}`}
          type="button"
          data-statement-option=""
          aria-current={allRemainingCurrent ? "true" : undefined}
          ref={assignCurrentRef(allRemainingCurrent)}
          onClick={() => choose(REVIEW_IMPORT_ALL)}
        >
          <span className="statement-switcher-row-copy">
            <strong>All remaining</strong>
            <span className="statement-switcher-meta">{remainingLabel}</span>
          </span>
          {allRemainingCurrent ? <CurrentMark /> : null}
        </button>
      </div>
      <div className="statement-switcher-list" ref={listRef}>
        {activeRows}
        {mode === "browser" && complete.length > 0 && !searching ? (
          <button
            className="statement-switcher-complete-toggle"
            type="button"
            data-statement-option=""
            aria-expanded={completedOpen}
            onClick={() => setCompletedOpen((current) => !current)}
          >
            <Chevron direction="right" />
            <span>{complete.length} complete</span>
          </button>
        ) : null}
        {mode === "browser" && searching && visibleComplete.length > 0 ? (
          <div className="statement-switcher-source">Complete</div>
        ) : null}
        {completeRows}
        {searching && visibleActive.length === 0 && visibleComplete.length === 0 ? (
          <p className="statement-switcher-empty">No statements match this search.</p>
        ) : null}
      </div>
    </div>
  );

  return (
    <div
      className="statement-switcher"
      ref={rootRef}
      onKeyDown={(event) => {
        if (!open) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          closePanel(true);
          return;
        }
        if (event.key !== "ArrowDown" || event.target !== triggerRef.current) return;
        const first = panelRef.current?.querySelector<HTMLButtonElement>("[data-statement-option]");
        if (!first) return;
        event.preventDefault();
        event.stopPropagation();
        focusOption(first);
      }}
    >
      <button
        className="statement-switcher-trigger"
        type="button"
        ref={triggerRef}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        aria-label={`Statements, ${triggerLabel}`}
        onClick={togglePanel}
      >
        <span className="statement-switcher-trigger-label">{triggerLabel}</span>
        <Chevron />
      </button>
      {isSheet ? createPortal(panel, document.body) : panel}
    </div>
  );
}
