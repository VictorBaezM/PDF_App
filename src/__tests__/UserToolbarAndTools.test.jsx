import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../App';

describe('User Action Simulation: Toolbar & Tool Selection', () => {
  const loadTestPdf = async () => {
    const pdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    const file = new File([pdfHeader], 'sample.pdf', { type: 'application/pdf' });
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fireEvent.change(fileInputs[0], { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTitle(/Select \/ Move/i)).toBeInTheDocument(), { timeout: 3000 });
  };

  it('user clicks through all 10 tool dock buttons and verifies active state', async () => {
    render(<App />);
    await loadTestPdf();

    const toolsToTest = [
      { title: 'Select / Move', toolId: 'select' },
      { title: 'Hand / Pan Tool', toolId: 'hand' },
      { title: 'Highlight Text', toolId: 'highlight' },
      { title: 'Underline', toolId: 'underline' },
      { title: 'Strikethrough', toolId: 'strikeout' },
      { title: 'Add Text Box', toolId: 'textbox' },
      { title: 'Freehand Draw', toolId: 'ink' },
      { title: 'Draw Shape', toolId: 'shape' },
      { title: 'Sticky Note', toolId: 'note' },
    ];

    for (const tool of toolsToTest) {
      const btn = screen.getByTitle(new RegExp(tool.title, 'i'));
      expect(btn).toBeInTheDocument();
      fireEvent.click(btn);
      expect(btn.className).toContain('glass-btn-active');
    }
  });

  it('user toggles sidebar and properties panel docks', async () => {
    render(<App />);
    await loadTestPdf();

    const sidebarToggleBtn = screen.getByTitle(/Toggle Floating Control Blade/i);
    expect(sidebarToggleBtn).toBeInTheDocument();

    fireEvent.click(sidebarToggleBtn);
    fireEvent.click(sidebarToggleBtn);

    const propertiesToggleBtn = screen.getByTitle(/Tool Properties Dock/i);
    expect(propertiesToggleBtn).toBeInTheDocument();
    fireEvent.click(propertiesToggleBtn);
  });

  it('user triggers search bar via Ctrl+F keyboard shortcut', async () => {
    render(<App />);
    await loadTestPdf();

    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search text in PDF/i)).toBeInTheDocument();
    });
  });
});
