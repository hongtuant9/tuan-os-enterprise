/** Chỉ đọc file ZIP được chủ sở hữu cung cấp; không chạm dữ liệu thật. */
import {createHash} from 'node:crypto';
import {readFileSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
const archive=process.argv[2];
if(!archive){console.error('Cách dùng: node scripts/verify-ui-v176-baseline.mjs <đường dẫn ZIP>');process.exit(2);}
const expectedBytes=33458101;
const expected='6b2512c8b0eed00902291e53452c462dafdc1b2cdee8ef5c640a3660437c732b';
const file=resolve(archive);
if(statSync(file).size!==expectedBytes)throw Error('UI_V176_ARCHIVE_SIZE_MISMATCH');
const sha=createHash('sha256').update(readFileSync(file)).digest('hex');
if(sha!==expected)throw Error('UI_V176_ARCHIVE_SHA256_MISMATCH');
console.log('UI_V176_APPROVED_ARCHIVE_SHA256_PASS (design only; backend integration not tested)');
