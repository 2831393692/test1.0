// 后台脚本 - 处理跨域请求和消息转发

// ========== 状态变量 ==========
let pendingCallback = null;

// ========== 消息监听 ==========
// ========== 快捷键监听 ==========
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'start-selection') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    } catch (e) {
      console.error('快捷键注入失败:', e);
    }
  }
});

// ========== 消息监听 ==========
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request.type === 'captureVisibleTab') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl: dataUrl });
      }
    });
    return true;
  }
  
  if (request.type === 'selectionReady' || request.type === 'selectionError') {
    if (pendingCallback) {
      pendingCallback(request);
      pendingCallback = null;
    }
    sendResponse({ received: true });
    return true;
  }
  
  if (request.type === 'registerCallback') {
    pendingCallback = (msg) => {
      chrome.tabs.sendMessage(sender.tab.id, msg);
    };
    sendResponse({ registered: true });
    return true;
  }
  
  if (request.type === 'aliyunOCR') {
    aliyunOCR(request.accessKeyId, request.accessKeySecret, request.imageDataUrl)
      .then(result => sendResponse({ success: true, result: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.type === 'tencentOCR') {
    tencentOCR(request.secretId, request.secretKey, request.imageDataUrl)
      .then(result => sendResponse({ success: true, result: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.type === 'baiduOCR') {
    baiduOCR(request.apiKey, request.secretKey, request.imageDataUrl)
      .then(result => sendResponse({ success: true, result: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// ========== 百度OCR API 调用 ==========
async function baiduOCR(apiKey, secretKey, imageDataUrl) {
  const tokenResponse = await fetch(
    `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`,
    { method: 'POST' }
  );
  const tokenData = await tokenResponse.json();
  
  if (!tokenData.access_token) {
    throw new Error('获取百度OCR令牌失败: ' + (tokenData.error_description || '未知错误'));
  }
  
  const base64Image = imageDataUrl.split(',')[1];
  const ocrResponse = await fetch(
    'https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `image=${encodeURIComponent(base64Image)}&access_token=${tokenData.access_token}`
    }
  );
  const ocrData = await ocrResponse.json();
  
  if (ocrData.words_result) {
    return ocrData.words_result.map(item => item.words).join('\n');
  } else {
    throw new Error('百度OCR识别失败: ' + (ocrData.error_msg || '未知错误'));
  }
}

// ========== 腾讯云OCR API 调用 ==========
async function tencentOCR(secretId, secretKey, imageDataUrl) {
  const region = 'ap-guangzhou';
  const endpoint = 'ocr.tencentcloudapi.com';
  const action = 'GeneralBasicOCR';
  const version = '2018-11-19';
  const timestamp = Math.floor(Date.now() / 1000);
  
  const base64Image = imageDataUrl.split(',')[1];
  const body = JSON.stringify({ ImageBase64: base64Image });
  const signature = await buildTencentSignatureTC3(secretId, secretKey, action, version, region, endpoint, body, timestamp);
  
  const url = `https://${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `TC3-HMAC-SHA256 Credential=${secretId}/${getDate(timestamp)}/ocr/tc3_request, SignedHeaders=content-type;host, Signature=${signature}`,
      'Host': endpoint,
      'X-TC-Action': action,
      'X-TC-Version': version,
      'X-TC-Region': region,
      'X-TC-Timestamp': timestamp.toString()
    },
    body: body
  });
  
  const data = await response.json();
  
  if (data.Response && data.Response.TextDetections) {
    return data.Response.TextDetections.map(item => item.DetectedText).join('\n');
  } else if (data.Response && data.Response.Error) {
    throw new Error(data.Response.Error.Message || '腾讯云OCR识别失败');
  } else {
    throw new Error('腾讯云OCR返回数据异常: ' + JSON.stringify(data).substring(0, 200));
  }
}

// ========== 阿里云OCR API 调用 ==========
async function aliyunOCR(accessKeyId, accessKeySecret, imageDataUrl) {
  // 提取Base64图片数据
  let base64Image = '';
  if (!imageDataUrl || typeof imageDataUrl !== 'string') {
    throw new Error('图片DataURL为空或格式异常');
  }
  const dataUrlParts = imageDataUrl.split(',');
  if (dataUrlParts.length < 2) {
    throw new Error('图片DataURL格式错误');
  }
  base64Image = dataUrlParts[1].trim().replace(/\s+/g, '');
  
  if (!base64Image) {
    throw new Error('提取的图片Base64内容为空');
  }

  // 将Base64转换为二进制
  const binaryString = atob(base64Image);
  const imageBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    imageBytes[i] = binaryString.charCodeAt(i);
  }
  console.log('图片大小:', imageBytes.length, 'bytes');

  // 最多重试3次（处理SignatureNonceUsed）
  let lastError;
  for (let retry = 0; retry < 3; retry++) {
    try {
      return await doAliyunOCRRequest(accessKeyId, accessKeySecret, imageBytes, retry);
    } catch (error) {
      lastError = error;
      if (error.message.includes('SignatureNonceUsed') && retry < 2) {
        console.log(`Nonce重复，第${retry + 2}次尝试...`);
        await new Promise(r => setTimeout(r, 200));
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error('阿里云OCR重试耗尽');
}

async function doAliyunOCRRequest(accessKeyId, accessKeySecret, imageBytes, attempt) {
  const endpoint = 'ocr-api.cn-hangzhou.aliyuncs.com';
  const action = 'RecognizeGeneral';
  const version = '2021-07-07';
  
  const now = new Date();
  const timestamp = now.toISOString().replace(/\.\d+Z$/, 'Z');
  
  // 强随机Nonce：crypto.randomUUID + 高精度时间 + 加密随机字节
  const uuid = crypto.randomUUID().replace(/-/g, '');
  const hiResTime = Math.floor(performance.now() * 1000).toString(36);
  const randBytes = new Uint8Array(8);
  crypto.getRandomValues(randBytes);
  const randHex = Array.from(randBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const nonce = uuid + hiResTime + randHex + attempt.toString(36);

  const queryParams = {
    AccessKeyId: accessKeyId,
    Action: action,
    Format: 'JSON',
    RegionId: 'cn-hangzhou',
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: nonce,
    SignatureVersion: '1.0',
    Timestamp: timestamp,
    Version: version
  };

  const signature = await buildAliyunSignature({ ...queryParams }, accessKeySecret, 'POST');

  const urlParams = { ...queryParams, Signature: signature };
  const urlQueryString = Object.keys(urlParams).map(key => 
    `${percentEncode(key)}=${percentEncode(String(urlParams[key]))}`
  ).join('&');
  
  const url = `https://${endpoint}/?${urlQueryString}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Accept': 'application/json',
      'Host': endpoint
    },
    body: imageBytes,
    signal: controller.signal,
    credentials: 'omit'
  });
  
  clearTimeout(timeoutId);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP错误 ${response.status}: ${errorText.substring(0, 500)}`);
  }
  
  const text = await response.text();
  console.log('阿里云OCR响应:', text.substring(0, 600));
  
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('阿里云OCR返回非JSON: ' + text.substring(0, 200));
  }
  
  // 错误码检查
  if (data.Code) {
    throw new Error(`阿里云OCR错误[${data.Code}]: ${data.Message || '未知错误'}`);
  }
  
  // 结果解析：Data可能是JSON字符串或对象
  if (data.Data) {
    let parsedData = data.Data;
    
    if (typeof parsedData === 'string') {
      try {
        parsedData = JSON.parse(parsedData);
      } catch (e) {
        return parsedData;
      }
    }
    
    if (parsedData && typeof parsedData === 'object') {
      if (parsedData.content) return parsedData.content.trim();
      if (parsedData.Content) return parsedData.Content.trim();
      if (parsedData.Text)   return parsedData.Text.trim();
      
      if (parsedData.Regions) {
        let result = '';
        for (const region of parsedData.Regions) {
          if (region.Lines) {
            for (const line of region.Lines) {
              if (line.Words) result += line.Words.join('') + '\n';
            }
          }
        }
        if (result) return result.trim();
      }
    }
  }
  
  throw new Error('阿里云OCR无有效结果: ' + JSON.stringify(data).substring(0, 200));
}

// ========== 阿里云签名工具 ==========
function percentEncode(str) {
  if (typeof str !== 'string') str = String(str);
  return encodeURIComponent(str)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~')
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}

async function buildAliyunSignature(params, accessKeySecret, method) {
  const sortedKeys = Object.keys(params).sort();
  const canonicalQueryString = sortedKeys.map(key => {
    const value = params[key] || '';
    return `${percentEncode(key)}=${percentEncode(value)}`;
  }).join('&');
  
  const stringToSign = `${method}&${percentEncode('/')}&${percentEncode(canonicalQueryString)}`;
  
  const key = accessKeySecret + '&';
  const encoder = new TextEncoder();
  const messageBytes = encoder.encode(stringToSign);
  const keyBytes = encoder.encode(key);
  
  const importedKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const signatureBytes = await crypto.subtle.sign('HMAC', importedKey, messageBytes);
  
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signatureBytes))).trim();
  return signatureBase64;
}

// ========== 腾讯云签名工具 ==========
function getDate(timestamp) {
  const date = new Date(timestamp * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key, msg) {
  const keyBuffer = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const msgBuffer = new TextEncoder().encode(msg);
  const importedKey = await crypto.subtle.importKey('raw', keyBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', importedKey, msgBuffer));
}

async function buildTencentSignatureTC3(secretId, secretKey, action, version, region, endpoint, payload, timestamp) {
  const date = getDate(timestamp);
  const service = 'ocr';
  
  const hashedRequestPayload = await sha256(payload);
  const canonicalHeaders = `content-type:application/json\nhost:${endpoint}\n`;
  const signedHeaders = 'content-type;host';
  
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`;
  
  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = await sha256(canonicalRequest);
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;
  
  const secretDate = await hmacSha256('TC3' + secretKey, date);
  const secretService = await hmacSha256(secretDate, service);
  const secretSigning = await hmacSha256(secretService, 'tc3_request');
  const signature = await hmacSha256(secretSigning, stringToSign);
  
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}