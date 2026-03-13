from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from supabase import create_client

INPUT_JSON = Path("./data/enriched_territories.json")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")


def load_payload() -> list[dict[str, Any]]:
    if not INPUT_JSON.exists():
        raise FileNotFoundError(f"Missing enrichment payload: {INPUT_JSON}")
    data = json.loads(INPUT_JSON.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("Expected a top-level list of territories.")
    return data


def main() -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise EnvironmentError("SUPABASE_URL and SUPABASE_SERVICE_KEY are required.")

    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    territories = load_payload()

    for territory in territories:
        territory_id = territory.get("id")
        if not territory_id:
            continue

        territory_record = {
            "id": territory_id,
            "territory_no": territory.get("territoryNo") or territory.get("name") or territory_id,
            "name": territory.get("name") or territory_id,
            "polygon": territory.get("polygon") or [],
            "territory_state": territory.get("territory_state") or territory.get("status") or "Available",
            "progress": territory.get("progress") or 0,
        }
        client.table("territories").upsert(territory_record).execute()

        client.table("addresses").delete().eq("territory_id", territory_id).execute()

        rows = []
        for address in territory.get("addresses", []):
            full = address.get("full") or address.get("Complete Address") or ""
            if not full:
                continue
            rows.append({
                "territory_id": territory_id,
                "full_address": full,
                "apt": address.get("apt") or "",
                "resident_name": address.get("name") or "N/A",
                "phone": address.get("phone") or "N/A",
                "email": address.get("email") or "N/A",
                "is_checked": bool(address.get("checked", False)),
            })

        if rows:
            client.table("addresses").insert(rows).execute()

    print(f"Pushed {len(territories)} enriched territories to Supabase.")


if __name__ == "__main__":
    main()
