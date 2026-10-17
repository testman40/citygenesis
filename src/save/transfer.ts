import {validateSave,type SaveData} from './schema';
export const MAX_TRANSFER_BYTES=20*1024*1024;
/** Standard v4 JSON; no host-specific wrapper, slot ID or browser data. */
export function encodeTransfer(data:SaveData):string{
 const text=JSON.stringify(validateSave(data));
 if(new TextEncoder().encode(text).byteLength>MAX_TRANSFER_BYTES)throw new Error('都市ファイルは20MB以下にしてください');
 return text;
}
export function decodeTransfer(text:string):unknown{
 if(new TextEncoder().encode(text).byteLength>MAX_TRANSFER_BYTES)throw new Error('都市ファイルは20MB以下にしてください');
 try{return JSON.parse(text);}catch{throw new Error('都市ファイルのJSONが不正です');}
}
