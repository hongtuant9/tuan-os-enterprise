#!/usr/bin/env python3
from __future__ import annotations

import getpass
import json
import os
import shutil
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

GRAPH_VERSION = "v26.0"
EXPECTED_PAGES = {
    "1297673160095513": "tce",
    "479015061953519": "cozy",
    "275468216666914": "lavender",
    "827630224304044": "ruby",
}
REQUIRED_PERMISSIONS = ("pages_show_list", "business_management", "pages_messaging")


def graph_get(path: str, params: dict[str, str]) -> dict:
    url = f"https://graph.facebook.com/{GRAPH_VERSION}/{path}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def replace_env_values(env_file: Path, values: dict[str, str]) -> None:
    lines = env_file.read_text(encoding="utf-8").splitlines()
    keys = tuple(f"{key}=" for key in values)
    lines = [line for line in lines if not line.startswith(keys)]
    lines.extend(f"{key}={value}" for key, value in values.items())
    env_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
    os.chmod(env_file, 0o600)


def main() -> int:
    env_file = Path(sys.argv[1] if len(sys.argv) > 1 else "/opt/tuan-ai/secrets/tce-app.env")
    if not env_file.exists():
        print("FAIL: env file not found")
        return 2

    user_token = getpass.getpass("Meta User Access Token (input hidden): ").strip()
    if not user_token:
        print("FAIL: empty token")
        return 3

    try:
        permissions = graph_get("me/permissions", {"access_token": user_token}).get("data", [])
        status = {item.get("permission"): item.get("status") for item in permissions}
        missing = [name for name in REQUIRED_PERMISSIONS if status.get(name) != "granted"]
        if missing:
            print("FAIL: missing permissions:", ", ".join(missing))
            return 4

        pages = graph_get(
            "me/accounts",
            {"fields": "id,name,access_token,tasks", "access_token": user_token},
        ).get("data", [])

        page_tokens: dict[str, str] = {}
        page_names: dict[str, str] = {}
        for page in pages:
            page_id = str(page.get("id", ""))
            token = str(page.get("access_token", "")).strip()
            if page_id in EXPECTED_PAGES and token:
                page_tokens[page_id] = token
                page_names[page_id] = str(page.get("name", ""))

        if set(page_tokens) != set(EXPECTED_PAGES):
            missing_pages = sorted(set(EXPECTED_PAGES) - set(page_tokens))
            print(f"FAIL: expected 4 TCE pages; found {len(page_tokens)}")
            if missing_pages:
                print("Missing page IDs:", ", ".join(missing_pages))
            return 5

        backup = env_file.with_name(env_file.name + ".bak-facebook-" + time.strftime("%Y%m%d%H%M%S"))
        shutil.copy2(env_file, backup)

        values = {
            "FACEBOOK_PAGE_ACCESS_TOKENS_JSON": json.dumps(page_tokens, separators=(",", ":")),
            "FACEBOOK_PAGE_ACCESS_TOKEN": page_tokens["1297673160095513"],
            "FACEBOOK_PAGE_ENTITY_MAP_JSON": json.dumps(EXPECTED_PAGES, separators=(",", ":")),
            "FACEBOOK_LEGACY_UNSCOPED_PAGE_ID": "1297673160095513",
            "FACEBOOK_PILOT_VERIFIED": "false",
        }
        replace_env_values(env_file, values)

        print("PASS: secret store updated for 4 Facebook Pages")
        for page_id, entity in EXPECTED_PAGES.items():
            print(f"PAGE: {page_names.get(page_id, page_id)} [{entity}]")
        print("FACEBOOK_PILOT_VERIFIED=false")
        return 0
    finally:
        user_token = ""


if __name__ == "__main__":
    raise SystemExit(main())
