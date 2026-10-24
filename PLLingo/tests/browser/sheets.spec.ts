import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gasHarness, TEST_TOKEN } from '../helpers/gas';
const endpoint='https://script.google.com/macros/s/pllingo-test-deployment/exec';
async function emulateGoogle(page:Page,gas:ReturnType<typeof gasHarness>,calls:any[]){
  await page.exposeBinding('testGas',(_source,request)=>{calls.push(request);return gas.rpc(request);});
  await page.route('https://script.google.com/macros/s/**',async route=>{
    const url=new URL(route.request().url());const origin=url.searchParams.get('origin'),channel=url.searchParams.get('channel');
    const child='https://test-script.googleusercontent.com/bridge?'+new URLSearchParams({origin:origin!,channel:channel!});
    await route.fulfill({contentType:'text/html',body:`<!doctype html><iframe src="${child.replace(/&/g,'&amp;')}"></iframe>`});
  });
  await page.route('https://test-script.googleusercontent.com/bridge?**',async route=>{
    const url=new URL(route.request().url());
    const fake=`<script>const google={script:{get run(){let success,failure;return {withSuccessHandler(fn){success=fn;return this},withFailureHandler(fn){failure=fn;return this},rpc(request){window.testGas(request).then(success,failure)}}}}};</script>`;
    const bridge=readFileSync('google-apps-script/Bridge.html','utf8').replace('<?!= originJSON ?>',JSON.stringify(url.searchParams.get('origin'))).replace('<?!= channelJSON ?>',JSON.stringify(url.searchParams.get('channel'))).replace('<script>',fake+'<script>');
    await route.fulfill({contentType:'text/html',body:bridge});
  });
}
async function connect(page:Page){
  await page.goto('/PLLingo/#settings');await page.getByLabel('Apps Script 웹앱 URL').fill(endpoint);await page.getByLabel('Google Sheets 연결 비밀번호').fill(TEST_TOKEN);await page.getByRole('button',{name:'Google Sheets 연결',exact:true}).click();await expect(page.getByText('Google Sheets 연결됨', {exact:true})).toBeVisible();
}
test('GitHub Pages 빌드는 Node API 없이 전체 데모 흐름과 사진 복원을 제공',async({page})=>{
  const apiCalls:string[]=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))apiCalls.push(r.url());});
  await page.goto('/PLLingo/');await expect(page.getByRole('heading',{name:'오늘도, 한 걸음 더'})).toBeVisible();await expect(page.getByText('MOCK · 브라우저',{exact:true})).toBeVisible();await page.getByRole('button',{name:'오늘의 학습 시작',exact:true}).click();await page.getByRole('textbox',{name:'나의 답안'}).fill('나의 호스팅 풀이');await page.getByTestId('photo-input').setInputFiles('tests/fixtures/answer-a.png');await expect(page.locator('.photo-card')).toHaveCount(1);await page.getByRole('button',{name:'1번 사진 회전',exact:true}).click();await page.reload();await expect(page.getByRole('textbox',{name:'나의 답안'})).toHaveValue('나의 호스팅 풀이');await expect(page.locator('.photo-preview img').first()).toHaveAttribute('style',/90deg/);
  for(const rotation of [180,270]){await page.getByRole('button',{name:'1번 사진 회전',exact:true}).click();await page.reload();await expect(page.locator('.photo-preview img').first()).toHaveAttribute('style',`transform: rotate(${rotation}deg);`);}
  for(const scenario of ['rate_limit','network_error']){await page.getByLabel('데모 채점 상태').selectOption(scenario);await page.getByRole('button',{name:'답안 제출하기'}).click();await expect(page.getByRole('alert')).toBeVisible();}
  await page.getByLabel('데모 채점 상태').selectOption('correct');await page.getByRole('button',{name:'답안 제출하기'}).click();await expect(page.getByRole('heading',{name:'정답',exact:true})).toBeVisible();await page.getByRole('button',{name:'모범 답안 보기'}).click();await expect(page.locator('.katex-display').first()).toBeVisible();expect(apiCalls).toEqual([]);
});
test('Sheets 브리지는 실제 설치 코드를 실행해 저장·다른 기기 복원을 검증하고 사진/토큰은 저장하지 않음',async({page,browser})=>{
  const gas=gasHarness(),calls:any[]=[];await emulateGoogle(page,gas,calls);await connect(page);
  await page.goto('/PLLingo/#bank');await page.getByRole('button',{name:'Pair의 의미 규칙 완성하기',exact:true}).click();await page.getByTestId('photo-input').setInputFiles('tests/fixtures/answer-a.png');await expect(page.locator('.photo-card')).toHaveCount(1);await page.getByRole('button',{name:'답안 제출하기'}).click();await expect(page.getByRole('heading',{name:'부분 정답',exact:true})).toBeVisible();
  await page.goto('/PLLingo/#settings');await page.getByRole('button',{name:'시트에 저장',exact:true}).click();await expect(page.getByRole('status')).toContainText('시트에 저장했습니다.');const saved=gas.rpc({action:'state.get'}).value.records;expect(saved.submissions).toHaveLength(1);expect(saved.submissions[0].cloudOmissions.photoCount).toBe(1);expect(JSON.stringify(saved)).not.toContain('data:image/');expect(JSON.stringify(saved)).not.toContain(TEST_TOKEN);
  expect(calls.find(c=>c.payload?.url==='/grade').payload.body.draft.photos).toEqual([]);expect(calls.find(c=>c.payload?.url==='/grade').payload.body.draft.photoCount).toBe(1);expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain(TEST_TOKEN);
  const context=await browser.newContext();const other=await context.newPage();await emulateGoogle(other,gas,calls);await connect(other);other.on('dialog',dialog=>dialog.accept());await other.getByRole('button',{name:'시트에서 불러오기',exact:true}).click();await expect(other.getByRole('status')).toContainText('제출 1개를 불러왔습니다.');await other.goto('/PLLingo/#review');await expect(other.locator('.review-card')).toHaveCount(1);await other.getByRole('button',{name:'제출 이력 · 답안 비교'}).click();await expect(other.locator('.attempt')).toContainText('사진 1장·원문 context는 이 기기에 없습니다');await context.close();
  await page.reload();await expect(page.getByText('Google Sheets 연결됨',{exact:true})).toHaveCount(0);await expect(page.getByLabel('Google Sheets 연결 비밀번호')).toHaveValue('');await expect(page.getByLabel('Apps Script 웹앱 URL')).toHaveValue(endpoint);
});
test('연결된 Sheets의 실패는 브라우저 mock 성공으로 조용히 대체되지 않음',async({page})=>{
  const gas=gasHarness(),calls:any[]=[];await emulateGoogle(page,gas,calls);await connect(page);gas.settings.AI_PROVIDER='live';await page.goto('/PLLingo/#bank');await page.getByRole('button',{name:'Pair의 의미 규칙 완성하기',exact:true}).click();await page.getByRole('textbox',{name:'나의 답안'}).fill('원격 오류 테스트');await page.getByLabel('데모 채점 상태').selectOption('correct');await page.getByRole('button',{name:'답안 제출하기'}).click();await expect(page.getByRole('alert')).toContainText('Gemini는 아직 연결하지 않았습니다');await expect(page.getByRole('heading',{name:'정답',exact:true})).toHaveCount(0);
});
