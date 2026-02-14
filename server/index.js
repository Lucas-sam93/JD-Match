import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import pdf from 'pdf-parse'
import Anthropic from '@anthropic-ai/sdk'

const app = express()
const PORT = process.env.PORT || 3001

const upload = multer({ storage: multer.memoryStorage() })

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are an expert ATS (Applicant Tracking System) Specialist. Your goal is to analyze a Job Description against a User's Resume.

Instructions:

Extract the top 10 most important hard skills from the Job Description.

Compare them against the Resume text.

Provide a match score (0-100).

Suggest 3 specific bullet point rewrites for the resume to better align with the job.

Output Format:
You MUST return only a valid JSON object. Do not include any conversational text.

JSON Schema:
{
  "score": number,
  "summary": "string",
  "missing_keywords": ["string"],
  "rewrites": [
    {"original": "string", "suggested": "string", "why": "string"}
  ]
}`

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

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Job Description:\n${jobDescription}\n\nResume:\n${resumeText}`,
        },
      ],
    })

    const analysis = JSON.parse(message.content[0].text)
    res.json(analysis)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Analysis failed.', detail: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
