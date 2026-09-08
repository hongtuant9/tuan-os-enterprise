import { extractBookingReference, bookingVerificationQuery } from "../src/server/integrations/kiotviet/booking-verification.ts";
let pass=0; const t=(n,f)=>{try{f();console.log('PASS',n);pass++}catch(e){console.error('FAIL',n,e?.message??e)}}; const throws=f=>{let ok=false;try{f()}catch{ok=true}if(!ok)throw new Error('expected throw')};
t('root_uuid',()=>{if(extractBookingReference({uuid:'u'}).uuid!=='u')throw new Error('bad')});
t('nested_data_code',()=>{if(extractBookingReference({data:{code:'C'}}).code!=='C')throw new Error('bad')});
t('query_uuid_priority',()=>{if(bookingVerificationQuery({uuid:'u',code:'C'})!=='uuid=u')throw new Error('bad')});
t('query_code',()=>{if(bookingVerificationQuery({code:'C'})!=='code=C')throw new Error('bad')});
t('missing_ref_fail_closed',()=>throws(()=>bookingVerificationQuery({})));
console.log(`TOTAL ${pass}/5`); if(pass!==5)process.exit(1);
