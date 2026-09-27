import express from 'express';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const router = express.Router();

// Multer setup for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Initialize Gemini with API key from environment    
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("ERROR: GEMINI_API_KEY is not set in environment variables!");
  console.error("Please add GEMINI_API_KEY to your .env file");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

console.log("✓ Gemini initialized with API key from environment");

// Function to convert file to base64
function fileToBase64(filePath) {
  const fileContent = fs.readFileSync(filePath);
  return fileContent.toString('base64');
}

// Function to get MIME type from file extension
function getMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// Table 5.1 weights (points out of 100)
const ATS_WEIGHTS = {
  keyword_coverage: 35,
  section_completeness: 20,
  formatting_compliance: 20,
  achievement_quantification: 15,
  action_verbs: 10,
};
const ATS_MODEL = process.env.ATS_MODEL || process.env.GEMINI_MODEL || 'gemini-flash-latest';

// ATS Analysis Endpoint
router.post('/analyze-resume', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const mimeType = getMimeType(fileName);

    console.log(`Analyzing file: ${fileName}, MIME type: ${mimeType}`);

    // Validate file type
    const validMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!validMimeTypes.includes(mimeType)) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'Invalid file type. Please upload PDF or DOC/DOCX files.' });
    }

    // Read file and convert to base64
    const fileData = fileToBase64(filePath);
    console.log(`File converted to base64: ${fileData.length} characters`);

    // Initialize the generative model
    const model = genAI.getGenerativeModel({ model: ATS_MODEL });

    // Optional target role and job description make keyword scoring job-specific.
    const targetRole = String(req.body?.targetRole || '').slice(0, 200);
    const jobDescription = String(req.body?.jobDescription || '').slice(0, 8000);

    // Five scoring dimensions (paper Table 5.1). Gemini rates each 0-1; the weighted
    // total is computed here so the weights are fixed and auditable.
    const prompt = `You are an ATS (Applicant Tracking System) resume auditor.
${targetRole ? `Target role: ${targetRole}` : 'Target role: infer from the resume.'}
${jobDescription ? `Job description:\n"""${jobDescription}"""` : 'No job description was given; judge keywords against typical postings for the target role.'}

Rate the attached resume on each dimension from 0.0 to 1.0:
- keyword_coverage: presence of role-relevant technical and soft-skill keywords
- section_completeness: Education, Experience, Skills and Projects sections all present
- formatting_compliance: no tables, text boxes, columns or graphics that confuse ATS parsers
- achievement_quantification: experience bullets contain numeric results
- action_verbs: bullets start with strong, varied action verbs

Also list the role-relevant keywords found in the resume and important ones that are missing.

Respond ONLY with JSON:
{
  "dimensions": {"keyword_coverage": 0.0, "section_completeness": 0.0, "formatting_compliance": 0.0, "achievement_quantification": 0.0, "action_verbs": 0.0},
  "keywords_found": ["..."],
  "keywords_missing": ["..."],
  "strengths": ["4-5 items"],
  "weaknesses": ["4-5 items"],
  "suggestions": ["6-8 specific rewrite tips"]
}`;

    try {
      console.log("Sending request to Gemini API...");
      
      // Analyze resume with Gemini
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: fileData } }, { text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
      });

      console.log("✓ Received response from Gemini");

      const responseText = result.response.text();
      console.log("Response text length:", responseText.length);

      // Parse the JSON response
      let analysisResult;
      try {
        analysisResult = JSON.parse(responseText);
      } catch (parseError) {
        // If JSON parsing fails, try to extract JSON from response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisResult = JSON.parse(jsonMatch[0]);
        } else {
          console.error('Gemini Response:', responseText);
          throw new Error('Could not extract valid JSON from Gemini response');
        }
      }

      // Validate response structure
      const dims = analysisResult.dimensions || {};
      const missing = Object.keys(ATS_WEIGHTS).filter((k) => typeof dims[k] !== 'number');
      if (missing.length || !Array.isArray(analysisResult.strengths) || !Array.isArray(analysisResult.suggestions)) {
        throw new Error('Invalid analysis response structure');
      }

      // Weighted total out of 100 (Table 5.1 weights)
      const breakdown = Object.fromEntries(
        Object.entries(ATS_WEIGHTS).map(([k, w]) => [k, Math.round(Math.min(1, Math.max(0, dims[k])) * w * 10) / 10]),
      );
      const score = Math.round(Object.values(breakdown).reduce((x, y) => x + y, 0));

      // Clean up uploaded file
      fs.unlinkSync(filePath);

      console.log("✓ Analysis complete. Score:", score);

      res.json({
        score,
        breakdown,
        weights: ATS_WEIGHTS,
        keywordsFound: analysisResult.keywords_found || [],
        keywordsMissing: analysisResult.keywords_missing || [],
        model: ATS_MODEL,
        strengths: analysisResult.strengths,
        weaknesses: analysisResult.weaknesses || [],
        suggestions: analysisResult.suggestions,
      });
    } catch (geminiError) {
      console.error('Gemini API Error:', geminiError.message);
      console.error('Full error:', geminiError);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      res.status(500).json({
        error: 'Failed to analyze resume with Gemini',
        details: geminiError.message,
      });
    }
  } catch (error) {
    console.error('Error in resume analysis:', error);

    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: 'Failed to process resume',
      details: error.message,
    });
  }
});

export default router;
