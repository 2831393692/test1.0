// 弹窗脚本 - 处理用户交互和数据展示
document.addEventListener('DOMContentLoaded', () => {
  // ========== DOM 元素获取 ==========
  const selectAreaBtn = document.getElementById('selectAreaBtn');     // 选择区域按钮
  const screenshotPreview = document.getElementById('screenshotPreview'); // 截图预览容器
  const screenshotImg = document.getElementById('screenshotImg');     // 截图图片元素
  const extractBtn = document.getElementById('extractBtn');           // 提取文字按钮
  const loading = document.getElementById('loading');                 // 加载状态显示
  const result = document.getElementById('result');                   // 结果容器
  const resultText = document.getElementById('resultText');           // 结果文本框
  const exportBtn = document.getElementById('exportBtn');             // 导出按钮
  const error = document.getElementById('error');                     // 错误提示容器
  const errorText = document.getElementById('errorText');             // 错误文本

  // ========== 状态变量 ==========
  let selectedText = '';        // 提取的文字内容
  let screenshotDataUrl = '';   // 截图的 base64 数据

  // ========== 检查存储中的结果 ==========
  // 打开弹窗时检查是否有待处理的结果
  function checkStorage() {
    chrome.storage.local.get(['screenshotResult'], (items) => {
      if (items.screenshotResult) {
        handleResult(items.screenshotResult);  // 处理结果
        chrome.storage.local.remove('screenshotResult');  // 清除存储
      }
    });
  }

  // 页面加载时立即检查
  checkStorage();

  // ========== 监听存储变化 ==========
  // 当 content.js 写入结果时触发
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.screenshotResult) {
      const newValue = changes.screenshotResult.newValue;
      if (newValue && newValue.type) {  // 确保数据有效
        handleResult(newValue);  // 处理新结果
        chrome.storage.local.remove('screenshotResult');  // 清除存储
      }
    }
  });

  // ========== 处理截图结果 ==========
  function handleResult(resultData) {
    if (resultData.type === 'success') {
      // 成功：保存数据并显示预览
      selectedText = resultData.text;           // 保存提取的文字
      screenshotDataUrl = resultData.dataUrl;   // 保存截图数据
      
      // 显示截图预览
      if (screenshotDataUrl) {
        screenshotImg.src = screenshotDataUrl;
        screenshotPreview.style.display = 'block';
      }
      
      // 显示操作按钮
      extractBtn.style.display = 'block';
      result.style.display = 'none';
      exportBtn.style.display = 'none';
      selectAreaBtn.textContent = '🔄 重新选择区域';
      hideError();
    } else if (resultData.type === 'error') {
      // 失败：显示错误信息
      showError(resultData.message);
    }
  }

  // ========== 选择区域按钮点击事件 ==========
  selectAreaBtn.addEventListener('click', async () => {
    try {
      // 清除之前的存储结果
      chrome.storage.local.remove('screenshotResult');
      
      // 获取当前活动标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // 向当前页面注入 content.js 脚本
      // 注入后会显示选择框，用户可以拖动选择区域
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });

    } catch (e) {
      showError('无法注入脚本：' + e.message);
    }
  });

  // ========== 提取文字按钮点击事件 ==========
  extractBtn.addEventListener('click', () => {
    // 显示加载状态
    loading.style.display = 'block';
    extractBtn.style.display = 'none';
    
    // 模拟处理延迟（实际文字已在选择时提取）
    setTimeout(() => {
      // 显示提取结果
      resultText.value = selectedText || '未提取到文字';
      loading.style.display = 'none';
      result.style.display = 'block';
      exportBtn.style.display = 'block';
    }, 500);
  });

  // ========== 导出按钮点击事件 ==========
  exportBtn.addEventListener('click', () => {
    const text = resultText.value.trim();
    if (!text) {
      showError('没有可导出的文字');
      return;
    }

    // 创建 Blob 对象（文本文件）
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    // 创建下载链接并触发下载
    const a = document.createElement('a');
    a.href = url;
    a.download = '网页内容.txt';  // 文件名
    document.body.appendChild(a);
    a.click();  // 触发下载
    document.body.removeChild(a);
    URL.revokeObjectURL(url);  // 释放 URL 对象
  });

  // ========== 辅助函数 ==========
  // 显示错误提示
  function showError(msg) {
    errorText.textContent = msg;
    error.style.display = 'block';
  }

  // 隐藏错误提示
  function hideError() {
    error.style.display = 'none';
  }
});
