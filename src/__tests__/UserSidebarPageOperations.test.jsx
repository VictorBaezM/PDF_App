import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from '../App';
import { PDFDocument } from 'pdf-lib';

describe('User Action Simulation: Sidebar Page Operations', () => {
  const loadMultiPagePdf = async () => {
    const doc = await PDFDocument.create();
    doc.addPage([600, 400]);
    doc.addPage([600, 400]);
    doc.addPage([600, 400]);
    const pdfBytes = await doc.save({ useObjectStreams: false });
    const file = new File([pdfBytes], 'multipage.pdf', { type: 'application/pdf' });
    file.buffer = pdfBytes.buffer;
    file.byteOffset = pdfBytes.byteOffset;
    file.byteLength = pdfBytes.byteLength;

    const fileInputs = document.querySelectorAll('input[type="file"]');
    fireEvent.change(fileInputs[0], { target: { files: [file] } });
    await new Promise((r) => setTimeout(r, 500));
    await waitFor(() => expect(screen.getByTitle(/Select \/ Move/i)).toBeInTheDocument(), { timeout: 5000 });
  };

  it('user switches between sidebar tabs (Thumbnails, Annotations, Security)', async () => {
    render(<App />);
    await loadMultiPagePdf();

    const thumbnailsTab = screen.getByTitle(/Page Thumbnails/i);
    const annotationsTab = screen.getByTitle(/Annotations List/i);
    const securityTab = screen.getByTitle(/Security & Privacy Center/i);

    await act(async () => {
      fireEvent.click(annotationsTab);
    });
    await waitFor(() => expect(screen.getByText(/No annotations in document/i)).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(securityTab);
    });
    await waitFor(() => expect(screen.getByText(/Local Sandbox Security/i)).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(thumbnailsTab);
    });
    await waitFor(() => expect(screen.getByText('Page 1')).toBeInTheDocument());
  });

  it('user executes page rotate action on page thumbnail', async () => {
    render(<App />);
    await loadMultiPagePdf();

    const rotateBtns = screen.getAllByTitle(/Rotate 90° Clockwise/i);
    expect(rotateBtns.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(rotateBtns[0]);
    });

    await waitFor(() => {
      expect(screen.getByText(/rotated 90°/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('user executes page deletion action with confirmation prompt', async () => {
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
    render(<App />);
    await loadMultiPagePdf();

    const deleteBtns = screen.getAllByTitle(/Delete Page/i);
    expect(deleteBtns.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(deleteBtns[0]);
    });

    await waitFor(() => {
      expect(screen.getByText(/deleted/i)).toBeInTheDocument();
    }, { timeout: 5000 });
    window.confirm.mockRestore();
  });

  it('user reorders pages by clicking Move Down button', async () => {
    render(<App />);
    await loadMultiPagePdf();

    const moveDownBtns = screen.getAllByTitle(/Move Down/i);
    expect(moveDownBtns.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(moveDownBtns[0]);
    });

    await waitFor(() => {
      expect(screen.getByText(/Moved Page 1/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });
});
