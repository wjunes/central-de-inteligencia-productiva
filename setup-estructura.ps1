# Ejecutar desde la raíz del repo:  .\setup-estructura.ps1

$dirs = @(
  "docs/arquitectura", "docs/producto", "docs/metodologia",
  "config/development", "config/test", "config/production",
  "backend/api/auth", "backend/api/users", "backend/api/profile",
  "backend/api/dashboard", "backend/api/reports", "backend/api/alerts",
  "backend/api/sources", "backend/api/intelligence",
  "backend/core/users", "backend/core/profile", "backend/core/activities",
  "backend/core/ramifications", "backend/core/relevance",
  "backend/core/indicators", "backend/core/alerts",
  "backend/intelligence/analysis", "backend/intelligence/correlations",
  "backend/intelligence/trends", "backend/intelligence/signals",
  "backend/intelligence/opportunities", "backend/intelligence/risks",
  "backend/intelligence/recommendations",
  "backend/data/acquisition", "backend/data/sources",
  "backend/data/normalization", "backend/data/validation",
  "backend/data/historical", "backend/data/updates",
  "backend/reports/sectorial", "backend/reports/markets",
  "backend/reports/opportunities", "backend/reports/risks",
  "backend/reports/personalized",
  "backend/services/ai", "backend/services/notifications",
  "backend/services/search", "backend/services/external",
  "knowledge/activities", "knowledge/ramifications", "knowledge/domains",
  "knowledge/relationships", "knowledge/indicators", "knowledge/taxonomy",
  "database/schema", "database/migrations", "database/seeds", "database/backups",
  "web/public", "web/src/components", "web/src/pages", "web/src/modules",
  "web/src/services", "web/src/state", "web/src/utils", "web/src/styles",
  "web/tests",
  "desktop/electron/main", "desktop/electron/preload", "desktop/electron/services",
  "desktop/tests",
  "mobile/capacitor/config", "mobile/capacitor/plugins", "mobile/capacitor/native",
  "mobile/android", "mobile/ios",
  "shared/constants", "shared/schemas", "shared/types",
  "shared/validation", "shared/utils",
  "tests/unit", "tests/integration", "tests/api", "tests/intelligence",
  "tests/data", "tests/security", "tests/end-to-end",
  "scripts/development", "scripts/database", "scripts/deployment",
  "scripts/maintenance", "scripts/testing",
  "deployment/test/apptest-uy", "deployment/production/final"
)

foreach ($d in $dirs) {
  New-Item -ItemType Directory -Force -Path $d | Out-Null
  New-Item -ItemType File -Force -Path "$d/.gitkeep" | Out-Null
}

# .gitignore
@"
# Environment
.env
.env.local
.env.*.local

# Node
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# Build outputs
dist/
build/
out/
.next/
.nuxt/

# Python
__pycache__/
*.py[cod]
*.pyo
*.pyd
.Python
venv/
.venv/
*.egg-info/
.eggs/

# Database
*.sqlite
*.sqlite3
database/backups/*.sql

# Logs
logs/
*.log

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/

# Testing
coverage/
.nyc_output/

# Deployment
deployment/production/

# Electron
desktop/electron/dist/

# Mobile
mobile/android/.gradle/
mobile/android/local.properties
mobile/ios/Pods/
mobile/ios/.xcode.env.local
"@ | Set-Content -Encoding UTF8 .gitignore

# .env.example
@"
# --- Aplicacion ---
APP_NAME=central-de-inteligencia-productiva
APP_ENV=development
APP_PORT=3000
APP_SECRET=change-me

# --- Base de datos ---
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cip_db
DB_USER=cip_user
DB_PASSWORD=change-me

# --- IA / LLM ---
AI_PROVIDER=anthropic
AI_MODEL=claude-sonnet-4-6
AI_API_KEY=your-api-key-here

# --- Fuentes de datos externas ---
DATA_SOURCE_API_KEY=
DATA_SOURCE_BASE_URL=

# --- Notificaciones ---
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=

# --- Autenticacion ---
JWT_SECRET=change-me
JWT_EXPIRES_IN=7d

# --- Almacenamiento ---
STORAGE_PROVIDER=local
STORAGE_PATH=./storage
"@ | Set-Content -Encoding UTF8 .env.example

# LICENSE
@"
MIT License

Copyright (c) 2026 Central de Inteligencia Productiva

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"@ | Set-Content -Encoding UTF8 LICENSE

# Docs: arquitectura
$arq = @("arquitectura-general","plataformas","ambientes","seguridad","versiones-y-compatibilidad")
foreach ($f in $arq) {
  "# $f`n`n> Documento en construccion." | Set-Content -Encoding UTF8 "docs/arquitectura/$f.md"
}

# Docs: producto
foreach ($f in @("vision","objetivos","funcionalidades","roadmap")) {
  "# $f`n`n> Documento en construccion." | Set-Content -Encoding UTF8 "docs/producto/$f.md"
}

# Docs: metodologia
foreach ($f in @("inteligencia-productiva","fuentes","validacion","relevancia","confianza")) {
  "# $f`n`n> Documento en construccion." | Set-Content -Encoding UTF8 "docs/metodologia/$f.md"
}

Write-Host ""
Write-Host "Estructura creada: $($dirs.Count) directorios" -ForegroundColor Green
Write-Host ""
Write-Host "Proximo paso:"
Write-Host "  git add ."
Write-Host "  git commit -m 'feat: crear estructura base del proyecto'"
Write-Host "  git push"
