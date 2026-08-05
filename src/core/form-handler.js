import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } from 'pdf-lib';

export class PDFFormHandler {
  static async extractFormFields(pdfBytes) {
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const form = pdfDoc.getForm();
      const fields = form.getFields();

      return fields.map((field) => {
        const name = field.getName();
        const type = field.constructor.name;
        let value = '';

        if (field instanceof PDFTextField) {
          value = field.getText() || '';
        } else if (field instanceof PDFCheckBox) {
          value = field.isChecked();
        } else if (field instanceof PDFDropdown) {
          value = field.getSelected() || [];
        } else if (field instanceof PDFRadioGroup) {
          value = field.getSelected() || '';
        }

        return {
          name,
          type,
          value,
        };
      });
    } catch (e) {
      console.warn('Form extraction warning:', e);
      return [];
    }
  }

  static async fillAndSaveForm(pdfBytes, fieldValues = {}) {
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const form = pdfDoc.getForm();

      for (const [name, val] of Object.entries(fieldValues)) {
        try {
          const field = form.getField(name);
          if (field instanceof PDFTextField) {
            field.setText(String(val));
          } else if (field instanceof PDFCheckBox) {
            if (val) field.check();
            else field.uncheck();
          } else if (field instanceof PDFDropdown) {
            field.select(String(val));
          } else if (field instanceof PDFRadioGroup) {
            field.select(String(val));
          }
        } catch (fieldErr) {
          console.warn(`Could not set form field ${name}:`, fieldErr);
        }
      }

      return await pdfDoc.save();
    } catch (e) {
      console.error('Failed to fill form fields:', e);
      return pdfBytes;
    }
  }
}
