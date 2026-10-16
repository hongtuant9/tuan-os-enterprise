import { ApiError } from './access.mjs';
const allowedFields=new Set(['businessName','contactName','planCode']);
export function validateRegistration(body){
  if(!body || typeof body!=='object' || Array.isArray(body) ||
     Object.keys(body).some(k=>!allowedFields.has(k)))
    throw new ApiError(400,'INVALID_REGISTRATION');
  const business_name=typeof body.businessName==='string'?body.businessName.trim():'';
  const contact_name=typeof body.contactName==='string'?body.contactName.trim():'';
  const plan_code=typeof body.planCode==='string'?body.planCode.trim():'';
  if(business_name.length<2||business_name.length>160 ||
     contact_name.length<2||contact_name.length>120 ||
     !/^[A-Z0-9_]{4,32}$/.test(plan_code))
    throw new ApiError(400,'INVALID_REGISTRATION');
  return {business_name,contact_name,plan_code};
}
