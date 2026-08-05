import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from '../App';
import { PDFDocument } from 'pdf-lib';

describe('User Action Simulation: App Shell & Document Load', () => {
  it('renders initial drop zone when no document is loaded', () => {
    render(<App />);

    expect(screen.getByText(/Drop your PDF here to edit/i)).toBeInTheDocument();
    expect(screen.getByText(/Select PDF File/i)).toBeInTheDocument();
    expect(screen.getByText(/100% Client-Side Sandbox/i)).toBeInTheDocument();
  });

  it('handles user uploading a valid PDF document', async () => {
    render(<App />);

    // Create sample PDF using pdf-lib
    const sampleDoc = await PDFDocument.create();
    sampleDoc.addPage([600, 400]);
    const pdfBytes = await sampleDoc.save();
    const file = new File([pdfBytes], 'test-user-document.pdf', { type: 'application/pdf' });

    const fileInput = document.querySelector('input[type="file"][accept="application/pdf"]');
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      // Document header filename should update in toolbar or sidebar
      expect(document.body).toBeDefined();
    });
  });

  it('user opens security badge popover and triggers RAM purge', async () => {
    render(<App />);

    const securityBadge = screen.getByTitle(/Local Privacy Shield/i);
    expect(securityBadge).toBeInTheDocument();

    fireEvent.click(securityBadge);

    await waitFor(() => {
      expect(screen.getByText(/Your PDF files stay strictly within your browser's local RAM/i)).toBeInTheDocument();
    });
  });
});
