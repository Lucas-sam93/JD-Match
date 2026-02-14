require('dotenv').config()
const express = require('express')
const cors = require('cors')
const multer = require('multer')
const pdf = require('pdf-parse')
const { GoogleGenerativeAI } = require('@google/generative-ai')

const app = express()
const PORT = process.env.PORT || 3001

const upload = multer({ storage: multer.memoryStorage() })

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)

const SYSTEM_INSTRUCTION = `You are an expert ATS (Applicant Tracking System) Specialist. Your goal is to analyze a Job Description against a User's Resume.

Instructions:

Extract the top 10 most important hard skills from the Job Description.

Compare them against the Resume text.

Provide a match score (0-100).

Suggest 3 specific bullet point rewrites for the resume to better align with the job.

JSON Schema:
{
  "score": number,
  "summary": "string",
  "missing_keywords": ["string"],
  "rewrites": [
    {"original": "string", "suggested": "string", "why": "string"}
  ]
}`

const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  systemInstruction: SYSTEM_INSTRUCTION,
  generationConfig: {
    responseMimeType: 'application/json',
  },
})

async function generateWithRetry(prompt, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent(prompt)
      return result
    } catch (err) {
      const isRateLimit =
        err.status === 429 ||
        err.message?.includes('RESOURCE_EXHAUSTED') ||
        err.message?.includes('429')

      if (isRateLimit && attempt < maxRetries) {
        const delay = attempt * 5000 // 5s, 10s backoff
        console.log(`Rate limited (attempt ${attempt}/${maxRetries}). Retrying in ${delay / 1000}s...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }
      throw err
    }
  }
}

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'JD-Match' })
})

app.post('/api/analyze', upload.single('resume'), async (req, res) => {
  try {
    const { jobDescription } = req.body

    if (!req.file) {
      return res.status(400).json({ error: 'Resume PDF is required.' })
    }
    if (!jobDescription || !jobDescription.trim()) {
      return res.status(400).json({ error: 'Job description is required.' })
    }

    const pdfData = await pdf(req.file.buffer)
    const resumeText = pdfData.text

    const result = await generateWithRetry(
      `Job Description:\n${jobDescription}\n\nResume:\n${resumeText}`
    )

    const analysis = JSON.parse(result.response.text())
    res.json(analysis)
  } catch (err) {
    console.error(err)

    // Google API specific error handling
    if (err.message?.includes('SAFETY')) {
      return res.status(400).json({
        error: 'Content was blocked by safety filters.',
        detail: 'The input triggered Google\'s safety filters. Try rephrasing.',
      })
    }
    if (err.message?.includes('RESOURCE_EXHAUSTED') || err.status === 429) {
      return res.status(429).json({
        error: 'The AI is a bit busy right now.',
        detail: 'Please wait 30 seconds and try again. The free-tier has a limited number of requests per minute.',
      })
    }
    if (err.message?.includes('API_KEY_INVALID') || err.message?.includes('API key not valid')) {
      return res.status(401).json({
        error: 'Invalid API key.',
        detail: 'The GOOGLE_API_KEY in .env is missing or invalid.',
      })
    }

    res.status(500).json({ error: 'Analysis failed.', detail: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
