// Resume text extraction (Nemotron is text-only, so files are read here first).
import fs from 'fs';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import WordExtractor from 'word-extractor';

export async function extractResumeText(filePath, mimeType) {
  const buf = fs.readFileSync(filePath);
  let text = '';
  if (mimeType === 'application/pdf') {
    const parser = new PDFParse({ data: buf });
    try { text = (await parser.getText()).text; } finally { await parser.destroy(); }
  } else if (mimeType.includes('openxmlformats')) {
    text = (await mammoth.extractRawText({ buffer: buf })).value;
  } else if (mimeType === 'application/msword') {
    text = (await new WordExtractor().extract(buf)).getBody();
  }
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
