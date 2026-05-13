"""
viz.py
------
Chart-builder functions. Every function takes a dataframe (or pre-aggregated
data) and returns a Plotly figure. Streamlit then renders them with
st.plotly_chart.

Style choices:
- THIS_COLOR = bright blue, LAST_COLOR = soft gray. Used everywhere YoY
  appears so the eye learns the convention.
- Plain function names. No leading underscores.
- No classes.
"""

import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go


# ---- shared style ---------------------------------------------------------

THIS_COLOR = "#2E86DE"
LAST_COLOR = "#A4B0BE"
PROFIT_COLOR = "#27AE60"
LOSS_COLOR = "#E74C3C"
ACCENT_COLORS = ["#2E86DE", "#27AE60", "#F39C12", "#9B59B6", "#E74C3C",
                 "#16A085", "#D35400", "#34495E"]


def apply_layout(fig, height=420, title=None):
    """Common layout pass to keep charts visually consistent."""
    fig.update_layout(
        height=height,
        title=title,
        margin=dict(l=40, r=20, t=60, b=40),
        plot_bgcolor="white",
        paper_bgcolor="white",
        font=dict(family="Inter, system-ui, sans-serif", size=12),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
    )
    fig.update_xaxes(showgrid=True, gridcolor="#EEE", zeroline=False)
    fig.update_yaxes(showgrid=True, gridcolor="#EEE", zeroline=False)
    return fig


# ---------------------------------------------------------------------------
# Metric framework
# ---------------------------------------------------------------------------
# Every chart that takes a "metric" supports the same four metrics. Sums
# (Revenue, Profit) get summed across rows; ratios (Margin, Ratio) get
# computed properly as sum(profit) / sum(revenue or cost) per group — never
# averaged-of-rows, which would weight tiny orders the same as huge ones.

METRIC_OPTIONS = ["SaleTotal", "Profit", "Margin", "Ratio"]

METRIC_LABELS = {
    "SaleTotal": "Revenue",
    "Profit": "Profit",
    "Margin": "Profit Margin (%)",
    "Ratio": "Profit/Cost Ratio (%)",
}

# Whether higher = better. Used by table coloring and chart hints.
METRIC_GOOD_HIGH = {
    "SaleTotal": True, "Profit": True, "Margin": True, "Ratio": True,
}

# Whether the metric is a ratio (so it should be formatted as %, not $)
METRIC_IS_RATIO = {
    "SaleTotal": False, "Profit": False, "Margin": True, "Ratio": True,
}


def aggregate_metric(df_sub, metric):
    """
    Compute a single scalar value of `metric` for a row subset. Used by every
    chart that needs to evaluate the toggleable metric on a group.
    """
    if len(df_sub) == 0:
        return 0
    rev = df_sub["SaleTotal"].sum()
    prof = df_sub["Profit"].sum()
    cost = df_sub["TicketCost"].sum()
    if metric == "SaleTotal":
        return rev
    if metric == "Profit":
        return prof
    if metric == "Margin":
        return (prof / rev * 100) if rev > 0 else 0
    if metric == "Ratio":
        return (prof / cost * 100) if cost > 0 else 0
    raise ValueError(f"Unknown metric: {metric}")


def metric_label(metric):
    return METRIC_LABELS.get(metric, metric)


# ---------------------------------------------------------------------------
# Trend lines (chronological, single timeline)
# ---------------------------------------------------------------------------

def monthly_trend(df, metric="SaleTotal", title=None):
    """
    Single chronological line chart. Each x-tick is a year-month label
    ("Oct 24", "Nov 24", "Dec 24", "Jan 25", …) ordered from the earliest
    month present in the data to the latest. Lets the eye see the full
    program arc across both years rather than overlaying calendar months.

    For sum metrics (Revenue, Profit) each point is the month total. For
    ratio metrics (Margin, Ratio) each point is sum(profit)/sum(rev or cost)
    in that month — proper aggregation, not an average-of-row-margins.
    """
    work = df.dropna(subset=["SellDate_dt"]).copy()
    if len(work) == 0:
        fig = go.Figure()
        return apply_layout(fig, title=title or "No data")

    work["YearMonth"] = work["SellDate_dt"].dt.to_period("M")
    periods = sorted(work["YearMonth"].unique())

    rows = []
    for p in periods:
        sub = work[work["YearMonth"] == p]
        # "%b %y" -> "Oct 24". %y is 2-digit year — matches the user spec.
        rows.append({
            "YearMonth": str(p),
            "Label": p.strftime("%b %y"),
            "Value": aggregate_metric(sub, metric),
        })
    plot_df = pd.DataFrame(rows)

    fig = px.line(
        plot_df, x="Label", y="Value",
        markers=True,
        color_discrete_sequence=[THIS_COLOR],
    )
    fig.update_traces(line=dict(width=2.5), marker=dict(size=7))
    fig.update_xaxes(categoryorder="array", categoryarray=plot_df["Label"].tolist(),
                     tickangle=-30)
    fig.update_yaxes(title=metric_label(metric))
    return apply_layout(fig, title=title or f"Monthly {metric_label(metric)}")


# ---------------------------------------------------------------------------
# YoY grouped bars (metric-aware)
# ---------------------------------------------------------------------------

def yoy_bar_compare(df, group_col, metric="SaleTotal", title=None, top_n=None):
    """
    Side-by-side bars per category, colored by year. Supports all four
    metrics from METRIC_OPTIONS — for ratio metrics each bar height is
    computed properly (sum-then-divide, not averaged).
    """
    groups = sorted([g for g in df[group_col].dropna().unique()])
    rows = []
    for g in groups:
        for year in ["Last Year", "This Year"]:
            sub = df[(df[group_col] == g) & (df["YearLabel"] == year)]
            rows.append({
                group_col: g,
                "YearLabel": year,
                "Value": aggregate_metric(sub, metric),
            })
    plot_df = pd.DataFrame(rows)

    if top_n:
        # Pick top groups by combined absolute value across years
        totals = (plot_df.assign(absV=plot_df["Value"].abs())
                  .groupby(group_col)["absV"].sum()
                  .sort_values(ascending=False).head(top_n).index)
        plot_df = plot_df[plot_df[group_col].isin(totals)]

    fig = px.bar(
        plot_df, x=group_col, y="Value", color="YearLabel", barmode="group",
        category_orders={"YearLabel": ["Last Year", "This Year"]},
        color_discrete_map={"This Year": THIS_COLOR, "Last Year": LAST_COLOR},
    )
    fig.update_xaxes(tickangle=-30)
    fig.update_yaxes(title=metric_label(metric))
    return apply_layout(fig, title=title or f"{metric_label(metric)} by {group_col} — YoY")


# ---------------------------------------------------------------------------
# Composition (pies / donuts)
# ---------------------------------------------------------------------------

def revenue_pie(df, group_col, title=None, metric="SaleTotal"):
    """
    Donut chart of value share by category. Default metric is SaleTotal
    (revenue) but pass metric="Profit" to flip it to a profit-share donut.
    Used by pages that expose a metric toggle so the same pie slot can
    show either revenue or profit composition.
    """
    grouped = df.groupby(group_col)[metric].sum().reset_index()
    fig = px.pie(grouped, names=group_col, values=metric,
                 color_discrete_sequence=ACCENT_COLORS, hole=0.4)
    fig.update_traces(textposition="inside", textinfo="percent+label")
    metric_label = {"SaleTotal": "Revenue", "Profit": "Profit"}.get(metric, metric)
    return apply_layout(fig, title=title or f"{metric_label} Mix by {group_col}")


def order_count_pie(df, group_col, title=None):
    grouped = df.groupby(group_col).size().reset_index(name="Orders")
    fig = px.pie(grouped, names=group_col, values="Orders",
                 color_discrete_sequence=ACCENT_COLORS, hole=0.4)
    fig.update_traces(textposition="inside", textinfo="percent+label")
    return apply_layout(fig, title=title or f"Order Volume by {group_col}")


# ---------------------------------------------------------------------------
# Distributions (histograms)
# ---------------------------------------------------------------------------

def margin_histogram(df, title=None):
    fig = px.histogram(
        df.dropna(subset=["ProfitMargin"]),
        x="ProfitMargin", color="YearLabel", nbins=50, barmode="overlay",
        color_discrete_map={"This Year": THIS_COLOR, "Last Year": LAST_COLOR},
        opacity=0.7,
    )
    fig.update_xaxes(title="Profit Margin (%)")
    fig.add_vline(x=0, line_dash="dash", line_color="red", opacity=0.6)
    return apply_layout(fig, title=title or "Profit Margin Distribution")


def lead_time_histogram(df, title=None):
    work = df[df["LeadTimeDays"].between(-30, 365)]
    fig = px.histogram(
        work, x="LeadTimeDays", color="YearLabel", nbins=60, barmode="overlay",
        color_discrete_map={"This Year": THIS_COLOR, "Last Year": LAST_COLOR},
        opacity=0.7,
    )
    fig.update_xaxes(title="Days from Sale to Event")
    return apply_layout(fig, title=title or "Lead Time Distribution")


def revenue_histogram(df, title=None):
    work = df[df["SaleTotal"] < df["SaleTotal"].quantile(0.99)]
    fig = px.histogram(
        work, x="SaleTotal", color="YearLabel", nbins=50, barmode="overlay",
        color_discrete_map={"This Year": THIS_COLOR, "Last Year": LAST_COLOR},
        opacity=0.7,
    )
    fig.update_xaxes(title="Order Revenue ($)")
    return apply_layout(fig, title=title or "Order Size Distribution")


# ---------------------------------------------------------------------------
# Heatmaps
# ---------------------------------------------------------------------------

# Sequential blue ramp for heatmaps and choropleths. Picked to:
#  - never go pure white (so white-text annotations stay readable on the
#    lightest cells)
#  - never go through red (red = loss in this dashboard's vocabulary)
#  - have a clean mid-tone where the white-vs-dark text decision flips
SEQ_HEAT = [
    [0.00, "#CFE0EE"],
    [0.15, "#B5D0E4"],
    [0.30, "#8FB8D6"],
    [0.45, "#5E97C2"],
    [0.60, "#3A77AB"],
    [0.75, "#205A92"],
    [0.90, "#0F4172"],
    [1.00, "#08306B"],
]

# Old name kept for any internal references.
SEQ_BLUES = SEQ_HEAT


def fmt_compact(v):
    """
    Compact money for tight spaces (heatmap cells, axis ticks).
        1234567 -> "$1.2M"   45000 -> "$45K"   850 -> "$850"   0 -> ""
    Returns empty for zero so heatmap cells with no activity stay clean.
    """
    if v is None or pd.isna(v) or not np.isfinite(v) or v == 0:
        return ""
    sign = "-" if v < 0 else ""
    abs_v = abs(v)
    if abs_v >= 1e6:
        return f"{sign}${abs_v / 1e6:.1f}M"
    if abs_v >= 1e3:
        return f"{sign}${abs_v / 1e3:.0f}K"
    return f"{sign}${round(abs_v):,}"


def shared_z_range(grids):
    """
    Compute a shared [0, max] color range across one or more 2D arrays.
    Anchors at zero so two heatmaps with different ranges still reflect
    proportional intensity. Outlier-resistant: clipped to the 98th percentile
    so a single megasale doesn't wash out everything else.
    """
    vals = []
    for g in grids:
        arr = np.asarray(g, dtype=float).flatten()
        for v in arr:
            if np.isfinite(v) and v != 0:
                vals.append(v)
    if not vals:
        return (0, 1)
    hi = float(np.quantile(vals, 0.98))
    if hi > 0:
        return (0, hi)
    m = max(vals) if vals else 1
    return (0, m or 1)


def heatmap_two_dim(df, row_col, col_col, metric="SaleTotal",
                    title=None, top_rows=None, top_cols=None,
                    z_range=None, height=480):
    """
    Two-dimensional heatmap aggregating `metric` per (row, col) cell.

    Supports all four metrics from METRIC_OPTIONS:
      - SaleTotal / Profit: per-cell sum
      - Margin: per-cell sum(profit) / sum(rev)  (proper aggregation,
        NOT a mean-of-row-margins which would weight a $5 ticket the
        same as a $5,000 ticket)
      - Ratio:  per-cell sum(profit) / sum(cost)

    Visuals:
      - rows ordered ascending by row total (largest band sits at the top)
      - cols ordered descending by col total (densest column on the left)
      - annotations: compact money for sums ($1.2M), 0.0% for ratios
      - text color flips at intensity 0.50 so it stays readable on every cell
      - color scale never reaches white (annotations remain visible)
      - z_range can be passed in to share a scale with another heatmap
    """
    # Per-cell aggregates of the underlying components — vectorized so this
    # stays fast on 100k+ rows.
    g = (df.groupby([row_col, col_col])
         .agg(rev=("SaleTotal", "sum"),
              prof=("Profit", "sum"),
              cost=("TicketCost", "sum"),
              orders=("SaleTotal", "count"))
         .reset_index())

    if metric == "SaleTotal":
        g["v"] = g["rev"]
    elif metric == "Profit":
        g["v"] = g["prof"]
    elif metric == "Margin":
        g["v"] = np.where(g["rev"] > 0, g["prof"] / g["rev"] * 100, 0)
    elif metric == "Ratio":
        g["v"] = np.where(g["cost"] > 0, g["prof"] / g["cost"] * 100, 0)
    else:
        raise ValueError(f"Unknown metric: {metric}")

    # Top-N filtering (if requested) — by absolute total of the chosen metric
    if top_rows:
        keep = (g.groupby(row_col)["v"].apply(lambda s: s.abs().sum())
                .sort_values(ascending=False).head(top_rows).index)
        g = g[g[row_col].isin(keep)]
    if top_cols:
        keep = (g.groupby(col_col)["v"].apply(lambda s: s.abs().sum())
                .sort_values(ascending=False).head(top_cols).index)
        g = g[g[col_col].isin(keep)]

    pivot = g.pivot(index=row_col, columns=col_col, values="v").fillna(0)

    # Sort rows ascending / cols descending by their totals
    row_totals = pivot.sum(axis=1).sort_values(ascending=True)
    col_totals = pivot.sum(axis=0).sort_values(ascending=False)
    pivot = pivot.loc[row_totals.index, col_totals.index]

    grid = pivot.values
    zmin, zmax = z_range if z_range else shared_z_range([grid])
    label_threshold = zmax * 0.03 if zmax > 0 else 0
    is_ratio = METRIC_IS_RATIO[metric]

    # Cell annotations
    annotations = []
    for i, row_label in enumerate(pivot.index):
        for j, col_label in enumerate(pivot.columns):
            v = grid[i, j]
            if not np.isfinite(v) or v == 0:
                continue
            if abs(v) < label_threshold:
                continue
            intensity = (v / zmax) if zmax > 0 else 0
            # Threshold tuned for the new color ramp (which doesn't go pure
            # white) — flip at 0.50 instead of 0.55.
            font_color = "#FFFFFF" if intensity > 0.50 else "#0F172A"
            label = f"{v:.1f}%" if is_ratio else fmt_compact(v)
            annotations.append(dict(
                x=col_label, y=row_label, text=label,
                showarrow=False,
                font=dict(size=10, color=font_color),
            ))

    money_or_pct = "%{z:.1f}%" if is_ratio else "$%{z:,.0f}"
    fig = go.Figure(data=go.Heatmap(
        z=grid, x=list(pivot.columns), y=list(pivot.index),
        colorscale=SEQ_HEAT, zmin=zmin, zmax=zmax,
        hovertemplate=(f"%{{y}} · %{{x}}<br>{metric_label(metric)}: "
                       f"{money_or_pct}<extra></extra>"),
    ))
    fig = apply_layout(
        fig, height=height,
        title=title or f"{metric_label(metric)} by {row_col} × {col_col}")
    fig.update_xaxes(tickangle=-30, automargin=True)
    fig.update_yaxes(automargin=True)
    fig.update_layout(annotations=annotations)
    return fig


def day_hour_heatmap(df, metric="SaleTotal", title=None, z_range=None):
    """
    Day-of-week × hour-of-day intensity heat. Same metric framework as
    heatmap_two_dim — supports Revenue/Profit/Margin/Ratio with proper
    per-cell aggregation.
    """
    days_order = ["Monday", "Tuesday", "Wednesday", "Thursday",
                  "Friday", "Saturday", "Sunday"]

    g = (df.groupby(["SellDayOfWeek", "SellHour"])
         .agg(rev=("SaleTotal", "sum"),
              prof=("Profit", "sum"),
              cost=("TicketCost", "sum"))
         .reset_index())

    if metric == "SaleTotal":
        g["v"] = g["rev"]
    elif metric == "Profit":
        g["v"] = g["prof"]
    elif metric == "Margin":
        g["v"] = np.where(g["rev"] > 0, g["prof"] / g["rev"] * 100, 0)
    elif metric == "Ratio":
        g["v"] = np.where(g["cost"] > 0, g["prof"] / g["cost"] * 100, 0)
    else:
        raise ValueError(f"Unknown metric: {metric}")

    pivot = g.pivot(index="SellDayOfWeek", columns="SellHour",
                    values="v").reindex(days_order)
    # Make sure every hour 0-23 is present so the axis is consistent
    for h in range(24):
        if h not in pivot.columns:
            pivot[h] = 0
    pivot = pivot[sorted(pivot.columns)].fillna(0)

    grid = pivot.values
    zmin, zmax = z_range if z_range else shared_z_range([grid])
    label_threshold = zmax * 0.04 if zmax > 0 else 0
    is_ratio = METRIC_IS_RATIO[metric]

    annotations = []
    for i, day in enumerate(pivot.index):
        for j, hour in enumerate(pivot.columns):
            v = grid[i, j]
            if not np.isfinite(v) or v == 0:
                continue
            if abs(v) < label_threshold:
                continue
            intensity = (v / zmax) if zmax > 0 else 0
            font_color = "#FFFFFF" if intensity > 0.50 else "#0F172A"
            label = f"{v:.0f}%" if is_ratio else fmt_compact(v)
            annotations.append(dict(
                x=hour, y=day, text=label,
                showarrow=False,
                font=dict(size=9, color=font_color),
            ))

    money_or_pct = "%{z:.1f}%" if is_ratio else "$%{z:,.0f}"
    fig = go.Figure(data=go.Heatmap(
        z=grid, x=list(pivot.columns), y=list(pivot.index),
        colorscale=SEQ_HEAT, zmin=zmin, zmax=zmax,
        hovertemplate=f"%{{y}} · %{{x}}:00<br>{money_or_pct}<extra></extra>",
    ))
    fig = apply_layout(
        fig, height=420,
        title=title or f"When sales happen — {metric_label(metric)}")
    fig.update_xaxes(dtick=2, title="Hour of Day")
    fig.update_yaxes(automargin=True)
    fig.update_layout(annotations=annotations)
    return fig


# ---------------------------------------------------------------------------
# Geographic
# ---------------------------------------------------------------------------

def state_choropleth(df, metric="SaleTotal", title=None, z_range=None):
    """
    US state choropleth. Drops Canadian/empty states (the choropleth only
    renders US codes anyway). Supports all four metrics — for ratios, the
    per-state value is sum(profit) / sum(rev or cost) so a state with one
    huge sale doesn't dominate.

    Pass z_range=(min, max) to share a color scale with another choropleth
    so identical dollar amounts get identical colors across both maps.
    """
    work = df.dropna(subset=["State"])
    g = (work.groupby("State")
         .agg(rev=("SaleTotal", "sum"),
              prof=("Profit", "sum"),
              cost=("TicketCost", "sum"))
         .reset_index())

    if metric == "SaleTotal":
        g["v"] = g["rev"]
    elif metric == "Profit":
        g["v"] = g["prof"]
    elif metric == "Margin":
        g["v"] = np.where(g["rev"] > 0, g["prof"] / g["rev"] * 100, 0)
    elif metric == "Ratio":
        g["v"] = np.where(g["cost"] > 0, g["prof"] / g["cost"] * 100, 0)
    else:
        raise ValueError(f"Unknown metric: {metric}")

    is_ratio = METRIC_IS_RATIO[metric]
    fig = px.choropleth(
        g, locations="State", locationmode="USA-states",
        color="v", scope="usa", color_continuous_scale=SEQ_HEAT,
        range_color=z_range,
        labels={"v": metric_label(metric)},
        hover_data={"v": ":.1f" if is_ratio else ":,.0f"},
    )
    return apply_layout(fig, height=520,
                        title=title or f"{metric_label(metric)} by State")


def choropleth_shared_range(df_subsets, metric):
    """
    Shared (0, max) color range across subsets, computed using the same
    metric-aware aggregation as state_choropleth — so the maps you compare
    really are on the same scale even for ratio metrics.
    """
    maxes = []
    for sub in df_subsets:
        work = sub.dropna(subset=["State"])
        if not len(work):
            maxes.append(0)
            continue
        g = (work.groupby("State")
             .agg(rev=("SaleTotal", "sum"),
                  prof=("Profit", "sum"),
                  cost=("TicketCost", "sum"))
             .reset_index())
        if metric == "SaleTotal":
            g["v"] = g["rev"]
        elif metric == "Profit":
            g["v"] = g["prof"]
        elif metric == "Margin":
            g["v"] = np.where(g["rev"] > 0, g["prof"] / g["rev"] * 100, 0)
        elif metric == "Ratio":
            g["v"] = np.where(g["cost"] > 0, g["prof"] / g["cost"] * 100, 0)
        maxes.append(float(g["v"].max()) if len(g) else 0)
    return (0, max(maxes + [1]))


# ---------------------------------------------------------------------------
# Scatter / margin views
# ---------------------------------------------------------------------------

def cost_vs_revenue_scatter(df, title=None):
    """
    Scatter of TicketCost vs SaleTotal. Points above the diagonal are profit,
    below are loss. Sized by quantity, colored by sport.
    """
    work = df[(df["SaleTotal"] > 0) & (df["TicketCost"] > 0)].copy()
    fig = px.scatter(
        work, x="TicketCost", y="SaleTotal", color="Sport", size="TicketsSold",
        hover_data=["CompanyName", "EventName", "ProfitMargin"],
        opacity=0.65, color_discrete_sequence=ACCENT_COLORS,
    )
    # diagonal break-even line
    upper = max(work["SaleTotal"].max(), work["TicketCost"].max())
    fig.add_shape(type="line", x0=0, y0=0, x1=upper, y1=upper,
                  line=dict(color="red", dash="dash", width=1))
    return apply_layout(fig, height=520,
                        title=title or "Cost vs Revenue (red line = break-even)")


def margin_by_group_box(df, group_col, title=None):
    """Box plot of margin by category, ordered by median."""
    work = df.dropna(subset=["ProfitMargin"])
    medians = (work.groupby(group_col)["ProfitMargin"]
               .median().sort_values(ascending=False))
    fig = px.box(
        work, x=group_col, y="ProfitMargin",
        category_orders={group_col: list(medians.index)},
        color_discrete_sequence=[THIS_COLOR],
    )
    fig.update_xaxes(tickangle=-30)
    fig.add_hline(y=0, line_dash="dash", line_color="red", opacity=0.6)
    return apply_layout(fig, height=460,
                        title=title or f"Margin Distribution by {group_col}")


# ---------------------------------------------------------------------------
# Affiliate-vs-portfolio compare
# ---------------------------------------------------------------------------

def affiliate_vs_portfolio_bars(df, affiliate_name):
    """
    Single chart, four metrics. Each metric shows two bars:
      - affiliate (this year)
      - portfolio average per affiliate (this year)
    Quick "am I above or below average?" view.
    """
    this_only = df[df["YearLabel"] == "This Year"]
    aff_df = this_only[this_only["CompanyName"] == affiliate_name]
    aff_kpi = {
        "Revenue": aff_df["SaleTotal"].sum(),
        "Profit": aff_df["Profit"].sum(),
        "Avg Order": aff_df["SaleTotal"].mean() if len(aff_df) else 0,
        "Margin %": (aff_df["Profit"].sum() / aff_df["SaleTotal"].sum() * 100)
                    if aff_df["SaleTotal"].sum() > 0 else 0,
    }
    n_aff = max(this_only["CompanyName"].nunique(), 1)
    port_kpi = {
        "Revenue": this_only["SaleTotal"].sum() / n_aff,
        "Profit": this_only["Profit"].sum() / n_aff,
        "Avg Order": this_only["SaleTotal"].mean(),
        "Margin %": (this_only["Profit"].sum() / this_only["SaleTotal"].sum() * 100)
                    if this_only["SaleTotal"].sum() > 0 else 0,
    }
    rows = []
    for metric in aff_kpi:
        rows.append({"Metric": metric, "Series": affiliate_name, "Value": aff_kpi[metric]})
        rows.append({"Metric": metric, "Series": "Portfolio Avg", "Value": port_kpi[metric]})
    plot_df = pd.DataFrame(rows)
    fig = px.bar(
        plot_df, x="Metric", y="Value", color="Series", barmode="group",
        color_discrete_map={affiliate_name: THIS_COLOR, "Portfolio Avg": LAST_COLOR},
    )
    return apply_layout(fig, title=f"{affiliate_name} vs Portfolio Average")


def affiliate_yoy_bars(df, affiliate_name=None):
    """
    One affiliate, this vs last across every key metric. The frame can come
    in already filtered (preferred) or with the full df + an affiliate_name
    to filter on (legacy signature).

    Each metric is plotted on its own normalized axis (because Revenue lives
    in $1,000s and Margin lives in 0–100). The chart's job is to surface
    direction-of-change at a glance — the actual KPI cards above carry the
    real magnitudes.
    """
    if affiliate_name is not None:
        aff = df[df["CompanyName"] == affiliate_name]
        title = f"{affiliate_name} — YoY Comparison"
    else:
        aff = df
        title = "YoY Comparison"

    this_aff = aff[aff["YearLabel"] == "This Year"]
    last_aff = aff[aff["YearLabel"] == "Last Year"]

    rows = []
    for label, frame in [("This Year", this_aff), ("Last Year", last_aff)]:
        rev = aggregate_metric(frame, "SaleTotal")
        prof = aggregate_metric(frame, "Profit")
        marg = aggregate_metric(frame, "Margin")
        ratio = aggregate_metric(frame, "Ratio")
        rows.extend([
            {"Metric": "Revenue",        "YearLabel": label, "Value": rev},
            {"Metric": "Profit",         "YearLabel": label, "Value": prof},
            {"Metric": "Margin %",       "YearLabel": label, "Value": marg},
            {"Metric": "P/Cost Ratio %", "YearLabel": label, "Value": ratio},
            {"Metric": "Orders",         "YearLabel": label, "Value": len(frame)},
        ])
    plot_df = pd.DataFrame(rows)
    fig = px.bar(
        plot_df, x="Metric", y="Value", color="YearLabel", barmode="group",
        category_orders={"YearLabel": ["Last Year", "This Year"]},
        color_discrete_map={"This Year": THIS_COLOR, "Last Year": LAST_COLOR},
    )
    return apply_layout(fig, title=title)


# ---------------------------------------------------------------------------
# Tables (returned as plain dataframes; Streamlit renders with st.dataframe)
# ---------------------------------------------------------------------------

def affiliate_leaderboard(df):
    """One row per affiliate with this-year, last-year, and YoY columns."""
    out = []
    for name in sorted(df["CompanyName"].dropna().unique()):
        sub = df[df["CompanyName"] == name]
        ty = sub[sub["YearLabel"] == "This Year"]
        ly = sub[sub["YearLabel"] == "Last Year"]
        ty_rev = ty["SaleTotal"].sum()
        ly_rev = ly["SaleTotal"].sum()
        ty_prof = ty["Profit"].sum()
        ly_prof = ly["Profit"].sum()
        ty_marg = (ty_prof / ty_rev * 100) if ty_rev else 0
        ly_marg = (ly_prof / ly_rev * 100) if ly_rev else 0
        rev_yoy = ((ty_rev - ly_rev) / ly_rev * 100) if ly_rev else None
        out.append({
            "Affiliate": name,
            "Revenue (This)": round(ty_rev, 2),
            "Revenue (Last)": round(ly_rev, 2),
            "Revenue YoY %": round(rev_yoy, 1) if rev_yoy is not None else None,
            "Profit (This)": round(ty_prof, 2),
            "Profit (Last)": round(ly_prof, 2),
            "Margin % (This)": round(ty_marg, 1),
            "Margin % (Last)": round(ly_marg, 1),
            "Orders (This)": len(ty),
            "Orders (Last)": len(ly),
        })
    return pd.DataFrame(out).sort_values("Revenue (This)", ascending=False)


def team_performance_table(df):
    """Backwards-compat alias of team_breakdown_table."""
    return team_breakdown_table(df)


def team_breakdown_table(df):
    """
    One row per home team. For each team: revenue, profit, margin,
    P/cost ratio, average order, order count, ticket count, plus the
    best- and worst-performing affiliate by profit on that team.
    """
    rows = []
    for team in sorted(df["HomeTeam"].dropna().unique()):
        sub = df[df["HomeTeam"] == team]
        if len(sub) == 0:
            continue
        rev = aggregate_metric(sub, "SaleTotal")
        prof = aggregate_metric(sub, "Profit")
        marg = aggregate_metric(sub, "Margin")
        ratio = aggregate_metric(sub, "Ratio")
        by_aff = sub.groupby("CompanyName")["Profit"].sum().sort_values(ascending=False)
        top_aff = by_aff.index[0] if len(by_aff) else None
        worst_aff = by_aff.index[-1] if len(by_aff) > 1 else None
        sport = sub["Sport"].mode().iloc[0] if len(sub) else None
        rows.append({
            "Team": team, "Sport": sport,
            "Revenue": round(rev, 2),
            "Profit": round(prof, 2),
            "Margin %": round(marg, 1),
            "P/Cost Ratio %": round(ratio, 1),
            "Avg Order": round(rev / len(sub), 2) if len(sub) else 0,
            "Orders": len(sub),
            "Tickets": int(sub["TicketsSold"].sum()) if "TicketsSold" in sub.columns else 0,
            "Top Affiliate": top_aff,
            "Worst Affiliate": worst_aff,
        })
    return pd.DataFrame(rows).sort_values("Profit", ascending=False).reset_index(drop=True)


def top_events_table(df, n=25, by="Profit"):
    """Backwards-compat: returns event_rollup_table sliced to top n by `by`."""
    out = event_rollup_table(df).sort_values(by, ascending=False).head(n)
    return out


def event_rollup_table(df):
    """
    Per-event rollup with all four metrics. One row per (event, venue, date).
    Used by the Top Events page so the rank-by toggle can pick any metric
    without the table needing to be recomputed.
    """
    grouped = (df.groupby(["EventName", "VenueName", "EventDate_dt"])
               .agg(Revenue=("SaleTotal", "sum"),
                    Cost=("TicketCost", "sum"),
                    Profit=("Profit", "sum"),
                    Orders=("InvoiceID", "count"),
                    Tickets=("TicketsSold", "sum"))
               .reset_index())
    grouped["Margin %"] = np.where(
        grouped["Revenue"] > 0,
        (grouped["Profit"] / grouped["Revenue"] * 100).round(1),
        0,
    )
    grouped["P/Cost Ratio %"] = np.where(
        grouped["Cost"] > 0,
        (grouped["Profit"] / grouped["Cost"] * 100).round(1),
        0,
    )
    grouped["Revenue"] = grouped["Revenue"].round(2)
    grouped["Profit"] = grouped["Profit"].round(2)
    grouped["Cost"] = grouped["Cost"].round(2)
    return grouped


def affiliate_x_sport_table(df):
    """Affiliate by sport — revenue and margin."""
    pivot_rev = df.pivot_table(index="CompanyName", columns="Sport",
                               values="SaleTotal", aggfunc="sum", fill_value=0)
    pivot_prof = df.pivot_table(index="CompanyName", columns="Sport",
                                values="Profit", aggfunc="sum", fill_value=0)
    out = pivot_rev.copy()
    for sp in pivot_rev.columns:
        out[f"{sp} Margin %"] = np.where(
            pivot_rev[sp] > 0,
            (pivot_prof[sp] / pivot_rev[sp] * 100).round(1),
            0,
        )
    return out.round(2).reset_index()


# ---------------------------------------------------------------------------
# Styled-table helpers — all data tables in expanders go through these
# ---------------------------------------------------------------------------

def style_table(df, money_cols=(), pct_cols=(), int_cols=(),
                good_high_cols=(), good_low_cols=(), pct_change_cols=()):
    """
    Build a Styler with professional formatting and outlier-resistant gradients.

    Color rules:
      - money_cols, pct_cols, good_high_cols  → red-yellow-green (high = green)
      - good_low_cols                          → green-yellow-red (low = green)
                                                 (use for "loss orders", etc.)
      - pct_change_cols                        → diverging, symmetric around 0
                                                 (positive = green, negative = red)

    Outlier resistance: every gradient is clipped to the 10th–90th percentile
    of the column, so a single huge value can't crush the rest of the scale.

    Format rules (na_rep='—' on all):
      - money_cols      → $1,234
      - pct_cols        → 12.3%
      - int_cols        → 1,234
      - pct_change_cols → +12.3%

    Returns a pandas Styler — pass to st.dataframe directly.
    """
    fmt = {}
    for c in money_cols:
        if c in df.columns:
            fmt[c] = "${:,.0f}"
    for c in pct_cols:
        if c in df.columns:
            fmt[c] = "{:.1f}%"
    for c in int_cols:
        if c in df.columns:
            fmt[c] = "{:,.0f}"
    for c in pct_change_cols:
        if c in df.columns:
            fmt[c] = "{:+.1f}%"

    styler = df.style.format(fmt, na_rep="—") if fmt else df.style.format(na_rep="—")

    # Outlier-resistant range from 10th-90th percentile of finite values.
    def robust_range(col):
        vals = pd.to_numeric(df[col], errors="coerce").replace(
            [np.inf, -np.inf], np.nan).dropna()
        if len(vals) < 2:
            return None, None
        lo, hi = vals.quantile(0.10), vals.quantile(0.90)
        if lo == hi:
            return None, None
        return lo, hi

    high_good = list(money_cols) + list(pct_cols) + list(good_high_cols)
    for c in high_good:
        if c not in df.columns:
            continue
        lo, hi = robust_range(c)
        if lo is None:
            continue
        styler = styler.background_gradient(cmap="RdYlGn", subset=[c],
                                            vmin=lo, vmax=hi)

    for c in good_low_cols:
        if c not in df.columns:
            continue
        lo, hi = robust_range(c)
        if lo is None:
            continue
        styler = styler.background_gradient(cmap="RdYlGn_r", subset=[c],
                                            vmin=lo, vmax=hi)

    # Diverging colormap centered on zero for YoY %
    for c in pct_change_cols:
        if c not in df.columns:
            continue
        vals = pd.to_numeric(df[c], errors="coerce").replace(
            [np.inf, -np.inf], np.nan).dropna()
        if len(vals) < 2:
            continue
        bound = vals.abs().quantile(0.90)
        if bound == 0 or pd.isna(bound):
            continue
        styler = styler.background_gradient(cmap="RdYlGn", subset=[c],
                                            vmin=-bound, vmax=bound)

    return styler


# ---- Analysis-table builders --------------------------------------------
# These return raw DataFrames; pages then style them with style_table()
# inside an expander.

def groupby_yoy_table(df, group_col, top_n=None, sort_by="Revenue (TY)"):
    """
    Generic YoY breakdown table. One row per value of `group_col`, with
    columns for every metric the dashboard tracks (revenue / profit / margin
    / profit-cost ratio) for both years plus YoY % deltas. Reused by Sport,
    Marketplace, Tier, State, etc.
    """
    rows = []
    for name in sorted([n for n in df[group_col].dropna().unique()]):
        sub = df[df[group_col] == name]
        ty = sub[sub["YearLabel"] == "This Year"]
        ly = sub[sub["YearLabel"] == "Last Year"]
        ty_rev = aggregate_metric(ty, "SaleTotal")
        ly_rev = aggregate_metric(ly, "SaleTotal")
        ty_prof = aggregate_metric(ty, "Profit")
        ly_prof = aggregate_metric(ly, "Profit")
        ty_marg = aggregate_metric(ty, "Margin")
        ly_marg = aggregate_metric(ly, "Margin")
        ty_ratio = aggregate_metric(ty, "Ratio")
        ly_ratio = aggregate_metric(ly, "Ratio")
        rev_yoy = ((ty_rev - ly_rev) / ly_rev * 100) if ly_rev > 0 else None
        prof_yoy = ((ty_prof - ly_prof) / abs(ly_prof) * 100) if ly_prof != 0 else None
        rows.append({
            group_col: name,
            "Revenue (TY)": round(ty_rev, 2),
            "Revenue (LY)": round(ly_rev, 2),
            "Revenue YoY %": round(rev_yoy, 1) if rev_yoy is not None else None,
            "Profit (TY)": round(ty_prof, 2),
            "Profit (LY)": round(ly_prof, 2),
            "Profit YoY %": round(prof_yoy, 1) if prof_yoy is not None else None,
            "Margin % (TY)": round(ty_marg, 1),
            "Margin % (LY)": round(ly_marg, 1),
            "P/Cost Ratio % (TY)": round(ty_ratio, 1),
            "P/Cost Ratio % (LY)": round(ly_ratio, 1),
            "Orders (TY)": len(ty),
            "Orders (LY)": len(ly),
        })
    out = pd.DataFrame(rows).sort_values(sort_by, ascending=False)
    if top_n:
        out = out.head(top_n)
    return out.reset_index(drop=True)


def monthly_kpi_table(df):
    """
    Per-month rollup, chronological — earliest month in the data first,
    most recent last (Oct 24, Nov 24, Dec 24, Jan 25, …). Each row is one
    year-month with revenue, profit, margin, ratio, and order count, plus
    a YoY column comparing each month to the same calendar month a year
    earlier when present.
    """
    work = df.dropna(subset=["SellDate_dt"]).copy()
    if len(work) == 0:
        return pd.DataFrame()
    work["YearMonth"] = work["SellDate_dt"].dt.to_period("M")
    periods = sorted(work["YearMonth"].unique())

    # Pre-aggregate per period for revenue YoY (find same calendar month
    # one year prior).
    per_period_rev = {p: aggregate_metric(work[work["YearMonth"] == p], "SaleTotal")
                      for p in periods}

    rows = []
    for p in periods:
        sub = work[work["YearMonth"] == p]
        rev = aggregate_metric(sub, "SaleTotal")
        prof = aggregate_metric(sub, "Profit")
        marg = aggregate_metric(sub, "Margin")
        ratio = aggregate_metric(sub, "Ratio")

        # YoY: same month one year earlier, if it exists
        prior = p - 12  # Period arithmetic — back 12 months
        prior_rev = per_period_rev.get(prior)
        rev_yoy = None
        if prior_rev is not None and prior_rev > 0:
            rev_yoy = (rev - prior_rev) / prior_rev * 100

        rows.append({
            "Month": p.strftime("%b %y"),
            "Revenue": round(rev, 2),
            "Profit": round(prof, 2),
            "Margin %": round(marg, 1),
            "P/Cost Ratio %": round(ratio, 1),
            "Orders": len(sub),
            "Revenue YoY %": round(rev_yoy, 1) if rev_yoy is not None else None,
        })
    return pd.DataFrame(rows)


def head_to_head_table(df, name_a, name_b):
    """One row per metric, two columns for the two affiliates plus delta."""
    def kpi_for(name):
        sub = df[(df["CompanyName"] == name) & (df["YearLabel"] == "This Year")]
        rev = sub["SaleTotal"].sum()
        prof = sub["Profit"].sum()
        marg = (prof / rev * 100) if rev > 0 else 0
        avg = sub["SaleTotal"].mean() if len(sub) else 0
        loss_share = (sub["Profit"] < 0).mean() * 100 if len(sub) else 0
        return {"Revenue": rev, "Profit": prof, "Margin %": marg,
                "Orders": len(sub), "Avg Order $": avg,
                "Loss-order %": loss_share}
    a = kpi_for(name_a)
    b = kpi_for(name_b)
    rows = []
    for metric in a:
        delta = a[metric] - b[metric]
        rows.append({
            "Metric": metric,
            name_a: round(a[metric], 2),
            name_b: round(b[metric], 2),
            "Δ (A − B)": round(delta, 2),
        })
    return pd.DataFrame(rows)


def margin_summary_table(df, group_col):
    """Per-group margin distribution stats — median, p25, p75, loss share."""
    rows = []
    for name in sorted([n for n in df[group_col].dropna().unique()]):
        sub = df[df[group_col] == name]
        if len(sub) == 0:
            continue
        margins = sub["ProfitMargin"].dropna()
        rev = sub["SaleTotal"].sum()
        rows.append({
            group_col: name,
            "Revenue": round(rev, 2),
            "Median Margin %": round(margins.median(), 1) if len(margins) else 0,
            "P25 Margin %": round(margins.quantile(0.25), 1) if len(margins) else 0,
            "P75 Margin %": round(margins.quantile(0.75), 1) if len(margins) else 0,
            "Loss Orders": int((sub["Profit"] < 0).sum()),
            "Loss-order %": round((sub["Profit"] < 0).mean() * 100, 1),
            "Orders": len(sub),
        })
    return (pd.DataFrame(rows).sort_values("Revenue", ascending=False)
            .reset_index(drop=True))


def state_yoy_table(df):
    """
    Per-state combined table: this year, last year, and YoY columns in a
    single frame. Used by the Geographic page to replace the old leaderboard
    + separate YoY-expander combo with one consolidated table sitting under
    the maps. Sorted by this-year revenue, descending.
    """
    work = df.dropna(subset=["State"])
    rows = []
    for state in sorted(work["State"].dropna().unique()):
        sub = work[work["State"] == state]
        ty = sub[sub["YearLabel"] == "This Year"]
        ly = sub[sub["YearLabel"] == "Last Year"]
        ty_rev, ly_rev = ty["SaleTotal"].sum(), ly["SaleTotal"].sum()
        ty_prof, ly_prof = ty["Profit"].sum(), ly["Profit"].sum()
        ty_marg = (ty_prof / ty_rev * 100) if ty_rev > 0 else 0
        ly_marg = (ly_prof / ly_rev * 100) if ly_rev > 0 else 0
        rev_yoy = ((ty_rev - ly_rev) / ly_rev * 100) if ly_rev > 0 else None
        prof_yoy = ((ty_prof - ly_prof) / abs(ly_prof) * 100) if ly_prof != 0 else None
        rows.append({
            "State": state,
            "Revenue (TY)": round(ty_rev, 2),
            "Revenue (LY)": round(ly_rev, 2),
            "Revenue YoY %": round(rev_yoy, 1) if rev_yoy is not None else None,
            "Profit (TY)": round(ty_prof, 2),
            "Profit (LY)": round(ly_prof, 2),
            "Profit YoY %": round(prof_yoy, 1) if prof_yoy is not None else None,
            "Margin % (TY)": round(ty_marg, 1),
            "Margin % (LY)": round(ly_marg, 1),
            "Orders (TY)": len(ty),
            "Orders (LY)": len(ly),
        })
    return (pd.DataFrame(rows).sort_values("Revenue (TY)", ascending=False)
            .reset_index(drop=True))


def time_pivot_table(df, value_col="SaleTotal"):
    """Day-of-week × hour-of-day pivot — mirror of the heatmap."""
    days_order = ["Monday", "Tuesday", "Wednesday", "Thursday",
                  "Friday", "Saturday", "Sunday"]
    pivot = df.pivot_table(index="SellDayOfWeek", columns="SellHour",
                           values=value_col, aggfunc="sum", fill_value=0)
    pivot = pivot.reindex(days_order).round(0)
    return pivot
