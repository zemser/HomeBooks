type ImportSourceCellProps = {
  sourceName?: string | null;
  filename: string;
  filenameFirst?: boolean;
};

export function ImportSourceCell({
  sourceName,
  filename,
  filenameFirst = false,
}: ImportSourceCellProps) {
  const source = sourceName?.trim() || "Unknown source";
  const sourceBadge = <span className="badge badge-source">{source}</span>;
  const file = (
    <span className="table-note import-source-file" title={filename}>
      {filename}
    </span>
  );

  return (
    <div className="import-source-cell">
      {filenameFirst ? file : sourceBadge}
      {filenameFirst ? sourceBadge : file}
    </div>
  );
}
