import React, { createContext, useContext, useReducer } from 'react';
import { PDFDocument } from 'pdf-lib';
import { pdfjsLib } from './pdf-config';
import { annotationStore } from './shared-annotation-store';
import { triggerFeedback } from '../components/FeedbackToast/FeedbackToast';

const AppContext = createContext();

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

      if (fileOrBytes && fileOrBytes.buffer instanceof ArrayBuffer) {
        const buf = fileOrBytes.buffer;
        const offset = fileOrBytes.byteOffset || 0;
        const len = fileOrBytes.byteLength || buf.byteLength;
        arrayBuffer = buf.slice(offset, offset + len);
      } else if (fileOrBytes instanceof ArrayBuffer) {
        arrayBuffer = fileOrBytes;
      } else if (ArrayBuffer.isView(fileOrBytes)) {
        arrayBuffer = fileOrBytes.buffer.slice(fileOrBytes.byteOffset, fileOrBytes.byteOffset + fileOrBytes.byteLength);
      } else if (fileOrBytes && typeof fileOrBytes.arrayBuffer === 'function') {
        try {
          arrayBuffer = await fileOrBytes.arrayBuffer();
        } catch (e) {
          arrayBuffer = new ArrayBuffer(0);
        }
      } else {
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

      // Restore stored annotations from IndexedDB if available
      if (fileName && annotationStore && typeof annotationStore.loadFromStorage === 'function') {
        try {
          await annotationStore.loadFromStorage(fileName);
        } catch (err) {
          console.warn('IndexedDB load warning:', err);
        }
      }
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
