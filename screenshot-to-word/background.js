// 后台脚本 - 处理跨域请求和消息转发

// ========== 状态变量 ==========
let pendingCallback = null;  // 待执行的回调函数

// ========== 消息监听 ==========
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  // 1. 截取可见标签页
  if (request.type === 'captureVisibleTab') {
    // 调用 Chrome API 截取当前可见标签页
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        // 截图失败，返回错误
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        // 截图成功，返回 base64 数据
        sendResponse({ dataUrl: dataUrl });
      }
    });
    return true;  // 保持消息通道开放，等待异步响应
  }
  
  // 2. 选择完成或错误消息
  if (request.type === 'selectionReady' || request.type === 'selectionError') {
    if (pendingCallback) {
      // 转发消息到对应的标签页
      pendingCallback(request);
      pendingCallback = null;
    }
    sendResponse({ received: true });
    return true;
  }
  
  // 3. 注册回调（用于消息转发）
  if (request.type === 'registerCallback') {
    pendingCallback = (msg) => {
      // 向发送消息的标签页发送响应
      chrome.tabs.sendMessage(sender.tab.id, msg);
    };
    sendResponse({ registered: true });
    return true;
  }
});
