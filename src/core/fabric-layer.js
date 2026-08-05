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
    });

    this.setupEventListeners();
  }

  setDimensions(width, height) {
    this.fabricCanvas.setDimensions({ width, height });
    this.fabricCanvas.renderAll();
  }

  setCoordinateTranslator(coordTranslator) {
    this.coordTranslator = coordTranslator;
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
      this.fabricCanvas.renderAll();

      // Sync property changes back to AnnotationStore
      if (activeObject.annotationId) {
        this.annotationStore.update(activeObject.annotationId, {
          color: toolOptions.inkColor,
          fontSize: toolOptions.fontSize,
          opacity: toolOptions.opacity,
          borderWidth: toolOptions.inkThickness,
        });
      }
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
    const canvasRect = this.coordTranslator.pdfToCanvasRect(annot.rect);

    let colorStr = '#000000';
    if (typeof annot.color === 'string') {
      colorStr = annot.color;
    } else if (Array.isArray(annot.color)) {
      const r = Math.round((annot.color[0] || 0) * 255);
      const g = Math.round((annot.color[1] || 0) * 255);
      const b = Math.round((annot.color[2] || 0) * 255);
      colorStr = `rgb(${r}, ${g}, ${b})`;
    }

    let markupObj;

    if (annot.type === 'highlight') {
      markupObj = new fabric.Rect({
        left: canvasRect.x,
        top: canvasRect.y,
        width: Math.max(10, canvasRect.width),
        height: Math.max(10, canvasRect.height),
        fill: colorStr || '#fde047',
        opacity: annot.opacity !== undefined ? annot.opacity : 0.30, // 30% default opacity for emphasis without obscuring
        selectable: true,
        evented: true,
        cornerColor: '#06b6d4',
      });
    } else if (annot.type === 'underline') {
      const lineY = canvasRect.y + canvasRect.height - 2;
      markupObj = new fabric.Line([canvasRect.x, lineY, canvasRect.x + canvasRect.width, lineY], {
        stroke: colorStr || '#000000',
        strokeWidth: 3,
        opacity: 1.0, // High opacity solid black line for high contrast
        selectable: true,
        evented: true,
        cornerColor: '#06b6d4',
      });
    } else if (annot.type === 'strikeout') {
      // Position strikeout line directly through the middle of the characters (x-height ~38% from top)
      const midY = canvasRect.y + (canvasRect.height * 0.38);
      markupObj = new fabric.Line([canvasRect.x, midY, canvasRect.x + canvasRect.width, midY], {
        stroke: colorStr || '#000000',
        strokeWidth: 3,
        opacity: 1.0, // High opacity solid black line to clearly cross out character text
        selectable: true,
        evented: true,
        cornerColor: '#06b6d4',
      });
    }

    if (markupObj) {
      markupObj.annotationId = annot.id;
      this.fabricCanvas.add(markupObj);
      this.fabricCanvas.renderAll();
    }
    return markupObj;
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
        this.annotationStore.update(target.annotationId, {
          rect: pdfRect,
          contents: target.text || '',
          fontSize: target.fontSize,
          color: target.fill || target.stroke,
        });
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

    const annot = this.annotationStore.add({
      type: 'textbox',
      pageIndex: this.pageIndex,
      rect: pdfRect,
      contents: text,
      color: options.inkColor || '#3b82f6',
      fontSize: options.fontSize || 18,
      opacity: options.opacity !== undefined ? options.opacity : 1.0,
    });

    textBox.annotationId = annot.id;
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

    const annot = this.annotationStore.add({
      type: shapeType === 'circle' ? 'circle' : 'square',
      pageIndex: this.pageIndex,
      rect: pdfRect,
      color: color,
      borderWidth: strokeWidth,
      opacity: opacity,
    });

    shapeObj.annotationId = annot.id;
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

        const annot = this.annotationStore.add({
          type: 'stamp',
          stampType: 'custom_image',
          dataUrl: stampData.dataUrl,
          pageIndex: this.pageIndex,
          rect: pdfRect,
        });

        fabricImg.annotationId = annot.id;
        this.fabricCanvas.renderAll();
      };
      imgElement.src = stampData.dataUrl;
      return;
    }

    const stampText = stampData.text || 'APPROVED';
    const stampColor = stampData.color || '#10b981';

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

    const annot = this.annotationStore.add({
      type: 'stamp',
      pageIndex: this.pageIndex,
      rect: pdfRect,
      stampText: stampText,
      color: stampColor,
    });

    groupObj.annotationId = annot.id;
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

    const annot = this.annotationStore.add({
      type: 'text',
      pageIndex: this.pageIndex,
      rect: pdfRect,
      contents: text,
    });

    groupObj.annotationId = annot.id;
    this.fabricCanvas.renderAll();
    return groupObj;
  }

  destroy() {
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
