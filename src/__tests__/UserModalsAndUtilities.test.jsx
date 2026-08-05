import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../App';
import { PDFDocument } from 'pdf-lib';

describe('User Action Simulation: Modals & PDF Utility Operations', () => {
  const loadBasePdf = async () => {
    const doc = await PDFDocument.create();
    doc.addPage([600, 400]);
    doc.addPage([600, 400]);
    const pdfBytes = await doc.save({ useObjectStreams: false });
    const file = new File([pdfBytes], 'base.pdf', { type: 'application/pdf' });
    file.buffer = pdfBytes.buffer;
    file.byteOffset = pdfBytes.byteOffset;
    file.byteLength = pdfBytes.byteLength;

    const fileInputs = document.querySelectorAll('input[type="file"]');
    await act(async () => {
      fireEvent.change(fileInputs[0], { target: { files: [file] } });
    });
    await waitFor(() => expect(screen.getByTitle(/Select \/ Move/i)).toBeInTheDocument(), { timeout: 5000 });
  };

  it('user opens Merge Modal, adds extra file, and clicks Combine & Open', async () => {
    render(<App />);
    await loadBasePdf();

    const mergeTriggerBtn = screen.getByText('Merge');
    expect(mergeTriggerBtn).toBeInTheDocument();
    
    await act(async () => {
      fireEvent.click(mergeTriggerBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/Merge PDF Documents/i)).toBeInTheDocument();
    });

    const addFilesInput = document.querySelector('input[type="file"][multiple]');
    expect(addFilesInput).not.toBeNull();

    const extraDoc = await PDFDocument.create();
    extraDoc.addPage([600, 400]);
    const extraBytes = await extraDoc.save({ useObjectStreams: false });
    const extraFile = new File([extraBytes], 'extra.pdf', { type: 'application/pdf' });
    extraFile.buffer = extraBytes.buffer;
    extraFile.byteOffset = extraBytes.byteOffset;
    extraFile.byteLength = extraBytes.byteLength;

    await act(async () => {
      fireEvent.change(addFilesInput, { target: { files: [extraFile] } });
    });

    await waitFor(() => {
      expect(screen.getByText(/extra.pdf/i)).toBeInTheDocument();
    });

    const combineBtn = screen.getByText(/Combine & Open/i);
    await act(async () => {
      fireEvent.click(combineBtn);
    });

    await waitFor(() => {
      expect(screen.queryByText(/Merge PDF Documents/i)).toBeNull();
    }, { timeout: 8000 });
  }, 12000);

  it('user opens Split Modal, specifies page range, and extracts pages', async () => {
    render(<App />);
    await loadBasePdf();

    const splitTriggerBtn = screen.getByText('Split');
    expect(splitTriggerBtn).toBeInTheDocument();
    
    await act(async () => {
      fireEvent.click(splitTriggerBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/Split \/ Extract Pages/i)).toBeInTheDocument();
    });

    const rangeInput = screen.getByPlaceholderText(/1, 3, 5-7/i);
    fireEvent.change(rangeInput, { target: { value: '1' } });

    const extractBtn = screen.getByText(/Extract & Save/i);
    await act(async () => {
      fireEvent.click(extractBtn);
    });

    await waitFor(() => {
      expect(screen.queryByText(/Split \/ Extract Pages/i)).toBeNull();
    }, { timeout: 8000 });
  }, 12000);

  it('user opens Stamp Modal, selects preset stamp APPROVED', async () => {
    render(<App />);
    await loadBasePdf();

    const stampToolBtn = screen.getByTitle(/Stamp \/ Image/i);
    await act(async () => {
      fireEvent.click(stampToolBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/APPROVED/i)).toBeInTheDocument();
    });

    const approvedStamp = screen.getByText(/APPROVED/i);
    await act(async () => {
      fireEvent.click(approvedStamp);
    });

    await waitFor(() => {
      expect(screen.queryByText(/APPROVED/i)).toBeNull();
    }, { timeout: 5000 });
  });
});
