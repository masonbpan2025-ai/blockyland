import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
test('direct bot performs basic Survival progression without a terminal or API key',async({page},testInfo)=>{
  page.on('console',m=>{if(m.type()==='error'||m.text().startsWith('[Survival fixture]')) console.log(m.text());});
  page.on('pageerror',e=>console.log('Game startup error:',e.message));
  console.log('Loading fixture browser');
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.game?.playerBot&&window.game?.bedManager&&window.game?.targetBoxMesh,null,{timeout:60000});
  console.log('Game ready; running direct API progression');
  const result=await page.evaluate(async()=>{
    const {runBasicSurvival}=await import('/e2e/fixtures/survivalFixture.js');
    return runBasicSurvival(window.game);
  });
  await fs.mkdir('docs/artifacts',{recursive:true});
  await fs.writeFile('docs/artifacts/survival-progression.json',JSON.stringify(result,null,2));
  await testInfo.attach('survival-progression',{body:JSON.stringify(result,null,2),contentType:'application/json'});
  console.log(JSON.stringify({failure:result.failure,steps:result.steps.length,checks:result.checks},null,2));
  expect(result.failure).toBeNull();
  // Parity failures are findings in the audit, independent of bot completion.
  expect(result.checks.find(c=>c.name==='terminal stayed closed').ok).toBe(true);
  expect(result.checks.find(c=>c.name==='bot released controls').ok).toBe(true);
});
