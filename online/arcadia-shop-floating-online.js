/**
 * 阿卡狄亚商店世界书悬浮球
 *
 * 用法：将本文件内容复制到酒馆助手的“全局脚本”并启用。
 * 默认读取世界书前缀：『总世界书』阿卡狄亚商店（忽略后面的版本号）
 */
(() => {
  const WORLD_BOOK_PREFIX = '『总世界书』阿卡狄亚商店';
  const ROOT_ID = 'th-arcadia-shop-floating';
  const STORAGE_KEY = 'th-arcadia-shop-floating-position';
  const debug = (...args) => {
    try {
      const text = args.map(value => {
        if (value && typeof value === 'object') {
          try { return JSON.stringify(value); } catch (_) {}
        }
        return String(value);
      }).join(' ');
      console.info('[阿卡狄亚调试]', text);
    } catch (_) {}
  };
  debug('脚本开始执行', {
    readyState: document?.readyState,
    href: (() => { try { return location.href; } catch (_) { return 'unknown'; } })(),
  });
  // SillyDroid 可能把脚本放在隔离 iframe 中；优先使用可访问的宿主窗口，
  // 但任何跨域/沙箱异常都回退到当前窗口。
  const parentWindow = (() => {
    try {
      const candidate = window.parent;
      return candidate && candidate.document ? candidate : window;
    } catch (_) {
      // 某些移动前端会隔离 iframe，无法访问 parent，回退到脚本所在页面。
      return window;
    }
  })();
  const parentDocument = parentWindow.document;
  // 记录脚本所在 iframe。停用全局脚本时，部分前端只会移除 iframe，
  // 不会触发 iframe 的 pagehide/unload，因此由宿主文档观察其生命周期。
  const scriptFrame = (() => {
    try { return window.frameElement || null; } catch (_) { return null; }
  })();
  debug('宿主环境已解析', {
    sameWindow: parentWindow === window,
    hasDocument: !!parentDocument,
    readyState: parentDocument?.readyState,
    hasBody: !!parentDocument?.body,
    hasDocumentElement: !!parentDocument?.documentElement,
  });
  parentWindow.__TH_ARCADIA_CLEANUP__?.();
  const cleanupController = new AbortController();

  // 脚本热重载或重复启用时，先清理旧实例。
  parentDocument.getElementById(ROOT_ID)?.remove();

  const root = parentDocument.createElement('div');
  root.id = ROOT_ID;
  root.innerHTML = `
    <button class="th-arcadia-orb" type="button" title="打开阿卡狄亚商店">店</button>
    <section class="th-arcadia-window" hidden aria-label="阿卡狄亚商店">
      <header class="th-arcadia-header">
        <button class="th-arcadia-settings-back-header" type="button" hidden>‹ 返回</button>
        <strong>阿卡狄亚商店</strong>
        <div class="th-arcadia-actions">
          <div class="th-arcadia-mode" role="group" aria-label="模式">
            <button class="th-arcadia-mode-run active" type="button">运行</button>
            <button class="th-arcadia-mode-edit" type="button">编辑</button>
          </div>
          <button class="th-arcadia-settings-button" type="button" title="AI 设置">⚙</button>
          <button class="th-arcadia-refresh" type="button" title="重新读取世界书">↻</button>
          <button class="th-arcadia-network" type="button" title="联网更新与创意工坊">联网</button>
          <button class="th-arcadia-close" type="button" title="关闭">×</button>
        </div>
      </header>
      <div class="th-arcadia-status">点击刷新读取商品条目</div>
      <div class="th-arcadia-body">
        <aside class="th-arcadia-sidebar"></aside>
        <article class="th-arcadia-detail">
          <div class="th-arcadia-empty">从左侧选择一个条目</div>
          <div class="th-arcadia-content" hidden>
            <div class="th-arcadia-title-row">
              <h2></h2>
              <div class="th-arcadia-title-actions">
                <button class="th-arcadia-collapse-all" type="button" title="折叠当前商品的全部内容">折叠</button>
                <button class="th-arcadia-fill" type="button" title="填入酒馆输入框">填入</button>
              </div>
            </div>
            <div class="th-arcadia-sections"></div>
          </div>
          <div class="th-arcadia-editor" hidden>
            <label class="th-arcadia-editor-field">AI 提示词<textarea class="th-arcadia-ai-prompt" rows="3" placeholder="例如：帮我设计一把适合新手使用的激光手枪"></textarea></label>
            <button class="th-arcadia-ai-write" type="button">使用 AI 帮写</button>
            <label class="th-arcadia-editor-field">条目名称<input class="th-arcadia-editor-name" type="text"></label>
            <label class="th-arcadia-editor-field">顺序<input class="th-arcadia-editor-order" type="number" step="1"></label>
            <label class="th-arcadia-editor-field">触发策略<select class="th-arcadia-editor-strategy"><option value="selective">绿灯（关键词触发）</option><option value="constant">蓝灯（始终启用）</option></select></label>
            <label class="th-arcadia-editor-field">插入位置<select class="th-arcadia-editor-position"><option value="after_character_definition">角色定义后</option><option value="before_character_definition">角色定义前</option><option value="after_example_messages">示例消息后</option><option value="before_example_messages">示例消息前</option><option value="after_author_note">作者注释后</option><option value="before_author_note">作者注释前</option><option value="at_depth">指定深度</option><option value="outlet">Outlet</option></select></label>
            <label class="th-arcadia-editor-field">触发关键词<textarea class="th-arcadia-editor-keys" rows="3" placeholder="每行一个，也支持逗号分隔"></textarea></label>
            <div class="th-arcadia-editor-sections"></div>
            <button class="th-arcadia-save" type="button">保存到世界书</button>
            <button class="th-arcadia-delete" type="button">删除当前条目</button>
            <div class="th-arcadia-upload-row">
              <button class="th-arcadia-upload-entry" type="button">上传当前条目到创意工坊</button>
              <button class="th-arcadia-upload-mainline" type="button" hidden>上传至主线世界书</button>
            </div>
          </div>
          <div class="th-arcadia-settings" hidden>
            <div class="th-arcadia-settings-status">设置页面已打开</div>
            <details class="th-arcadia-settings-module">
              <summary>AI 设置</summary>
              <div class="th-arcadia-settings-module-body">
                <label class="th-arcadia-editor-field">AI 来源<select class="th-arcadia-ai-source"><option value="tavern">酒馆源</option><option value="custom">自定义 OpenAI 兼容</option></select></label>
                <label class="th-arcadia-editor-field">自定义端点<input class="th-arcadia-ai-endpoint" type="url" placeholder="https://api.openai.com/v1"></label>
                <label class="th-arcadia-editor-field">密钥<input class="th-arcadia-ai-key" type="password" placeholder="可留空"></label>
                <div class="th-arcadia-model-row"><select class="th-arcadia-ai-model"></select><button class="th-arcadia-models" type="button">获取模型列表</button></div>
                <label class="th-arcadia-editor-field">温度<input class="th-arcadia-ai-temperature" type="number" min="0" max="2" step="0.1"></label>
                <label class="th-arcadia-editor-field">频率惩罚<input class="th-arcadia-ai-frequency" type="number" min="-2" max="2" step="0.1"></label>
                <label class="th-arcadia-editor-field">存在惩罚<input class="th-arcadia-ai-presence" type="number" min="-2" max="2" step="0.1"></label>
                <label class="th-arcadia-editor-field">Top P<input class="th-arcadia-ai-top-p" type="number" min="0" max="1" step="0.05"></label>
                <button class="th-arcadia-settings-save" type="button">保存</button>
              </div>
            </details>
            <details class="th-arcadia-settings-module">
              <summary>提示词设置</summary>
              <div class="th-arcadia-settings-module-body">
                <label class="th-arcadia-editor-field">系统提示词<textarea class="th-arcadia-ai-system-prompt" rows="6" placeholder="定义 AI 的写作身份和要求"></textarea></label>
                <div class="th-arcadia-settings-hint">此提示词会作为 AI 的系统指令，标签格式约束仍会自动附加。</div>
                <button class="th-arcadia-prompt-save" type="button">保存提示词</button>
              </div>
            </details>
            <details class="th-arcadia-settings-module">
              <summary>界面设置</summary>
              <div class="th-arcadia-settings-module-body">
                <div class="th-arcadia-editor-field">界面模式
                  <div class="th-arcadia-ui-mode" role="group" aria-label="界面模式">
                    <button class="th-arcadia-ui-mode-desktop" type="button">电脑端</button>
                    <button class="th-arcadia-ui-mode-mobile" type="button">手机端</button>
                  </div>
                </div>
                <label class="th-arcadia-editor-field">字体大小（px）<input class="th-arcadia-ui-font-size" type="number" min="10" max="24" step="1"></label>
                <div class="th-arcadia-settings-hint">调整悬浮窗内文字大小，悬浮球大小不变。</div>
                <button class="th-arcadia-ui-save" type="button">保存界面设置</button>
              </div>
            </details>
          </div>
          <div class="th-arcadia-network-panel" hidden>
            <div class="th-arcadia-network-status">联网页面已打开</div>
            <details class="th-arcadia-settings-module" open>
              <summary>账户信息</summary>
              <div class="th-arcadia-settings-module-body">
                <label class="th-arcadia-editor-field">账号<input class="th-arcadia-network-user" type="text"></label>
                <label class="th-arcadia-editor-field">密码<input class="th-arcadia-network-pass" type="password"></label>
                <div class="th-arcadia-network-auth-row"><button class="th-arcadia-network-login" type="button">登录</button><button class="th-arcadia-network-register" type="button">注册并登录</button><button class="th-arcadia-network-logout" type="button">退出登录</button></div>
                <div class="th-arcadia-network-user-state">未登录</div>
              </div>
            </details>
            <details class="th-arcadia-settings-module th-arcadia-workshop-module">
              <summary>创意工坊</summary>
              <div class="th-arcadia-settings-module-body">
                <div class="th-arcadia-workshop-filters">
                  <select class="th-arcadia-workshop-category"><option value="">全部分类</option><option>商品</option><option>综合商品</option><option>生物</option><option>药品</option><option>改造</option><option>特殊改造</option><option>装备</option><option>武器</option></select>
                  <select class="th-arcadia-workshop-sort"><option value="newest">上传时间：最新</option><option value="oldest">上传时间：最早</option><option value="downloads_desc">下载量：从高到低</option><option value="downloads_asc">下载量：从低到高</option><option value="likes_desc">点赞量：从高到低</option><option value="likes_asc">点赞量：从低到高</option></select>
                  <input class="th-arcadia-workshop-search" type="search" placeholder="搜索条目名或上传者">
                </div>
                <div class="th-arcadia-network-actions" hidden><button class="th-arcadia-network-list" type="button">获取创意工坊</button><button class="th-arcadia-workshop-collapse-all" type="button">折叠全部</button></div>
                <div class="th-arcadia-network-items"></div><div class="th-arcadia-workshop-pager"></div>
              </div>
            </details>
            <details class="th-arcadia-settings-module th-arcadia-mainline-module">
              <summary>世界书本体</summary>
              <div class="th-arcadia-settings-module-body">
                <div class="th-arcadia-workshop-filters">
                  <select class="th-arcadia-mainline-category"><option value="">全部分类</option><option>商品</option><option>综合商品</option><option>生物</option><option>药品</option><option>改造</option><option>特殊改造</option><option>装备</option><option>武器</option></select>
                  <select class="th-arcadia-mainline-sort"><option value="newest">更新时间：最新</option><option value="oldest">更新时间：最早</option></select>
                  <input class="th-arcadia-mainline-search" type="search" placeholder="搜索条目名或上传者">
                </div>
                <div class="th-arcadia-mainline-actions"><button class="th-arcadia-mainline-refresh" type="button">读取世界书本体</button><button class="th-arcadia-mainline-update" type="button" hidden>从主线更新本地</button><button class="th-arcadia-mainline-collapse-all" type="button">折叠全部</button></div>
                <div class="th-arcadia-mainline-items"></div><div class="th-arcadia-mainline-pager"></div>
              </div>
            </details>
          </div>
        </article>
      </div>
    </section>
  `;

  const style = parentDocument.createElement('style');
  style.textContent = `
    /* 根节点本身占据最高层级，避免 SillyDroid 的 WebView 层叠上下文遮住子元素。 */
    #${ROOT_ID} {
      position: fixed !important;
      left: 0;
      top: 0;
      width: 48px !important;
      height: 48px !important;
      overflow: visible !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      display: block !important;
      visibility: visible !important;
      font-family: var(--mainFontFamily, sans-serif);
      color: var(--SmartThemeBodyColor, #eee);
    }
    #${ROOT_ID} [hidden] { display: none !important; }
    #${ROOT_ID} button { font: inherit; color: inherit; pointer-events: auto; }
    #${ROOT_ID} .th-arcadia-orb {
      position: absolute !important; left: 0; top: 0; z-index: 2;
      width: 48px; height: 48px; border: 1px solid var(--SmartThemeQuoteColor, #888);
      border-radius: 50%; background: var(--SmartThemeBlurTintColor, #333);
      box-shadow: 0 3px 12px #0008; cursor: grab; font-weight: 700;
      display: flex !important; visibility: visible !important; opacity: 1 !important;
      align-items: center !important; justify-content: center !important;
      padding: 0 !important; line-height: 1 !important; text-align: center !important;
      touch-action: none; user-select: none; -webkit-user-select: none;
    }
    #${ROOT_ID} .th-arcadia-orb:active { cursor: grabbing; }
    #${ROOT_ID} .th-arcadia-window {
      position: absolute; right: 0; bottom: 58px; z-index: 1;
      width: min(380px, calc(100vw - 24px)); height: min(560px, calc(100vh - 110px));
      overflow: hidden; border: 1px solid var(--SmartThemeBorderColor, #666);
      border-radius: 8px; background: var(--SmartThemeBlurTintColor, #222);
      box-shadow: 0 8px 28px #000a; pointer-events: auto;
      font-size: var(--th-arcadia-font-size, 14px);
    }
    #${ROOT_ID} .th-arcadia-window.ui-desktop { width: min(680px, calc(100vw - 32px)); height: min(720px, calc(100vh - 90px)); }
    #${ROOT_ID} .th-arcadia-window.ui-desktop .th-arcadia-body { grid-template-columns: 190px minmax(0, 1fr); }
    #${ROOT_ID} .th-arcadia-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 10px; background: var(--SmartThemeQuoteColor, #444); cursor: move;
      user-select: none; position: relative; z-index: 10;
    }
    #${ROOT_ID} .th-arcadia-actions { display: flex; gap: 6px; }
    #${ROOT_ID} .th-arcadia-mode { display: flex; gap: 2px; padding: 2px; border-radius: 5px; background: #0002; }
    #${ROOT_ID} .th-arcadia-mode button { border: 0; border-radius: 3px; padding: 3px 6px; background: transparent; cursor: pointer; font-size: 12px; }
    #${ROOT_ID} .th-arcadia-mode button.active { background: #fff3; font-weight: 700; }
    #${ROOT_ID} .th-arcadia-settings-button { border: 0; border-radius: 4px; background: transparent; cursor: pointer; padding: 3px 6px; }
    #${ROOT_ID} .th-arcadia-actions button, #${ROOT_ID} .th-arcadia-back {
      border: 0; border-radius: 4px; background: transparent; cursor: pointer; padding: 2px 6px;
    }
    #${ROOT_ID} .th-arcadia-actions button:hover, #${ROOT_ID} .th-arcadia-back:hover {
      background: #ffffff22;
    }
    #${ROOT_ID} .th-arcadia-status { padding: 7px 10px; font-size: 12px; opacity: .75; }
    #${ROOT_ID} .th-arcadia-body { display: grid; grid-template-columns: 135px minmax(0, 1fr); height: calc(100% - 70px); overflow: hidden; }
    #${ROOT_ID} .th-arcadia-sidebar { overflow: auto; padding: 0 6px 8px; border-right: 1px solid #ffffff1c; }
    #${ROOT_ID} .th-arcadia-category { margin: 5px 0; border-bottom: 1px solid #ffffff1c; }
    #${ROOT_ID} .th-arcadia-category > summary { padding: 5px 2px; font-size: 12px; opacity: .75; cursor: pointer; font-weight: 700; }
    #${ROOT_ID} .th-arcadia-category > summary::marker { color: var(--SmartThemeQuoteColor, #aaa); }
    #${ROOT_ID} .th-arcadia-list { display: grid; gap: 4px; }
    #${ROOT_ID} .th-arcadia-item {
      display: block; width: 100%; padding: 7px 6px; border: 1px solid #ffffff1c;
      border-radius: 5px; background: #ffffff0b; text-align: left; cursor: pointer;
    }
    #${ROOT_ID} .th-arcadia-item:hover, #${ROOT_ID} .th-arcadia-item.active { background: #ffffff22; }
    #${ROOT_ID} .th-arcadia-detail { overflow: auto; padding: 0 10px 10px; }
    #${ROOT_ID} .th-arcadia-detail h2 { margin: 10px 0; font-size: 18px; }
    #${ROOT_ID} .th-arcadia-title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    #${ROOT_ID} .th-arcadia-title-row h2 { min-width: 0; overflow-wrap: anywhere; }
    #${ROOT_ID} .th-arcadia-title-actions { display: flex; flex-shrink: 0; gap: 5px; }
    #${ROOT_ID} .th-arcadia-collapse-all { border: 0; border-radius: 4px; padding: 5px 8px; background: #ffffff18; cursor: pointer; white-space: nowrap; }
    #${ROOT_ID} .th-arcadia-collapse-all:hover { background: #ffffff2c; }
    #${ROOT_ID} .th-arcadia-fill { border: 0; border-radius: 4px; padding: 5px 8px; background: var(--SmartThemeQuoteColor, #555); cursor: pointer; white-space: nowrap; }
    #${ROOT_ID} .th-arcadia-fill:hover { filter: brightness(1.2); }
    #${ROOT_ID} .th-arcadia-empty { padding-top: 12px; opacity: .7; }
    #${ROOT_ID} .th-arcadia-section { margin: 0 0 7px; border: 1px solid #ffffff1c; border-radius: 5px; overflow: hidden; }
    #${ROOT_ID} .th-arcadia-section > summary { padding: 7px 8px; background: #ffffff0b; cursor: pointer; font-weight: 700; }
    #${ROOT_ID} .th-arcadia-section > div { padding: 8px; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5; }
    #${ROOT_ID} .th-arcadia-category-head { display: flex; align-items: center; justify-content: space-between; }
    #${ROOT_ID} .th-arcadia-add { border: 0; background: transparent; cursor: pointer; padding: 2px 6px; font-size: 18px; }
    #${ROOT_ID} .th-arcadia-editor { overflow: auto; height: 100%; padding: 8px 10px 12px; }
    #${ROOT_ID} .th-arcadia-editor-field { display: grid; gap: 4px; margin-bottom: 8px; font-size: 12px; opacity: .9; }
    #${ROOT_ID} .th-arcadia-editor input, #${ROOT_ID} .th-arcadia-editor textarea { box-sizing: border-box; width: 100%; border: 1px solid #ffffff2a; border-radius: 4px; padding: 7px; background: #0003; color: inherit; font: inherit; }
    #${ROOT_ID} .th-arcadia-editor textarea { min-height: 70px; resize: vertical; }
    #${ROOT_ID} .th-arcadia-editor-tag { margin: 0 0 8px; border: 1px solid #ffffff1c; border-radius: 5px; overflow: hidden; }
    #${ROOT_ID} .th-arcadia-editor-tag summary { padding: 7px 8px; background: #ffffff0b; cursor: pointer; font-weight: 700; }
    #${ROOT_ID} .th-arcadia-editor-tag textarea { border: 0; border-top: 1px solid #ffffff1c; border-radius: 0; }
    #${ROOT_ID} .th-arcadia-save { width: 100%; border: 0; border-radius: 4px; padding: 8px; background: var(--SmartThemeQuoteColor, #555); color: inherit; cursor: pointer; }
    #${ROOT_ID} .th-arcadia-ai-write { width: 100%; margin-bottom: 9px; border: 0; border-radius: 4px; padding: 8px; background: #4a7; color: #fff; cursor: pointer; }
    #${ROOT_ID} .th-arcadia-settings { position: absolute; top: 48px; right: 0; bottom: 0; left: 0; z-index: 5; overflow: auto; height: auto; padding: 8px 10px; background: var(--SmartThemeBlurTintColor, #222); }
    #${ROOT_ID} .th-arcadia-settings-module { border: 1px solid #ffffff1c; border-radius: 5px; overflow: hidden; }
    #${ROOT_ID} .th-arcadia-settings-module > summary { padding: 9px 10px; background: #ffffff0b; cursor: pointer; font-weight: 700; }
    #${ROOT_ID} .th-arcadia-settings-back-header { border: 0; border-radius: 4px; padding: 3px 8px; background: #ffffff18; color: inherit; cursor: pointer; }
    #${ROOT_ID} .th-arcadia-settings-module-body { padding: 10px; }
    #${ROOT_ID} .th-arcadia-ui-mode { display: flex; gap: 6px; }
    #${ROOT_ID} .th-arcadia-ui-mode button {
      flex: 1; border: 1px solid #ffffff2a; border-radius: 4px; padding: 7px 9px;
      background: #111; color: #fff; cursor: pointer;
    }
    #${ROOT_ID} .th-arcadia-ui-mode button.active { background: #e89424; border-color: #e89424; color: #fff; font-weight: 700; }
    #${ROOT_ID} .th-arcadia-settings input,
    #${ROOT_ID} .th-arcadia-settings textarea,
    #${ROOT_ID} .th-arcadia-settings select {
      box-sizing: border-box; width: 100%; border: 1px solid #ffffff2a; border-radius: 4px;
      padding: 7px; background: #111 !important; color: #fff !important; font: inherit;
      color-scheme: dark;
    }
    #${ROOT_ID} .th-arcadia-settings input::placeholder,
    #${ROOT_ID} .th-arcadia-settings textarea::placeholder { color: #aaa; opacity: 1; }
    #${ROOT_ID} .th-arcadia-settings-hint { font-size: 12px; opacity: .65; line-height: 1.4; }
    #${ROOT_ID} .th-arcadia-network-panel { position: absolute; top: 48px; right: 0; bottom: 0; left: 0; z-index: 5; overflow: auto; padding: 8px 10px; background: var(--SmartThemeBlurTintColor, #222); }
    #${ROOT_ID} .th-arcadia-network-status, #${ROOT_ID} .th-arcadia-settings-status { min-height: 20px; margin: 0 0 8px; padding: 7px 10px; border-radius: 4px; background: #ffffff0b; color: #ddd; font-size: 12px; line-height: 1.4; }
    #${ROOT_ID} .th-arcadia-network-status, #${ROOT_ID} .th-arcadia-settings-status { position: sticky; top: 0; z-index: 20; background: var(--SmartThemeBlurTintColor, #222); border-bottom: 1px solid #ffffff1c; }
    #${ROOT_ID} .th-arcadia-network-auth-row, #${ROOT_ID} .th-arcadia-network-actions { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
    #${ROOT_ID} .th-arcadia-mainline-actions { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
    #${ROOT_ID} .th-arcadia-mainline-actions button { border: 0; border-radius: 4px; padding: 7px 9px; background: #e89424; color: #fff; cursor: pointer; }
    #${ROOT_ID} .th-arcadia-mainline-actions button:hover { filter: brightness(1.12); }
    #${ROOT_ID} .th-arcadia-network-auth-row button, #${ROOT_ID} .th-arcadia-network-actions button { border: 0; border-radius: 4px; padding: 7px 9px; background: #e89424; color: #fff; cursor: pointer; }
    #${ROOT_ID} .th-arcadia-network-items { display: grid; gap: 5px; margin-top: 8px; }
    #${ROOT_ID} .th-arcadia-pager { display: flex; align-items: center; justify-content: center; gap: 4px; margin-top: 8px; }
    #${ROOT_ID} .th-arcadia-pager button { min-width: 28px; border: 0; border-radius: 4px; padding: 5px 7px; background: #333; color: #fff; cursor: pointer; }
    #${ROOT_ID} .th-arcadia-pager button:disabled { opacity: .35; cursor: default; }
    #${ROOT_ID} .th-arcadia-pager-label { min-width: 82px; color: #bbb; text-align: center; font-size: 12px; }
    #${ROOT_ID} .th-arcadia-workshop-filters { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px; }
    #${ROOT_ID} .th-arcadia-workshop-filters input { grid-column: 1 / -1; box-sizing: border-box; width: 100%; border: 1px solid #ffffff2a; border-radius: 4px; padding: 7px; background: #111; color: #fff; }
    #${ROOT_ID} .th-arcadia-workshop-filters select { min-width: 0; box-sizing: border-box; width: 100%; border: 1px solid #ffffff2a; border-radius: 4px; padding: 7px; background: #111; color: #fff; }
    #${ROOT_ID} .th-arcadia-network-item { border: 1px solid #ffffff2a; border-radius: 4px; background: #111; color: #fff; overflow: hidden; }
    #${ROOT_ID} .th-arcadia-network-item > summary { display: flex; align-items: center; gap: 8px; padding: 9px 10px 9px 16px; cursor: pointer; list-style: none; }
    #${ROOT_ID} .th-arcadia-network-item > summary::-webkit-details-marker { display: none; }
    #${ROOT_ID} .th-arcadia-network-item > summary::before { content: '▸'; opacity: .75; }
    #${ROOT_ID} .th-arcadia-network-item[open] > summary::before { content: '▾'; }
    #${ROOT_ID} .th-arcadia-network-item-title { min-width: 0; flex: 1; overflow-wrap: anywhere; }
    #${ROOT_ID} .th-arcadia-network-item-author { flex: 0 0 auto; max-width: 25%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #aaa; font-size: 12px; }
    #${ROOT_ID} .th-arcadia-network-item-stats { flex: 0 0 auto; color: #888; font-size: 12px; white-space: nowrap; }
    #${ROOT_ID} .th-arcadia-network-item-actions { display: flex; gap: 6px; margin-left: 10px; flex: 0 0 auto; }
    #${ROOT_ID} .th-arcadia-source-dot { position: absolute; top: 6px; right: 7px; display: block; width: 7px; height: 7px; border-radius: 50%; box-shadow: 0 0 0 1px #0008; }
    #${ROOT_ID} .th-arcadia-source-mainline { background: #45c878; }
    #${ROOT_ID} .th-arcadia-source-workshop { background: #4d8dff; }
    #${ROOT_ID} .th-arcadia-source-local { background: #e05252; }
    #${ROOT_ID} .th-arcadia-source-conflict { background: #e5b84b; }
    #${ROOT_ID} .th-arcadia-entry-status-dot { display: inline-block; flex: 0 0 auto; width: 8px; height: 8px; border-radius: 50%; box-shadow: 0 0 0 1px #0008; }
    #${ROOT_ID} .th-arcadia-entry-status-workshop-downloaded { background: #4d8dff; }
    #${ROOT_ID} .th-arcadia-entry-status-workshop-missing { background: #e05252; }
    #${ROOT_ID} .th-arcadia-entry-status-workshop-updated { background: #e5b84b; }
    #${ROOT_ID} .th-arcadia-section-diff-dot { display: inline-block; width: 7px; height: 7px; margin-left: 7px; border-radius: 50%; background: #e05252; box-shadow: 0 0 0 1px #0008; vertical-align: middle; }
    #${ROOT_ID} .th-arcadia-entry-status-mainline-updated { background: #45c878; }
    #${ROOT_ID} .th-arcadia-entry-status-mainline-stale { background: #e5b84b; }
    #${ROOT_ID} .th-arcadia-network-download, #${ROOT_ID} .th-arcadia-network-like, #${ROOT_ID} .th-arcadia-network-report { border: 0; border-radius: 4px; padding: 6px 10px; color: #fff; cursor: pointer; }
    #${ROOT_ID} .th-arcadia-network-download:hover { background: #3bbd7d; }
    #${ROOT_ID} .th-arcadia-network-download { background: #2f9e68; }
    #${ROOT_ID} .th-arcadia-network-update { background: #d9a441; color: #171717; }
    #${ROOT_ID} .th-arcadia-network-like { background: #2f9e68; }
    #${ROOT_ID} .th-arcadia-network-like:hover { background: #3bbd7d; }
    #${ROOT_ID} .th-arcadia-network-report { background: #c94343; }
    #${ROOT_ID} .th-arcadia-network-report:hover { background: #e05757; }
    #${ROOT_ID} .th-arcadia-workshop-collapse-all { border: 0; border-radius: 4px; padding: 7px 9px; background: #555; color: #fff; cursor: pointer; }
    #${ROOT_ID} .th-arcadia-workshop-collapse-all:hover { background: #666; }
    #${ROOT_ID} .th-arcadia-network-collapse-item { flex: 0 0 auto; border: 0; border-radius: 4px; padding: 6px 9px; background: #555; color: #fff; cursor: pointer; white-space: nowrap; }
    #${ROOT_ID} .th-arcadia-network-collapse-item:hover { background: #666; }
    #${ROOT_ID} .th-arcadia-window.ui-mobile .th-arcadia-network-item > summary { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto auto auto; column-gap: 6px; row-gap: 5px; padding: 9px 10px 9px 16px; }
    #${ROOT_ID} .th-arcadia-window.ui-mobile .th-arcadia-network-item-title { grid-column: 1 / -1; grid-row: 1; width: 100%; }
    #${ROOT_ID} .th-arcadia-window.ui-mobile .th-arcadia-network-item-author { grid-column: 1; grid-row: 2; max-width: 100%; justify-self: start; }
    #${ROOT_ID} .th-arcadia-window.ui-mobile .th-arcadia-network-item-stats { grid-column: 2; grid-row: 2; justify-self: end; }
    #${ROOT_ID} .th-arcadia-window.ui-mobile .th-arcadia-network-collapse-item { grid-column: 1; grid-row: 3; justify-self: start; }
    #${ROOT_ID} .th-arcadia-window.ui-mobile .th-arcadia-network-item-actions { grid-column: 2; grid-row: 3; justify-self: end; margin-left: 0; }
      #${ROOT_ID} .th-arcadia-window.ui-mobile .th-arcadia-network-download, #${ROOT_ID} .th-arcadia-window.ui-mobile .th-arcadia-network-like, #${ROOT_ID} .th-arcadia-window.ui-mobile .th-arcadia-network-report { padding: 6px 8px; }
      #${ROOT_ID} .th-arcadia-window.ui-mobile .th-arcadia-upload-row { flex-wrap: nowrap; }
      #${ROOT_ID} .th-arcadia-window.ui-mobile .th-arcadia-upload-row button { flex: 1 1 0; width: auto; min-width: 0; height: 48px; white-space: normal; line-height: 1.2; }
    #${ROOT_ID} .th-arcadia-network-item-meta { padding: 0 10px 8px 27px; color: #aaa; font-size: 12px; }
    #${ROOT_ID} .th-arcadia-network-item-body { padding: 8px 10px 10px 27px; border-top: 1px solid #ffffff1c; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5; color: #ddd; }
    #${ROOT_ID} .th-arcadia-network-panel input,
    #${ROOT_ID} .th-arcadia-network-panel textarea,
    #${ROOT_ID} .th-arcadia-network-panel select {
      box-sizing: border-box; width: 100%; border: 1px solid #ffffff2a; border-radius: 4px;
      padding: 7px; background: #111 !important; color: #fff !important; font: inherit; color-scheme: dark;
    }
    #${ROOT_ID} .th-arcadia-network-panel input::placeholder { color: #aaa; opacity: 1; }
    #${ROOT_ID} .th-arcadia-network-user-state { margin: 8px 0; color: #ddd; font-size: 12px; }
    #${ROOT_ID} .th-arcadia-model-row { display: flex; gap: 6px; margin-bottom: 9px; }
    #${ROOT_ID} .th-arcadia-model-row select { min-width: 0; flex: 1; }
    #${ROOT_ID} .th-arcadia-model-row button, #${ROOT_ID} .th-arcadia-settings-save,
    #${ROOT_ID} .th-arcadia-prompt-save, #${ROOT_ID} .th-arcadia-ui-save {
      border: 0; border-radius: 4px; padding: 7px 9px; background: #e89424; color: #fff; cursor: pointer;
    }
    #${ROOT_ID} .th-arcadia-prompt-save { margin-top: 8px; }
    #${ROOT_ID} .th-arcadia-delete { width: 100%; margin-top: 7px; border: 1px solid #d55; border-radius: 4px; padding: 8px; background: transparent; color: #f88; cursor: pointer; }
    #${ROOT_ID} .th-arcadia-delete:hover { background: #d522; }
    #${ROOT_ID} .th-arcadia-upload-row { display: flex; gap: 7px; width: 100%; margin-top: 7px; }
    #${ROOT_ID} .th-arcadia-upload-entry, #${ROOT_ID} .th-arcadia-upload-mainline { flex: 1 1 0; min-width: 0; height: 38px; margin: 0; border: 0; border-radius: 4px; padding: 8px 7px; color: #fff; cursor: pointer; white-space: nowrap; }
    #${ROOT_ID} .th-arcadia-upload-entry { background: #2f9e68; }
    #${ROOT_ID} .th-arcadia-upload-entry:hover { background: #3bbd7d; }
    #${ROOT_ID} .th-arcadia-upload-mainline { background: #c94343; }
    #${ROOT_ID} .th-arcadia-upload-mainline:hover { background: #e05757; }
    @media (max-width: 520px) {
      #${ROOT_ID} .th-arcadia-body { grid-template-columns: 115px minmax(0, 1fr); }
      #${ROOT_ID} .th-arcadia-network-item > summary { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto auto auto; column-gap: 6px; row-gap: 5px; padding: 9px 10px 9px 16px; }
      #${ROOT_ID} .th-arcadia-network-item-title { grid-column: 1 / -1; grid-row: 1; width: 100%; }
      #${ROOT_ID} .th-arcadia-network-item-author { grid-column: 1; grid-row: 2; max-width: 100%; justify-self: start; }
      #${ROOT_ID} .th-arcadia-network-item-stats { grid-column: 2; grid-row: 2; justify-self: end; }
      #${ROOT_ID} .th-arcadia-network-collapse-item { grid-column: 1; grid-row: 3; justify-self: start; }
      #${ROOT_ID} .th-arcadia-network-item-actions { grid-column: 2; grid-row: 3; justify-self: end; margin-left: 0; }
      #${ROOT_ID} .th-arcadia-network-download, #${ROOT_ID} .th-arcadia-network-like, #${ROOT_ID} .th-arcadia-network-report { padding: 6px 8px; }
    }
  `;
  // SillyDroid 可能会重建 body；挂到 html 根节点可避免悬浮窗被前端重绘移除。
  const mountTarget = parentDocument.body || parentDocument.documentElement;
  if (!mountTarget) {
    console.error('[阿卡狄亚商店] 页面 DOM 尚未就绪，请在页面加载完成后重新启用脚本。');
    debug('挂载失败：没有可用的 documentElement/body');
    return;
  }
  (parentDocument.head || parentDocument.documentElement).append(style);
  mountTarget.append(root);
  debug('根节点已挂载', {
    mountTarget: mountTarget.tagName,
    connected: root.isConnected,
    rootId: ROOT_ID,
  });

  // 某些移动前端会在脚本执行后替换页面 body/html 子节点，发现根节点
  // 被移除时重新挂回当前文档，避免“无报错但完全不显示”。
  try {
    const remount = new MutationObserver(() => {
      if (!root.isConnected) {
        const target = parentDocument.body || parentDocument.documentElement;
        target?.append(root);
      }
    });
    remount.observe(parentDocument.documentElement, { childList: true, subtree: true });
    cleanupController.signal.addEventListener('abort', () => remount.disconnect(), { once: true });
  } catch (_) {}

  const orb = root.querySelector('.th-arcadia-orb');
  const panel = root.querySelector('.th-arcadia-window');
  const status = root.querySelector('.th-arcadia-status');
  const sidebar = root.querySelector('.th-arcadia-sidebar');
  const empty = root.querySelector('.th-arcadia-empty');
  const detail = root.querySelector('.th-arcadia-detail');
  const content = root.querySelector('.th-arcadia-content');
  const detailTitle = content.querySelector('h2');
  const sections = content.querySelector('.th-arcadia-sections');
  const editor = root.querySelector('.th-arcadia-editor');
  const editorName = root.querySelector('.th-arcadia-editor-name');
  const editorOrder = root.querySelector('.th-arcadia-editor-order');
  const editorStrategy = root.querySelector('.th-arcadia-editor-strategy');
  const editorPosition = root.querySelector('.th-arcadia-editor-position');
  const editorKeys = root.querySelector('.th-arcadia-editor-keys');
  const editorSections = root.querySelector('.th-arcadia-editor-sections');
  const fillButton = root.querySelector('.th-arcadia-fill');
  const collapseAllButton = root.querySelector('.th-arcadia-collapse-all');
  const deleteButton = root.querySelector('.th-arcadia-delete');
  const uploadEntryButton = root.querySelector('.th-arcadia-upload-entry');
  const settingsButton = root.querySelector('.th-arcadia-settings-button');
  const settingsPanel = root.querySelector('.th-arcadia-settings');
  const aiPrompt = root.querySelector('.th-arcadia-ai-prompt');
  const aiWriteButton = root.querySelector('.th-arcadia-ai-write');
  const aiSource = root.querySelector('.th-arcadia-ai-source');
  const aiSystemPrompt = root.querySelector('.th-arcadia-ai-system-prompt');
  const aiEndpoint = root.querySelector('.th-arcadia-ai-endpoint');
  const aiKey = root.querySelector('.th-arcadia-ai-key');
  const aiModel = root.querySelector('.th-arcadia-ai-model');
  const aiTemperature = root.querySelector('.th-arcadia-ai-temperature');
  const aiFrequency = root.querySelector('.th-arcadia-ai-frequency');
  const aiPresence = root.querySelector('.th-arcadia-ai-presence');
  const aiTopP = root.querySelector('.th-arcadia-ai-top-p');
  const modelButton = root.querySelector('.th-arcadia-models');
  const networkButton = root.querySelector('.th-arcadia-network');
  const refreshButton = root.querySelector('.th-arcadia-refresh');
  const networkPanel = root.querySelector('.th-arcadia-network-panel');
  const networkUser = root.querySelector('.th-arcadia-network-user');
  const networkPass = root.querySelector('.th-arcadia-network-pass');
  const networkState = root.querySelector('.th-arcadia-network-user-state');
  const networkStatus = root.querySelector('.th-arcadia-network-status');
  const settingsStatus = root.querySelector('.th-arcadia-settings-status');
  const networkActions = root.querySelector('.th-arcadia-network-actions');
  const networkItems = root.querySelector('.th-arcadia-network-items');
  const workshopPager = root.querySelector('.th-arcadia-workshop-pager');
  const mainlinePager = root.querySelector('.th-arcadia-mainline-pager');
  const mainlineCategory = root.querySelector('.th-arcadia-mainline-category');
  const mainlineSort = root.querySelector('.th-arcadia-mainline-sort');
  const mainlineSearch = root.querySelector('.th-arcadia-mainline-search');
  const mainlineItems = root.querySelector('.th-arcadia-mainline-items');
  const mainlineUpdate = root.querySelector('.th-arcadia-mainline-update');
  const workshopCollapseAll = root.querySelector('.th-arcadia-workshop-collapse-all');
  const workshopCategory = root.querySelector('.th-arcadia-workshop-category');
  const workshopSort = root.querySelector('.th-arcadia-workshop-sort');
  const workshopSearch = root.querySelector('.th-arcadia-workshop-search');
  const uploadMainlineButton = root.querySelector('.th-arcadia-upload-mainline');
  let uploadInProgress = false;
  let refreshingAll = false;
  let workshopOffset = 0;
  let mainlineOffset = 0;
  let networkSession = null;
  try { networkSession = JSON.parse(localStorage.getItem('th-arcadia-network-session') || 'null'); } catch (_) {}
  networkUser.value = networkSession?.username || '';
  const settingsSave = root.querySelector('.th-arcadia-settings-save');
  const promptSave = root.querySelector('.th-arcadia-prompt-save');
  const uiFontSize = root.querySelector('.th-arcadia-ui-font-size');
  const uiSave = root.querySelector('.th-arcadia-ui-save');
  const uiModeDesktop = root.querySelector('.th-arcadia-ui-mode-desktop');
  const uiModeMobile = root.querySelector('.th-arcadia-ui-mode-mobile');
  const settingsBackHeader = root.querySelector('.th-arcadia-settings-back-header');
  const header = root.querySelector('.th-arcadia-header');
  let entries = [];
  let allWorldbookEntries = [];
  let selectedEntry = null;
  let sourceIndex = new Map();
  let currentWorldBookName = '';
  let editMode = false;
  const AI_SETTINGS_KEY = 'th-arcadia-ai-settings';
  const UI_SETTINGS_KEY = 'th-arcadia-ui-settings';
  const UI_SETTINGS_VERSION = 2;
  let uiSettings = { fontSize: 14, mode: 'mobile' };
  try {
    const storedUiSettings = JSON.parse(localStorage.getItem(UI_SETTINGS_KEY) || 'null');
    // 旧版本可能保存过 desktop；升级后首次加载回到手机端默认布局。
    if (storedUiSettings?.version === UI_SETTINGS_VERSION) uiSettings = { ...uiSettings, ...storedUiSettings };
  } catch (_) {}
  const applyUiSettings = () => {
    const fontSize = Math.max(10, Math.min(24, Number(uiSettings.fontSize) || 14));
    const mode = uiSettings.mode === 'desktop' ? 'desktop' : 'mobile';
    uiSettings.fontSize = fontSize;
    uiSettings.mode = mode;
    uiFontSize.value = String(fontSize);
    panel.style.setProperty('--th-arcadia-font-size', `${fontSize}px`);
    panel.classList.toggle('ui-desktop', mode === 'desktop');
    panel.classList.toggle('ui-mobile', mode === 'mobile');
    uiModeDesktop.classList.toggle('active', mode === 'desktop');
    uiModeMobile.classList.toggle('active', mode === 'mobile');
  };
  const persistUiSettings = () => {
    uiSettings.version = UI_SETTINGS_VERSION;
    localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify(uiSettings));
  };
  applyUiSettings();
  let aiSettings = { source: 'tavern', systemPrompt: '你是世界书条目编辑器。', endpoint: '', key: '', model: '', temperature: 1, frequency: 0, presence: 0, topP: 1 };
  try { aiSettings = { ...aiSettings, ...JSON.parse(localStorage.getItem(AI_SETTINGS_KEY) || '{}') }; } catch (_) {}
  aiSource.value = aiSettings.source;
  aiSystemPrompt.value = aiSettings.systemPrompt;
  aiEndpoint.value = aiSettings.endpoint;
  aiKey.value = aiSettings.key;
  aiTemperature.value = aiSettings.temperature;
  aiFrequency.value = aiSettings.frequency;
  aiPresence.value = aiSettings.presence;
  aiTopP.value = aiSettings.topP;
  if (aiSettings.model) {
    const option = parentDocument.createElement('option'); option.value = aiSettings.model; option.textContent = aiSettings.model; aiModel.append(option); aiModel.value = aiSettings.model;
  }
  const TAG_DEFS = [
    ['Item_Name', '名称'], ['Item_Data', '基础资料'], ['Origin', '出处'], ['Price', '价格'], ['Trigger_Keywords', '触发词'],
    ['Mechanism_Usage', '机制与用法'], ['Core_Effects', '核心效果'], ['Roleplay_Scenarios', '扮演场景'],
    ['Safety_Override', '安全覆盖'], ['AI_Directive', 'AI 指令'],
  ];

  function updateAiSourceFields() {
    const custom = aiSource.value === 'custom';
    [aiEndpoint, aiKey, aiModel, modelButton, aiTemperature, aiFrequency, aiPresence, aiTopP].forEach(element => {
      const field = element.closest('label') || element.parentElement;
      if (field) field.hidden = !custom;
    });
  }
  updateAiSourceFields();

  function isSectionMarker(entry) {
    const name = String(entry.name || '').replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, '').replace(/[↓↑←→]/g, '').trim();
    return /^(?:开始|结束)\s*/.test(name) || /(?:开始|结束)\s*(?:商品|综合商品|生物|改造|特殊改造|装备|武器|药物|道具)/.test(name);
  }

  function pickProductEntries(allEntries) {
    const visibleEntries = allEntries.filter(entry => !isSectionMarker(entry));
    const productEntries = visibleEntries.filter(entry =>
      /^(?:商品|综合商品|生物|药品|改造|特殊改造|装备|武器)\s*[:：]/.test(String(entry.name || '').trim()),
    );
    // 当前世界书使用“商品：/生物：/改造：/特殊改造：”命名；其他命名风格则显示所有非分组条目。
    return productEntries.length > 0 ? productEntries : visibleEntries;
  }

  function setStatus(text) {
    status.textContent = text;
    if (networkStatus) networkStatus.textContent = text;
    if (settingsStatus) settingsStatus.textContent = text;
  }

  function sourceKey(name) { return String(name || '').trim().toLocaleLowerCase(); }
  function contentFingerprint(content) { return String(content || '').replace(/\s+/g, ' ').trim(); }
  function localEntriesWithName(name) { const key = sourceKey(name); return allWorldbookEntries.filter(entry => sourceKey(entry.name) === key); }
  function taggedValue(content, tag) { return String(content || '').match(new RegExp(`<${tag}\\s*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'i'))?.[1] || ''; }
  function differingTags(item) {
    const local = localEntriesWithName(item.name)[0];
    if (!local) return new Set();
    return new Set(TAG_DEFS.filter(([tag]) => contentFingerprint(taggedValue(local.content, tag)) !== contentFingerprint(taggedValue(item.content, tag))).map(([tag]) => tag));
  }
  function workshopStatus(item) {
    const locals = localEntriesWithName(item.name);
    if (!locals.length) return ['workshop-missing', '未下载'];
    return locals.some(entry => contentFingerprint(entry.content) === contentFingerprint(item.content))
      ? ['workshop-downloaded', '已下载']
      : ['workshop-updated', '待更新'];
  }
  function mainlineStatus(item) {
    const locals = localEntriesWithName(item.name);
    return locals.some(entry => contentFingerprint(entry.content) === contentFingerprint(item.content)) ? ['mainline-updated', '已更新'] : ['mainline-stale', '未更新或内容有差异'];
  }
  function sourceMarker(entry) {
    const matches = sourceIndex.get(sourceKey(entry.name)) || [];
    if (!matches.length) return ['local', '本地条目'];
    const sameContent = matches.some(item => contentFingerprint(item.content) === contentFingerprint(entry.content));
    if (!sameContent) return ['conflict', '同名但内容不同'];
    if (matches.some(item => item.module === 'worldbook')) return ['mainline', '主线世界书'];
    return ['workshop', '创意工坊'];
  }
  async function refreshSourceIndex() {
    if (!networkSession?.token) return;
    try {
      const fetchAll = async path => {
        const all = []; let offset = 0; let total = 0;
        do {
          const response = await fetch(`${networkSession.api}${path}${path.includes('?') ? '&' : '?'}offset=${offset}`, { headers: networkHeaders() });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) return { ok: false, items: [] };
          all.push(...(data.items || [])); total = Number(data.total) || all.length; offset += Number(data.limit) || 10;
        } while (offset < total);
        return { ok: true, items: all };
      };
      const [mainline, workshop] = await Promise.all([fetchAll('/api/worldbook'), fetchAll('/api/worldbook/workshop')]);
      sourceIndex = new Map();
      const sourceItems = [
        ...(mainline.ok ? mainline.items.map(item => ({ ...item, module: 'worldbook' })) : []),
        ...(workshop.ok ? workshop.items.map(item => ({ ...item, module: 'workshop' })) : []),
      ];
      sourceItems.forEach(item => {
        const key = sourceKey(item.name);
        if (!sourceIndex.has(key)) sourceIndex.set(key, []);
        sourceIndex.get(key).push(item);
      });
      renderList();
    } catch (_) {}
  }

  function showDetail(entry) {
    selectedEntry = entry;
    if (editMode) {
      renderEditor(entry);
      return;
    }
    detailTitle.textContent = entry.name || `条目 ${entry.uid}`;
    sections.replaceChildren();
    const labels = TAG_DEFS;
    const raw = String(entry.content || '');
    let matched = 0;
    labels.forEach(([tag, title]) => {
      const match = raw.match(new RegExp(`<${tag}\\s*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'i'));
      if (!match) return;
      matched += 1;
      const section = parentDocument.createElement('details');
      section.className = 'th-arcadia-section';
      section.open = false;
      const summary = parentDocument.createElement('summary');
      summary.textContent = title;
      const body = parentDocument.createElement('div');
      body.textContent = match[1].trim() || '(空)';
      section.append(summary, body);
      sections.append(section);
    });
    if (!matched) {
      const section = parentDocument.createElement('div');
      section.textContent = raw || '(此条目没有内容)';
      sections.append(section);
    }
    empty.hidden = true;
    content.hidden = false;
    editor.hidden = true;
  }

  function renderEditor(entry) {
    content.hidden = true;
    empty.hidden = true;
    editor.hidden = false;
    editorName.value = stripCategoryPrefix(entry.name);
    editorOrder.value = String(entry.position?.order ?? 100);
    editorStrategy.value = entry.strategy?.type === 'constant' ? 'constant' : 'selective';
    editorPosition.value = entry.position?.type || 'after_character_definition';
    editorKeys.value = (entry.strategy?.keys || []).map(key => String(key)).join('\n');
    editorSections.replaceChildren();
    const raw = String(entry.content || '');
    TAG_DEFS.forEach(([tag, title]) => {
      const section = parentDocument.createElement('details');
      section.className = 'th-arcadia-editor-tag';
      const summary = parentDocument.createElement('summary');
      summary.textContent = `<${tag}> ${title}`;
      const textarea = parentDocument.createElement('textarea');
      textarea.dataset.tag = tag;
      textarea.value = raw.match(new RegExp(`<${tag}\\s*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'i'))?.[1]?.trim() || '';
      section.append(summary, textarea);
      editorSections.append(section);
    });
  }

  function renderList() {
    sidebar.replaceChildren();
    if (!entries.length) {
      const empty = parentDocument.createElement('div');
      empty.textContent = '没有找到商品条目。';
      sidebar.append(empty);
      return;
    }
    const categories = ['商品', '综合商品', '生物', '药品', '改造', '特殊改造', '装备', '武器'];
    categories.forEach(category => {
      const categoryEntries = entries
        .filter(entry => getCategory(entry) === category)
        .map((entry, index) => ({ entry, index }))
        .sort((a, b) => (Number(a.entry.position?.order) || 0) - (Number(b.entry.position?.order) || 0) || a.index - b.index)
        .map(({ entry }) => entry);
      if (!categoryEntries.length && !editMode) return;
      const categoryGroup = parentDocument.createElement('details');
      categoryGroup.open = true;
      categoryGroup.className = 'th-arcadia-category';
      const title = parentDocument.createElement('summary');
      title.className = 'th-arcadia-category-head';
      title.textContent = category;
      if (editMode) {
        const add = parentDocument.createElement('button');
        add.type = 'button';
        add.className = 'th-arcadia-add';
        add.title = `新建${category}条目`;
        add.textContent = '+';
        add.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          createEntry(category);
        });
        title.append(add);
      }
      const list = parentDocument.createElement('div');
      list.className = 'th-arcadia-list';
      categoryEntries.forEach((entry, index) => {
        const button = parentDocument.createElement('button');
        button.type = 'button';
      button.className = 'th-arcadia-item';
      button.style.position = 'relative';
        const label = editMode
          ? `${entry.position?.order ?? index + 1} · ${stripCategoryPrefix(entry.name) || `未命名条目 ${index + 1}`}`
          : stripCategoryPrefix(entry.name) || `未命名条目 ${index + 1}`;
        button.textContent = label;
        const [sourceType, sourceTitle] = sourceMarker(entry);
        const sourceDot = parentDocument.createElement('span');
        sourceDot.className = `th-arcadia-source-dot th-arcadia-source-${sourceType}`;
        sourceDot.title = sourceTitle;
        button.append(sourceDot);
        button.addEventListener('click', () => {
          sidebar.querySelectorAll('.th-arcadia-item').forEach(item => item.classList.remove('active'));
          button.classList.add('active');
          showDetail(entry);
        });
        list.append(button);
      });
      categoryGroup.append(title, list);
      sidebar.append(categoryGroup);
    });
  }

  function getCategory(entry) {
    const name = String(entry.name || '').trim();
    return ['特殊改造', '综合商品', '商品', '生物', '药品', '改造', '装备', '武器'].find(category => name.startsWith(`${category}：`) || name.startsWith(`${category}:`)) || '商品';
  }

  function stripCategoryPrefix(name) {
    return String(name || '').replace(/^(?:商品|综合商品|生物|药品|改造|特殊改造|装备|武器)\s*[:：]\s*/, '').trim();
  }

  async function loadEntries() {
    setStatus('正在读取世界书…');
    try {
      if (!parentWindow.TavernHelper?.getWorldbook || !parentWindow.TavernHelper?.getWorldbookNames) {
        throw new Error('未找到酒馆助手世界书接口，请确认酒馆助手已启用。');
      }
      const matchedBooks = parentWindow.TavernHelper.getWorldbookNames().filter(name =>
        String(name).startsWith(WORLD_BOOK_PREFIX),
      );
      const worldBookName = matchedBooks[matchedBooks.length - 1];
      if (!worldBookName) {
        throw new Error(`没有找到以“${WORLD_BOOK_PREFIX}”开头的世界书。`);
      }
      const allEntries = await parentWindow.TavernHelper.getWorldbook(worldBookName);
      currentWorldBookName = worldBookName;
      allWorldbookEntries = allEntries;
      entries = pickProductEntries(allEntries);
      renderList();
      if (entries.length) {
        const first = sidebar.querySelector('.th-arcadia-item');
        first?.click();
      }
      setStatus(`已读取 ${entries.length} 个商品条目（${worldBookName}）`);
    } catch (error) {
      entries = [];
      renderList();
      setStatus(`读取失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function networkWorkshop() {
    const apiBase = (parentWindow.prompt('请输入工坊服务器地址', localStorage.getItem('th-arcadia-workshop-api') || '') || '').trim().replace(/\/$/, '');
    if (!apiBase) return;
    localStorage.setItem('th-arcadia-workshop-api', apiBase);
    const authAction = parentWindow.prompt('输入 1 登录，输入 2 注册新账号', '1');
    const username = (parentWindow.prompt('账号（3-32位）') || '').trim();
    const password = parentWindow.prompt('密码（至少8位）') || '';
    if (!username || !password) return;
    try {
      if (authAction === '2') {
        const register = await fetch(`${apiBase}/api/auth/register`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
        const registerData = await register.json().catch(() => ({}));
        if (!register.ok) throw new Error(registerData.error || '注册失败');
        parentWindow.alert('注册成功，正在登录…');
      }
      const login = await fetch(`${apiBase}/api/auth/login`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const loginData = await login.json().catch(() => ({}));
      if (!login.ok) throw new Error(loginData.error || '登录失败');
      const token = loginData.token || '';
      const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
      const isAdmin = loginData.user?.role === 'admin';
      const choice = parentWindow.prompt(isAdmin ? '输入 1 更新世界书本体，输入 2 上传到创意工坊，输入 3 下载创意工坊条目' : '输入 2 上传到创意工坊，输入 3 下载创意工坊条目');
      if (choice === '3') {
        if (!currentWorldBookName || !parentWindow.TavernHelper?.createWorldbookEntries) throw new Error('当前酒馆助手不支持写入世界书');
        const listResponse = await fetch(`${apiBase}/api/worldbook/workshop`, { credentials: 'include', headers: authHeaders });
        const listData = await listResponse.json().catch(() => ({}));
        if (!listResponse.ok) throw new Error(listData.error || '读取创意工坊失败');
        if (!listData.items?.length) throw new Error('创意工坊暂无条目');
        const lines = listData.items.map((item, index) => `${index + 1}. ${item.name}（${item.worldbookName || '未命名世界书'}）`).join('\n');
        const picked = Number(parentWindow.prompt(`选择要下载的条目序号：\n${lines}`)) - 1;
        const item = listData.items[picked];
        if (!item) throw new Error('条目序号无效');
        await parentWindow.TavernHelper.createWorldbookEntries(currentWorldBookName, [{ name: item.name, content: item.content, strategy: item.strategy || { type: 'selective', keys: [] }, position: item.position || { type: 'after_character_definition', order: 100 }, enabled: item.enabled !== false }]);
        await loadEntries();
        setStatus(`已下载条目：${item.name}`);
        return;
      }
      const module = choice === '1' && isAdmin ? 'worldbook' : 'workshop';
      if (!entries.length) throw new Error('当前没有可同步的条目，请先刷新读取世界书');
      let success = 0;
      for (const entry of entries) {
        const payload = { id: `tavern-${currentWorldBookName}-${entry.uid}`, worldbookName: currentWorldBookName, uid: String(entry.uid), name: entry.name || '', category: getCategory(entry), content: entry.content || '', strategy: entry.strategy || {}, position: entry.position || {}, enabled: entry.enabled !== false };
        const response = await fetch(`${apiBase}/api/worldbook${module === 'workshop' ? '/workshop' : ''}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify(payload) });
        if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || `同步“${entry.name}”失败`); }
        success += 1;
      }
      setStatus(`已同步 ${success} 个条目到${module === 'workshop' ? '创意工坊' : '世界书本体'}`);
    } catch (error) {
      setStatus(`联网失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function showNetwork(show) {
    networkPanel.hidden = !show;
    settingsPanel.hidden = true;
    settingsBackHeader.hidden = !show;
    content.hidden = show || editMode || !selectedEntry;
    editor.hidden = show || !editMode || !selectedEntry;
    empty.hidden = show || !!selectedEntry;
    if (show) {
      root.querySelectorAll('.th-arcadia-network-panel > .th-arcadia-settings-module').forEach(module => { module.open = false; });
      workshopOffset = 0;
      mainlineOffset = 0;
      updateNetworkState();
      validateStoredSession().then(valid => { if (valid) refreshSourceIndex(); });
    }
  }
  function updateNetworkState() {
    const loggedIn = Boolean(networkSession?.token);
    networkState.textContent = loggedIn ? `已登录：${networkSession.username}（${networkSession.role === 'admin' ? '管理员' : '用户'}）` : '未登录';
    networkActions.hidden = !loggedIn;
    uploadMainlineButton.hidden = !loggedIn || networkSession.role !== 'admin';
    mainlineUpdate.hidden = !loggedIn || networkSession.role !== 'admin';
    networkUser.hidden = loggedIn;
    networkPass.hidden = loggedIn;
    root.querySelector('.th-arcadia-network-login').hidden = loggedIn;
    root.querySelector('.th-arcadia-network-register').hidden = loggedIn;
    root.querySelector('.th-arcadia-network-logout').hidden = !loggedIn;
    networkPass.value = '';
  }
  function networkHeaders() { return networkSession?.token ? { Authorization: `Bearer ${networkSession.token}` } : {}; }
  async function validateStoredSession() {
    if (!networkSession?.token || !networkSession.api) return false;
    try {
      const response = await fetch(`${networkSession.api}/api/auth/me`, { headers: networkHeaders() });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.user) throw new Error('登录状态已失效');
      networkSession = { ...networkSession, username: data.user.username, role: data.user.role };
      localStorage.setItem('th-arcadia-network-session', JSON.stringify(networkSession));
      updateNetworkState();
      return true;
    } catch (_) {
      networkSession = null;
      localStorage.removeItem('th-arcadia-network-session');
      updateNetworkState();
      return false;
    }
  }
  function networkError(data, fallback) {
    return [data?.error || fallback, data?.detail, data?.requestId && `请求编号：${data.requestId}`].filter(Boolean).join(' | ');
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function renderPager(container, total, offset, onPage) {
    const limit = 10; const page = Math.floor(offset / limit); const pages = Math.max(1, Math.ceil(total / limit));
    container.className = 'th-arcadia-pager';
    container.replaceChildren();
    const make = (text, target, disabled) => { const button = parentDocument.createElement('button'); button.type = 'button'; button.textContent = text; button.disabled = disabled; button.addEventListener('click', () => onPage(target)); return button; };
    container.append(make('«', 0, page <= 0), make('‹', Math.max(0, page - 1) * limit, page <= 0));
    const label = parentDocument.createElement('span'); label.className = 'th-arcadia-pager-label'; label.textContent = `(${page + 1}/${pages})`; container.append(label);
    container.append(make('›', Math.min(pages - 1, page + 1) * limit, page >= pages - 1), make('»', (pages - 1) * limit, page >= pages - 1));
  }
  function workshopTaggedSections(content, diffTags = new Set()) {
    const raw = String(content || '');
    const sections = TAG_DEFS.map(([tag, title]) => {
      const match = raw.match(new RegExp(`<${tag}\\s*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'i'));
      if (!match) return '';
      return `<details class="th-arcadia-workshop-section"><summary>${escapeHtml(title)}${diffTags.has(tag) ? '<span class="th-arcadia-section-diff-dot" title="此部分与本地内容不同"></span>' : ''}</summary><div>${escapeHtml(match[1].trim() || '(空)')}</div></details>`;
    }).filter(Boolean);
    return sections.length ? sections.join('') : `<div class="th-arcadia-network-item-body">${escapeHtml(raw || '(此条目没有内容)')}</div>`;
  }
  async function downloadWorkshopItem(item, update = false) {
    if (!currentWorldBookName || !parentWindow.TavernHelper?.createWorldbookEntries) { setStatus('当前环境不支持写入世界书'); return; }
    const localName = String(item.name || '').trim();
    if (!localName) { setStatus('该创意工坊条目没有名称，无法下载'); return; }
    const localEntry = localEntriesWithName(localName)[0];
    if (localEntry && !update) { setStatus(`本地已有同名条目，无法下载：${localName}`); return; }
    try {
      if (localEntry && update && parentWindow.TavernHelper.updateWorldbookWith) {
        await parentWindow.TavernHelper.updateWorldbookWith(currentWorldBookName, worldbook => worldbook.map(entry => entry.uid === localEntry.uid
          ? { ...entry, content: item.content || '', strategy: item.strategy || { type: 'selective', keys: [] }, position: item.position || { type: 'after_character_definition', order: 100 }, enabled: item.enabled !== false }
          : entry));
      } else {
        await parentWindow.TavernHelper.createWorldbookEntries(currentWorldBookName, [{ name: localName, content: item.content || '', strategy: item.strategy || { type: 'selective', keys: [] }, position: item.position || { type: 'after_character_definition', order: 100 }, enabled: item.enabled !== false }]);
      }
      fetch(`${networkSession.api}/api/worldbook/workshop/${encodeURIComponent(item.id)}/download`, { method: 'POST', headers: networkHeaders() }).catch(() => {});
      await loadEntries();
      setStatus(update ? `已更新：${localName}` : `已下载：${localName}`);
    } catch (error) { setStatus(`下载失败：${error.message}`); }
  }
  async function networkAuth(register) {
    const apiBase = 'http://154.36.164.139:8787';
    const username = networkUser.value.trim(); const password = networkPass.value;
    if (!apiBase || !username || !password) { setStatus('请填写服务器地址、账号和密码'); return; }
    try {
      if (register) {
        const r = await fetch(`${apiBase}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
        const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || '注册失败');
      }
      const r = await fetch(`${apiBase}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || '登录失败');
      networkSession = { token: d.token, username: d.user.username, role: d.user.role, api: apiBase };
      localStorage.setItem('th-arcadia-workshop-api', apiBase); localStorage.setItem('th-arcadia-network-session', JSON.stringify(networkSession));
      updateNetworkState(); setStatus('联网登录成功');
    } catch (error) { networkState.textContent = `操作失败：${error.message}`; setStatus(`联网失败：${error.message}`); }
  }
  function confirmUpload(entry, target) {
    const name = String(entry?.name || '未命名条目').trim();
    return parentWindow.confirm(`条目名称：${name}\n\n您确定要上传这条世界书条目到${target}吗？\n\n此操作会覆盖该上传者在目标区域中的同名版本。`);
  }
  async function uploadSelectedEntry() {
    const entry = selectedEntry;
    if (!entry || !networkSession?.token) { setStatus('请先在账户信息中登录'); return; }
    const mainlineMatch = (sourceIndex.get(sourceKey(entry.name)) || []).some(item => item.module === 'worldbook');
    if (mainlineMatch) { setStatus(`上传取消：创意工坊不允许使用与主世界书相同的条目名称：${entry.name}`); return; }
    if (!confirmUpload(entry, '创意工坊')) return;
    if (uploadInProgress) return;
    uploadInProgress = true;
    try {
      const response = await fetch(`${networkSession.api}/api/worldbook/workshop`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...networkHeaders() }, body: JSON.stringify({ id: `tavern-${currentWorldBookName}-${entry.uid}`, worldbookName: currentWorldBookName, uid: String(entry.uid), name: entry.name || '', category: getCategory(entry), content: entry.content || '', strategy: entry.strategy || {}, position: entry.position || {}, enabled: entry.enabled !== false }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '上传失败');
      setStatus(`已上传条目：${entry.name}`);
    } catch (error) { setStatus(`上传失败：${error.message}`); }
    finally { uploadInProgress = false; }
  }
  async function uploadMainlineEntry() {
    if (!selectedEntry || networkSession?.role !== 'admin') { setStatus('仅管理员可以上传至主线世界书'); return; }
    if (!confirmUpload(selectedEntry, '主线（管理员）')) return;
    if (uploadInProgress) return;
    uploadInProgress = true;
    try {
      const response = await fetch(`${networkSession.api}/api/worldbook`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...networkHeaders() }, body: JSON.stringify({ id: `tavern-${currentWorldBookName}-${selectedEntry.uid}`, worldbookName: currentWorldBookName, uid: String(selectedEntry.uid), name: selectedEntry.name || '', category: getCategory(selectedEntry), content: selectedEntry.content || '', strategy: selectedEntry.strategy || {}, position: selectedEntry.position || {}, enabled: selectedEntry.enabled !== false }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '上传失败');
      setStatus(`已上传主线条目：${selectedEntry.name}`);
    } catch (error) { setStatus(`主线上传失败：${error.message}`); }
    finally { uploadInProgress = false; }
  }
  async function networkLoadWorkshop() {
    if (!networkSession?.token) return;
    try {
      const params = new URLSearchParams({ category: workshopCategory.value, sort: workshopSort.value, q: workshopSearch.value.trim(), offset: String(workshopOffset) });
      const r = await fetch(`${networkSession.api}/api/worldbook/workshop?${params}`, { headers: networkHeaders() }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(networkError(d, '读取失败'));
      networkItems.innerHTML = d.items?.length ? d.items.map((item, index) => { const [state, title] = workshopStatus(item); const needsUpdate = state === 'workshop-updated'; return `<details class="th-arcadia-network-item" data-index="${index}"><summary><span class="th-arcadia-entry-status-dot th-arcadia-entry-status-${state}" title="${title}"></span><span class="th-arcadia-network-item-title">${escapeHtml(item.name || '未命名条目')}</span><span class="th-arcadia-network-item-author">上传者：${escapeHtml(item.authorName || '未知')}</span><span class="th-arcadia-network-item-stats">下载 ${item.downloadCount || 0} · 赞 ${item.likeCount || 0} · 举报 ${item.reportCount || 0}</span><button type="button" class="th-arcadia-network-collapse-item">折叠本栏目</button><span class="th-arcadia-network-item-actions"><button type="button" class="th-arcadia-network-download${needsUpdate ? ' th-arcadia-network-update' : ''}">${needsUpdate ? '更新' : '下载'}</button><button type="button" class="th-arcadia-network-like">赞</button><button type="button" class="th-arcadia-network-report">踩</button></span></summary><div class="th-arcadia-network-item-body"><div class="th-arcadia-workshop-sections">${workshopTaggedSections(item.content, differingTags(item))}</div></div></details>`; }).join('') : '<div class="th-arcadia-settings-hint">没有符合条件的条目</div>';
      networkItems.querySelectorAll('.th-arcadia-workshop-section').forEach(section => { section.open = false; });
      networkItems.querySelectorAll('.th-arcadia-network-collapse-item').forEach(button => button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); button.closest('.th-arcadia-network-item')?.querySelectorAll('.th-arcadia-workshop-section').forEach(section => { section.open = false; }); }));
      networkItems.querySelectorAll('.th-arcadia-network-download').forEach(button => button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); downloadWorkshopItem(d.items[Number(button.closest('.th-arcadia-network-item')?.dataset.index)], button.classList.contains('th-arcadia-network-update')); }));
      networkItems.querySelectorAll('.th-arcadia-network-like, .th-arcadia-network-report').forEach(button => button.addEventListener('click', async event => { event.preventDefault(); event.stopPropagation(); const item = d.items[Number(button.closest('.th-arcadia-network-item')?.dataset.index)]; const action = button.classList.contains('th-arcadia-network-like') ? 'like' : 'report'; try { const response = await fetch(`${networkSession.api}/api/worldbook/workshop/${encodeURIComponent(item.id)}/${action}`, { method: 'POST', headers: networkHeaders() }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(networkError(data, '操作失败')); button.disabled = true; setStatus(action === 'like' ? `已点赞：${item.name}` : `已举报：${item.name}`); } catch (error) { setStatus(error.message); } }));
      renderPager(workshopPager, d.total || 0, workshopOffset, offset => { workshopOffset = offset; networkLoadWorkshop(); });
      setStatus(`已读取 ${d.items?.length || 0} 个创意工坊条目`);
    } catch (error) { setStatus(`读取失败：${error.message}`); }
  }
  async function networkLoadMainline() {
    if (!networkSession?.token) return;
    try {
      const params = new URLSearchParams({ category: mainlineCategory.value, sort: mainlineSort.value, q: mainlineSearch.value.trim(), offset: String(mainlineOffset) });
      const response = await fetch(`${networkSession.api}/api/worldbook?${params}`, { headers: networkHeaders() });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(networkError(data, '读取失败'));
      mainlineItems.innerHTML = data.items?.length ? data.items.map((item, index) => { const [state, title] = mainlineStatus(item); return `<details class="th-arcadia-network-item" data-index="${index}"><summary><span class="th-arcadia-entry-status-dot th-arcadia-entry-status-${state}" title="${title}"></span><span class="th-arcadia-network-item-title">${escapeHtml(item.name || '未命名条目')}</span><span class="th-arcadia-network-item-author">上传者：${escapeHtml(item.authorName || '管理员')}</span><span class="th-arcadia-network-item-stats">${item.updatedAt ? escapeHtml(new Date(item.updatedAt).toLocaleDateString()) : ''}</span></summary><div class="th-arcadia-network-item-body"><div class="th-arcadia-workshop-sections">${workshopTaggedSections(item.content, differingTags(item))}</div></div></details>`; }).join('') : '<div class="th-arcadia-settings-hint">没有符合条件的条目</div>';
      mainlineItems.querySelectorAll('.th-arcadia-workshop-section').forEach(section => { section.open = false; });
      renderPager(mainlinePager, data.total || 0, mainlineOffset, offset => { mainlineOffset = offset; networkLoadMainline(); });
      setStatus(`已读取 ${data.items?.length || 0} 个世界书本体条目`);
    } catch (error) { setStatus(`读取世界书本体失败：${error.message}`); }
  }
  async function updateMainlineWorldbook() {
    if (networkSession?.role !== 'admin' || !currentWorldBookName) { setStatus('仅管理员可以从主线更新本地世界书'); return; }
    if (!parentWindow.confirm('您确定要从服务器主线世界书更新本地世界书吗？\n\n只会读取主线条目，不会上传创意工坊条目。')) return;
    try {
      const remote = [];
      let offset = 0;
      let total = 0;
      do {
        const response = await fetch(`${networkSession.api}/api/worldbook?offset=${offset}`, { headers: networkHeaders() });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(networkError(data, '读取主线世界书失败'));
        remote.push(...(data.items || []));
        total = Number(data.total) || remote.length;
        offset += Number(data.limit) || 10;
      } while (offset < total);
      const updates = new Map(remote.map(item => [sourceKey(item.name), item]));
      const localUpdates = allWorldbookEntries.map(entry => {
        const item = updates.get(sourceKey(entry.name));
        return item ? { ...entry, content: item.content || '', strategy: item.strategy || { type: 'selective', keys: [] }, position: item.position || { type: 'after_character_definition', order: 100 }, enabled: item.enabled !== false } : entry;
      });
      const existingKeys = new Set(allWorldbookEntries.map(entry => sourceKey(entry.name)));
      const missing = remote.filter(item => !existingKeys.has(sourceKey(item.name))).map(item => ({ name: item.name, content: item.content || '', strategy: item.strategy || { type: 'selective', keys: [] }, position: item.position || { type: 'after_character_definition', order: 100 }, enabled: item.enabled !== false }));
      let updated = localUpdates;
      if (parentWindow.TavernHelper?.updateWorldbookWith) updated = await parentWindow.TavernHelper.updateWorldbookWith(currentWorldBookName, () => localUpdates);
      if (missing.length && parentWindow.TavernHelper?.createWorldbookEntries) {
        const result = await parentWindow.TavernHelper.createWorldbookEntries(currentWorldBookName, missing);
        updated = result.worldbook || updated;
      }
      allWorldbookEntries = updated;
      entries = pickProductEntries(updated);
      renderList();
      await networkLoadMainline();
      setStatus(`已从主线更新本地世界书 ${remote.length} 个条目`);
    } catch (error) { setStatus(`更新世界书本体失败：${error.message}`); }
  }

  async function refreshAll() {
    if (refreshingAll) return;
    refreshingAll = true;
    refreshButton.disabled = true;
    try {
      // 先重新读取本地世界书，再同步服务端索引和当前两个联网列表，
      // 这样主页面、创意工坊、世界书本体的状态点会一次性更新。
      await loadEntries();
      if (networkSession?.token) {
        await refreshSourceIndex();
        await Promise.all([networkLoadWorkshop(), networkLoadMainline()]);
      }
      setStatus(networkSession?.token ? '已刷新本地世界书及全部联网状态' : '已刷新本地世界书（登录后可同步联网状态）');
    } catch (error) {
      setStatus(`刷新失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      refreshingAll = false;
      refreshButton.disabled = false;
    }
  }

  function openPanel() {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) loadEntries();
  }

  function fillInput() {
    if (!selectedEntry) return;
    const input = parentDocument.querySelector('#send_textarea, textarea#send_textarea, textarea[name="message"]');
    if (!input) {
      setStatus('没有找到酒馆输入框');
      return;
    }
    const itemName = getItemName(selectedEntry);
    const separator = input.value && !/[\r\n]$/.test(input.value) ? '\n' : '';
    input.value = `${input.value}${separator}${itemName}`;
    const caret = input.value.length;
    if (typeof input.setSelectionRange === 'function') input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
    setStatus('已填入酒馆输入框');
  }

  function cleanName(name) {
    return String(name || '')
      .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]+/gu, '')
      .replace(/\s+$/g, '')
      .trim();
  }

  function getItemName(entry) {
    const raw = String(entry.content || '');
    const itemNameBlock = raw.match(/<Item_Name\s*>([\s\S]*?)<\/Item_Name\s*>/i)?.[1] || '';
    const namedLine = itemNameBlock.match(/(?:物品名称|商品名称|名称)\s*[:：]\s*([^\r\n]+)/i)?.[1];
    return cleanName(namedLine || itemNameBlock || stripCategoryPrefix(entry.name));
  }

  function buildTaggedContent() {
    return TAG_DEFS.map(([tag]) => {
      const textarea = editorSections.querySelector(`textarea[data-tag="${tag}"]`);
      return `<${tag}>\n${textarea?.value?.trim() || ''}\n</${tag}>`;
    }).join('\n\n');
  }

  async function createEntry(category) {
    if (!currentWorldBookName || !parentWindow.TavernHelper?.createWorldbookEntries) return;
    const categoryEntries = entries.filter(entry => getCategory(entry) === category);
    const nextOrder = Math.max(0, ...categoryEntries.map(entry => Number(entry.position?.order) || 0)) + 1;
    try {
      const result = await parentWindow.TavernHelper.createWorldbookEntries(currentWorldBookName, [{
        name: `${category}：新建条目`,
        content: TAG_DEFS.map(([tag]) => `<${tag}>\n\n</${tag}>`).join('\n\n'),
        strategy: { type: 'selective', keys: [] },
        position: { type: 'after_character_definition', order: nextOrder },
      }]);
      entries = pickProductEntries(result.worldbook || []);
      allWorldbookEntries = result.worldbook || [];
      renderList();
      const created = result.new_entries?.[0] || entries.find(entry => entry.name === `${category}：新建条目`);
      if (created) {
        selectedEntry = created;
        renderEditor(created);
      }
      setStatus(`已新建${category}条目`);
    } catch (error) {
      setStatus(`新建失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function saveEntry() {
    if (!selectedEntry || !currentWorldBookName || !parentWindow.TavernHelper?.updateWorldbookWith) return;
    const newName = `${getCategory(selectedEntry)}：${editorName.value.trim() || '未命名条目'}`;
    const newOrder = Number(editorOrder.value) || 0;
    try {
      const updated = await parentWindow.TavernHelper.updateWorldbookWith(currentWorldBookName, worldbook =>
        worldbook.map(entry => entry.uid === selectedEntry.uid ? {
          ...entry,
          name: newName,
          content: buildTaggedContent(),
          strategy: { ...entry.strategy, type: editorStrategy.value, keys: editorKeys.value.split(/[\n,，]/).map(value => value.trim()).filter(Boolean) },
          position: { ...entry.position, type: editorPosition.value, order: newOrder },
        } : entry),
      );
      entries = pickProductEntries(updated);
      allWorldbookEntries = updated;
      selectedEntry = entries.find(entry => entry.uid === selectedEntry.uid) || selectedEntry;
      renderList();
      renderEditor(selectedEntry);
      setStatus('已保存到世界书');
    } catch (error) {
      setStatus(`保存失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function deleteEntry() {
    if (!selectedEntry || !currentWorldBookName || !parentWindow.TavernHelper?.deleteWorldbookEntries) return;
    const itemName = stripCategoryPrefix(selectedEntry.name) || '未命名条目';
    if (!parentWindow.confirm(`确定要删除“${itemName}”吗？此操作不可撤销。`)) return;
    try {
      const result = await parentWindow.TavernHelper.deleteWorldbookEntries(
        currentWorldBookName,
        entry => entry.uid === selectedEntry.uid,
      );
      entries = pickProductEntries(result.worldbook || []);
      allWorldbookEntries = result.worldbook || [];
      selectedEntry = null;
      renderList();
      editor.hidden = true;
      content.hidden = true;
      empty.hidden = false;
      setStatus('条目已删除');
    } catch (error) {
      setStatus(`删除失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function setEditMode(value) {
    editMode = value;
    root.querySelector('.th-arcadia-mode-run').classList.toggle('active', !editMode);
    root.querySelector('.th-arcadia-mode-edit').classList.toggle('active', editMode);
    renderList();
    if (selectedEntry) showDetail(selectedEntry);
  }

  function showSettings(show) {
    settingsPanel.hidden = !show;
    networkPanel.hidden = true;
    settingsBackHeader.hidden = !show;
    if (show) settingsPanel.querySelectorAll('.th-arcadia-settings-module').forEach(module => { module.open = false; });
    content.hidden = show || editMode || !selectedEntry;
    editor.hidden = show || !editMode || !selectedEntry;
    empty.hidden = show || !!selectedEntry;
  }

  function saveSettings() {
    aiSettings = { ...aiSettings, source: aiSource.value, endpoint: aiEndpoint.value.trim().replace(/\/$/, ''), key: aiKey.value.trim(), model: aiModel.value, temperature: Number(aiTemperature.value) || 1, frequency: Number(aiFrequency.value) || 0, presence: Number(aiPresence.value) || 0, topP: Number(aiTopP.value) || 1 };
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(aiSettings));
    showSettings(false);
    setStatus('AI 设置已保存');
  }

  function savePrompt() {
    aiSettings.systemPrompt = aiSystemPrompt.value.trim();
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(aiSettings));
    setStatus('提示词已保存');
  }

  async function fetchModels() {
    if (!aiEndpoint.value.trim()) { setStatus('请先填写自定义端点'); return; }
    try {
      const response = await fetch(`${aiEndpoint.value.trim().replace(/\/$/, '')}/models`, { headers: aiKey.value.trim() ? { Authorization: `Bearer ${aiKey.value.trim()}` } : {} });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const models = Array.isArray(data) ? data : (data.data || []);
      aiModel.replaceChildren(...models.map(model => { const option = parentDocument.createElement('option'); option.value = model.id || model; option.textContent = model.id || model; return option; }));
      setStatus(`已获取 ${models.length} 个模型`);
    } catch (error) { setStatus(`获取模型失败：${error instanceof Error ? error.message : String(error)}`); }
  }

  function buildAiPrompt(instruction, currentContent) {
    const references = getActivatedWorldbookContext(`${instruction}\n${currentContent || ''}`);
    return `当前条目内容如下：\n${protectUserMacro(currentContent || '(空条目)')}\n\n${references ? `按蓝绿灯规则命中的世界书参考条目如下：\n${protectUserMacro(references)}\n\n` : ''}请根据用户要求修改或补全当前条目。只输出完整的结构化条目，不要输出解释文字。\n用户要求：${protectUserMacro(instruction)}`;
  }

  function protectUserMacro(text) {
    return String(text).replace(/\{\{\s*user\s*\}\}/gi, '__TH_USER_MACRO__');
  }

  function restoreUserMacro(text) {
    return String(text).replace(/__TH_USER_MACRO__/g, '{{user}}');
  }

  function keywordMatches(keyword, text) {
    if (keyword instanceof RegExp) {
      return new RegExp(keyword.source, keyword.flags.replace('g', '')).test(text);
    }
    return text.toLocaleLowerCase().includes(String(keyword).toLocaleLowerCase());
  }

  function getActivatedWorldbookContext(scanText) {
    const activated = allWorldbookEntries.filter(entry => {
      if (!entry.enabled || isSectionMarker(entry)) return false;
      if (entry.strategy?.type === 'constant') return true;
      if (entry.strategy?.type !== 'selective') return false;
      if (!(entry.strategy.keys || []).some(key => keywordMatches(key, scanText))) return false;
      const secondary = entry.strategy.keys_secondary?.keys || [];
      if (!secondary.length) return true;
      const matched = secondary.filter(key => keywordMatches(key, scanText)).length;
      switch (entry.strategy.keys_secondary.logic) {
        case 'and_all': return matched === secondary.length;
        case 'not_all': return matched < secondary.length;
        case 'not_any': return matched === 0;
        default: return matched > 0;
      }
    });
    return activated.map(entry => `[${entry.name || `条目 ${entry.uid}`}]\n${entry.content || ''}`).join('\n\n');
  }

  function buildAiSystemPrompt() {
    const customPrompt = protectUserMacro(aiSettings.systemPrompt?.trim() || '你是世界书条目编辑器。');
    return `${customPrompt}\n输出必须严格包含以下标签，并保留每个标签的开闭标签：\n<Item_Name></Item_Name>\n<Item_Data></Item_Data>\n<Origin></Origin>\n<Price></Price>\n<Trigger_Keywords></Trigger_Keywords>\n<Mechanism_Usage></Mechanism_Usage>\n<Core_Effects></Core_Effects>\n<Roleplay_Scenarios></Roleplay_Scenarios>\n<Safety_Override></Safety_Override>\n<AI_Directive></AI_Directive>。Trigger_Keywords 中请输出适合触发该条目的关键词，每行一个。涉及玩家时统一输出占位符 __TH_USER_MACRO__，不要输出真实用户名。不要输出 Markdown 代码块、解释或额外文字。`;
  }

  async function generateAiText(instruction) {
    if (aiSettings.source === 'tavern') {
      if (!parentWindow.TavernHelper?.generateRaw) throw new Error('酒馆助手未提供 generateRaw 接口');
      return String(await parentWindow.TavernHelper.generateRaw({
        user_input: buildAiPrompt(instruction, buildTaggedContent()),
        ordered_prompts: [{ role: 'system', content: buildAiSystemPrompt() }],
        overrides: {
          world_info_before: '',
          world_info_after: '',
          chat_history: { prompts: [], with_depth_entries: false },
        },
        should_silence: true,
      }));
    }
    if (!aiSettings.endpoint || !aiSettings.model) throw new Error('请先在设置中填写端点并选择模型');
    const response = await fetch(`${aiSettings.endpoint}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(aiSettings.key ? { Authorization: `Bearer ${aiSettings.key}` } : {}) }, body: JSON.stringify({ model: aiSettings.model, messages: [{ role: 'system', content: buildAiSystemPrompt() }, { role: 'user', content: buildAiPrompt(instruction, buildTaggedContent()) }], temperature: aiSettings.temperature, frequency_penalty: aiSettings.frequency, presence_penalty: aiSettings.presence, top_p: aiSettings.topP }) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return String(data.choices?.[0]?.message?.content || '');
  }

  async function aiWrite() {
    const instruction = aiPrompt.value.trim();
    if (!instruction || !selectedEntry) { setStatus('请先选择条目并填写提示词'); return; }
    aiWriteButton.disabled = true; setStatus('AI 正在生成…');
    try {
      const generated = restoreUserMacro(await generateAiText(instruction));
      TAG_DEFS.forEach(([tag]) => {
        const textarea = editorSections.querySelector(`textarea[data-tag="${tag}"]`);
        if (textarea) textarea.value = generated.match(new RegExp(`<${tag}\\s*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'i'))?.[1]?.trim() || textarea.value;
      });
      const generatedKeywords = editorSections.querySelector('textarea[data-tag="Trigger_Keywords"]')?.value?.trim();
      if (generatedKeywords) {
        editorKeys.value = generatedKeywords.split(/[\n,，]/).map(value => value.trim()).filter(Boolean).join('\n');
      }
      setStatus('AI 内容已填入编辑区，请检查后保存');
    } catch (error) { setStatus(`AI 生成失败：${error instanceof Error ? error.message : String(error)}`); }
    aiWriteButton.disabled = false;
  }

  fillButton.addEventListener('click', fillInput);
  collapseAllButton.addEventListener('click', () => {
    sections.querySelectorAll('details').forEach(section => { section.open = false; });
  });
  root.querySelector('.th-arcadia-close').addEventListener('click', () => { panel.hidden = true; });
  refreshButton.addEventListener('click', refreshAll);
  settingsButton.addEventListener('click', () => showSettings(settingsPanel.hidden));
  settingsBackHeader.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); showSettings(false); });
  settingsSave.addEventListener('click', saveSettings);
  promptSave.addEventListener('click', savePrompt);
  uiSave.addEventListener('click', () => {
    uiSettings.fontSize = Math.max(10, Math.min(24, Number(uiFontSize.value) || 14));
    persistUiSettings();
    applyUiSettings();
    status.textContent = '界面设置已保存';
  });
  uiModeDesktop.addEventListener('click', () => { uiSettings.mode = 'desktop'; applyUiSettings(); persistUiSettings(); });
  uiModeMobile.addEventListener('click', () => { uiSettings.mode = 'mobile'; applyUiSettings(); persistUiSettings(); });
  aiSource.addEventListener('change', updateAiSourceFields);
  modelButton.addEventListener('click', fetchModels);
  networkButton.addEventListener('click', () => showNetwork(true));
  root.querySelector('.th-arcadia-network-login').addEventListener('click', () => networkAuth(false));
  root.querySelector('.th-arcadia-network-register').addEventListener('click', () => networkAuth(true));
  root.querySelector('.th-arcadia-network-logout').addEventListener('click', () => { networkSession = null; localStorage.removeItem('th-arcadia-network-session'); updateNetworkState(); setStatus('已退出联网账号'); });
  // 上传世界书已移入编辑模式；联网页不再渲染旧的上传按钮。
  // 不要因为可选控件缺失而中断后续的悬浮球定位和拖拽初始化。
  root.querySelector('.th-arcadia-network-list').addEventListener('click', networkLoadWorkshop);
  workshopCategory.addEventListener('change', () => { workshopOffset = 0; networkLoadWorkshop(); });
  workshopSort.addEventListener('change', () => { workshopOffset = 0; networkLoadWorkshop(); });
  workshopSearch.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); workshopOffset = 0; networkLoadWorkshop(); } });
  workshopCollapseAll.addEventListener('click', () => networkItems.querySelectorAll('details').forEach(section => { section.open = false; }));
  root.querySelector('.th-arcadia-mainline-refresh').addEventListener('click', networkLoadMainline);
  root.querySelector('.th-arcadia-mainline-update').addEventListener('click', updateMainlineWorldbook);
  root.querySelector('.th-arcadia-mainline-collapse-all').addEventListener('click', () => mainlineItems.querySelectorAll('details').forEach(section => { section.open = false; }));
  mainlineCategory.addEventListener('change', () => { mainlineOffset = 0; networkLoadMainline(); });
  mainlineSort.addEventListener('change', () => { mainlineOffset = 0; networkLoadMainline(); });
  mainlineSearch.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); mainlineOffset = 0; networkLoadMainline(); } });
  aiWriteButton.addEventListener('click', aiWrite);
  root.querySelector('.th-arcadia-mode-run').addEventListener('click', () => setEditMode(false));
  root.querySelector('.th-arcadia-mode-edit').addEventListener('click', () => setEditMode(true));
  root.querySelector('.th-arcadia-save').addEventListener('click', saveEntry);
  deleteButton.addEventListener('click', deleteEntry);
  uploadEntryButton.addEventListener('click', event => { event.preventDefault(); event.stopImmediatePropagation(); uploadSelectedEntry(); });
  root.querySelector('.th-arcadia-upload-mainline').addEventListener('click', event => { event.preventDefault(); event.stopImmediatePropagation(); uploadMainlineEntry(); });

  // 悬浮球拖拽；窗口始终绑定在悬浮球上方。
  let dragging = false;
  let moved = false;
  let orbPointerId = null;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let dragStartLeft = 0;
  let dragStartTop = 0;
  // 参考移动端悬浮球的默认坐标：手机右下方预留 120px，桌面端左上区域。
  // 当前拖动系统使用 right/bottom，因此在启动时做一次坐标换算。
  try {
    const hostViewport = parentWindow.visualViewport;
    const localViewport = window.visualViewport;
    const hostWidth = hostViewport?.width || parentWindow.innerWidth || parentDocument.documentElement.clientWidth || 0;
    const hostHeight = hostViewport?.height || parentWindow.innerHeight || parentDocument.documentElement.clientHeight || 0;
    const localWidth = localViewport?.width || window.innerWidth || 0;
    const localHeight = localViewport?.height || window.innerHeight || 0;
    // SillyDroid 可能让宿主窗口保持桌面宽度，而脚本 iframe 实际是手机竖屏。
    // 当本地 viewport 明显更窄时，以本地可视区域计算初始坐标。
    const useLocalViewport = localWidth >= 160 && localWidth <= 768 && (hostWidth > 768 || localWidth < hostWidth);
    const viewportWidth = Math.max(160, useLocalViewport ? localWidth : hostWidth || localWidth || 360);
    const viewportHeight = Math.max(120, useLocalViewport ? localHeight : hostHeight || localHeight || 640);
    const orbWidth = orb.offsetWidth || 48;
    const orbHeight = orb.offsetHeight || 48;
    const isMobile = viewportWidth <= 768;
    const defaultX = isMobile ? viewportWidth - 60 : 40;
    const defaultY = isMobile ? viewportHeight - 120 : 160;
    startLeft = Math.max(4, Math.min(viewportWidth - orbWidth - 4, defaultX));
    startTop = Math.max(4, Math.min(viewportHeight - orbHeight - 4, defaultY));
    dragStartLeft = startLeft;
    dragStartTop = startTop;
    root.style.left = `${startLeft}px`;
    root.style.top = `${startTop}px`;
    debug('默认位置已计算', { viewportWidth, viewportHeight, isMobile, left: startLeft, top: startTop });
  } catch (error) {
    debug('默认位置计算失败，使用右下角回退位置', String(error?.message || error));
  }
  function syncPanelPosition() {
    const gap = 10;
    panel.style.right = '0px';
    panel.style.bottom = `${orb.offsetHeight + gap}px`;
  }

  orb.addEventListener('pointerdown', event => {
    event.preventDefault();
    event.stopPropagation();
    dragging = true;
    moved = false;
    orbPointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    dragStartLeft = parseFloat(root.style.left) || 0;
    dragStartTop = parseFloat(root.style.top) || 0;
    try { orb.setPointerCapture(event.pointerId); } catch (_) {}
  });
  parentDocument.addEventListener('pointermove', event => {
    if (!dragging || event.pointerId !== orbPointerId) return;
    event.preventDefault();
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    startLeft = Math.max(4, Math.min(parentWindow.innerWidth - orb.offsetWidth - 4, dragStartLeft + dx));
    startTop = Math.max(4, Math.min(parentWindow.innerHeight - orb.offsetHeight - 4, dragStartTop + dy));
    root.style.left = `${startLeft}px`;
    root.style.top = `${startTop}px`;
  }, { passive: false, signal: cleanupController.signal });
  parentDocument.addEventListener('pointerup', event => {
    if (!dragging || event.pointerId !== orbPointerId) return;
    dragging = false;
    orbPointerId = null;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: `${startLeft}px`, top: `${startTop}px` }));
    if (!moved) openPanel();
  }, { signal: cleanupController.signal });
  parentDocument.addEventListener('pointercancel', event => {
    if (event.pointerId !== orbPointerId) return;
    dragging = false;
    orbPointerId = null;
  }, { signal: cleanupController.signal });

  // 窗口标题栏也允许拖动，但拖动后会重新以窗口位置同步悬浮球。
  header.addEventListener('pointerdown', event => {
    if (event.target.closest('button')) return;
    dragging = true;
    header.setPointerCapture(event.pointerId);
    startX = event.clientX;
    startY = event.clientY;
    dragStartLeft = parseFloat(root.style.left) || 0;
    dragStartTop = parseFloat(root.style.top) || 0;
  });
  header.addEventListener('pointermove', event => {
    if (!dragging) return;
    startLeft = Math.max(4, Math.min(parentWindow.innerWidth - orb.offsetWidth - 4, dragStartLeft + (event.clientX - startX)));
    startTop = Math.max(4, Math.min(parentWindow.innerHeight - orb.offsetHeight - 4, dragStartTop + (event.clientY - startY)));
    root.style.left = `${startLeft}px`;
    root.style.top = `${startTop}px`;
  });
  header.addEventListener('pointerup', () => {
    dragging = false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: `${startLeft}px`, top: `${startTop}px` }));
  });

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.left && saved?.top) {
      const left = Number.parseFloat(saved.left);
      const top = Number.parseFloat(saved.top);
      if (Number.isFinite(left) && Number.isFinite(top)) {
        startLeft = Math.max(4, Math.min(parentWindow.innerWidth - orb.offsetWidth - 4, left));
        startTop = Math.max(4, Math.min(parentWindow.innerHeight - orb.offsetHeight - 4, top));
        root.style.left = `${startLeft}px`;
        root.style.top = `${startTop}px`;
      }
    }
  } catch (_) {
    // 忽略损坏的旧位置数据。
  }

  const cleanup = () => {
    if (cleanup.done) return;
    cleanup.done = true;
    cleanupController.abort();
    root.remove();
    style.remove();
    if (parentWindow.__TH_ARCADIA_CLEANUP__ === cleanup) {
      try { delete parentWindow.__TH_ARCADIA_CLEANUP__; } catch (_) { parentWindow.__TH_ARCADIA_CLEANUP__ = null; }
    }
  };
  cleanup.done = false;
  parentWindow.__TH_ARCADIA_CLEANUP__ = cleanup;
  parentWindow.addEventListener('pagehide', cleanup, { once: true });
  // 停用全局脚本时，酒馆助手通常会卸载脚本 iframe，但不一定刷新宿主页面。
  // 监听当前 iframe 的生命周期，及时移除挂载到宿主文档的悬浮窗。
  window.addEventListener('pagehide', cleanup, { once: true });
  window.addEventListener('beforeunload', cleanup, { once: true });
  if (scriptFrame) {
    try {
      const frameObserver = new MutationObserver(() => {
        if (!scriptFrame.isConnected) cleanup();
      });
      frameObserver.observe(parentDocument.documentElement, { childList: true, subtree: true });
      cleanupController.signal.addEventListener('abort', () => frameObserver.disconnect(), { once: true });
    } catch (_) {}
  }
  debug('脚本初始化完成', {
    orb: !!orb,
    panel: !!panel,
    rootConnected: root.isConnected,
    rootParent: root.parentElement?.tagName || null,
    orbRect: (() => {
      try {
        const rect = orb.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      } catch (_) { return null; }
    })(),
  });
})();
