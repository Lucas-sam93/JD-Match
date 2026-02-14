import 'dotenv/config'
import express from 'express'
import cors from 'cors'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'JD-Match' })
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
