// 弹窗脚本 - 处理用户交互和数据展示
document.addEventListener('DOMContentLoaded', () => {
  // ========== DOM 元素获取 ==========
  const selectAreaBtn = document.getElementById('selectAreaBtn');
  const screenshotPreview = document.getElementById('screenshotPreview');
  const screenshotImg = document.getElementById('screenshotImg');
  const extractBtn = document.getElementById('extractBtn');
  const ocrBtn = document.getElementById('ocrBtn');
  const loading = document.getElementById('loading');
  const loadingText = document.getElementById('loadingText');
  const result = document.getElementById('result');
  const resultText = document.getElementById('resultText');
  const exportBtn = document.getElementById('exportBtn');
  const error = document.getElementById('error');
  const errorText = document.getElementById('errorText');
  const exportFormat = document.getElementById('exportFormat');
  const exportText = document.getElementById('exportText');
  const exportImage = document.getElementById('exportImage');
  const ocrProviderEl = document.getElementById('ocrProvider');
  const baiduConfig = document.getElementById('baiduConfig');
  const tencentConfig = document.getElementById('tencentConfig');
  const aliyunConfig = document.getElementById('aliyunConfig');
  const baiduApiKey = document.getElementById('baiduApiKey');
  const baiduSecretKey = document.getElementById('baiduSecretKey');
  const tencentSecretId = document.getElementById('tencentSecretId');
  const tencentSecretKey = document.getElementById('tencentSecretKey');
  const aliyunAccessKeyId = document.getElementById('aliyunAccessKeyId');
  const aliyunAccessKeySecret = document.getElementById('aliyunAccessKeySecret');

  // ========== 状态变量 ==========
  let selectedText = '';
  let screenshotDataUrl = '';

  // ========== 初始化 ==========
  function init() {
    restoreState();
    bindEvents();
    chrome.runtime.sendMessage({ type: 'clearBadge' }).catch(() => {});
  }

  // ========== 恢复持久化状态 ==========
  function restoreState() {
    chrome.storage.local.get([
      'popupState', 'screenshotResult', 'ocrProvider', 'baiduApiKey', 'baiduSecretKey',
      'tencentSecretId', 'tencentSecretKey', 'aliyunAccessKeyId', 'aliyunAccessKeySecret'
    ], (items) => {
      // 恢复 OCR 配置
      ocrProviderEl.value = items.ocrProvider || 'aliyun';
      switchOCRConfig(ocrProviderEl.value);
      if (items.baiduApiKey) baiduApiKey.value = items.baiduApiKey;
      if (items.baiduSecretKey) baiduSecretKey.value = items.baiduSecretKey;
      if (items.tencentSecretId) tencentSecretId.value = items.tencentSecretId;
      if (items.tencentSecretKey) tencentSecretKey.value = items.tencentSecretKey;
      if (items.aliyunAccessKeyId) aliyunAccessKeyId.value = items.aliyunAccessKeyId;
      if (items.aliyunAccessKeySecret) aliyunAccessKeySecret.value = items.aliyunAccessKeySecret;

      // 优先处理新的截图结果（弹窗关闭期间 content.js 写入的）
      if (items.screenshotResult && items.screenshotResult.type) {
        handleResult(items.screenshotResult);
        return; // 新截图优先，跳过旧状态
      }

      // 恢复持久化的截图/OCR状态
      if (items.popupState) {
        const state = items.popupState;
        if (state.screenshotDataUrl) {
          screenshotDataUrl = state.screenshotDataUrl;
          selectedText = state.selectedText || '';
          screenshotImg.src = screenshotDataUrl;
          screenshotPreview.style.display = 'block';
          document.getElementById('extractButtons').style.display = 'flex';
          selectAreaBtn.textContent = '🔄 重新选择区域';
        }
        if (state.ocrResult !== undefined) {
          resultText.value = state.ocrResult || '';
          result.style.display = 'block';
          exportBtn.style.display = 'block';
        }
        if (state.errorMsg) {
          showError(state.errorMsg);
        }
      }
    });
  }

  // ========== 保存状态到 storage（弹窗关闭后仍保留） ==========
  function saveState(updates = {}) {
    const state = {
      screenshotDataUrl: updates.screenshotDataUrl !== undefined ? updates.screenshotDataUrl : screenshotDataUrl,
      selectedText: updates.selectedText !== undefined ? updates.selectedText : selectedText,
      ocrResult: updates.ocrResult !== undefined ? updates.ocrResult : (resultText.value || undefined),
      errorMsg: updates.errorMsg || undefined
    };
    chrome.storage.local.set({ popupState: state });
  }

  // ========== 清除状态 ==========
  function clearState() {
    chrome.storage.local.remove('popupState');
  }

  // ========== 监听 content.js 写入的新截图 ==========
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.screenshotResult) {
      const newValue = changes.screenshotResult.newValue;
      if (newValue && newValue.type) {
        handleResult(newValue);
        // 不再删除 screenshotResult，由 content.js 下次截图时覆盖
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
      document.getElementById('extractButtons').style.display = 'flex';
      result.style.display = 'none';
      exportBtn.style.display = 'none';
      selectAreaBtn.textContent = '🔄 重新选择区域';
      hideError();
      
      // 持久化截图状态
      saveState({ 
        screenshotDataUrl, selectedText, 
        ocrResult: undefined, errorMsg: undefined 
      });
    } else if (resultData.type === 'error') {
      showError(resultData.message);
      saveState({ errorMsg: resultData.message });
    }
  }

  // ========== 绑定事件 ==========
  function bindEvents() {
    ocrProviderEl.addEventListener('change', (e) => {
      const provider = e.target.value;
      switchOCRConfig(provider);
      chrome.storage.local.set({ ocrProvider: provider });
    });

    baiduApiKey.addEventListener('change', () => saveConfig('baiduApiKey', baiduApiKey.value));
    baiduSecretKey.addEventListener('change', () => saveConfig('baiduSecretKey', baiduSecretKey.value));
    tencentSecretId.addEventListener('change', () => saveConfig('tencentSecretId', tencentSecretId.value));
    tencentSecretKey.addEventListener('change', () => saveConfig('tencentSecretKey', tencentSecretKey.value));
    aliyunAccessKeyId.addEventListener('change', () => saveConfig('aliyunAccessKeyId', aliyunAccessKeyId.value));
    aliyunAccessKeySecret.addEventListener('change', () => saveConfig('aliyunAccessKeySecret', aliyunAccessKeySecret.value));
  }

  // ========== 保存配置 ==========
  function saveConfig(key, value) {
    chrome.storage.local.set({ [key]: value });
  }

  // ========== 切换 OCR 配置 ==========
  function switchOCRConfig(provider) {
    baiduConfig.style.display = provider === 'baidu' ? 'block' : 'none';
    tencentConfig.style.display = provider === 'tencent' ? 'block' : 'none';
    aliyunConfig.style.display = provider === 'aliyun' ? 'block' : 'none';
  }

  // ========== 选择区域按钮 ==========
  selectAreaBtn.addEventListener('click', async () => {
    try {
      clearState(); // 清除旧状态
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

  // ========== 提取文字按钮 ==========
  extractBtn.addEventListener('click', () => {
    loadingText.textContent = '提取中...';
    loading.style.display = 'block';
    document.getElementById('extractButtons').style.display = 'none';

    setTimeout(() => {
      resultText.value = selectedText || '未提取到文字，请尝试选择包含文字的区域';
      loading.style.display = 'none';
      result.style.display = 'block';
      exportBtn.style.display = 'block';
      saveState({ ocrResult: resultText.value });
    }, 500);
  });

  // ========== OCR识别按钮 ==========
  ocrBtn.addEventListener('click', async () => {
    if (!screenshotDataUrl) {
      showError('请先选择截图区域');
      return;
    }

    const provider = ocrProviderEl.value;
    loadingText.textContent = 'OCR识别中...';
    loading.style.display = 'block';
    document.getElementById('extractButtons').style.display = 'none';
    result.style.display = 'none';
    exportBtn.style.display = 'none';
    hideError();

    try {
      let ocrResult = '';
      if (provider === 'local') {
        ocrResult = await localOCR(screenshotDataUrl);
      } else if (provider === 'baidu') {
        const apiKey = baiduApiKey.value.trim();
        const secretKey = baiduSecretKey.value.trim();
        if (!apiKey || !secretKey) { showError('请输入百度OCR API Key和Secret Key'); return; }
        ocrResult = await baiduOCR(apiKey, secretKey, screenshotDataUrl);
      } else if (provider === 'tencent') {
        const secretId = tencentSecretId.value.trim();
        const secretKey = tencentSecretKey.value.trim();
        if (!secretId || !secretKey) { showError('请输入腾讯云 Secret Id和Secret Key'); return; }
        ocrResult = await tencentOCR(secretId, secretKey, screenshotDataUrl);
      } else if (provider === 'aliyun') {
        const accessKeyId = aliyunAccessKeyId.value.trim();
        const accessKeySecret = aliyunAccessKeySecret.value.trim();
        if (!accessKeyId || !accessKeySecret) { showError('请输入阿里云 AccessKey ID和AccessKey Secret'); return; }
        ocrResult = await aliyunOCR(accessKeyId, accessKeySecret, screenshotDataUrl);
      }

      resultText.value = ocrResult || 'OCR识别失败';
      loading.style.display = 'none';
      result.style.display = 'block';
      exportBtn.style.display = 'block';
      hideError();
      
      // 持久化 OCR 结果
      saveState({ ocrResult: resultText.value });
      setTimeout(() => {
        result.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } catch (err) {
      showError(err.message);
      loading.style.display = 'none';
      document.getElementById('extractButtons').style.display = 'flex';
    }
  });

  // ========== 导出按钮 ==========
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
      } else if (format === 'doc') {
        exportDOC(text, includeImage);
      } else if (format === 'pdf') {
        exportPDF(text, includeImage);
      }
    } catch (err) {
      showError('导出失败: ' + err.message);
    }
  });

  // ========== 导出函数 ==========
  function exportTXT(text, includeText) {
    let content = '';
    if (includeText && text) content = text;
    downloadFile(content, '网页内容.txt', 'text/plain;charset=utf-8');
  }

  function exportMarkdown(text, includeImage) {
    let content = '# 网页截图内容\n\n';
    if (includeImage && screenshotDataUrl) {
      content += `![截图](data:image/png;base64,${screenshotDataUrl.split(',')[1]})\n\n`;
    }
    if (text) content += '## 提取文字\n\n' + text + '\n';
    downloadFile(content, '网页内容.md', 'text/markdown;charset=utf-8');
  }

  function exportHTML(text, includeImage) {
    let content = '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n  <title>网页截图内容</title>\n';
    content += '  <style>\n    body { font-family: Microsoft YaHei, sans-serif; padding: 20px; }\n';
    content += '    h1 { color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px; }\n';
    content += '    .image-container { margin: 20px 0; text-align: center; }\n';
    content += '    .image-container img { max-width: 100%; border: 1px solid #ddd; }\n';
    content += '    .text-content { margin-top: 20px; line-height: 1.8; color: #333; }\n  </style>\n</head>\n<body>\n';
    content += '  <h1>📸 网页截图内容</h1>\n';
    if (includeImage && screenshotDataUrl) {
      content += '  <div class="image-container">\n    <img src="' + screenshotDataUrl + '" alt="截图">\n  </div>\n';
    }
    if (text) {
      content += '  <div class="text-content">\n    ' + text.replace(/\n/g, '<br>\n    ') + '\n  </div>\n';
    }
    content += '</body>\n</html>';
    downloadFile(content, '网页内容.html', 'text/html;charset=utf-8');
  }

  function exportDOC(text, includeImage) {
    let imgHtml = '';
    if (includeImage && screenshotDataUrl) {
      imgHtml = '<div style="text-align:center;margin:10px 0;"><img src="' + screenshotDataUrl + '" style="max-width:100%;border:1px solid #ddd;" alt="截图"></div>';
    }
    let textHtml = '';
    if (text) {
      textHtml = text.split('\n').map(line => '<p style="margin:6px 0;line-height:1.8;">' + (line || '&nbsp;') + '</p>').join('\n');
    }
    const content = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">\n<head>\n  <meta charset="UTF-8">\n  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">\n  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->\n  <style>\n    @page { margin: 2cm; }\n    body { font-family: "Microsoft YaHei", "SimSun", sans-serif; font-size: 14px; color: #333; }\n    h1 { color: #2E7D32; border-bottom: 2px solid #4CAF50; padding-bottom: 8px; }\n  </style>\n</head>\n<body>\n  <h1>📸 网页截图内容</h1>\n  ' + imgHtml + '\n  ' + textHtml + '\n</body></html>';
    downloadFile(content, '网页内容.doc', 'application/msword;charset=utf-8');
  }

  function exportPDF(text, includeImage) {
    let imgHtml = '';
    if (includeImage && screenshotDataUrl) {
      imgHtml = '<div style="text-align:center;margin:16px 0;"><img src="' + screenshotDataUrl + '" style="max-width:100%;border:1px solid #ddd;" alt="截图"></div>';
    }
    let textHtml = '';
    if (text) {
      textHtml = text.split('\n').map(line => '<p style="margin:6px 0;line-height:1.8;">' + (line || '&nbsp;') + '</p>').join('\n');
    }
    const content = '<!DOCTYPE html>\n<html><head><meta charset="UTF-8"><title>网页截图内容</title>\n<style>\n  @media print { body { margin: 0; } }\n  body { font-family: "Microsoft YaHei", sans-serif; padding: 30px; color: #333; }\n  h1 { color: #2E7D32; border-bottom: 2px solid #4CAF50; padding-bottom: 8px; }\n  img { max-width: 100%; }\n</style></head>\n<body>\n  <h1>📸 网页截图内容</h1>\n  ' + imgHtml + '\n  ' + textHtml + '\n</body></html>';
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      win.onload = () => { win.print(); win.onafterprint = () => win.close(); };
      setTimeout(() => { try { win.print(); } catch(e) {} }, 800);
    } else {
      downloadFile(content, '网页内容.html', 'text/html;charset=utf-8');
      showError('弹窗被拦截，已下载HTML文件，请手动打印为PDF');
    }
  }

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

  // ========== OCR API 函数 ==========
  async function baiduOCR(apiKey, secretKey, imageDataUrl) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'baiduOCR', apiKey, secretKey, imageDataUrl }, (response) => {
        if (response && response.success) resolve(response.result);
        else reject(new Error(response?.error || '百度OCR识别失败'));
      });
    });
  }

  async function localOCR(imageDataUrl) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width; canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        resolve('本地OCR功能提示：\n\n由于完整的本地OCR需要下载大型语言包，建议：\n\n1. 使用"提取文字"功能直接从网页提取\n2. 配置百度/腾讯云/阿里云OCR API Key使用云端识别\n3. 如需本地OCR，请安装专门的OCR软件\n\n当前截图尺寸: ' + img.width + 'x' + img.height);
      };
      img.onerror = () => reject(new Error('无法加载图像'));
      img.src = imageDataUrl;
    });
  }

  async function tencentOCR(secretId, secretKey, imageDataUrl) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'tencentOCR', secretId, secretKey, imageDataUrl }, (response) => {
        if (response && response.success) resolve(response.result);
        else reject(new Error(response?.error || '腾讯云OCR识别失败'));
      });
    });
  }

  async function aliyunOCR(accessKeyId, accessKeySecret, imageDataUrl) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'aliyunOCR', accessKeyId, accessKeySecret, imageDataUrl }, (response) => {
        if (response && response.success) resolve(response.result);
        else reject(new Error(response?.error || '阿里云OCR识别失败'));
      });
    });
  }

  // ========== 错误处理 ==========
  function showError(msg) {
    errorText.textContent = msg;
    error.style.display = 'block';
    loading.style.display = 'none';
  }

  function hideError() {
    error.style.display = 'none';
  }

  init();
});