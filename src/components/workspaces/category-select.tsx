"use client";

type CategorySelectProps = {
  categories: string[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  blankLabel?: string;
};

export function CategorySelect({
  categories,
  value,
  onChange,
  className = "input",
  blankLabel = "No category",
}: CategorySelectProps) {
  const optionValues = value && !categories.includes(value) ? [value, ...categories] : categories;

  return (
    <select
      className={className}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{categories.length > 0 ? blankLabel : "No categories yet"}</option>
      {optionValues.map((category) => (
        <option key={category} value={category}>
          {category}
        </option>
      ))}
    </select>
  );
}
