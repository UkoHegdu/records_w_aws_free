## Next Steps for This Project

### GitHub Actions / SonarCloud

- **Fix SonarCloud authentication and warning**
  - In SonarCloud, generate a valid token with access to the `recordsw` organization and project `UkoHegdu_records_w_aws_free`.
  - In GitHub, go to **Settings → Secrets and variables → Actions** and set/update a secret named `SONAR_TOKEN` with that value.
  - In `.github/workflows/ci-cd-pipeline.yml`, update the Sonar step to use the latest secure action:
    - Change `SonarSource/sonarqube-scan-action@v5` → `sonarsource/sonarqube-scan-action@v6`.

- **Re‑enable unit tests in the workflow (when ready)**
  - Un‑comment the `unit-tests` job in `.github/workflows/ci-cd-pipeline.yml`.
  - Restore `needs: [code-quality, unit-tests]` for the `build-frontend` and `build-lambda` jobs.
  - Fix the currently failing tests before relying on the pipeline as a quality gate again.