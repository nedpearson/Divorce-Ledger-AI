# Python security scanning
pip install bandit safety pylint mypy
bandit -r backend/ -f json > security_report.json
safety check
pylint backend/
mypy backend/

# JavaScript/TypeScript scanning
npm audit
npm run lint
npx tsc --noEmit

# OWASP Dependency Check
wget https://github.com/jeremylong/DependencyCheck_Releases/download/v8.0.0/dependency-check-8.0.0-release.zip
./dependency-check/bin/dependency-check.sh --project "DivorceASE AI" --scan .

# Database security check
sqlmap -u "http://localhost:8000/api/v1/violations" --batch --risk=1 --level=1
