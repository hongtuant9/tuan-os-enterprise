#!/usr/bin/env python3
import json
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request

ENV_PATH = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/opt/tuan-ai/secrets/tce-app.env")
EXPECTED_PAGE_ID = "1297673160095513"

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

env = load_env(ENV_PATH)
app_id = env.get("FACEBOOK_APP_ID", "")
app_secret = env.get("FACEBOOK_APP_SECRET", "")
page_token = env.get("FACEBOOK_PAGE_ACCESS_TOKEN", "")
configured_version = env.get("FACEBOOK_GRAPH_API_VERSION", "").strip()

if not all([app_id, app_secret, page_token, env.get("FACEBOOK_VERIFY_TOKEN", "")]):
    set_env(ENV_PATH, "FACEBOOK_PILOT_VERIFIED", "false")
    print("[Facebook verifier] HOLD reason=missing_required_runtime_config")
    raise SystemExit(0)

versions: list[str] = []
for version in [configured_version, "v26.0", "v25.0", "v24.0", "v23.0"]:
    if version and version not in versions:
        versions.append(version)

for version in versions:
    debug_query = urllib.parse.urlencode({
        "input_token": page_token,
        "access_token": f"{app_id}|{app_secret}",
    })
    debug_status, debug_body = get_json(
        f"https://graph.facebook.com/{version}/debug_token?{debug_query}"
    )
    debug_data = debug_body.get("data") if isinstance(debug_body, dict) else {}
    debug_data = debug_data if isinstance(debug_data, dict) else {}
    scopes = debug_data.get("scopes") or []
    granular_scopes = debug_data.get("granular_scopes") or []
    granular_scope_names = {
        str(item.get("scope") or "")
        for item in granular_scopes
        if isinstance(item, dict)
    }

    page_query = urllib.parse.urlencode({
        "fields": "id,name",
        "access_token": page_token,
    })
    page_status, page_body = get_json(
        f"https://graph.facebook.com/{version}/me?{page_query}"
    )
    page_body = page_body if isinstance(page_body, dict) else {}

    checks = {
        "debug_http": debug_status == 200,
        "token_valid": debug_data.get("is_valid") is True,
        "app_id_matches": str(debug_data.get("app_id") or "") == app_id,
        "pages_messaging": "pages_messaging" in scopes or "pages_messaging" in granular_scope_names,
        "page_http": page_status == 200,
        "page_matches": str(page_body.get("id") or "") == EXPECTED_PAGE_ID,
    }
    if all(checks.values()):
        set_env(ENV_PATH, "FACEBOOK_PILOT_VERIFIED", "true")
        print(
            f"[Facebook verifier] PASS version={version} "
            f"page_id={EXPECTED_PAGE_ID} page_name={str(page_body.get('name') or '')[:80]}"
        )
        raise SystemExit(0)

    print(
        f"[Facebook verifier] HOLD version={version} "
        f"debug_http={debug_status} page_http={page_status} "
        f"token_valid={checks['token_valid']} "
        f"app_id_matches={checks['app_id_matches']} "
        f"pages_messaging={checks['pages_messaging']} "
        f"page_matches={checks['page_matches']}"
    )

set_env(ENV_PATH, "FACEBOOK_PILOT_VERIFIED", "false")
print("[Facebook verifier] HOLD reason=strict_provider_probe_failed")
