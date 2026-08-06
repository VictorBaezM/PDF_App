import * as fabric from 'fabric';

export class FabricLayer {
  constructor(canvasElement, pageIndex, coordTranslator, annotationStore) {
    if (!canvasElement) throw new Error('canvasElement required for FabricLayer');

    this.pageIndex = pageIndex;
    this.coordTranslator = coordTranslator;
    this.annotationStore = annotationStore;
    this.activeTool = 'select';
    this.currentToolOptions = {};

    this.fabricCanvas = new fabric.Canvas(canvasElement, {
      selection: true,
      backgroundColor: 'transparent',
      preserveObjectStacking: true,
      targetFindTolerance: 8,
    });

    canvasElement.__fabric = this.fabricCanvas;
    canvasElement.__fabricLayer = this;


    if (this.annotationStore) {
      if (typeof this.annotationStore.subscribe === 'function') {
        this.unsubscribeStore = this.annotationStore.subscribe(() => {
          this.syncWithStore();
        });
      }
      this.loadAnnotationsFromStore();
    }

    this.setupEventListeners();
  }

  setDimensions(width, height) {
    this.fabricCanvas.setDimensions({ width, height });
    this.fabricCanvas.renderAll();
  }

  setCoordinateTranslator(coordTranslator) {
    this.coordTranslator = coordTranslator;
  }

  syncWithStore() {
    if (!this.annotationStore || !this.fabricCanvas) return;

    const pageAnnots = this.annotationStore.getByPage(this.pageIndex);
    const storeAnnotIds = new Set(pageAnnots.map((a) => a.id));

    const canvasObjects = [...this.fabricCanvas.getObjects()];
    for (const obj of canvasObjects) {
      if (obj.annotationId && !storeAnnotIds.has(obj.annotationId)) {
        this.fabricCanvas.remove(obj);
      }
    }

    this.loadAnnotationsFromStore();
    this.fabricCanvas.renderAll();
  }

  loadAnnotationsFromStore() {
    if (!this.annotationStore) return;
    const storeAnnots = this.annotationStore.getByPage(this.pageIndex);
    if (!Array.isArray(storeAnnots)) return;

    const existingObjects = this.fabricCanvas.getObjects();
    const existingIds = new Set(existingObjects.map((obj) => obj.annotationId).filter(Boolean));

    for (const annot of storeAnnots) {
      if (!annot || !annot.id || existingIds.has(annot.id)) continue;

      const canvasRect = this.coordTranslator.pdfToCanvasRect(annot.rect || [100, 100, 200, 150]);
      let fabricObj = null;

      if (['highlight', 'underline', 'strikeout'].includes(annot.type)) {
        this.renderMarkupAnnotation(annot);
      } else if (annot.type === 'textbox' || annot.type === 'freetext') {
        fabricObj = new fabric.IText(annot.contents || 'Text', {
          left: canvasRect.x,
          top: canvasRect.y,
          fontSize: annot.fontSize || 18,
          fill: annot.color || '#3b82f6',
          fontFamily: 'Helvetica',
          editable: true,
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          padding: 6,
          cornerColor: '#06b6d4',
          opacity: annot.opacity !== undefined ? annot.opacity : 1.0,
          selectable: true,
          evented: true,
        });
        fabricObj.annotationId = annot.id;
        this.fabricCanvas.add(fabricObj);
      } else if (['shape', 'square', 'rectangle', 'circle', 'ellipse'].includes(annot.type)) {
        const isCircle = annot.type === 'circle' || annot.shapeType === 'circle' || annot.type === 'ellipse';
        if (isCircle) {
          fabricObj = new fabric.Ellipse({
            left: canvasRect.x,
            top: canvasRect.y,
            rx: Math.max(5, canvasRect.width / 2),
            ry: Math.max(5, canvasRect.height / 2),
            stroke: annot.color || '#3b82f6',
            strokeWidth: annot.borderWidth || 2,
            fill: 'transparent',
            opacity: annot.opacity !== undefined ? annot.opacity : 1.0,
            cornerColor: '#06b6d4',
            selectable: true,
            evented: true,
          });
        } else {
          fabricObj = new fabric.Rect({
            left: canvasRect.x,
            top: canvasRect.y,
            width: Math.max(10, canvasRect.width),
            height: Math.max(10, canvasRect.height),
            stroke: annot.color || '#3b82f6',
            strokeWidth: annot.borderWidth || 2,
            fill: 'transparent',
            opacity: annot.opacity !== undefined ? annot.opacity : 1.0,
            cornerColor: '#06b6d4',
            selectable: true,
            evented: true,
          });
        }
        fabricObj.annotationId = annot.id;
        this.fabricCanvas.add(fabricObj);
      } else if (annot.type === 'stamp') {
        if (annot.stampType === 'custom_image' && annot.dataUrl) {
          const imgElement = new Image();
          imgElement.onload = () => {
            const fabricImg = new fabric.Image(imgElement, {
              left: canvasRect.x,
              top: canvasRect.y,
              scaleX: canvasRect.width / (imgElement.width || 1),
              scaleY: canvasRect.height / (imgElement.height || 1),
              cornerColor: '#06b6d4',
              selectable: true,
              evented: true,
            });
            fabricImg.annotationId = annot.id;
            this.fabricCanvas.add(fabricImg);
            this.fabricCanvas.renderAll();
          };
          imgElement.src = annot.dataUrl;
        } else {
          const stampText = (annot.stampText || annot.contents || 'APPROVED').toUpperCase();
          const PRESET_STAMP_COLORS = {
            APPROVED: '#10b981',
            PASSED: '#10b981',
            CONFIDENTIAL: '#ef4444',
            DRAFT: '#f59e0b',
            FINAL: '#3b82f6',
            EXPIRED: '#6b7280',
          };
          const stampColor = annot.color && annot.color !== 'transparent' ? annot.color : (PRESET_STAMP_COLORS[stampText] || '#10b981');
          const w = Math.max(60, canvasRect.width);
          const h = Math.max(24, canvasRect.height);

          const rectObj = new fabric.Rect({
            width: w,
            height: h,
            fill: 'transparent',
            stroke: stampColor,
            strokeWidth: 3,
            rx: 8,
            ry: 8,
            strokeDashArray: [6, 4],
          });
          const textObj = new fabric.Text(stampText, {
            fontSize: Math.min(18, Math.max(10, h * 0.45)),
            fontFamily: 'Helvetica',
            fontWeight: 'bold',
            fill: stampColor,
            originX: 'center',
            originY: 'center',
            left: w / 2,
            top: h / 2,
          });
          fabricObj = new fabric.Group([rectObj, textObj], {
            left: canvasRect.x,
            top: canvasRect.y,
            angle: -6,
            cornerColor: '#06b6d4',
            selectable: true,
            evented: true,
          });
          fabricObj.annotationId = annot.id;
          this.fabricCanvas.add(fabricObj);
        }
      } else if (annot.type === 'text' || annot.type === 'note') {
        const noteRect = new fabric.Rect({
          width: 36,
          height: 36,
          fill: '#fde047',
          stroke: '#eab308',
          strokeWidth: 2,
          rx: 6,
          ry: 6,
        });
        const noteText = new fabric.Text('📝', {
          fontSize: 20,
          originX: 'center',
          originY: 'center',
          left: 18,
          top: 18,
        });
        fabricObj = new fabric.Group([noteRect, noteText], {
          left: canvasRect.x,
          top: canvasRect.y,
          cornerColor: '#06b6d4',
          selectable: true,
          evented: true,
        });
        fabricObj.annotationId = annot.id;
        this.fabricCanvas.add(fabricObj);
      } else if (annot.type === 'ink') {
        if (annot.pathData && Array.isArray(annot.pathData)) {
          let svgPathStr = '';
          for (const cmd of annot.pathData) {
            if (Array.isArray(cmd) && cmd.length >= 3) {
              const type = cmd[0];
              const pdfPt = [cmd[1], cmd[2]];
              const canvasPt = this.coordTranslator.pdfToCanvasPoint(pdfPt[0], pdfPt[1]);
              svgPathStr += `${type} ${canvasPt.x} ${canvasPt.y} `;
            }
          }
          if (svgPathStr) {
            fabricObj = new fabric.Path(svgPathStr.trim(), {
              stroke: annot.color || '#3b82f6',
              strokeWidth: annot.borderWidth || 3,
              fill: 'transparent',
              cornerColor: '#06b6d4',
              selectable: true,
              evented: true,
            });
            fabricObj.annotationId = annot.id;
            this.fabricCanvas.add(fabricObj);
          }
        }
      }
    }
    this.fabricCanvas.renderAll();
  }

  setTool(tool, toolOptions = {}) {
    this.activeTool = tool;
    this.currentToolOptions = { ...toolOptions };
    this.fabricCanvas.isDrawingMode = false;
    this.fabricCanvas.selection = tool === 'select';

    const isMarkupTool = ['highlight', 'underline', 'strikeout'].includes(tool);

    // If text markup tool (highlight, underline, strikeout) is active, pass pointer events through to text-layer
    if (this.fabricCanvas.upperCanvasEl) {
      this.fabricCanvas.upperCanvasEl.style.pointerEvents = isMarkupTool ? 'none' : 'auto';
    }
    if (this.fabricCanvas.wrapperEl) {
      this.fabricCanvas.wrapperEl.style.pointerEvents = isMarkupTool ? 'none' : 'auto';
    }

    if (tool === 'ink') {
      this.fabricCanvas.isDrawingMode = true;
      const brush = new fabric.PencilBrush(this.fabricCanvas);
      brush.color = toolOptions.inkColor || '#3b82f6';
      brush.width = toolOptions.inkThickness || 3;
      this.fabricCanvas.freeDrawingBrush = brush;
    }

    // Apply live property updates to active selected object if user changes settings in PropertiesPanel
    const activeObject = this.fabricCanvas.getActiveObject();
    if (activeObject) {
      if (activeObject.isMarkup) {
        // If selected object is a markup annotation (strikethrough/underline/highlight), update with matching markup color if provided
        const markupColorOption = toolOptions[`${activeObject.markupType}Color`] || toolOptions.strikeoutColor || toolOptions.underlineColor;
        if (markupColorOption) {
          let colorStr = typeof markupColorOption === 'string' ? markupColorOption : '#000000';
          if (Array.isArray(markupColorOption)) {
            const r = Math.round((markupColorOption[0] || 0) * 255);
            const g = Math.round((markupColorOption[1] || 0) * 255);
            const b = Math.round((markupColorOption[2] || 0) * 255);
            colorStr = `rgb(${r}, ${g}, ${b})`;
          }
          if (activeObject.type === 'group' && activeObject._objects) {
            activeObject._objects.forEach((child) => {
              if (child.type === 'line') child.set('stroke', colorStr);
              else if (child.type === 'rect') child.set('fill', colorStr);
            });
          } else {
            if (activeObject.type === 'line') activeObject.set('stroke', colorStr);
            else if (activeObject.type === 'rect') activeObject.set('fill', colorStr);
          }
          if (activeObject.annotationId) {
            this.annotationStore.update(activeObject.annotationId, { color: colorStr });
          }
        }
      } else {
        // Non-markup objects (freehand drawing, shapes, textboxes)
        if (toolOptions.fontSize && activeObject.type === 'i-text') {
          activeObject.set('fontSize', toolOptions.fontSize);
        }
        if (toolOptions.inkColor) {
          if (activeObject.type === 'i-text') {
            activeObject.set('fill', toolOptions.inkColor);
          } else if (activeObject.type === 'rect' || activeObject.type === 'ellipse' || activeObject.type === 'line') {
            activeObject.set('stroke', toolOptions.inkColor);
          }
        }
        if (toolOptions.opacity !== undefined) {
          activeObject.set('opacity', toolOptions.opacity);
        }
        if (toolOptions.inkThickness && (activeObject.type === 'rect' || activeObject.type === 'ellipse' || activeObject.type === 'line')) {
          activeObject.set('strokeWidth', toolOptions.inkThickness);
        }

        if (activeObject.annotationId) {
          this.annotationStore.update(activeObject.annotationId, {
            color: toolOptions.inkColor,
            fontSize: toolOptions.fontSize,
            opacity: toolOptions.opacity,
            borderWidth: toolOptions.inkThickness,
          });
        }
      }
      this.fabricCanvas.renderAll();
    }

    // Ensure all objects are selectable and evented in select mode
    this.fabricCanvas.forEachObject((obj) => {
      obj.selectable = true;
      obj.evented = true;
    });

    this.fabricCanvas.renderAll();
  }

  renderMarkupAnnotation(annot) {
    if (!annot || !annot.rect) return null;

    let colorStr = '#000000';
    if (typeof annot.color === 'string') {
      colorStr = annot.color;
    } else if (Array.isArray(annot.color)) {
      const r = Math.round((annot.color[0] || 0) * 255);
      const g = Math.round((annot.color[1] || 0) * 255);
      const b = Math.round((annot.color[2] || 0) * 255);
      colorStr = `rgb(${r}, ${g}, ${b})`;
    }

    const objects = [];

    if (annot.quadPoints && Array.isArray(annot.quadPoints) && annot.quadPoints.length >= 8) {
      for (let i = 0; i < annot.quadPoints.length; i += 8) {
        const qx1 = annot.quadPoints[i];
        const qy1 = annot.quadPoints[i + 1];
        const qx2 = annot.quadPoints[i + 2];
        const qy2 = annot.quadPoints[i + 3];
        const qx3 = annot.quadPoints[i + 4];
        const qy3 = annot.quadPoints[i + 5];
        const qx4 = annot.quadPoints[i + 6];
        const qy4 = annot.quadPoints[i + 7];

        const linePdfRect = [
          Math.min(qx1, qx2, qx3, qx4),
          Math.min(qy1, qy2, qy3, qy4),
          Math.max(qx1, qx2, qx3, qx4),
          Math.max(qy1, qy2, qy3, qy4),
        ];
        const lineCanvasRect = this.coordTranslator.pdfToCanvasRect(linePdfRect);

        if (annot.type === 'highlight') {
          objects.push(new fabric.Rect({
            left: lineCanvasRect.x,
            top: lineCanvasRect.y,
            width: Math.max(5, lineCanvasRect.width),
            height: Math.max(5, lineCanvasRect.height),
            fill: colorStr || '#fde047',
            opacity: annot.opacity !== undefined ? annot.opacity : 0.30,
            selectable: true,
            evented: true,
            cornerColor: '#06b6d4',
          }));
        } else if (annot.type === 'underline') {
          const lineY = lineCanvasRect.y + lineCanvasRect.height - 2;
          objects.push(new fabric.Line([lineCanvasRect.x, lineY, lineCanvasRect.x + lineCanvasRect.width, lineY], {
            stroke: colorStr || '#000000',
            strokeWidth: 3.5,
            padding: 6,
            opacity: 1.0,
            selectable: true,
            evented: true,
            cornerColor: '#06b6d4',
          }));
        } else if (annot.type === 'strikeout') {
          const midY = lineCanvasRect.y + (lineCanvasRect.height * 0.50);
          objects.push(new fabric.Line([lineCanvasRect.x, midY, lineCanvasRect.x + lineCanvasRect.width, midY], {
            stroke: colorStr || '#000000',
            strokeWidth: 3.5,
            padding: 6,
            opacity: 1.0,
            selectable: true,
            evented: true,
            cornerColor: '#06b6d4',
          }));
        }
      }
    } else {
      const canvasRect = this.coordTranslator.pdfToCanvasRect(annot.rect);
      if (annot.type === 'highlight') {
        objects.push(new fabric.Rect({
          left: canvasRect.x,
          top: canvasRect.y,
          width: Math.max(10, canvasRect.width),
          height: Math.max(10, canvasRect.height),
          fill: colorStr || '#fde047',
          opacity: annot.opacity !== undefined ? annot.opacity : 0.30,
          selectable: true,
          evented: true,
          cornerColor: '#06b6d4',
        }));
      } else if (annot.type === 'underline') {
        const lineY = canvasRect.y + canvasRect.height - 2;
        objects.push(new fabric.Line([canvasRect.x, lineY, canvasRect.x + canvasRect.width, lineY], {
          stroke: colorStr || '#000000',
          strokeWidth: 3.5,
          padding: 6,
          opacity: 1.0,
          selectable: true,
          evented: true,
          cornerColor: '#06b6d4',
        }));
      } else if (annot.type === 'strikeout') {
        const midY = canvasRect.y + (canvasRect.height * 0.50);
        objects.push(new fabric.Line([canvasRect.x, midY, canvasRect.x + canvasRect.width, midY], {
          stroke: colorStr || '#000000',
          strokeWidth: 3.5,
          padding: 6,
          opacity: 1.0,
          selectable: true,
          evented: true,
          cornerColor: '#06b6d4',
        }));
      }
    }

    if (objects.length > 0) {
      let resultObj;
      if (objects.length === 1) {
        resultObj = objects[0];
      } else {
        resultObj = new fabric.Group(objects, {
          selectable: true,
          evented: true,
          cornerColor: '#06b6d4',
        });
      }
      resultObj.annotationId = annot.id;
      resultObj.isMarkup = true;
      resultObj.markupType = annot.type;
      this.fabricCanvas.add(resultObj);
      this.fabricCanvas.renderAll();
      return resultObj;
    }
    return null;
  }

  deleteActiveObject() {
    const activeObject = this.fabricCanvas.getActiveObject();
    if (!activeObject) return false;

    if (activeObject.isEditing) return false; // Don't delete while user is actively typing in a text box

    if (activeObject.annotationId) {
      this.annotationStore.remove(activeObject.annotationId);
    }

    this.fabricCanvas.remove(activeObject);
    this.fabricCanvas.discardActiveObject();
    this.fabricCanvas.renderAll();
    return true;
  }

  setupEventListeners() {
    // Delete and Backspace keydown listener to delete active object
    this.handleKeyDown = (e) => {
      const tagName = (e.target && typeof e.target.tagName === 'string') ? e.target.tagName.toLowerCase() : '';
      if (tagName === 'input' || tagName === 'textarea' || (e.target && e.target.isContentEditable)) {
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeObj = this.fabricCanvas.getActiveObject();
        if (activeObj && !activeObj.isEditing) {
          e.preventDefault();
          this.deleteActiveObject();
        }
      }
    };
    window.addEventListener('keydown', this.handleKeyDown);

    // Canvas click mouse:down listener for object placement (textbox, shape, stamp, note)
    this.fabricCanvas.on('mouse:down', (options) => {
      // If user clicked on an existing object or markup tool is active, don't create new object
      if (['highlight', 'underline', 'strikeout', 'select'].includes(this.activeTool) || options.target) {
        return;
      }

      const pointer = this.fabricCanvas.getPointer(options.e);
      const x = pointer.x;
      const y = pointer.y;

      if (this.activeTool === 'textbox') {
        this.addTextBox(x, y, 'Type text...', this.currentToolOptions);
      } else if (this.activeTool === 'shape') {
        this.addShape(this.currentToolOptions.shapeType || 'rectangle', x, y, 120, 80, this.currentToolOptions);
      } else if (this.activeTool === 'stamp') {
        this.addStamp(x, y, this.currentToolOptions.stampData || { text: 'APPROVED', color: '#10b981' });
      } else if (this.activeTool === 'note') {
        this.addStickyNote(x, y, 'Sticky note comment');
      }
    });

    // Freehand stroke completion sync
    this.fabricCanvas.on('path:created', (e) => {
      const path = e.path;
      if (!path) return;

      const pathData = path.path;
      const bounds = path.getBoundingRect();
      const pdfRect = this.coordTranslator.canvasToPdfRect(bounds);

      const annot = this.annotationStore.add({
        type: 'ink',
        pageIndex: this.pageIndex,
        rect: pdfRect,
        color: path.stroke || '#3b82f6',
        borderWidth: path.strokeWidth || 3,
        pathData: pathData,
      });

      path.annotationId = annot.id;
    });

    // Object modification sync (moving, scaling, rotating, text editing)
    this.fabricCanvas.on('object:modified', (e) => {
      const target = e.target;
      if (target && target.annotationId) {
        const bounds = target.getBoundingRect();
        const pdfRect = this.coordTranslator.canvasToPdfRect(bounds);

        let newColor = target.stroke;
        if (target.type === 'i-text') {
          newColor = target.fill;
        } else if (target.type === 'group' && target._objects && target._objects.length > 0) {
          newColor = target._objects[0].stroke || target._objects[0].fill;
        }

        const updatePayload = { rect: pdfRect };
        if (target.text !== undefined) updatePayload.contents = target.text;
        if (target.fontSize !== undefined) updatePayload.fontSize = target.fontSize;
        if (newColor && newColor !== 'transparent') updatePayload.color = newColor;

        this.annotationStore.update(target.annotationId, updatePayload);
      }
    });

    // Object text editing sync
    this.fabricCanvas.on('text:changed', (e) => {
      const target = e.target;
      if (target && target.annotationId) {
        this.annotationStore.update(target.annotationId, {
          contents: target.text || '',
        });
      }
    });
  }

  addTextBox(x, y, text = 'Type text...', options = {}) {
    const textBox = new fabric.IText(text, {
      left: x,
      top: y,
      fontSize: options.fontSize || 18,
      fill: options.inkColor || '#3b82f6',
      fontFamily: 'Helvetica',
      editable: true,
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      padding: 6,
      cornerColor: '#06b6d4',
      opacity: options.opacity !== undefined ? options.opacity : 1.0,
      selectable: true,
      evented: true,
    });

    this.fabricCanvas.add(textBox);
    this.fabricCanvas.setActiveObject(textBox);
    textBox.enterEditing();
    textBox.selectAll();

    const bounds = textBox.getBoundingRect();
    const pdfRect = this.coordTranslator.canvasToPdfRect(bounds);
    const annotId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `annot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    textBox.annotationId = annotId;

    const annot = this.annotationStore.add({
      id: annotId,
      type: 'textbox',
      pageIndex: this.pageIndex,
      rect: pdfRect,
      contents: text,
      color: options.inkColor || '#3b82f6',
      fontSize: options.fontSize || 18,
      opacity: options.opacity !== undefined ? options.opacity : 1.0,
    });

    this.fabricCanvas.renderAll();
    return textBox;
  }

  addShape(shapeType, x, y, width = 120, height = 80, options = {}) {
    let shapeObj;
    const color = options.inkColor || '#3b82f6';
    const strokeWidth = options.inkThickness || 2;
    const opacity = options.opacity !== undefined ? options.opacity : 1.0;

    if (shapeType === 'circle') {
      shapeObj = new fabric.Ellipse({
        left: x,
        top: y,
        rx: width / 2,
        ry: height / 2,
        stroke: color,
        strokeWidth: strokeWidth,
        fill: 'transparent',
        opacity: opacity,
        cornerColor: '#06b6d4',
        selectable: true,
        evented: true,
      });
    } else {
      shapeObj = new fabric.Rect({
        left: x,
        top: y,
        width: width,
        height: height,
        stroke: color,
        strokeWidth: strokeWidth,
        fill: 'transparent',
        opacity: opacity,
        cornerColor: '#06b6d4',
        selectable: true,
        evented: true,
      });
    }

    this.fabricCanvas.add(shapeObj);
    this.fabricCanvas.setActiveObject(shapeObj);

    const bounds = shapeObj.getBoundingRect();
    const pdfRect = this.coordTranslator.canvasToPdfRect(bounds);
    const annotId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `annot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    shapeObj.annotationId = annotId;

    const annot = this.annotationStore.add({
      id: annotId,
      type: shapeType === 'circle' ? 'circle' : 'square',
      pageIndex: this.pageIndex,
      rect: pdfRect,
      color: color,
      borderWidth: strokeWidth,
      opacity: opacity,
    });

    this.fabricCanvas.renderAll();
    return shapeObj;
  }

  addStamp(x, y, stampData = {}) {
    if (stampData.type === 'custom_image' && stampData.dataUrl) {
      const imgElement = new Image();
      imgElement.onload = () => {
        const fabricImg = new fabric.Image(imgElement, {
          left: x,
          top: y,
          scaleX: 0.5,
          scaleY: 0.5,
          cornerColor: '#06b6d4',
          selectable: true,
          evented: true,
        });
        this.fabricCanvas.add(fabricImg);
        this.fabricCanvas.setActiveObject(fabricImg);

        const bounds = fabricImg.getBoundingRect();
        const pdfRect = this.coordTranslator.canvasToPdfRect(bounds);
        const annotId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `annot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        fabricImg.annotationId = annotId;

        const annot = this.annotationStore.add({
          id: annotId,
          type: 'stamp',
          stampType: 'custom_image',
          dataUrl: stampData.dataUrl,
          pageIndex: this.pageIndex,
          rect: pdfRect,
        });

        this.fabricCanvas.renderAll();
      };
      imgElement.src = stampData.dataUrl;
      return;
    }

    const stampText = (stampData.text || 'APPROVED').toUpperCase();
    const PRESET_STAMP_COLORS = {
      APPROVED: '#10b981',
      PASSED: '#10b981',
      CONFIDENTIAL: '#ef4444',
      DRAFT: '#f59e0b',
      FINAL: '#3b82f6',
      EXPIRED: '#6b7280',
    };
    const stampColor = stampData.color && stampData.color !== 'transparent' ? stampData.color : (PRESET_STAMP_COLORS[stampText] || '#10b981');

    const rectObj = new fabric.Rect({
      width: 140,
      height: 48,
      fill: 'transparent',
      stroke: stampColor,
      strokeWidth: 3,
      rx: 8,
      ry: 8,
      strokeDashArray: [6, 4],
    });

    const textObj = new fabric.Text(stampText, {
      fontSize: 18,
      fontFamily: 'Helvetica',
      fontWeight: 'bold',
      fill: stampColor,
      originX: 'center',
      originY: 'center',
      left: 70,
      top: 24,
    });

    const groupObj = new fabric.Group([rectObj, textObj], {
      left: x,
      top: y,
      angle: -6,
      cornerColor: '#06b6d4',
      selectable: true,
      evented: true,
    });

    this.fabricCanvas.add(groupObj);
    this.fabricCanvas.setActiveObject(groupObj);

    const bounds = groupObj.getBoundingRect();
    const pdfRect = this.coordTranslator.canvasToPdfRect(bounds);
    const annotId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `annot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    groupObj.annotationId = annotId;

    const annot = this.annotationStore.add({
      id: annotId,
      type: 'stamp',
      pageIndex: this.pageIndex,
      rect: pdfRect,
      stampText: stampText,
      color: stampColor,
    });

    this.fabricCanvas.renderAll();
    return groupObj;
  }

  addStickyNote(x, y, text = 'Sticky note comment') {
    const noteRect = new fabric.Rect({
      width: 36,
      height: 36,
      fill: '#fde047',
      stroke: '#eab308',
      strokeWidth: 2,
      rx: 6,
      ry: 6,
    });

    const noteText = new fabric.Text('📝', {
      fontSize: 20,
      originX: 'center',
      originY: 'center',
      left: 18,
      top: 18,
    });

    const groupObj = new fabric.Group([noteRect, noteText], {
      left: x,
      top: y,
      cornerColor: '#06b6d4',
      selectable: true,
      evented: true,
    });

    this.fabricCanvas.add(groupObj);
    this.fabricCanvas.setActiveObject(groupObj);

    const bounds = groupObj.getBoundingRect();
    const pdfRect = this.coordTranslator.canvasToPdfRect(bounds);
    const annotId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `annot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    groupObj.annotationId = annotId;

    const annot = this.annotationStore.add({
      id: annotId,
      type: 'text',
      pageIndex: this.pageIndex,
      rect: pdfRect,
      contents: text,
    });

    this.fabricCanvas.renderAll();
    return groupObj;
  }

  destroy() {
    if (typeof this.unsubscribeStore === 'function') {
      this.unsubscribeStore();
    }
    if (this.handleKeyDown) {
      window.removeEventListener('keydown', this.handleKeyDown);
    }
    try {
      this.fabricCanvas.dispose();
    } catch (e) {
      console.warn('Fabric canvas dispose warning:', e);
    }
  }
}
