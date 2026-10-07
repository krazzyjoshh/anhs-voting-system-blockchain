const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { inspectStudentsCsv, parseStudentsCsv } = require('../../server/src/student-csv');
const origin = process.env.BROWSER_BASE_URL || 'http://127.0.0.1:5173';
(async () => {
  const browser = await chromium.launch({ ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const imports = [], stored = [], errors = [];
    let refuseUpload = false;
    // All requests are intercepted. The real CSV normalizer runs, but records stay in memory.
    await context.route('**/api/**', async (route) => {
      const request=route.request(), path=new URL(request.url()).pathname.replace('/api','');
      let data, status=200;
      try {
        if(path==='/admin/me') data={id:1,email:'admin@example.invalid'};
        else if(path==='/admin/stats') data={students:stored.length,activeStudents:stored.length,voted:0,turnout:0,positions:0,candidates:0,tokens:0,usedTokens:0,published:false,status:'pending'};
        else if(path==='/admin/results') data={published:false,positions:[],archivedElections:[],status:0};
        else if(path==='/admin/election/settings') data={title:'CSV Test Election',schoolYear:'',announcement:''};
        else if(path==='/admin/students' && request.method()==='GET') data={students:stored.map((student,id)=>({...student,id:id+1,active:1,has_voted:0})),sections:[]};
        else if(path==='/admin/students/preview') {const body=request.postDataJSON();const {students,...preview}=inspectStudentsCsv(body.csv,body.options);data=preview;}
        else if(path==='/admin/students/upload') {
          if(refuseUpload) {status=409;data={error:'This is locked because the election has been published.'};}
          else {const body=request.postDataJSON();const result=parseStudentsCsv(body.csv,body.options);imports.push(body);stored.push(...result.students);data={count:result.count,inserted:result.count,updated:0,skipped:result.skipped,details:result.details};}
        } else {status=404;data={error:'Unexpected fixture route'};}
      } catch(error) {status=error.status||500;data={error:error.message,details:error.details};}
      await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>localStorage.setItem('adminToken','fixture-admin'));
    await page.goto(origin+'/admin/students');await page.getByRole('heading',{name:'Students',exact:true}).waitFor();
    const chooseFile=async (csv,encoding='utf8')=>page.getByLabel('Student CSV file',{exact:true}).setInputFiles({name:'different-format.csv',mimeType:'text/csv',buffer:encoding==='utf16le'?Buffer.concat([Buffer.from([255,254]),Buffer.from(csv,'utf16le')]):Buffer.from(csv,encoding)});
    const update=page.getByRole('button',{name:'Update preview',exact:true});
    const importButton=(count)=>page.getByRole('button',{name:`Import ${count} student(s)`,exact:true});
    const map=(label,index)=>page.getByLabel(`CSV column for ${label}`,{exact:true}).selectOption(String(index));

    await chooseFile('sep=|\nSchool list\nKasarian|Pangalan|LRN|Grade & Section\nf|Juan Santos Dela Cruz|000000000010|7-Rizal\nm|Pedro Reyes|000000000011|8-Bonifacio');
    await importButton(2).waitFor();assert.equal(imports.length,0);
    assert.equal(await page.getByLabel('Row 4 First name',{exact:true}).inputValue(),'Juan Santos');
    assert.equal(await page.getByLabel('Row 4 Last name',{exact:true}).inputValue(),'Dela Cruz');
    assert.equal(await page.getByLabel('Row 4 Grade',{exact:true}).inputValue(),'Grade 7');
    await page.getByLabel('Row 4 First name',{exact:true}).fill('Juan Carlos');assert.ok(await importButton(2).isDisabled());
    await update.click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Import 2 student(s)')?.disabled);
    await importButton(2).click();await page.getByText('2 student(s) uploaded. 2 new, 0 updated.',{exact:true}).waitFor();
    assert.equal(stored[0].first_name,'Juan Carlos');assert.equal(stored[0].lrn,'000000000010');
    console.log('PASS Automatic detection, preview before save, full-name/grade-section normalization and row correction');

    await chooseFile('Identifier,Label,Group\n000000000020,Santos Juan,A\n000000000021,Reyes Ana,B');
    await importButton(0).waitFor();assert.ok(await importButton(0).isDisabled());
    await page.getByLabel('The first row contains column headers',{exact:true}).check();await update.click();
    await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Update preview')?.disabled);
    await map('LRN',0);await map('Full name',1);await map('Section',2);
    await page.getByLabel('Full name order',{exact:true}).selectOption('last-first');await page.getByLabel('Default grade',{exact:true}).fill('8');
    await update.click();await importButton(2).waitFor();await importButton(2).click();await page.getByText('2 student(s) uploaded. 2 new, 0 updated.',{exact:true}).waitFor();
    assert.equal(stored[2].last_name,'Santos');assert.equal(stored[2].first_name,'Juan');assert.equal(stored[2].grade,'Grade 8');
    console.log('PASS Unknown headers accept mapping, name order and default grade');

    await chooseFile('000000000030;Ana Reyes;F\n;Juan Dela Cruz;M','utf16le');
    await importButton(0).waitFor();assert.equal(await page.getByLabel('The first row contains column headers',{exact:true}).isChecked(),false);
    await map('LRN',0);await map('Full name',1);await map('Sex',2);
    await page.getByLabel('Default grade',{exact:true}).fill('7');await page.getByLabel('Default section',{exact:true}).fill('Rizal');
    await update.click();await importButton(1).waitFor();await page.getByRole('alert').getByText('Row 2: Missing lrn.',{exact:true}).waitFor();
    await page.getByLabel('Row 2 LRN',{exact:true}).fill('000000000031');assert.ok(await importButton(1).isDisabled());
    await update.click();await importButton(2).waitFor();
    await page.screenshot({path:'docs/ui-reference/students-csv-preview.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:'docs/ui-reference/students-csv-mobile-preview.png',fullPage:true});
    await importButton(2).click();await page.getByText('2 student(s) uploaded. 2 new, 0 updated.',{exact:true}).waitFor();
    assert.equal(stored[4].lrn,'000000000030');assert.equal(stored[5].lrn,'000000000031');assert.equal(stored[4].sex,'Female');
    console.log('PASS Headerless UTF-16 file, missing-LRN correction, leading zeros and mobile layout');

    await chooseFile('LRN,Full Name,Grade,Section\n000000000040,José Reyes,9,A','latin1');
    await importButton(1).waitFor();assert.equal(await page.getByLabel('Row 2 First name',{exact:true}).inputValue(),'José');
    refuseUpload=true;await importButton(1).click();await page.getByText('This is locked because the election has been published.',{exact:true}).waitFor();
    assert.equal(imports.length,3);assert.equal(await page.getByLabel('Row 2 First name',{exact:true}).inputValue(),'José');
    refuseUpload=false;await importButton(1).click();await page.getByText('1 student(s) uploaded. 1 new, 0 updated.',{exact:true}).waitFor();
    assert.equal(stored[6].first_name,'José');
    console.log('PASS Windows-1252 names and failed upload retain the preview for retry');

    await chooseFile('LRN,Full Name,Grade,Section\n000000000050,Juan Santos,7,A\n,Ana Reyes,7,A');
    await importButton(1).waitFor();await importButton(1).click();
    await page.getByText('1 student(s) uploaded. 1 new, 0 updated. 1 row(s) skipped; see details below.',{exact:true}).waitFor();
    await page.getByRole('alert').getByText('Row 3: Missing lrn.',{exact:true}).waitFor();
    assert.equal(stored.length,8);assert.equal(imports.length,5);assert.deepEqual(errors,[]);
    console.log('PASS Partial-import summary and skipped-row explanation; no real database writes');
    await context.close();
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
