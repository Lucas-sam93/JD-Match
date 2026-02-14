# 📄 JD-Match: AI-Powered Resume Optimizer

**JD-Match** is a full-stack web application designed to help job seekers bypass Applicant Tracking Systems (ATS). By leveraging **Google Gemini 1.5 Flash**, the app analyzes your resume against a specific job description to identify keyword gaps and provide high-impact, AI-driven bullet point rewrites.

## ✨ Features
* **PDF Parsing:** Automatically extracts text from uploaded resumes using `pdf-parse`.
* **AI Gap Analysis:** Uses Gemini AI to score your resume's alignment with a job description.
* **Keyword Detection:** Highlights critical hard and soft skills missing from your current resume.
* **Smart Rewrites:** Provides side-by-side "Before & After" suggestions for your experience section.
* **Modern UI:** Built with React 19 and Tailwind CSS v4 for a sleek, responsive experience.

## 🛠️ Tech Stack
| Component | Technology |
| :--- | :--- |
| **Frontend** | React, Vite, Tailwind CSS, Lucide Icons |
| **Backend** | Node.js, Express, Multer |
| **AI Engine** | Google Gemini 1.5 Flash API |
| **Version Control** | Git & GitHub |

## 🚀 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v18 or higher)
* A [Google AI Studio](https://aistudio.google.com/) API Key

### Installation & Setup
1. **Clone the repository:**
   ```bash
   git clone [https://github.com/your-username/JD-Match.git](https://github.com/your-username/JD-Match.git)
   cd JD-Match

