// Server-side Google Sheets adapter. Not safe for browser inclusion.
// Runtime must supply a short-lived OAuth access token by a server-side
// workload identity or secure credential provider. Never store tokens in repo.
// Google Sheets API requires spreadsheet shared explicitly with that identity.
export function googleSheetsAdapter({fetchImpl=fetch,getToken,spreadsheetId,tab='LEADS'}) {
  if (typeof getToken!=='function' || !spreadsheetId) throw Error('missing_server_configuration');
  const range=encodeURIComponent(tab+'!A:T');
  return async function appendLead(lead) {
    const token=await getToken();
    if (!token) throw Error('server_auth_unavailable');
    const row=[
      lead.leadId,lead.timestamp,lead.source,lead.landingUrl,lead.utmSource,
      lead.utmMedium,lead.utmCampaign,lead.business,lead.kind,lead.contact,
      lead.phone,lead.email,lead.pain,lead.consentTimestamp,lead.consentVersion,
      'NEW','','','', 'Synthetic test flag required in test environment'
    ];
    const u='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheetId)+
      '/values/'+range+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS';
    const r=await fetchImpl(u,{method:'POST',headers:{
      Authorization:'Bearer '+token,'Content-Type':'application/json'
    },body:JSON.stringify({values:[row]})});
    if (!r.ok) throw Error('sheets_append_failed_'+r.status);
    const result=await r.json();
    if (result?.updates?.updatedRows!==1 || result?.updates?.updatedCells!==20)
      throw Error('sheets_append_unverified');
    return {updatedRange:result.updates.updatedRange};
  };
}
