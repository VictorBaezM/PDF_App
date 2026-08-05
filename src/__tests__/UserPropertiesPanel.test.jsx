import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../App';

describe('User Action Simulation: Properties Panel & Tool Options', () => {
  const loadPdf = async () => {
    const pdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    const file = new File([pdfHeader], 'props-test.pdf', { type: 'application/pdf' });
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fireEvent.change(fileInputs[0], { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTitle(/Select \/ Move/i)).toBeInTheDocument(), { timeout: 3000 });
  };

  it('user changes ink color and stroke thickness while Ink tool is active', async () => {
    render(<App />);
    await loadPdf();

    const inkToolBtn = screen.getByTitle(/Freehand Draw/i);
    fireEvent.click(inkToolBtn);

    await waitFor(() => {
      expect(screen.getByText(/Ink Color/i)).toBeInTheDocument();
      expect(screen.getByText(/Stroke Thickness/i)).toBeInTheDocument();
    });

    const thicknessRange = screen.getByRole('slider', { name: /Stroke Thickness/i });
    fireEvent.change(thicknessRange, { target: { value: '8' } });

    expect(screen.getByText(/Stroke Thickness: 8px/i)).toBeInTheDocument();
  });

  it('user adjusts font size slider while Textbox tool is active', async () => {
    render(<App />);
    await loadPdf();

    const textboxToolBtn = screen.getByTitle(/Add Text Box/i);
    fireEvent.click(textboxToolBtn);

    await waitFor(() => {
      expect(screen.getByText(/Font Size/i)).toBeInTheDocument();
    });

    const fontSizeRange = screen.getByRole('slider', { name: /Font Size/i });
    fireEvent.change(fontSizeRange, { target: { value: '24' } });

    expect(screen.getByText(/Font Size: 24px/i)).toBeInTheDocument();
  });

  it('user adjusts opacity slider in PropertiesPanel', async () => {
    render(<App />);
    await loadPdf();

    const opacitySlider = screen.getByRole('slider', { name: /Opacity/i });
    fireEvent.change(opacitySlider, { target: { value: '80' } });

    expect(screen.getByText(/Opacity: 80%/i)).toBeInTheDocument();
  });
});
