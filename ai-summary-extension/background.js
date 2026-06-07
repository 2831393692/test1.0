chrome.runtime.onInstalled.addListener(() => { 
  console.log('AI网页总结助手已安装'); 
}); 
 
// 可以在这里添加后台任务，比如统计使用次数 
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => { 
  if (request.type === 'trackUsage') { 
    // 记录使用次数，用于后续限制免费版 
    chrome.storage.local.get(['usageCount'], (result) => { 
      const count = (result.usageCount || 0) + 1; 
      chrome.storage.local.set({ usageCount: count }); 
      sendResponse({ count }); 
    }); 
    return true; 
  } 
}); 
