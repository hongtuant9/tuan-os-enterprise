"""Manual signed-JWT acceptance. Synthetic staging only; passwords/tokens never logged."""
import concurrent.futures,getpass,json,pathlib,re,sys,urllib.request,urllib.error,base64,time
ROOT='https://oxakhhpyvvymujiwuvnm.supabase.co'
API='https://bizviora-core-api-staging-20261013.onrender.com'
TENANTS=['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']
USERS=['dcbe84c0-5548-4907-acdb-86db73be8297','1cf9b73f-9e54-4d38-bd09-dc30f240fed6']
EMAILS=['bizviora.qa.a02@test.example.com','bizviora.qa.b02@test.example.com']
def public_key():
    source=pathlib.Path(r'C:\Users\Public\bizviora_qa_task_write_e2e.ps1').read_text(encoding='utf-8-sig')
    for token in re.findall(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',source):
        try:
            p=token.split('.')[1]; claims=json.loads(base64.urlsafe_b64decode(p+'='*(-len(p)%4)))
            if claims.get('role')=='anon' and claims.get('ref')=='oxakhhpyvvymujiwuvnm': return token
        except Exception: pass
    raise RuntimeError('STAGING_PUBLIC_KEY_NOT_FOUND_IN_EXISTING_QA_SCRIPT')
def http(url,method='GET',body=None,token=None,key=None):
    headers={'Content-Type':'application/json'}
    if token: headers['Authorization']='Bearer '+token
    if key: headers['apikey']=key
    req=urllib.request.Request(url,data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method)
    try:
        with urllib.request.urlopen(req,timeout=40) as r: return r.status,json.loads(r.read())
    except urllib.error.HTTPError as e:
        try: data=json.loads(e.read())
        except Exception: data={}
        return e.code,data
def main():
    if not sys.stdin.isatty(): raise RuntimeError('LOCAL_INTERACTIVE_TERMINAL_REQUIRED')
    key=public_key(); tokens=[]
    for label,email in zip(['A02','B02'],EMAILS):
        password=getpass.getpass(label+' QA password (local only): ')
        status,data=http(ROOT+'/auth/v1/token?grant_type=password','POST',{'email':email,'password':password},key=key)
        password=None
        if status!=200 or not data.get('access_token'): raise RuntimeError('QA_LOGIN_FAILED_'+label)
        tokens.append(data['access_token']);data=None
    results=[]; created=[]
    def check(name,actual,expected):
        ok=actual==expected;results.append({'test':name,'actual':actual,'expected':expected,'pass':ok})
        if not ok: raise RuntimeError('ACCEPTANCE_FAILED_'+name)
    for i in range(2):
        status,identity=http(ROOT+'/auth/v1/user',token=tokens[i],key=key)
        check('verified_identity_'+str(i),identity.get('id') if status==200 else None,USERS[i])
        check('own_context_'+str(i),http(API+'/v1/context?tenantId='+TENANTS[i],token=tokens[i])[0],200)
        check('foreign_context_'+str(i),http(API+'/v1/context?tenantId='+TENANTS[1-i],token=tokens[i])[0],403)
        status,data=http(API+'/v1/approvals','POST',{'tenantId':TENANTS[i]},tokens[i])
        check('request_'+str(i),status,201); aid=data['data']['id'];created.append(aid)
        check('initial_pending_'+str(i),data['data']['status'],'PENDING')
        check('foreign_decision_'+str(i),http(API+'/v1/approvals/decision','POST',{'tenantId':TENANTS[i],'approvalId':aid,'decision':'APPROVED'},tokens[1-i])[0],403)
        decision=['APPROVED','REJECTED'][i]
        status,data=http(API+'/v1/approvals/decision','POST',{'tenantId':TENANTS[i],'approvalId':aid,'decision':decision},tokens[i])
        check('decision_'+str(i),status,200);check('status_'+str(i),data['data']['status'],decision)
        check('repeat_decision_'+str(i),http(API+'/v1/approvals/decision','POST',{'tenantId':TENANTS[i],'approvalId':aid,'decision':decision},tokens[i])[0],409)
        query='/rest/v1/bv_audit_events?entity_id=eq.'+aid+'&select=tenant_id,actor_user_id,entity_type,operation'
        status,audit=http(ROOT+query,token=tokens[i],key=key);check('audit_http_'+str(i),status,200)
        check('audit_insert_'+str(i),sum(x['operation']=='INSERT' for x in audit),1)
        check('audit_update_'+str(i),sum(x['operation']=='UPDATE' for x in audit),1)
        check('audit_actor_tenant_'+str(i),all(x['tenant_id']==TENANTS[i] and x['actor_user_id']==USERS[i] and x['entity_type']=='approval' for x in audit),True)
        status,foreign=http(ROOT+'/rest/v1/bv_approvals?id=eq.'+aid+'&select=id',token=tokens[1-i],key=key)
        check('cross_rls_'+str(i),foreign if status==200 else status,[])
    status,data=http(API+'/v1/approvals','POST',{'tenantId':TENANTS[0]},tokens[0]);check('race_request',status,201)
    aid=data['data']['id'];created.append(aid)
    def decide(d): return http(API+'/v1/approvals/decision','POST',{'tenantId':TENANTS[0],'approvalId':aid,'decision':d},tokens[0])[0]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: codes=list(pool.map(decide,['APPROVED','REJECTED']))
    check('concurrent_one_winner',sorted(codes),[200,409])
    status,audit=http(ROOT+'/rest/v1/bv_audit_events?entity_id=eq.'+aid+'&select=operation',token=tokens[0],key=key)
    check('race_audit_http',status,200);check('race_audit_single_update',sum(x['operation']=='UPDATE' for x in audit),1)
    report={'scope':'SYNTHETIC_STAGING_ONLY','result':'PASS','checks':results,'approval_ids':created,'time_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
    dest=pathlib.Path(r'C:\Users\Public\bizviora_pr588_qa_result.json');dest.write_text(json.dumps(report,ensure_ascii=False,indent=2))
    tokens.clear(); print('RESULT: PASS; checks='+str(len(results))+'; synthetic approval IDs='+','.join(created))
if __name__=='__main__':
    try: main()
    except Exception as e:
        print('RESULT: HOLD; '+(str(e) if isinstance(e,RuntimeError) else type(e).__name__))
        sys.exit(1)
