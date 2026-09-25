# AFhomes Ecofarm Requirements

## Customer and on-site sales workflow

Customers do not use this web application. Authorized staff handle all customer transactions in person.

1. Staff manually completes the customer form and records valid ID details.
2. Staff uploads an ID image or document.
3. Provide an OCR and barcode/QR scanning workflow:
   - Upload a valid ID image or scan the customer’s physical ID using the device camera.
   - Read available machine-readable ID data, such as a QR code, barcode, PDF417 code, or ID number, when present.
   - Automatically extract and fill supported customer fields, including full name, date of birth, sex, address, ID type, ID number, and ID expiration date.
   - Use OCR to extract visible text from IDs that do not contain a readable QR code or barcode.
   - Clearly show the extracted source and confidence where available.
   - Require staff to review, correct, and confirm every auto-filled detail before saving.
   - Store the scanned ID image or document privately and create a file hash for tamper detection.
   - If scanning or OCR is unavailable, fails, or is not configured, allow complete manual entry and show a clear reason.
   - Never treat a scanned ID alone as proof of identity or automatically approve a customer or payment.

Free on-device OCR uses Tesseract.js. Accuracy depends on image quality; staff review is mandatory.
Machine-readable QR, barcode, and PDF417 scanning uses `@zxing/browser` first. Google Document AI is an optional server-side provider and is not required for customer registration or manual entry.
4. Generate a print-friendly customer application and transaction form.
5. Submit the record to Finance for payment verification.
6. Allow down payments.
7. Track the seven-day payment deadline for spot-cash transactions.
8. Track the workflow through draft, submitted, awaiting payment, partially paid, verification pending, verified, overdue, completed, cancelled, and reversed statuses.
9. Record the payment method, amount, reference number, receipt or document attachment, verifier, verification timestamp, and notes.

Payments must never be verified automatically.
