/** BIZVIORA Core hosting profile: no production mode in this MVP. */
export function resolveServerBinding(env=process.env) {
  if(env.BIZVIORA_STAGING_ACK!=='STAGING_ONLY')throw Error('STAGING_ACK_REQUIRED');
  const render=env.BIZVIORA_HOSTING_TARGET==='RENDER_STAGING';
  if(env.BIZVIORA_HOSTING_TARGET && !['RENDER_STAGING','LOCAL_STAGING'].includes(env.BIZVIORA_HOSTING_TARGET))
    throw Error('UNAPPROVED_HOSTING_TARGET');
  if(render && env.BIZVIORA_RENDER_PUBLIC_STAGING_ACK!=='ALLOW_STAGING_INGRESS')
    throw Error('PUBLIC_STAGING_INGRESS_ACK_REQUIRED');
  const host=render?'0.0.0.0':'127.0.0.1';
  const port=Number(render?env.PORT:env.BIZVIORA_LOCAL_PORT||4317);
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('INVALID_PORT');
  return Object.freeze({host,port,scope:'STAGING_ONLY'});
}
