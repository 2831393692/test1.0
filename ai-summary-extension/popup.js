document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const lengthSelect = document.getElementById('length');
  const summarizeBtn = document.getElementById('summarizeBtn');
  const loadingDiv = document.getElementById('loading');
  const resultDiv = document.getElementById('result');
  const summaryText = document.getElementById('summaryText');
  const copyBtn = document.getElementById('copyBtn');
  const errorDiv = document.getElementById('error');
  const errorText = document.getElementById('errorText');

  // 加载保存的API Key
  chrome.storage.local.get(['apiKey'], (result) => {
    if (result.apiKey) apiKeyInput.value = result.apiKey;
  });

  // 保存API Key
  apiKeyInput.addEventListener('change', () => {
    chrome.storage.local.set({ apiKey: apiKeyInput.value });
  });

  // 点击总结按钮
  summarizeBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      showError('请先输入DeepSeek API Key');
      return;
    }

    // 重置状态
    loadingDiv.classList.remove('hidden');
    resultDiv.classList.add('hidden');
    errorDiv.classList.add('hidden');
    summarizeBtn.disabled = true;
    summarizeBtn.textContent = '分析中...';

    try {
      // 1. 获取当前标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // 2. 提取页面内容
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractPageContent
      });

      if (!result.result || !result.result.content) {
        throw new Error('无法提取页面内容');
      }

      const { content, title } = result.result;

      // 3. 调用AI总结
      const summary = await callDeepSeek(apiKey, content, title, lengthSelect.value);

      // 4. 显示结果
      summaryText.textContent = summary;
      resultDiv.classList.remove('hidden');

    } catch (error) {
      showError(error.message || '总结失败，请检查API Key是否正确');
    } finally {
      loadingDiv.classList.add('hidden');
      summarizeBtn.disabled = false;
      summarizeBtn.textContent = '🚀 开始总结';
    }
  });

  // 复制按钮
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(summaryText.textContent).then(() => {
      copyBtn.textContent = '✅ 已复制';
      setTimeout(() => copyBtn.textContent = '📋 复制内容', 2000);
    });
  });

  function showError(message) {
    errorText.textContent = message;
    errorDiv.classList.remove('hidden');
  }
});

// 在网页中执行的提取函数
function extractPageContent() {
  const selectors = [
    'article',
    '.post-content',
    '.article-content',
    '.content',
    '#content',
    '.entry-content',
    '.post',
    'main'
  ];

  let contentElement = null;
  for (const selector of selectors) {
    contentElement = document.querySelector(selector);
    if (contentElement) break;
  }

  if (!contentElement) {
    contentElement = document.body;
  }

  let text = contentElement.innerText || contentElement.textContent;
  text = text.replace(/\s+/g, ' ').trim();

  const maxLength = 8000;
  if (text.length > maxLength) {
    text = text.substring(0, maxLength) + '...';
  }

  return {
    content: text,
    title: document.title,
    url: window.location.href
  };
}

// 调用DeepSeek API
async function callDeepSeek(apiKey, content, title, length) {
  const lengthPrompt = {
    short: '用1-2句话简洁总结核心观点',
    medium: '用3-5句话总结主要内容',
    long: '用段落形式详细总结，保留关键信息'
  };

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `你是一个专业的网页内容总结助手。${lengthPrompt[length]}。请用中文输出。`
        },
        {
          role: 'user',
          content: `网页标题：${title}\n\n网页内容：${content}\n\n请总结以上内容。`
        }
      ],
      max_tokens: 800,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API请求失败: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
