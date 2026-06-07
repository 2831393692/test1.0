// 弹窗脚本 - 处理用户交互和数据展示
document.addEventListener('DOMContentLoaded', () => {
  // ========== DOM 元素获取 ==========
  const selectAreaBtn = document.getElementById('selectAreaBtn');     // 选择区域按钮
  const screenshotPreview = document.getElementById('screenshotPreview'); // 截图预览容器
  const screenshotImg = document.getElementById('screenshotImg');     // 截图图片元素
  const extractBtn = document.getElementById('extractBtn');           // 提取文字按钮
  const ocrBtn = document.getElementById('ocrBtn');                   // OCR识别按钮
  const loading = document.getElementById('loading');                 // 加载状态显示
  const loadingText = document.getElementById('loadingText');         // 加载文字
  const result = document.getElementById('result');                   // 结果容器
  const resultText = document.getElementById('resultText');           // 结果文本框
  const exportBtn = document.getElementById('exportBtn');             // 导出按钮
  const error = document.getElementById('error');                     // 错误提示容器
  const errorText = document.getElementById('errorText');             // 错误文本
  const config = document.getElementById('config');                   // 配置区域
  const exportFormat = document.getElementById('exportFormat');       // 导出格式选择
  const exportText = document.getElementById('exportText');           // 导出文字选项
  const exportImage = document.getElementById('exportImage');         // 导出图片选项
  const ocrConfig = document.getElementById('ocrConfig');             // OCR配置区域
  const apiKey = document.getElementById('apiKey');                   // OCR API Key
  const secretKey = document.getElementById('secretKey');             // OCR Secret Key

  // ========== 状态变量 ==========
  let selectedText = '';        // 提取的文字内容
  let screenshotDataUrl = '';   // 截图的 base64 数据

  // ========== 检查存储中的结果 ==========
  function checkStorage() {
    chrome.storage.local.get(['screenshotResult'], (items) => {
      if (items.screenshotResult) {
        handleResult(items.screenshotResult);
        chrome.storage.local.remove('screenshotResult');
      }
    });
    // 加载保存的 OCR 配置
    chrome.storage.local.get(['ocrApiKey', 'ocrSecretKey'], (items) => {
      if (items.ocrApiKey) apiKey.value = items.ocrApiKey;
      if (items.ocrSecretKey) secretKey.value = items.ocrSecretKey;
    });
  }

  checkStorage();

  // ========== 监听存储变化 ==========
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.screenshotResult) {
      const newValue = changes.screenshotResult.newValue;
      if (newValue && newValue.type) {
        handleResult(newValue);
        chrome.storage.local.remove('screenshotResult');
      }
    }
  });

  // ========== 处理截图结果 ==========
  function handleResult(resultData) {
    if (resultData.type === 'success') {
      selectedText = resultData.text || '';
      screenshotDataUrl = resultData.dataUrl || '';
      
      if (screenshotDataUrl) {
        screenshotImg.src = screenshotDataUrl;
        screenshotPreview.style.display = 'block';
      }
      
      config.style.display = 'block';
      document.getElementById('extractButtons').style.display = 'flex';
      ocrConfig.style.display = 'none';
      result.style.display = 'none';
      exportBtn.style.display = 'none';
      selectAreaBtn.textContent = '🔄 重新选择区域';
      hideError();
    } else if (resultData.type === 'error') {
      showError(resultData.message);
    }
  }

  // ========== 选择区域按钮点击事件 ==========
  selectAreaBtn.addEventListener('click', async () => {
    try {
      chrome.storage.local.remove('screenshotResult');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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
    loadingText.textContent = '提取中...';
    loading.style.display = 'block';
    document.getElementById('extractButtons').style.display = 'none';
    
    setTimeout(() => {
      resultText.value = selectedText || '未提取到文字，请尝试选择包含文字的区域';
      loading.style.display = 'none';
      result.style.display = 'block';
      exportBtn.style.display = 'block';
    }, 500);
  });

  // ========== OCR识别按钮点击事件 ==========
  ocrBtn.addEventListener('click', async () => {
    if (!screenshotDataUrl) {
      showError('请先选择截图区域');
      return;
    }
    
    const key = apiKey.value.trim();
    const secret = secretKey.value.trim();
    
    if (!key || !secret) {
      ocrConfig.style.display = 'block';
      showError('请输入百度OCR API Key和Secret Key');
      return;
    }
    
    // 保存配置
    chrome.storage.local.set({ ocrApiKey: key, ocrSecretKey: secret });
    
    loadingText.textContent = 'OCR识别中...';
    loading.style.display = 'block';
    document.getElementById('extractButtons').style.display = 'none';
    ocrConfig.style.display = 'none';
    
    try {
      const ocrResult = await baiduOCR(key, secret, screenshotDataUrl);
      resultText.value = ocrResult || 'OCR识别失败';
    } catch (err) {
      resultText.value = 'OCR识别失败: ' + err.message;
    } finally {
      loading.style.display = 'none';
      result.style.display = 'block';
      exportBtn.style.display = 'block';
      hideError();
    }
  });

  // ========== 导出按钮点击事件 ==========
  exportBtn.addEventListener('click', () => {
    const text = resultText.value.trim();
    const format = exportFormat.value;
    const includeText = exportText.checked;
    const includeImage = exportImage.checked;
    
    if (!includeText && !includeImage) {
      showError('请至少选择一项导出内容');
      return;
    }
    
    try {
      if (format === 'txt') {
        exportTXT(text, includeText);
      } else if (format === 'md') {
        exportMarkdown(text, includeImage);
      } else if (format === 'html') {
        exportHTML(text, includeImage);
      }
    } catch (err) {
      showError('导出失败: ' + err.message);
    }
  });

  // ========== 导出函数 ==========
  // 导出 TXT
  function exportTXT(text, includeText) {
    let content = '';
    if (includeText && text) {
      content = text;
    }
    downloadFile(content, '网页内容.txt', 'text/plain;charset=utf-8');
  }

  // 导出 Markdown
  function exportMarkdown(text, includeImage) {
    let content = `# 网页截图内容\n\n`;
    if (includeImage && screenshotDataUrl) {
      content += `![截图](data:image/png;base64,${screenshotDataUrl.split(',')[1]})\n\n`;
    }
    if (text) {
      content += `## 提取文字\n\n${text}\n`;
    }
    downloadFile(content, '网页内容.md', 'text/markdown;charset=utf-8');
  }

  // 导出 HTML（Word 可直接打开）
  function exportHTML(text, includeImage) {
    let content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>网页截图内容</title>
  <style>
    body { font-family: Microsoft YaHei, sans-serif; padding: 20px; }
    h1 { color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px; }
    .image-container { margin: 20px 0; text-align: center; }
    .image-container img { max-width: 100%; border: 1px solid #ddd; }
    .text-content { margin-top: 20px; line-height: 1.8; color: #333; }
  </style>
</head>
<body>
  <h1>📸 网页截图内容</h1>
`;
    if (includeImage && screenshotDataUrl) {
      content += `  <div class="image-container">
    <img src="${screenshotDataUrl}" alt="截图">
  </div>
`;
    }
    if (text) {
      content += `  <div class="text-content">
    ${text.replace(/\n/g, '<br>')}
  </div>
`;
    }
    content += `</body>
</html>`;
    downloadFile(content, '网页内容.html', 'text/html;charset=utf-8');
  }

  // 通用下载函数
  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ========== 百度OCR API 调用 ==========
  async function baiduOCR(apiKey, secretKey, imageDataUrl) {
    // 获取 Access Token
    const tokenResponse = await fetch('https://aip.baidubce.com/oauth/2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`
    });
    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      throw new Error('获取AccessToken失败');
    }
    
    // 调用OCR识别
    const base64Image = imageDataUrl.split(',')[1];
    const ocrResponse = await fetch('https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `image=${encodeURIComponent(base64Image)}&access_token=${tokenData.access_token}`
    });
    const ocrData = await ocrResponse.json();
    
    if (ocrData.words_result) {
      return ocrData.words_result.map(item => item.words).join('\n');
    } else {
      throw new Error(ocrData.error_msg || '识别失败');
    }
  }

  // ========== 辅助函数 ==========
  function showError(msg) {
    errorText.textContent = msg;
    error.style.display = 'block';
  }

  function hideError() {
    error.style.display = 'none';
  }
});