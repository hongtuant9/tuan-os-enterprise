#!/usr/bin/env python3
import json
import pathlib
import urllib.parse
import urllib.request

ENV_FILE = pathlib.Path("/opt/tuan-ai/secrets/tce-app.env")
PAGE_ID = "1297673160095513"

def load_env():
    values = {}
    for raw in ENV_FILE.read_text(errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values

def get_json(url):
    with urllib.request.urlopen(url, timeout=12) as response:
        return response.status, json.load(response)

env = load_env()
app_id = env.get("FACEBOOK_APP_ID", "")
app_secret = env.get("FACEBOOK_APP_SECRET", "")
page_token = env.get("FACEBOOK_PAGE_ACCESS_TOKEN", "")
version = env.get("FACEBOOK_GRAPH_API_VERSION", "v23.0")

result = {
    "configured": bool(app_id and app_secret and page_token),
    "debug_http": None,
    "token_valid": False,
    "app_id_matches": False,
    "has_pages_messaging": False,
    "profile_matches": False,
    "page_http": None,
    "page_matches": False,
    "page_name": None,
    "ok": False,
}

try:
    debug_qs = urllib.parse.urlencode({
        "input_token": page_token,
        "access_token": app_id + "|" + app_secret,
    })
    debug_status, debug_body = get_json(
        f"https://graph.facebook.com/{version}/debug_token?{debug_qs}"
    )
    data = debug_body.get("data") or {}
    scopes = data.get("scopes") or []
    result["debug_http"] = debug_status
    result["token_valid"] = data.get("is_valid") is True
    result["app_id_matches"] = data.get("app_id") == app_id
    result["has_pages_messaging"] = "pages_messaging" in scopes
    result["profile_matches"] = str(data.get("profile_id") or "") == PAGE_ID

    page_qs = urllib.parse.urlencode({
        "fields": "id,name",
        "access_token": page_token,
    })
    page_status, page_body = get_json(
        f"https://graph.facebook.com/{version}/{PAGE_ID}?{page_qs}"
    )
    result["page_http"] = page_status
    result["page_matches"] = str(page_body.get("id") or "") == PAGE_ID
    result["page_name"] = page_body.get("name")

    result["ok"] = all([
        result["token_valid"],
        result["app_id_matches"],
        result["has_pages_messaging"],
        result["page_matches"],
        result["profile_matches"] or result["page_matches"],
    ])
except Exception as error:
    result["error_type"] = type(error).__name__

print(json.dumps(result, ensure_ascii=False))
