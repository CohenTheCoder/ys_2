# Ticket Sales Dashboard — Browser version

Pure HTML / CSS / JS. No build step, no server, no installation. Open
`index.html` in any modern browser and you're running. Drops directly onto
GitHub Pages or any static host — and works locally from `file://` on
Windows, Mac, and Linux without changes.

## Quick start

**Local:** Double-click `index.html`. The browser will open it; drop your
two CSV files (this year + last year) into the upload page.

**GitHub Pages:** push `index.html`, `dashboard.css`, `dashboard.js` to a
repo with Pages enabled. The dashboard is fully static — no backend
required. (The CSV files stay on the user's machine; nothing is uploaded
anywhere, the parsing happens in-browser via PapaParse.)

## What changed in v2

- **No repeated charts.** The monthly trend lives only on Exec Summary and
  scoped versions on Affiliate Performance. The "YoY by [dimension]" chart
  is consolidated on the YoY Trends page with a dimension picker —
  previously this same chart shape appeared on Sport, Marketplace,
  Leaderboard, Ticket Type, and Time Patterns pages.
- **4-metric toggle everywhere.** Revenue / Profit / Profit Margin /
  Profit-Cost Ratio. Margin and Ratio are computed per-group as
  sum(profit)/sum(revenue or cost), not averaged from row-level margins.
- **Chronological months.** Single line going earliest-in-data to latest,
  with labels like "Oct 24" → "Sep 25".
- **Sport multi-select** in the sidebar — applies globally alongside the
  affiliate filter.
- **Heatmap colors:** new blue ramp that doesn't go to pure white (so
  white-text annotations stay readable) and never goes through red (red
  signals loss in this dashboard's vocabulary). Paired heatmaps share a
  color range.

## Dependencies (loaded from CDN, no install)

- [Plotly.js](https://plot.ly/javascript/) v2.35.2 — charts and choropleth
- [PapaParse](https://www.papaparse.com/) v5.4.1 — CSV parsing

Both are loaded over HTTPS and work offline once cached. If you need a
fully offline build, download both libraries to local files and update the
`<script>` tags in `index.html`.

## Files

- `index.html`     — entry point (upload screen + app shell)
- `dashboard.css`  — styles
- `dashboard.js`   — everything else: cleaner, dataframe ops, chart
  builders, table builder, KPI helpers, all 15 pages, router, and the
  upload + filter wiring

## CSV columns expected

The dashboard expects the same columns as the source export:
`SellDate`, `EventDate`, `EventTime`, `SaleTotal`, `TicketCost`,
`Quantity`, `CompanyName`, `PrimaryPerformerName`, `SecondaryPerformerName`,
`RequestedPerformerTypeId`, `VenueName`, `Section`, `Seats`,
`ShippingCompany`, `DeliveryType`, `IsDelivered`, `IsCancelled`,
`IsExpired`, `InvoiceID`, `EventName`. Extra columns are ignored.

## Browser support

Tested on recent Chrome / Firefox / Safari / Edge. Uses standard ES2018+
features (template literals, arrow functions, async/await, Map/Set). No
transpilation required for any browser from the past five years.
