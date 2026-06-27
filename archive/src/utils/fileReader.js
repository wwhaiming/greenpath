// OCR + PDF reading backed by npm packages (tesseract.js, pdfjs-dist) instead of
// CDN <script> tags. The original single-page app referenced the globals
// `window.pdfjsLib` and `window.Tesseract` and set pdf.js workerSrc to a CDN URL.
//
// To keep the original imperative feature code byte-for-byte identical in
// behavior, we import the npm builds and expose them on `window` under the same
// names, and we point pdf.js at the worker bundled by Vite (?url import). After
// installGlobals() runs once, every original reference to window.pdfjsLib /
// window.Tesseract / pdfjsLib / Tesseract works exactly as before.
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'
import Tesseract from 'tesseract.js'

let installed = false

export function installGlobals() {
  if (installed) return
  installed = true
  // pdf.js: route the worker to the Vite-bundled asset (replaces the old CDN URL).
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  } catch (_) { /* ignore */ }
  window.pdfjsLib = pdfjsLib
  window.Tesseract = Tesseract
}

export { pdfjsLib, Tesseract }
