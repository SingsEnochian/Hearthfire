import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RegistryStore } from '../src/store.mjs';
import { startFoundryServer } from '../src/server.mjs';
import { parseApiStuff, secretFreeImportSummary } from '../src/api-stuff-parser.mjs';

async function temporaryDirectory(name) { return mkdtemp(join(tmpdir(), `${name}-`)); }

async function startMockOllama() {
  const server = createServer((request, response) => {
    if (request.url === '/api/tags') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ models: [
        { name:'test-model:latest', size:123456, digest:'sha256:test', modified_at:'2026-07-25T00:00:00.000Z', details:{family:'test'} },
        { name:'test-cloud:cloud', size:0, digest:'sha256:cloud', modified_at:'2026-07-25T00:00:00.000Z', details:{family:'remote-router'} },
      ] }));
      return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise((resolvePromise,rejectPromise)=>{server.once('error',rejectPromise);server.listen(0,'127.0.0.1',resolvePromise);});
  const address=server.address();
  return { endpoint:`http://127.0.0.1:${address.port}`, close:()=>new Promise((resolvePromise,rejectPromise)=>server.close(error=>error?rejectPromise(error):resolvePromise())) };
}

async function getCsrf(baseUrl) { const response=await fetch(`${baseUrl}/api/session`); assert.equal(response.status,200); return (await response.json()).csrfToken; }
async function mutate(baseUrl,path,{method='POST',body={},headers={}}={}) { const csrf=await getCsrf(baseUrl); return fetch(`${baseUrl}${path}`,{method,headers:{'content-type':'application/json','x-arkfire-csrf':csrf,...headers},body:JSON.stringify(body)}); }
function healthResult(providerId,index=0){return{providerId,status:'available',checkedAt:new Date(1785000000000+index).toISOString(),latencyMs:index,models:[],error:null};}

test('registry persists provider profiles across a new store instance', async()=>{
  const directory=await temporaryDirectory('model-foundry-store');
  try{const first=new RegistryStore(directory);await first.init();await first.upsertProvider({providerId:'ollama.test-persistent',displayName:'Persistent Test',endpoint:'http://127.0.0.1:11999',kind:'ollama',enabled:true});const second=new RegistryStore(directory);const registry=await second.readRegistry();assert.equal(registry.providers.some(provider=>provider.providerId==='ollama.test-persistent'),true);assert.ok(registry.revision>=2);}finally{await rm(directory,{recursive:true,force:true});}
});

test('standalone service discovers configured Ollama models and classifies cloud-routed tags', async()=>{
  const directory=await temporaryDirectory('model-foundry-service'),ollama=await startMockOllama(),foundry=await startFoundryServer({port:0,dataDirectory:directory,logger:{error(){}}});
  try{let response=await mutate(foundry.url,'/api/providers',{body:{providerId:'ollama.mock',displayName:'Mock Ollama',endpoint:ollama.endpoint,kind:'ollama',enabled:true}});assert.equal(response.status,200);response=await mutate(foundry.url,'/api/probe',{body:{providerIds:['ollama.mock']}});assert.equal(response.status,200);const probe=await response.json();assert.equal(probe.results[0].status,'available');assert.equal(probe.results[0].models[0].name,'test-model:latest');const cloudModel=probe.results[0].models.find(model=>model.name==='test-cloud:cloud');assert.equal(cloudModel.runtime,'cloud-via-local-router');assert.equal(cloudModel.privacyClass,'external-processing-possible');assert.ok(cloudModel.routeWarning);response=await fetch(`${foundry.url}/api/registry`);const registryBody=await response.json();const provider=registryBody.registry.providers.find(entry=>entry.providerId==='ollama.mock');assert.equal(provider.lastHealth.status,'available');assert.equal(provider.models.length,2);response=await fetch(`${foundry.url}/health`);const health=await response.json();assert.equal(health.ok,true);assert.equal(health.moduleId,'arkfire.models');assert.equal(health.models.discovered>=2,true);}finally{await foundry.close();await ollama.close();await rm(directory,{recursive:true,force:true});}
});

test('unavailable endpoints remain honest and do not crash the module',async()=>{
  const directory=await temporaryDirectory('model-foundry-unavailable'),foundry=await startFoundryServer({port:0,dataDirectory:directory,logger:{error(){}}});
  try{await mutate(foundry.url,'/api/providers',{body:{providerId:'ollama.absent',displayName:'Absent Ollama',endpoint:'http://127.0.0.1:9',kind:'ollama',enabled:true}});const response=await mutate(foundry.url,'/api/probe',{body:{providerIds:['ollama.absent'],timeoutMs:1000}});assert.equal(response.status,200);const body=await response.json();assert.equal(body.results[0].status,'unavailable');assert.equal(body.results[0].models.length,0);assert.ok(body.results[0].error);}finally{await foundry.close();await rm(directory,{recursive:true,force:true});}
});

test('mutation routes reject tokenless, cross-origin, and non-JSON requests',async()=>{
  const directory=await temporaryDirectory('model-foundry-csrf'),foundry=await startFoundryServer({port:0,dataDirectory:directory,logger:{error(){}}});
  try{const provider={providerId:'ollama.denied',displayName:'Denied',endpoint:'http://127.0.0.1:11434',kind:'ollama'};let response=await fetch(`${foundry.url}/api/providers`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(provider)});assert.equal(response.status,403);const csrf=await getCsrf(foundry.url);response=await fetch(`${foundry.url}/api/providers`,{method:'POST',headers:{'content-type':'application/json','x-arkfire-csrf':csrf,origin:'https://hostile.example'},body:JSON.stringify(provider)});assert.equal(response.status,403);response=await fetch(`${foundry.url}/api/providers`,{method:'POST',headers:{'content-type':'text/plain','x-arkfire-csrf':csrf},body:JSON.stringify(provider)});assert.equal(response.status,415);}finally{await foundry.close();await rm(directory,{recursive:true,force:true});}
});

test('concurrent provider mutations are serialized without lost updates',async()=>{
  const directory=await temporaryDirectory('model-foundry-concurrency'),store=new RegistryStore(directory);
  try{await store.init();await Promise.all(Array.from({length:20},(_,index)=>store.upsertProvider({providerId:`ollama.concurrent-${index}`,displayName:`Concurrent ${index}`,endpoint:`http://127.0.0.1:${12000+index}`,kind:'ollama',enabled:true})));const registry=await store.readRegistry();for(let index=0;index<20;index+=1)assert.equal(registry.providers.some(provider=>provider.providerId===`ollama.concurrent-${index}`),true);}finally{await rm(directory,{recursive:true,force:true});}
});

test('API Stuff parser classifies providers, integrations, and duplicate labels without secret leakage',()=>{
  const text=['VEE API: old-openai-secret','VEE API: replacement-openai-secret','FAER API: test-anthropic-secret','YGGDRASIL DEEPSEEK API: test-deepseek-ygg','Bluebird DeepSeek API: test-deepseek-bluebird','Vethrlauf DeepSeek API: test-deepseek-vethrlauf','HEARTHFIRE II HYDRADB: test-hydradb-secret','Supabase API URL: https://example.supabase.co','Supabase API: test-supabase-secret','Supabase Public API: test-supabase-public','Notion API: test-notion-secret'].join('\n');
  const parsed=parseApiStuff(text);assert.equal(parsed.providers.length,5);assert.equal(parsed.integrations.length,3);assert.deepEqual(parsed.duplicateLabels,['VEE API']);assert.equal(parsed.providers.find(provider=>provider.providerId==='openai.vee').secretValue,'replacement-openai-secret');const summary=secretFreeImportSummary(parsed),serialised=JSON.stringify(summary);assert.equal(serialised.includes('replacement-openai-secret'),false);assert.equal(serialised.includes('test-supabase-secret'),false);assert.equal(summary.providers.some(provider=>provider.providerId==='openai.vee'),true);assert.equal(summary.integrations.some(entry=>entry.integrationId==='supabase.flameclyffe'),true);
});

test('export includes complete receipt history and import preserves existing receipts',async()=>{
  const sourceDirectory=await temporaryDirectory('model-foundry-export'),targetDirectory=await temporaryDirectory('model-foundry-import'),source=new RegistryStore(sourceDirectory),target=new RegistryStore(targetDirectory);
  try{await source.init();await target.init();const targetReceipt=await target.appendHealthReceipt(healthResult('ollama.target-existing',1));for(let index=0;index<501;index+=1)await source.appendHealthReceipt(healthResult('ollama.source',index));const bundle=await source.exportBundle();assert.equal(bundle.healthReceipts.length,501);assert.equal(bundle.secretsIncluded,false);await target.importBundle(bundle);const restored=await target.readReceipts(null);assert.equal(restored.some(receipt=>receipt.receiptId===targetReceipt.receiptId),true);assert.equal(restored.length,502);}finally{await rm(sourceDirectory,{recursive:true,force:true});await rm(targetDirectory,{recursive:true,force:true});}
});

test('export bundle restores provider metadata into a second standalone instance',async()=>{
  const sourceDirectory=await temporaryDirectory('model-foundry-export-service'),targetDirectory=await temporaryDirectory('model-foundry-import-service'),source=await startFoundryServer({port:0,dataDirectory:sourceDirectory,logger:{error(){}}}),target=await startFoundryServer({port:0,dataDirectory:targetDirectory,logger:{error(){}}});
  try{await mutate(source.url,'/api/providers',{body:{providerId:'ollama.exported',displayName:'Exported Ollama',endpoint:'http://127.0.0.1:12000',kind:'ollama',enabled:false}});const exportResponse=await fetch(`${source.url}/api/export`),bundle=await exportResponse.json();assert.equal(bundle.secretsIncluded,false);const importResponse=await mutate(target.url,'/api/import',{body:bundle});assert.equal(importResponse.status,200);const registryResponse=await fetch(`${target.url}/api/registry`),restored=await registryResponse.json();assert.equal(restored.registry.providers.some(provider=>provider.providerId==='ollama.exported'),true);}finally{await source.close();await target.close();await rm(sourceDirectory,{recursive:true,force:true});await rm(targetDirectory,{recursive:true,force:true});}
});
