# JD-Match: AI-Powered Resume Optimizer

<!-- VERSION-START -->
**Current version:** `0.1.0`
<!-- VERSION-END -->

**JD-Match** is a full-stack web application that helps job seekers beat Applicant Tracking Systems (ATS). Powered by **Google Gemini 2.5 Flash**, it analyzes your resume against a job description using **Strict Evidence Matching** to surface keyword gaps, score your alignment, and generate high-impact bullet point rewrites.

## Features
* **PDF & Word Upload** — Accepts `.pdf` and `.docx` resumes. PDFs are parsed server-side with `pdf-parse`; Word docs are extracted client-side with `mammoth`.
* **Strict Evidence Matching** — Zero-inference scoring with Exposure vs Expertise weighting and the "So What?" test for bullet points.
* **Overall Match Hero Score** — A single primary gauge averaging Skills Matched, Achievement Strength, and ATS Ready, with dynamic labels (Strong Match / Good Start / Needs Work).
* **Segmented Sub-Scores** — Three progress rings: Skills Matched, Achievement Strength, and ATS Ready, each with color-coded status labels.
* **Keyword Gap Detection** — Highlights hard skills from the JD missing in your resume.
* **Hallucination Check** — Flags skills the AI suspects you have but can't verify from your resume text.
* **Smart Rewrites** — AI-generated before/after bullet point suggestions with one-click apply and fuzzy matching.
* **Refinement Suite** — Side-by-side workspace: analysis on the left, live editable resume on the right.
* **PDF Export** — Download your refined resume as a PDF via `jsPDF`.
* **Dark Mode** — Full dark/light toggle with system preference detection and localStorage persistence.
* **Glassmorphism UI** — Frosted-glass input card with `backdrop-blur`, Inter font, and staggered framer-motion animations.

## Tech Stack
| Component | Technology |
| :--- | :--- |
| **Frontend** | React 18, Vite, Tailwind CSS v4, Framer Motion |
| **Backend (local)** | Node.js, Express, Multer |
| **Backend (Vercel)** | Vercel Serverless Functions, Formidable |
| **AI Engine** | Google Gemini 2.5 Flash API |
| **Document Parsing** | pdf-parse (PDF), mammoth (Word), jsPDF (export) |
| **CI/CD** | GitHub Actions, Vercel |

## Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v18 or higher)
* A [Google AI Studio](https://aistudio.google.com/) API Key

### Installation & Setup
1. **Clone the repository:**
   ```bash
   git clone https://github.com/Lucas-sam93/JD-Match.git
   cd JD-Match
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp server/.env.example server/.env
   ```
   Add your `GOOGLE_API_KEY` to `server/.env`.

4. **Run locally:**
   ```bash
   npm run dev
   ```
   This starts both the Vite dev server and the Express backend concurrently.

## Deployment
The app is configured for **Vercel**. Push to `master` and Vercel will auto-deploy. The serverless API function lives in `api/analyze.js` and uses Formidable for file uploads.
