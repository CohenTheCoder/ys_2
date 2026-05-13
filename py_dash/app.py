"""
app.py
------
Streamlit dashboard. Run with:

    streamlit run app.py

Sidebar offers a page picker plus two global filters (Affiliate and Sport)
that apply to every page. Pages with their own pickers (Affiliate Performance,
Head-to-Head, Team Performance) override the sidebar where appropriate.

Plain functions, no classes, no leading underscores, no render_* wrappers
beyond the existing render_kpi_row helper.
"""

import os
import streamlit as st
import pandas as pd
import numpy as np

import cleaner
import viz


# ---------------------------------------------------------------------------
# App config — wide layout, sidebar pinned open, sensible page title
# ---------------------------------------------------------------------------

st.set_page_config(
    page_title="Ticket Sales Dashboard",
    page_icon="🎟️",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""
<style>
    [data-testid="stMetric"] {
        background-color: #F8FAFC;
        border: 1px solid #E2E8F0;
        padding: 14px 18px;
        border-radius: 8px;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }
    [data-testid="stMetricLabel"] {
        font-weight: 600; color: #475569; font-size: 0.82rem;
        text-transform: uppercase; letter-spacing: 0.04em;
    }
    [data-testid="stMetricValue"] {
        font-size: 1.7rem; font-weight: 700; color: #0F172A;
    }
    .page-header {
        border-left: 5px solid #2E86DE;
        padding: 4px 0 4px 16px;
        margin: 4px 0 18px 0;
    }
    .page-header h1 {
        margin: 0; color: #0F172A; font-size: 1.85rem; font-weight: 700;
    }
    .page-header p {
        margin: 4px 0 0 0; color: #64748B; font-size: 0.95rem;
    }
    [data-testid="stSidebar"] {
        background-color: #FAFBFC; border-right: 1px solid #E2E8F0;
    }
    [data-testid="stExpander"] {
        border: 1px solid #E2E8F0; border-radius: 8px; margin-top: 16px;
    }
    [data-testid="stDataFrame"] { border-radius: 6px; }
</style>
""", unsafe_allow_html=True)


def page_header(icon, title, subtitle=""):
    sub_html = f"<p>{subtitle}</p>" if subtitle else ""
    st.markdown(
        f'<div class="page-header"><h1>{icon}&nbsp;&nbsp;{title}</h1>{sub_html}</div>',
        unsafe_allow_html=True,
    )


def data_table_expander(label="📋 View as data table"):
    return st.expander(label, expanded=False)


# ---------------------------------------------------------------------------
# Cached data load. Paths use os.path.join so it works on Windows (where the
# user plans to run) and Mac/Linux without changes.
# ---------------------------------------------------------------------------

@st.cache_data(show_spinner="Loading and enriching data...")
def cached_load(this_path, last_path):
    return cleaner.load_combined(this_path, last_path)


HERE = os.path.dirname(os.path.abspath(__file__))
THIS_PATH = os.path.join(HERE, "data", "current_year.csv")
LAST_PATH = os.path.join(HERE, "data", "last_year.csv")

df = cached_load(THIS_PATH, LAST_PATH)


# ---------------------------------------------------------------------------
# KPI rendering
# ---------------------------------------------------------------------------

def fmt_money(x):
    if pd.isna(x):
        return "—"
    return f"${x:,.0f}"


def fmt_pct(x):
    if x is None or pd.isna(x):
        return "—"
    return f"{x:+.1f}%"


def render_kpi_row(this_kpi, last_kpi):
    """Five headline cards: Revenue, Profit, Margin, Orders, Tickets."""
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Revenue", fmt_money(this_kpi["revenue"]),
              fmt_pct(cleaner.yoy_delta(this_kpi["revenue"], last_kpi["revenue"])))
    c2.metric("Profit", fmt_money(this_kpi["profit"]),
              fmt_pct(cleaner.yoy_delta(this_kpi["profit"], last_kpi["profit"])))
    c3.metric("Margin", f"{this_kpi['margin']:.1f}%",
              fmt_pct(this_kpi["margin"] - last_kpi["margin"]))
    c4.metric("Orders", f"{this_kpi['orders']:,}",
              fmt_pct(cleaner.yoy_delta(this_kpi["orders"], last_kpi["orders"])))
    c5.metric("Tickets Sold", f"{int(this_kpi['tickets']):,}",
              fmt_pct(cleaner.yoy_delta(this_kpi["tickets"], last_kpi["tickets"])))


# ---------------------------------------------------------------------------
# Universal metric picker. Used by every page that has a toggleable chart.
# Returns one of viz.METRIC_OPTIONS: "SaleTotal" / "Profit" / "Margin" / "Ratio"
# ---------------------------------------------------------------------------

def metric_picker(label="Metric", key=None, include_orders=False):
    options = list(viz.METRIC_OPTIONS)
    labels = {
        "SaleTotal": "Revenue",
        "Profit": "Profit",
        "Margin": "Profit Margin",
        "Ratio": "P/Cost Ratio",
    }
    if include_orders:
        options.append("Orders")
        labels["Orders"] = "Orders"
    return st.radio(
        label, options,
        format_func=lambda x: labels[x],
        horizontal=True, key=key,
    )


# ---------------------------------------------------------------------------
# Sidebar — page picker + Affiliate filter + Sport filter
# ---------------------------------------------------------------------------

st.sidebar.markdown("## 🎟️ Ticket Sales Dashboard")
st.sidebar.markdown("Pick a page below. Both filters apply globally.")

PAGE_META = [
    ("1. Executive Summary",        "📊", "Executive Summary",        "Top-line program performance with YoY deltas."),
    ("2. YoY Trend Analysis",       "📈", "YoY Trend Analysis",       "Pick any dimension and see how it's moving year over year."),
    ("3. Affiliate Performance",    "🎯", "Affiliate Performance",    "One affiliate vs portfolio average + year-over-year."),
    ("4. Affiliate Leaderboard",    "🏆", "Affiliate Leaderboard",    "Every affiliate, this vs last, sortable."),
    ("5. Affiliate Head-to-Head",   "⚔️", "Affiliate Head-to-Head",   "Pick two affiliates and compare side-by-side."),
    ("6. Sport Breakdown",          "🏟️", "Sport Breakdown",          "Sport mix and per-sport rollup."),
    ("7. Team Performance",         "🏅", "Team Performance",         "Per-team rollups with top & worst affiliate."),
    ("8. Marketplace & Channel",    "🛒", "Marketplace & Channel",    "Where tickets list and how they get delivered."),
    ("9. Profit Margin Deep Dive",  "💰", "Profit Margin Deep Dive",  "Margin distributions, loss orders, cost vs revenue."),
    ("10. Ticket Type & Inventory", "🎫", "Ticket Type & Inventory",  "Section tier, quantity bundles, raw type codes."),
    ("11. Geographic Map",          "🗺️", "Geographic View",          "US choropleth based on home-team state."),
    ("12. Heatmap Hub",             "🔥", "Heatmap Hub",              "Two-dimensional intensity views."),
    ("13. Time Patterns",           "⏰", "Time Patterns",            "When in the week sales actually happen + lead time."),
    ("14. Top Events",              "⭐", "Top Events",               "Highest- and lowest-performing events."),
    ("15. Risk & Delivery",         "⚠️", "Risk & Delivery",          "Delivery rate, undelivered, cancellations."),
]
PAGES = [p[0] for p in PAGE_META]
page = st.sidebar.radio("Page", PAGES, label_visibility="collapsed")

st.sidebar.markdown("---")
st.sidebar.markdown("**Global filters**")

affiliate_options = cleaner.affiliate_list(df)
chosen_affiliate = st.sidebar.selectbox(
    "Affiliate", affiliate_options, index=0,
)

all_sports = sorted([s for s in df["Sport"].dropna().unique()])
chosen_sports = st.sidebar.multiselect(
    "Sports (leave all selected for no filter)",
    all_sports, default=all_sports,
)

# Apply filters in order: affiliate first, then sport
fdf = df.copy()
if chosen_affiliate != "All Affiliates":
    fdf = fdf[fdf["CompanyName"] == chosen_affiliate]
if chosen_sports and len(chosen_sports) < len(all_sports):
    fdf = fdf[fdf["Sport"].isin(chosen_sports)]

this_df, last_df = cleaner.split_years(fdf)
this_kpi = cleaner.kpi_block(this_df)
last_kpi = cleaner.kpi_block(last_df)


# ---------------------------------------------------------------------------
# Page 1 — Executive Summary
# ---------------------------------------------------------------------------

def page_executive_summary():
    page_header("📊", "Executive Summary",
                f"Top-line view of program performance with YoY deltas. "
                f"Scope: <b>{chosen_affiliate}</b>.")
    render_kpi_row(this_kpi, last_kpi)

    st.markdown("---")
    st.markdown("### Monthly trend")
    st.markdown("*Months are ordered from the earliest in your data to the "
                "latest — so a fiscal year spanning Oct → Sep reads left to "
                "right naturally.*")
    metric = metric_picker("Trend metric", key="exec_trend_metric")
    st.plotly_chart(viz.monthly_trend(fdf, metric), use_container_width=True)

    with data_table_expander():
        st.markdown(
            "Per-affiliate YoY breakdown across all four metrics."
        )
        table = viz.groupby_yoy_table(df, "CompanyName")
        st.dataframe(
            viz.style_table(
                table,
                money_cols=["Revenue (TY)", "Revenue (LY)", "Profit (TY)", "Profit (LY)"],
                pct_cols=["Margin % (TY)", "Margin % (LY)",
                          "P/Cost Ratio % (TY)", "P/Cost Ratio % (LY)"],
                int_cols=["Orders (TY)", "Orders (LY)"],
                pct_change_cols=["Revenue YoY %", "Profit YoY %"],
            ),
            use_container_width=True, height=460,
        )


# ---------------------------------------------------------------------------
# Page 2 — YoY Trend Analysis
# This page is the universal "YoY by [dimension]" view. It absorbs what used
# to be standalone YoY-by-Sport, YoY-by-Marketplace, YoY-by-Affiliate,
# YoY-by-Tier, YoY-by-LeadTime charts on other pages — all collapsed into
# one chart driven by a dimension picker + metric toggle. No more repeats.
# ---------------------------------------------------------------------------

YOY_DIMENSION_OPTIONS = [
    ("Sport", "Sport"),
    ("Marketplace", "ShippingCompany"),
    ("Marketplace tier", "MarketplaceTier"),
    ("Affiliate", "CompanyName"),
    ("Section tier (numeric)", "SectionNumTier"),
    ("Section type (premium/lot/etc.)", "SectionTypeTier"),
    ("Quantity bucket", "QuantityBucket"),
    ("Delivery type", "DeliveryType"),
    ("Lead time bucket", "LeadTimeBucket"),
    ("State", "State"),
]


def page_yoy_trends():
    page_header("📈", "YoY Trend Analysis",
                "Pick any dimension and metric to see this year vs last "
                "year. This is the one page where every YoY-by-X comparison "
                "lives — keeps the rest of the dashboard free of repeats.")
    render_kpi_row(this_kpi, last_kpi)

    st.markdown("---")
    col1, col2 = st.columns([2, 3])
    with col1:
        dim_label = st.selectbox(
            "Dimension",
            [d[0] for d in YOY_DIMENSION_OPTIONS],
            index=0, key="yoy_dim",
        )
    with col2:
        metric = metric_picker("Metric", key="yoy_metric")

    dim_col = dict(YOY_DIMENSION_OPTIONS)[dim_label]

    high_cardinality = dim_col in ("CompanyName", "State")
    top_n = 25 if high_cardinality else None

    st.plotly_chart(
        viz.yoy_bar_compare(fdf, dim_col, metric=metric, top_n=top_n),
        use_container_width=True,
    )

    with data_table_expander():
        st.markdown(f"Full YoY table for **{dim_label}**.")
        t = viz.groupby_yoy_table(fdf, dim_col)
        st.dataframe(
            viz.style_table(
                t,
                money_cols=["Revenue (TY)", "Revenue (LY)", "Profit (TY)", "Profit (LY)"],
                pct_cols=["Margin % (TY)", "Margin % (LY)",
                          "P/Cost Ratio % (TY)", "P/Cost Ratio % (LY)"],
                int_cols=["Orders (TY)", "Orders (LY)"],
                pct_change_cols=["Revenue YoY %", "Profit YoY %"],
            ),
            use_container_width=True, height=460,
        )

    with st.expander("📅 Monthly KPI table (chronological)", expanded=False):
        st.markdown("One row per year-month, ordered earliest-to-latest. All "
                    "four metrics plus a YoY column comparing each month to "
                    "the same calendar month a year earlier (when present).")
        mt = viz.monthly_kpi_table(fdf)
        st.dataframe(
            viz.style_table(
                mt,
                money_cols=["Revenue", "Profit"],
                pct_cols=["Margin %", "P/Cost Ratio %"],
                int_cols=["Orders"],
                pct_change_cols=["Revenue YoY %"],
            ),
            use_container_width=True, height=460,
        )


# ---------------------------------------------------------------------------
# Page 3 — Affiliate Performance
# Scoped to ONE affiliate via local picker. The pies / monthly trend on this
# page are at single-affiliate scope, which is a different question from
# the portfolio-scope pies elsewhere — so not chart repeats.
# ---------------------------------------------------------------------------

def page_affiliate_performance():
    page_header("🎯", "Affiliate Performance",
                "Drill into one affiliate's contribution and how they're "
                "trending. The picker here overrides the sidebar.")

    aff_options = [a for a in cleaner.affiliate_list(df) if a != "All Affiliates"]
    selected = st.selectbox("Affiliate", aff_options, index=0)
    aff_df = df[df["CompanyName"] == selected]
    aff_this, aff_last = cleaner.split_years(aff_df)
    render_kpi_row(cleaner.kpi_block(aff_this), cleaner.kpi_block(aff_last))

    st.markdown("---")
    st.markdown("### vs Portfolio average")
    st.plotly_chart(
        viz.affiliate_vs_portfolio_bars(df, selected),
        use_container_width=True,
    )

    st.markdown("### Year-over-year")
    st.plotly_chart(
        viz.affiliate_yoy_bars(aff_df),
        use_container_width=True,
    )

    st.markdown("---")
    st.markdown(f"### Monthly trend — {selected}")
    aff_metric = metric_picker("Trend metric", key="aff_trend_metric")
    st.plotly_chart(viz.monthly_trend(aff_df, aff_metric), use_container_width=True)

    st.markdown("---")
    col1, col2 = st.columns(2)
    with col1:
        st.markdown(f"### Sport mix — {selected} (TY)")
        st.plotly_chart(viz.revenue_pie(aff_this, "Sport"),
                        use_container_width=True)
    with col2:
        st.markdown(f"### Marketplace mix — {selected} (TY)")
        st.plotly_chart(viz.revenue_pie(aff_this, "ShippingCompany"),
                        use_container_width=True)

    with data_table_expander():
        t = viz.groupby_yoy_table(aff_df, "Sport")
        st.dataframe(
            viz.style_table(
                t,
                money_cols=["Revenue (TY)", "Revenue (LY)", "Profit (TY)", "Profit (LY)"],
                pct_cols=["Margin % (TY)", "Margin % (LY)",
                          "P/Cost Ratio % (TY)", "P/Cost Ratio % (LY)"],
                int_cols=["Orders (TY)", "Orders (LY)"],
                pct_change_cols=["Revenue YoY %", "Profit YoY %"],
            ),
            use_container_width=True,
        )


# ---------------------------------------------------------------------------
# Page 4 — Affiliate Leaderboard
# Just the table now. Visual rankings live on the YoY Trends page (set
# dimension = Affiliate) — keeps us from repeating a YoY-by-Affiliate chart.
# ---------------------------------------------------------------------------

def page_affiliate_leaderboard():
    page_header("🏆", "Affiliate Leaderboard",
                "Every affiliate in one sortable table. For visual ranking "
                "see the YoY Trend Analysis page with dimension = Affiliate.")

    table = viz.groupby_yoy_table(df, "CompanyName")
    st.markdown(f"**{len(table)} affiliates** in scope. Click any column "
                "header to sort.")
    st.dataframe(
        viz.style_table(
            table,
            money_cols=["Revenue (TY)", "Revenue (LY)", "Profit (TY)", "Profit (LY)"],
            pct_cols=["Margin % (TY)", "Margin % (LY)",
                      "P/Cost Ratio % (TY)", "P/Cost Ratio % (LY)"],
            int_cols=["Orders (TY)", "Orders (LY)"],
            pct_change_cols=["Revenue YoY %", "Profit YoY %"],
        ),
        use_container_width=True, height=600,
    )


# ---------------------------------------------------------------------------
# Page 5 — Head-to-Head
# Two affiliate pickers, KPIs each, ONE consolidated YoY chart with metric
# toggle (was two), per-affiliate sport pies (different scope each).
# ---------------------------------------------------------------------------

def page_head_to_head():
    page_header("⚔️", "Affiliate Head-to-Head",
                "Pick two affiliates. KPIs side-by-side, plus a YoY "
                "comparison chart you can flip across all four metrics.")

    aff_options = [a for a in cleaner.affiliate_list(df) if a != "All Affiliates"]
    if len(aff_options) < 2:
        st.warning("Need at least two affiliates in the data.")
        return

    col1, col2 = st.columns(2)
    with col1:
        a = st.selectbox("Affiliate A", aff_options, index=0)
    with col2:
        b_options = [x for x in aff_options if x != a]
        b = st.selectbox("Affiliate B", b_options, index=0)

    pair_df = df[df["CompanyName"].isin([a, b])]
    a_df, b_df = df[df["CompanyName"] == a], df[df["CompanyName"] == b]
    a_this, a_last = cleaner.split_years(a_df)
    b_this, b_last = cleaner.split_years(b_df)

    st.markdown(f"#### {a}")
    render_kpi_row(cleaner.kpi_block(a_this), cleaner.kpi_block(a_last))
    st.markdown(f"#### {b}")
    render_kpi_row(cleaner.kpi_block(b_this), cleaner.kpi_block(b_last))

    st.markdown("---")
    st.markdown("### YoY comparison")
    h2h_metric = metric_picker("Metric", key="h2h_metric")
    st.plotly_chart(
        viz.yoy_bar_compare(pair_df, "CompanyName", metric=h2h_metric),
        use_container_width=True,
    )

    st.markdown("---")
    pcol1, pcol2 = st.columns(2)
    with pcol1:
        st.markdown(f"### {a} — sport mix (TY)")
        st.plotly_chart(viz.revenue_pie(a_this, "Sport"),
                        use_container_width=True)
    with pcol2:
        st.markdown(f"### {b} — sport mix (TY)")
        st.plotly_chart(viz.revenue_pie(b_this, "Sport"),
                        use_container_width=True)

    with data_table_expander("📋 Side-by-side breakdown"):
        st.dataframe(
            viz.head_to_head_table(df, a, b),
            use_container_width=True,
        )


# ---------------------------------------------------------------------------
# Page 6 — Sport Breakdown
# Two pies (Revenue share + Order share — different metrics on the same dim,
# complementary not redundant). YoY-by-Sport bars and Margin-by-Sport box
# moved out (to YoY Trends and Margin Deep Dive respectively) to avoid
# repeats.
# ---------------------------------------------------------------------------

def page_sport_breakdown():
    page_header("🏟️", "Sport Breakdown",
                "Sport mix this year + per-sport rollup. For YoY swings by "
                "sport see YoY Trend Analysis (dimension = Sport); for "
                "margin distributions see Margin Deep Dive.")
    render_kpi_row(this_kpi, last_kpi)

    st.markdown("---")
    col1, col2 = st.columns(2)
    with col1:
        st.plotly_chart(
            viz.revenue_pie(this_df, "Sport", title="Revenue Share (This Year)"),
            use_container_width=True,
        )
    with col2:
        st.plotly_chart(
            viz.order_count_pie(this_df, "Sport", title="Order Share (This Year)"),
            use_container_width=True,
        )

    with data_table_expander():
        t = viz.groupby_yoy_table(fdf, "Sport")
        st.dataframe(
            viz.style_table(
                t,
                money_cols=["Revenue (TY)", "Revenue (LY)", "Profit (TY)", "Profit (LY)"],
                pct_cols=["Margin % (TY)", "Margin % (LY)",
                          "P/Cost Ratio % (TY)", "P/Cost Ratio % (LY)"],
                int_cols=["Orders (TY)", "Orders (LY)"],
                pct_change_cols=["Revenue YoY %", "Profit YoY %"],
            ),
            use_container_width=True,
        )


# ---------------------------------------------------------------------------
# Page 7 — Team Performance
# Sport multi-select + team table + top-N teams chart with metric toggle.
# Team chart stays here (rather than YoY Trends) because team count is
# typically too high for a generic dimension picker.
# ---------------------------------------------------------------------------

def page_team_performance():
    page_header("🏅", "Team Performance",
                "Per-team rollup with their best- and worst-performing "
                "affiliate. Filter by sport to focus on a league.")

    sport_choice = st.multiselect(
        "Filter by sport",
        all_sports, default=all_sports, key="team_sport",
    )
    work = fdf[fdf["Sport"].isin(sport_choice)] if sport_choice else fdf

    st.markdown("### Team rollup (This Year)")
    team_t = viz.team_breakdown_table(work)
    st.dataframe(
        viz.style_table(
            team_t,
            money_cols=["Revenue", "Profit", "Avg Order"],
            pct_cols=["Margin %"],
            int_cols=["Orders"],
        ),
        use_container_width=True, height=480,
    )

    st.markdown("---")
    st.markdown("### Top teams chart")
    team_metric = metric_picker("Metric", key="team_metric")
    top_n = st.slider("How many teams?", 5, 30, 20, key="team_topn")
    st.plotly_chart(
        viz.yoy_bar_compare(work, "HomeTeam", metric=team_metric, top_n=top_n),
        use_container_width=True,
    )


# ---------------------------------------------------------------------------
# Page 8 — Marketplace & Channel
# Marketplace pie + Delivery-type pie (different dims, complementary) +
# Margin-by-marketplace box (unique chart). YoY-by-marketplace moved to
# YoY Trends page.
# ---------------------------------------------------------------------------

def page_marketplace():
    page_header("🛒", "Marketplace & Channel",
                "Where the tickets list and how they get delivered. For "
                "YoY swings by marketplace, see YoY Trend Analysis "
                "(dimension = Marketplace).")

    col1, col2 = st.columns(2)
    with col1:
        st.markdown("### Revenue by marketplace (TY)")
        st.plotly_chart(viz.revenue_pie(this_df, "ShippingCompany"),
                        use_container_width=True)
    with col2:
        st.markdown("### Revenue by delivery type (TY)")
        st.plotly_chart(viz.revenue_pie(this_df, "DeliveryType"),
                        use_container_width=True)

    st.markdown("---")
    st.markdown("### Margin distribution by marketplace (TY)")
    st.plotly_chart(viz.margin_by_group_box(this_df, "ShippingCompany"),
                    use_container_width=True)

    with data_table_expander():
        t = viz.groupby_yoy_table(fdf, "ShippingCompany")
        st.dataframe(
            viz.style_table(
                t,
                money_cols=["Revenue (TY)", "Revenue (LY)", "Profit (TY)", "Profit (LY)"],
                pct_cols=["Margin % (TY)", "Margin % (LY)",
                          "P/Cost Ratio % (TY)", "P/Cost Ratio % (LY)"],
                int_cols=["Orders (TY)", "Orders (LY)"],
                pct_change_cols=["Revenue YoY %", "Profit YoY %"],
            ),
            use_container_width=True,
        )


# ---------------------------------------------------------------------------
# Page 9 — Profit Margin Deep Dive
# Histogram + scatter (both unique). Margin-by-group box now has a 4-way
# group toggle so margin slicing across multiple dimensions lives in one slot.
# ---------------------------------------------------------------------------

MARGIN_GROUP_OPTIONS = [
    ("Sport", "Sport"),
    ("Affiliate", "CompanyName"),
    ("Marketplace", "ShippingCompany"),
    ("Section tier", "SectionNumTier"),
]


def page_margin_deep_dive():
    page_header("💰", "Profit Margin Deep Dive",
                "Margin = (SaleTotal − TicketCost) / SaleTotal. The red "
                "dashed line on the histogram is break-even.")
    render_kpi_row(this_kpi, last_kpi)

    st.markdown("---")
    st.plotly_chart(viz.margin_histogram(fdf), use_container_width=True)

    available_groups = MARGIN_GROUP_OPTIONS
    if chosen_affiliate != "All Affiliates":
        available_groups = [g for g in MARGIN_GROUP_OPTIONS if g[1] != "CompanyName"]

    margin_group_label = st.radio(
        "Group margin by",
        [g[0] for g in available_groups],
        horizontal=True, key="margin_group",
    )
    margin_group_col = dict(available_groups)[margin_group_label]

    col1, col2 = st.columns(2)
    with col1:
        st.markdown("### Cost vs Revenue (TY)")
        st.plotly_chart(viz.cost_vs_revenue_scatter(this_df),
                        use_container_width=True)
    with col2:
        st.markdown(f"### Margin by {margin_group_label} (TY)")
        st.plotly_chart(viz.margin_by_group_box(this_df, margin_group_col),
                        use_container_width=True)

    st.markdown("---")
    st.markdown("### Loss-making orders")
    losses = (fdf[fdf["Profit"] < 0]
              .sort_values("Profit")
              .head(20)[["YearLabel", "CompanyName", "EventName", "VenueName",
                         "SaleTotal", "TicketCost", "Profit", "ProfitMargin",
                         "ShippingCompany"]]
              .rename(columns={
                  "YearLabel": "Year", "CompanyName": "Affiliate",
                  "EventName": "Event", "VenueName": "Venue",
                  "SaleTotal": "Revenue", "TicketCost": "Cost",
                  "ProfitMargin": "Margin %", "ShippingCompany": "Marketplace",
              })
              .round(2))
    st.dataframe(
        viz.style_table(
            losses,
            money_cols=["Revenue", "Cost", "Profit"],
            pct_cols=["Margin %"],
        ),
        use_container_width=True,
    )

    with data_table_expander("📋 Margin summary by group"):
        st.markdown("Distribution stats per group: median, p25, p75, and "
                    "loss-order share. Loss-order % is colored inversely "
                    "(high = red, since high loss share is bad).")
        col_a, col_b = st.columns(2)
        with col_a:
            st.markdown("**By Affiliate**")
            t1 = viz.margin_summary_table(this_df, "CompanyName")
            st.dataframe(viz.style_table(
                t1, money_cols=["Revenue"],
                pct_cols=["Median Margin %", "P25 Margin %", "P75 Margin %"],
                int_cols=["Loss Orders", "Orders"],
                good_low_cols=["Loss-order %"],
            ), use_container_width=True)
        with col_b:
            st.markdown("**By Sport**")
            t2 = viz.margin_summary_table(this_df, "Sport")
            st.dataframe(viz.style_table(
                t2, money_cols=["Revenue"],
                pct_cols=["Median Margin %", "P25 Margin %", "P75 Margin %"],
                int_cols=["Loss Orders", "Orders"],
                good_low_cols=["Loss-order %"],
            ), use_container_width=True)


# ---------------------------------------------------------------------------
# Page 10 — Ticket Type & Inventory
# Tier dim toggle + 2 pies (one per dim, with shared metric toggle) +
# margin-by-tier box. YoY-by-tier moved to YoY Trends page.
# ---------------------------------------------------------------------------

def page_ticket_type():
    page_header("🎫", "Ticket Type & Inventory",
                "The Section field gets split into a numeric component (bowl "
                "level) and an alpha component (VIP / Lot / Balcony). Toggle "
                "below to bucket either way.")

    tier_choice = st.radio(
        "Bucket sections by",
        ["Numeric tier (Lower / Mid / Upper / Floor)",
         "Type tier (VIP / Lot / Balcony / Lettered / Numeric)"],
        horizontal=True, key="tier_choice",
    )
    tier_col = ("SectionNumTier" if tier_choice.startswith("Numeric")
                else "SectionTypeTier")
    tier_label = "section tier" if tier_choice.startswith("Numeric") else "section type"

    pie_metric = metric_picker("Pie metric", key="ticket_pie_metric",
                               include_orders=True)

    def pie_for(group_col):
        if pie_metric == "Orders":
            return viz.order_count_pie(this_df, group_col)
        # Margin/Ratio pies don't make sense as "share of margin"; show
        # share-of-profit instead, which is the closest sensible analog.
        if pie_metric in ("Margin", "Ratio"):
            return viz.revenue_pie(this_df, group_col, metric="Profit")
        return viz.revenue_pie(this_df, group_col, metric=pie_metric)

    metric_label = {
        "SaleTotal": "Revenue", "Profit": "Profit",
        "Margin": "Profit (margin proxy)", "Ratio": "Profit (ratio proxy)",
        "Orders": "Orders",
    }[pie_metric]

    col1, col2 = st.columns(2)
    with col1:
        st.markdown(f"### {metric_label} by {tier_label} (TY)")
        st.plotly_chart(pie_for(tier_col), use_container_width=True)
    with col2:
        st.markdown(f"### {metric_label} by quantity bucket (TY)")
        st.plotly_chart(pie_for("QuantityBucket"), use_container_width=True)

    st.markdown(f"### Margin distribution by {tier_label} (TY)")
    st.plotly_chart(viz.margin_by_group_box(this_df, tier_col),
                    use_container_width=True)

    st.markdown("---")
    st.markdown("### Top Section Type codes (raw)")
    st.markdown("Direct from the regex extraction — useful for spotting "
                "venue-specific codes like *BAL*, *GOLD*, *LOTC*, *LOGE*.")
    type_breakdown = (this_df[this_df["Section_Type"] != ""]
                      .groupby("Section_Type")
                      .agg(Revenue=("SaleTotal", "sum"),
                           Profit=("Profit", "sum"),
                           Orders=("InvoiceID", "count"),
                           AvgMargin=("ProfitMargin", "mean"))
                      .reset_index()
                      .sort_values("Revenue", ascending=False)
                      .round(2))
    st.dataframe(
        viz.style_table(
            type_breakdown,
            money_cols=["Revenue", "Profit"],
            pct_cols=["AvgMargin"],
            int_cols=["Orders"],
        ),
        use_container_width=True, height=300,
    )

    with data_table_expander(f"📋 {tier_label.title()} YoY breakdown"):
        t = viz.groupby_yoy_table(fdf, tier_col)
        st.dataframe(
            viz.style_table(
                t,
                money_cols=["Revenue (TY)", "Revenue (LY)", "Profit (TY)", "Profit (LY)"],
                pct_cols=["Margin % (TY)", "Margin % (LY)",
                          "P/Cost Ratio % (TY)", "P/Cost Ratio % (LY)"],
                int_cols=["Orders (TY)", "Orders (LY)"],
                pct_change_cols=["Revenue YoY %", "Profit YoY %"],
            ),
            use_container_width=True,
        )


# ---------------------------------------------------------------------------
# Page 11 — Geographic Map
# Two maps (TY + LY) on a SHARED color scale + combined per-state YoY table.
# Uses the all-4-metrics framework so the choropleth can show any metric.
# ---------------------------------------------------------------------------

def page_geographic():
    page_header("🗺️", "Geographic View",
                "Choropleth based on the home team's state. Both maps use "
                "the same color scale, so the same value is the same shade "
                "across them — a $1M state on the right is the same color "
                "as a $1M state on the left.")

    metric = metric_picker("Map metric", key="geo_metric")
    z_range = viz.choropleth_shared_range([this_df, last_df], metric)

    col1, col2 = st.columns(2)
    with col1:
        st.markdown("### This Year")
        st.plotly_chart(viz.state_choropleth(this_df, metric, z_range=z_range),
                        use_container_width=True)
    with col2:
        st.markdown("### Last Year")
        st.plotly_chart(viz.state_choropleth(last_df, metric, z_range=z_range),
                        use_container_width=True)

    st.markdown("---")
    st.markdown("### State leaderboard — this vs last")
    state_table = viz.state_yoy_table(fdf)
    st.dataframe(
        viz.style_table(
            state_table,
            money_cols=["Revenue (TY)", "Revenue (LY)", "Profit (TY)", "Profit (LY)"],
            pct_cols=["Margin % (TY)", "Margin % (LY)"],
            int_cols=["Orders (TY)", "Orders (LY)"],
            pct_change_cols=["Revenue YoY %", "Profit YoY %"],
        ),
        use_container_width=True, height=480,
    )


# ---------------------------------------------------------------------------
# Page 12 — Heatmap Hub
# Three heatmaps with different col dimensions. One page-level metric toggle
# drives all three. The first two share a z-range for sum metrics so cells
# are directly comparable across the two charts.
# ---------------------------------------------------------------------------

def page_heatmap_hub():
    page_header("🔥", "Heatmap Hub",
                "Two-dimensional intensity views of the affiliate matrix. "
                "Color scale is blue throughout — red signals loss in this "
                "dashboard's vocabulary, so we don't use it. The sport and "
                "marketplace heatmaps share a z-range for sum metrics so "
                "cells are directly comparable across the two.")

    heat_metric = metric_picker("Metric", key="heatmap_metric")
    is_sum = heat_metric in ("SaleTotal", "Profit")

    # For sum metrics we pre-compute the two affiliate-row pivots and share
    # their color range across the first two heatmaps.
    if is_sum:
        col_a = "SaleTotal" if heat_metric == "SaleTotal" else "Profit"
        sport_pivot = (this_df.groupby(["CompanyName", "Sport"])[col_a]
                       .sum().unstack(fill_value=0))
        mkt_pivot = (this_df.groupby(["CompanyName", "MarketplaceTier"])[col_a]
                     .sum().unstack(fill_value=0))
        z_share = viz.shared_z_range([sport_pivot.values, mkt_pivot.values])
    else:
        z_share = None

    st.markdown("### Affiliate × Sport")
    st.plotly_chart(
        viz.heatmap_two_dim(this_df, "CompanyName", "Sport",
                            metric=heat_metric, z_range=z_share),
        use_container_width=True,
    )

    st.markdown("### Affiliate × Marketplace")
    st.plotly_chart(
        viz.heatmap_two_dim(this_df, "CompanyName", "MarketplaceTier",
                            metric=heat_metric, z_range=z_share),
        use_container_width=True,
    )

    st.markdown("### Affiliate × Top 15 Teams")
    st.plotly_chart(
        viz.heatmap_two_dim(this_df, "CompanyName", "HomeTeam",
                            metric=heat_metric, top_cols=15),
        use_container_width=True,
    )

    with data_table_expander("📋 Affiliate × Sport cross-tab"):
        st.markdown("Revenue and margin for every affiliate-sport "
                    "combination this year.")
        cross = viz.affiliate_x_sport_table(this_df)
        money_cols = [c for c in cross.columns
                      if c not in ("CompanyName",) and "Margin" not in c]
        margin_cols = [c for c in cross.columns if "Margin" in c]
        st.dataframe(
            viz.style_table(cross, money_cols=money_cols, pct_cols=margin_cols),
            use_container_width=True, height=460,
        )


# ---------------------------------------------------------------------------
# Page 13 — Time Patterns
# Day×Hour heatmap (with metric toggle) + lead-time histogram + margin by
# lead-time-bucket box. YoY-by-leadtime moved to YoY Trends page.
# ---------------------------------------------------------------------------

def page_time_patterns():
    page_header("⏰", "Time Patterns",
                "When in the week sales actually happen + how lead time "
                "affects margin. For YoY swings by lead-time bucket see "
                "YoY Trend Analysis (dimension = Lead time bucket).")

    st.markdown("### When sales happen")
    time_metric = metric_picker("Heatmap metric", key="time_heat_metric")
    st.plotly_chart(viz.day_hour_heatmap(fdf, metric=time_metric),
                    use_container_width=True)

    st.markdown("---")
    st.markdown("### Lead-time distribution")
    st.plotly_chart(viz.lead_time_histogram(fdf), use_container_width=True)

    st.markdown("### Margin by lead-time bucket (TY)")
    st.plotly_chart(viz.margin_by_group_box(this_df, "LeadTimeBucket"),
                    use_container_width=True)


# ---------------------------------------------------------------------------
# Page 14 — Top Events
# Rank toggle now includes all four metrics (plus Orders).
# ---------------------------------------------------------------------------

def page_top_events():
    page_header("⭐", "Top Events",
                "Highest-performing events on the metric of your choice, "
                "and the worst margin offenders.")

    rank_metric = metric_picker("Rank by", key="topevent_metric",
                                include_orders=True)
    top_n = st.slider("How many events?", 5, 50, 20, key="topevent_n")

    events = viz.event_rollup_table(fdf)

    metric_to_col = {
        "SaleTotal": "Revenue", "Profit": "Profit",
        "Margin": "Margin %", "Ratio": "P/Cost Ratio %",
        "Orders": "Orders",
    }
    sort_col = metric_to_col[rank_metric]
    if sort_col not in events.columns:
        st.warning(f"Column {sort_col} not available — using Profit.")
        sort_col = "Profit"

    top_events = events.sort_values(sort_col, ascending=False).head(top_n)
    st.markdown(f"### Top {top_n} events by {sort_col}")
    st.dataframe(
        viz.style_table(
            top_events,
            money_cols=[c for c in ["Revenue", "Profit"] if c in top_events.columns],
            pct_cols=[c for c in ["Margin %", "P/Cost Ratio %"] if c in top_events.columns],
            int_cols=[c for c in ["Orders"] if c in top_events.columns],
        ),
        use_container_width=True, height=520,
    )

    st.markdown("---")
    st.markdown("### Bottom 15 events by profit")
    bottom = events.sort_values("Profit").head(15)
    st.dataframe(
        viz.style_table(
            bottom,
            money_cols=[c for c in ["Revenue", "Profit"] if c in bottom.columns],
            pct_cols=[c for c in ["Margin %", "P/Cost Ratio %"] if c in bottom.columns],
            int_cols=[c for c in ["Orders"] if c in bottom.columns],
        ),
        use_container_width=True, height=420,
    )

    with data_table_expander("📋 Full event list"):
        st.dataframe(
            viz.style_table(
                events,
                money_cols=[c for c in ["Revenue", "Profit"] if c in events.columns],
                pct_cols=[c for c in ["Margin %", "P/Cost Ratio %"] if c in events.columns],
                int_cols=[c for c in ["Orders"] if c in events.columns],
            ),
            use_container_width=True, height=560,
        )


# ---------------------------------------------------------------------------
# Page 15 — Risk & Delivery
# KPI cards + targeted tables. No charts (operational page; tables answer
# the questions better than visualizations would).
# ---------------------------------------------------------------------------

def page_risk_delivery():
    page_header("⚠️", "Risk & Delivery",
                "Delivery rate, undelivered orders, cancellations, expirations.")

    total = len(this_df)
    delivered = int(this_df["IsDelivered"].sum()) if "IsDelivered" in this_df.columns else 0
    undelivered = total - delivered
    cancelled = int(this_df["IsCancelled"].sum()) if "IsCancelled" in this_df.columns else 0
    expired = int(this_df["IsExpired"].sum()) if "IsExpired" in this_df.columns else 0
    delivery_rate = (delivered / total * 100) if total > 0 else 0

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Delivery Rate", f"{delivery_rate:.1f}%")
    c2.metric("Undelivered", f"{undelivered:,}")
    c3.metric("Cancelled", f"{cancelled:,}")
    c4.metric("Expired", f"{expired:,}")

    st.markdown("---")
    st.markdown("### Undelivered orders by affiliate (TY)")
    if "IsDelivered" in this_df.columns:
        und = this_df[~this_df["IsDelivered"].fillna(False)]
        und_t = (und.groupby("CompanyName")
                 .agg(Undelivered=("InvoiceID", "count"),
                      Lost_Revenue=("SaleTotal", "sum"))
                 .reset_index()
                 .sort_values("Lost_Revenue", ascending=False))
        und_t["Lost_Revenue"] = und_t["Lost_Revenue"].round(2)
        st.dataframe(
            viz.style_table(
                und_t, money_cols=["Lost_Revenue"], int_cols=["Undelivered"],
            ),
            use_container_width=True,
        )

    st.markdown("### Cancellations last year, by affiliate")
    if "IsCancelled" in last_df.columns:
        canc = last_df[last_df["IsCancelled"].fillna(False)]
        canc_t = (canc.groupby("CompanyName")
                  .agg(Cancellations=("InvoiceID", "count"),
                       Lost_Revenue=("SaleTotal", "sum"))
                  .reset_index()
                  .sort_values("Cancellations", ascending=False))
        canc_t["Lost_Revenue"] = canc_t["Lost_Revenue"].round(2)
        st.dataframe(
            viz.style_table(
                canc_t, money_cols=["Lost_Revenue"], int_cols=["Cancellations"],
            ),
            use_container_width=True,
        )

    with data_table_expander("📋 Delivery rate by affiliate"):
        if "IsDelivered" in this_df.columns:
            dr = (this_df.groupby("CompanyName")
                  .agg(Orders=("InvoiceID", "count"),
                       Delivered=("IsDelivered", "sum"))
                  .reset_index())
            dr["Delivery Rate %"] = (dr["Delivered"] / dr["Orders"] * 100).round(1)
            dr = dr.sort_values("Delivery Rate %", ascending=True)
            st.dataframe(
                viz.style_table(
                    dr, pct_cols=["Delivery Rate %"], int_cols=["Orders", "Delivered"],
                ),
                use_container_width=True,
            )


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

PAGE_FUNCTIONS = {
    "1. Executive Summary":        page_executive_summary,
    "2. YoY Trend Analysis":       page_yoy_trends,
    "3. Affiliate Performance":    page_affiliate_performance,
    "4. Affiliate Leaderboard":    page_affiliate_leaderboard,
    "5. Affiliate Head-to-Head":   page_head_to_head,
    "6. Sport Breakdown":          page_sport_breakdown,
    "7. Team Performance":         page_team_performance,
    "8. Marketplace & Channel":    page_marketplace,
    "9. Profit Margin Deep Dive":  page_margin_deep_dive,
    "10. Ticket Type & Inventory": page_ticket_type,
    "11. Geographic Map":          page_geographic,
    "12. Heatmap Hub":             page_heatmap_hub,
    "13. Time Patterns":           page_time_patterns,
    "14. Top Events":              page_top_events,
    "15. Risk & Delivery":         page_risk_delivery,
}

PAGE_FUNCTIONS[page]()


# Sidebar footer
st.sidebar.markdown("---")
st.sidebar.markdown(f"**Rows in scope:** {len(fdf):,}")
st.sidebar.markdown(f"**This Year:** {len(this_df):,} rows")
st.sidebar.markdown(f"**Last Year:** {len(last_df):,} rows")
