import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import styles from "./DataTable.module.css";

export type Column<T> = {
  key: string;
  header: ReactNode;
  /** cell renderer; defaults to (row as any)[key] */
  render?: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  numeric?: boolean; // right-align + tabular figures
  mono?: boolean; // monospace cell (IDs, amounts)
  width?: number | string;
  /** header-only; hides on narrow screens via CSS if given "secondary" */
  emphasis?: "secondary";
};

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  onRowClick,
  totalRow,
  empty = "No records found.",
  minWidth = 640,
  dense = true,
  pageSize = 25,
  pageSizeOptions = [10, 25, 50, 100],
  paginate = true,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** optional bold summary row rendered in the footer (reflects ALL rows, not the page) */
  totalRow?: Partial<Record<string, ReactNode>> & { __label?: ReactNode };
  empty?: ReactNode;
  minWidth?: number;
  dense?: boolean;
  pageSize?: number;
  pageSizeOptions?: number[];
  paginate?: boolean;
}) {
  const alignOf = (c: Column<T>) => (c.numeric ? "right" : c.align ?? "left");
  const cellCls = (c: Column<T>) =>
    [c.numeric ? "tnum" : "", c.mono ? "mono" : ""].filter(Boolean).join(" ");

  const [size, setSize] = useState(pageSize);
  const [page, setPage] = useState(1);
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / size));

  // Reset to the first page whenever the data set or page size changes.
  useEffect(() => { setPage(1); }, [total, size]);

  const usePaging = paginate && total > size;
  const start = usePaging ? (page - 1) * size : 0;
  const shown = usePaging ? rows.slice(start, start + size) : rows;
  const from = total === 0 ? 0 : start + 1;
  const to = usePaging ? Math.min(start + size, total) : total;
  const showBar = total > Math.min(...pageSizeOptions);

  return (
    <div className={styles.wrap}>
      <div className={`${styles.scroll} surfaceScroll`}>
        <table
          className={`${styles.table} ${dense ? styles.dense : ""}`}
          style={{ minWidth }}
        >
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{ textAlign: alignOf(c), width: c.width }}
                  className={c.emphasis === "secondary" ? styles.secondary : ""}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr
                key={getRowId(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? styles.clickable : ""}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    style={{ textAlign: alignOf(c) }}
                    className={`${cellCls(c)} ${c.emphasis === "secondary" ? styles.secondary : ""}`}
                  >
                    {c.render ? c.render(row) : (row as Record<string, ReactNode>)[c.key]}
                  </td>
                ))}
              </tr>
            ))}
            {total === 0 && (
              <tr>
                <td colSpan={columns.length} className={styles.empty}>
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
          {totalRow && total > 0 && (
            <tfoot>
              <tr>
                {columns.map((c, idx) => (
                  <td
                    key={c.key}
                    style={{ textAlign: alignOf(c) }}
                    className={cellCls(c)}
                  >
                    {idx === 0 && totalRow.__label != null
                      ? totalRow.__label
                      : totalRow[c.key]}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showBar && (
        <div className={styles.pager}>
          <div className={styles.pagerInfo}>
            Showing <b>{from.toLocaleString("en-IN")}</b>–<b>{to.toLocaleString("en-IN")}</b> of{" "}
            <b>{total.toLocaleString("en-IN")}</b>
          </div>
          <div className={styles.pagerControls}>
            <label className={styles.pagerSizeLbl}>
              Rows
              <select
                className={styles.pagerSize}
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
              >
                {pageSizeOptions.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
            <div className={styles.pagerNav}>
              <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(1)} aria-label="First page"><ChevronsLeft size={15} /></button>
              <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page"><ChevronLeft size={15} /></button>
              <span className={styles.pageNum}>Page {page} of {pageCount}</span>
              <button className={styles.pageBtn} disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} aria-label="Next page"><ChevronRight size={15} /></button>
              <button className={styles.pageBtn} disabled={page >= pageCount} onClick={() => setPage(pageCount)} aria-label="Last page"><ChevronsRight size={15} /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
