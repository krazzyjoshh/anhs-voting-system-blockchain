const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.BROWSER_BASE_URL || 'http://127.0.0.1:5173';
const report = [];
const { inspectStudentsCsv } = require('../../server/src/student-csv');
(async () => {
  const browser = await chromium.launch({ ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const students = [{ id:1,lrn:'123456789001',first_name:'Ana',last_name:'Garcia',given_name:'Cruz',grade:'Grade 7',section:'A',sex:'Female',active:1,has_voted:0 },{id:2,lrn:'123456789002',first_name:'Pedro',last_name:'Santos',grade:'Grade 8',section:'B',sex:'Male',active:1,has_voted:1}];
    const sections = [{grade:'Grade 7',section:'A'},{grade:'Grade 8',section:'B'}];
    const positions = [{id:1,name:'President',candidates:[{id:11,full_name:'Juan Santos Dela Cruz',partylist:'Unity',grade:'Grade 10',section:'A'},{id:12,full_name:'Maria Lopez Reyes',partylist:'Leadership',grade:'Grade 10',section:'B'}]},{id:2,name:'Vice President',candidates:[{id:21,full_name:'Ana Cruz Garcia',grade:'Grade 7',section:'A'},{id:22,full_name:'Pedro Santos',grade:'Grade 8',section:'B'}]}];
    let published = false, chainStatus = 0, visible = true, generated = 0;
    let uploadResponse = { count: 1 }, uploadStatus = 200;
    let settings = {title:'SSLG General Election 2026',schoolYear:'SY 2026-2027',periodStart:'',periodEnd:'',announcement:'Participate in the Agusan National High School election.',published:false};
    const tallies = () => positions.map((p,index) => ({index,name:p.name,candidates:p.candidates.map((c,i) => ({name:c.full_name,...(visible ? {votes:i===0?2:0} : {})}))}));
    const receipts = [{receipt_code:'SAMPLE000001',created_at:'2026-10-06 05:00:00',kind:'onchain',transactions:[{signature:'test-public-signature',explorer:'https://explorer.solana.com/tx/test-public-signature?cluster=devnet'}]}];
    // All API requests are intercepted. Creation, generation and status checks touch fixture data only.
    await context.route('**/api/**', async (route) => {
      const req=route.request(),url=new URL(req.url()),method=req.method(),body=()=>req.postDataJSON(); let data, status=200;
      const path=url.pathname.replace('/api','');
      if(path==='/admin/me') data={id:1,email:'admin@school.test'};
      else if(path==='/admin/stats') data={students:students.length,activeStudents:students.filter(s=>s.active).length,voted:1,turnout:50,positions:positions.length,candidates:positions.reduce((n,p)=>n+p.candidates.length,0),tokens:4+generated,usedTokens:2,status:'pending',published};
      else if(path==='/admin/results') data={published,title:settings.title,status:chainStatus,tokensRegistered:4,electionAddress:'samplePublicAddress',positions:tallies(),archivedElections:[]};
      else if(path==='/admin/election/settings') {if(method==='PUT') settings={...body()};data={...settings,published};}
      else if(path==='/admin/students' && method==='GET') {const search=(url.searchParams.get('search')||'').toLowerCase();data={sections,students:students.filter(s=>`${s.first_name} ${s.last_name} ${s.lrn}`.toLowerCase().includes(search))};}
      else if(path==='/admin/students' && method==='POST') {const student={...body(),id:students.length+1,active:1,has_voted:0};students.push(student);data={id:student.id};}
      else if(path==='/admin/students/preview') {const {students: ignored,...preview}=inspectStudentsCsv(body().csv,body().options);data=preview;}
      else if(path==='/admin/students/upload') {data=uploadResponse;status=uploadStatus;}
      else if(/\/admin\/students\/\d+\/active/.test(path)) {const s=students.find(s=>s.id===Number(path.split('/')[3]));s.active=Number(body().active);data={ok:true};}
      else if(path==='/admin/election') data={published,positions};
      else if(path==='/admin/positions') {positions.push({id:positions.length+1,name:body().name,candidates:[]});data={ok:true};}
      else if(path==='/admin/candidates') {const c={...body(),id:99};positions.find(p=>p.id===c.position_id).candidates.push(c);data={ok:true};}
      else if(path==='/admin/tokens') data={sections,unused:2,tokens:students.slice(0,2).map((s,i)=>({...s,code:`TOKEN00${i+1}`,student_active:s.active,used:i}))};
      else if(path==='/admin/tokens/generate') {generated++;data={created:1};}
      else if(path==='/admin/blockchain') data={published,chainStatus,tokensRegistered:4,totalTokens:4,wallet:'samplePublicWalletAddress',programId:'samplePublicProgramAddress',electionAddress:'samplePublicElectionAddress',balance:2,positions:2,tokens:4,estimate:{publish:0.05,allVoters:0.04,perVoter:0.01},job:{running:false,error:'',step:'',done:0,total:0}};
      else if(path==='/admin/ledger') data={electionId:101,status:'open',address:'samplePublicElectionAddress',tokensRegistered:4,legacyReceipts:0,receipts,positions:[{index:0,name:'President',totalVotes:2}]};
      else if(path==='/admin/ledger/verify') data={note:'These are consistency checks only.',checks:[{id:'tokens',status:'PASS',explanation:'Registered token counts match.'},{id:'legacy',status:'WARNING',explanation:'Some legacy evidence is incomplete.'}]};
      else if(path==='/public/status') data={published:true,status:'open',title:settings.title,tokensRegistered:4,votesCast:2,turnoutPercent:50};
      else if(path==='/public/results') data={published:true,resultsVisible:visible,positions:tallies(),electionAddress:'samplePublicElectionAddress',programId:'samplePublicProgramAddress'};
      else if(path==='/public/election') data=settings;
      else if(path.startsWith('/public/receipt/')) data={valid:false};
      else {status=404;data={error:'Mock route unavailable'};}
      await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    });
    const page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/admin/login');await page.evaluate(()=>localStorage.setItem('adminToken','test-only-session'));
    async function open(route,heading) {await page.goto(origin+route);await page.getByRole('heading',{name:heading,exact:true}).first().waitFor();}
    await open('/admin/students','Students');await page.getByPlaceholder('Search by name or LRN', { exact: true }).fill('Ana');await page.getByText('Garcia, Ana Cruz',{exact:true}).waitFor();assert.equal(await page.getByText('Santos, Pedro',{exact:true}).count(),0);
    await page.getByPlaceholder('Search by name or LRN', { exact: true }).fill('');await page.getByText('Santos, Pedro',{exact:true}).waitFor();
    await page.getByPlaceholder('LRN',{exact:true}).fill('123456789003');await page.getByPlaceholder('Last name',{exact:true}).fill('Sample');await page.getByPlaceholder('First name',{exact:true}).fill('New');await page.getByPlaceholder('Section',{exact:true}).fill('A');await page.getByRole('button',{name:'Add',exact:true}).click();await page.getByText('Student added.',{exact:true}).waitFor();assert.equal(students.length,3);
    await page.getByRole('button',{name:'Set inactive',exact:true}).first().click();await page.getByRole('button',{name:'Set active',exact:true}).waitFor();
    await page.locator('input[type=file]').setInputFiles({name:'students.csv',mimeType:'text/csv',buffer:Buffer.from('lrn,last_name,first_name,grade,section\n1,Test,CSV,Grade 7,A')});
    await page.getByRole('button',{name:'Import 1 student(s)',exact:true}).click();await page.getByText('1 student(s) uploaded.',{exact:true}).waitFor();
    const template=page.getByRole('link',{name:'Download CSV template',exact:true});assert.equal(await template.getAttribute('download'),'');
    assert.equal((await (await page.request.get(origin+await template.getAttribute('href'))).text()).trim(),'lrn,last_name,first_name,given_name,grade,section,sex');
    report.push('Students: search, add, active status, CSV preview/import and downloadable template');
    await open('/admin/candidates','Candidates and Positions');await page.getByRole('button',{name:'+ Add candidate',exact:true}).click();await page.getByLabel('Candidate student',{exact:true}).selectOption('1');assert.equal(await page.getByPlaceholder('Full name (max 40 characters)').inputValue(),'Ana Cruz Garcia');await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Candidate added.',{exact:true}).waitFor();assert.equal(positions[0].candidates.length,3);
    report.push('Candidates: student autofill and candidate creation preserved');
    await open('/admin/tokens','Tokens');await page.getByLabel('Generate mode',{exact:true}).selectOption('name');await page.getByLabel('Generate student',{exact:true}).selectOption('2');await page.getByRole('button',{name:'Generate',exact:true}).click();await page.getByText('1 token(s) generated.',{exact:true}).waitFor();await page.getByLabel('Filter token grade',{exact:true}).selectOption('Grade 7');assert.match(await page.getByRole('link',{name:'Print',exact:true}).getAttribute('href'),/grade=Grade\+7/);
    report.push('Tokens: generation modes, filters and print query preserved');
    await open('/admin/blockchain','Blockchain');await page.getByRole('heading',{name:'Election information',exact:true}).waitFor();await page.getByPlaceholder('Enter an announcement or update from COMELEC…').fill('Updated announcement');await page.getByRole('button',{name:'Save information',exact:true}).click();await page.getByText('Election information saved.',{exact:true}).waitFor();assert.equal(settings.announcement,'Updated announcement');published=true;chainStatus=2;await page.reload();await page.getByRole('button',{name:'Start new election',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Open voting',exact:true}).isDisabled(),true);
    report.push('Blockchain: settings save preserved and closed election cannot reopen');
    await open('/admin/ledger','On-chain Ledger');await page.getByRole('button',{name:'Verify',exact:true}).click();await page.getByText('PASS',{exact:true}).waitFor();await page.getByText('WARNING',{exact:true}).waitFor();await page.getByText('SAMPLE000001',{exact:true}).waitFor();
    report.push('Ledger: verification, privacy explanation and receipt transaction links preserved');
    assert.equal(await page.locator('.admin-sidebar').getByRole('link',{name:'Public page',exact:true}).count(),0);
    await open('/',settings.title);
    assert.equal(await page.getByRole('link',{name:'Vote now',exact:true}).count(),0);
    assert.equal(await page.getByRole('link',{name:'Admin login',exact:true}).count(),0);
    assert.equal(await page.locator('.admin-page-heading button, .admin-page-heading a').count(),1);
    const fullWidth=await page.locator('main.public-page').boundingBox();assert.equal(fullWidth.x,0);assert.ok(fullWidth.width>=1439);
    assert.equal(await page.getByRole('link',{name:'Token login',exact:true}).count(),1);
    const refresh=page.getByRole('button',{name:'Refresh data',exact:true});await refresh.waitFor();
    await page.waitForFunction(()=>!document.querySelector('.admin-page-heading button')?.disabled);
    const update=page.waitForResponse(r=>r.url().endsWith('/api/public/status'));await refresh.click();await update;
    await page.getByLabel('Position',{exact:true}).selectOption('0');assert.equal(await page.locator('.admin-position-result').count(),1);await page.getByLabel('Position',{exact:true}).selectOption('all');visible=false;await page.reload();await page.getByText('Vote counts will be shown once the election is closed.',{exact:true}).waitFor();assert.equal(await page.locator('.admin-vote-count').count(),0);visible=true;
    report.push('Public page: position filter, actual turnout and hidden-tally setting preserved');
    for (const [route,heading,name] of [['/admin/students','Students','students'],['/admin/candidates','Candidates and Positions','candidates'],['/admin/tokens','Tokens','tokens'],['/admin/blockchain','Blockchain','blockchain'],['/admin/ledger','On-chain Ledger','ledger'],['/',settings.title,'public'],['/verify','Verify receipt','verify']]) {
      await page.setViewportSize({width:1440,height:1000});await open(route,heading);await page.locator('.card, .admin-report').first().waitFor();await page.screenshot({path:`docs/ui-reference/${name}-preview.png`,fullPage:true});
      await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Mobile overflow: ${route}`);
    }
    assert.deepEqual(errors,[]);report.push('Seven pages: desktop previews, no runtime errors, 390px mobile layout without page overflow');
    report.forEach(item=>console.log('PASS '+item));console.log(`Page checks passed: ${report.length}. All API calls and mutations mocked.`);
    await context.close();
  } finally {await browser.close();}
})().catch(e=>{console.error('Last completed check: '+(report.at(-1)||'none'));console.error(e.message);process.exitCode=1});
