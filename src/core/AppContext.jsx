import React, { createContext, useContext, useReducer } from 'react';
import { PDFDocument, PDFName } from 'pdf-lib';
import { pdfjsLib } from './pdf-config';
import { annotationStore } from './shared-annotation-store';
import { triggerFeedback } from '../components/FeedbackToast/FeedbackToast';

const AppContext = createContext();

export async function importPdfAnnotationsToStore(arg1, arg2, arg3) {
  let pdfDoc = null;
  let pdfBytes = null;
  let store = annotationStore;

  const checkStore = (obj) => (obj && typeof obj.add === 'function') ? obj : null;
  const checkBytes = (obj) => (obj instanceof Uint8Array || obj instanceof ArrayBuffer) ? obj : null;
  const checkDoc = (obj) => (obj && typeof obj.getPage === 'function') ? obj : null;

  if (checkDoc(arg1)) pdfDoc = arg1;
  else if (checkBytes(arg1)) pdfBytes = arg1;

  if (checkStore(arg2)) store = arg2;
  else if (checkBytes(arg2)) pdfBytes = arg2;

  if (checkStore(arg3)) store = arg3;

  if (!store) store = annotationStore;

  if (pdfDoc && typeof pdfDoc.getPage === 'function') {
    try {
      for (let pageIdx = 0; pageIdx < pdfDoc.numPages; pageIdx++) {
        const page = await pdfDoc.getPage(pageIdx + 1);
        if (typeof page.getAnnotations !== 'function') continue;

        const rawAnnots = await page.getAnnotations();
        if (!Array.isArray(rawAnnots) || rawAnnots.length === 0) continue;

        for (const ra of rawAnnots) {
          if (!ra || !ra.rect || !Array.isArray(ra.rect) || ra.rect.length < 4) continue;

          const subtype = (ra.subtype || ra.annotationType || '').toString().toLowerCase();
          let appType = null;

          if (subtype.includes('square') || subtype.includes('rect')) {
            appType = 'square';
          } else if (subtype.includes('circle') || subtype.includes('ellipse')) {
            appType = 'circle';
          } else if (subtype.includes('freetext') || subtype.includes('textbox')) {
            appType = 'textbox';
          } else if (subtype.includes('ink')) {
            appType = 'ink';
          } else if (subtype.includes('highlight')) {
            appType = 'highlight';
          } else if (subtype.includes('underline')) {
            appType = 'underline';
          } else if (subtype.includes('strike')) {
            appType = 'strikeout';
          } else if (subtype.includes('stamp')) {
            appType = 'stamp';
          } else if (subtype.includes('text') || subtype.includes('note')) {
            appType = 'note';
          }

          if (!appType) continue;

          let color = '#3b82f6';
          if (Array.isArray(ra.color) && ra.color.length >= 3) {
            const is255 = ra.color.some((v) => v > 1.0);
            const rgbFloats = is255 ? ra.color.slice(0, 3).map((v) => v / 255) : ra.color.slice(0, 3);
            const r = Math.round(rgbFloats[0] * 255);
            const g = Math.round(rgbFloats[1] * 255);
            const b = Math.round(rgbFloats[2] * 255);
            color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
          }

          const annotData = {
            id: ra.id ? `imported-${ra.id}` : `imported-${pageIdx}-${Math.random().toString(36).substr(2, 7)}`,
            pageIndex: pageIdx,
            type: appType,
            rect: ra.rect,
            color: color,
            contents: ra.contents || (ra.contentsObj && ra.contentsObj.str) || '',
            fontSize: ra.fontSize || 16,
            borderWidth: ra.borderWidth || (ra.borderStyle && ra.borderStyle.width) || 2,
            quadPoints: ra.quadPoints,
            opacity: ra.opacity !== undefined ? ra.opacity : 1.0,
          };

          if (appType === 'stamp') {
            annotData.stampType = 'text';
            annotData.stampText = ra.contents || ra.name || 'APPROVED';
          }

          if (appType === 'ink' && Array.isArray(ra.inkLists)) {
            const pathData = [];
            for (const list of ra.inkLists) {
              if (Array.isArray(list) && list.length >= 2) {
                for (let k = 0; k < list.length; k += 2) {
                  const px = list[k];
                  const py = list[k + 1];
                  if (k === 0) pathData.push(['M', px, py]);
                  else pathData.push(['L', px, py]);
                }
              }
            }
            annotData.pathData = pathData;
          }
          store.add(annotData);
        }
      }
      if (store && typeof store.getAll === 'function' && store.getAll().length > 0) return;
    } catch (e) {
      console.warn('PDF.js annotation import warning:', e);
    }
  }

  // Fallback to pdf-lib parsing if PDF.js DocumentProxy is unavailable or yielded 0 annotations
  if (pdfBytes && store && store.getAll().length === 0) {
    try {
      const pdfDocLib = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const pagesCount = pdfDocLib.getPageCount();

      for (let pageIdx = 0; pageIdx < pagesCount; pageIdx++) {
        const page = pdfDocLib.getPage(pageIdx);
        let annotsRaw = page.node.get(PDFName.of('Annots'));
        if (!annotsRaw && page.node) {
          const dictMap = page.node.dict || page.node;
          if (typeof dictMap.entries === 'function') {
            for (const [k, v] of dictMap.entries()) {
              if (k && (k.value === 'Annots' || k.encodedName === '/Annots' || String(k).includes('Annots'))) {
                annotsRaw = v;
                break;
              }
            }
          }
        }
        if (!annotsRaw) continue;

        const annotsArray = pdfDocLib.context.lookup(annotsRaw);
        if (!annotsArray) continue;

        let elements = [];
        if (Array.isArray(annotsArray.array)) {
          elements = annotsArray.array;
        } else if (typeof annotsArray.asArray === 'function') {
          elements = annotsArray.asArray();
        } else if (Array.isArray(annotsArray)) {
          elements = annotsArray;
        }
        if (!Array.isArray(elements) || elements.length === 0) continue;

        for (const annotRef of elements) {
          const annotDict = pdfDocLib.context.lookup(annotRef);
          if (!annotDict || typeof annotDict.get !== 'function') {
            console.log('annotDict missing for ref:', annotRef);
            continue;
          }

          let rawSubtype = annotDict.get(PDFName.of('Subtype'));
          if (!rawSubtype && typeof annotDict.entries === 'function') {
            for (const [k, v] of annotDict.entries()) {
              if (k && (k.value === 'Subtype' || k.encodedName === '/Subtype' || String(k).includes('Subtype'))) {
                rawSubtype = v;
                break;
              }
            }
          }
          if (!rawSubtype) continue;
          const lookupSubtype = pdfDocLib.context.lookup(rawSubtype);
          let subtypeStr = '';
          if (typeof lookupSubtype === 'string') {
            subtypeStr = lookupSubtype;
          } else if (lookupSubtype) {
            if (typeof lookupSubtype.value === 'string') subtypeStr = lookupSubtype.value;
            else if (typeof lookupSubtype.encodedName === 'function') subtypeStr = lookupSubtype.encodedName();
            else if (typeof lookupSubtype.encodedName === 'string') subtypeStr = lookupSubtype.encodedName;
            else if (typeof lookupSubtype.decodeText === 'function') subtypeStr = lookupSubtype.decodeText();
            else if (typeof lookupSubtype.name === 'string') subtypeStr = lookupSubtype.name;
            else subtypeStr = String(lookupSubtype);
          }
          const subtype = subtypeStr.toLowerCase();

          let appType = null;
          if (subtype.includes('square') || subtype.includes('rect')) appType = 'square';
          else if (subtype.includes('circle') || subtype.includes('ellipse')) appType = 'circle';
          else if (subtype.includes('freetext') || subtype.includes('textbox')) appType = 'textbox';
          else if (subtype.includes('ink')) appType = 'ink';
          else if (subtype.includes('highlight')) appType = 'highlight';
          else if (subtype.includes('underline')) appType = 'underline';
          else if (subtype.includes('strike')) appType = 'strikeout';
          else if (subtype.includes('stamp')) appType = 'stamp';
          else if (subtype.includes('text') || subtype.includes('note')) appType = 'note';

          if (!appType) continue;

          let rawRect = annotDict.get(PDFName.of('Rect'));
          if (!rawRect && typeof annotDict.entries === 'function') {
            for (const [k, v] of annotDict.entries()) {
              if (k && (k.value === 'Rect' || k.encodedName === '/Rect' || String(k).includes('Rect'))) {
                rawRect = v;
                break;
              }
            }
          }
          let rect = [100, 100, 200, 150];
          if (rawRect) {
            const lookupRect = pdfDocLib.context.lookup(rawRect);
            const rectArr = lookupRect && (lookupRect.array || (typeof lookupRect.asArray === 'function' ? lookupRect.asArray() : null));
            if (Array.isArray(rectArr) && rectArr.length >= 4) {
              rect = rectArr.slice(0, 4).map(n => {
                const item = pdfDocLib.context.lookup(n);
                const val = typeof item === 'number' ? item : (item?.numberValue ?? item?.value ?? 100);
                return typeof val === 'number' ? val : parseFloat(val) || 100;
              });
            }
          }

          let color = '#3b82f6';
          let rawC = annotDict.get(PDFName.of('C'));
          if (!rawC && typeof annotDict.entries === 'function') {
            for (const [k, v] of annotDict.entries()) {
              if (k && (k.value === 'C' || k.encodedName === '/C')) {
                rawC = v;
                break;
              }
            }
          }
          if (rawC) {
            const lookupC = pdfDocLib.context.lookup(rawC);
            const cArr = lookupC && (lookupC.array || (typeof lookupC.asArray === 'function' ? lookupC.asArray() : null));
            if (Array.isArray(cArr) && cArr.length >= 3) {
              const rVal = pdfDocLib.context.lookup(cArr[0]);
              const gVal = pdfDocLib.context.lookup(cArr[1]);
              const bVal = pdfDocLib.context.lookup(cArr[2]);
              const r = Math.round((rVal?.numberValue ?? rVal?.value ?? 0) * 255);
              const g = Math.round((gVal?.numberValue ?? gVal?.value ?? 0) * 255);
              const b = Math.round((bVal?.numberValue ?? bVal?.value ?? 0) * 255);
              color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            }
          }

          let contents = '';
          let rawContents = annotDict.get(PDFName.of('Contents'));
          if (!rawContents && typeof annotDict.entries === 'function') {
            for (const [k, v] of annotDict.entries()) {
              if (k && (k.value === 'Contents' || k.encodedName === '/Contents')) {
                rawContents = v;
                break;
              }
            }
          }
          if (rawContents) {
            const lookupContents = pdfDocLib.context.lookup(rawContents);
            if (lookupContents && typeof lookupContents.value === 'string') {
              contents = lookupContents.value;
            } else if (lookupContents && typeof lookupContents.decodeText === 'function') {
              contents = lookupContents.decodeText();
            }
          }

          let stampText = contents || 'APPROVED';
          let rawName = annotDict.get(PDFName.of('Name'));
          if (!rawName && typeof annotDict.entries === 'function') {
            for (const [k, v] of annotDict.entries()) {
              if (k && (k.value === 'Name' || k.encodedName === '/Name')) {
                rawName = v;
                break;
              }
            }
          }
          if (rawName) {
            const lookupName = pdfDocLib.context.lookup(rawName);
            if (lookupName && typeof lookupName.value === 'string') {
              stampText = lookupName.value;
            } else if (lookupName && typeof lookupName.decodeText === 'function') {
              stampText = lookupName.decodeText();
            }
          }

          let quadPoints = null;
          let rawQP = annotDict.get(PDFName.of('QuadPoints'));
          if (!rawQP && typeof annotDict.entries === 'function') {
            for (const [k, v] of annotDict.entries()) {
              if (k && (k.value === 'QuadPoints' || k.encodedName === '/QuadPoints' || String(k).includes('QuadPoints'))) {
                rawQP = v;
                break;
              }
            }
          }
          if (rawQP) {
            const lookupQP = pdfDocLib.context.lookup(rawQP);
            const qpArr = lookupQP && (lookupQP.array || (typeof lookupQP.asArray === 'function' ? lookupQP.asArray() : null));
            if (Array.isArray(qpArr) && qpArr.length >= 8) {
              quadPoints = qpArr.map(n => {
                const item = pdfDocLib.context.lookup(n);
                const val = typeof item === 'number' ? item : (item?.numberValue ?? item?.value ?? 0);
                return typeof val === 'number' ? val : parseFloat(val) || 0;
              });
            }
          }

          const annotData = {
            id: `imported-${pageIdx}-${Math.random().toString(36).substr(2, 7)}`,
            pageIndex: pageIdx,
            type: appType,
            rect: rect,
            color: color,
            contents: contents,
            fontSize: 16,
            borderWidth: 2,
            opacity: 1.0,
          };

          if (quadPoints) {
            annotData.quadPoints = quadPoints;
          }

          if (appType === 'stamp') {
            annotData.stampType = 'text';
            annotData.stampText = stampText;
          }

          store.add(annotData);
        }
      }
    } catch (err) {
      console.warn('pdf-lib fallback annotation import warning:', err);
    }
  }
}

export const INITIAL_STATE = {
  pdfDocument: null,     // PDF.js DocumentProxy instance
  pdfBytes: null,        // Raw Uint8Array bytes of current PDF
  fileName: '',          // Name of uploaded PDF file
  numPages: 0,           // Total page count
  totalPages: 0,         // Total pages alias for legacy tests
  currentPage: 1,        // Current active page index (1-indexed)
  pageRotations: {},     // Page index -> rotation angle (0, 90, 180, 270)
  zoomLevel: 1.0,        // Zoom scale (0.5 to 3.0)
  activeTool: 'select',  // 'select' | 'hand' | 'ink' | 'textbox' | 'highlight' | 'underline' | 'strikeout' | 'shape' | 'stamp' | 'note'
  toolOptions: {
    inkColor: '#3b82f6',
    highlightColor: [1, 0.92, 0], // Default bright yellow
    underlineColor: '#000000',
    strikeoutColor: '#000000',
    inkThickness: 3,
    fontSize: 18,
    opacity: 0.30,      // 30% default opacity for highlights
    shapeType: 'rectangle', // 'rectangle' | 'circle'
  },
  securityState: {
    memorySanitized: false,
    encryptionStrength: 'AES-GCM-256',
  },
  isSidebarOpen: true,
  sidebarOpen: true,
  sidebarTab: 'thumbnails', // 'thumbnails' | 'annotations' | 'security'
  isPropertiesOpen: true,
  propertiesPanelOpen: true,
  activeModal: null,     // null | 'split' | 'merge' | 'stamp' | 'security'
  searchQuery: '',
  searchResults: [],
  history: [],
  historyIndex: -1,
  isProcessing: false,
  loadingProgress: null, // null | 0..100
  loadingStatus: '',
};

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_PDF_DOCUMENT':
      const finalPages = action.payload.numPages || state.numPages || 1;
      return {
        ...state,
        pdfDocument: action.payload.pdfDocument,
        pdfBytes: action.payload.pdfBytes || state.pdfBytes,
        fileName: action.payload.fileName || state.fileName,
        numPages: finalPages,
        totalPages: finalPages,
        currentPage: 1,
        pageRotations: {},
      };

    case 'ROTATE_PAGE': {
      const { pageIndex, angle } = action.payload;
      const currentAngle = (state.pageRotations && state.pageRotations[pageIndex]) || 0;
      const newAngle = (currentAngle + (angle || 90)) % 360;
      const normalized = newAngle < 0 ? newAngle + 360 : newAngle;
      return {
        ...state,
        pageRotations: {
          ...state.pageRotations,
          [pageIndex]: normalized,
        },
      };
    }

    case 'UPDATE_DOCUMENT_PAGES':
      return {
        ...state,
        pdfBytes: action.payload.pdfBytes || state.pdfBytes,
        numPages: action.payload.numPages !== undefined ? action.payload.numPages : state.numPages,
        totalPages: action.payload.totalPages !== undefined ? action.payload.totalPages : state.totalPages,
        currentPage: action.payload.currentPage !== undefined ? action.payload.currentPage : state.currentPage,
        pageRotations: action.payload.pageRotations !== undefined ? action.payload.pageRotations : state.pageRotations,
      };

    case 'SET_PDF_BYTES':
      return {
        ...state,
        pdfBytes: action.payload,
      };

    case 'SET_CURRENT_PAGE':
      return {
        ...state,
        currentPage: Math.max(1, Math.min(action.payload, state.numPages || state.totalPages || 1)),
      };

    case 'SET_ZOOM':
    case 'SET_ZOOM_LEVEL':
      return {
        ...state,
        zoomLevel: Math.max(0.5, Math.min(action.payload, 3.0)),
      };

    case 'SET_ACTIVE_TOOL':
      return {
        ...state,
        activeTool: action.payload,
      };

    case 'UPDATE_TOOL_OPTIONS':
    case 'SET_TOOL_OPTIONS':
      return {
        ...state,
        toolOptions: { ...state.toolOptions, ...action.payload },
      };

    case 'TOGGLE_SIDEBAR':
      return {
        ...state,
        isSidebarOpen: !state.isSidebarOpen,
        sidebarOpen: !state.sidebarOpen,
      };

    case 'SET_SIDEBAR_TAB':
      return {
        ...state,
        sidebarTab: action.payload,
      };

    case 'TOGGLE_PROPERTIES':
    case 'TOGGLE_PROPERTIES_PANEL':
      const nextPropState = action.payload !== undefined ? Boolean(action.payload) : (!state.isPropertiesOpen && !state.propertiesPanelOpen);
      return {
        ...state,
        isPropertiesOpen: nextPropState,
        propertiesPanelOpen: nextPropState,
      };

    case 'SET_ACTIVE_MODAL':
      return {
        ...state,
        activeModal: action.payload,
      };

    case 'SET_SEARCH_QUERY':
      return {
        ...state,
        searchQuery: action.payload,
      };

    case 'SET_SEARCH_RESULTS':
      return {
        ...state,
        searchResults: action.payload,
      };

    case 'PURGE_MEMORY':
      return {
        ...state,
        pdfDocument: null,
        pdfBytes: null,
        fileName: '',
        numPages: 0,
        totalPages: 0,
        currentPage: 1,
        securityState: { ...state.securityState, memorySanitized: true },
      };

    case 'SET_PROCESSING':
      return {
        ...state,
        isProcessing: action.payload,
      };

    case 'SET_LOADING_PROGRESS':
      return {
        ...state,
        loadingProgress: action.payload.progress,
        loadingStatus: action.payload.status || 'Processing document...',
      };

    default:
      return state;
  }
}

export function AppProvider({ children, initialState }) {
  const [state, dispatch] = useReducer(appReducer, initialState || INITIAL_STATE);

  const purgeMemory = async () => {
    if (state.pdfDocument && typeof state.pdfDocument.destroy === 'function') {
      try {
        state.pdfDocument.destroy();
      } catch (e) {}
    }
    if (annotationStore) {
      if (typeof annotationStore.clearStorage === 'function') {
        await annotationStore.clearStorage(state.fileName || 'active-document');
      } else if (typeof annotationStore.clear === 'function') {
        annotationStore.clear();
      }
    }
    dispatch({ type: 'PURGE_MEMORY' });
  };

  const loadPdfFile = async (fileOrBytes, name = 'document.pdf', initialPage = 1) => {
    try {
      dispatch({ type: 'SET_PROCESSING', payload: true });
      dispatch({ type: 'SET_LOADING_PROGRESS', payload: { progress: 10, status: 'Initializing document loader...' } });

      let arrayBuffer;
      let fileName = typeof name === 'string' ? name : (fileOrBytes && fileOrBytes.name ? fileOrBytes.name : 'document.pdf');
      let targetPage = typeof initialPage === 'number' ? initialPage : 1;

      if (fileOrBytes && fileOrBytes.exportedBytes instanceof Uint8Array) {
        const eb = fileOrBytes.exportedBytes;
        arrayBuffer = eb.buffer.slice(eb.byteOffset, eb.byteOffset + eb.byteLength);
      } else if (fileOrBytes && fileOrBytes.bytes instanceof Uint8Array) {
        const eb = fileOrBytes.bytes;
        arrayBuffer = eb.buffer.slice(eb.byteOffset, eb.byteOffset + eb.byteLength);
      } else if (fileOrBytes && fileOrBytes.buffer instanceof ArrayBuffer) {
        const buf = fileOrBytes.buffer;
        const offset = fileOrBytes.byteOffset || 0;
        const len = fileOrBytes.byteLength || buf.byteLength;
        arrayBuffer = buf.slice(offset, offset + len);
      } else if (fileOrBytes instanceof ArrayBuffer) {
        arrayBuffer = fileOrBytes;
      } else if (ArrayBuffer.isView(fileOrBytes)) {
        arrayBuffer = fileOrBytes.buffer.slice(fileOrBytes.byteOffset, fileOrBytes.byteOffset + fileOrBytes.byteLength);
      }

      if ((!arrayBuffer || arrayBuffer.byteLength === 0) && fileOrBytes && typeof fileOrBytes.arrayBuffer === 'function') {
        try {
          arrayBuffer = await fileOrBytes.arrayBuffer();
        } catch (e) {
          arrayBuffer = null;
        }
      }

      if ((!arrayBuffer || arrayBuffer.byteLength === 0) && fileOrBytes && (fileOrBytes instanceof Blob || (typeof File !== 'undefined' && fileOrBytes instanceof File))) {
        if (typeof FileReader !== 'undefined') {
          try {
            arrayBuffer = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = () => resolve(new ArrayBuffer(0));
              reader.readAsArrayBuffer(fileOrBytes);
            });
          } catch (e) {
            arrayBuffer = new ArrayBuffer(0);
          }
        }
      }

      if (!arrayBuffer) {
        arrayBuffer = new ArrayBuffer(0);
      }

      dispatch({ type: 'SET_LOADING_PROGRESS', payload: { progress: 50, status: 'Parsing PDF structures...' } });
      const uint8Bytes = new Uint8Array(arrayBuffer);
      let pdfDoc = null;

      if (pdfjsLib && typeof pdfjsLib.getDocument === 'function') {
        try {
          const loadingTask = pdfjsLib.getDocument({ data: uint8Bytes.slice() });
          pdfDoc = await loadingTask.promise;
        } catch (e) {
          console.warn('pdfjsLib getDocument warning:', e);
        }
      }

      let pagesCount = 1;
      if (pdfDoc && typeof pdfDoc.getPage === 'function') {
        pagesCount = pdfDoc.numPages;
      } else {
        try {
          const cleanBytes = new Uint8Array(arrayBuffer);
          const tempDoc = await PDFDocument.load(cleanBytes, { ignoreEncryption: true });
          pagesCount = tempDoc.getPageCount();
        } catch (e) {
          try {
            const pdfString = new TextDecoder('latin1').decode(new Uint8Array(arrayBuffer));
            const matches = pdfString.match(/\/Type\s*\/Page\b/g);
            pagesCount = matches && matches.length > 0 ? matches.length : 1;
          } catch (err) {
            pagesCount = 1;
          }
        }
      }
      const isValidProxy = pdfDoc && typeof pdfDoc.getPage === 'function';

      dispatch({ type: 'SET_LOADING_PROGRESS', payload: { progress: 90, status: 'Rendering viewport...' } });

      dispatch({
        type: 'SET_PDF_DOCUMENT',
        payload: {
          pdfDocument: isValidProxy ? pdfDoc : null,
          pdfBytes: uint8Bytes,
          fileName,
          numPages: pagesCount,
        },
      });

      if (targetPage && typeof targetPage === 'number') {
        dispatch({ type: 'SET_CURRENT_PAGE', payload: targetPage });
      }

      dispatch({ type: 'SET_LOADING_PROGRESS', payload: { progress: 100, status: 'Document Ready' } });
      setTimeout(() => {
        dispatch({ type: 'SET_LOADING_PROGRESS', payload: { progress: null, status: '' } });
      }, 400);

      // Ensure clean annotationStore state for newly loaded document and import embedded PDF annotations
      if (annotationStore && typeof annotationStore.clear === 'function') {
        annotationStore.clear();
      }

      await importPdfAnnotationsToStore(uint8Bytes, annotationStore);
    } catch (err) {
      console.error('Failed to load PDF file:', err);
      triggerFeedback(`Failed to load document: ${err.message}`, 'error');
      dispatch({ type: 'SET_LOADING_PROGRESS', payload: { progress: null, status: '' } });
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  return (
    <AppContext.Provider value={{ state, dispatch, loadPdfFile, purgeMemory }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
