// Resume text extraction (Nemotron is text-only, so files are read here first).
import fs from 'fs';

export async function extractResumeText(filePath, mimeType) {
  const buf = fs.readFileSync(filePath);
  let text = '';
  if (mimeType === 'application/pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    text = (await extractText(pdf, { mergePages: true })).text;
  } else if (mimeType.includes('openxmlformats')) {
    const mammoth = (await import('mammoth')).default;
    text = (await mammoth.extractRawText({ buffer: buf })).value;
  } else if (mimeType === 'application/msword') {
    const WordExtractor = (await import('word-extractor')).default;
    text = (await new WordExtractor().extract(buf)).getBody();
  }
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
