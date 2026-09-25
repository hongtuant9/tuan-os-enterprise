#!/usr/bin/env python3
import json
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request

ENV_PATH = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/opt/tuan-ai/secrets/tce-app.env")
EXPECTED_PAGES = {
    "1297673160095513": "tce",
    "479015061953519": "cozy",
    "275468216666914": "lavender",
    "827630224304044": "ruby",
}

def load_env(path: pathlib.Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for raw in path.read_text(errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env

def set_env(path: pathlib.Path, key: str, value: str) -> None:
    lines = path.read_text(errors="ignore").splitlines()
    out: list[str] = []
    replaced = False
    for line in lines:
        if line.startswith(f"{key}="):
            out.append(f"{key}={value}")
            replaced = True
        else:
            out.append(line)
    if not replaced:
        out.append(f"{key}={value}")
    path.write_text("\n".join(out).rstrip() + "\n")

def get_json(url: str) -> tuple[int, dict]:
    try:
        with urllib.request.urlopen(url, timeout=12) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read().decode())
        except Exception:
            body = {}
        return exc.code, body
    except Exception:
        return 0, {}

def safe_error(body: dict) -> tuple[str, str, str]:
    error = body.get("error") if isinstance(body, dict) else {}
    error = error if isinstance(error, dict) else {}
    return (
        str(error.get("type") or "none")[:40],
        str(error.get("code") or "none")[:20],
        str(error.get("error_subcode") or "none")[:20],
    )

def hold(reason: str) -> None:
    set_env(ENV_PATH, "FACEBOOK_PILOT_VERIFIED", "false")
    print(f"[Facebook verifier] HOLD reason={reason}")
    raise SystemExit(0)

env = load_env(ENV_PATH)
app_id = env.get("FACEBOOK_APP_ID", "")
app_secret = env.get("FACEBOOK_APP_SECRET", "")
verify_token = env.get("FACEBOOK_VERIFY_TOKEN", "")
configured_version = env.get("FACEBOOK_GRAPH_API_VERSION", "").strip() or "v26.0"
raw_map = env.get("FACEBOOK_PAGE_ACCESS_TOKENS_JSON", "")

if not all([app_id, app_secret, verify_token, raw_map]):
    hold("missing_required_runtime_config")

try:
    page_tokens = json.loads(raw_map)
except Exception:
    hold("invalid_page_token_map_json")

if not isinstance(page_tokens, dict):
    hold("invalid_page_token_map_type")

missing = sorted(set(EXPECTED_PAGES) - set(page_tokens))
if missing:
    hold("missing_expected_page_tokens")

app_query = urllib.parse.urlencode({"access_token": f"{app_id}|{app_secret}"})
app_status, app_body = get_json(f"https://graph.facebook.com/{configured_version}/app?{app_query}")
app_ok = app_status == 200 and str(app_body.get("id") or "") == app_id
if not app_ok:
    et, ec, es = safe_error(app_body)
    print(f"[Facebook verifier] HOLD app_http={app_status} app_match={app_ok} app_error={et}/{ec}/{es}")
    hold("app_credentials_invalid")

for page_id, entity in EXPECTED_PAGES.items():
    token = str(page_tokens.get(page_id) or "").strip()
    if not token:
        hold(f"empty_page_token:{entity}")

    page_query = urllib.parse.urlencode({"fields": "id,name", "access_token": token})
    page_status, page_body = get_json(
        f"https://graph.facebook.com/{configured_version}/{page_id}?{page_query}"
    )
    page_match = page_status == 200 and str(page_body.get("id") or "") == page_id
    if not page_match:
        et, ec, es = safe_error(page_body)
        print(f"[Facebook verifier] HOLD page={entity} page_http={page_status} page_match={page_match} page_error={et}/{ec}/{es}")
        hold(f"page_token_invalid:{entity}")

    debug_query = urllib.parse.urlencode({
        "input_token": token,
        "access_token": f"{app_id}|{app_secret}",
    })
    debug_status, debug_body = get_json(
        f"https://graph.facebook.com/{configured_version}/debug_token?{debug_query}"
    )
    data = debug_body.get("data") if isinstance(debug_body, dict) else {}
    data = data if isinstance(data, dict) else {}
    scopes = set(data.get("scopes") or [])
    granular = {
        str(item.get("scope") or "")
        for item in (data.get("granular_scopes") or [])
        if isinstance(item, dict)
    }
    valid = data.get("is_valid") is True
    app_match = str(data.get("app_id") or "") == app_id
    messaging = "pages_messaging" in scopes or "pages_messaging" in granular
    if not (debug_status == 200 and valid and app_match and messaging):
        et, ec, es = safe_error(debug_body)
        print(
            f"[Facebook verifier] HOLD page={entity} debug_http={debug_status} "
            f"token_valid={valid} app_match={app_match} pages_messaging={messaging} "
            f"debug_error={et}/{ec}/{es}"
        )
        hold(f"page_permission_probe_failed:{entity}")

print(f"[Facebook verifier] PROVIDER_PASS pages={len(EXPECTED_PAGES)} version={configured_version}")
set_env(ENV_PATH, "FACEBOOK_PILOT_VERIFIED", "false")
print("[Facebook verifier] HOLD reason=provider_pass_waiting_webhook_and_uat")
