# Ticket Sales Dashboard — Streamlit (Python)

Interactive 15-page dashboard built on Streamlit + Plotly + pandas. Designed
to run locally on Windows, Mac, or Linux without any service dependencies.

## Quick start

```bash
pip install streamlit pandas numpy plotly
streamlit run app.py
```

That's it. The dashboard opens in your browser at `http://localhost:8501`.

The app expects two CSV files at `data/current_year.csv` and `data/last_year.csv`
relative to `app.py`. (The data folder isn't shipped in this zip — drop your
own files in.) Paths use `os.path.join` so the dashboard runs identically on
Windows / Mac / Linux.

## What's in v2

This iteration consolidates aggressively to eliminate repeated charts:

- **One trend, one place.** The monthly trend chart only appears on Executive
  Summary (portfolio scope) and Affiliate Performance (single-affiliate scope).
  No more duplicates on the YoY Trends page.
- **One YoY-by-X chart.** What used to be five separate "YoY by Sport / by
  Marketplace / by Affiliate / by Tier / by Lead Time" charts on five
  different pages is now a single chart on the YoY Trend Analysis page with
  a dimension picker. Pick the dimension, see the answer.
- **Universal metric toggle.** Every chart that shows "a number per group"
  has a toggle: **Revenue / Profit / Profit Margin / Profit-Cost Ratio**.
  Margin and Ratio are computed properly per group as
  `sum(profit) / sum(revenue or cost)` — never as an average of per-row
  margins (which would weight a $5 ticket the same as a $5,000 ticket).
- **Chronological months.** The monthly trend goes earliest-in-data to
  latest, so a fiscal year spanning Oct → Sep reads left-to-right naturally
  ("Oct 24, Nov 24, …, Aug 25, Sep 25"). No more two-line YoY overlay.

## Sidebar filters

Both filters apply globally to every page that doesn't have its own picker:

- **Affiliate** — single-select dropdown, "All Affiliates" by default.
- **Sports** — multi-select. Leave all selected for no filter; deselect any
  to scope the whole dashboard to a subset of leagues.

Pages with their own pickers (Affiliate Performance, Head-to-Head,
Team Performance) override the sidebar where it makes sense.

## Heatmap colors

Heatmaps use a sequential blue ramp (`SEQ_HEAT`) that:
- never reaches pure white, so white-text annotations stay readable on the
  lightest cells;
- never goes through red, since red signals loss in this dashboard's
  vocabulary;
- has a clean text-color flip threshold around intensity 0.50.

When two heatmaps appear next to each other (Geographic Map TY/LY,
Heatmap Hub Aff×Sport / Aff×Marketplace), they share their color range so
identical values map to identical shades.

## Files

- `app.py`      — Streamlit app, 15 pages, sidebar, router
- `viz.py`      — chart and table builders (Plotly figures, pandas tables)
- `cleaner.py`  — CSV loader, column derivation, KPI helpers
- `eda.ipynb`   — narrated EDA notebook with insight-finding (`jupyter notebook eda.ipynb`)
- `data/`       — drop `current_year.csv` and `last_year.csv` here

## Running the EDA notebook

```bash
pip install jupyter matplotlib
jupyter notebook eda.ipynb
```

The notebook walks through six sections: data shape, headline YoY, affiliate
winners/losers + Pareto, margin by dimension, risk pockets, and three
observations the dashboard doesn't surface as easily. It uses the same
`cleaner.py` and `viz.py` the dashboard uses, so any aggregation matches
between the two.

## Pages

1. **Executive Summary** — KPIs + monthly trend (with metric toggle).
2. **YoY Trend Analysis** — dimension picker + metric toggle. *Every*
   YoY-by-X comparison lives on this page.
3. **Affiliate Performance** — drill into one affiliate.
4. **Affiliate Leaderboard** — sortable table.
5. **Head-to-Head** — pick two affiliates, compare.
6. **Sport Breakdown** — sport mix.
7. **Team Performance** — per-team rollup with best/worst affiliate.
8. **Marketplace & Channel** — pies, margin distribution.
9. **Profit Margin Deep Dive** — histogram + scatter + 4-way group toggle.
10. **Ticket Type & Inventory** — section tier + quantity bucket pies.
11. **Geographic Map** — TY/LY choropleths, shared color scale.
12. **Heatmap Hub** — three 2D intensity views, blue ramp.
13. **Time Patterns** — day×hour heatmap + lead time analysis.
14. **Top Events** — rank toggle (Revenue/Profit/Margin/Ratio/Orders).
15. **Risk & Delivery** — operational metrics, no charts.
