import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash, randomUUID } from 'node:crypto';
export const TEST_TOKEN='test-only-pllingo-password-000000000000000000000000';
export function gasHarness(origin='http://127.0.0.1:5174'){
  let created=0,locked=false,failSnapshot=false;
  const settings:Record<string,string>={ALLOWED_ORIGINS:origin,ACCESS_TOKEN:TEST_TOKEN};
  class Sheet {
    rows:any[][]=[];maxRows=1000;name:string;
    constructor(name:string){this.name=name;}
    setName(name:string){this.name=name;return this;}
    getLastRow(){let n=this.rows.length;while(n&&!this.rows[n-1]?.some(v=>v!==''&&v!==undefined))n--;return n;}
    getMaxRows(){return this.maxRows;}
    insertRowsAfter(_at:number,n:number){this.maxRows+=n;}
    deleteRow(n:number){this.rows.splice(n-1,1);}
    clearContents(){this.rows=[];}
    getDataRange(){return {getValues:()=>this.rows.slice(0,this.getLastRow()).map(r=>[...r])};}
    getRange(row:number,col:number,height=1,width=1){return {
      getValue:()=>this.rows[row-1]?.[col-1]??'',
      setValue:(value:any)=>this.getRange(row,col).setValues([[value]]),
      setValues:(values:any[][])=>{
        if(this.name==='Snapshots'&&row>1&&failSnapshot){failSnapshot=false;this.rows[row-1]=[...values[0]];throw new Error('simulated interrupted write');}
        if(values.length!==height||values.some(r=>r.length!==width))throw new Error('range dimensions mismatch');
        values.forEach((r,i)=>{const target=this.rows[row+i-1]||[];r.forEach((v,j)=>target[col+j-1]=v);this.rows[row+i-1]=target;});return this;
      }
    };}
  }
  class Spreadsheet {
    sheets=[new Sheet('Sheet1')];id='test-spreadsheet';
    getId(){return this.id;}getUrl(){return 'https://docs.google.com/spreadsheets/d/'+this.id+'/edit';}
    getSheets(){return this.sheets;}getSheetByName(name:string){return this.sheets.find(s=>s.name===name);}
    insertSheet(name:string){const sheet=new Sheet(name);this.sheets.push(sheet);return sheet;}
  }
  let spreadsheet:Spreadsheet;
  const context=vm.createContext({console:{log:()=>{}},PropertiesService:{getScriptProperties:()=>({getProperty:(k:string)=>settings[k]??null,setProperty:(k:string,v:string)=>{settings[k]=v;}})},
    SpreadsheetApp:{create:()=>{created++;spreadsheet=new Spreadsheet();return spreadsheet;},openById:(id:string)=>{if(!spreadsheet||id!==spreadsheet.id)throw new Error('unknown spreadsheet');return spreadsheet;},flush:()=>{}},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},getUuid:randomUUID,computeDigest:(_kind:string,text:string)=>Array.from(createHash('sha256').update(text).digest())},
    LockService:{getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true;},releaseLock:()=>{locked=false;}})},
    HtmlService:{createHtmlOutput:(text:string)=>text,createTemplateFromFile:()=>({evaluate(){return {setTitle(){return this;},setXFrameOptionsMode(){return this;}};}}),XFrameOptionsMode:{ALLOWALL:1}}
  });
  vm.runInContext(readFileSync('apps-script-dist/Code.gs','utf8'),context);
  context.setupPllingo_();
  const rpc=(request:any)=>JSON.parse(JSON.stringify(context.rpc({token:TEST_TOKEN,origin,...request})));
  return {rpc,settings,get spreadsheet(){return spreadsheet!;},get created(){return created;},failNextSnapshot(){failSnapshot=true;},lock(){locked=true;},unlock(){locked=false;}};
}
