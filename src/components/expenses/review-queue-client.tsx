"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  AllocationEditor,
  createAllocationFormState,
  emptyAllocationForm,
  type AllocationFormState,
} from "@/components/expenses/allocation-editor";
import { Modal } from "@/components/shared/modal";
import { ClassificationTypePicker } from "@/components/expenses/classification-type-picker";
import { CategoryCombobox } from "@/components/workspaces/category-combobox";
import { getCurrencyNormalizationDisplayState } from "@/features/currency/display";
import { CLASSIFICATION_TYPES, type ClassificationType } from "@/features/expenses/constants";
import {
  buildTransactionReportTargets,
  formatAllocationSummary,
  formatClassificationTypeLabel,
  formatClassificationSummary,
  formatDecisionSourceLabel,
  formatMoneyDisplay,
  getTransactionMerchant,
} from "@/features/expenses/presentation";
import {
  defaultReviewFilterState,
  hasActiveReviewFilters,
  serializeReviewFilterState,
  type ReviewSort,
  type ReviewView,
} from "@/features/expenses/review-filtering";
import { DEFAULT_REVIEW_PAGE_SIZE, parseReviewQuery } from "@/features/expenses/review-query";
import type {
  ExpenseTransactionItem,
  ReviewQueueImportSummary,
  ReviewQueueResponse,
  ReviewQueueSummary,
  WorkspaceMemberOption,
} from "@/features/expenses/types";

type ReviewQueueClientProps = {
  initialData: ReviewQueueResponse;
  initialTransactionId: string | null;
};

type SingleFormState = {
  classificationType: ClassificationType | "";
  category: string;
  categoryId: string;
  memberOwnerId: string;
  createRule: boolean;
  applyToSimilar: boolean;
};

type BulkFormState = {
  classificationType: ClassificationType | "";
  category: string;
  categoryId: string;
  memberOwnerId: string;
};

type ActiveFilterKey =
  | "search"
  | "month"
  | "import"
  | "account"
  | "minimum"
  | "maximum"
  | "sort"
  | "view";

type ReviewImportOption = {
  id: string;
  label: string;
};

function ImportScopePicker({
  imports,
  value,
  onChange,
}: {
  imports: ReviewImportOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [query, setQuery] = useState("");
  const selectedLabel = imports.find((item) => item.id === value)?.label;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredImports = imports.filter((item) =>
    item.label.toLocaleLowerCase().includes(normalizedQuery),
  );

  function selectImport(importId: string) {
    onChange(importId);
    setQuery("");
    if (detailsRef.current) detailsRef.current.open = false;
  }

  return (
    <div className="field import-scope-field">
      <span id="review-import-scope-label">Import</span>
      <details className="import-scope-picker" ref={detailsRef}>
        <summary aria-labelledby="review-import-scope-label">
          {value === "all" ? "All imports" : selectedLabel ?? "Selected import"}
        </summary>
        <div className="import-scope-menu">
          <input
            className="input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search imports"
            aria-label="Search imports"
          />
          <div className="import-scope-options" role="listbox" aria-label="Import options">
            <button
              className={value === "all" ? "is-selected" : ""}
              type="button"
              role="option"
              aria-selected={value === "all"}
              onClick={() => selectImport("all")}
            >
              All imports
            </button>
            {filteredImports.map((item) => (
              <button
                className={value === item.id ? "is-selected" : ""}
                type="button"
                role="option"
                aria-selected={value === item.id}
                onClick={() => selectImport(item.id)}
                key={item.id}
              >
                {item.label}
              </button>
            ))}
            {filteredImports.length === 0 ? (
              <p className="helper-text">No imports match this search.</p>
            ) : null}
          </div>
        </div>
      </details>
    </div>
  );
}

const emptySingleForm: SingleFormState = {
  classificationType: "",
  category: "",
  categoryId: "",
  memberOwnerId: "",
  createRule: false,
  applyToSimilar: false,
};

const emptyBulkForm: BulkFormState = {
  classificationType: "",
  category: "",
  categoryId: "",
  memberOwnerId: "",
};

const emptyReviewSummary: ReviewQueueSummary = {
  totalTransactionCount: 0,
  reviewedCount: 0,
  queueCount: 0,
  completionPercentage: 100,
  latestTransactionMonth: null,
  remainingByImport: [],
  selectedImport: null,
};

function getSelectedTransaction(input: {
  queue: ExpenseTransactionItem[];
  focusTransaction: ExpenseTransactionItem | null;
  selectedTransactionId: string | null;
}) {
  if (!input.selectedTransactionId) {
    return null;
  }

  return (
    input.queue.find((transaction) => transaction.id === input.selectedTransactionId) ??
    (input.focusTransaction?.id === input.selectedTransactionId ? input.focusTransaction : null)
  );
}

function formatReviewImportRange(item: ReviewQueueImportSummary) {
  if (!item.earliestTransactionDate || !item.latestTransactionDate) {
    return "Unknown period";
  }

  const earliest = item.earliestTransactionDate.slice(0, 7);
  const latest = item.latestTransactionDate.slice(0, 7);

  const formatter = new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  if (earliest === latest) {
    return formatter.format(new Date(`${earliest}-01T00:00:00.000Z`));
  }

  return `${formatter.format(new Date(`${earliest}-01T00:00:00.000Z`))} to ${formatter.format(
    new Date(`${latest}-01T00:00:00.000Z`),
  )}`;
}

function formatReviewReportMonth(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00.000Z`));
}

export function ReviewQueueClient({
  initialData,
  initialTransactionId,
}: ReviewQueueClientProps) {
  const [queue, setQueue] = useState<ExpenseTransactionItem[]>(initialData.queue);
  const [focusTransaction, setFocusTransaction] = useState<ExpenseTransactionItem | null>(
    initialData.focusTransaction,
  );
  const [members, setMembers] = useState<WorkspaceMemberOption[]>(initialData.members);
  const [categories, setCategories] = useState<string[]>(initialData.categories);
  const [categoryCatalog, setCategoryCatalog] = useState(initialData.categoryCatalog);
  const [recentCategories, setRecentCategories] = useState<string[]>(initialData.recentCategories);
  const [summary, setSummary] = useState<ReviewQueueSummary>(initialData.summary);
  const [pagination, setPagination] = useState(initialData.pagination);
  const [filterOptions, setFilterOptions] = useState(initialData.filterOptions);
  const [page, setPage] = useState(initialData.pagination.page);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(
    initialTransactionId ?? initialData.focusTransaction?.id ?? initialData.queue[0]?.id ?? null,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [singleForm, setSingleForm] = useState<SingleFormState>(emptySingleForm);
  const [bulkForm, setBulkForm] = useState<BulkFormState>(emptyBulkForm);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [allocationForm, setAllocationForm] = useState<AllocationFormState>(emptyAllocationForm);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastUndo, setLastUndo] = useState<{ batchId: string; label: string } | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [monthFilter, setMonthFilter] = useState("all");
  const [importFilter, setImportFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [minimumAmount, setMinimumAmount] = useState("");
  const [maximumAmount, setMaximumAmount] = useState("");
  const [sort, setSort] = useState<ReviewSort>("newest");
  const [view, setView] = useState<ReviewView>("all");
  const [isUrlStateReady, setIsUrlStateReady] = useState(false);
  const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const reviewWorkspaceRef = useRef<HTMLElement>(null);
  const filterDisclosureRef = useRef<HTMLDetailsElement>(null);
  const memberSelectRef = useRef<HTMLSelectElement>(null);
  const previousServerQueryRef = useRef<string | null>(null);
  const previousServerFilterRef = useRef<string | null>(null);
  const [isSavingSingle, startSavingSingle] = useTransition();
  const [isSavingBulk, startSavingBulk] = useTransition();
  const [isSavingAllocation, startSavingAllocation] = useTransition();
  const [isSubmittingSingle, setIsSubmittingSingle] = useState(false);
  const [isSubmittingBulk, setIsSubmittingBulk] = useState(false);

  function focusReviewRow(transactionId: string) {
    window.requestAnimationFrame(() => {
      reviewWorkspaceRef.current
        ?.querySelector<HTMLElement>(`[data-review-transaction-id="${transactionId}"]`)
        ?.focus();
    });
  }

  const applyQueueData = useCallback((data: ReviewQueueResponse, focusId?: string | null) => {
    setQueue(data.queue);
    setFocusTransaction(data.focusTransaction ?? null);
    setMembers(data.members);
    setCategories(data.categories);
    setCategoryCatalog(data.categoryCatalog);
    setRecentCategories(data.recentCategories);
    setSummary(data.summary);
    setPagination(data.pagination);
    setFilterOptions(data.filterOptions);
    setPage(data.pagination.page);
    setSelectedIds((current) =>
      current.filter((transactionId) =>
        data.queue.some((transaction) => transaction.id === transactionId),
      ),
    );
    setSelectedTransactionId((current) => {
      if (
        current &&
        (data.queue.some((transaction) => transaction.id === current) ||
          data.focusTransaction?.id === current)
      ) {
        return current;
      }

      if (focusId && data.focusTransaction?.id === focusId) {
        return focusId;
      }

      return data.focusTransaction?.id ?? data.queue[0]?.id ?? null;
    });
  }, []);

  const loadQueue = useCallback(async (
    focusId: string | null,
    requestedPage: number,
    requestedSearch: string,
    options?: { preserveCurrentDataOnError?: boolean },
  ) => {
    setError(null);

    try {
      const search = serializeReviewFilterState("", {
        searchQuery: requestedSearch,
        month: monthFilter,
        importId: importFilter,
        accountId: accountFilter,
        minimumAmount,
        maximumAmount,
        sort,
        view,
      });
      const params = new URLSearchParams(search);
      if (requestedPage > 1) params.set("page", String(requestedPage));
      params.set("pageSize", String(pagination.pageSize || DEFAULT_REVIEW_PAGE_SIZE));
      if (focusId) params.set("transactionId", focusId);
      const response = await fetch(`/api/imports/review?${params.toString()}`);
      const data = (await response.json()) as ReviewQueueResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not load the review queue.");
      }

      applyQueueData(data, focusId);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not load the review queue.",
      );
      if (!options?.preserveCurrentDataOnError) {
        setQueue([]);
        setFocusTransaction(null);
        setMembers([]);
        setSummary(emptyReviewSummary);
        setSelectedTransactionId(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [accountFilter, applyQueueData, importFilter, maximumAmount, minimumAmount, monthFilter, pagination.pageSize, sort, view]);

  useEffect(() => {
    setQueue(initialData.queue);
    setFocusTransaction(initialData.focusTransaction ?? null);
    setMembers(initialData.members);
    setCategories(initialData.categories);
    setCategoryCatalog(initialData.categoryCatalog);
    setRecentCategories(initialData.recentCategories);
    setSummary(initialData.summary);
    setPagination(initialData.pagination);
    setFilterOptions(initialData.filterOptions);
    setPage(initialData.pagination.page);
    setSelectedIds([]);
    setSelectedTransactionId(
      initialTransactionId ??
        initialData.focusTransaction?.id ??
        initialData.queue[0]?.id ??
        null,
    );
    setError(null);
    setIsLoading(false);
  }, [initialData, initialTransactionId]);

  useEffect(() => {
    function restoreUrlState() {
      const state = parseReviewQuery(new URLSearchParams(window.location.search));
      setSearchQuery(state.searchQuery);
      setMonthFilter(state.month);
      setImportFilter(state.importId);
      setAccountFilter(state.accountId);
      setMinimumAmount(state.minimumAmount);
      setMaximumAmount(state.maximumAmount);
      setSort(state.sort);
      setView(state.view);
      setPage(state.page);
    }
    restoreUrlState();
    setIsUrlStateReady(true);
    window.addEventListener("popstate", restoreUrlState);
    return () => window.removeEventListener("popstate", restoreUrlState);
  }, []);

  useEffect(() => {
    if (!isUrlStateReady) return;
    const query = serializeReviewFilterState(window.location.search, {
      searchQuery,
      month: monthFilter,
      importId: importFilter,
      accountId: accountFilter,
      minimumAmount,
      maximumAmount,
      sort,
      view,
    });
    const params = new URLSearchParams(query);
    if (page > 1) params.set("page", String(page));
    else params.delete("page");
    params.delete("pageSize");
    const nextQuery = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`);
  }, [accountFilter, importFilter, isUrlStateReady, maximumAmount, minimumAmount, monthFilter, page, searchQuery, sort, view]);

  useEffect(() => {
    if (!isUrlStateReady) return;
    const filterSignature = JSON.stringify({
      searchQuery: deferredSearchQuery,
      monthFilter,
      importFilter,
      accountFilter,
      minimumAmount,
      maximumAmount,
      sort,
      view,
    });
    const querySignature = `${filterSignature}:${page}`;
    if (previousServerQueryRef.current === null) {
      previousServerFilterRef.current = filterSignature;
      previousServerQueryRef.current = querySignature;
      return;
    }
    if (previousServerFilterRef.current !== filterSignature && page !== 1) {
      previousServerFilterRef.current = filterSignature;
      setPage(1);
      return;
    }
    if (previousServerQueryRef.current === querySignature) return;
    previousServerFilterRef.current = filterSignature;
    previousServerQueryRef.current = querySignature;
    setIsLoading(true);
    void loadQueue(initialTransactionId, page, deferredSearchQuery);
  }, [accountFilter, deferredSearchQuery, importFilter, initialTransactionId, isUrlStateReady, loadQueue, maximumAmount, minimumAmount, monthFilter, page, sort, view]);

  const selectedTransaction = getSelectedTransaction({
    queue,
    focusTransaction,
    selectedTransactionId,
  });
  const availableMonths = filterOptions.months;
  const availableImports = filterOptions.imports;
  const availableAccounts = filterOptions.accounts;
  const visibleQueue = queue;
  const allQueueIds = visibleQueue.map((transaction) => transaction.id);
  const allVisibleSelected =
    allQueueIds.length > 0 &&
    allQueueIds.every((transactionId) => selectedIds.includes(transactionId));
  const hasDefinedCategories = categories.length > 0;
  const filtersActive = hasActiveReviewFilters({
    searchQuery,
    month: monthFilter,
    importId: importFilter,
    accountId: accountFilter,
    minimumAmount,
    maximumAmount,
    sort,
    view,
  });
  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: ActiveFilterKey; label: string }> = [];
    if (searchQuery.trim()) chips.push({ key: "search", label: `Search: ${searchQuery.trim()}` });
    if (monthFilter !== "all") chips.push({ key: "month", label: `Month: ${formatReviewReportMonth(monthFilter)}` });
    if (importFilter !== "all") {
      chips.push({
        key: "import",
        label: `Import: ${availableImports.find((item) => item.id === importFilter)?.label ?? importFilter}`,
      });
    }
    if (accountFilter !== "all") {
      chips.push({
        key: "account",
        label: `Account: ${availableAccounts.find((item) => item.id === accountFilter)?.label ?? accountFilter}`,
      });
    }
    if (minimumAmount) chips.push({ key: "minimum", label: `Minimum: ${minimumAmount}` });
    if (maximumAmount) chips.push({ key: "maximum", label: `Maximum: ${maximumAmount}` });
    if (sort !== "newest") {
      const sortLabels: Record<ReviewSort, string> = {
        newest: "Newest first",
        oldest: "Oldest first",
        amount_desc: "Amount: high to low",
        amount_asc: "Amount: low to high",
        merchant: "Merchant A–Z",
      };
      chips.push({ key: "sort", label: `Sort: ${sortLabels[sort]}` });
    }
    if (view !== "all") {
      const viewLabels: Record<ReviewView, string> = {
        all: "All",
        suggested: "Suggested",
        no_suggestion: "No suggestion",
        repeated: "Repeated merchants",
        high_value: "High value",
      };
      chips.push({ key: "view", label: `View: ${viewLabels[view]}` });
    }
    return chips;
  }, [accountFilter, availableAccounts, availableImports, importFilter, maximumAmount, minimumAmount, monthFilter, searchQuery, sort, view]);

  useEffect(() => {
    if (visibleQueue.length === 0) return;
    if (selectedTransactionId && visibleQueue.some((transaction) => transaction.id === selectedTransactionId)) return;
    if (focusTransaction?.id === selectedTransactionId) return;
    setSelectedTransactionId(visibleQueue[0]?.id ?? null);
  }, [focusTransaction?.id, selectedTransactionId, visibleQueue]);

  useEffect(() => {
    if (!selectedTransaction) {
      setSingleForm(emptySingleForm);
      setAllocationForm(emptyAllocationForm);
      return;
    }

    setSingleForm({
      classificationType: selectedTransaction.classification?.classificationType ?? "",
      category: selectedTransaction.classification?.category ?? "",
      categoryId: selectedTransaction.classification?.categoryId ?? "",
      memberOwnerId: selectedTransaction.classification?.memberOwnerId ?? "",
      createRule: false,
      applyToSimilar: false,
    });

    setAllocationForm(
      createAllocationFormState({
        allocation: selectedTransaction.allocation,
        sourceDate: selectedTransaction.transactionDate,
        totalAmount: selectedTransaction.normalizedAmount,
      }),
    );
  }, [selectedTransaction]);

  function toggleSelectedTransaction(transactionId: string) {
    setSelectedIds((current) =>
      current.includes(transactionId)
        ? current.filter((value) => value !== transactionId)
        : [...current, transactionId],
    );
  }

  function toggleAllVisible() {
    setSelectedIds(allVisibleSelected ? [] : allQueueIds);
  }

  function clearFilters() {
    setSearchQuery(defaultReviewFilterState.searchQuery);
    setMonthFilter(defaultReviewFilterState.month);
    setImportFilter(defaultReviewFilterState.importId);
    setAccountFilter(defaultReviewFilterState.accountId);
    setMinimumAmount(defaultReviewFilterState.minimumAmount);
    setMaximumAmount(defaultReviewFilterState.maximumAmount);
    setSort(defaultReviewFilterState.sort);
    setView(defaultReviewFilterState.view);
  }

  function selectImportForReview(importId: string) {
    setImportFilter(importId);
    setPage(1);
    setSelectedIds([]);
  }

  function removeReviewedTransactions(transactionIds: string[]) {
    const reviewedIds = new Set(transactionIds);
    const nextTransactionId = queue.find((transaction) => !reviewedIds.has(transaction.id))?.id ?? null;

    setQueue((current) => current.filter((transaction) => !reviewedIds.has(transaction.id)));
    setSelectedIds((current) => current.filter((transactionId) => !reviewedIds.has(transactionId)));
    setSelectedTransactionId((current) =>
      reviewedIds.has(current ?? "") ? nextTransactionId : current,
    );
    setSummary((current) => ({
      ...current,
      reviewedCount: current.reviewedCount + transactionIds.length,
      queueCount: Math.max(current.queueCount - transactionIds.length, 0),
      completionPercentage:
        current.totalTransactionCount === 0
          ? 100
          : Math.round(
              ((current.reviewedCount + transactionIds.length) / current.totalTransactionCount) * 100,
            ),
      selectedImport: current.selectedImport
        ? {
            ...current.selectedImport,
            reviewedCount: current.selectedImport.reviewedCount + transactionIds.length,
            remainingCount: Math.max(
              current.selectedImport.remainingCount - transactionIds.length,
              0,
            ),
          }
        : null,
    }));
    setPagination((current) => ({
      ...current,
      filteredCount: Math.max(current.filteredCount - transactionIds.length, 0),
      totalPages: Math.max(
        1,
        Math.ceil(
          Math.max(current.filteredCount - transactionIds.length, 0) / current.pageSize,
        ),
      ),
    }));
  }

  function clearFilter(key: ActiveFilterKey) {
    if (key === "search") setSearchQuery(defaultReviewFilterState.searchQuery);
    if (key === "month") setMonthFilter(defaultReviewFilterState.month);
    if (key === "import") setImportFilter(defaultReviewFilterState.importId);
    if (key === "account") setAccountFilter(defaultReviewFilterState.accountId);
    if (key === "minimum") setMinimumAmount(defaultReviewFilterState.minimumAmount);
    if (key === "maximum") setMaximumAmount(defaultReviewFilterState.maximumAmount);
    if (key === "sort") setSort(defaultReviewFilterState.sort);
    if (key === "view") setView(defaultReviewFilterState.view);
  }

  function categoryIdForName(name: string) {
    const canonicalName = name.trim().toLocaleLowerCase();
    return categoryCatalog.find(
      (category) => category.name.trim().toLocaleLowerCase() === canonicalName,
    )?.id ?? "";
  }

  async function createCategory(name: string) {
    const response = await fetch("/api/workspace-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      error?: string;
    };
    if (!response.ok || !payload.id || !payload.name) {
      throw new Error(payload.error ?? "Could not create the category.");
    }
    setCategories((current) =>
      Array.from(new Set([...current, payload.name!])).sort((a, b) => a.localeCompare(b)),
    );
    const created = { id: payload.id, name: payload.name };
    setCategoryCatalog((current) => [...current.filter((item) => item.id !== created.id), created]);
    return created;
  }

  function changeSingleClassificationType(classificationType: ClassificationType) {
    setSingleForm((current) => ({
      ...current,
      classificationType,
      category: ["transfer", "ignore"].includes(classificationType) ? "" : current.category,
      categoryId: ["transfer", "ignore"].includes(classificationType) ? "" : current.categoryId,
      memberOwnerId: ["personal", "shared"].includes(classificationType)
        ? current.memberOwnerId
        : "",
    }));
  }

  function acceptSuggestion() {
    const suggestion = selectedTransaction?.suggestion;
    if (!suggestion) return;
    setSingleForm((current) => ({
      ...current,
      classificationType: suggestion.classificationType,
      category: suggestion.category ?? "",
      categoryId: suggestion.categoryId ?? "",
      memberOwnerId: suggestion.memberOwnerId ?? "",
    }));
    setMessage("Suggestion applied. Review it, then save when ready.");
  }

  function selectSimilarTransactions() {
    const merchant = selectedTransaction?.merchantRaw?.trim();
    if (!merchant) return;
    const normalized = merchant.toLocaleLowerCase();
    const matchingIds = visibleQueue
      .filter((transaction) => transaction.merchantRaw?.trim().toLocaleLowerCase() === normalized)
      .map((transaction) => transaction.id);
    setSelectedIds(matchingIds);
    setBulkForm({
      classificationType: singleForm.classificationType,
      category: singleForm.category,
      categoryId: singleForm.categoryId,
      memberOwnerId: singleForm.memberOwnerId,
    });
    setIsBulkModalOpen(true);
  }

  async function submitSingleClassification() {
    if (!selectedTransaction || !singleForm.classificationType) {
      setError("Choose a transaction and classification type before saving.");
      reviewWorkspaceRef.current
        ?.querySelector<HTMLInputElement>(".review-detail input[type='radio']")
        ?.focus();
      return;
    }
    if (singleForm.classificationType === "personal" && !singleForm.memberOwnerId) {
      setError("Choose whose personal expense this is before saving.");
      memberSelectRef.current?.focus();
      return;
    }

    setError(null);
    setMessage(null);

    const additionalTransactionIds = singleForm.applyToSimilar
      ? similarVisibleTransactionIds
      : [];
    const response = await fetch("/api/transaction-classifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transactionId: selectedTransaction.id,
        classificationType: singleForm.classificationType,
        category: singleForm.category,
        categoryId: singleForm.categoryId || null,
        memberOwnerId: singleForm.memberOwnerId || null,
        createRule: singleForm.createRule,
        additionalTransactionIds,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; undoBatchId?: string };

    if (!response.ok) {
      setError(data.error ?? "Could not save this classification.");
      return;
    }

    const reviewedTransactionIds = [selectedTransaction.id, ...additionalTransactionIds];
    const shouldKeepFocus =
      initialTransactionId === selectedTransaction.id || !selectedTransactionInQueue;

    const savedMerchant = getTransactionMerchant(selectedTransaction);
    const updatedCount = additionalTransactionIds.length + 1;
    if (!shouldKeepFocus) {
      removeReviewedTransactions(reviewedTransactionIds);
    }
    setMessage(
      singleForm.createRule
        ? `Classification and rule saved for ${savedMerchant}${updatedCount > 1 ? ` across ${updatedCount} transactions` : ""}.`
        : `Classification saved for ${savedMerchant}${updatedCount > 1 ? ` across ${updatedCount} transactions` : ""}.`,
    );
    setLastUndo(data.undoBatchId ? { batchId: data.undoBatchId, label: updatedCount > 1 ? `${updatedCount} transactions` : savedMerchant } : null);
    void loadQueue(shouldKeepFocus ? selectedTransaction.id : null, page, searchQuery, {
      preserveCurrentDataOnError: true,
    });
  }

  async function runSingleClassification() {
    setIsSubmittingSingle(true);
    try {
      await submitSingleClassification();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save this classification.");
    } finally {
      setIsSubmittingSingle(false);
    }
  }

  async function submitBulkClassification() {
    if (!bulkForm.classificationType) {
      setError("Choose a classification type before applying a bulk update.");
      return;
    }
    if (bulkForm.classificationType === "personal" && !bulkForm.memberOwnerId) {
      setError("Choose whose personal expenses these are before applying the bulk update.");
      return;
    }

    if (selectedIds.length === 0) {
      setError("Select at least one queue row before applying a bulk update.");
      return;
    }

    setError(null);
    setMessage(null);

    const response = await fetch("/api/transaction-classifications/bulk", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transactionIds: selectedIds,
        classificationType: bulkForm.classificationType,
        category: bulkForm.category,
        categoryId: bulkForm.categoryId || null,
        memberOwnerId: bulkForm.memberOwnerId || null,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; undoBatchId?: string };

    if (!response.ok) {
      setError(data.error ?? "Could not apply the bulk classification.");
      return;
    }

    const reviewedTransactionIds = [...selectedIds];
    setSelectedIds([]);
    setIsBulkModalOpen(false);
    removeReviewedTransactions(reviewedTransactionIds);
    setMessage(`Classification applied to ${reviewedTransactionIds.length} transactions.`);
    setLastUndo(data.undoBatchId ? { batchId: data.undoBatchId, label: `${reviewedTransactionIds.length} transactions` } : null);
    void loadQueue(null, page, searchQuery, { preserveCurrentDataOnError: true });
  }

  async function runBulkClassification() {
    setIsSubmittingBulk(true);
    try {
      await submitBulkClassification();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not apply the bulk classification.");
    } finally {
      setIsSubmittingBulk(false);
    }
  }

  async function undoLastClassification() {
    if (!lastUndo || isUndoing) return;
    setIsUndoing(true);
    setError(null);
    try {
      const response = await fetch("/api/transaction-classifications/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: lastUndo.batchId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not undo the classification.");
      await loadQueue(null, page, searchQuery);
      setMessage(`Restored ${lastUndo.label}.`);
      setLastUndo(null);
    } catch (undoError) {
      setError(undoError instanceof Error ? undoError.message : "Could not undo the classification.");
    } finally {
      setIsUndoing(false);
    }
  }

  async function submitAllocationUpdate() {
    if (!selectedTransaction) {
      setError("Choose a transaction before saving its allocation.");
      return;
    }

    if (!selectedTransaction.classification) {
      setError("Save a classification before editing adjusted-period allocation.");
      return;
    }

    setError(null);
    setMessage(null);

    const response = await fetch("/api/transaction-allocations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sourceType: "transaction",
        sourceId: selectedTransaction.id,
        reportingMode: allocationForm.reportingMode,
        allocationStrategy:
          allocationForm.reportingMode === "allocated_period"
            ? allocationForm.allocationStrategy
            : null,
        coverageStartDate:
          allocationForm.reportingMode === "allocated_period" &&
          allocationForm.allocationStrategy === "equal_split"
            ? allocationForm.coverageStartDate
            : null,
        coverageEndDate:
          allocationForm.reportingMode === "allocated_period" &&
          allocationForm.allocationStrategy === "equal_split"
            ? allocationForm.coverageEndDate
            : null,
        allocations:
          allocationForm.reportingMode === "allocated_period" &&
          allocationForm.allocationStrategy === "manual_split"
            ? allocationForm.allocations
            : null,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(data.error ?? "Could not save this allocation.");
      return;
    }

    await loadQueue(selectedTransaction.id, page, searchQuery);
    setMessage(
      allocationForm.reportingMode === "allocated_period"
        ? "Adjusted-period allocation saved."
        : "Allocation reset to payment month.",
    );
  }

  const selectedTransactionInQueue = Boolean(
    selectedTransaction && queue.some((transaction) => transaction.id === selectedTransaction.id),
  );
  const similarVisibleTransactionIds = selectedTransaction?.merchantRaw?.trim()
    ? visibleQueue
        .filter(
          (transaction) =>
            transaction.id !== selectedTransaction.id &&
            transaction.merchantRaw?.trim().toLocaleLowerCase() ===
              selectedTransaction.merchantRaw?.trim().toLocaleLowerCase(),
        )
        .map((transaction) => transaction.id)
    : [];
  const selectedQueuePosition =
    selectedTransactionInQueue && selectedTransaction && visibleQueue.some((transaction) => transaction.id === selectedTransaction.id)
      ? visibleQueue.findIndex((transaction) => transaction.id === selectedTransaction.id) + 1
      : null;
  const selectedFilteredPosition = selectedQueuePosition
    ? (pagination.page - 1) * pagination.pageSize + selectedQueuePosition
    : null;
  const previousTransactionId = selectedQueuePosition && selectedQueuePosition > 1
    ? visibleQueue[selectedQueuePosition - 2]?.id
    : null;
  const nextTransactionId = selectedQueuePosition && selectedQueuePosition < visibleQueue.length
    ? visibleQueue[selectedQueuePosition]?.id
    : null;
  const merchantCanCreateRule = Boolean(selectedTransaction?.merchantRaw?.trim());
  const allocationEditable =
    selectedTransaction?.classification &&
    selectedTransaction.classification.classificationType !== "transfer" &&
    selectedTransaction.classification.classificationType !== "ignore";
  const memberFieldLabel =
    singleForm.classificationType === "shared" ? "Paid by" : "Whose personal expense?";
  const showMemberField = ["personal", "shared"].includes(singleForm.classificationType);
  const selectedTransactionCurrencyState = selectedTransaction
    ? getCurrencyNormalizationDisplayState(selectedTransaction)
    : null;
  const selectedLedgerHref = selectedTransaction
    ? `/expenses?transactionId=${selectedTransaction.id}`
    : "/expenses";
  const selectedReportTargets = selectedTransaction
    ? buildTransactionReportTargets(selectedTransaction)
    : [];
  const queueClearReportHref = summary.latestTransactionMonth
    ? `/reports?month=${summary.latestTransactionMonth}&mode=payment_date`
    : "/reports";
  const queueClearReportLabel = summary.latestTransactionMonth
    ? `Open ${formatReviewReportMonth(summary.latestTransactionMonth)} report`
    : "Open reports";
  const activeImportSummary = importFilter === "all" ? null : summary.selectedImport;
  const activeReviewTotal = activeImportSummary?.totalCount ?? summary.totalTransactionCount;
  const activeReviewHandled = activeImportSummary?.reviewedCount ?? summary.reviewedCount;
  const activeReviewRemaining = activeImportSummary?.remainingCount ?? summary.queueCount;
  const activeReviewPercentage = activeReviewTotal === 0
    ? 100
    : Math.round((activeReviewHandled / activeReviewTotal) * 100);
  const advancedFilterCount = [
    monthFilter !== "all",
    importFilter !== "all",
    accountFilter !== "all",
    Boolean(minimumAmount),
    Boolean(maximumAmount),
    sort !== "newest",
  ].filter(Boolean).length;

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      const disclosure = filterDisclosureRef.current;
      if (!disclosure?.open || !(event.target instanceof Node)) return;
      if (!disclosure.contains(event.target)) disclosure.open = false;
    }

    function closeOnEscape(event: KeyboardEvent) {
      const disclosure = filterDisclosureRef.current;
      if (event.key !== "Escape" || !disclosure?.open) return;
      disclosure.open = false;
      disclosure.querySelector<HTMLElement>("summary")?.focus();
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
      const isInsideReviewDetail = target instanceof Element && Boolean(target.closest(".review-detail"));

      if (isBulkModalOpen || isShortcutHelpOpen) return;
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        if (isTyping && !isInsideReviewDetail) return;
        event.preventDefault();
        if (!isSavingSingle && !isSubmittingSingle) startSavingSingle(() => void runSingleClassification());
        return;
      }
      if (isTyping) return;

      if (event.key === "ArrowDown" && nextTransactionId) {
        event.preventDefault();
        setSelectedTransactionId(nextTransactionId);
        focusReviewRow(nextTransactionId);
      } else if (event.key === "ArrowUp" && previousTransactionId) {
        event.preventDefault();
        setSelectedTransactionId(previousTransactionId);
        focusReviewRow(previousTransactionId);
      } else if (/^[1-6]$/.test(event.key)) {
        event.preventDefault();
        const type = CLASSIFICATION_TYPES[Number(event.key) - 1];
        if (type) changeSingleClassificationType(type);
      } else if (event.key.toLocaleLowerCase() === "c") {
        event.preventDefault();
        reviewWorkspaceRef.current?.querySelector<HTMLInputElement>(".review-detail .category-combobox input")?.focus();
      } else if (event.key.toLocaleLowerCase() === "r" && merchantCanCreateRule) {
        event.preventDefault();
        setSingleForm((current) => ({ ...current, createRule: !current.createRule }));
      } else if (event.key.toLocaleLowerCase() === "s" && nextTransactionId) {
        event.preventDefault();
        setSelectedTransactionId(nextTransactionId);
        setMessage("Skipped for now. No classification was saved.");
      } else if (event.key === "?") {
        event.preventDefault();
        setIsShortcutHelpOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <section className="stack review-workspace" ref={reviewWorkspaceRef}>
      <article className="card stack compact">
        <div className="review-scope-header">
          <div>
            <span className="eyebrow">{activeImportSummary ? "Statement review" : "Review queue"}</span>
            <h2>{activeImportSummary?.originalFilename ?? "All imported statements"}</h2>
            <p className="helper-text">
              {activeImportSummary
                ? `${activeImportSummary.sourceName ?? "Imported statement"} · ${formatReviewImportRange(activeImportSummary)}`
                : `${summary.remainingByImport.length} statement${summary.remainingByImport.length === 1 ? "" : "s"} still in progress`}
            </p>
          </div>
          <div className="review-scope-stats" aria-label="Review progress">
            <span><strong>{activeReviewRemaining}</strong> remaining</span>
            <span><strong>{activeReviewHandled}</strong> handled</span>
            <span><strong>{activeReviewPercentage}%</strong> complete</span>
          </div>
        </div>

        <div
          className="progress-meter"
          role="progressbar"
          aria-label="Statement review progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={activeReviewPercentage}
        >
          <span
            className="progress-meter-fill"
            style={{ width: `${activeReviewPercentage}%` }}
          />
        </div>

        {summary.remainingByImport.length > 0 ? (
          <details className="review-import-switcher disclosure">
            <summary>Switch statement</summary>
            <div className="stack compact">
            <button
              className={`activity-row review-import-row ${importFilter === "all" ? "is-active" : ""}`}
              type="button"
              aria-pressed={importFilter === "all"}
              onClick={() => selectImportForReview("all")}
            >
              <div><strong>All statements</strong><p>{summary.queueCount} transactions remaining</p></div>
            </button>
            {summary.remainingByImport.slice(0, 5).map((item) => (
              <button
                className={`activity-row review-import-row ${
                  importFilter === item.importId ? "is-active" : ""
                }`}
                type="button"
                aria-pressed={importFilter === item.importId}
                aria-label={`Review ${item.originalFilename}, ${item.remainingCount} transactions left`}
                onClick={() => selectImportForReview(item.importId)}
                key={item.importId}
              >
                <div>
                  <strong>{item.originalFilename}</strong>
                  <p>
                    {item.sourceName ?? "Unknown source"} · {item.remainingCount} left ·{" "}
                    {item.reviewedCount} handled
                  </p>
                </div>
                <div className="activity-meta">
                  <span
                    className={`badge ${
                      item.reviewedCount > 0 ? "badge-warning" : "badge-neutral"
                    }`}
                  >
                    {item.reviewedCount > 0 ? "In progress" : "Unstarted"}
                  </span>
                  <span>{formatReviewImportRange(item)}</span>
                </div>
              </button>
            ))}
            {summary.remainingByImport.length > 5 ? (
              <p className="helper-text">
                {summary.remainingByImport.length - 5} more incomplete import
                {summary.remainingByImport.length - 5 === 1 ? "" : "s"}. Use the Import filter to find one.
              </p>
            ) : null}
            </div>
          </details>
        ) : null}
      </article>

      <article className="card review-toolbar" aria-label="Review filters">
        <div className="review-view-tabs" role="group" aria-label="Review view">
          {([
            ["all", "All"],
            ["suggested", "Suggested"],
            ["no_suggestion", "No suggestion"],
            ["repeated", "Repeated merchants"],
            ["high_value", "High value"],
          ] as const).map(([value, label]) => (
            <button
              className={view === value ? "is-active" : ""}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              key={value}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="review-toolbar-primary">
          <label className="field review-search-field">
            <span className="sr-only">Search</span>
            <input
              className="input"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search merchant or description"
            />
          </label>
          <details className="review-filter-disclosure disclosure" ref={filterDisclosureRef}>
            <summary>Filters{advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ""}</summary>
            <div className="review-filter-grid">
              <ImportScopePicker
                imports={availableImports}
                value={importFilter}
                onChange={setImportFilter}
              />
              <label className="field">
                <span>Month</span>
                <select className="input" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)}>
                  <option value="all">All months</option>
                  {availableMonths.map((month) => <option value={month} key={month}>{formatReviewReportMonth(month)}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Account</span>
                <select className="input" value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
                  <option value="all">All accounts</option>
                  {availableAccounts.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Sort</span>
                <select className="input" value={sort} onChange={(event) => setSort(event.target.value as ReviewSort)}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="amount_desc">Amount: high to low</option>
                  <option value="amount_asc">Amount: low to high</option>
                  <option value="merchant">Merchant A–Z</option>
                </select>
              </label>
            </div>
          </details>
          <button
            className="review-shortcuts-button"
            type="button"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts"
            onClick={() => setIsShortcutHelpOpen(true)}
          >
            ?
          </button>
        </div>
        {activeFilterChips.length > 0 ? (
          <div className="review-active-filters" aria-label="Active filters">
            {activeFilterChips.map((chip) => (
              <button
                className="review-filter-chip"
                type="button"
                aria-label={`Remove ${chip.label} filter`}
                onClick={() => clearFilter(chip.key)}
                key={chip.key}
              >
                <span>{chip.label}</span>
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="review-toolbar-footer">
          <p className="helper-text" aria-live="polite">
            Showing {visibleQueue.length} of {pagination.filteredCount} matching transactions · {summary.queueCount} total left.
          </p>
          <div className="action-row">
            {filtersActive ? <button className="link-button" type="button" onClick={clearFilters}>Clear all filters</button> : null}
          </div>
        </div>
      </article>

      {error ? <p className="status error" role="alert">{error}</p> : null}
      {message ? (
        <div className="status review-status-message" aria-live="polite">
          <span>{message}</span>
          {lastUndo ? <button className="link-button" type="button" disabled={isUndoing} onClick={() => void undoLastClassification()}>{isUndoing ? "Undoing…" : "Undo"}</button> : null}
        </div>
      ) : null}

      <section className="review-layout">
        <article className="card review-list">
          <div className="page-actions">
            <div>
              <h2>Review queue</h2>
              <p className="muted-text">
                Choose a row to review it. Checkboxes are only for applying one decision to several rows.
              </p>
            </div>
          </div>

          <div className="page-actions review-list-actions">
            {selectedIds.length > 0 ? (
              <div className="review-batch-bar" role="status">
                <strong>{selectedIds.length} selected</strong>
                <div className="action-row">
                  <button className="button" type="button" onClick={() => setIsBulkModalOpen(true)}>
                    Classify selected
                  </button>
                  <button className="link-button" type="button" onClick={() => setSelectedIds([])}>
                    Clear selection
                  </button>
                </div>
              </div>
            ) : (
              <div className="review-selection-prompt">
                <p className="helper-text">Select rows to classify several transactions together.</p>
                <button className="link-button" type="button" onClick={toggleAllVisible} disabled={visibleQueue.length === 0}>
                  Select all {visibleQueue.length} on this page
                </button>
              </div>
            )}
          </div>

          <Modal
            open={isBulkModalOpen}
            onClose={() => setIsBulkModalOpen(false)}
            title="Classify selected"
            description={`Apply one classification to ${selectedIds.length} selected transactions.`}
            allowContentOverflow
          >
            <div className="stack">
              <ClassificationTypePicker value={bulkForm.classificationType} onChange={(classificationType) => setBulkForm((current) => ({ ...current, classificationType }))} legend="Apply which treatment?" />
              {!(["transfer", "ignore"] as Array<ClassificationType | "">).includes(bulkForm.classificationType) ? (
                <CategoryCombobox
                  categories={categories}
                  recentCategories={recentCategories}
                  value={bulkForm.category}
                  onChange={(category) => setBulkForm((current) => ({ ...current, category, categoryId: categoryIdForName(category) }))}
                  blankLabel="Keep uncategorized"
                  onCreateCategory={async (name) => {
                    const created = await createCategory(name);
                    setBulkForm((current) => ({ ...current, category: created.name, categoryId: created.id }));
                    return created.name;
                  }}
                />
              ) : null}
              {(["personal", "shared"] as Array<ClassificationType | "">).includes(bulkForm.classificationType) ? <label className="field">
                <span>{bulkForm.classificationType === "shared" ? "Paid by" : "Whose personal expense?"}</span>
                <select className="input" value={bulkForm.memberOwnerId} onChange={(event) => setBulkForm((current) => ({ ...current, memberOwnerId: event.target.value }))}>
                  <option value="">Unassigned</option>
                  {members.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}
                </select>
              </label> : null}
              {!hasDefinedCategories ? <p className="helper-text">Add categories in <Link href="/settings">settings</Link> before assigning one here.</p> : null}
              <div className="action-row">
                <button className="button" type="button" disabled={isSavingBulk || isSubmittingBulk} onClick={() => startSavingBulk(() => void runBulkClassification())}>
                  {isSavingBulk || isSubmittingBulk ? "Applying..." : "Apply to selected"}
                </button>
                <button className="button button-secondary" type="button" onClick={() => setIsBulkModalOpen(false)}>Cancel</button>
              </div>
            </div>
          </Modal>

          {isLoading ? <p className="status">Loading review queue...</p> : null}

          {!isLoading && activeImportSummary && activeImportSummary.remainingCount === 0 ? (
            <div className="home-focus-card">
              <span className="badge badge-neutral">Statement complete</span>
              <h3>{activeImportSummary.originalFilename} is ready.</h3>
              <p>
                {activeImportSummary.reviewedCount} transaction{activeImportSummary.reviewedCount === 1 ? "" : "s"} handled. Nothing from this statement still needs review.
              </p>
              <div className="action-row">
                <button className="button" type="button" onClick={() => selectImportForReview("all")}>
                  Review another statement
                </button>
                <Link className="button button-secondary" href={queueClearReportHref}>
                  {queueClearReportLabel}
                </Link>
              </div>
            </div>
          ) : null}

          {!isLoading && !activeImportSummary && summary.queueCount === 0 ? (
            summary.totalTransactionCount > 0 ? (
              <div className="home-focus-card">
                <span className="badge badge-neutral">Queue clear</span>
                <h3>All imported transactions are reviewed.</h3>
                <p>
                  {summary.reviewedCount} reviewed transaction
                  {summary.reviewedCount === 1 ? "" : "s"} are ready for the ledger and the
                  matching report month.
                </p>
                <div className="action-row">
                  <Link className="button" href={queueClearReportHref}>
                    {queueClearReportLabel}
                  </Link>
                  <Link className="button button-secondary" href="/expenses">
                    Open ledger
                  </Link>
                </div>
              </div>
            ) : (
              <p className="empty-state">No transactions are waiting for review right now.</p>
            )
          ) : null}

          {!isLoading && (!activeImportSummary || activeImportSummary.remainingCount > 0) && summary.queueCount > 0 && pagination.filteredCount === 0 ? (
            <div className="empty-state review-empty-filtered">
              <strong>No transactions match these filters.</strong>
              <p>Clear a filter or choose another review view.</p>
              <button className="button button-secondary" type="button" onClick={clearFilters}>Clear all filters</button>
            </div>
          ) : null}

          {!isLoading && visibleQueue.length > 0 ? (
            <div className="table-wrap review-table-wrap">
              <table className="data-table review-table">
                <thead>
                  <tr>
                    <th className="checkbox-cell">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                        aria-label="Select all visible rows"
                      />
                    </th>
                    <th>Date</th>
                    <th>Merchant</th>
                    <th>Amount</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleQueue.map((transaction) => {
                    const transactionCurrencyState =
                      getCurrencyNormalizationDisplayState(transaction);
                    const merchant = getTransactionMerchant(transaction);
                    const description = transaction.description.trim();
                    const showDescription =
                      description.length > 0 && description.toLowerCase() !== merchant.trim().toLowerCase();

                    return (
                      <tr
                        className={`table-row-interactive ${selectedTransactionId === transaction.id ? "table-row-active" : ""}`}
                        data-review-transaction-id={transaction.id}
                        tabIndex={selectedTransactionId === transaction.id ? 0 : -1}
                        aria-current={selectedTransactionId === transaction.id ? "true" : undefined}
                        onClick={() => setSelectedTransactionId(transaction.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedTransactionId(transaction.id);
                          }
                        }}
                        key={transaction.id}
                      >
                        <td className="checkbox-cell" data-label="Select">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(transaction.id)}
                            onClick={(event) => event.stopPropagation()}
                            onChange={() => toggleSelectedTransaction(transaction.id)}
                            aria-label={`Select ${merchant}`}
                          />
                        </td>
                        <td data-label="Date">{transaction.transactionDate}</td>
                        <td data-label="Merchant">
                          <div className="review-merchant-line">
                            <strong>{merchant}</strong>
                            {transaction.suggestion ? (
                              <span
                                className={`review-suggestion-pill ${transaction.suggestion.confidence}`}
                                aria-label={`Suggested classification: ${formatClassificationTypeLabel(transaction.suggestion.classificationType)}${
                                  transaction.suggestion.category ? `, ${transaction.suggestion.category}` : ""
                                }`}
                              >
                                Suggested
                              </span>
                            ) : null}
                          </div>
                          {showDescription ? <div className="table-note">{description}</div> : null}
                        </td>
                        <td data-label="Amount">
                          <div className="stack compact">
                            <span>
                              {formatMoneyDisplay(
                                transaction.normalizedAmount,
                                transaction.workspaceCurrency,
                                transaction.direction,
                              )}
                            </span>
                            {transactionCurrencyState.label ? (
                              <span
                                className={`badge ${
                                  transactionCurrencyState.tone === "warning"
                                    ? "badge-warning"
                                    : "badge-neutral"
                                }`}
                              >
                                {transactionCurrencyState.label}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td data-label="Source">
                          <strong>{transaction.importSourceName ?? "Unknown"}</strong>
                          <div className="table-note">{transaction.accountDisplayName}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {!isLoading && pagination.filteredCount > 0 ? (
            <nav className="review-pagination" aria-label="Review queue pages">
              <button
                className="button button-secondary"
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
              >
                Previous page
              </button>
              <p aria-live="polite">
                Page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong>
              </p>
              <button
                className="button button-secondary"
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPage((current) => Math.min(current + 1, pagination.totalPages))}
              >
                Next page
              </button>
            </nav>
          ) : null}
        </article>

        <article className="card review-detail">
          <div className="page-actions">
            <div>
              <h2>Selected transaction</h2>
              <p className="muted-text">
                Save one row at a time here. You can also open already-classified items from
                the expenses page to correct them.
              </p>
            </div>
          </div>

          {!selectedTransaction ? (
            <p className="empty-state">
              Select a queue row to review it. If you came from `/expenses`, the chosen
              transaction will appear here automatically.
            </p>
          ) : (
            <div className="stack">
              {!selectedTransactionInQueue && focusTransaction ? (
                <p className="status warning">
                  This transaction is already classified, so it is shown here as a focused
                  edit rather than as part of the default queue.
                </p>
              ) : null}

              <div className="meta-grid review-primary-meta">
                <div>
                  <strong>Date</strong>
                  <p>{selectedTransaction.transactionDate}</p>
                </div>
                <div>
                  <strong>Merchant</strong>
                  <p>{getTransactionMerchant(selectedTransaction)}</p>
                </div>
                <div>
                  <strong>Amount</strong>
                  <p>
                    {formatMoneyDisplay(
                      selectedTransaction.normalizedAmount,
                      selectedTransaction.workspaceCurrency,
                      selectedTransaction.direction,
                    )}
                  </p>
                </div>
              </div>

              <details className="disclosure">
                <summary>Transaction details</summary>
                <div className="meta-grid">
                <div>
                  <strong>Original</strong>
                  <p>
                    {formatMoneyDisplay(
                      selectedTransaction.originalAmount,
                      selectedTransaction.originalCurrency,
                      selectedTransaction.direction,
                    )}
                  </p>
                </div>
                <div>
                  <strong>Normalized</strong>
                  <p>
                    {formatMoneyDisplay(
                      selectedTransaction.normalizedAmount,
                      selectedTransaction.workspaceCurrency,
                      selectedTransaction.direction,
                    )}
                  </p>
                </div>
                <div>
                  <strong>Account</strong>
                  <p>{selectedTransaction.accountDisplayName}</p>
                </div>
                <div>
                  <strong>Import source</strong>
                  <p>{selectedTransaction.importSourceName ?? "Unknown source"}</p>
                </div>
                <div>
                  <strong>Import file</strong>
                  <p>{selectedTransaction.importOriginalFilename}</p>
                </div>
                </div>
              </details>

              <div className="stack compact">
                <span
                  className={`badge ${selectedTransaction.classification ? "badge-neutral" : "badge-warning"}`}
                >
                  {formatClassificationSummary(selectedTransaction.classification)}
                </span>
                {selectedTransaction.classification ? (
                  <p className="table-note">
                    {formatDecisionSourceLabel(selectedTransaction.classification.decidedBy)}
                  </p>
                ) : null}
                {selectedQueuePosition ? (
                  <p className="table-note">
                    Item {selectedFilteredPosition} of {pagination.filteredCount} matching · {summary.queueCount} total left.
                  </p>
                ) : null}
                <p className="table-note">
                  Reporting: {formatAllocationSummary(selectedTransaction.allocation)}
                </p>
              </div>

              {selectedTransactionCurrencyState?.label ? (
                <div className="stack compact">
                  <span
                    className={`badge ${
                      selectedTransactionCurrencyState.tone === "warning"
                        ? "badge-warning"
                        : "badge-neutral"
                    }`}
                  >
                    {selectedTransactionCurrencyState.label}
                  </span>
                  {selectedTransactionCurrencyState.fullDescription ? (
                    <p className="helper-text">
                      {selectedTransactionCurrencyState.fullDescription}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {selectedTransaction.suggestion ? (
                <section className={`classification-suggestion-card ${selectedTransaction.suggestion.confidence}`} aria-label="Suggested classification">
                  <div>
                    <span className="eyebrow">{selectedTransaction.suggestion.confidence === "strong" ? "Strong suggestion" : "Likely suggestion"}</span>
                    <h3>
                      {formatClassificationTypeLabel(selectedTransaction.suggestion.classificationType)}
                      {selectedTransaction.suggestion.category ? ` · ${selectedTransaction.suggestion.category}` : ""}
                    </h3>
                    <p>
                      Based on {selectedTransaction.suggestion.supportingTransactionCount} of {selectedTransaction.suggestion.matchingTransactionCount} previous transactions from this merchant.
                    </p>
                  </div>
                  <button className="button button-secondary" type="button" onClick={acceptSuggestion}>Accept suggestion</button>
                </section>
              ) : null}

              <div className="stack compact">
                <ClassificationTypePicker
                  value={singleForm.classificationType}
                  onChange={changeSingleClassificationType}
                />

                {!(["transfer", "ignore"] as Array<ClassificationType | "">).includes(singleForm.classificationType) ? (
                  <CategoryCombobox
                    categories={categories}
                    recentCategories={recentCategories}
                    suggestedCategory={selectedTransaction.suggestion?.category ?? null}
                    value={singleForm.category}
                    onChange={(category) => setSingleForm((current) => ({ ...current, category, categoryId: categoryIdForName(category) }))}
                    blankLabel="Uncategorized"
                    onCreateCategory={async (name) => {
                      const created = await createCategory(name);
                      setSingleForm((current) => ({ ...current, category: created.name, categoryId: created.id }));
                      return created.name;
                    }}
                  />
                ) : null}

                {showMemberField ? <label className="field">
                  <span>{memberFieldLabel}</span>
                  <select
                    ref={memberSelectRef}
                    className="input"
                    value={singleForm.memberOwnerId}
                    onChange={(event) =>
                      setSingleForm((current) => ({
                        ...current,
                        memberOwnerId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Unassigned</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.displayName}
                      </option>
                    ))}
                  </select>
                </label> : null}

                <label className="checkbox-label merchant-rule-toggle">
                  <input
                    type="checkbox"
                    aria-label="Use this decision for future exact merchant matches"
                    checked={singleForm.createRule}
                    disabled={!merchantCanCreateRule}
                    onChange={(event) =>
                      setSingleForm((current) => ({
                        ...current,
                        createRule: event.target.checked,
                      }))
                    }
                  />
                  <span>
                    Always categorize “{selectedTransaction.merchantRaw?.trim() || "this merchant"}” this way <kbd>R</kbd>
                  </span>
                </label>
                {singleForm.createRule && selectedTransaction.merchantRaw ? (
                  <div className="merchant-rule-preview">
                    <strong>{selectedTransaction.exactRuleExists ? "Update saved exact-match rule" : "Save a new exact-match rule"}</strong>
                    <p>Exact merchant name · applies automatically to future imports.</p>
                  </div>
                ) : null}
                {similarVisibleTransactionIds.length > 0 && selectedTransactionInQueue ? (
                  <label className="checkbox-label merchant-rule-toggle">
                    <input
                      type="checkbox"
                      checked={singleForm.applyToSimilar}
                      onChange={(event) =>
                        setSingleForm((current) => ({
                          ...current,
                          applyToSimilar: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      Also apply to {similarVisibleTransactionIds.length} matching transaction{similarVisibleTransactionIds.length === 1 ? "" : "s"} waiting now
                    </span>
                  </label>
                ) : null}
                {!merchantCanCreateRule ? (
                  <p className="helper-text">
                    Merchant rule creation is only available when the transaction has a
                    merchant value.
                  </p>
                ) : null}
                {similarVisibleTransactionIds.length > 0 && selectedTransactionInQueue && !singleForm.applyToSimilar ? (
                  <button className="similar-transactions-action" type="button" onClick={selectSimilarTransactions}>
                    <span><strong>{similarVisibleTransactionIds.length} more</strong> transaction{similarVisibleTransactionIds.length === 1 ? "" : "s"} from this merchant</span>
                    <span>Select and classify together →</span>
                  </button>
                ) : null}
              </div>

              <div className="action-row review-decision-actions">
                <button
                  className="button"
                  type="button"
                  disabled={isSavingSingle || isSubmittingSingle}
                  aria-busy={isSavingSingle || isSubmittingSingle}
                  onClick={() => startSavingSingle(() => void runSingleClassification())}
                >
                  {isSavingSingle || isSubmittingSingle ? "Saving…" : nextTransactionId ? "Save and next  ⌘↵" : "Save classification  ⌘↵"}
                </button>
                {previousTransactionId ? <button className="button button-secondary" type="button" onClick={() => setSelectedTransactionId(previousTransactionId)}>Previous</button> : null}
                {nextTransactionId ? <button className="link-button" type="button" onClick={() => { setSelectedTransactionId(nextTransactionId); setMessage("Skipped for now. No classification was saved."); }}>Skip for now <kbd>S</kbd></button> : null}
                <Link className="button button-secondary" href={selectedLedgerHref}>
                  Open in ledger
                </Link>
              </div>

              {selectedReportTargets.length > 0 ? (
                <div className="stack compact">
                  <p className="helper-text">
                    {selectedReportTargets.length === 1
                      ? "This row is ready for the matching report."
                      : "This adjusted row lands in multiple report months."}
                  </p>
                  <div className="action-row">
                    {selectedReportTargets.map((target) => (
                      <Link className="link-button" href={target.href} key={target.href}>
                        {target.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}

              <details className="disclosure">
                <summary>Report month allocation</summary>
                <div className="stack compact">
                  <p className="muted-text">
                    Allocation controls which report month or months receive this expense. The
                    original payment date stays unchanged.
                  </p>

                  {!allocationEditable ? (
                    <p className="helper-text">
                      Save a reportable classification first to enable allocation editing.
                    </p>
                  ) : (
                    <AllocationEditor
                      currency={selectedTransaction.workspaceCurrency}
                      direction={selectedTransaction.direction}
                      form={allocationForm}
                      isSaving={isSavingAllocation}
                      onSave={() => startSavingAllocation(() => void submitAllocationUpdate())}
                      setForm={setAllocationForm}
                      sourceDate={selectedTransaction.transactionDate}
                      totalAmount={selectedTransaction.normalizedAmount}
                    />
                  )}
                </div>
              </details>
            </div>
          )}
        </article>
      </section>

      <Modal
        open={isShortcutHelpOpen}
        onClose={() => setIsShortcutHelpOpen(false)}
        title="Keyboard shortcuts"
        description="Review transactions without leaving the keyboard. Shortcuts pause while you type in a field."
      >
        <dl className="shortcut-list">
          <div><dt><kbd>↑</kbd> <kbd>↓</kbd></dt><dd>Previous or next transaction</dd></div>
          <div><dt><kbd>1</kbd>–<kbd>6</kbd></dt><dd>Choose classification type</dd></div>
          <div><dt><kbd>C</kbd></dt><dd>Open category search</dd></div>
          <div><dt><kbd>R</kbd></dt><dd>Toggle exact merchant rule</dd></div>
          <div><dt><kbd>S</kbd></dt><dd>Skip for now</dd></div>
          <div><dt><kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Enter</kbd></dt><dd>Save and next</dd></div>
          <div><dt><kbd>?</kbd></dt><dd>Open this help</dd></div>
        </dl>
      </Modal>
    </section>
  );
}
