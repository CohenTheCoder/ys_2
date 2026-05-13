"""
cleaner.py
----------
Loads the two raw CSV samples, harmonizes the schema, and enriches the data
with derived columns the dashboard needs (Profit, ProfitMargin, Sport, State,
LeadTime, time-of-day buckets, section tier, etc.).

Everything is plain functions. No classes. Pandas does the heavy lifting.

Public entry point: load_combined(this_path, last_path) -> pd.DataFrame
"""

import pandas as pd
import numpy as np
import re
import os


# ---------------------------------------------------------------------------
# Mapping tables. Kept here so they're easy to edit later.
# ---------------------------------------------------------------------------

# RequestedPerformerTypeId encodes sport. Confirmed values from the sample
# data; MLB's TypeId hasn't been observed in the samples, so the team-name
# fallback in enrich() also derives Sport from PrimaryPerformerName for
# robustness.
SPORT_MAP = {
    38: "NBA",
    42: "NFL",
    43: "NHL",
    # MLB TypeId — add here once confirmed from the full file. The team-name
    # fallback below catches MLB rows even if this is missing.
}

# Per-sport team -> US state (2-letter). One source of truth: TEAM_STATE
# (state lookup) and TEAM_SPORT (sport lookup) are both derived from these.
# Add to these as new teams appear in the full file.

NBA_TEAMS = {
    "Atlanta Hawks": "GA", "Boston Celtics": "MA", "Brooklyn Nets": "NY",
    "Charlotte Hornets": "NC", "Chicago Bulls": "IL", "Cleveland Cavaliers": "OH",
    "Dallas Mavericks": "TX", "Denver Nuggets": "CO", "Detroit Pistons": "MI",
    "Golden State Warriors": "CA", "Houston Rockets": "TX", "Indiana Pacers": "IN",
    "Los Angeles Clippers": "CA", "Los Angeles Lakers": "CA", "LA Clippers": "CA",
    "Memphis Grizzlies": "TN", "Miami Heat": "FL", "Milwaukee Bucks": "WI",
    "Minnesota Timberwolves": "MN", "New Orleans Pelicans": "LA",
    "New York Knicks": "NY", "Oklahoma City Thunder": "OK", "Orlando Magic": "FL",
    "Philadelphia 76ers": "PA", "Phoenix Suns": "AZ", "Portland Trail Blazers": "OR",
    "Sacramento Kings": "CA", "San Antonio Spurs": "TX", "Toronto Raptors": "ON",
    "Utah Jazz": "UT", "Washington Wizards": "DC",
}

NFL_TEAMS = {
    "Arizona Cardinals": "AZ", "Atlanta Falcons": "GA", "Baltimore Ravens": "MD",
    "Buffalo Bills": "NY", "Carolina Panthers": "NC", "Chicago Bears": "IL",
    "Cincinnati Bengals": "OH", "Cleveland Browns": "OH", "Dallas Cowboys": "TX",
    "Denver Broncos": "CO", "Detroit Lions": "MI", "Green Bay Packers": "WI",
    "Houston Texans": "TX", "Indianapolis Colts": "IN", "Jacksonville Jaguars": "FL",
    "Kansas City Chiefs": "MO", "Las Vegas Raiders": "NV",
    "Los Angeles Chargers": "CA", "Los Angeles Rams": "CA", "Miami Dolphins": "FL",
    "Minnesota Vikings": "MN", "New England Patriots": "MA", "New Orleans Saints": "LA",
    "New York Giants": "NJ", "New York Jets": "NJ", "Philadelphia Eagles": "PA",
    "Pittsburgh Steelers": "PA", "San Francisco 49ers": "CA", "Seattle Seahawks": "WA",
    "Tampa Bay Buccaneers": "FL", "Tennessee Titans": "TN", "Washington Commanders": "DC",
}

NHL_TEAMS = {
    "Anaheim Ducks": "CA", "Boston Bruins": "MA", "Buffalo Sabres": "NY",
    "Calgary Flames": "AB", "Carolina Hurricanes": "NC", "Chicago Blackhawks": "IL",
    "Colorado Avalanche": "CO", "Columbus Blue Jackets": "OH", "Dallas Stars": "TX",
    "Detroit Red Wings": "MI", "Edmonton Oilers": "AB", "Florida Panthers": "FL",
    "Los Angeles Kings": "CA", "Minnesota Wild": "MN", "Montreal Canadiens": "QC",
    "Nashville Predators": "TN", "New Jersey Devils": "NJ", "New York Islanders": "NY",
    "New York Rangers": "NY", "Ottawa Senators": "ON", "Philadelphia Flyers": "PA",
    "Pittsburgh Penguins": "PA", "San Jose Sharks": "CA", "Seattle Kraken": "WA",
    "St. Louis Blues": "MO", "Tampa Bay Lightning": "FL", "Toronto Maple Leafs": "ON",
    "Utah Hockey Club": "UT", "Utah Mammoth": "UT", "Vancouver Canucks": "BC",
    "Vegas Golden Knights": "NV", "Washington Capitals": "DC", "Winnipeg Jets": "MB",
}

# MLB — added preemptively. The Athletics moved out of Oakland for 2025+
# but the franchise plays under the name "Athletics"; both keys are kept
# so historical and current data both resolve.
MLB_TEAMS = {
    "Arizona Diamondbacks": "AZ", "Atlanta Braves": "GA", "Baltimore Orioles": "MD",
    "Boston Red Sox": "MA", "Chicago Cubs": "IL", "Chicago White Sox": "IL",
    "Cincinnati Reds": "OH", "Cleveland Guardians": "OH", "Colorado Rockies": "CO",
    "Detroit Tigers": "MI", "Houston Astros": "TX", "Kansas City Royals": "MO",
    "Los Angeles Angels": "CA", "Los Angeles Dodgers": "CA", "Miami Marlins": "FL",
    "Milwaukee Brewers": "WI", "Minnesota Twins": "MN", "New York Mets": "NY",
    "New York Yankees": "NY", "Athletics": "CA", "Oakland Athletics": "CA",
    "Philadelphia Phillies": "PA", "Pittsburgh Pirates": "PA", "San Diego Padres": "CA",
    "San Francisco Giants": "CA", "Seattle Mariners": "WA",
    "St. Louis Cardinals": "MO", "Tampa Bay Rays": "FL", "Texas Rangers": "TX",
    "Toronto Blue Jays": "ON", "Washington Nationals": "DC",
}

# Derived lookups
TEAM_STATE = {**NBA_TEAMS, **NFL_TEAMS, **NHL_TEAMS, **MLB_TEAMS}
TEAM_SPORT = {
    **{t: "NBA" for t in NBA_TEAMS},
    **{t: "NFL" for t in NFL_TEAMS},
    **{t: "NHL" for t in NHL_TEAMS},
    **{t: "MLB" for t in MLB_TEAMS},
}

# Marketplace tier — group the long tail. Useful for "what type of channel sells well".
MARKETPLACE_TIER = {
    "StubHub": "Tier 1 - Major",
    "SeatGeek": "Tier 1 - Major",
    "Vivid Seats": "Tier 1 - Major",
    "Vivid": "Tier 1 - Major",
    "TickPick": "Tier 2 - Mid",
    "Gametime": "Tier 2 - Mid",
    "TicketsNow": "Tier 2 - Mid",
    "Ticket Evolution": "Tier 3 - B2B",
    "GoTickets": "Tier 3 - B2B",
    "Expired": "Expired/Other",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def safe_to_datetime(series):
    """Parse strings to datetime, coercing failures to NaT."""
    return pd.to_datetime(series, errors="coerce")


# Keyword groupings for Section_Type classification. Substring match, so
# "BLACKLOT" hits Lot via "LOT", "GOLDLOT" hits via "LOT" first, etc.
PREMIUM_KEYWORDS = ("CLUB", "CLB", "LOGE", "SUITE", "VIP", "PREMIUM",
                    "BOX", "FLOOR", "COURT")
LOT_KEYWORDS = ("LOT", "GARAGE", "PARKING", "GOLD", "BLACK", "BLUE", "YELLOW",
                "EMERALD", "RED", "GREEN", "PURPLE", "ORANGE", "SILVER",
                "BRONZE", "WHITE", "PL")
BALCONY_KEYWORDS = ("BAL", "BALCONY", "MEZZ")


def parse_section(df):
    """
    Pull the numeric and alpha components out of the Section field.

    Examples:
        "106"          -> Section_Num=106,  Section_Type=""
        "GOLD1"        -> Section_Num=1,    Section_Type="GOLD"
        "PL14"         -> Section_Num=14,   Section_Type="PL"
        "BAL301"       -> Section_Num=301,  Section_Type="BAL"
        "Black"        -> Section_Num=NaN*, Section_Type="BLACK"
        "Broad Street" -> Section_Num=NaN*, Section_Type="BROADSTREET"

    *When Section has no digits at all, fall back to the leading number from
    the Seats column (e.g. Seats="9-9" -> 9). This was originally written as
    a row-by-row loop that overwrote the entire column on the first empty;
    here it's vectorized and only writes to the rows that actually need it.

    Section_Num is cast to numeric (NaN if still un-parseable).
    Section_Type stays a string (uppercased so case differences collapse).
    """
    section_str = df["Section"].fillna("").astype(str).str.upper()
    df["Section_Num"] = section_str.str.findall(r"\d+").str.join("")
    df["Section_Type"] = section_str.str.findall(r"[A-Z]+").str.join("")

    # Fallback: pull leading number from Seats only where Section_Num is empty
    needs_fallback = df["Section_Num"] == ""
    if needs_fallback.any():
        seats_lead = (df["Seats"].fillna("").astype(str)
                      .str.split("-").str[0].str.strip())
        df.loc[needs_fallback, "Section_Num"] = seats_lead[needs_fallback]

    df["Section_Num"] = pd.to_numeric(df["Section_Num"], errors="coerce")
    return df


def section_num_tier(num):
    """Bucket by numeric section number — bowl level."""
    if pd.isna(num):
        return "Unknown"
    n = int(num)
    if n < 100:
        return "Floor / Low (<100)"
    if n < 200:
        return "Lower Bowl (100s)"
    if n < 300:
        return "Mid Level (200s)"
    if n < 400:
        return "Upper Mid (300s)"
    return "Upper Deck (400s+)"


def section_type_tier(type_str):
    """Bucket by alpha component — VIP / Lot / Balcony / Lettered / etc."""
    if pd.isna(type_str) or not type_str:
        return "Numeric Only"
    s = str(type_str).upper()
    if any(k in s for k in PREMIUM_KEYWORDS):
        return "Premium / Suite / Club"
    if any(k in s for k in LOT_KEYWORDS):
        return "Parking / Lot"
    if any(k in s for k in BALCONY_KEYWORDS):
        return "Balcony"
    if len(s) <= 2:
        return "Lettered (A/B/C…)"
    return "Other Named"


def quantity_bucket(qty):
    """Group order quantities for ticket-bundle analysis."""
    if pd.isna(qty):
        return "Unknown"
    q = int(qty)
    if q == 1:
        return "Single"
    if q == 2:
        return "Pair"
    if q <= 4:
        return "Small Group (3-4)"
    if q <= 8:
        return "Group (5-8)"
    return "Large Group (9+)"


def lead_time_bucket(days):
    """Group lead time (days from sale to event) into readable bands."""
    if pd.isna(days):
        return "Unknown"
    d = int(days)
    if d < 0:
        return "Post-event sale"
    if d == 0:
        return "Same day"
    if d <= 3:
        return "1-3 days"
    if d <= 7:
        return "4-7 days"
    if d <= 30:
        return "1-4 weeks"
    if d <= 90:
        return "1-3 months"
    return "3+ months"


# ---------------------------------------------------------------------------
# Core loaders
# ---------------------------------------------------------------------------

def load_one(path, year_label):
    """
    Load a single CSV and stamp it with the year label. The raw file already
    has a YEAR column ('current'/'last'); we trust the explicit label argument
    over whatever's in the file so we can re-label if needed.
    """
    df = pd.read_csv(path)
    df = df.drop(columns=["Unnamed: 0"], errors="ignore")
    df["YearLabel"] = year_label  # 'This Year' or 'Last Year'
    return df


def harmonize(this_df, last_df):
    """Make the two frames stack-able even though last has 2 extra cols."""
    all_cols = sorted(set(this_df.columns) | set(last_df.columns))
    for c in all_cols:
        if c not in this_df.columns:
            this_df[c] = np.nan
        if c not in last_df.columns:
            last_df[c] = np.nan
    return pd.concat([this_df[all_cols], last_df[all_cols]], ignore_index=True)


def enrich(df):
    """
    Add every derived column the dashboard depends on. This function should
    stay vectorized — no row-wise apply unless absolutely needed — because the
    real file is large.
    """
    # --- money ---
    df["SaleTotal"] = pd.to_numeric(df["SaleTotal"], errors="coerce").fillna(0)
    df["TicketCost"] = pd.to_numeric(df["TicketCost"], errors="coerce").fillna(0)
    df["Quantity"] = pd.to_numeric(df["Quantity"], errors="coerce").fillna(0).astype(int)
    df["Profit"] = df["SaleTotal"] - df["TicketCost"]
    # margin: divide by SaleTotal but guard against zero
    safe_revenue = df["SaleTotal"].where(df["SaleTotal"] != 0, np.nan)
    df["ProfitMargin"] = (df["Profit"] / safe_revenue) * 100  # percentage
    df["TicketsSold"] = df["Quantity"]  # alias, easier to read in viz code

    # --- dates ---
    df["SellDate_dt"] = safe_to_datetime(df["SellDate"])
    df["EventDate_dt"] = safe_to_datetime(df["EventDate"])
    df["SellMonth"] = df["SellDate_dt"].dt.to_period("M").astype(str)
    df["SellMonthName"] = df["SellDate_dt"].dt.strftime("%b")
    df["SellDayOfWeek"] = df["SellDate_dt"].dt.day_name()
    df["SellHour"] = df["SellDate_dt"].dt.hour
    df["EventMonth"] = df["EventDate_dt"].dt.to_period("M").astype(str)
    df["EventDayOfWeek"] = df["EventDate_dt"].dt.day_name()
    df["LeadTimeDays"] = (df["EventDate_dt"] - df["SellDate_dt"]).dt.days
    df["LeadTimeBucket"] = df["LeadTimeDays"].map(lead_time_bucket)
    # EventTime in the source is "1900-01-01THH:MM:SS" (placeholder date,
    # real time-of-day). Just pull the hour out.
    df["EventHour"] = pd.to_datetime(df["EventTime"], errors="coerce").dt.hour

    # --- section parsing (regex-based, vectorized, NaN-safe) ---
    df = parse_section(df)
    df["SectionNumTier"] = df["Section_Num"].map(section_num_tier)
    df["SectionTypeTier"] = df["Section_Type"].map(section_type_tier)

    # --- categorical derivations ---
    # Sport: TypeId is authoritative; fall back to team-name lookup for any
    # rows whose TypeId we haven't catalogued (e.g. MLB if its TypeId differs).
    df["Sport"] = df["RequestedPerformerTypeId"].map(SPORT_MAP)
    needs_sport = df["Sport"].isna()
    if needs_sport.any():
        df.loc[needs_sport, "Sport"] = (
            df.loc[needs_sport, "PrimaryPerformerName"].map(TEAM_SPORT)
        )
    df["Sport"] = df["Sport"].fillna("Other")
    df["HomeTeam"] = df["PrimaryPerformerName"]
    df["AwayTeam"] = df["SecondaryPerformerName"]
    df["State"] = df["HomeTeam"].map(TEAM_STATE)
    df["MarketplaceTier"] = df["ShippingCompany"].map(MARKETPLACE_TIER).fillna("Other")
    df["QuantityBucket"] = df["TicketsSold"].map(quantity_bucket)

    # --- flags as bools (CSV booleans sometimes load as strings) ---
    for col in ["IsCancelled", "IsDelivered", "IsExpired", "IsConsecutive"]:
        if col in df.columns:
            df[col] = df[col].map(lambda v: str(v).strip().lower() == "true"
                                  if pd.notna(v) else False)

    return df


def load_combined(this_path="data/this_samp.csv", last_path="data/last_samp.csv"):
    """Top-level entry. Returns a single enriched dataframe."""
    this_df = load_one(this_path, "This Year")
    this_df['YEAR']='current'
    last_df = load_one(last_path, "Last Year")
    last_df['YEAR']='last_year'
    combined = harmonize(this_df, last_df)
    combined = enrich(combined)
    return combined


# ---------------------------------------------------------------------------
# KPI helpers used across many pages
# ---------------------------------------------------------------------------

def kpi_block(df):
    """
    Compute the headline KPIs for a slice. Returns a dict so the caller can
    decide how to display it.
    """
    if len(df) == 0:
        return {
            "revenue": 0, "profit": 0, "margin": 0,
            "tickets": 0, "orders": 0, "avg_order": 0,
            "loss_orders": 0, "loss_share": 0,
        }
    revenue = df["SaleTotal"].sum()
    profit = df["Profit"].sum()
    tickets = df["TicketsSold"].sum()
    orders = len(df)
    margin = (profit / revenue * 100) if revenue > 0 else 0
    avg_order = revenue / orders if orders else 0
    loss_orders = int((df["Profit"] < 0).sum())
    loss_share = (loss_orders / orders * 100) if orders else 0
    return {
        "revenue": revenue,
        "profit": profit,
        "margin": margin,
        "tickets": tickets,
        "orders": orders,
        "avg_order": avg_order,
        "loss_orders": loss_orders,
        "loss_share": loss_share,
    }


def yoy_delta(this_value, last_value):
    """Percent change. Safe against zero/NaN base."""
    if last_value is None or last_value == 0 or pd.isna(last_value):
        return None
    return (this_value - last_value) / abs(last_value) * 100


def split_years(df):
    """Convenience: return (this_year_df, last_year_df)."""
    return (
        df[df["YearLabel"] == "This Year"].copy(),
        df[df["YearLabel"] == "Last Year"].copy(),
    )


def affiliate_list(df):
    """Sorted list of CompanyNames present, with a leading 'All Affiliates'."""
    names = sorted([n for n in df["CompanyName"].dropna().unique()])
    return ["All Affiliates"] + names
