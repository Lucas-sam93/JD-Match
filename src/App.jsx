import { useState, useRef, useCallback } from 'react'
import { jsPDF } from 'jspdf'

const BASE_URL = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || '')
  : ''

const RADIUS = 54
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

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
        // Map normalized position back to original text
        // Walk through original resumeText counting normalized chars
        let normI = 0
        let realStart = -1
        let realEnd = -1
        for (let ri = 0; ri < resumeText.length && realEnd === -1; ri++) {
          if (/\s/.test(resumeText[ri])) {
            // Skip consecutive whitespace in original (counts as one in normalized)
            if (ri === 0 || !/\s/.test(resumeText[ri - 1])) {
              if (normI === normPos && realStart === -1) realStart = ri
              normI++ // the single space in normalized
              if (normI === normPos + normOriginal.length && realStart !== -1) realEnd = ri + 1
            } else {
              // Extra whitespace char — part of the match range if we're inside it
              if (normI === normPos + normOriginal.length && realStart !== -1) realEnd = ri
            }
          } else {
            if (normI === normPos && realStart === -1) realStart = ri
            normI++
            if (normI === normPos + normOriginal.length && realStart !== -1) {
              realEnd = ri + 1
              // Include trailing whitespace that's part of the original segment
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

    // Final fallback: search for a significant fragment (first 40+ chars)
    if (pos === -1) {
      const words = original.split(/\s+/)
      for (let len = Math.min(words.length, 8); len >= 3; len--) {
        const fragment = words.slice(0, len).join(' ')
        const fragLower = fragment.toLowerCase()
        const resumeLower = resumeText.toLowerCase()
        const fragPos = resumeLower.indexOf(fragLower)
        if (fragPos !== -1) {
          // Find end of the line/sentence containing this fragment
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

  const scoreOffset = results
    ? CIRCUMFERENCE * (1 - results.score / 100)
    : CIRCUMFERENCE

  function renderResumeText() {
    if (!resumeText) return <p className="text-gray-400 italic">No resume text available.</p>

    if (highlightRange) {
      const { start, end } = highlightRange
      const before = resumeText.slice(0, start)
      const highlighted = resumeText.slice(start, end)
      const after = resumeText.slice(end)
      return (
        <>
          {before}
          <mark className="bg-yellow-200 transition-colors duration-1000">{highlighted}</mark>
          {after}
        </>
      )
    }

    return resumeText
  }

  return (
    <div className="min-h-screen bg-gray-50">

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
        </div>
      </header>

      <main className={`mx-auto px-4 py-10 ${results ? 'max-w-7xl' : 'max-w-4xl'}`}>

        {/* ── Error Banner ── */}
        {error && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 mb-8">
            <span className="text-red-500 text-lg mt-0.5 flex-shrink-0">⚠</span>
            <p className="text-sm leading-relaxed">{error}</p>
          </div>
        )}

        {/* ── Input Card ── */}
        {!results && (<>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* LEFT: PDF Drop Zone */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
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
                      ? 'border-indigo-400 bg-indigo-50'
                      : 'border-gray-300 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50/40',
                  ].join(' ')}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-10 h-10 text-gray-400"
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
                    <p className="text-sm text-gray-600">
                      <span className="font-medium text-indigo-600">Click to browse</span>{' '}
                      or drag and drop
                    </p>
                    <p className="text-xs text-gray-400 mt-1">PDF only</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4 h-44 rounded-xl border-2 border-green-200 bg-green-50 px-5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                      <span className="text-red-600 text-xs font-bold">PDF</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{resumeFile.name}</p>
                      <p className="text-xs text-gray-500">{formatBytes(resumeFile.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleRemoveFile}
                    className="flex-shrink-0 text-xs text-red-500 hover:text-red-700 font-medium border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors"
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
                className="block text-sm font-semibold text-gray-700 mb-2"
              >
                Job Description
              </label>
              <textarea
                id="jd-textarea"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the full job description here..."
                className="w-full h-44 resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
              />
              <p className="text-xs text-gray-400 mt-1.5 text-right">
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
            'w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide transition-all',
            isLoading
              ? 'bg-indigo-400 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] shadow-md hover:shadow-lg',
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
          <div className="space-y-6">

            {/* Action Bar */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleStartOver}
                className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors"
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
                <span className="text-xs text-green-600 font-medium ml-auto">
                  {appliedRewrites.size} rewrite{appliedRewrites.size > 1 ? 's' : ''} applied
                </span>
              )}
            </div>

            {/* Two-Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

              {/* ── LEFT PANEL: Analysis ── */}
              <div className="space-y-6 lg:max-h-[calc(100vh-160px)] lg:overflow-y-auto lg:pr-2 lg:sticky lg:top-6">

                {/* Score Card (Compact) */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center gap-6">
                  <div className="relative w-[100px] h-[100px] flex-shrink-0">
                    <svg width="100" height="100" viewBox="0 0 140 140">
                      <circle cx="70" cy="70" r={RADIUS} fill="none" stroke="#e5e7eb" strokeWidth="12" />
                      <circle
                        cx="70" cy="70" r={RADIUS}
                        fill="none"
                        stroke={getStrokeColor(results.score)}
                        strokeWidth="12"
                        strokeLinecap="round"
                        strokeDasharray={CIRCUMFERENCE}
                        strokeDashoffset={scoreOffset}
                        transform="rotate(-90 70 70)"
                        style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={`text-2xl font-bold ${getScoreColor(results.score)}`}>
                        {results.score}
                      </span>
                      <span className="text-[10px] text-gray-400">/ 100</span>
                    </div>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-700">Match Score</h2>
                    <p className={`text-sm font-medium ${getScoreColor(results.score)}`}>
                      {results.score >= 75 ? 'Strong Match' : results.score >= 50 ? 'Moderate Match' : 'Weak Match'}
                    </p>
                  </div>
                </div>

                {/* Keyword Gaps */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <h2 className="text-lg font-semibold text-gray-700 mb-1">Keyword Gaps</h2>
                  <p className="text-sm text-gray-400 mb-4">
                    Keywords from the job description not found in your resume.
                  </p>
                  {results.missing_keywords.length === 0 ? (
                    <p className="text-sm text-green-600 font-medium">
                      No missing keywords — great coverage!
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {results.missing_keywords.map((keyword, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 border border-rose-200"
                        >
                          <span className="text-rose-400">✕</span>
                          {keyword}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Smart Rewrites */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <h2 className="text-lg font-semibold text-gray-700 mb-4">Smart Rewrites</h2>
                  <div className="space-y-4">
                    {results.rewrites.map((rewrite, i) => {
                      const isApplied = appliedRewrites.has(i)
                      return (
                        <div
                          key={i}
                          className={[
                            'rounded-xl border p-5 space-y-4 transition-colors',
                            isApplied
                              ? 'border-green-200 bg-green-50/50'
                              : 'border-gray-100 bg-gray-50',
                          ].join(' ')}
                        >
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                              Current
                            </p>
                            <p className="text-sm text-gray-600 leading-relaxed">{rewrite.original}</p>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xl text-indigo-400 leading-none">↓</span>
                            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                              AI Suggested
                            </span>
                          </div>

                          <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-3">
                            <p className="text-sm text-indigo-900 leading-relaxed font-medium">
                              {rewrite.suggested}
                            </p>
                          </div>

                          <div className="flex items-start gap-2">
                            <span className="text-amber-500 text-sm mt-0.5 flex-shrink-0">ℹ</span>
                            <p className="text-xs text-gray-500 leading-relaxed">
                              <span className="font-semibold text-gray-600">Why: </span>
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
                                  ? 'bg-green-50 text-green-600 border-green-200 cursor-default'
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
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6">
                  <div className="flex items-start gap-3">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-5 h-5 text-indigo-500 mt-0.5 flex-shrink-0"
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
                      <h2 className="text-sm font-semibold text-indigo-700 mb-1">AI Summary</h2>
                      <p className="text-sm text-indigo-900 leading-relaxed">{results.summary}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── RIGHT PANEL: Live Resume ── */}
              <div className="lg:sticky lg:top-6">
                <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <h2 className="text-sm font-semibold text-gray-700">Live Resume</h2>
                    </div>
                    {appliedRewrites.size > 0 && (
                      <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-1 rounded-md border border-amber-200">
                        Edited
                      </span>
                    )}
                  </div>

                  <div
                    ref={liveResumeRef}
                    className="px-8 py-6 max-h-[calc(100vh-220px)] overflow-y-auto"
                  >
                    <div className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed font-[Georgia,_serif]">
                      {renderResumeText()}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}
      </main>
    </div>
  )
}
