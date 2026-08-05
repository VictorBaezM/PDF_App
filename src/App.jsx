import React, { useState } from 'react';
import { AppProvider, useApp } from './core/AppContext';
import { Toolbar } from './components/Toolbar/Toolbar';
import { Sidebar } from './components/Sidebar/Sidebar';
import { DocumentViewer } from './components/DocumentViewer/DocumentViewer';
import { PropertiesPanel } from './components/PropertiesPanel/PropertiesPanel';
import { MergeModal } from './components/Modals/MergeModal';
import { SplitModal } from './components/Modals/SplitModal';
import { StampModal } from './components/Modals/StampModal';
import { LoadingProgressBar } from './components/LoadingProgressBar/LoadingProgressBar';
import { FeedbackToast } from './components/FeedbackToast/FeedbackToast';
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';

function AppLayout() {
  const { state, dispatch } = useApp();
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [isStampModalOpen, setIsStampModalOpen] = useState(false);

  const getGridTemplateColumns = () => {
    const sidebar = (state.sidebarOpen !== false && state.isSidebarOpen !== false) ? 'var(--sidebar-width)' : '0px';
    const properties = (state.propertiesPanelOpen !== false && state.isPropertiesOpen !== false) ? 'var(--properties-panel-width)' : '0px';
    return `${sidebar} 1fr ${properties}`;
  };

  const handleSelectStamp = (stampData) => {
    dispatch({
      type: 'UPDATE_TOOL_OPTIONS',
      payload: { stampData },
    });
  };

  return (
    <div 
      className="app-shell"
      style={{
        display: 'grid',
        gridTemplateRows: 'var(--dock-height) 1fr',
        gridTemplateColumns: getGridTemplateColumns(),
        gridTemplateAreas: `
          "toolbar toolbar toolbar"
          "sidebar viewer properties"
        `,
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        transition: 'grid-template-columns 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <LoadingProgressBar />
      <FeedbackToast />

      <Toolbar onOpenStampModal={() => setIsStampModalOpen(true)} />
      <Sidebar 
        onOpenMergeModal={() => setIsMergeModalOpen(true)}
        onOpenSplitModal={() => setIsSplitModalOpen(true)}
      />
      <DocumentViewer />
      <PropertiesPanel />

      <MergeModal 
        isOpen={isMergeModalOpen}
        onClose={() => setIsMergeModalOpen(false)}
      />

      <SplitModal
        isOpen={isSplitModalOpen}
        onClose={() => setIsSplitModalOpen(false)}
      />

      <StampModal
        isOpen={isStampModalOpen}
        onClose={() => setIsStampModalOpen(false)}
        onSelectStamp={handleSelectStamp}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppLayout />
      </AppProvider>
    </ErrorBoundary>
  );
}
