const fs = require('node:fs');
const http = require('node:http');
const assert = require('node:assert/strict');
const path = require('node:path');
const { tmpdir } = require('node:os');
const output = process.env.CHAT_SCREENSHOT_DIR || path.join(tmpdir(), 'arcadia-chat-ui');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const script = JSON.parse(fs.readFileSync('../online/酒馆助手脚本-阿卡狄亚商店online.json', 'utf8')).content;
const server = http.createServer((req,res) => {
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(req.url.startsWith('/admin/chat') ? fs.readFileSync('admin/chat.html') : '<html><body style="background:#444;--SmartThemeQuoteColor:#9b83fb;--SmartThemeBlurTintColor:#222"></body></html>');
});
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let role = 'admin', muted = false, until = null, posts = 0, activity = 0, mutePosts = 0;
    const messages = Array.from({length:205},(_,i) => ({id:`m${i}`,userId:'u1',username:'测试用户',authorRole:'user',active:i%2===0,muted:false,content:`留言 ${i}：<script>不应执行</script>`,likeCount:3,dislikeCount:2,createdAt:new Date(Date.now()-i*1000).toISOString()}));
    await page.route('**/api/**', async route => {
      const req = route.request(), pathname = new URL(req.url()).pathname;
      let data = {};
      if(pathname === '/api/chat/messages') {
        if(req.method()==='POST') { posts++; until=new Date(Date.now()+10000).toISOString(); data={message:messages[0],cooldownUntil:until,serverTime:new Date().toISOString()}; }
        else data={messages,role,mutedUntil:muted?'9999-12-31T23:59:59.999Z':null,cooldownUntil:until,serverTime:new Date().toISOString()};
      } else if(pathname==='/api/chat/activity') { activity++; data={ok:true}; }
      else if(pathname==='/api/admin/chat/messages') data={messages:messages.slice(0,50).map(m=>({...m,status:'published'})),total:205};
      else if(pathname==='/api/admin/users') data={users:[{id:'u1',username:'测试用户',role:'user',active:true,chat_muted:muted,chat_muted_until:muted?'9999-12-31T23:59:59.999Z':'',chat_muted_reason:'测试原因'}]};
      else if(pathname.includes('/mute')) { mutePosts++; muted=JSON.parse(req.postData()).action==='mute'; data={ok:true}; }
      else data={ok:true};
      await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    });
    await page.goto(base);
    await page.evaluate(base => {
      localStorage.setItem('th-arcadia-network-session',JSON.stringify({token:'test',api:base,username:'管理员',role:'admin'}));
      window.TavernHelper={getWorldbookNames:()=>[],getWorldbook:async()=>[]};
    },base);
    await page.addScriptTag({content:script});
    await page.evaluate(() => {
      const root=document.querySelector('#th-arcadia-shop-floating');
      root.style.left='20px';root.style.top='20px';
      const p=root.querySelector('.th-arcadia-window');p.hidden=false;p.style.left='0';p.style.top='0';p.style.bottom='auto';p.style.right='auto';
    });
    await page.click('.th-arcadia-chat');
    await page.waitForFunction(()=>document.querySelectorAll('.th-arcadia-chat-message').length===200);
    assert.equal(await page.locator('[data-mute]').count(),200);
    assert.ok(activity>0);
    assert.equal(await page.locator('[data-reaction=like]').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(38, 131, 79)');
    assert.equal(await page.locator('[data-reaction=dislike]').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(186, 57, 57)');
    let confirmMute = false;
    const confirmHandler = async d => {
      if(d.type()==='prompt') await d.accept(d.message().includes('原因')?'UI test':'1d');
      else {
        assert.match(d.message(), /测试用户/);
        if(confirmMute) await d.accept(); else await d.dismiss();
      }
    };
    page.on('dialog',confirmHandler);
    await page.locator('[data-mute]').last().click();
    assert.equal(mutePosts,0,'cancel must not call mute API');
    confirmMute=true;
    await page.locator('[data-mute]').last().click();
    await page.waitForFunction(()=>document.querySelector('.th-arcadia-chat-status').textContent.includes('已禁言'));
    assert.equal(mutePosts,1);
    page.off('dialog',confirmHandler);
    muted=false;
    fs.mkdirSync(output,{recursive:true});
    await page.screenshot({path:path.join(output,'chat-desktop.png')});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,'chat-mobile.png')});
    assert.ok(await page.locator('.th-arcadia-chat-compose').evaluate(el=>el.getBoundingClientRect().right<=window.innerWidth));
    // Refresh with a normal account and verify the local send guard.
    role='user';
    await page.evaluate(base => localStorage.setItem('th-arcadia-network-session',JSON.stringify({token:'user',api:base,username:'测试用户',role:'user'})),base);
    await page.reload();
    await page.addScriptTag({content:script});
    await page.evaluate(()=>{const root=document.querySelector('#th-arcadia-shop-floating');root.style.left='10px';root.style.top='10px';const p=root.querySelector('.th-arcadia-window');p.hidden=false;p.style.left='0';p.style.top='0';p.style.bottom='auto';p.style.right='auto';});
    await page.click('.th-arcadia-chat');
    await page.waitForFunction(()=>document.querySelectorAll('.th-arcadia-chat-message').length===200);
    assert.equal(await page.locator('[data-mute]').count(),0);
    await page.fill('.th-arcadia-chat-input','test');
    await page.click('.th-arcadia-chat-compose button');
    await page.waitForFunction(()=>document.querySelector('.th-arcadia-chat-compose button').textContent.includes('秒'));
    assert.equal(posts,1);
    assert.equal(await page.locator('.th-arcadia-chat-compose button').isDisabled(),true);
    // Dedicated admin UI: mute and unmute use the same endpoint.
    await page.goto(base+'/admin/chat');
    await page.click('#usersTab');
    await page.waitForSelector('[data-mute]');
    await page.click('[data-mute]');
    await page.fill('#reason','test reason');
    await page.click('#muteForm button[type=submit]');
    await page.waitForSelector('[data-unmute]');
    await page.screenshot({path:path.join(output,'chat-admin-mobile.png')});
    await page.setViewportSize({width:1280,height:900});
    await page.screenshot({path:path.join(output,'chat-admin-desktop.png')});
    page.on('dialog', d=>d.accept());
    await page.click('[data-unmute]');
    await page.waitForFunction(()=>!document.querySelector('[data-unmute]'));
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('UI passed: 200 nodes, colors, presence, role controls, cooldown, admin mute/unmute, desktop/mobile.');
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
