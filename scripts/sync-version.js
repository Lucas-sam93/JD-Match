import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
const version = pkg.version

const readmePath = join(root, 'README.md')
let readme = readFileSync(readmePath, 'utf-8')

const marker =
  /<!-- VERSION-START -->[\s\S]*?<!-- VERSION-END -->/

if (!marker.test(readme)) {
  console.error('Could not find <!-- VERSION-START --> / <!-- VERSION-END --> markers in README.md')
  process.exit(1)
}

readme = readme.replace(
  marker,
  `<!-- VERSION-START -->\n**Current version:** \`${version}\`\n<!-- VERSION-END -->`
)

writeFileSync(readmePath, readme, 'utf-8')
console.log(`README.md synced to version ${version}`)
