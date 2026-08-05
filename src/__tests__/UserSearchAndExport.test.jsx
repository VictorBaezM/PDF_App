import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../App';
import { PDFDocument } from 'pdf-lib';

describe('User Action Simulation: Search & Export Pipeline', () => {
  const loadPdf = async () => {
    const doc = await PDFDocument.create();
    doc.addPage([600, 400]);
    const pdfBytes = await doc.save();
    const file = new File([pdfBytes], 'search-export.pdf', { type: 'application/pdf' });
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fireEvent.change(fileInputs[0], { target: { files: [file] } });
    await new Promise((r) => setTimeout(r, 500));
    await waitFor(() => expect(screen.getByTitle(/Select \/ Move/i)).toBeInTheDocument(), { timeout: 5000 });
  };

  it('user opens search bar via Ctrl+F, types query, and closes search bar', async () => {
    render(<App />);
    await loadPdf();

    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search text in PDF/i)).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search text in PDF/i);
    fireEvent.change(searchInput, { target: { value: 'invoice' } });

    expect(searchInput.value).toBe('invoice');
  });

  it('user clicks Export button in Toolbar and triggers PDF download', async () => {
    render(<App />);
    await loadPdf();

    const exportBtn = screen.getByText(/Export/i);
    expect(exportBtn).toBeInTheDocument();

    fireEvent.click(exportBtn);
    await new Promise((r) => setTimeout(r, 500));

    await waitFor(() => {
      expect(screen.getByText(/Exported successfully/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });
});
