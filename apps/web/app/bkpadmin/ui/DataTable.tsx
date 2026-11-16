"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { EmptyState } from "./EmptyState";

/**
 * Graphite data table (TanStack Table): sortable headers, text search,
 * pagination and an empty state. Rows can link to a detail page.
 */
export function DataTable<T>({
  columns,
  data,
  initialSort = [],
  searchText,
  searchPlaceholder = "Search",
  toolbar,
  pageSize = 20,
  empty,
  rowHref,
  label,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TanStack column value types vary per column
  columns: ColumnDef<T, any>[];
  data: T[];
  initialSort?: SortingState;
  /** Text a row is searched by; omit to hide the search box. */
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  toolbar?: ReactNode;
  pageSize?: number;
  empty: { title: string; description?: string; action?: ReactNode };
  rowHref?: (row: T) => string;
  /** Accessible name for the table. */
  label: string;
}) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>(initialSort);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const rows = useMemo(
    () =>
      needle && searchText
        ? data.filter((r) => searchText(r).toLowerCase().includes(needle))
        : data,
    [data, needle, searchText],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize } },
    autoResetPageIndex: true,
  });

  const total = rows.length;
  const { pageIndex } = table.getState().pagination;
  const first = total === 0 ? 0 : pageIndex * pageSize + 1;
  const last = Math.min(total, (pageIndex + 1) * pageSize);

  return (
    <div className="gx-table-card">
      {toolbar || searchText ? (
        <div className="gx-table-toolbar">
          <div className="gx-table-toolbar__left">{toolbar}</div>
          {searchText ? (
            <label className="gx-search">
              <Search size={16} aria-hidden="true" />
              <span className="gx-sr-only">{searchPlaceholder}</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {data.length === 0 ? (
        <EmptyState
          title={empty.title}
          description={empty.description}
          action={empty.action}
        />
      ) : total === 0 ? (
        <EmptyState
          title="No matches"
          description="Try a different search or filter."
        />
      ) : (
        <>
          <div className="gx-table-scroll">
            <table className="gx-table" aria-label={label}>
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h) => {
                      const sorted = h.column.getIsSorted();
                      const canSort = h.column.getCanSort();
                      return (
                        <th
                          key={h.id}
                          scope="col"
                          aria-sort={
                            sorted === "asc"
                              ? "ascending"
                              : sorted === "desc"
                                ? "descending"
                                : canSort
                                  ? "none"
                                  : undefined
                          }
                        >
                          {h.isPlaceholder ? null : canSort ? (
                            <button
                              type="button"
                              className="gx-th-sort"
                              onClick={h.column.getToggleSortingHandler()}
                            >
                              {flexRender(
                                h.column.columnDef.header,
                                h.getContext(),
                              )}
                              {sorted === "asc" ? (
                                <ArrowUp size={13} aria-hidden="true" />
                              ) : sorted === "desc" ? (
                                <ArrowDown size={13} aria-hidden="true" />
                              ) : (
                                <ArrowUpDown
                                  size={13}
                                  aria-hidden="true"
                                  className="gx-th-sort__idle"
                                />
                              )}
                            </button>
                          ) : (
                            flexRender(
                              h.column.columnDef.header,
                              h.getContext(),
                            )
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => {
                  const href = rowHref?.(row.original);
                  return (
                    <tr
                      key={row.id}
                      className={href ? "gx-tr-link" : undefined}
                      onClick={
                        href
                          ? (e) => {
                              const t = e.target as HTMLElement;
                              if (t.closest("a,button,input,select")) return;
                              router.push(href);
                            }
                          : undefined
                      }
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="gx-table-foot">
            <span className="gx-muted">
              Showing {first}–{last} of {total}
            </span>
            {table.getPageCount() > 1 ? (
              <div className="gx-pager">
                <button
                  type="button"
                  className="gx-btn gx-btn--secondary gx-btn--sm gx-btn--icon"
                  aria-label="Previous page"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <span className="gx-pager__label">
                  Page {pageIndex + 1} of {table.getPageCount()}
                </span>
                <button
                  type="button"
                  className="gx-btn gx-btn--secondary gx-btn--sm gx-btn--icon"
                  aria-label="Next page"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
