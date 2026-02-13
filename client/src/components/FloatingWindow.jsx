import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useWindowManager } from '../contexts/WindowManagerContext';
import '../styles/FloatingWindow.css';

/**
 * FloatingWindow - A draggable, resizable floating window component
 * 
 * Props:
 * - windowId: Unique identifier for the window
 * - title: Window title
 * - icon: Emoji icon for the window
 * - children: Window content
 * - onClose: Optional custom close handler
 * - showMinimize: Whether to show minimize button (default true)
 * - showClose: Whether to show close button (default true)
 * - resizable: Whether the window can be resized (default false)
 * - className: Additional CSS class for the window
 */
export default function FloatingWindow({
  windowId,
  title,
  icon,
  children,
  onClose,
  showMinimize = true,
  showClose = true,
  resizable = false,
  className = '',
}) {
  const {
    windows,
    focusWindow,
    minimizeWindow,
    closeWindow,
    updatePosition,
    updateSize,
    topZIndex,
  } = useWindowManager();

  const windowRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const windowState = windows?.[windowId];
  
  // Memoize computed values (safe to use windowState here, just returns defaults if null)
  const { actualPosition, actualSize, zIndex, minSize } = useMemo(() => {
    if (!windowState) {
      return {
        actualPosition: { x: 100, y: 100 },
        actualSize: { width: 320, height: 400 },
        zIndex: 100,
        minSize: { width: 200, height: 150 },
      };
    }
    
    const pos = windowState.position || windowState.defaultPosition || { x: 100, y: 100 };
    const size = windowState.size || windowState.defaultSize || { width: 320, height: 400 };
    
    return {
      actualPosition: {
        x: pos.x < 0 ? window.innerWidth + pos.x - size.width : pos.x,
        y: pos.y,
      },
      actualSize: size,
      zIndex: windowState.zIndex || 100,
      minSize: windowState.minSize || { width: 200, height: 150 },
    };
  }, [windowState]);

  // Constrain position to viewport
  const constrainPosition = useCallback((x, y) => {
    const maxX = window.innerWidth - 100;
    const maxY = window.innerHeight - 50;
    const minX = -actualSize.width + 100;
    const minY = 0;
    
    return {
      x: Math.max(minX, Math.min(x, maxX)),
      y: Math.max(minY, Math.min(y, maxY)),
    };
  }, [actualSize.width]);

  // Drag handlers - ALL useCallbacks BEFORE any early return
  const handleDragStart = useCallback((e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea')) {
      return;
    }
    e.preventDefault();
    setIsDragging(true);
    focusWindow(windowId);
    
    const rect = windowRef.current?.getBoundingClientRect();
    if (rect) {
      dragOffset.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  }, [windowId, focusWindow]);

  const handleDragMove = useCallback((e) => {
    if (!isDragging) return;
    
    const newX = e.clientX - dragOffset.current.x;
    const newY = e.clientY - dragOffset.current.y;
    const constrained = constrainPosition(newX, newY);
    
    updatePosition(windowId, constrained);
  }, [isDragging, windowId, updatePosition, constrainPosition]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Resize handlers
  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    focusWindow(windowId);
    
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      width: actualSize.width,
      height: actualSize.height,
    };
  }, [windowId, focusWindow, actualSize]);

  const handleResizeMove = useCallback((e) => {
    if (!isResizing) return;
    
    const deltaX = e.clientX - resizeStart.current.x;
    const deltaY = e.clientY - resizeStart.current.y;
    
    const newWidth = Math.max(minSize.width, resizeStart.current.width + deltaX);
    const newHeight = Math.max(minSize.height, resizeStart.current.height + deltaY);
    
    // Constrain to viewport
    const maxWidth = window.innerWidth - actualPosition.x - 20;
    const maxHeight = window.innerHeight - actualPosition.y - 20;
    
    updateSize(windowId, {
      width: Math.min(newWidth, maxWidth),
      height: Math.min(newHeight, maxHeight),
    });
  }, [isResizing, windowId, updateSize, minSize, actualPosition]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Handle close
  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
    } else {
      closeWindow(windowId);
    }
  }, [onClose, closeWindow, windowId]);

  // Handle minimize
  const handleMinimize = useCallback(() => {
    minimizeWindow(windowId);
  }, [minimizeWindow, windowId]);

  // Handle focus on click
  const handleFocus = useCallback(() => {
    if (zIndex < topZIndex) {
      focusWindow(windowId);
    }
  }, [zIndex, topZIndex, focusWindow, windowId]);

  // Global mouse events for drag/resize - useEffects BEFORE early return
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      return () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd]);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  // ═══ EARLY RETURN - AFTER ALL HOOKS ═══
  if (!windowState || !windowState.isOpen || windowState.isMinimized) {
    return null;
  }

  return (
    <div
      ref={windowRef}
      className={`floating-window ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''} ${className}`}
      style={{
        left: actualPosition.x,
        top: actualPosition.y,
        width: actualSize.width,
        height: actualSize.height,
        zIndex,
      }}
      onMouseDown={handleFocus}
    >
      {/* Window Header (Drag Handle) */}
      <div 
        className="fw-header"
        onMouseDown={handleDragStart}
      >
        <div className="fw-header-left">
          {icon && <span className="fw-icon">{icon}</span>}
          <span className="fw-title">{title}</span>
        </div>
        <div className="fw-controls">
          {showMinimize && (
            <button 
              className="fw-btn fw-btn-minimize"
              onClick={handleMinimize}
              title="Minimizar"
            >
              ─
            </button>
          )}
          {showClose && (
            <button 
              className="fw-btn fw-btn-close"
              onClick={handleClose}
              title="Fechar"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Window Content */}
      <div className="fw-content">
        {children}
      </div>

      {/* Resize Handle */}
      {resizable && (
        <div 
          className="fw-resize-handle"
          onMouseDown={handleResizeStart}
        />
      )}
    </div>
  );
}
