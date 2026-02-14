import { useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { jsPDF } from 'jspdf'

const BASE_URL = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || '')
  : ''

const RADIUS = 36
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const HERO_RADIUS = 54
const HERO_CIRCUMFERENCE = 2 * Math.PI * HERO_RADIUS

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function getScoreColor(score) {
  if (score >= 75) return 'text-green-500'
  if (score >= 50) return 'text-yellow-500'
  return 'text-red-500'
}

function getStrokeColor(score) {
  if (score >= 75) return '#22c55e'
  if (score >= 50) return '#eab308'
  return '#ef4444'
}

function getScoreLabel(score) {
  if (score >= 76) return { text: 'Strong Match', color: 'text-green-500 dark:text-green-400' }
  if (score >= 41) return { text: 'Good Start', color: 'text-yellow-500 dark:text-yellow-400' }
  return { text: 'Needs Work', color: 'text-red-500 dark:text-red-400' }
}

export default function App() {
  const [resumeFile, setResumeFile] = useState(null)
  const [jobDescription, setJobDescription] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef(null)

  // Refinement Suite state
  const [resumeText, setResumeText] = useState('')
  const [appliedRewrites, setAppliedRewrites] = useState(new Set())
  const [highlightRange, setHighlightRange] = useState(null)
  const liveResumeRef = useRef(null)

  // Dark mode state
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('jd-match-theme') === 'dark' ||
        (!localStorage.getItem('jd-match-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
    return false
  })

  function toggleDarkMode() {
    setDarkMode(prev => {
      const next = !prev
      localStorage.setItem('jd-match-theme', next ? 'dark' : 'light')
      return next
    })
  }

  function handleFileSelect(file) {
    if (!file) return
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file.')
      return
    }
    setError(null)
    setResumeFile(file)
  }

  function handleDragOver(e) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  function handleDragLeave(e) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  function handleDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    handleFileSelect(e.dataTransfer.files[0])
  }

  function handleRemoveFile() {
    setResumeFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleStartOver() {
    setResults(null)
    setError(null)
    setResumeFile(null)
    setJobDescription('')
    setResumeText('')
    setAppliedRewrites(new Set())
    setHighlightRange(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleApplyRewrite = useCallback((index) => {
    if (!results) return
    const { original, suggested } = results.rewrites[index]

    // Try exact match first
    let pos = resumeText.indexOf(original)
    let matchLen = original.length

    // Fallback: normalize whitespace and try again
    if (pos === -1) {
      const normalize = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase()
      const normOriginal = normalize(original)
      const normResume = normalize(resumeText)
      const normPos = normResume.indexOf(normOriginal)

      if (normPos !== -1) {
        let normI = 0
        let realStart = -1
        let realEnd = -1
        for (let ri = 0; ri < resumeText.length && realEnd === -1; ri++) {
          if (/\s/.test(resumeText[ri])) {
            if (ri === 0 || !/\s/.test(resumeText[ri - 1])) {
              if (normI === normPos && realStart === -1) realStart = ri
              normI++
              if (normI === normPos + normOriginal.length && realStart !== -1) realEnd = ri + 1
            } else {
              if (normI === normPos + normOriginal.length && realStart !== -1) realEnd = ri
            }
          } else {
            if (normI === normPos && realStart === -1) realStart = ri
            normI++
            if (normI === normPos + normOriginal.length && realStart !== -1) {
              realEnd = ri + 1
              while (realEnd < resumeText.length && /\s/.test(resumeText[realEnd]) && (realEnd === resumeText.length - 1 || /\s/.test(resumeText[realEnd]))) {
                if (!/\s/.test(resumeText[realEnd + 1] || '')) break
                realEnd++
              }
            }
          }
        }

        if (realStart !== -1 && realEnd !== -1) {
          pos = realStart
          matchLen = realEnd - realStart
        }
      }
    }

    // Final fallback: search for a significant fragment
    if (pos === -1) {
      const words = original.split(/\s+/)
      for (let len = Math.min(words.length, 8); len >= 3; len--) {
        const fragment = words.slice(0, len).join(' ')
        const fragLower = fragment.toLowerCase()
        const resumeLower = resumeText.toLowerCase()
        const fragPos = resumeLower.indexOf(fragLower)
        if (fragPos !== -1) {
          let endPos = resumeText.indexOf('\n', fragPos)
          if (endPos === -1) endPos = resumeText.length
          pos = fragPos
          matchLen = endPos - fragPos
          break
        }
      }
    }

    if (pos === -1) {
      setError(`Could not find the original text in your resume to replace. It may have already been modified.`)
      return
    }

    const newText = resumeText.slice(0, pos) + suggested + resumeText.slice(pos + matchLen)
    setResumeText(newText)
    setAppliedRewrites(prev => new Set(prev).add(index))
    setError(null)

    setHighlightRange({ start: pos, end: pos + suggested.length })
    setTimeout(() => setHighlightRange(null), 1500)

    setTimeout(() => {
      if (liveResumeRef.current) {
        const mark = liveResumeRef.current.querySelector('mark')
        if (mark) {
          mark.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }
    }, 50)
  }, [results, resumeText])

  function handleDownloadPDF() {
    if (!resumeText) return
    const doc = new jsPDF()
    const margin = 20
    const pageWidth = doc.internal.pageSize.getWidth() - margin * 2
    const pageHeight = doc.internal.pageSize.getHeight() - margin
    let y = margin

    doc.setFontSize(10)
    doc.setTextColor(50, 50, 50)

    const lines = doc.splitTextToSize(resumeText, pageWidth)
    for (const line of lines) {
      if (y + 5 > pageHeight) {
        doc.addPage()
        y = margin
      }
      doc.text(line, margin, y)
      y += 5
    }

    doc.save('refined-resume.pdf')
  }

  async function handleSubmit() {
    if (!resumeFile) {
      setError('Please upload your resume PDF.')
      return
    }
    if (!jobDescription.trim()) {
      setError('Please paste a job description.')
      return
    }

    setError(null)
    setResults(null)
    setResumeText('')
    setAppliedRewrites(new Set())
    setHighlightRange(null)
    setIsLoading(true)

    try {
      const formData = new FormData()
      formData.append('resume', resumeFile)
      formData.append('jobDescription', jobDescription)

      const response = await fetch(`${BASE_URL}/api/analyze`, {
        method: 'POST',
        body: formData,
      })

      const text = await response.text()
      let data
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(text || 'Server returned an invalid response.')
      }

      if (!response.ok) {
        throw new Error(data.detail || data.error || 'An unknown error occurred.')
      }

      setResults(data)
      setResumeText(data.resumeText || '')
    } catch (err) {
      setError(err.message || 'Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const scores = results ? [
    { key: 'tech_match', label: 'Skills Matched', value: results.tech_match },
    { key: 'impact_match', label: 'Achievement Strength', value: results.impact_match },
    { key: 'ats_compatibility', label: 'ATS Ready', value: results.ats_compatibility },
  ] : []

  const overallMatch = results
    ? Math.round((results.tech_match + results.impact_match + results.ats_compatibility) / 3)
    : 0

  function renderResumeText() {
    if (!resumeText) return <p className="text-gray-400 dark:text-gray-500 italic">No resume text available.</p>

    if (highlightRange) {
      const { start, end } = highlightRange
      const before = resumeText.slice(0, start)
      const highlighted = resumeText.slice(start, end)
      const after = resumeText.slice(end)
      return (
        <>
          {before}
          <mark className="bg-yellow-200 dark:bg-yellow-500/30 transition-colors duration-1000">{highlighted}</mark>
          {after}
        </>
      )
    }

    return resumeText
  }

  const ringTrackColor = darkMode ? '#374151' : '#e5e7eb'

  return (
    <div className={`min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-50 via-white to-indigo-50/30 dark:from-gray-950 dark:via-gray-900 dark:to-indigo-950/30 ${darkMode ? 'dark' : ''}`}>

      {/* ── Header ── */}
      <header className="bg-slate-900 text-white py-5 px-6 shadow-lg">
        <div className={`mx-auto flex items-center gap-3 ${results ? 'max-w-7xl' : 'max-w-4xl'}`}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-8 h-8 text-indigo-400 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z"
            />
          </svg>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">JD-Match</h1>
            <p className="text-slate-400 text-sm">AI-powered resume alignment tool</p>
          </div>
          <button
            onClick={toggleDarkMode}
            className="ml-auto p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Toggle dark mode"
          >
            {darkMode ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <main className={`mx-auto px-4 py-10 ${results ? 'max-w-7xl' : 'max-w-4xl'}`}>

        {/* ── Error Banner ── */}
        {error && (
          <div className="flex items-start gap-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 rounded-xl px-4 py-3 mb-8">
            <span className="text-red-500 dark:text-red-400 text-lg mt-0.5 flex-shrink-0">⚠</span>
            <p className="text-sm leading-relaxed">{error}</p>
          </div>
        )}

        {/* ── Input Card (Glassmorphism) ── */}
        {!results && (<>
        <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/20 dark:border-gray-700/50 p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* LEFT: PDF Drop Zone */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Resume (PDF)
              </label>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files[0])}
              />

              {!resumeFile ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={[
                    'flex flex-col items-center justify-center gap-3 h-44 rounded-xl border-2 border-dashed cursor-pointer transition-colors select-none',
                    isDragOver
                      ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30'
                      : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 hover:border-indigo-300 dark:hover:border-indigo-500 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30',
                  ].join(' ')}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-10 h-10 text-gray-400 dark:text-gray-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                    />
                  </svg>
                  <div className="text-center">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      <span className="font-medium text-indigo-600 dark:text-indigo-400">Click to browse</span>{' '}
                      or drag and drop
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">PDF only</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4 h-44 rounded-xl border-2 border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-950/50 px-5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0 w-10 h-10 bg-red-100 dark:bg-red-900/50 rounded-lg flex items-center justify-center">
                      <span className="text-red-600 dark:text-red-400 text-xs font-bold">PDF</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{resumeFile.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{formatBytes(resumeFile.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleRemoveFile}
                    className="flex-shrink-0 text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium border border-red-200 dark:border-red-700 rounded-lg px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            {/* RIGHT: Job Description Textarea */}
            <div>
              <label
                htmlFor="jd-textarea"
                className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
              >
                Job Description
              </label>
              <textarea
                id="jd-textarea"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the full job description here..."
                className="w-full h-44 resize-none rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-inner transition"
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 text-right">
                {jobDescription.length} characters
              </p>
            </div>
          </div>
        </div>

        {/* ── Submit Button ── */}
        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className={[
            'w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide transition-all duration-200',
            isLoading
              ? 'bg-indigo-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 hover:scale-[1.02] active:scale-[0.99] shadow-md hover:shadow-lg',
          ].join(' ')}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-3">
              <svg
                className="animate-spin w-5 h-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Analyzing Resume...
            </span>
          ) : (
            'Match My Resume'
          )}
        </button>
        </>)}

        {/* ── Refinement Suite ── */}
        {results && (
          <motion.div
            className="space-y-6"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          >

            {/* Action Bar */}
            <motion.div
              className="flex items-center gap-4"
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.4 }}
            >
              <button
                onClick={handleStartOver}
                className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Start Over
              </button>
              <button
                onClick={handleDownloadPDF}
                className="flex items-center gap-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg transition-colors shadow-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download PDF
              </button>
              {appliedRewrites.size > 0 && (
                <span className="text-xs text-green-600 dark:text-green-400 font-medium ml-auto">
                  {appliedRewrites.size} rewrite{appliedRewrites.size > 1 ? 's' : ''} applied
                </span>
              )}
            </motion.div>

            {/* Two-Column Layout */}
            <motion.div
              className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start"
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.4 }}
            >

              {/* ── LEFT PANEL: Analysis ── */}
              <div className="space-y-6 lg:max-h-[calc(100vh-160px)] lg:overflow-y-auto lg:pr-2 lg:sticky lg:top-6">

                {/* Score Breakdown */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                  <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-5">Score Breakdown</h2>

                  {/* Hero Metric — Overall Match */}
                  <div className="flex flex-col items-center mb-6">
                    <div className="relative w-[130px] h-[130px]">
                      <svg width="130" height="130" viewBox="0 0 144 144">
                        <circle cx="72" cy="72" r={HERO_RADIUS} fill="none" stroke={ringTrackColor} strokeWidth="10" />
                        <circle
                          cx="72" cy="72" r={HERO_RADIUS}
                          fill="none"
                          stroke={getStrokeColor(overallMatch)}
                          strokeWidth="10"
                          strokeLinecap="round"
                          strokeDasharray={HERO_CIRCUMFERENCE}
                          strokeDashoffset={HERO_CIRCUMFERENCE * (1 - overallMatch / 100)}
                          transform="rotate(-90 72 72)"
                          style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-3xl font-bold ${getScoreColor(overallMatch)}`}>
                          {overallMatch}
                        </span>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 mt-2">Overall Match</span>
                    {(() => {
                      const lbl = getScoreLabel(overallMatch)
                      return <span className={`text-xs font-medium mt-0.5 ${lbl.color}`}>{lbl.text}</span>
                    })()}
                  </div>

                  {/* Sub-Scores */}
                  <div className="grid grid-cols-3 gap-4">
                    {scores.map(({ key, label, value }) => {
                      const offset = CIRCUMFERENCE * (1 - value / 100)
                      const lbl = getScoreLabel(value)
                      return (
                        <div key={key} className="flex flex-col items-center gap-1.5">
                          <div className="relative w-[72px] h-[72px]">
                            <svg width="72" height="72" viewBox="0 0 96 96">
                              <circle cx="48" cy="48" r={RADIUS} fill="none" stroke={ringTrackColor} strokeWidth="7" />
                              <circle
                                cx="48" cy="48" r={RADIUS}
                                fill="none"
                                stroke={getStrokeColor(value)}
                                strokeWidth="7"
                                strokeLinecap="round"
                                strokeDasharray={CIRCUMFERENCE}
                                strokeDashoffset={offset}
                                transform="rotate(-90 48 48)"
                                style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
                              />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className={`text-base font-bold ${getScoreColor(value)}`}>
                                {value}
                              </span>
                            </div>
                          </div>
                          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 text-center leading-tight">{label}</span>
                          <span className={`text-[10px] font-medium ${lbl.color}`}>{lbl.text}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Keyword Gaps */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                  <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-1">Keyword Gaps</h2>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
                    Keywords from the job description not found in your resume.
                  </p>
                  {results.missing_keywords.length === 0 ? (
                    <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                      No missing keywords — great coverage!
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {results.missing_keywords.map((keyword, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                        >
                          <span className="text-rose-400">✕</span>
                          {keyword}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Hallucination Check */}
                {results.hallucination_check?.length > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-800 p-6">
                    <h2 className="text-lg font-semibold text-amber-800 dark:text-amber-200 mb-1">Unverified Skills</h2>
                    <p className="text-sm text-amber-600 dark:text-amber-400 mb-4">
                      Skills suspected from context but not explicitly proven in your resume.
                    </p>
                    <div className="space-y-3">
                      {results.hallucination_check.map((item, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <span className="text-amber-400 mt-0.5 flex-shrink-0">?</span>
                          <div>
                            <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">{item.skill}</span>
                            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">{item.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Smart Rewrites */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                  <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4">Smart Rewrites</h2>
                  <div className="space-y-4">
                    {results.rewrites.map((rewrite, i) => {
                      const isApplied = appliedRewrites.has(i)
                      return (
                        <div
                          key={i}
                          className={[
                            'rounded-xl border p-5 space-y-4 transition-colors',
                            isApplied
                              ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/30'
                              : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50',
                          ].join(' ')}
                        >
                          <div>
                            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
                              Current
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{rewrite.original}</p>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xl text-indigo-400 leading-none">↓</span>
                            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                              AI Suggested
                            </span>
                          </div>

                          <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800 px-4 py-3">
                            <p className="text-sm text-indigo-900 dark:text-indigo-200 leading-relaxed font-medium">
                              {rewrite.suggested}
                            </p>
                          </div>

                          <div className="flex items-start gap-2">
                            <span className="text-amber-500 text-sm mt-0.5 flex-shrink-0">ℹ</span>
                            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                              <span className="font-semibold text-gray-600 dark:text-gray-300">Why: </span>
                              {rewrite.why}
                            </p>
                          </div>

                          <div className="flex justify-end">
                            <button
                              onClick={() => handleApplyRewrite(i)}
                              disabled={isApplied}
                              className={[
                                'text-xs font-semibold px-4 py-2 rounded-lg border transition-all',
                                isApplied
                                  ? 'bg-green-50 dark:bg-green-950/50 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800 cursor-default'
                                  : 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 hover:border-indigo-700',
                              ].join(' ')}
                            >
                              {isApplied ? 'Applied ✓' : 'Apply to Resume →'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* AI Summary */}
                <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-800 rounded-2xl p-6">
                  <div className="flex items-start gap-3">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-5 h-5 text-indigo-500 dark:text-indigo-400 mt-0.5 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.8}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                    <div>
                      <h2 className="text-sm font-semibold text-indigo-700 dark:text-indigo-300 mb-1">AI Summary</h2>
                      <p className="text-sm text-indigo-900 dark:text-indigo-200 leading-relaxed">{results.summary}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── RIGHT PANEL: Live Resume ── */}
              <div className="lg:sticky lg:top-6">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <div className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-slate-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Live Resume</h2>
                    </div>
                    {appliedRewrites.size > 0 && (
                      <span className="text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-950/50 px-2 py-1 rounded-md border border-amber-200 dark:border-amber-800">
                        Edited
                      </span>
                    )}
                  </div>

                  <div
                    ref={liveResumeRef}
                    className="px-8 py-6 max-h-[calc(100vh-220px)] overflow-y-auto"
                  >
                    <div className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 leading-relaxed font-[Georgia,_serif]">
                      {renderResumeText()}
                    </div>
                  </div>
                </div>
              </div>

            </motion.div>
          </motion.div>
        )}
      </main>
    </div>
  )
}
