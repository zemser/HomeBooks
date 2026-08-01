"use client";

import type { WorkspaceCategoryItem } from "@/features/workspaces/types";

type CategorySelectProps = {
  categories: WorkspaceCategoryItem[];
  categoryId: string;
  categoryName?: string;
  onChange: (categoryId: string, categoryName: string) => void;
  className?: string;
  blankLabel?: string;
};

export function CategorySelect({
  categories,
  categoryId,
  categoryName = "",
  onChange,
  className = "input",
  blankLabel = "No category",
}: CategorySelectProps) {
  const hasSelectedCategory = categories.some((category) => category.id === categoryId);
  const legacyValue = categoryName && !hasSelectedCategory ? `legacy:${categoryName}` : "";
  const value = hasSelectedCategory ? categoryId : legacyValue;

  return (
    <select
      className={className}
      value={value}
      onChange={(event) => {
        const nextId = event.target.value;
        if (!nextId || nextId.startsWith("legacy:")) {
          onChange("", nextId.startsWith("legacy:") ? nextId.slice(7) : "");
          return;
        }
        const category = categories.find((item) => item.id === nextId);
        onChange(category?.id ?? "", category?.name ?? "");
      }}
    >
      <option value="">{categories.length > 0 ? blankLabel : "No categories yet"}</option>
      {legacyValue ? <option value={legacyValue}>{categoryName}</option> : null}
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
    </select>
  );
}
