import { type ReactNode } from "react";
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
}: {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** optional bold summary row rendered in the footer */
  totalRow?: Partial<Record<string, ReactNode>> & { __label?: ReactNode };
  empty?: ReactNode;
  minWidth?: number;
  dense?: boolean;
}) {
  const alignOf = (c: Column<T>) => (c.numeric ? "right" : c.align ?? "left");
  const cellCls = (c: Column<T>) =>
    [c.numeric ? "tnum" : "", c.mono ? "mono" : ""].filter(Boolean).join(" ");

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
            {rows.map((row) => (
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
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className={styles.empty}>
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
          {totalRow && rows.length > 0 && (
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
    </div>
  );
}
