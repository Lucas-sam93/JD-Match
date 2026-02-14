import multer from 'multer'
import pdf from 'pdf-parse/lib/pdf-parse.js'
import { GoogleGenerativeAI } from '@google/generative-ai'

const upload = multer({ storage: multer.memoryStorage() })

function runMulter(req, res) {
  return new Promise((resolve, reject) => {
    upload.single('resume')(req, res, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

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

async function generateWithRetry(model, prompt, maxRetries = 3) {
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
        const delay = attempt * 5000
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }
      throw err
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await runMulter(req, res)

    const { jobDescription } = req.body

    if (!req.file) {
      return res.status(400).json({ error: 'Resume PDF is required.' })
    }
    if (!jobDescription || !jobDescription.trim()) {
      return res.status(400).json({ error: 'Job description is required.' })
    }

    const pdfData = await pdf(req.file.buffer)
    const resumeText = pdfData.text

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        responseMimeType: 'application/json',
      },
    })

    const result = await generateWithRetry(
      model,
      `Job Description:\n${jobDescription}\n\nResume:\n${resumeText}`
    )

    const analysis = JSON.parse(result.response.text())
    res.json(analysis)
  } catch (err) {
    console.error(err)

    if (err.message?.includes('SAFETY')) {
      return res.status(400).json({
        error: 'Content was blocked by safety filters.',
        detail: "The input triggered Google's safety filters. Try rephrasing.",
      })
    }
    if (err.message?.includes('RESOURCE_EXHAUSTED') || err.status === 429) {
      return res.status(429).json({
        error: 'The AI is a bit busy right now.',
        detail:
          'Please wait 30 seconds and try again. The free-tier has a limited number of requests per minute.',
      })
    }
    if (
      err.message?.includes('API_KEY_INVALID') ||
      err.message?.includes('API key not valid')
    ) {
      return res.status(401).json({
        error: 'Invalid API key.',
        detail: 'The GOOGLE_API_KEY environment variable is missing or invalid.',
      })
    }

    res.status(500).json({ error: 'Analysis failed.', detail: err.message })
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
}
