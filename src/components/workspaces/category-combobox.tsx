"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

type CategoryComboboxProps = {
  categories: string[];
  value: string;
  onChange: (value: string) => void;
  recentCategories?: string[];
  suggestedCategory?: string | null;
  label?: string;
  blankLabel?: string;
  disabled?: boolean;
  onCreateCategory?: (name: string) => Promise<string>;
};

type CategoryOption = {
  value: string;
  section: "Suggested" | "Recent" | "All categories";
};

function canonical(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function CategoryCombobox({
  categories,
  value,
  onChange,
  recentCategories = [],
  suggestedCategory = null,
  label = "Category",
  blankLabel = "Uncategorized",
  disabled = false,
  onCreateCategory,
}: CategoryComboboxProps) {
  const inputId = useId();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) setQuery(value);
  }, [isOpen, value]);

  const options = useMemo(() => {
    const seen = new Set<string>();
    const next: CategoryOption[] = [];
    const add = (candidate: string | null | undefined, section: CategoryOption["section"]) => {
      const trimmed = candidate?.trim();
      if (!trimmed) return;
      const key = canonical(trimmed);
      if (seen.has(key)) return;
      seen.add(key);
      next.push({ value: trimmed, section });
    };

    add(suggestedCategory, "Suggested");
    recentCategories.forEach((category) => add(category, "Recent"));
    categories.forEach((category) => add(category, "All categories"));

    const normalizedQuery = canonical(query);
    return normalizedQuery
      ? next.filter((option) => canonical(option.value).includes(normalizedQuery))
      : next;
  }, [categories, query, recentCategories, suggestedCategory]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(options.length - 1, 0)));
  }, [options.length]);

  function selectValue(nextValue: string) {
    onChange(nextValue);
    setQuery(nextValue);
    setIsOpen(false);
    inputRef.current?.focus();
  }

  async function createCategory() {
    const name = query.trim();
    if (!name || !onCreateCategory || isCreating) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const createdName = await onCreateCategory(name);
      selectValue(createdName);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Could not create the category.");
    } finally {
      setIsCreating(false);
    }
  }

  const canCreate =
    Boolean(onCreateCategory) &&
    query.trim().length > 0 &&
    !categories.some((category) => canonical(category) === canonical(query));
  const activeOptionId = options[activeIndex]
    ? `${listboxId}-option-${activeIndex}`
    : undefined;

  return (
    <div className="category-combobox">
      <label htmlFor={inputId}>{label}</label>
      <div className="category-combobox-control">
        <input
          ref={inputRef}
          id={inputId}
          className="input"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={isOpen ? activeOptionId : undefined}
          autoComplete="off"
          disabled={disabled}
          value={query}
          placeholder={blankLabel}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setIsOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setIsOpen(true);
              setActiveIndex((current) => options.length > 0 ? Math.min(current + 1, options.length - 1) : 0);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setIsOpen(true);
              setActiveIndex((current) => Math.max(current - 1, 0));
            } else if (event.key === "Enter" && isOpen) {
              event.preventDefault();
              if (options[activeIndex]) selectValue(options[activeIndex].value);
              else if (canCreate) void createCategory();
            } else if (event.key === "Escape") {
              event.preventDefault();
              setQuery(value);
              setIsOpen(false);
            }
          }}
          onBlur={(event) => {
            const nextTarget = event.relatedTarget;
            if (!(nextTarget instanceof Node) || !event.currentTarget.parentElement?.parentElement?.contains(nextTarget)) {
              setQuery(value);
              setIsOpen(false);
            }
          }}
        />
        {value ? (
          <button
            className="category-combobox-clear"
            type="button"
            aria-label={`Clear ${label.toLocaleLowerCase()}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => selectValue("")}
          >
            ×
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <div className="category-combobox-popup" id={listboxId} role="listbox" aria-label={label}>
          <button
            className={`category-combobox-option ${value === "" ? "is-selected" : ""}`}
            type="button"
            role="option"
            aria-selected={value === ""}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => selectValue("")}
          >
            {blankLabel}
          </button>
          {options.map((option, index) => {
            const showSection = index === 0 || options[index - 1]?.section !== option.section;
            return (
              <div key={`${option.section}-${option.value}`}>
                {showSection ? <div className="category-combobox-section">{option.section}</div> : null}
                <button
                  id={`${listboxId}-option-${index}`}
                  className={`category-combobox-option ${index === activeIndex ? "is-active" : ""} ${canonical(value) === canonical(option.value) ? "is-selected" : ""}`}
                  type="button"
                  role="option"
                  aria-selected={canonical(value) === canonical(option.value)}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectValue(option.value)}
                >
                  {option.value}
                </button>
              </div>
            );
          })}
          {options.length === 0 && !canCreate ? (
            <p className="category-combobox-empty">No matching categories.</p>
          ) : null}
          {canCreate ? (
            <button
              className="category-combobox-create"
              type="button"
              disabled={isCreating}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void createCategory()}
            >
              {isCreating ? "Creating…" : `Create “${query.trim()}”`}
            </button>
          ) : null}
          {createError ? <p className="category-combobox-error" role="alert">{createError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
