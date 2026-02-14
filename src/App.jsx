function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-indigo-600 mb-2">JD-Match</h1>
        <p className="text-gray-500 text-lg">React + Vite + Tailwind CSS</p>
        <p className="text-gray-400 text-sm mt-4">
          Backend running at{' '}
          <a
            href="http://localhost:3001/api/health"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-400 underline"
          >
            localhost:3001/api/health
          </a>
        </p>
      </div>
    </div>
  )
}

export default App
