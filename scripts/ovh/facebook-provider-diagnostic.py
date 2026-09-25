#!/usr/bin/env python3
import json
import pathlib
import urllib.error
import urllib.parse
import urllib.request

ENV_PATH = pathlib.Path("/opt/tuan-ai/secrets/tce-app.env")
PAGE_ID = "1297673160095513"

def load_env():
    out = {}
    for raw in ENV_PATH.read_text(errors="ignore").splitlines():
        if "=" in raw and not raw.lstrip().startswith("#"):
            k,v = raw.split("=",1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out

def get(url):
    try:
        with urllib.request.urlopen(url, timeout=12) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read().decode())
        except Exception:
            body = {}
        return exc.code, body

def err(body):
    e = body.get("error") if isinstance(body,dict) else {}
    e = e if isinstance(e,dict) else {}
    return f"{e.get('type','none')}/{e.get('code','none')}/{e.get('error_subcode','none')}"

env=load_env()
app_id=env.get("FACEBOOK_APP_ID","")
app_secret=env.get("FACEBOOK_APP_SECRET","")
page_token=env.get("FACEBOOK_PAGE_ACCESS_TOKEN","")
version=env.get("FACEBOOK_GRAPH_API_VERSION","") or "v26.0"

app_status, app_body = get("https://graph.facebook.com/"+version+"/app?"+urllib.parse.urlencode({
    "access_token": app_id+"|"+app_secret,
}))
print("APP_ACCESS_TOKEN_HTTP="+str(app_status))
print("APP_ACCESS_TOKEN_MATCH="+str(str(app_body.get("id") or "")==app_id).lower())
print("APP_ACCESS_TOKEN_ERROR="+err(app_body))

page_status, page_body = get("https://graph.facebook.com/"+version+"/"+PAGE_ID+"?"+urllib.parse.urlencode({
    "fields":"id,name",
    "access_token":page_token,
}))
print("PAGE_TOKEN_HTTP="+str(page_status))
print("PAGE_TOKEN_MATCH="+str(str(page_body.get("id") or "")==PAGE_ID).lower())
print("PAGE_TOKEN_ERROR="+err(page_body))

debug_status, debug_body = get("https://graph.facebook.com/"+version+"/debug_token?"+urllib.parse.urlencode({
    "input_token":page_token,
    "access_token":app_id+"|"+app_secret,
}))
data=debug_body.get("data") if isinstance(debug_body,dict) else {}
data=data if isinstance(data,dict) else {}
print("DEBUG_TOKEN_HTTP="+str(debug_status))
print("DEBUG_TOKEN_VALID="+str(data.get("is_valid") is True).lower())
print("DEBUG_TOKEN_APP_MATCH="+str(str(data.get("app_id") or "")==app_id).lower())
print("DEBUG_TOKEN_ERROR="+err(debug_body))
