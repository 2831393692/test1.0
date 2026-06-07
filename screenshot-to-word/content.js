// 内容脚本 - 注入到网页中，负责区域选择和内容提取
(function() {
  // ========== 防止重复注入 ==========
  if (window.screenshotExtensionInjected) return;
  window.screenshotExtensionInjected = true;

  // ========== 选择状态 ==========
  let selection = {
    startX: 0,        // 起始X坐标
    startY: 0,        // 起始Y坐标
    endX: 0,          // 结束X坐标
    endY: 0,          // 结束Y坐标
    isSelecting: false // 是否正在选择
  };

  // ========== 创建UI元素 ==========
  
  // 遮罩层 - 覆盖整个页面，提供选择交互
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.3);
    z-index: 999999;
    cursor: crosshair;
  `;

  // 选择框 - 显示用户选择的区域
  const selectionBox = document.createElement('div');
  selectionBox.style.cssText = `
    position: fixed;
    border: 2px dashed #4CAF50;
    background: rgba(76, 175, 80, 0.1);
    z-index: 1000000;
    pointer-events: none;
  `;

  // 提示文字 - 显示操作提示
  const hint = document.createElement('div');
  hint.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #333;
    color: white;
    padding: 10px 20px;
    border-radius: 5px;
    z-index: 1000001;
    font-family: Arial, sans-serif;
    font-size: 14px;
  `;
  hint.textContent = '拖动选择区域，按ESC取消';

  // 将元素添加到页面
  document.body.appendChild(overlay);
  document.body.appendChild(selectionBox);
  document.body.appendChild(hint);

  // ========== 鼠标事件处理 ==========
  
  // 鼠标按下 - 开始选择
  overlay.addEventListener('mousedown', (e) => {
    selection.startX = e.clientX;
    selection.startY = e.clientY;
    selection.isSelecting = true;
    // 初始化选择框位置
    selectionBox.style.left = e.clientX + 'px';
    selectionBox.style.top = e.clientY + 'px';
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
  });

  // 鼠标移动 - 更新选择框大小
  overlay.addEventListener('mousemove', (e) => {
    if (!selection.isSelecting) return;
    
    const currentX = e.clientX;
    const currentY = e.clientY;
    
    // 计算选择框的位置和大小
    const left = Math.min(selection.startX, currentX);
    const top = Math.min(selection.startY, currentY);
    const width = Math.abs(currentX - selection.startX);
    const height = Math.abs(currentY - selection.startY);
    
    // 更新选择框样式
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
    
    // 计算最终选择区域
    const left = Math.min(selection.startX, selection.endX);
    const top = Math.min(selection.startY, selection.endY);
    const width = Math.abs(selection.endX - selection.startX);
    const height = Math.abs(selection.endY - selection.startY);
    
    // 检查选择区域是否太小
    if (width < 10 || height < 10) {
      cleanup();
      chrome.storage.local.set({ screenshotResult: { type: 'error', message: '选择区域太小' } });
      return;
    }

    // 更新提示文字
    hint.textContent = '正在提取内容...';
    
    // 延迟执行提取（让UI更新）
    setTimeout(() => {
      extractContent(left, top, width, height);
    }, 100);
  });

  // ========== 键盘事件处理 ==========
  // ESC键取消选择
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cleanup();
      chrome.storage.local.set({ screenshotResult: { type: 'error', message: '已取消' } });
    }
  });

  // ========== 核心函数：提取内容 ==========
  async function extractContent(left, top, width, height) {
    try {
      // 1. 请求 background 截取可见区域
      const response = await chrome.runtime.sendMessage({ type: 'captureVisibleTab' });
      
      if (response.error) {
        throw new Error(response.error);
      }

      const dataUrl = response.dataUrl;  // 截图的 base64 数据
      
      // 2. 遍历页面上所有文本节点，提取选择区域内的文字
      let text = '';
      
      // 使用 TreeWalker 遍历所有文本节点
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: function(node) {
            // 过滤空白节点
            if (!node.textContent.trim()) {
              return NodeFilter.FILTER_SKIP;
            }
            // 获取文本节点所在元素的位置
            const parent = node.parentElement;
            if (parent && parent.getBoundingClientRect) {
              const rect = parent.getBoundingClientRect();
              // 检查元素是否与选择区域重叠
              if (isOverlapping(rect, { left, top, width, height })) {
                return NodeFilter.FILTER_ACCEPT;
              }
            }
            return NodeFilter.FILTER_SKIP;
          }
        }
      );
      
      // 收集所有匹配的文本
      let currentNode;
      while (currentNode = walker.nextNode()) {
        const textContent = currentNode.textContent.trim();
        if (textContent && textContent.length > 1) {
          text += textContent + '\n';
        }
      }

      text = text.trim();
      
      // 3. 如果还是没提取到，尝试更宽松的方法
      if (!text) {
        // 获取选择区域中心位置的所有元素
        const elements = document.elementsFromPoint(left + width / 2, top + height / 2);
        for (const el of elements) {
          if (el.textContent && el.textContent.trim()) {
            text += el.textContent.trim() + '\n';
          }
        }
        text = text.trim();
      }

      // 4. 清理UI并保存结果到 storage
      cleanup();
      chrome.storage.local.set({ 
        screenshotResult: { 
          type: 'success', 
          text: text || '无法提取文字，请尝试选择包含文字的区域',
          dataUrl: dataUrl
        } 
      });
      
    } catch (error) {
      // 错误处理
      cleanup();
      chrome.storage.local.set({ screenshotResult: { type: 'error', message: error.message } });
    }
  }
  
  // 判断两个矩形是否重叠
  function isOverlapping(rect1, rect2) {
    return !(
      rect1.right < rect2.left ||
      rect1.left > rect2.left + rect2.width ||
      rect1.bottom < rect2.top ||
      rect1.top > rect2.top + rect2.height
    );
  }

  // ========== 清理函数 ==========
  // 移除所有注入的UI元素
  function cleanup() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (selectionBox.parentNode) selectionBox.parentNode.removeChild(selectionBox);
    if (hint.parentNode) hint.parentNode.removeChild(hint);
    window.screenshotExtensionInjected = false;
  }
})();
