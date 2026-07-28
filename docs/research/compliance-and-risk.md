# Compliance and Risk

**Date:** 2026-07-26

## Marketplace terms

### AliExpress

- ToS prohibit systematic retrieval of Site Content into a database without written permission
- Prefer Affiliate/Open Platform APIs
- No CAPTCHA bypass, stealth evasion, or proxy rotation to defeat protections
- CAPTCHA/challenge → `MANUAL_INTERVENTION_REQUIRED`

### eBay

- Use official APIs under API License Agreement
- Scraping sold/completed listings carries ToS and ban risk
- Rate-limit compliance mandatory
- Do not redistribute restricted data

## Third-party data providers

- Licence may not override marketplace ToS
- Require written approval before paid integration
- Document vendor lock-in, freshness, geo coverage

## MCP security

Treat every MCP as privileged code:

- Review maintainer, licence, network destinations, filesystem, credential access
- Pin versions in production-like configs
- Disable write tools by default on custom MCP
- Separate dev/prod credentials

## Application security

- Secrets in env / secret manager
- Encrypt credentials at rest (DataSourceCredential)
- Redact tokens, cookies, auth headers from logs
- Audit scans, exports, manual overrides
- Production workflow must not require Cursor

## Risk register

| Risk | Severity | Mitigation |
|------|----------|------------|
| Sold history unavailable | High | Manual validation; Insights request; no false APPROVED |
| Affiliate API field gaps | Medium | Manual import; NEEDS_MANUAL_VALIDATION |
| Scraping ToS violation | High | Do not ship scrapers as default |
| Credential leak via MCP/logs | High | Pin MCP, redact logs, secrets outside repo |
| Rate limit exhaustion | Medium | Queue, backoff, domain limits, cache |
