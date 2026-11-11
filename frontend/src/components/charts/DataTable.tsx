import type { ReactNode } from 'react'

export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string
  columns: [string, ...string[]]
  rows: ReactNode[][]
}) {
  return (
    <details className="group mt-3 text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-giz-suave marker:content-none hover:text-giz">
        <span className="mr-1.5 inline-block transition-transform group-open:rotate-90" aria-hidden="true">
          ›
        </span>
        Ver dados em tabela
      </summary>
      <table className="mt-1 w-full text-left">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-giz-suave">
          <tr>
            {columns.map((c, i) => (
              <th key={c} scope="col" className={i === 0 ? 'py-1.5 font-medium' : 'py-1.5 text-right font-medium'}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-linha/60">
              {r.map((cell, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="py-1.5 font-normal">
                    {cell}
                  </th>
                ) : (
                  <td key={j} className="py-1.5 text-right tabular-nums">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
