import { createRequire } from 'node:module'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { IncomingForm } from 'formidable'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const pdf = require('pdf-parse/lib/pdf-parse.js')

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ keepExtensions: true, maxFileSize: 10 * 1024 * 1024 })
    form.parse(req, (err, fields, files) => {
      if (err) reject(err)
      else resolve({ fields, files })
    })
  })
}

const SYSTEM_INSTRUCTION = `You are an expert ATS (Applicant Tracking System) Specialist using Strict Evidence Matching. Your goal is to analyze a Job Description against a User's Resume.

Instructions:

Extract the top 10 most important hard skills from the Job Description.

Compare them against the Resume text using these strict rules:

1. Zero-Inference Rule: Only count a skill as matched if the resume explicitly mentions it with a supporting tool, technology, or metric. Do NOT infer skills from job titles or vague context.

2. Context Check — Exposure vs Expertise:
   - "Exposure" (skill listed without context, e.g. "Python" in a skills list) = 25% match weight.
   - "Expertise" (skill demonstrated with a concrete action + outcome, e.g. "Developed a Python automation script saving 20 hours/week") = 100% match weight.
   Use these weights when calculating tech_match.

3. The "So What?" Test: Penalize bullet points that describe tasks or responsibilities without measurable outcomes. Bullet points like "Responsible for managing a team" score lower than "Led a team of 8 engineers, delivering the project 2 weeks ahead of schedule."

Provide these scores (each 0-100):
- tech_match: Hard skill alignment, weighted by Exposure vs Expertise as described above.
- impact_match: How strong the action verbs, quantified results, and achievement statements are. Apply the "So What?" test.
- ats_compatibility: A check for ATS-unfriendly formatting (columns, tables, images, headers/footers, unusual fonts). 100 means fully ATS-compatible.
- strict_score: An overall score using only verifiable, evidence-backed matches (no inferences).
- confidence_rating: Your confidence (0-100) in the accuracy of this analysis. Lower if the resume is vague, short, or ambiguous.

Also produce a hallucination_check array: list any skills you suspect the candidate might have based on context clues but that are NOT explicitly stated with evidence. Each entry should have the skill name and the reason you suspect it.

Suggest 3 specific bullet point rewrites for the resume to better align with the job.

CRITICAL: For each rewrite, the "original" field MUST be copied EXACTLY character-for-character from the Resume text provided. Do NOT paraphrase, summarize, or reword the original — paste the exact substring as it appears in the resume.

JSON Schema:
{
  "tech_match": number,
  "impact_match": number,
  "ats_compatibility": number,
  "strict_score": number,
  "confidence_rating": number,
  "summary": "string",
  "missing_keywords": ["string"],
  "hallucination_check": [
    {"skill": "string", "reason": "string"}
  ],
  "rewrites": [
    {"original": "exact text copied from resume", "suggested": "string", "why": "string"}
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
    const { fields, files } = await parseForm(req)

    // formidable v3 wraps values in arrays
    const jobDescription = Array.isArray(fields.jobDescription)
      ? fields.jobDescription[0]
      : fields.jobDescription

    const resumeFile = Array.isArray(files.resume)
      ? files.resume[0]
      : files.resume

    if (!resumeFile) {
      return res.status(400).json({ error: 'Resume PDF is required.' })
    }
    if (!jobDescription || !jobDescription.trim()) {
      return res.status(400).json({ error: 'Job description is required.' })
    }

    const fileBuffer = readFileSync(resumeFile.filepath)
    const pdfData = await pdf(fileBuffer)
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
    res.json({ ...analysis, resumeText })
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
