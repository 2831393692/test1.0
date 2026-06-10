// 内容脚本 - 注入到网页中，负责区域选择和内容提取
(function() {
  if (window.screenshotExtensionInjected) return;
  window.screenshotExtensionInjected = true;

  let selection = {
    startX: 0, startY: 0,
    endX: 0, endY: 0,
    isSelecting: false
  };

  // 遮罩层
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(0, 0, 0, 0.3); z-index: 999999; cursor: crosshair;
  `;

  // 选择框
  const selectionBox = document.createElement('div');
  selectionBox.style.cssText = `
    position: fixed; border: 2px dashed #4CAF50;
    background: rgba(76, 175, 80, 0.1); z-index: 1000000; pointer-events: none;
  `;

  // 提示文字
  const hint = document.createElement('div');
  hint.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    background: #333; color: white; padding: 10px 20px; border-radius: 5px;
    z-index: 1000001; font-family: Arial, sans-serif; font-size: 14px;
  `;
  hint.textContent = '拖动选择区域，按ESC取消';

  document.body.appendChild(overlay);
  document.body.appendChild(selectionBox);
  document.body.appendChild(hint);

  // 鼠标按下
  overlay.addEventListener('mousedown', (e) => {
    selection.startX = e.clientX;
    selection.startY = e.clientY;
    selection.isSelecting = true;
    selectionBox.style.left = e.clientX + 'px';
    selectionBox.style.top = e.clientY + 'px';
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
  });

  // 鼠标移动
  overlay.addEventListener('mousemove', (e) => {
    if (!selection.isSelecting) return;
    const currentX = e.clientX, currentY = e.clientY;
    const left = Math.min(selection.startX, currentX);
    const top = Math.min(selection.startY, currentY);
    const width = Math.abs(currentX - selection.startX);
    const height = Math.abs(currentY - selection.startY);
    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
  });

  // 鼠标松开 - 完成选择
  overlay.addEventListener('mouseup', (e) => {
    if (!selection.isSelecting) return;
    selection.isSelecting = false;
    selection.endX = e.clientX;
    selection.endY = e.clientY;
    
    const left = Math.min(selection.startX, selection.endX);
    const top = Math.min(selection.startY, selection.endY);
    const width = Math.abs(selection.endX - selection.startX);
    const height = Math.abs(selection.endY - selection.startY);
    
    if (width < 10 || height < 10) {
      cleanup();
      chrome.storage.local.set({ screenshotResult: { type: 'error', message: '选择区域太小' } });
      return;
    }

    hint.textContent = '正在截图并提取内容...';
    setTimeout(() => extractContent(left, top, width, height), 100);
  });

  // ESC取消
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cleanup();
      chrome.storage.local.set({ screenshotResult: { type: 'error', message: '已取消' } });
    }
  });

  async function extractContent(left, top, width, height) {
    try {
      // 1. 截取整个可见标签页
      const response = await chrome.runtime.sendMessage({ type: 'captureVisibleTab' });
      if (response.error) throw new Error(response.error);

      const fullDataUrl = response.dataUrl;
      const dpr = window.devicePixelRatio || 1;

      // 2. 将截图裁剪到选择区域
      const croppedDataUrl = await cropImage(fullDataUrl, left, top, width, height, dpr);

      // 3. 提取选择区域内的DOM文字
      let text = '';
      const walker = document.createTreeWalker(
        document.body, NodeFilter.SHOW_TEXT,
        { acceptNode: function(node) {
            if (!node.textContent.trim()) return NodeFilter.FILTER_SKIP;
            const parent = node.parentElement;
            if (parent && parent.getBoundingClientRect) {
              const rect = parent.getBoundingClientRect();
              if (isOverlapping(rect, { left, top, width, height }))
                return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_SKIP;
          }
        }
      );
      
      let currentNode;
      while (currentNode = walker.nextNode()) {
        const tc = currentNode.textContent.trim();
        if (tc && tc.length > 1) text += tc + '\n';
      }
      text = text.trim();

      if (!text) {
        const elements = document.elementsFromPoint(left + width/2, top + height/2);
        for (const el of elements) {
          if (el.textContent && el.textContent.trim())
            text += el.textContent.trim() + '\n';
        }
        text = text.trim();
      }

      // 4. 显示完成提示 + 设置扩展角标
      hint.textContent = '✅ 截图完成！点击右上角扩展图标查看（点击此处关闭）';
      hint.style.background = '#4CAF50';
      hint.style.fontSize = '16px';
      hint.style.padding = '12px 24px';
      hint.style.cursor = 'pointer';
      hint.title = '点击关闭此提示';
      hint.onclick = () => cleanup();
      
      // 设置扩展图标角标
      try {
        chrome.runtime.sendMessage({ type: 'setBadge', text: '●' });
      } catch(e) {}
      
      // 60秒后自动清理UI（可点击提示提前关闭）
      setTimeout(() => cleanup(), 60000);

      // 5. 保存裁剪后的截图和文字
      chrome.storage.local.set({ 
        screenshotResult: { 
          type: 'success', 
          text: text || '未提取到文字',
          dataUrl: croppedDataUrl,
          fullDataUrl: fullDataUrl
        } 
      });
      
    } catch (error) {
      cleanup();
      chrome.storage.local.set({ screenshotResult: { type: 'error', message: error.message } });
    }
  }

  // 裁剪图片
  function cropImage(dataUrl, left, top, width, height, dpr) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // 使用实际像素尺寸
        const sx = Math.round(left * dpr);
        const sy = Math.round(top * dpr);
        const sw = Math.round(width * dpr);
        const sh = Math.round(height * dpr);
        
        // 确保不超出图片边界
        const safeSW = Math.min(sw, img.width - sx);
        const safeSH = Math.min(sh, img.height - sy);
        
        canvas.width = safeSW;
        canvas.height = safeSH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, safeSW, safeSH, 0, 0, safeSW, safeSH);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = dataUrl;
    });
  }

  function isOverlapping(rect1, rect2) {
    return !(
      rect1.right < rect2.left ||
      rect1.left > rect2.left + rect2.width ||
      rect1.bottom < rect2.top ||
      rect1.top > rect2.top + rect2.height
    );
  }

  function cleanup() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (selectionBox.parentNode) selectionBox.parentNode.removeChild(selectionBox);
    if (hint.parentNode) hint.parentNode.removeChild(hint);
    window.screenshotExtensionInjected = false;
  }
})();